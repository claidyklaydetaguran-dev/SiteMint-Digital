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

/** The hero copy set (L-1), kept as literals so the test can pin them. */
export const HERO_COPY = {
  pill: "Private beta — invite only",
  title: "Never let a good opportunity end at a missed call.",
  supporting:
    "SiteMint AI Receptionist is built to answer incoming calls, handle routine questions, and help callers reach the right next step using your actual business rules and availability.",
  primaryCta: "Request Beta Access",
  secondaryCta: "Explore the Interactive Preview",
  signInPrompt: "Already a client?",
  signInCta: "Sign in",
} as const;

/** L-5: the only pricing statement permitted before certification. */
export const PRICING_POSTURE = "Private-beta pricing is provided during onboarding.";

/** Where a visitor can reach us while beta requests are closed (ThankYou.tsx). */
export const CONTACT_EMAIL = "info.sitemint@gmail.com";
