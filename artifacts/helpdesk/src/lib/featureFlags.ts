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
