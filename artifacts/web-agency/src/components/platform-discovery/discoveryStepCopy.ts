/**
 * Presentation-only copy for the guided Discovery form's left rail / step
 * intro. Purely descriptive text a human wrote about why each step exists —
 * it has no bearing on validation, field names, or submission behavior.
 * Indexed identically to `STEP_LABELS` / `STEP_FIELD_PATHS`
 * (DiscoveryProgress.tsx / discoveryFormModel.ts): index 0-6 are the seven
 * answer steps, index 7 is the review step.
 */

export const STEP_WHY_COPY: readonly string[] = [
  // 0 — Project Direction
  "This tells us which kind of system to design for — a marketing site, a portal, or something more complex — so every question after this one is scoped correctly.",
  // 1 — Business and Audience
  "Knowing your business and who it serves lets us shape the site's structure, tone, and features around the people who'll actually use it.",
  // 2 — Current Situation and Goals
  "The problem you're solving and what success looks like are what we design toward — not just a feature list, but what the project needs to change.",
  // 3 — Features and Project Scope
  "Selecting features now lets us scope the build accurately and price it fairly, instead of guessing and adjusting later.",
  // 4 — Content, Design, and Technical Readiness
  "What you already have — content, brand assets, hosting — determines how much of the work can start immediately versus needs to be built from scratch.",
  // 5 — Timeline, Investment, and Decision Process
  "Your timeline and budget shape the proposal we prepare, and knowing who's involved in the decision helps us route it to the right person.",
  // 6 — Contact and Consent
  "This is how we reach you with your proposal — and the only step where we ask for your permission to do it.",
  // 7 — Review
  "One last look before anything is sent. Nothing reaches SiteMint until you press submit.",
] as const;
