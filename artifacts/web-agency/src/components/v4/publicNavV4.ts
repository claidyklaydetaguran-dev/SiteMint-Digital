/**
 * Frontend V4/V5 — the approved public navigation model. V5 correction
 * (W-3, owner decision): the "What We Build" mega panel describes service
 * *categories* only — three cards, no AI Receptionist card — because AI
 * Receptionist already has its own outlined nav pill as a distinct product
 * entry. Duplicating it in the panel is what W-3 removes.
 *
 * Every path comes from the centralised route layer. Sign-in stays a
 * cross-application document navigation.
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

/**
 * The three service categories in the mega panel (W-3). AI Systems &
 * Automation (renamed from "Workflow Automation", W-6) folds CRM & internal
 * systems in as a section of that page rather than a fourth card — there is
 * no separate CRM route yet.
 */
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
    label: "AI Systems & Automation",
    outcome: "Never lose a follow-up",
    description:
      "Automation, CRM and internal systems, and AI-assisted workflows — connected.",
    href: ROUTES.aiSystems,
    glyph: "automation",
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

/**
 * Product-mode header actions (IA §3, L-7): on `/ai-receptionist` the shared
 * header swaps the company CTA for these three product actions. No
 * "Start a Project" on this route — the general project journey leaves the
 * page entirely, per the approved IA.
 */
export const requestBetaHrefV4 = `${ROUTES.aiReceptionist}#beta`;
export const requestBetaLabelV4 = "Request Beta Access";
export const explorePreviewHrefV4 = `${ROUTES.aiReceptionist}#preview`;
export const explorePreviewLabelV4 = "Explore the Interactive Preview";
export const productSignInLabelV4 = "Already a client? Sign in";
