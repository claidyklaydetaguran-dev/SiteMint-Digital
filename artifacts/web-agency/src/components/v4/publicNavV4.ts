/**
 * Frontend V4 — the approved Signal navigation model (owner decision, V4.1
 * correction pass): What We Build · Work · Process · Company ·
 * AI Receptionist (product entry) · Client Sign In (quiet utility) ·
 * Start a Project (single CTA).
 *
 * Every path comes from the centralised route layer. The four What We Build
 * destinations are the four committed service pages — no invented services.
 * Sign-in stays a cross-application document navigation.
 */

import { ROUTES, DASHBOARD_URLS } from "@/lib/routes";

export type V4Glyph = "site" | "discovery" | "automation" | "voice";

export interface V4PanelItem {
  label: string;
  /** Outcome-first kicker, mono uppercase. */
  outcome: string;
  description: string;
  href: string;
  glyph: V4Glyph;
}

export const whatWeBuildV4: V4PanelItem[] = [
  {
    label: "Websites & Web Apps",
    outcome: "Turn visits into inquiries",
    description:
      "Marketing sites and custom software built around how the business runs.",
    href: ROUTES.websitesApps,
    glyph: "site",
  },
  {
    label: "Discovery Systems",
    outcome: "Capture every inquiry usefully",
    description: "Turn first contact into a brief your team can act on.",
    href: ROUTES.discoverySystems,
    glyph: "discovery",
  },
  {
    label: "Workflow Automation",
    outcome: "Never lose a follow-up",
    description: "Less handoff, less busywork — follow-up handled on time.",
    href: ROUTES.automation,
    glyph: "automation",
  },
  {
    label: "AI Receptionist",
    outcome: "Help every caller",
    description:
      "Designed to answer, qualify, and guide callers to the next right step.",
    href: ROUTES.aiReceptionist,
    glyph: "voice",
  },
];

export interface V4NavLink {
  label: string;
  href: string;
}

export const primaryNavV4: V4NavLink[] = [
  { label: "Work", href: ROUTES.workV3 },
  { label: "Process", href: ROUTES.process },
  { label: "Company", href: ROUTES.about },
];

/** Distinct product entry — outlined pill with the live signal dot. */
export const productNavV4: V4NavLink = {
  label: "AI Receptionist",
  href: ROUTES.aiReceptionist,
};

/** Cross-application destination — always a document navigation. */
export const signInHrefV4 = DASHBOARD_URLS.login;
export const signInLabelV4 = "Client Sign In";

export const startHrefV4 = ROUTES.start;
export const startLabelV4 = "Start a Project";
