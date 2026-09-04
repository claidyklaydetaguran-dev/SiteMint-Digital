/**
 * V5 pricing tiers — the rebuilt `/pricing` system (amendment §10, supersedes
 * the W-13 "remove pricing" decision; see V5-BLUEPRINT.md §9). Shared between
 * the homepage "Pricing estimates" section and the full `PricingV5` page so
 * the numbers and inclusions can never drift between the two surfaces.
 *
 * Honesty rules carried over verbatim from the blueprint's repository check:
 * - Starter deliberately carries NO page count (the repo has two conflicting
 *   numbers for it elsewhere — "~5" vs "Up to 15" — so this tier asserts
 *   neither pending owner confirmation).
 * - "Analytics setup" always means third-party analytics configuration — no
 *   SiteMint analytics product exists.
 * - "AI-assisted workflow" (Custom tier) never implies the AI Receptionist is
 *   included — see `AI_RECEPTIONIST_PRICING_NOTE` below.
 */

export interface PricingTierV5 {
  id: "starter" | "growth" | "custom";
  name: string;
  tagline: string;
  priceFrom: string;
  bestFor: string;
  includes: string[];
  honestyNote?: string;
  recommended?: boolean;
}

export const pricingTiersV5: PricingTierV5[] = [
  {
    id: "starter",
    name: "Starter Site System",
    tagline: "A credible, working online home for a new or small business.",
    priceFrom: "From $2,995",
    bestFor: "New businesses and local service providers who need a trustworthy first website.",
    includes: [
      "Strategy & discovery",
      "Responsive website",
      "Core pages",
      "Lead / contact capture",
      "Foundational SEO",
      "Analytics setup",
      "Launch support",
    ],
    honestyNote:
      "“Analytics setup” means configuring a third-party analytics tool (e.g. Google Analytics) — SiteMint does not have its own analytics product.",
  },
  {
    id: "growth",
    name: "Growth Digital System",
    tagline: "A conversion-focused website with a real system behind it.",
    priceFrom: "From $5,995",
    bestFor: "Service businesses ready to convert visitors into tracked leads, not just traffic.",
    includes: [
      "Advanced website or web app",
      "Custom conversion journey",
      "CRM or workflow connection",
      "Automation",
      "Expanded analytics",
      "Training + launch support",
    ],
    recommended: true,
  },
  {
    id: "custom",
    name: "Custom Connected System",
    tagline: "A complete connected system: web app, CRM, and automation together.",
    priceFrom: "From $9,995",
    bestFor: "Established businesses that need a web application, CRM/internal operations system, and automation working as one system.",
    includes: [
      "Custom web application",
      "CRM / internal operations system",
      "AI-assisted workflow",
      "Multiple integrations",
      "Advanced permissions & dashboards",
      "Implementation planning",
      "Testing + deployment support",
    ],
    honestyNote:
      "“AI-assisted workflow” means AI-assisted automation inside your system (drafting, routing, evaluation) — it does not include the AI Receptionist product, which is priced separately during private-beta onboarding.",
  },
];

/** Mandatory disclaimer — verbatim, V5-BLUEPRINT §9. */
export const PRICING_DISCLAIMER_V5 =
  "Starting estimates. Final pricing depends on scope, integrations, content, timeline, and ongoing support requirements.";

/** AI Receptionist is never priced on this page. */
export const AI_RECEPTIONIST_PRICING_NOTE_V5 =
  "AI Receptionist pricing is provided during private-beta onboarding.";
