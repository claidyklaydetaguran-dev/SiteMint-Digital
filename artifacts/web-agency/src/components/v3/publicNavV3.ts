/**
 * Frontend V3 — the approved public navigation model.
 *
 * One source of truth for the V3 desktop header and mobile sheet, mirroring
 * the V2 rule set: every path comes from the centralised route layer; Sign in
 * is a cross-application document navigation; the primary CTA is
 * "Start with SiteMint" → /start everywhere. The internal Operations CRM never
 * appears here.
 */

import { ROUTES, DASHBOARD_URLS } from "@/lib/routes";

export interface V3NavChild {
  label: string;
  description: string;
  href: string;
}

export interface V3NavItem {
  label: string;
  href?: string;
  children?: V3NavChild[];
}

export const servicesNavItems: V3NavChild[] = [
  {
    label: "Websites & Web Apps",
    description: "Marketing sites and custom software built around how the business runs.",
    href: ROUTES.websitesApps,
  },
  {
    label: "AI Receptionist",
    description: "Answers, understands, books, and knows when to bring in a person.",
    href: ROUTES.aiReceptionist,
  },
  {
    label: "Discovery Systems",
    description: "Turn first contact into a useful brief your team can act on.",
    href: ROUTES.discoverySystems,
  },
  {
    label: "Workflow Automation",
    description: "Less handoff, less busywork — the follow-up work handled for you.",
    href: ROUTES.automation,
  },
  {
    label: "Integrations",
    description: "Calendars, phone, billing, and the systems you already use.",
    href: `${ROUTES.automation}#integrations`,
  },
];

export const primaryNavV3: V3NavItem[] = [
  { label: "Services", children: servicesNavItems },
  { label: "Work", href: ROUTES.workV3 },
  { label: "Process", href: ROUTES.process },
  { label: "About", href: ROUTES.about },
  // R1 owner decision: Insights stays routed for internal preview but leaves
  // every public discoverability surface until the first verified article is
  // approved — see docs/frontend-v3/LAUNCH-CHECKLIST.md.
];

/** Cross-application destination — always a document navigation. */
export const signInHrefV3 = DASHBOARD_URLS.login;

export const startHrefV3 = ROUTES.start;
export const startLabelV3 = "Start with SiteMint";
