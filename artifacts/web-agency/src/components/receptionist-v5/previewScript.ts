/**
 * AI Receptionist V5 — the Interactive Preview script.
 *
 * The "call theater" (V5-BLUEPRINT §8, §10 mode 1) is a zero-marginal-cost,
 * client-only simulation: a visitor picks a topic chip, and a small
 * deterministic script plays back through the same voice-object states a
 * real conversation would move through. There is no provider call, no
 * network request, and no randomness beyond which branch the visitor
 * selected — every list below always plays back identically.
 *
 * Seven curated branches (OWNER-REVIEW-WORKBOOK L-9 / V5-BLUEPRINT §8):
 * about SiteMint, services, the receptionist, how setup works, supported
 * workflows, private-beta access, next step.
 *
 * This module has no imports, so it stays trivially portable into a plain
 * `tsx` test process (same reasoning as `sections.ts`).
 */

/** The voice-object animation state — the same five states a live call would move through. */
export type VoiceState = "ready" | "listening" | "thinking" | "speaking" | "ended";

export interface PreviewLine {
  who: "You" | "Assistant" | "System";
  text: string;
}

export interface PreviewStep {
  afterMs: number;
  state?: VoiceState;
  line?: PreviewLine;
}

export interface PreviewBranch {
  id: string;
  /** The typed chip shown for the visitor's turn. */
  chipLabel: string;
  steps: PreviewStep[];
  ending: string;
}

export const PREVIEW_BRANCHES: PreviewBranch[] = [
  {
    id: "about-sitemint",
    chipLabel: "Tell me about SiteMint",
    steps: [
      { afterMs: 900, line: { who: "You", text: "Tell me about SiteMint." } },
      { afterMs: 1900, state: "thinking" },
      {
        afterMs: 2900,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "SiteMint Digital builds the systems a business runs on — websites, CRM, and AI automation designed to work together. The AI Receptionist is one product in that system: it answers calls using a business's own rules and availability.",
        },
      },
    ],
    ending: "Preview ended — topic: About SiteMint.",
  },
  {
    id: "services",
    chipLabel: "What does SiteMint build?",
    steps: [
      { afterMs: 900, line: { who: "You", text: "What does SiteMint build?" } },
      { afterMs: 1900, state: "thinking" },
      {
        afterMs: 2900,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "Websites and web applications, discovery and lead-capture systems, CRM and internal operations tools, and AI systems and automation. The AI Receptionist sits inside that last category, built specifically to handle incoming calls.",
        },
      },
    ],
    ending: "Preview ended — topic: What SiteMint builds.",
  },
  {
    id: "the-receptionist",
    chipLabel: "What does the AI Receptionist do?",
    steps: [
      { afterMs: 900, line: { who: "You", text: "What does the AI Receptionist do?" } },
      { afterMs: 1900, state: "thinking" },
      {
        afterMs: 2900,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "It answers incoming calls, handles routine questions, and helps callers reach the right next step — using the business's own rules and availability, not a generic script.",
        },
      },
    ],
    ending: "Preview ended — topic: What the receptionist does.",
  },
  {
    id: "how-setup-works",
    chipLabel: "How does setup work?",
    steps: [
      { afterMs: 900, line: { who: "You", text: "How does setup work?" } },
      { afterMs: 1900, state: "thinking" },
      {
        afterMs: 2900,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "A business owner describes their business, configures the receptionist's voice and permitted actions, sets availability and connects their calendar, tests and approves the experience, then activates their assigned number.",
        },
      },
    ],
    ending: "Preview ended — topic: How setup works.",
  },
  {
    id: "supported-workflows",
    chipLabel: "What can it handle?",
    steps: [
      { afterMs: 900, line: { who: "You", text: "What can it handle?" } },
      { afterMs: 1900, state: "thinking" },
      {
        afterMs: 2900,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "Availability checks, appointment requests, and the approve, reschedule, and cancel steps that follow — certified on staging today, with the customer-facing controls arriving in the private beta.",
        },
      },
    ],
    ending: "Preview ended — topic: Supported workflows.",
  },
  {
    id: "private-beta-access",
    chipLabel: "How do I get access?",
    steps: [
      { afterMs: 900, line: { who: "You", text: "How do I get access?" } },
      { afterMs: 1900, state: "thinking" },
      {
        afterMs: 2900,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "The AI Receptionist is invite-only during private beta. Requesting access takes a minute, and the SiteMint team follows up directly to walk through onboarding.",
        },
      },
    ],
    ending: "Preview ended — topic: Private-beta access.",
  },
  {
    id: "next-step",
    chipLabel: "What's the next step?",
    steps: [
      { afterMs: 900, line: { who: "You", text: "What's the next step?" } },
      { afterMs: 1900, state: "thinking" },
      {
        afterMs: 2900,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "Requesting beta access is the fastest path in. If you'd rather look around first, the sections below cover exactly what's available now versus what's still in development.",
        },
      },
    ],
    ending: "Preview ended — topic: Next step.",
  },
];

export const PREVIEW_STATE_LABEL: Record<VoiceState, string> = {
  ready: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  ended: "Preview ended",
};
