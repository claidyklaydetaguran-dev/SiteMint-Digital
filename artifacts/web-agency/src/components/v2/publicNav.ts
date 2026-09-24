/**
 * Frontend V2 Phase 2 — the approved public navigation model.
 *
 * One source of truth for the desktop header and the mobile drawer, so the two
 * surfaces cannot drift apart (the legacy `navConfig.ts` had the Work path
 * spelled out twice for exactly that reason).
 *
 * Structure is fixed by INFORMATION-ARCHITECTURE.md §1:
 *
 *   Home · Solutions ▾ (Websites & Apps · CRM & Automation · AI Receptionist)
 *   Work · Process · About · Contact  ─  Sign In · Start Your Project
 *
 * Binding rules encoded here:
 * - Every path comes from the centralised route layer. Nothing is hand-written.
 * - `/pricing`, `/ai-for-lawyers`, and `/ai-for-realtors` are **absent** by
 *   owner decision 4. Their routes still resolve; their navigation does not.
 * - The primary CTA is **Start Your Project** → `/discovery`, everywhere.
 *   **"Book a Call" is not used.**
 * - Sign In is a *cross-application* URL into the helpdesk SPA. It carries
 *   `external: true` so the header renders it with `<a href>`; a `<Link>` would
 *   prepend web-agency's router base and reproduce the doubled prefix Gate 3
 *   observed.
 */

import {
  ROUTES,
  START_PROJECT_ROUTE,
  DASHBOARD_URLS,
  homeSection,
  servicesSection,
} from "@/lib/routes";

export interface V2NavChild {
  label: string;
  /** Short plain-language gloss shown in the desktop menu and mobile drawer. */
  description: string;
  href: string;
}

export interface V2NavItem {
  label: string;
  /** Present on leaf items; absent on the one item that owns a submenu. */
  href?: string;
  children?: V2NavChild[];
}

export const solutionsNavItems: V2NavChild[] = [
  {
    label: "Websites & Apps",
    description: "Marketing sites and custom software built around how the business runs.",
    href: servicesSection("websites-apps"),
  },
  {
    label: "CRM & Automation",
    description: "One system of record, and the follow-up work handled automatically.",
    href: servicesSection("crm-automation"),
  },
  {
    label: "AI Receptionist",
    description: "Respond to inquiries, qualify leads, and keep conversations organised.",
    href: ROUTES.aiReceptionist,
  },
];

export const primaryNavItems: V2NavItem[] = [
  { label: "Home", href: ROUTES.home },
  { label: "Solutions", children: solutionsNavItems },
  { label: "Work", href: ROUTES.work },
  { label: "Process", href: homeSection("process") },
  { label: "About", href: ROUTES.about },
  { label: "Contact", href: ROUTES.contact },
];

/**
 * Cross-application destination — the helpdesk SPA's own login route, served
 * under its own `BASE_PATH`. Must be rendered as a document navigation.
 */
export const signInHref = DASHBOARD_URLS.login;
export const signInIsExternal = true;

/** The primary CTA, resolved through the centralised route helper. */
export const startProjectHref = START_PROJECT_ROUTE;
export const startProjectLabel = "Start Your Project";
