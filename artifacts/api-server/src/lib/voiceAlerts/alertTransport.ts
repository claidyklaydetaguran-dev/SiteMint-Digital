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

export type AlertSendResult = { ok: true } | { ok: false; reason: string };

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

export type FetchLike = (url: string, init: Record<string, unknown>) => Promise<{ ok: boolean; status: number }>;

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
        if (response.ok) return { ok: true };
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
