/**
 * Single import site for the platform-preview feature flag. Never read
 * import.meta.env directly elsewhere — add new flags here instead, matching
 * the precedent set by artifacts/helpdesk/src/lib/featureFlags.ts.
 *
 * Boolean capability switch only, never a secret. Defaults false
 * (production-safe / fail-closed) when unset or invalid.
 */

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

/**
 * Gates the /platform-preview route (SiteMint Platform Phase 2A prototype).
 * When false, the route renders the app's ordinary not-found page — it does
 * not redirect, and it exposes no prototype markup, styles, or scripts.
 * Never linked from the current public Navbar/Footer, sitemap, or robots
 * allowlist regardless of this flag's value.
 */
export const platformPreviewEnabled: boolean = parseBooleanFlag(
  import.meta.env.VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED,
);
