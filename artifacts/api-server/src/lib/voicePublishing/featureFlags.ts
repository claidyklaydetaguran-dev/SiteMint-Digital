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
