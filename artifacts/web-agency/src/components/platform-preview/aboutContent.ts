/**
 * Real, approved team content — re-expressed here in the preview's
 * data-file convention from production `src/pages/About.tsx`'s existing
 * `team` array, not fabricated for this page. Photo paths point at the
 * same already-approved assets already served from `public/`.
 *
 * `portraitPosition`/`mobilePortraitPosition` are filled in after actually
 * rendering each photo in the browser (Shasta's source is landscape,
 * 2048x1436; Claidy's and Saisa's are near-portrait, 1086x1448 — a single
 * shared object-position would crop at least one of them badly).
 */

export interface AboutTeamMember {
  name: string;
  title: string;
  photo: string;
  description: string;
  portraitPosition?: string;
  mobilePortraitPosition?: string;
}

export const aboutTeam: AboutTeamMember[] = [
  {
    name: "Claidy Taguran",
    title: "Technical Director",
    photo: "/team-claidy.png",
    description:
      "Leads technical strategy, website development, application development, CRM systems, AI integrations, database architecture, and deployment. Oversees the technical quality of every SiteMint project from planning to launch.",
    portraitPosition: "center 15%",
  },
  {
    name: "Shasta Greene",
    title: "Head of Strategy",
    photo: "/team-shasta.jpg",
    description:
      "Leads business strategy, client growth planning, digital positioning, website messaging, CRM workflow strategy, and automation planning. Helps clients turn their website into a real business growth system.",
    portraitPosition: "center 20%",
  },
  {
    name: "Saisa Lorraigne",
    title: "Project and Admin Manager",
    photo: "/team-saisa.jpg",
    description:
      "Manages project coordination, client communication, onboarding, timelines, documentation, quality control, and administrative operations to keep every project organized and moving forward.",
    portraitPosition: "center 12%",
  },
];

/**
 * "How SiteMint thinks" — concrete operating principles, synthesized per
 * owner direction from repository-supported evidence rather than either
 * pre-existing values list (preview's old 3-item aboutValues and
 * production About.tsx's 4-item values both existed for the same company
 * with no overlap beyond "Trustworthy," and neither is used verbatim here).
 * Each principle names a real working behavior; `evidence` is a code-only
 * pointer to where that behavior is demonstrated elsewhere in the repo —
 * never rendered on the page itself.
 */
export interface AboutPrinciple {
  id: string;
  title: string;
  description: string;
  evidence: string;
}

export const aboutPrinciples: AboutPrinciple[] = [
  {
    id: "workflow-first",
    title: "Understand the workflow before choosing the technology",
    description:
      "We start with how the business actually operates day to day, then decide what to build — not the other way around.",
    evidence:
      "ProcessSection.tsx 'Discover' phase (\"We start by understanding the business, not the tech stack\"); servicesDetail.ts web-apps ('built around your real workflow instead of forcing you into someone else's').",
  },
  {
    id: "connected-systems",
    title: "Build connected systems, not isolated tools",
    description:
      "A website, CRM, and automation that don't talk to each other create manual busywork. We wire them together as one system from the start.",
    evidence:
      "SiteMintDifferenceSection.tsx ('SiteMint builds it as one system from the start'); servicesDetail.ts connected-systems ('wired together as one system, so a single inquiry flows through without manual re-entry').",
  },
  {
    id: "automation-assists",
    title: "Automation assists people — it doesn't replace the relationship",
    description:
      "We automate the repetitive follow-up work so the team's time goes to real conversations, with people still deciding at every meaningful step.",
    evidence:
      "SiteMintDifferenceSection.tsx boundary step ('At every decision point — automation assists, people decide').",
  },
  {
    id: "honest-about-readiness",
    title: "Communicate scope and readiness honestly",
    description:
      "Every product and service is labeled Available, In development, or Planned — the same standard we hold to when we talk with clients about their own project's scope and price.",
    evidence:
      "capabilityStatus.ts labels used across Services/Products; pricingTiers.ts 'final price confirmed after discovery.'",
  },
  {
    id: "stage-appropriate",
    title: "Design around the business's actual stage",
    description:
      "A new business, a growing one, and an established one need different starting points — not the same package sold three ways.",
    evidence:
      "pricingTiers.ts bestFor copy varies explicitly by business stage across Starter/Growth/Premium.",
  },
];
