/**
 * Nav data shared between the desktop navbar and the mobile menu.
 *
 * Production migration: this approved design now serves the production
 * routes directly, so every content link (Products/AI Receptionist,
 * Services, Work, Pricing, Company/About/Contact) points at the real
 * production paths (`/services`, `/pricing`, `/portfolio`, `/about`,
 * `/contact`, `/ai-receptionist`) rather than the old `/platform-preview/*`
 * sub-pages. `signInHref` is unchanged — it already pointed at the real
 * authenticated destination.
 */

import { ROUTES, START_PROJECT_ROUTE, DASHBOARD_URLS } from "@/lib/routes";

export interface PreviewNavChild {
  label: string;
  description: string;
  href?: string;
  disabled?: boolean;
  disabledNote?: string;
}

export interface PreviewNavItem {
  label: string;
  href?: string;
  children?: PreviewNavChild[];
}

export const productsNavItems: PreviewNavChild[] = [
  {
    label: "AI Receptionist",
    description: "Never miss a lead — AI answers, qualifies, and follows up 24/7.",
    href: ROUTES.aiReceptionist,
  },
  {
    label: "AI Toolkit",
    description: "A focused set of AI tools for day-to-day business work.",
    disabled: true,
    // Checkpoint 2A.3: was "Coming to sitemintdigital.com" — contradicted the
    // "In development" badge shown on the same product elsewhere (Products
    // section, AiToolkitPreview). One consistent readiness word now, matching
    // capabilityStatus.ts's label exactly.
    disabledNote: "In development",
  },
];

export const servicesNavItems: PreviewNavChild[] = [
  { label: "Websites", description: "Marketing sites built to convert visitors into leads.", href: ROUTES.services },
  { label: "Web Applications", description: "Custom software for how your business actually runs.", href: ROUTES.services },
  { label: "CRM Systems", description: "One system of record for every lead and client.", href: ROUTES.services },
  { label: "Business Automation", description: "Automate the follow-up work that falls through the cracks.", href: ROUTES.services },
  { label: "SEO & Digital Growth", description: "Foundational SEO built into every page you launch.", href: ROUTES.services },
  { label: "Maintenance & Support", description: "Ongoing care so your systems keep working.", href: ROUTES.services },
];

export const companyNavItems: PreviewNavChild[] = [
  { label: "About", description: "Who we are and how we work.", href: ROUTES.about },
  { label: "Contact", description: "Get in touch with the team.", href: ROUTES.contact },
];

/** Single source of truth for this top-level link — read by both
 * PlatformPreviewNavbar's `primaryNavItems` loop and PlatformPreviewMobileMenu,
 * which previously hardcoded the same path a second time.
 *
 * Frontend V2 Phase 1: paths now come from the centralised route layer rather
 * than being spelled out here a second time. */
export const workHref = ROUTES.work;

/**
 * Frontend V2 Phase 1, owner decision 4: `/pricing` is **deferred**. It leaves
 * the approved public navigation and information architecture — no navbar
 * entry, no mobile-menu entry, no footer entry — because there is no approved
 * package scope or pricing, and V2 ships no pricing table until there is.
 *
 * The route itself still resolves and `PlatformPricingPreview` is retained as
 * a rollback reference; only its *navigation* is withdrawn. Deleting the
 * source is a separate, later owner decision, not Phase 1 work. The
 * `/ai-for-lawyers` and `/ai-for-realtors` verticals are deferred the same
 * way — they were already absent from this file.
 */
export const primaryNavItems: PreviewNavItem[] = [
  { label: "Products", children: productsNavItems },
  { label: "Services", children: servicesNavItems },
  { label: "Work", href: workHref },
  { label: "Company", children: companyNavItems },
];

/**
 * Verified against artifacts/helpdesk/src/App.tsx's registered `/login`
 * route, served at BASE_PATH=/ai-receptionist/dashboard — the same
 * destination LandingReceptionistSignup.tsx already links to today. This is
 * the only real, working customer-product login in the repository (AI
 * Toolkit has no auth route at all — artifacts/ai-toolkit/src/App.tsx
 * registers only `/`, `/thank-you`, `/cancel`); never point Sign In at
 * `/admin` (staff-only, Bearer token) or any other route.
 *
 * Labeled "Sign In" rather than "Client Login" (Checkpoint 2A.2) — a direct
 * link, not a dropdown, because exactly one customer product has a real
 * login today. Once a second real customer-product destination exists
 * (e.g. an AI Toolkit account area), this should become a small product-
 * access menu instead of a single direct link — do not add a second menu
 * item before that destination is verified real.
 *
 * Frontend V2 Phase 1: this is a **cross-application** URL — the helpdesk
 * dashboard is a separate Vite app with its own BASE_PATH, so this path must
 * not acquire web-agency's router base. It now comes from the centralised path
 * layer and **must be rendered with `<a href>`, never `<Link>`**: a `<Link>`
 * prepends the router base and produces the doubled prefix Gate 3 observed.
 */
export const signInHref = DASHBOARD_URLS.login;

/**
 * Production migration: the preview's own guided discovery form
 * (`PlatformDiscoveryShell`) is explicitly non-functional — it submits
 * nothing and depends on `@workspace/discovery-contract` in a way that
 * isn't wired to any live endpoint. Rather than ship a primary CTA that
 * goes nowhere, "Start a Project" points at the real, working `/discovery`
 * funnel (posts to `/api/discovery/submit`) until the guided form is
 * actually connected to a live submission path — see DECISION_LOG.md.
 *
 * Frontend V2 Phase 1, owner decision 3: Discovery stays public at `/discovery`
 * and is SiteMint's primary "Start Your Project" flow. Every public primary CTA
 * resolves here through the centralised route layer.
 */
export const startProjectHref = START_PROJECT_ROUTE;
