/**
 * Nav data shared between the desktop navbar and the mobile menu.
 *
 * Frontend Epic 1: every content link (Products/AI Receptionist,
 * Services, Work, Pricing, Company/About/Contact) now points at this
 * preview family's own `/platform-preview/*` sub-pages rather than the
 * production `/services`, `/pricing`, `/portfolio`, `/about`, `/contact`,
 * `/ai-receptionist` routes — so the preview reads as one self-contained
 * site and never silently hands a preview visitor off to production. Only
 * `signInHref` still points outside the preview family, because it is a
 * real authenticated destination the preview intentionally links out to.
 */

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
    href: "/platform-preview/ai-receptionist",
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
  { label: "Websites", description: "Marketing sites built to convert visitors into leads.", href: "/platform-preview/services" },
  { label: "Web Applications", description: "Custom software for how your business actually runs.", href: "/platform-preview/services" },
  { label: "CRM Systems", description: "One system of record for every lead and client.", href: "/platform-preview/services" },
  { label: "Business Automation", description: "Automate the follow-up work that falls through the cracks.", href: "/platform-preview/services" },
  { label: "SEO & Digital Growth", description: "Foundational SEO built into every page you launch.", href: "/platform-preview/services" },
  { label: "Maintenance & Support", description: "Ongoing care so your systems keep working.", href: "/platform-preview/services" },
];

export const companyNavItems: PreviewNavChild[] = [
  { label: "About", description: "Who we are and how we work.", href: "/platform-preview/about" },
  { label: "Contact", description: "Get in touch with the team.", href: "/platform-preview/contact" },
];

/** Single source of truth for these two top-level links — read by both
 * PlatformPreviewNavbar's `primaryNavItems` loop and PlatformPreviewMobileMenu,
 * which previously hardcoded the same two paths a second time. */
export const workHref = "/platform-preview/portfolio";
export const pricingHref = "/platform-preview/pricing";

export const primaryNavItems: PreviewNavItem[] = [
  { label: "Products", children: productsNavItems },
  { label: "Services", children: servicesNavItems },
  { label: "Work", href: workHref },
  { label: "Pricing", href: pricingHref },
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
 */
export const signInHref = "/ai-receptionist/dashboard/login";

/**
 * Phase 2C.2C2: points at the flag-gated, preview-only guided discovery
 * form (`/platform-preview/start-project`), not the real `/discovery`
 * funnel — this CTA lives only inside `/platform-preview`, itself gated by
 * `platformPreviewEnabled`, so it can never expose the preview form to a
 * visitor who reached it any other way.
 */
export const startProjectHref = "/platform-preview/start-project";
