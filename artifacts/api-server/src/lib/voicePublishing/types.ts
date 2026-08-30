// Milestone 1 / Checkpoint E3B1: provider-neutral types for the publish
// foundation. This module never imports frontend code and is not a
// dependency of any runtime provider (Vapi or otherwise) — it only describes
// the server-owned runtime catalog and the customer-controlled fields safely
// extracted from a persisted assistant config.

export const RUNTIME_CATALOG_VERSION = 1;

export interface RuntimeCatalogModel {
  provider: string;
  model: string;
}

export interface RuntimeCatalogVoice {
  provider: string;
  voiceId: string;
  version?: number;
}

export interface RuntimeCatalogTranscriber {
  provider: string;
  model?: string;
  language?: string;
}

/** One server-approved runtime preset entry. Milestone 1 supports only the "vapi" provider. */
export interface RuntimeCatalogPreset {
  provider: "vapi";
  model: RuntimeCatalogModel;
  voice: RuntimeCatalogVoice;
  transcriber: RuntimeCatalogTranscriber;
}

/**
 * The parsed, validated, defensively-cloned server runtime catalog. Internal
 * representation only — the wire format (VOICE_RUNTIME_CATALOG_JSON) is a
 * `presets` ARRAY of `{key, ...}` entries, not a keyed object. A keyed JSON
 * object would let `JSON.parse` silently collapse duplicate keys before any
 * validation code ever saw more than one entry; an array has no such
 * collapsing behavior, so a duplicate `key` value across two array entries
 * is genuinely observable and can be rejected. This internal map is built by
 * the parser after duplicate-key rejection, purely so callers get O(1)
 * lookup — key order in the source array never affects lookup behavior.
 */
export interface RuntimeCatalog {
  version: 1;
  presets: Readonly<Record<string, RuntimeCatalogPreset>>;
}

export type PublishFirstMessageMode = "assistant-speaks-first" | "wait-for-caller";

/**
 * The complete, server-owned allowlist of machine-readable sync-error codes.
 * `sync_error` never stores arbitrary caller-provided text — only one of
 * these short static codes. This guarantees no provider response body, API
 * key, Authorization/Bearer value, system instructions, first message, SQL
 * text/parameters, stack trace, or serialized `cause` can ever reach the
 * database: none of those things are members of this list, and nothing
 * outside this list is accepted (see errors.ts `toSafeSyncErrorCode`).
 */
export const PUBLISH_SYNC_ERROR_CODES = [
  "runtime_catalog_not_configured",
  "runtime_catalog_invalid",
  "unsupported_preset",
  "assistant_config_invalid",
  "provider_authentication_failed",
  "provider_rate_limited",
  "provider_timeout",
  "provider_network_error",
  "provider_request_rejected",
  "provider_response_invalid",
  "provider_result_uncertain",
  "local_finalize_failed",
  "stale_publish_attempt",
  "unknown_publish_error",
] as const;

export type PublishSyncErrorCode = (typeof PUBLISH_SYNC_ERROR_CODES)[number];

/** The exact static code written by the stale-publishing-attempt sweep. Never caller-supplied. */
export const STALE_PUBLISH_ATTEMPT_CODE: PublishSyncErrorCode = "stale_publish_attempt";

/** Fallback code for any value that is not a member of PUBLISH_SYNC_ERROR_CODES. */
export const UNKNOWN_PUBLISH_ERROR_CODE: PublishSyncErrorCode = "unknown_publish_error";

/**
 * Customer-controlled fields safely extracted from a persisted schemaVersion
 * 1 assistant config. This is NOT the E3A `VapiAssistantRuntimeConfig` — a
 * future Checkpoint E3B2 combines this with the matching `RuntimeCatalogPreset`
 * to build that provider-adapter shape. Nothing here is provider-specific.
 */
export interface ExtractedAssistantPublishConfig {
  presetKey: string;
  systemInstructions: string;
  firstMessageMode: PublishFirstMessageMode;
  firstMessage?: string;
}
