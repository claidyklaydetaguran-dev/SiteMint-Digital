/**
 * Pricing/investment tiers for the preview's dedicated Pricing page.
 * Honest, range-based language only — no exact quotes or guarantees, per
 * the owner's pricing-experience instructions. Mirrors production
 * Pricing.tsx's Starter/Growth/Premium direction, extended with a Custom
 * tier and explicit "what's not included" / "what affects pricing" copy
 * that production's page doesn't yet have.
 */

export interface PricingTier {
  id: string;
  name: string;
  tagline: string;
  priceFrom: string;
  bestFor: string;
  includes: string[];
  notIncluded: string[];
  recommended?: boolean;
}

export const pricingTiers: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "A credible online home for a new or small business.",
    priceFrom: "Starting around $2,995",
    bestFor: "New businesses, local service providers, and professional services that need a trustworthy first website.",
    includes: [
      "A responsive marketing website (up to ~5 pages)",
      "Mobile-friendly, SEO-foundational build",
      "Contact form connected to your inbox",
      "Launch support and basic training",
    ],
    notIncluded: ["CRM or lead-tracking system", "Custom application features", "Ongoing content updates after launch"],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "A conversion-focused website with a system behind it.",
    priceFrom: "Starting around $5,995",
    bestFor: "Service businesses ready to convert visitors into tracked leads, not just traffic.",
    includes: [
      "Everything in Starter",
      "CRM setup for lead capture and follow-up",
      "Expanded page count and content structure",
      "Foundational automation for new inquiries",
    ],
    notIncluded: ["Custom web application development", "Multi-team CRM workflow configuration"],
    recommended: true,
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "A complete digital system for an established business.",
    priceFrom: "Starting around $9,995",
    bestFor: "Established businesses that need a website, CRM, and automation working together as one system.",
    includes: [
      "Everything in Growth",
      "Deeper CRM and automation configuration",
      "Advanced SEO foundation",
      "Priority support during and after launch",
    ],
    notIncluded: ["Fully custom software builds outside the marketing/CRM scope"],
  },
  {
    id: "custom",
    name: "Custom",
    tagline: "A scoped project for a specific product, portal, or integration.",
    priceFrom: "Scoped after discovery",
    bestFor: "Businesses that need a custom web application, customer portal, or connected-system build beyond a standard package.",
    includes: [
      "A discovery process to scope real requirements",
      "A project plan tailored to your systems and goals",
      "Direct access to the core SiteMint team",
    ],
    notIncluded: ["A fixed price before discovery — custom scope is priced after we understand the project"],
  },
];

export const pricingFactors: string[] = [
  "Number of pages and content complexity",
  "Whether a CRM, automation, or custom application is in scope",
  "Integrations with existing tools (scheduling, payments, email, etc.)",
  "Timeline — a compressed launch date can affect scope and cost",
  "Ongoing maintenance and support needs after launch",
];
