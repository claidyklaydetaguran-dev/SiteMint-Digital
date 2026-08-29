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
// The digest is of our own request body. It contains no credential and no
// provider identifier, and it is one-way, so it is safe to persist, log, and
// return to an authenticated owner.

import { createHash } from "node:crypto";
import type { JsonValue, VoiceAssistantInput } from "../voice/types.js";
import type { VoiceArtifactPolicy } from "../voice/providers/vapi/artifactPolicy.js";

/** Bumped only if the hashed shape changes meaning; forces one re-sync rather than a silent false match. */
export const PROVIDER_PAYLOAD_HASH_VERSION = 1;

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
    config: input.config as JsonValue,
    artifactPolicy,
  };

  return createHash("sha256").update(canonicalJsonStringify(envelope), "utf8").digest("hex");
}
