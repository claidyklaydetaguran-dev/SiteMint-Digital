// AR-001V.3: which site origins a scoped browser token may be used from.
//
// This is DEFENCE IN DEPTH, not authentication. An `Origin` header is set by
// the client, and a plain server-side request can set it to anything — proven
// against the live provider on 2026-09-11, where a Node request with a
// hand-set Origin passed the provider's origin check and was then stopped only
// by the assistant restriction. So an origin list narrows casual misuse from a
// browser; the `allowedAssistantIds` restriction is what actually separates
// one business from another.
//
// Source of truth is the existing CORS allowlist: the dashboard that starts a
// browser test is by definition an origin we already permit to call this API,
// so the two lists cannot drift apart. A dedicated override exists for the
// case where they must differ.

export const VOICE_BROWSER_TOKEN_ORIGINS_ENV_VAR = "VOICE_BROWSER_TOKEN_ORIGINS";
export const CORS_ALLOWED_ORIGINS_ENV_VAR = "CORS_ALLOWED_ORIGINS";

function parseOrigins(raw: string | undefined): string[] {
  if (typeof raw !== "string") return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (value.length === 0) continue;
    // Only absolute http(s) origins, and only the origin itself — a path or a
    // wildcard would widen this beyond what the provider can enforce.
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
    if (parsed.origin !== value.replace(/\/+$/, "")) continue;
    seen.add(parsed.origin);
  }
  return [...seen];
}

/**
 * Returns the origins a newly minted browser token is restricted to. Empty
 * means "cannot mint" — the caller reports the capability as unavailable
 * rather than minting an unrestricted token.
 */
export function loadBrowserTokenOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const explicit = parseOrigins(env[VOICE_BROWSER_TOKEN_ORIGINS_ENV_VAR]);
  if (explicit.length > 0) return explicit;
  return parseOrigins(env[CORS_ALLOWED_ORIGINS_ENV_VAR]);
}
