// AR-001V: deterministic digest of the exact provider-relevant payload.
//
// This is the whole basis of the "is the provider running what we have?"
// question, so it has to be a pure function of the bytes that would actually
// be sent — nothing more and nothing less.
//
// Included: the provider-neutral assistant input the publish/sync path builds
// (`name` + the resolved model/voice/transcriber/firstMessage*/systemInstructions
// config), and the server-owned artifact policy, because the policy is part of
// every outgoing request body and changing it changes what the provider runs.
//
// Excluded: everything a caller can edit that is never sent — Setup, Analysis,
// Advanced, tools, knowledge, testing — and every piece of local bookkeeping
// (ids, timestamps, status, attempt ids). That exclusion is the point:
// `updated_at` moves on any local edit, so it cannot answer this question,
// while this digest only moves when the provider's view would actually differ.
//
// The digest is of our own request body, with one deliberate exception: every
// `server` block is reduced to {url, auth mode, credential fingerprint} before
// hashing. That keeps the promise below literally true — before H1 it was not,
// because `config.server` carried `{url, secret}` and the stored digest was
// therefore taken over the raw webhook secret.
//
// It contains no credential and no provider identifier, and it is one-way, so
// it is safe to persist, log, and return to an authenticated owner.

import { createHash } from "node:crypto";
import type { JsonValue, VoiceAssistantInput } from "../voice/types.js";
import type { VoiceArtifactPolicy } from "../voice/providers/vapi/artifactPolicy.js";

/**
 * Bumped only if the hashed shape changes meaning; forces one re-sync rather
 * than a silent false match.
 *
 * v2 (H1): the server block is hashed as a redacted descriptor — url, auth
 * mode, and a one-way fingerprint of the credential id — instead of verbatim.
 * Before this, `config.server` was hashed as `{url, secret}`, so the stored
 * digest was taken over the raw webhook secret, which contradicted this
 * module's own no-credential invariant. The bump is also what makes
 * reconciliation notice bearer→HMAC: any assistant last synced under a
 * v1/bearer payload no longer matches, so the next sync re-sends and replaces
 * the bearer configuration at the provider.
 */
export const PROVIDER_PAYLOAD_HASH_VERSION = 2;

/**
 * Canonical JSON: object keys sorted by code unit, array order preserved,
 * `undefined` properties dropped exactly as `JSON.stringify` would drop them.
 * Two structurally equal payloads therefore serialize identically regardless
 * of the order in which their properties were built.
 */
export function canonicalJsonStringify(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }

  const entries = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(value[key] as JsonValue)}`);

  return `{${entries.join(",")}}`;
}

/**
 * Classifies a server block by the authentication it selects at the provider.
 * `credentialId` means an HMAC Custom Credential; a lingering `secret` means
 * the bearer mechanism. Exported so reconciliation and tests can assert which
 * one a payload would configure without inspecting raw values.
 */
export type ServerAuthMode = "hmac_credential" | "bearer_secret" | "none";

export function classifyServerAuthMode(server: unknown): ServerAuthMode {
  if (typeof server !== "object" || server === null || Array.isArray(server)) return "none";
  const record = server as Record<string, unknown>;
  if (typeof record.credentialId === "string" && record.credentialId.length > 0) return "hmac_credential";
  if (typeof record.secret === "string" && record.secret.length > 0) return "bearer_secret";
  return "none";
}

/**
 * Replaces every `server` block with a descriptor that preserves what drift
 * detection needs — the URL and the auth mode — plus a one-way fingerprint of
 * the credential id, so rotating the credential still moves the digest while
 * the digest itself carries no credential and no recoverable provider id.
 */
function redactServerBlocks(config: JsonValue): JsonValue {
  if (Array.isArray(config)) return config.map((entry) => redactServerBlocks(entry));
  if (typeof config !== "object" || config === null) return config;

  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(config as Record<string, JsonValue>)) {
    if (value === undefined) continue;
    if (key !== "server") {
      out[key] = redactServerBlocks(value);
      continue;
    }
    const mode = classifyServerAuthMode(value);
    const block = (value ?? {}) as Record<string, JsonValue>;
    const descriptor: Record<string, JsonValue> = {
      url: typeof block.url === "string" ? block.url : "",
      auth: mode,
    };
    if (mode === "hmac_credential") {
      descriptor.credentialFingerprint = createHash("sha256")
        .update(String(block.credentialId), "utf8")
        .digest("hex")
        .slice(0, 16);
    }
    out[key] = descriptor;
  }
  return out;
}

/**
 * SHA-256 (lowercase hex, 64 chars) over the canonical serialization of the
 * versioned payload envelope. The database CHECK constraint
 * `ck_voice_assistants_provider_config_hash_shape` pins that shape.
 */
export function computeProviderPayloadHash(
  input: VoiceAssistantInput,
  artifactPolicy: VoiceArtifactPolicy,
): string {
  const envelope: JsonValue = {
    v: PROVIDER_PAYLOAD_HASH_VERSION,
    name: input.name,
    config: redactServerBlocks(input.config as JsonValue),
    artifactPolicy,
  };

  return createHash("sha256").update(canonicalJsonStringify(envelope), "utf8").digest("hex");
}
