/**
 * Nav data shared between the desktop navbar and the mobile menu. Routes
 * are the same real routes used across web-agency today (see
 * docs/sitemint-platform/ROUTE_AND_NAVIGATION_ARCHITECTURE.md §1) — nothing
 * here invents a new route.
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
    href: "/ai-receptionist",
  },
  {
    label: "AI Toolkit",
    description: "A focused set of AI tools for day-to-day business work.",
    disabled: true,
    disabledNote: "Coming to sitemintdigital.com",
  },
];

export const servicesNavItems: PreviewNavChild[] = [
  { label: "Websites", description: "Marketing sites built to convert visitors into leads.", href: "/services" },
  { label: "Web Applications", description: "Custom software for how your business actually runs.", href: "/services" },
  { label: "CRM Systems", description: "One system of record for every lead and client.", href: "/services" },
  { label: "Business Automation", description: "Automate the follow-up work that falls through the cracks.", href: "/services" },
  { label: "SEO & Digital Growth", description: "Foundational SEO built into every page you launch.", href: "/services" },
  { label: "Maintenance & Support", description: "Ongoing care so your systems keep working.", href: "/services" },
];

export const companyNavItems: PreviewNavChild[] = [
  { label: "About", description: "Who we are and how we work.", href: "/about" },
  { label: "Contact", description: "Get in touch with the team.", href: "/contact" },
];

export const primaryNavItems: PreviewNavItem[] = [
  { label: "Products", children: productsNavItems },
  { label: "Services", children: servicesNavItems },
  { label: "Work", href: "/portfolio" },
  { label: "Pricing", href: "/pricing" },
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
export const startProjectHref = "/discovery";
