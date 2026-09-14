// ── M3: staff mail delivery ─────────────────────────────────────────────────
//
// The one place that decides whether an invitation, reset or reminder can
// actually reach a person's mailbox, and reports honestly when it cannot.
//
// Why this exists: `getResend()` THROWS when RESEND_API_KEY is unset. Calling
// it optimistically inside a background job turned "mail is not configured"
// into a thrown error, a failed job, and a retry loop — the reminder engine
// would have burned all five attempts on an environment that simply has no
// mail. Every send goes through `trySendStaffMail`, which never throws.
//
// It is also the boundary that keeps a test run from reaching a real inbox:
// while CRM_EMAIL_TEST_MODE is anything other than the exact string "false",
// nothing is handed to the provider at all.

import { getResend } from "./email.js";

/**
 * How long Resend honours an `idempotencyKey`. Verified against Resend's
 * documentation (https://resend.com/docs/dashboard/emails/idempotency-keys):
 * **24 hours**, after which the same key sends again.
 *
 * It is therefore a short-horizon duplicate suppressor, not a permanent
 * ledger, and nothing in this codebase may treat it as one. See
 * `docs/crm-ops/DELIVERY-GUARANTEE.md`.
 */
export const RESEND_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Why a send did not succeed — the distinction the caller needs in order to
 * decide whether retrying is safe.
 *
 *  - `not_configured` — nothing was handed to the provider at all. No message
 *    exists; the attempt may be forgotten entirely.
 *  - `rejected`       — the provider looked at the message and refused it.
 *    Deterministic: the identical message will be refused identically.
 *  - `failed`         — the provider definitively did not accept it, for a
 *    reason that may pass (5xx, rate limit, connection refused before the
 *    request went out). Retrying cannot duplicate, because nothing was taken.
 *  - `uncertain`      — bytes went out and we never learned the answer
 *    (timeout, socket hang up, aborted read, a 409 saying an identical request
 *    is already in flight). The message may or may not have been delivered.
 *    Retrying may duplicate. This is the state a human has to resolve.
 */
export type MailFailure = "not_configured" | "rejected" | "failed" | "uncertain";

export type MailOutcome =
  | { sent: true; providerId: string | null }
  | { sent: false; failure: MailFailure; reason: string; configured: boolean };

const FROM = () =>
  process.env["RESEND_FROM_EMAIL"] ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>";

/** True only when a real send could happen right now. */
export function staffMailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env["RESEND_API_KEY"]) && env["CRM_EMAIL_TEST_MODE"] === "false";
}

/** Why mail cannot be sent, in words an operator can act on. */
export function staffMailBlockedReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env["RESEND_API_KEY"]) return "RESEND_API_KEY is not set on this server, so no mail can be sent.";
  if (env["CRM_EMAIL_TEST_MODE"] !== "false") {
    return "Email test mode is on (CRM_EMAIL_TEST_MODE is not \"false\"), so mail is simulated rather than sent.";
  }
  return null;
}

// ── Classifying what went wrong ─────────────────────────────────────────────
//
// "It did not work" is not enough to decide whether a retry is safe. These two
// functions turn a provider answer or a thrown transport error into one of the
// four `MailFailure` classes, and they are pure so the mapping can be tested
// without a network or a database.

