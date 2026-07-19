/**
 * Single import site for client-exposed feature flags. Never read
 * import.meta.env directly elsewhere — add new flags here instead.
 *
 * Flags are boolean capability switches only. Never put secrets or
 * provider credentials in VITE_ variables.
 */

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

/**
 * Gates visibility of in-progress voice-platform navigation/routes.
 * Defaults false (production-safe) when unset or invalid.
 * SMS/receptionist routes are never gated by this flag.
 */
export const voicePlatformEnabled: boolean = parseBooleanFlag(
  import.meta.env.VITE_VOICE_PLATFORM_ENABLED,
);

/**
 * Milestone 1 / Checkpoint E3C: gates the frontend Publish workflow (the
 * confirmation dialog and the POST .../publish request). Defaults false
 * (production-safe) when unset or invalid. This is a frontend convenience
 * gate only, never a security boundary — the backend `publish_disabled`
 * response remains the ultimate authority regardless of this flag's value.
 * Has no effect when `voicePlatformEnabled` is false, since the assistant
 * routes themselves are unavailable in that case.
 */
export const voicePublishEnabled: boolean = parseBooleanFlag(
  import.meta.env.VITE_VOICE_PUBLISH_ENABLED,
);

/**
 * Milestone 1 / Checkpoint F1: gates the frontend browser voice-test
 * foundation (the Test confirmation dialog, the browser-test state machine,
 * and the active test panel). Defaults false (production-safe) when unset
 * or invalid. This is a frontend convenience gate only, never a security
 * boundary, and it carries no provider host, public key, or private key —
 * it is a plain capability switch. Has no effect when `voicePlatformEnabled`
 * is false, since the assistant routes themselves are unavailable in that
 * case. Even when this flag is true, production Test remains fail-closed
 * until a real BrowserVoiceClient is wired in (Checkpoint F2) — see
 * UnavailableBrowserVoiceClient.
 */
export const voiceBrowserTestEnabled: boolean = parseBooleanFlag(
  import.meta.env.VITE_VOICE_BROWSER_TEST_ENABLED,
);
