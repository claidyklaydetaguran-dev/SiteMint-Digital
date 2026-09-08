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

export type V4Glyph = "site" | "discovery" | "automation" | "voice" | "crm" | "growth";

export interface V4PanelItem {
  label: string;
  /** Outcome-first kicker, mono uppercase. */
  outcome: string;
  description: string;
  href: string;
  glyph: V4Glyph;
}

/**
 * The five service categories in the mega panel (owner responsive-first
 * directive, 2026-09-06 — supersedes W-3's three-card panel): CRM & Internal
 * Systems and SEO, Analytics & Growth become first-class entries, and the
 * AI Receptionist product appears here as well as in its nav pill so the
 * dropdown is a complete map of what SiteMint builds. Every href is a
 * completed destination (routes or real section anchors — no placeholders).
 */
/* Business-owner communication redesign (owner directive 2026-09-08): the
 * panel leads with what improves in the business; the delivery vocabulary
 * moves into descriptions written for an owner, not a developer. */
export const whatWeBuildV4: V4PanelItem[] = [
  {
    label: "Websites & Web Apps",
    outcome: "Turn attention into action",
    description:
      "A website that wins customers, plus custom tools shaped to how your business runs.",
    href: ROUTES.websitesApps,
    glyph: "site",
  },
  {
    label: "Business Systems",
    outcome: "Keep everything in one place",
    description:
      "Customer details, tasks, and follow-up organized where the whole team can see them.",
    href: "/#crm-systems",
    glyph: "crm",
  },
  {
    label: "AI & Automation",
    outcome: "Less repetitive work",
    description:
      "Routine work handled automatically — reminders, follow-ups, and busywork off your plate.",
    href: ROUTES.aiSystems,
    glyph: "automation",
  },
  {
    label: "AI Receptionist",
    outcome: "Help every caller",
    description:
      "Answers routine calls, collects details, and sends you a useful summary. Private beta.",
    href: ROUTES.aiReceptionist,
    glyph: "voice",
  },
  {
    label: "Growth & Advertising",
    outcome: "Know what's working",
    description:
      "See which marketing brings customers, and put your budget where it earns.",
    href: `${ROUTES.services}#growth-infrastructure`,
    glyph: "growth",
  },
];

export interface V4NavLink {
  label: string;
  href: string;
}

/* Audience-oriented labels (owner directive 2026-09-08): Our Work /
 * How It Works / About read like a business, not a build system. */
export const primaryNavV4: V4NavLink[] = [
  { label: "Our Work", href: ROUTES.workV3 },
  { label: "How It Works", href: ROUTES.process },
  { label: "About", href: ROUTES.about },
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
