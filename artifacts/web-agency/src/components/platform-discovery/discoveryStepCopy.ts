/**
 * Presentation-only copy for the guided Discovery form's left rail / step
 * intro. Purely descriptive text a human wrote about why each step exists —
 * it has no bearing on validation, field names, or submission behavior.
 * Indexed identically to `STEP_LABELS` / `STEP_FIELD_PATHS`
 * (DiscoveryProgress.tsx / discoveryFormModel.ts): index 0-7 are the eight
 * answer steps (Checkpoint 2C.3 owner-directed reorganization), index 8 is
 * the review step.
 */

export const STEP_WHY_COPY: readonly string[] = [
  // 0 — Project Starting Point
  "Whether you're starting from scratch or working from something that already exists changes how we scope everything after this.",
  // 1 — System or Service Needed
  "This tells us which kind of system to design for — a marketing site, a portal, or something more complex — so every question after this one is scoped correctly.",
  // 2 — Business and Audience
  "Knowing your business, who it serves, and what success looks like lets us shape the site's structure, tone, and features around real outcomes — not just a feature list.",
  // 3 — Brand and Visual Direction
  "Styles, colors, and sites you like (or don't) give us a visual starting point instead of guessing at your taste.",
  // 4 — Content and Functionality
  "Selecting pages and features now, and telling us what content is ready, lets us scope the build accurately and price it fairly.",
  // 5 — Systems and Integrations
  "What you're already using — a CRM, email tool, scheduling software — determines what needs to connect versus what needs to be replaced.",
  // 6 — Growth, Advertising, and Tracking
  "If you're interested in ongoing advertising support, this tells us enough to scope that separately — it's never required to move forward with the build.",
  // 7 — Delivery, Budget, and Contact
  "Your timeline, budget, and who's involved in the decision shape the proposal we prepare — and this is how we reach you with it.",
  // 8 — Review
  "One last look before anything is sent. Nothing reaches SiteMint until you press submit.",
] as const;
