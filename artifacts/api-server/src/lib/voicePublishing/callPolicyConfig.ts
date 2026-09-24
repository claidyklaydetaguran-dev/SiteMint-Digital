// P6: server-owned call-behavior policy for provider payloads — silence and
// hang handling, hard duration cap, and the spoken end/voicemail lines.
// REPRESENTATION ONLY until an owner-gated publish/sync sends it.
//
// Same contract family as artifact policy / server / tools: one env value
// (VOICE_CALL_POLICY_JSON), validated fail-closed with bounded ranges and a
// closed key set; absent means null and payloads are byte-identical to
// today. No client, firm, or request input can influence it.

import { PublishFoundationError } from "./errors.js";

export const VOICE_CALL_POLICY_ENV_VAR = "VOICE_CALL_POLICY_JSON";

export interface VoiceCallPolicy {
  /** Seconds of caller silence before the assistant ends the call. */
  silenceTimeoutSeconds?: number;
  /** Absolute call ceiling, seconds. */
  maxDurationSeconds?: number;
  /** Spoken before the assistant hangs up. */
  endCallMessage?: string;
  /** Spoken when the assistant believes it reached voicemail. */
  voicemailMessage?: string;
}

const ALLOWED_KEYS = new Set(["silenceTimeoutSeconds", "maxDurationSeconds", "endCallMessage", "voicemailMessage"]);

function invalid(message: string): never {
  throw new PublishFoundationError("SERVER_CONFIG_INVALID", message);
}

function boundedInt(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    invalid(`${VOICE_CALL_POLICY_ENV_VAR}: ${label} must be an integer in [${min}, ${max}].`);
  }
  return value;
}

function boundedLine(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 300) {
    invalid(`${VOICE_CALL_POLICY_ENV_VAR}: ${label} must be a non-empty string of at most 300 characters.`);
  }
  return value.trim();
}

/** Null when unset (default). Throws SERVER_CONFIG_INVALID on any malformed value. */
export function loadVoiceCallPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): VoiceCallPolicy | null {
  const raw = env[VOICE_CALL_POLICY_ENV_VAR];
  if (raw === undefined || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid(`${VOICE_CALL_POLICY_ENV_VAR} must be valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    invalid(`${VOICE_CALL_POLICY_ENV_VAR} must be a JSON object.`);
  }
  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) invalid(`${VOICE_CALL_POLICY_ENV_VAR} contains an unsupported key: "${key}".`);
  }
  const policy: VoiceCallPolicy = {};
  if (record.silenceTimeoutSeconds !== undefined) {
    policy.silenceTimeoutSeconds = boundedInt(record.silenceTimeoutSeconds, "silenceTimeoutSeconds", 10, 600);
  }
  if (record.maxDurationSeconds !== undefined) {
    policy.maxDurationSeconds = boundedInt(record.maxDurationSeconds, "maxDurationSeconds", 60, 7200);
  }
  if (record.endCallMessage !== undefined) policy.endCallMessage = boundedLine(record.endCallMessage, "endCallMessage");
  if (record.voicemailMessage !== undefined) {
    policy.voicemailMessage = boundedLine(record.voicemailMessage, "voicemailMessage");
  }
  if (Object.keys(policy).length === 0) {
    invalid(`${VOICE_CALL_POLICY_ENV_VAR} must set at least one field when present.`);
  }
  return policy;
}
