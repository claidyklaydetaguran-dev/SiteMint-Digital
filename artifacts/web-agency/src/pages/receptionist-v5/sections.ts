/**
 * AI Receptionist V5 — the anchored section registry.
 *
 * Seventeen sections in the owner-approved order (OWNER-REVIEW-WORKBOOK L-8,
 * V5-BLUEPRINT §8). The page renders exactly these ids in exactly this order;
 * the contract test reads the same array so the two cannot drift apart.
 *
 * No imports, so a plain `tsx` test process can load it without path-alias
 * resolution.
 */

export const RECEPTIONIST_V5_SECTIONS = [
  { id: "hero", label: "Overview" },
  { id: "preview", label: "Interactive preview" },
  { id: "try", label: "Try the AI" },
  { id: "what-it-does", label: "What it does" },
  { id: "scheduling", label: "Appointments and calendar" },
  { id: "examples", label: "Caller examples" },
  { id: "dashboard", label: "Owner dashboard" },
  { id: "configuration", label: "Voice and prompt" },
  { id: "outcomes", label: "Calls, contacts, outcomes" },
  { id: "safe-failure", label: "Safe failure" },
  { id: "privacy", label: "Privacy and retention" },
  { id: "use-cases", label: "Built for different businesses" },
  { id: "setup", label: "Setup process" },
  { id: "beta-posture", label: "Private beta" },
  { id: "faq", label: "FAQ" },
  { id: "beta", label: "Request Beta Access" },
  { id: "sign-in", label: "Existing clients" },
] as const;

export type ReceptionistV5SectionId = (typeof RECEPTIONIST_V5_SECTIONS)[number]["id"];

/** The exact privacy sentence approved in OWNER-REVIEW-WORKBOOK L-6. */
export const PRIVACY_STATEMENT =
  "SiteMint does not retain call audio or full transcripts. The dashboard stores only the operational call details and outcomes needed to manage the receptionist.";

/** The visible label on the simulated theater (L-1). */
export const PREVIEW_LABEL =
  "Interactive product preview — simulated. No live call is taking place.";

/**
 * The hero copy set, kept as literals so the contract test can pin them
 * verbatim. Superseded 2026-09-05 (owner directive: full-screen hero
 * redesign) — `eyebrow`/`betaStatus`/`primaryCta`/`secondaryCta` replace the
 * retired `pill` field; `primaryCta` and `secondaryCta` also SWAPPED which
 * action is visually primary (filled) vs. secondary (outline): the
 * Interactive Preview is now the filled, primary action and Request Beta
 * Access is the outline, secondary one. See `AiReceptionistV5.tsx`'s hero
 * section for the anchor wiring.
 */
export const HERO_COPY = {
  /** Small caps label opening the hero's reveal sequence. */
  eyebrow: "SiteMint AI Receptionist",
  /** Product-status badge. Honest about the two separate states (owner
   * directive 2026-09-11 §5): an account can exist before calling is
   * activated, so the badge claims early access — never a working phone
   * line out of the box. */
  betaStatus: "Early access",
  /* Business-first outcome (owner directive 2026-09-08). */
  title: "Help every caller, even when your team is busy.",
  supporting:
    "It answers routine calls with your approved business information, collects the caller's details and why they're calling, helps schedule where you've set that up, and sends you a useful summary.",
  /** Filled/primary action — anchors to the Interactive Preview section. */
  primaryCta: "Explore the Interactive Preview",
  /** Outline/secondary action — the working account journey (2026-09-11 §5).
   * The beta-request section remains on the page as a secondary contact
   * path, and the signup page itself falls back to it while registration
   * is closed (503). */
  secondaryCta: "Create Account",
  signInPrompt: "Already a client?",
  signInCta: "Sign in",
} as const;

/** L-5: the only pricing statement permitted before certification. */
export const PRICING_POSTURE = "Private-beta pricing is provided during onboarding.";

/** Where a visitor can reach us while beta requests are closed (ThankYou.tsx). */
export const CONTACT_EMAIL = "info.sitemint@gmail.com";
