// V5 S-1: invite-only signup, WITHOUT editing the protected
// routes/receptionistAuth.ts. See lib/voiceInvites/inviteSignup.ts for the
// duplication notice on the firm-creation logic.
//
// Also carries the admin side of invite management (create / list) — kept
// in the same file because both halves are "invites", and the admin routes
// use the shared cookie-or-bearer requireAdmin from lib/admin-session.ts.

import { Router, type Request, type Response } from "express";
import { createSession, COOKIE_NAME, COOKIE_OPTIONS } from "../lib/receptionistAuth.js";
import { requireAdmin } from "../lib/admin-session.js";
import { isInviteSignupEnabled, INVITE_SIGNUP_DISABLED_MESSAGE } from "../lib/publicWriteFlags.js";
import { consumeInviteCode, attachInviteToFirm, createInvite, listInvites } from "../lib/voiceInvites/inviteService.js";
import { createFirmForInviteSignup } from "../lib/voiceInvites/inviteSignup.js";
import { SlidingWindowLimiter, getClientIp } from "../lib/contactProtection.js";

const router = Router();

// Self-contained, like every other public-write route's limiter (see
// publicSchedulingProtection.ts) — authRateLimit.ts (protected) is not
// touched. 5 attempts/hour/IP mirrors signupIpLimiter's order of magnitude.
const inviteSignupIpLimiter = new SlidingWindowLimiter(5, 60 * 60 * 1000);
setInterval(() => inviteSignupIpLimiter.purgeStale(), 5 * 60 * 1000).unref();

// ── POST /api/receptionist/auth/invite-signup ─────────────────────────────────

router.post("/receptionist/auth/invite-signup", async (req: Request, res: Response) => {
  // Fail-closed gate. FIRST statement in the handler — ahead of the rate
  // limiter, validation, the invite lookup/consumption, the firm insert,
  // and session creation.
  if (!isInviteSignupEnabled()) {
    res.status(503).json({ error: INVITE_SIGNUP_DISABLED_MESSAGE });
    return;
  }

  const ip = getClientIp(req);
  if (inviteSignupIpLimiter.isOverLimit(ip)) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  inviteSignupIpLimiter.record(ip);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const inviteCode = body.inviteCode;
  const ownerName = typeof body.ownerName === "string" ? body.ownerName.trim() : "";
  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
  const acceptedTerms = body.acceptedTerms === true;

  if (!ownerName || !businessName || !email || !password || !timezone) {
    res.status(400).json({ error: "ownerName, businessName, email, password, and timezone are required." });
    return;
  }
  if (!acceptedTerms) {
    res.status(400).json({ error: "You must accept the terms to continue." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  try {
    const consumed = await consumeInviteCode(inviteCode);
    if (!consumed.ok) {
      res.status(401).json({ error: "That invite code is invalid or expired." });
      return;
    }

    const created = await createFirmForInviteSignup({ ownerName, businessName, email, password });
    if (!created.ok) {
      // The invite is already spent (see consumeInviteCode's doc comment) —
      // this is the accepted tradeoff, not a code path that leaves the
      // invite reusable.
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }

    await attachInviteToFirm(consumed.inviteId, created.firm.id);

    const token = await createSession(created.firm.id, created.firm.email);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    // Same response shape as the normal signup route.
    res.status(201).json({ firm: created.firm });
  } catch (err) {
    req.log.error({ err }, "[invite-signup] error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: invite management ──────────────────────────────────────────────────

router.post("/admin/voice/invites", requireAdmin, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const email = typeof body.email === "string" && body.email.trim().length > 0 ? body.email.trim() : null;
  const note = typeof body.note === "string" && body.note.trim().length > 0 ? body.note.trim().slice(0, 500) : null;
  try {
    const invite = await createInvite({ email, note, createdBy: "admin" });
    // The raw code is returned EXACTLY ONCE, here, to the admin who created
    // it — never logged, never retrievable again.
    res.status(201).json({ invite: { id: invite.id, code: invite.code, expiresAt: invite.expiresAt.toISOString() } });
  } catch (err) {
    req.log.error({ err }, "[admin voice invites] create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/admin/voice/invites", requireAdmin, async (req: Request, res: Response) => {
  try {
    const items = await listInvites();
    res.json({ items, count: items.length });
  } catch (err) {
    req.log.error({ err }, "[admin voice invites] list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
