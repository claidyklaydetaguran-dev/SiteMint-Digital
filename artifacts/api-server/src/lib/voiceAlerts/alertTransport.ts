// P7: operator alert delivery behind an abstraction, OFF by default.
//
// Contract family: one env gate (VOICE_ALERTS_ENABLED, exact "true"),
// fail-closed config, pinned provider host, and a transport seam so every
// caller (critical-issue notifier, daily digest) is provider-agnostic and
// testable with the fake. No Resend SDK — the API is one POST, and a
// dependency would widen the supply chain for nothing.
//
// PII rule: an alert carries operator-facing text assembled by OUR code —
// issue codes, counts, firm ids. Never transcripts, caller numbers,
// prompts, or provider payloads.

export const VOICE_ALERTS_ENABLED_ENV_VAR = "VOICE_ALERTS_ENABLED";
export const RESEND_API_KEY_ENV_VAR = "RESEND_API_KEY";
export const VOICE_ALERTS_FROM_ENV_VAR = "VOICE_ALERTS_FROM";
export const VOICE_ALERTS_TO_ENV_VAR = "VOICE_ALERTS_TO";

/** The one approved alert-provider endpoint. Never derived from config. */
export const RESEND_EMAILS_URL = "https://api.resend.com/emails";

export interface VoiceAlertConfig {
  apiKey: string;
  from: string;
  to: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Null when alerts are disabled (the default). Throws when enabled but
 * malformed — an operator who believes alerts are on must never silently
 * have them off.
 */
export function loadVoiceAlertConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): VoiceAlertConfig | null {
  if (env[VOICE_ALERTS_ENABLED_ENV_VAR] !== "true") return null;
  const apiKey = env[RESEND_API_KEY_ENV_VAR];
  const from = env[VOICE_ALERTS_FROM_ENV_VAR];
  const to = env[VOICE_ALERTS_TO_ENV_VAR];
  if (typeof apiKey !== "string" || apiKey.trim().length < 8) {
    throw new Error(`${VOICE_ALERTS_ENABLED_ENV_VAR} is true but ${RESEND_API_KEY_ENV_VAR} is missing.`);
  }
  if (typeof from !== "string" || !EMAIL_SHAPE.test(from)) {
    throw new Error(`${VOICE_ALERTS_ENABLED_ENV_VAR} is true but ${VOICE_ALERTS_FROM_ENV_VAR} is not a valid address.`);
  }
  if (typeof to !== "string" || !EMAIL_SHAPE.test(to)) {
    throw new Error(`${VOICE_ALERTS_ENABLED_ENV_VAR} is true but ${VOICE_ALERTS_TO_ENV_VAR} is not a valid address.`);
  }
  return { apiKey: apiKey.trim(), from, to };
}

export interface AlertMessage {
  subject: string;
  text: string;
  /** Overrides the configured operator inbox (e.g. account emails to the firm's own address). */
  to?: string;
  /**
   * Makes a retry of this exact message safe. Resend keeps a key for 24 hours
   * and answers a repeat with the original response instead of sending again
   * (docs: resend.com/docs/dashboard/emails/idempotency-keys). Without one, a
   * send whose response was lost — a timeout, a dropped connection — cannot be
   * told apart from one that never happened, and retrying it emails the
   * recipient twice. 1–256 characters; `<event-type>/<entity-id>`.
   */
  idempotencyKey?: string;
}

/** Resend's bound on an idempotency key's length. */
export const IDEMPOTENCY_KEY_MAX = 256;

/**
 * How long one send may take before it is cut off. Exported because the
 * notification outbox sizes its claim lease from it: a lease shorter than a
 * batch of sends that each run to this limit lets a second worker reclaim rows
 * the first is still sending.
 */
export const ALERT_SEND_TIMEOUT_MS = 20_000;

/**
 * `ok` means the provider ACCEPTED the message, which is the strongest thing we
 * can observe — inbox delivery is not visible to us and nothing here claims it.
 * `providerMessageId` is the provider's own receipt when it returns one; absent
 * is normal, not an error.
 *
 * `reason` is one of OUR short codes (`provider_status_<n>`, `transport_error`,
 * `alerts_disabled`). Provider response bodies never appear here, so a reason
 * is always safe to persist and log.
 */
export type AlertSendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; reason: string };

export interface AlertTransport {
  send(message: AlertMessage): Promise<AlertSendResult>;
}

/** What every caller gets while VOICE_ALERTS_ENABLED is not "true". */
export function createDisabledAlertTransport(): AlertTransport {
  return {
    async send(): Promise<AlertSendResult> {
      return { ok: false, reason: "alerts_disabled" };
    },
  };
}

export type FetchLike = (
  url: string,
  init: Record<string, unknown>,
) => Promise<{ ok: boolean; status: number; json?: () => Promise<unknown> }>;

