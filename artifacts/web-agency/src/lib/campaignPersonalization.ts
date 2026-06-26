// ── Campaign Personalization Engine ──────────────────────────────────────────
// Rule-based email personalization powered by DISC behavioral profiles.
// Zero AI. Zero LLM. Every transformation is transparent and auditable.
// Used by the Campaign Builder to preview and test DISC-personalized emails.

import type { DiscStyle, CommunicationStyle } from "./discEngine";

// ── Output Types ──────────────────────────────────────────────────────────────

export interface PersonalizedEmail {
  subject: string;
  body: string;
  style: DiscStyle;
  tone: CommunicationStyle["tone"];
  explanation: string;
  changes: string[];
}

export interface DiscVariants {
  Driver: PersonalizedEmail;
  Expressive: PersonalizedEmail;
  Amiable: PersonalizedEmail;
  Analytical: PersonalizedEmail;
}

export interface PreviewResult {
  original: { subject: string; body: string };
  personalized: PersonalizedEmail;
  diffSummary: string;
}

// ── Style Templates ───────────────────────────────────────────────────────────
// Each DISC style defines:
//   greeting   — opening line after "Hi [Name],"
//   cta        — closing call-to-action line
//   closing    — sign-off
//   subjectFn  — how to transform the subject
//   bodyIntro  — inserted before the base body (empty = no intro)

interface StyleTemplate {
  greeting: string;
  cta: string;
  closing: string;
  subjectFn: (s: string) => string;
  bodyIntro: string;
  tone: CommunicationStyle["tone"];
  explanation: string;
  changes: string[];
}

const STYLE_TEMPLATES: Record<DiscStyle, StyleTemplate> = {
  Driver: {
    greeting: "",
    cta: "Ready to move forward? Let's talk — I'll keep it brief.",
    closing: "– SiteMint Team",
    subjectFn: (s: string) => s.length > 65 ? s.slice(0, 62).replace(/\s+\S*$/, "") + "..." : s,
    bodyIntro: "",
    tone: "Active",
    explanation: "Adjusted for Driver style: direct opening, outcome-focused CTA, minimal length. No filler language.",
    changes: [
      "Subject trimmed to essential wording",
      "Greeting kept brief — no small talk",
      "CTA is direct and action-first",
      "Sign-off is concise and professional",
    ],
  },
  Analytical: {
    greeting: "I wanted to provide you with all the relevant details on this opportunity.",
    cta: "Take your time to review the information above. I'm happy to answer any questions or provide additional data.",
    closing: "Best regards,\n– SiteMint Team",
    subjectFn: (s: string) => `Details: ${s}`,
    bodyIntro: "",
    tone: "Analytical",
    explanation: "Adjusted for Analytical style: full detail preserved, logical structure, evidence-based CTA inviting questions.",
    changes: [
      "Subject prefixed with 'Details:' to signal thoroughness",
      "Warm-up sentence sets a data-focused tone",
      "CTA invites questions and review rather than immediate action",
      "Professional sign-off with full name",
    ],
  },
  Amiable: {
    greeting: "I hope you're having a wonderful week!",
    cta: "Whenever you're ready, I'm here — absolutely no pressure. I'd love to help when the time feels right.",
    closing: "Warmly,\n– SiteMint Team",
    subjectFn: (s: string) => s,
    bodyIntro: "",
    tone: "Warm",
    explanation: "Adjusted for Amiable style: warm greeting, relationship-building language, gentle no-pressure CTA.",
    changes: [
      "Subject unchanged — familiar tone doesn't require modification",
      "Added warm personal greeting",
      "CTA softened to remove pressure",
      "Sign-off is warm and personal",
    ],
  },
  Expressive: {
    greeting: "I have some exciting news I just had to share with you! 🎉",
    cta: "I can't wait to show you what we can build together — let's make something amazing happen! 🚀",
    closing: "Excited to work with you!\n– SiteMint Team",
    subjectFn: (s: string) => `🚀 ${s}`,
    bodyIntro: "",
    tone: "Enthusiastic",
    explanation: "Adjusted for Expressive style: energetic opener, vision-focused language, inspiring CTA with enthusiasm.",
    changes: [
      "Subject prefixed with 🚀 emoji to signal excitement",
      "Enthusiastic opening hooks the reader's attention",
      "CTA is inspiring and vision-focused",
      "Sign-off matches the energy and enthusiasm",
    ],
  },
};

// ── Helper: extract first name ────────────────────────────────────────────────

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

// ── Core personalization function ─────────────────────────────────────────────

export function personalizeCampaignEmail(
  subject: string,
  body: string,
  leadName: string,
  discStyle: DiscStyle,
): PersonalizedEmail {
  const tmpl = STYLE_TEMPLATES[discStyle];
  const name = firstName(leadName);

  const personalizedSubject = tmpl.subjectFn(subject);

  // Build body: greeting + optional intro + base body + CTA + closing
  const parts: string[] = [];

  if (tmpl.greeting) {
    parts.push(`Hi ${name},\n\n${tmpl.greeting}`);
  } else {
    parts.push(`Hi ${name},`);
  }

  if (body.trim()) {
    parts.push(body.trim());
  }

  parts.push(tmpl.cta);
  parts.push(tmpl.closing);

  const personalizedBody = parts.join("\n\n");

  return {
    subject: personalizedSubject,
    body: personalizedBody,
    style: discStyle,
    tone: tmpl.tone,
    explanation: tmpl.explanation,
    changes: tmpl.changes,
  };
}

// ── Create all 4 DISC variants at once ───────────────────────────────────────

export function createDiscVariants(
  subject: string,
  body: string,
  leadName: string,
): DiscVariants {
  return {
    Driver:     personalizeCampaignEmail(subject, body, leadName, "Driver"),
    Expressive: personalizeCampaignEmail(subject, body, leadName, "Expressive"),
    Amiable:    personalizeCampaignEmail(subject, body, leadName, "Amiable"),
    Analytical: personalizeCampaignEmail(subject, body, leadName, "Analytical"),
  };
}

// ── Preview helper: original vs personalized side-by-side ────────────────────

export function previewPersonalizedEmail(
  subject: string,
  body: string,
  leadName: string,
  discStyle: DiscStyle,
): PreviewResult {
  const name = firstName(leadName);
  const personalized = personalizeCampaignEmail(subject, body, leadName, discStyle);

  // Build a plain original for comparison (no DISC wrapper)
  const originalBody = `Hi ${name},\n\n${body.trim()}\n\n– SiteMint Team`;

  const diffSummary = personalized.explanation;

  return {
    original: { subject, body: originalBody },
    personalized,
    diffSummary,
  };
}
