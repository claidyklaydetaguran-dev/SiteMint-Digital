// P8: account security + membership + subscription visibility.
// Unauthenticated endpoints (reset request/complete, verification confirm,
// invitation accept) are token-proven and rate-limited; everything else
// requires the receptionist session. The protected auth files are
// imported from, never modified.

import { Router, type IRouter, type Request, type Response } from "express";
import { enqueueSignupJobs } from "../lib/signupPipeline/pipeline.js";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  completePasswordReset,
  confirmEmailVerification,
  requestEmailVerification,
  requestPasswordReset,
} from "../lib/accountSecurity/accountTokens.js";
import { changeAccountEmail, productionEmailChangeDeps } from "../lib/accountSecurity/emailChange.js";
import { resolveVerifiedBusinessRecipient } from "../lib/voiceNotifications/recipient.js";
import { acceptInvitation, inviteMember, listFirmMembers, revokeMemberById } from "../lib/voiceAccounts/membership.js";
import { resolveEntitlementsForFirm } from "../lib/voiceBilling/entitlements.js";
import {
  isPasswordResetRequestsEnabled,
  PASSWORD_RESET_REQUESTS_DISABLED_MESSAGE,
} from "../lib/publicWriteFlags.js";

const router: IRouter = Router();

// ── tiny fixed-window limiter for the unauthenticated endpoints ──────────────
// (the protected authRateLimit module belongs to login and is not touched)

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { count: number; windowStart: number }>();

export function accountRateLimitAllows(key: string, nowMs: number): boolean {
  const entry = hits.get(key);
  if (!entry || nowMs - entry.windowStart >= WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: nowMs });
    if (hits.size > 10_000) hits.clear(); // bounded memory; resets are harmless (limiter is defense-in-depth)
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}

function limited(req: Request, res: Response, bucket: string): boolean {
  const key = `${bucket}:${req.ip ?? "unknown"}`;
  if (!accountRateLimitAllows(key, Date.now())) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return true;
  }
  return false;
}

// ── password reset ───────────────────────────────────────────────────────────

