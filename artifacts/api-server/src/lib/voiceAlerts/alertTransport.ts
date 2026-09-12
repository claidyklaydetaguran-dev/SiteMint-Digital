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
}

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
      try {
        const response = await doFetch(RESEND_EMAILS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to ?? config.to],
            subject: message.subject,
            text: message.text,
          }),
          signal: AbortSignal.timeout(10_000),
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
        // Status only — response bodies never enter logs or issues.
        return { ok: false, reason: `provider_status_${response.status}` };
      } catch {
        return { ok: false, reason: "transport_error" };
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
