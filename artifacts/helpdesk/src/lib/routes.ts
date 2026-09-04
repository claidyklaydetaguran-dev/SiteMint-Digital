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
 *
 * ── D-2 navigation (2026-09 owner replan) ──────────────────────────────────
 *
 * This is the approved information architecture (INFORMATION-ARCHITECTURE.md
 * §4, OWNER-REVIEW-WORKBOOK.md D-2): Overview · Setup · Assistant · Scheduling
 * (Availability, Appointment Types, Calendar, Appointments, Test Booking) ·
 * Activity (Calls, Conversations, Contacts) · Channels (Phone Number, SMS) ·
 * Account (Usage, Billing, Settings, Support). Scheduling is deliberately
 * **not** voice-gated (owner decision B-1) — Availability, Appointment Types,
 * Calendar, Appointments and Test Booking are calendar features, wired
 * unconditionally below. Only Assistant, Calls, Phone Number, Usage and
 * Issues stay behind `voicePlatformEnabled`, exactly as their nav records in
 * `lib/nav.ts` say.
 *
 * Every path a pre-replan build could reach keeps working: the "Legacy
 * redirects" block in `App.tsx` sends the old flat paths (`/conversations`,
 * `/contacts`, `/receptionist`, `/settings`, `/billing`, `/appointments`,
 * `/logs`, `/logs/:id`, `/deploy`) to their new home with `replace: true`, so
 * no bookmark or external link 404s.
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
  /** S-2: request a password reset. Renders inside `AuthShell`, like Login. */
  passwordReset: "/password-reset",
  /** S-2: complete a password reset (`?token=…`). Renders inside `AuthShell`. */
  passwordResetComplete: "/password-reset/complete",

  overview: "/",
  /** S-3: the persistent Setup hub. */
  setup: "/setup",

  // Scheduling — calendar features (B-1), never voice-gated.
  availability: "/scheduling/availability",
  /** Renders Availability with its "types" tab preselected; see App.tsx. */
  appointmentTypes: "/scheduling/appointment-types",
  calendar: "/scheduling/calendar",
  appointments: "/scheduling/appointments",
  testBooking: "/scheduling/test-booking",

  // Activity — Calls stays voice-gated below; Conversations and Contacts do not.
  conversations: "/activity/conversations",
  contacts: "/activity/contacts",
  contactDetail: "/activity/contacts/:id",

  // Channels — SMS is not voice-gated; Phone Number is, below.
  sms: "/channels/sms",

  // Account — Billing, Settings and Support are not voice-gated; Usage and
  // Issues are, below.
  billing: "/account/billing",
  settings: "/account/settings",
  support: "/account/support",

  // Voice-platform surfaces — routed only when `voicePlatformEnabled`.
  assistants: "/assistants",
  assistantNew: "/assistants/new",
  assistantNewTab: "/assistants/new/:tab",
  assistantDetail: "/assistants/:id/:tab?",
  calls: "/activity/calls",
  callDetail: "/activity/calls/:id",
  phoneNumber: "/channels/phone-number",
  usage: "/account/usage",
  issues: "/account/issues",
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * The live voice-platform destinations that receive an intentional
 * capability state when the platform flag is off (V4 R1, extended by the
 * 2026-09 owner replan). Kept here so the route layer stays the single
 * source of truth for these paths and the router never has to name a gated
 * route token outside its flag gate.
 *
 * `/appointments` and `/logs` are deliberately absent: Appointments moved out
 * of the voice gate entirely (B-1), and `/logs` is now a legacy redirect
 * target (see `App.tsx`) whose destination, `/activity/calls`, is already
 * covered by `ROUTES.calls` below.
 *
 * The nine placeholder paths are the D-8 "removed from nav until functional"
 * destinations (Tools, Voice Library, Knowledge, Analytics, Testing,
 * Structured Outputs, Integrations, API Keys, Phone Numbers). Their nav
 * records still exist in `lib/nav.ts` and still render `ComingSoon` when the
 * voice flag is on — unchanged — but until AR-001J these plain path strings
 * are the only way a *disabled* build can also give them a non-404 answer,
 * since nav-only labels and descriptions must never enter a disabled build
 * (AR-001M). Listing bare paths here does not violate that: paths are
 * allowed, gated copy is not.
 */
export const VOICE_CAPABILITY_PATHS: readonly string[] = [
  ROUTES.assistants,
  ROUTES.calls,
  ROUTES.phoneNumber,
  ROUTES.usage,
  ROUTES.issues,
  ROUTES.assistantNew,
  "/tools",
  "/voice-library",
  "/knowledge",
  "/analytics",
  "/testing",
  "/structured-outputs",
  "/integrations",
  "/settings/api-keys",
  "/phone-numbers",
] as const;

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
