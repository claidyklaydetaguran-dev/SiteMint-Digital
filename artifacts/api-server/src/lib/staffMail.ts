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

export type MailOutcome =
  | { sent: true; providerId: string | null }
  | { sent: false; reason: string; configured: boolean };

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
   * Stable across retries of the SAME logical message. Resend collapses
   * repeats of a key, which is what closes the crash-after-accept window that
   * job locking cannot: if the worker dies between the provider accepting and
   * the job recording success, the retry carries the same key and the
   * recipient still receives one message.
   */
  idempotencyKey?: string;
}): Promise<MailOutcome> {
  const blocked = staffMailBlockedReason();
  if (blocked) return { sent: false, reason: blocked, configured: false };

  try {
    const resend = getResend();
    const result = await resend.emails.send(
      {
        from: FROM(), to: args.to, subject: args.subject,
        text: args.text, ...(args.html ? { html: args.html } : {}),
      },
      args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined,
    );
    const providerId = (result as { data?: { id?: string } | null })?.data?.id ?? null;
    // Resend reports a rejection in the body rather than by throwing.
    const error = (result as { error?: { message?: string } | null })?.error;
    if (error) return { sent: false, reason: error.message ?? "The mail provider rejected the message.", configured: true };
    return { sent: true, providerId };
  } catch (err) {
    return {
      sent: false,
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
