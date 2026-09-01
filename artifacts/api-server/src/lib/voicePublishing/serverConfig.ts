// P2: the server-URL (webhook) attachment configuration for provider
// payloads — REPRESENTATION ONLY in this phase. Nothing configures a live
// Vapi server URL until an owner-authorized activation phase flips
// VOICE_WEBHOOK_ATTACH_ENABLED and runs a publish/sync.
//
// Contract, mirroring the artifact-policy pattern (server-owned, no client
// or per-request override, fail-closed):
//   - VOICE_WEBHOOK_ATTACH_ENABLED: only the exact string "true" enables
//     attachment; anything else (including unset) means publish/sync send
//     no `server` object and the provider keeps whatever it has (nothing,
//     today).
//   - When enabled, VOICE_SERVER_URL must be an https origin+path with no
//     query, fragment, or userinfo.
//   - VAPI_WEBHOOK_CREDENTIAL_ID must name exactly one Vapi HMAC Custom
//     Credential. That id is what the provider payload carries; the shared
//     secret itself never leaves this server.
//   - VAPI_WEBHOOK_SECRET must still be present and at least 16 characters.
//     It is a PRECONDITION, not a payload field: attaching a credential
//     while the receiver has no secret to verify against would publish an
//     assistant whose every webhook we would reject. It is deliberately
//     absent from the returned config so no caller can forward it.
//
// H1: the payload previously carried `server.secret`, which selected Vapi's
// bearer mechanism (no replay protection, forbidden in production) AND
// shipped our own HMAC secret into a provider-stored field. Both are fixed by
// referencing the credential instead.
//
// A missing, malformed, or ambiguous value fails the publish/sync BEFORE any
// claim or provider request, and the error never echoes the values.

import { PublishFoundationError } from "./errors.js";

export const VOICE_WEBHOOK_ATTACH_ENABLED_ENV_VAR = "VOICE_WEBHOOK_ATTACH_ENABLED";
export const VOICE_SERVER_URL_ENV_VAR = "VOICE_SERVER_URL";
export const VOICE_SERVER_SECRET_ENV_VAR = "VAPI_WEBHOOK_SECRET";
export const VOICE_SERVER_CREDENTIAL_ID_ENV_VAR = "VAPI_WEBHOOK_CREDENTIAL_ID";

export const MIN_SERVER_SECRET_LENGTH = 16;

/**
 * One provider credential id. Deliberately narrow: a single run of id-safe
 * characters, so a comma- or space-separated list — "which of these did you
 * mean?" — is rejected as ambiguous rather than silently sending the first,
 * the last, or the whole string as one id.
 */
const CREDENTIAL_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export interface VoiceServerConfig {
  url: string;
  /** Reference to a provider-side HMAC Custom Credential. Never a secret value. */
  credentialId: string;
}

export function isVoiceWebhookAttachEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[VOICE_WEBHOOK_ATTACH_ENABLED_ENV_VAR] === "true";
}

function invalid(message: string): never {
  // Message names the variable and the rule — never the value.
  throw new PublishFoundationError("SERVER_CONFIG_INVALID", message);
}

/**
 * Loads the server attachment for provider payloads. Returns null when the
 * feature is disabled (the default), a validated {url, secret} when enabled,
 * and throws SERVER_CONFIG_INVALID when enabled but misconfigured — callers
 * treat that exactly like a missing catalog/policy: fail before claiming.
 */
export function loadVoiceServerConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): VoiceServerConfig | null {
  if (!isVoiceWebhookAttachEnabled(env)) return null;

  const rawUrl = env[VOICE_SERVER_URL_ENV_VAR];
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    invalid(`${VOICE_SERVER_URL_ENV_VAR} is required when ${VOICE_WEBHOOK_ATTACH_ENABLED_ENV_VAR} is true.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    invalid(`${VOICE_SERVER_URL_ENV_VAR} must be a valid absolute URL.`);
  }
  if (parsed.protocol !== "https:") invalid(`${VOICE_SERVER_URL_ENV_VAR} must use https.`);
  if (parsed.username || parsed.password) invalid(`${VOICE_SERVER_URL_ENV_VAR} must not contain userinfo.`);
  if (parsed.search) invalid(`${VOICE_SERVER_URL_ENV_VAR} must not contain a query string.`);
  if (parsed.hash) invalid(`${VOICE_SERVER_URL_ENV_VAR} must not contain a fragment.`);
  if (!parsed.hostname) invalid(`${VOICE_SERVER_URL_ENV_VAR} must contain a hostname.`);

  // Precondition only — never returned, never forwarded to the provider.
  const secret = env[VOICE_SERVER_SECRET_ENV_VAR];
  if (typeof secret !== "string" || secret.length < MIN_SERVER_SECRET_LENGTH) {
    invalid(
      `${VOICE_SERVER_SECRET_ENV_VAR} must be set (>= ${MIN_SERVER_SECRET_LENGTH} chars) when ${VOICE_WEBHOOK_ATTACH_ENABLED_ENV_VAR} is true.`,
    );
  }

  const rawCredentialId = env[VOICE_SERVER_CREDENTIAL_ID_ENV_VAR];
  if (typeof rawCredentialId !== "string" || rawCredentialId.trim().length === 0) {
    invalid(
      `${VOICE_SERVER_CREDENTIAL_ID_ENV_VAR} is required when ${VOICE_WEBHOOK_ATTACH_ENABLED_ENV_VAR} is true.`,
    );
  }
  const credentialId = rawCredentialId.trim();
  if (/[\s,;]/.test(credentialId)) {
    invalid(`${VOICE_SERVER_CREDENTIAL_ID_ENV_VAR} must name exactly one credential, not a list.`);
  }
  if (!CREDENTIAL_ID_SHAPE.test(credentialId)) {
    invalid(`${VOICE_SERVER_CREDENTIAL_ID_ENV_VAR} is not a well-formed provider credential id.`);
  }

  return { url: parsed.toString(), credentialId };
}
