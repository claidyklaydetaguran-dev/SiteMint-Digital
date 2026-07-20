/**
 * Signature-interaction config. Selecting a goal in <BusinessGoalSelector>
 * drives every other coordinated area (hero microcopy, ecosystem-stage
 * emphasis, workflow-step emphasis, recommended product/service badges,
 * contextual CTA) from this single data source — no per-goal layout is
 * duplicated anywhere else in the prototype.
 *
 * `emphasizedStageIds` reference `systemStages` ids (systemFlow.ts).
 * `recommendedProductIds`/`recommendedServiceIds` reference the `id` field
 * on ProductsSection's/ServicesSection's own data arrays.
 *
 * Copy below is proposed, not approved — see the Phase 2A implementation
 * note in docs/sitemint-platform/IMPLEMENTATION_ROADMAP.md.
 */

export interface BusinessGoal {
  id: string;
  label: string;
  heroSupportingCopy: string;
  microcopy: string;
  ctaLabel: string;
  emphasizedStageIds: string[];
  recommendedProductIds: string[];
  recommendedServiceIds: string[];
}

export const businessGoals: BusinessGoal[] = [
  {
    id: "capture-leads",
    label: "Capture more leads",
    heroSupportingCopy:
      "Start with the front door: a website and response system built to catch every inquiry.",
    microcopy: "We'll start with your website and how inquiries reach you.",
    ctaLabel: "Start Capturing More Leads",
    emphasizedStageIds: ["arrive", "capture", "respond"],
    recommendedProductIds: ["ai-receptionist"],
    recommendedServiceIds: ["websites", "seo"],
  },
  {
    id: "respond-faster",
    label: "Respond to inquiries faster",
    heroSupportingCopy:
      "Slow follow-up is a leaky pipeline. AI-assisted response closes that gap immediately.",
    microcopy: "We'll start with how — and how fast — inquiries get a reply.",
    ctaLabel: "Speed Up Our Response Time",
    emphasizedStageIds: ["respond", "crm"],
    recommendedProductIds: ["ai-receptionist"],
    recommendedServiceIds: ["crm", "automation"],
  },
  {
    id: "organize-followup",
    label: "Stop losing leads to follow-up gaps",
    heroSupportingCopy:
      "A lead that isn't tracked is a lead that goes cold. A real CRM and automation fix that.",
    microcopy: "We'll start with your CRM and what happens after first contact.",
    ctaLabel: "Organize Our Follow-Up",
    emphasizedStageIds: ["crm", "followup", "action"],
    recommendedProductIds: ["ai-receptionist"],
    recommendedServiceIds: ["crm", "automation"],
  },
  {
    id: "see-whats-working",
    label: "See what's actually working",
    heroSupportingCopy:
      "You can't improve what you can't see. Visibility into every touchpoint comes first.",
    microcopy: "We'll start with visibility into your existing systems.",
    ctaLabel: "Get Visibility Into Our Systems",
    emphasizedStageIds: ["visible"],
    recommendedProductIds: ["ai-toolkit"],
    recommendedServiceIds: ["seo", "maintenance"],
  },
];
