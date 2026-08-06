/**
 * Frontend V2 — centralised route and path layer (Phase 1).
 *
 * One typed source of truth for every internal link and asset URL in
 * web-agency. Nothing else in the app may compose an in-app URL by hand.
 *
 * The three path *kinds* are deliberately distinct, because conflating them is
 * what produced the two defects Gate 3 measured:
 *
 * 1. **Router paths** (`ROUTES.*`) — base-relative. `wouter` is mounted with
 *    `base={ROUTER_BASE}` and prepends it itself, so a `<Link href>` or a
 *    `<Route path>` must carry the *bare* path. Prepending the base here would
 *    double it.
 * 2. **Asset URLs** (`withBase()`) — base-absolute. Files served from
 *    `public/` are not rewritten by Vite, so a root-relative `/x.png` 404s
 *    under a deployment prefix. `withBase("/x.png")` fixes that.
 *    (Assets imported through Vite are rewritten automatically and need
 *    nothing.)
 * 3. **Cross-application URLs** (`dashboardUrl()`) — absolute, and explicitly
 *    *not* derived from this app's base. The helpdesk dashboard is a separate
 *    Vite application with its own `BASE_PATH`; its location does not move when
 *    web-agency's base changes. These must be reached by document navigation
 *    (`<a href>`), never by `<Link>` — a `<Link>` would prepend the router base
 *    and produce the doubled prefix observed in Gate 3.
 */

/** Raw Vite base, e.g. `"/"` or `"/some-prefix/"`. */
const RAW_BASE = import.meta.env.BASE_URL || "/";

/**
 * Normalised base with no trailing slash: `""` at the root, `"/some-prefix"`
 * under a deployment prefix. This is the form `wouter` expects.
 */
export const ROUTER_BASE = RAW_BASE.replace(/\/+$/, "");

/**
 * Public + admin route paths, base-relative. Used for `<Route path>` and
 * `<Link href>` alike.
 */
export const ROUTES = {
  // ── Public marketing ────────────────────────────────────────────────────
  home: "/",
  services: "/services",
  work: "/portfolio",
  about: "/about",
  contact: "/contact",
  thankYou: "/thank-you",

  // ── Discovery — the primary "Start Your Project" destination ────────────
  discovery: "/discovery",
  /** Unlinked rollback route. Never referenced from navigation. */
  discoveryLegacy: "/discovery/__legacy",

  // ── AI Receptionist public journey ──────────────────────────────────────
  /**
   * NOTE ordering: `aiReceptionistSignup` is a strict prefix-extension of
   * `aiReceptionist`. Its `<Route>` must be registered *first* so the more
   * specific path wins — see App.tsx.
   */
  aiReceptionistSignup: "/ai-receptionist/signup",
  aiReceptionist: "/ai-receptionist",

  // ── Deferred / deprecated (owner decision 4) ────────────────────────────
  // Still routed so existing inbound links do not break, but removed from all
  // navigation and from the approved information architecture. Source files
  // are retained as rollback references; they are NOT deleted in Phase 1.
  pricing: "/pricing",
  aiForLawyers: "/ai-for-lawyers",
  aiForRealtors: "/ai-for-realtors",

  // ── Internal admin / CRM (staff only, Bearer auth) ──────────────────────
  adminLogin: "/admin",
  adminDashboard: "/admin/dashboard",
  adminSubmission: "/admin/submissions/:id",
  crmHome: "/admin/crm",
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * The primary public call to action resolves here on every public surface.
 * Owner decision 3: Discovery stays public and is the primary
 * "Start Your Project" flow.
 */
export const START_PROJECT_ROUTE = ROUTES.discovery;

/** Legacy `/app*` compatibility paths, preserved exactly. */
export const LEGACY_APP_ROUTES = {
  root: "/app",
  login: "/app/login",
  conversation: "/app/conversations/:id",
  agentConfig: "/app/agent-config",
  settings: "/app/settings",
} as const;

/**
 * Deployment location of the helpdesk dashboard application. This mirrors the
 * helpdesk build's `BASE_PATH` and is intentionally a fixed absolute path: it
 * is a different application, so it does not inherit web-agency's base.
 */
const DASHBOARD_BASE = "/ai-receptionist/dashboard";

/**
 * Absolute URL into the dashboard application.
 *
 * Always consume with a document navigation — `<a href>` or
 * `window.location` — never with `<Link>`.
 */
export function dashboardUrl(path = "/"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  // `"/"` means the dashboard root; keep its trailing slash so the SPA's own
  // router resolves the index route rather than issuing a redirect.
  return suffix === "/" ? `${DASHBOARD_BASE}/` : `${DASHBOARD_BASE}${suffix}`;
}

/** Dashboard destinations referenced from the public site. */
export const DASHBOARD_URLS = {
  root: dashboardUrl("/"),
  login: dashboardUrl("/login"),
} as const;

/**
 * Base-aware URL for a file served verbatim from `public/`.
 *
 * Prefer importing the asset instead — Vite then hashes and rewrites it
 * automatically. Use this only for genuinely path-stable `public/` files.
 */
export function withBase(assetPath: string): string {
  const suffix = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
  return `${ROUTER_BASE}/${suffix}`;
}