export function createResendAlertTransport(config: VoiceAlertConfig, fetchImpl?: FetchLike): AlertTransport {
  const doFetch: FetchLike = fetchImpl ?? (fetch as unknown as FetchLike);
  return {
    async send(message: AlertMessage): Promise<AlertSendResult> {
      const key = message.idempotencyKey;
      const useKey = typeof key === "string" && key.length >= 1 && key.length <= IDEMPOTENCY_KEY_MAX;
      try {
        const response = await doFetch(RESEND_EMAILS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            ...(useKey ? { "Idempotency-Key": key } : {}),
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to ?? config.to],
            subject: message.subject,
            text: message.text,
          }),
          // Long enough that a slow-but-working provider is not cut off. A cut-off
          // send may still have been delivered — which is why a keyed retry, not
          // a shorter timeout, is what prevents the duplicate.
          signal: AbortSignal.timeout(ALERT_SEND_TIMEOUT_MS),
        });
        if (response.ok) {
          // The provider's receipt id, when it gives one. Read defensively: a
          // missing or unparseable body is not a failure — the message was
          // accepted either way, and pretending otherwise would cause a
          // duplicate send on the next retry.
          let providerMessageId: string | undefined;
          try {
            const body = (await response.json?.()) as { id?: unknown } | undefined;
            if (body && typeof body.id === "string" && body.id.trim().length > 0) {
              providerMessageId = body.id.trim().slice(0, 120);
            }
          } catch {
            // no receipt available; accepted is still accepted
          }
          return providerMessageId === undefined ? { ok: true } : { ok: true, providerMessageId };
        }
        if (response.status === 409 && useKey) {
          // Only the provider's fixed error NAME is read, never its message.
          let name: unknown;
          try {
            name = ((await response.json?.()) as { name?: unknown } | undefined)?.name;
          } catch {
            name = undefined;
          }
          // The provider already processed a request with this key but DIFFERENT
          // content. (A repeat of the same content returns the original response,
          // not this.) So something was sent under this key, and it was not
          // exactly this message — reporting that as "accepted" would record a
          // receipt we do not have. It is its own result: never resent
          // automatically, and surfaced for a person to check.
          if (name === "invalid_idempotent_request") return { ok: false, reason: "provider_idempotency_conflict" };
          // The first request with this key is still being processed. Safe to
          // retry later; nothing is sent twice.
          if (name === "concurrent_idempotent_requests") return { ok: false, reason: "provider_idempotency_in_progress" };
        }
        // Status only — response bodies never enter logs or issues.
        return { ok: false, reason: `provider_status_${response.status}` };
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        // A timeout is the case that emailed a business twice: the provider
        // accepted the send, the response did not arrive in time, and the
        // unkeyed retry sent it again. Named separately so it is visible.
        return { ok: false, reason: name === "TimeoutError" || name === "AbortError" ? "transport_timeout" : "transport_error" };
      }
    },
  };
}

/** Deterministic fake for tests: records every message, configurable result. */
export class FakeAlertTransport implements AlertTransport {
  readonly sent: AlertMessage[] = [];
  result: AlertSendResult = { ok: true };
  async send(message: AlertMessage): Promise<AlertSendResult> {
    this.sent.push(message);
    return this.result;
  }
}

/** Disabled transport unless the env contract is complete and enabled. */
export function createAlertTransportFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: FetchLike,
): AlertTransport {
  const config = loadVoiceAlertConfigFromEnv(env);
  if (config === null) return createDisabledAlertTransport();
  return createResendAlertTransport(config, fetchImpl);
}

// ── critical-issue notification ──────────────────────────────────────────────

export interface CriticalIssueSummary {
  firmId: number;
  code: string;
  message: string;
}

export function renderCriticalIssueAlert(issue: CriticalIssueSummary): AlertMessage {
  return {
    subject: `[SiteMint voice] CRITICAL ${issue.code} (firm ${issue.firmId})`,
    text: [
      `A critical voice issue was opened.`,
      ``,
      `Firm:    ${issue.firmId}`,
      `Code:    ${issue.code}`,
      `Message: ${issue.message}`,
      ``,
      `Review it in the operations dashboard. This alert carries no customer content by design.`,
    ].join("\n"),
  };
}

/**
 * Fire-and-forget notifier for openVoiceIssue: never throws, never blocks
 * the caller's response path on provider latency (callers invoke it with
 * `void ...`), and inert while alerts are disabled.
 */
export async function notifyCriticalIssue(
  issue: CriticalIssueSummary,
  transport?: AlertTransport,
): Promise<AlertSendResult> {
  try {
    const resolved = transport ?? createAlertTransportFromEnv();
    return await resolved.send(renderCriticalIssueAlert(issue));
  } catch {
    return { ok: false, reason: "notifier_error" };
  }
}