/** Transport-level codes meaning the request never reached Resend's server. */
const NEVER_LEFT_CODES = new Set([
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH",
  "ERR_INVALID_URL", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/** Provider error names that are worth trying again, unchanged. */
const TRANSIENT_ERROR_NAMES = new Set([
  "application_error", "internal_server_error", "rate_limit_exceeded",
  "daily_quota_exceeded", "security_error",
]);

/** Every `code` on an error and its `cause` chain, upper-cased. */
function errorCodes(err: unknown): string[] {
  const codes: string[] = [];
  let cursor: unknown = err;
  for (let depth = 0; cursor && typeof cursor === "object" && depth < 6; depth += 1) {
    const code = (cursor as { code?: unknown }).code;
    if (typeof code === "string") codes.push(code.toUpperCase());
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return codes;
}

/**
 * Classifies an error Resend put in the RESPONSE BODY — meaning the provider
 * answered, so no message id exists and nothing was queued.
 *
 * The two 409s are the interesting ones, and they mean opposite things:
 *  - `concurrent_idempotent_requests` — an identical request with this key is
 *    already in flight. That is NOT a failure: the message is very likely on
 *    its way. Retrying would race the request that is already running, so this
 *    resolves to `uncertain` and waits for a human rather than re-sending.
 *  - `invalid_idempotent_request` — this key was used before with a DIFFERENT
 *    payload. That is our bug, not a transport problem, and no message was
 *    sent. Deterministic, so `rejected`.
 */
export function classifyProviderError(
  error: { name?: string | null; message?: string | null; statusCode?: number | null } | null | undefined,
): MailFailure {
  const name = (error?.name ?? "").toLowerCase();
  const status = typeof error?.statusCode === "number" ? error.statusCode : null;
  const text = `${name} ${error?.message ?? ""}`.toLowerCase();

  if (name === "concurrent_idempotent_requests" || text.includes("concurrent_idempotent_requests")) {
    return "uncertain";
  }
  if (name === "invalid_idempotent_request" || text.includes("invalid_idempotent_request")) {
    return "rejected";
  }
  if (TRANSIENT_ERROR_NAMES.has(name)) return "failed";
  if (status !== null && (status >= 500 || status === 429)) return "failed";
  // Anything else the provider answered with is a refusal of this message:
  // a bad address, an unverified domain, a key without permission. Repeating
  // it unchanged produces the same refusal, so it is not retried automatically.
  return "rejected";
}

/**
 * Classifies a THROWN transport error. The question is only ever "could the
 * request have reached Resend?" — if it could have, the outcome is unknown and
 * must be recorded as such rather than optimistically retried.
 */
export function classifyThrownMailError(err: unknown): MailFailure {
  const codes = errorCodes(err);
  if (codes.some((c) => NEVER_LEFT_CODES.has(c))) return "failed";
  // Timeouts, resets, aborted reads and bare `fetch failed` all mean the bytes
  // may already be on Resend's side. Unknown is the honest answer, and it is
  // also the safe default for anything unrecognised.
  return "uncertain";
}

/**
 * A file travelling with the message.
 *
 * Added for calendar invitations, which are only an invitation because they
 * carry an iCalendar payload the recipient's mail client recognises — a
 * message that merely describes a meeting is a note about one.
 *
 * `content` is base64. Resend derives a content type from the filename when
 * `contentType` is absent, which is not good enough here: an invitation needs
 * `text/calendar; method=REQUEST` for a client to offer the Add/Update buttons.
 */
export interface StaffMailAttachment {
  filename: string;
  /** base64-encoded bytes. */
  content: string;
  contentType?: string;
}

/**
 * Attempts a send. Never throws: a mail failure must not fail the action that
 * triggered it, and must never be mistaken for success.
 */
export async function trySendStaffMail(args: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Stable across retries of the SAME logical message, so Resend collapses a
   * repeat into the original send.
   *
   * It is a 24-hour window (`RESEND_IDEMPOTENCY_WINDOW_MS`), not a permanent
   * ledger: past it the same key sends again. Callers must not build an
   * exactly-once claim on top of it — see `docs/crm-ops/DELIVERY-GUARANTEE.md`.
   */
  idempotencyKey?: string;
  /**
   * Files to send with it. Part of the idempotency contract: the same key with
   * a DIFFERENT attachment is the "same key, different payload" Resend answers
   * with `invalid_idempotent_request`, so a caller that varies the attachment
   * must vary the key too.
   */
  attachments?: StaffMailAttachment[];
}): Promise<MailOutcome> {
  const blocked = staffMailBlockedReason();
  if (blocked) return { sent: false, failure: "not_configured", reason: blocked, configured: false };

  try {
    const resend = getResend();
    const result = await resend.emails.send(
      {
        from: FROM(), to: args.to, subject: args.subject,
        text: args.text, ...(args.html ? { html: args.html } : {}),
        ...(args.attachments?.length ? { attachments: args.attachments } : {}),
      },
      args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined,
    );
    const providerId = (result as { data?: { id?: string } | null })?.data?.id ?? null;
    // Resend reports a rejection in the body rather than by throwing.
    const error = (result as {
      error?: { message?: string; name?: string; statusCode?: number } | null;
    })?.error;
    if (error) {
      return {
        sent: false,
        failure: classifyProviderError(error),
        reason: error.message ?? error.name ?? "The mail provider rejected the message.",
        configured: true,
      };
    }
    return { sent: true, providerId };
  } catch (err) {
    return {
      sent: false,
      failure: classifyThrownMailError(err),
      configured: true,
      reason: err instanceof Error ? err.message.slice(0, 300) : "The mail provider could not be reached.",
    };
  }
}

// ── Message bodies ──────────────────────────────────────────────────────────

function shell(heading: string, body: string, cta?: { label: string; url: string }): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#153E52;padding:22px 28px;"><h1 style="color:#fff;margin:0;font-size:18px;">SiteMint Operations</h1></div>
  <div style="padding:26px 28px;color:#111827;font-size:14px;line-height:1.65;">
    <h2 style="margin:0 0 12px;font-size:16px;">${heading}</h2>
    ${body}
    ${cta ? `<p style="margin:22px 0;"><a href="${cta.url}" style="background:#0B7487;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600;">${cta.label}</a></p>
    <p style="font-size:12px;color:#6b7280;word-break:break-all;">Or paste this into your browser:<br/>${cta.url}</p>` : ""}
  </div>
  <div style="background:#F8FCFC;padding:14px 28px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
    Internal system for SiteMint Digital Solutions staff.
  </div>
</div></body></html>`;
}

export function inviteMessage(args: { displayName: string; url: string; expiresInHours: number }) {
  return {
    subject: "Set up your SiteMint CRM account",
    text: `Hello ${args.displayName},

An account has been created for you in the SiteMint CRM. Set your password here:

${args.url}

The link works once and expires in ${args.expiresInHours} hours. If you were not expecting this, ignore it and tell the person who runs the CRM.`,
    html: shell(
      `Hello ${args.displayName},`,
      `<p>An account has been created for you in the SiteMint CRM. Use the button below to set your password and sign in.</p>
       <p style="color:#6b7280;font-size:13px;">The link works once and expires in ${args.expiresInHours} hours.</p>`,
      { label: "Set my password", url: args.url },
    ),
  };
}

export function resetMessage(args: { displayName: string; url: string; expiresInMinutes: number }) {
  return {
    subject: "Reset your SiteMint CRM password",
    text: `Hello ${args.displayName},

A password reset was requested for your SiteMint CRM account:

${args.url}

The link works once and expires in ${args.expiresInMinutes} minutes. If you did not request it, ignore this message — your current password still works.`,
    html: shell(
      `Hello ${args.displayName},`,
      `<p>A password reset was requested for your SiteMint CRM account.</p>
       <p style="color:#6b7280;font-size:13px;">The link works once and expires in ${args.expiresInMinutes} minutes. If you did not request it, ignore this — your current password still works.</p>`,
      { label: "Choose a new password", url: args.url },
    ),
  };
}

/**
 * Where activation links point. `CRM_PUBLIC_BASE_URL` is the deployment's own
 * address; without it a link would be built from whatever host happened to
 * make the request, which is attacker-controllable.
 */
export function activationUrl(token: string, kind: "invite" | "password_reset"): string | null {
  const base = process.env["CRM_PUBLIC_BASE_URL"] ?? process.env["CRM_BASE_URL"];
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/admin/activate?kind=${kind}&token=${encodeURIComponent(token)}`;
}