router.post("/receptionist/account/password-reset/request", async (req: Request, res: Response) => {
  // R8: fail-closed password-reset gate. First statement in the handler — ahead
  // of the rate limiter, request validation, the account/email lookup, the
  // imported requestPasswordReset delegation, token creation, the audit row,
  // and any email construction or send. The token-proven routes below
  // (password-reset/complete, verify-email/confirm, members/accept) are
  // deliberately unaffected: they already require a token this endpoint issued.
  if (!isPasswordResetRequestsEnabled()) {
    res.status(503).json({ error: PASSWORD_RESET_REQUESTS_DISABLED_MESSAGE });
    return;
  }
  if (limited(req, res, "pw-reset")) return;
  try {
    const result = await requestPasswordReset((req.body as Record<string, unknown> | undefined)?.email);
    if (!result.accepted) {
      res.status(503).json({ error: "Email delivery is not available right now. Contact support." });
      return;
    }
    // Identical answer for known and unknown addresses.
    res.json({ accepted: true, message: "If that address has an account, a reset code is on its way." });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[account] reset request failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/receptionist/account/password-reset/complete", async (req: Request, res: Response) => {
  if (limited(req, res, "pw-complete")) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await completePasswordReset(body.token, body.newPassword);
    if (!result.ok) {
      res
        .status(result.reason === "weak_password" ? 400 : 401)
        .json({ error: result.reason === "weak_password" ? "Password must be at least 8 characters." : "That code is invalid or expired." });
      return;
    }
    res.json({ ok: true, message: "Password updated. Sign in with your new password." });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[account] reset complete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/receptionist/account/email-status ───────────────────────────────
//
// Can this business actually be emailed?
//
// Nothing in the dashboard could answer that. Every outbound message — the
// post-call summary, the daily digest, a critical alert — goes only to a
// VERIFIED address, so a business with an unconfirmed one hears nothing and had
// no way to find out why. Setup could be ticked off completely and still be
// silent.
//
// The answer comes from `resolveVerifiedBusinessRecipient`, which is the SAME
// function the sender calls. A second "is it verified?" check here could drift
// from the one that decides whether mail is sent, and then the dashboard would
// promise delivery the sender refuses.

router.get("/receptionist/account/email-status", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const resolution = await resolveVerifiedBusinessRecipient(req.firmId!);
    res.json(
      resolution.ok
        ? { canReceiveEmail: true, email: resolution.email, reason: null }
        : { canReceiveEmail: false, email: null, reason: resolution.reason },
    );
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[account] email status failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── email verification ───────────────────────────────────────────────────────

router.post("/receptionist/account/verify-email/request", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const result = await requestEmailVerification(req.firmId!);
    if (!result.sent) {
      res.status(503).json({
        error: result.reason === "no_email" ? "No email address on file." : "Email delivery is not available right now.",
      });
      return;
    }
    res.json({ sent: true });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[account] verification request failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * Change the address the account signs in with, and that every notification is
 * sent to.
 *
 * Session-gated AND password-gated: the address is the login identity, so a
 * borrowed session alone must not be enough to take the account over. Rate
 * limited on top, because this is a password-guessing surface.
 *
 * The response says what actually happened to BOTH halves. The address change
 * is durable the moment it returns; whether a verification code reached the new
 * address is a separate fact, and reporting only the first would leave a
 * business believing mail was on its way when it was not.
 */
router.patch("/receptionist/account/email", requireReceptionistAuth, async (req: Request, res: Response) => {
  if (limited(req, res, "email-change")) return;
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const deps = await productionEmailChangeDeps();
    const result = await changeAccountEmail(req.firmId!, { newEmail: body.email, currentPassword: body.currentPassword }, deps);
    if (!result.ok) {
      const status = result.reason === "wrong_password" ? 401 : result.reason === "duplicate_email" ? 409 : 400;
      res.status(status).json({ error: EMAIL_CHANGE_MESSAGES[result.reason], reason: result.reason });
      return;
    }
    res.json({
      email: result.email,
      emailVerified: false,
      verificationSent: result.verificationSent,
      detail: result.verificationSent
        ? "Your address was changed. Check that inbox for the verification code."
        : "Your address was changed, but the verification email could not be sent. Request a new code from this page.",
    });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[account] email change failed");
    res.status(500).json({ error: "Internal error" });
  }
});

const EMAIL_CHANGE_MESSAGES: Record<string, string> = {
  invalid_email: "Enter a real email address you can receive mail at. Placeholder domains such as .invalid, .test and .example are not accepted.",
  same_email: "That is already the address on this account.",
  duplicate_email: "Another account already uses that address.",
  wrong_password: "That password is not correct.",
  delivery_unavailable: "Email delivery is not available right now.",
};

router.post("/receptionist/account/verify-email/confirm", async (req: Request, res: Response) => {
  if (limited(req, res, "verify")) return;
  try {
    const result = await confirmEmailVerification((req.body as Record<string, unknown> | undefined)?.token);
    if (!result.ok) {
      res.status(401).json({ error: "That code is invalid or expired." });
      return;
    }
    // The welcome message is timed to the moment the address is PROVEN, and
    // the unique firm × kind job row means a re-confirmed or replayed token
    // can never send it twice.
    try {
      await enqueueSignupJobs(result.firmId, {}, ["welcome_email"]);
    } catch (enqueueErr) {
      req.log.error({ err: enqueueErr, firmId: result.firmId }, "[account] welcome enqueue failed");
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[account] verification confirm failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── membership ───────────────────────────────────────────────────────────────

router.get("/receptionist/account/members", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const members = await listFirmMembers(req.firmId!);
    res.json({
      items: members.map((m) => ({
        id: m.id,
        email: m.email,
        role: m.role,
        status: m.status,
        invitedAt: m.invitedAt,
        acceptedAt: m.acceptedAt,
      })),
      count: members.length,
    });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[account] member list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/receptionist/account/members", requireReceptionistAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await inviteMember(req.firmId!, body.email, body.role);
    if (!result.ok) {
      const status =
        result.reason === "delivery_unavailable" ? 503 : result.reason === "already_member" || result.reason === "member_limit" ? 409 : 400;
      const message =
        result.reason === "invalid_email" ? "A valid email address is required."
        : result.reason === "invalid_role" ? "role must be 'owner' or 'staff'."
        : result.reason === "already_member" ? "That address is already on the roster."
        : result.reason === "member_limit" ? "Member limit reached."
        : "Email delivery is not available right now.";
      res.status(status).json({ error: message });
      return;
    }
    res.status(201).json({ member: { id: result.member.id, email: result.member.email, role: result.member.role, status: result.member.status } });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[account] invite failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/receptionist/account/members/accept", async (req: Request, res: Response) => {
  if (limited(req, res, "invite-accept")) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await acceptInvitation(body.token, body.email);
    if (!result.ok) {
      res.status(401).json({ error: "That invitation is invalid or expired." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[account] invite accept failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/receptionist/account/members/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  const memberId = Number(req.params.id);
  if (!Number.isInteger(memberId)) {
    res.status(400).json({ error: "Invalid member id." });
    return;
  }
  try {
    const result = await revokeMemberById(req.firmId!, memberId);
    if (!result.ok) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    res.status(204).end();
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[account] revoke failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── subscription visibility ──────────────────────────────────────────────────

router.get("/receptionist/account/subscription", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    let entitlements;
    try {
      entitlements = await resolveEntitlementsForFirm(req.firmId!);
    } catch {
      entitlements = { source: "none" as const }; // malformed catalog is an ops problem, not a customer-visible error
    }
    res.json({ entitlements });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[account] subscription read failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
