/**
 * Frontend V2 — centralised route and path layer for the dashboard (Phase 1).
 *
 * The helpdesk SPA is mounted under its own Vite base (`BASE_PATH`, normally
 * `/ai-receptionist/dashboard`). `wouter` is given that base and prepends it
 * itself, so every `<Route path>` and `<Link href>` here is **base-relative**.
 *
 * Keeping these paths in one typed place is what makes dashboard paths
 * distinguishable from public ones: anything in `ROUTES` is inside the
 * dashboard application, and anything needing to reach the public marketing
 * site must go through `publicSiteUrl()` as a document navigation.
 */

/** Raw Vite base, e.g. `"/ai-receptionist/dashboard/"`. */
const RAW_BASE = import.meta.env.BASE_URL || "/";

/** Normalised base with no trailing slash — the form `wouter` expects. */
export const ROUTER_BASE = RAW_BASE.replace(/\/+$/, "");

/** Dashboard route paths, base-relative. */
export const ROUTES = {
  login: "/login",
  /** Public, unauthenticated booking page — no session cookie required. */
  publicSchedule: "/schedule/:slug",

  overview: "/",
  conversations: "/conversations",
  receptionist: "/receptionist",
  contacts: "/contacts",
  contactDetail: "/contacts/:id",
  /** Preserved in-SPA redirect target; see App.tsx. */
  deploy: "/deploy",
  settings: "/settings",
  billing: "/billing",

  // Voice-platform surfaces — routed only when `voicePlatformEnabled`.
  assistants: "/assistants",
  assistantNew: "/assistants/new",
  assistantNewTab: "/assistants/new/:tab",
  assistantDetail: "/assistants/:id/:tab?",
  logs: "/logs",
  logDetail: "/logs/:id",
  appointments: "/appointments",
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * Absolute URL back to the public marketing site. Like the public site's
 * `dashboardUrl()`, this is a *cross-application* path: it is deliberately not
 * derived from this app's base, and must be used with a document navigation
 * (`<a href>`), never with `<Link>`.
 */
export function publicSiteUrl(path = "/"): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Base-aware URL for a file served verbatim from this app's `public/`.
 * Prefer importing the asset so Vite rewrites it automatically.
 */
export function withBase(assetPath: string): string {
  const suffix = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
  return `${ROUTER_BASE}/${suffix}`;
}
