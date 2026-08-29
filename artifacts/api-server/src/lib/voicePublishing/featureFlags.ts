// Milestone 1 / Checkpoint E3B1: backend-only feature configuration for a
// future publish route (Checkpoint E3B2). No route behavior depends on this
// yet, and this file is never imported by startup code in this checkpoint.
// Never read at module import time — callers explicitly call
// isVoicePublishEnabled(). No VITE_-prefixed variable exists for this flag;
// it must never be exposed to the browser bundle.

export const VOICE_PUBLISH_ENABLED_ENV_VAR = "VOICE_PUBLISH_ENABLED";

/** Defaults to false. Only the literal string "true" (case-sensitive) enables it. */
export function isVoicePublishEnabled(): boolean {
  return process.env[VOICE_PUBLISH_ENABLED_ENV_VAR] === "true";
}

/**
 * AR-001V.1: the independent switch for updating an ALREADY-PUBLISHED
 * assistant. Deliberately its own variable rather than a reuse of
 * VOICE_PUBLISH_ENABLED, so the two capabilities can never be granted by
 * accident together:
 *
 *   - turning this on grants exactly one provider verb, `updateAssistant`,
 *     against a provider resource that already exists. It reaches no
 *     `createAssistant` call site, no Publish control, and no new-assistant
 *     path, because `publishAssistant()` reads only the publish flag;
 *   - turning publishing on grants no synchronization, because
 *     `synchronizePublishedAssistant()` reads only this one.
 *
 * Defaults to false, same fail-closed rule: only the exact literal "true".
 * Never exposed to the browser — the client has its own separate build flag.
 */
export const VOICE_SYNC_ENABLED_ENV_VAR = "VOICE_SYNC_ENABLED";

export function isVoiceSyncEnabled(): boolean {
  return process.env[VOICE_SYNC_ENABLED_ENV_VAR] === "true";
}

/**
 * AR-001V.1: the server-side switch for handing an authenticated owner the
 * minimum metadata a browser test needs. The client build flag
 * (VITE_VOICE_BROWSER_TEST_ENABLED) decides whether that code is built at
 * all; this decides whether the server will answer. Both are required, and
 * this one is authoritative — a crafted request from any client is refused
 * while it is false.
 */
export const VOICE_BROWSER_TEST_ENABLED_ENV_VAR = "VOICE_BROWSER_TEST_ENABLED";

export function isVoiceBrowserTestEnabled(): boolean {
  return process.env[VOICE_BROWSER_TEST_ENABLED_ENV_VAR] === "true";
}
