import {
  Bot,
  Building2,
  Code2,
  LayoutTemplate,
  LineChart,
  Phone,
  Search,
  Wrench,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { CapabilityLevel } from "./capabilityStatus";

/**
 * Explicit, maintainable category model for the dedicated Services page
 * (Phase 2 of the platform-preview inner-page redesign) — deliberately NOT
 * derived from `relatedIds` below, which are cross-links between services,
 * not a taxonomy, and would produce a fragile grouping that breaks the
 * moment a relatedIds list changes for an unrelated reason. Each service's
 * category is assigned here by reading its own `problem`/`build` copy:
 * - "presence": describes the marketing-site surface itself and its upkeep
 * - "systems": describes custom software built around a workflow
 * - "automation": describes tying tools/communications together
 */
export type ServiceCategory = "presence" | "systems" | "automation";

export const serviceCategoryLabels: Record<ServiceCategory, string> = {
  presence: "Digital Presence",
  systems: "Systems & Software",
  automation: "Automation & Connection",
};

export const serviceCategoryIntros: Record<ServiceCategory, string> = {
  presence: "The surface people meet first — built to load fast, read as credible, and keep getting found.",
  systems: "Software shaped around how your business actually operates, not a generic template.",
  automation: "The connective tissue that keeps leads moving instead of sitting in an inbox.",
};

export interface ServiceDetail {
  id: string;
  name: string;
  icon: LucideIcon;
  category: ServiceCategory;
  problem: string;
  build: string;
  bestFor: string;
  outcomes: string[];
  relatedIds: string[];
  capability: CapabilityLevel;
}

/**
 * Full service catalog for the dedicated Services page — extends
 * ServicesSection.tsx's homepage-teaser copy (same problem statements,
 * same service names/ids) with the deeper problem/build/best-for/outcomes
 * breakdown the homepage summary doesn't have room for. No capability is
 * claimed beyond what capabilityStatus.ts / systemFlow.ts already verify
 * elsewhere in this preview.
 */
export const servicesDetail: ServiceDetail[] = [
  {
    id: "websites",
    name: "Websites",
    icon: LayoutTemplate,
    category: "presence",
    problem: "Businesses that look outdated online lose trust before a call ever happens.",
    build: "A responsive, conversion-focused marketing website on a shared, premium design system — built to load fast and read as credible on any device.",
    bestFor: "Any business that needs a trustworthy digital front door, from a first launch to a full redesign.",
    outcomes: ["A site your team can maintain", "A clear path from visitor to inquiry", "SEO-ready foundations from day one"],
    relatedIds: ["seo", "maintenance"],
    capability: "available",
  },
  {
    id: "web-apps",
    name: "Web Applications",
    icon: Code2,
    category: "systems",
    problem: "Off-the-shelf software rarely fits how a business actually operates.",
    build: "Custom software — booking flows, internal tools, client-facing features — built around your real workflow instead of forcing you into someone else's.",
    bestFor: "Businesses whose day-to-day process needs its own tool, not a generic one.",
    outcomes: ["Software shaped to your process", "Fewer manual workarounds", "A system your team actually adopts"],
    relatedIds: ["automation", "crm"],
    capability: "available",
  },
  {
    id: "crm",
    name: "CRM Systems",
    icon: Bot,
    category: "systems",
    problem: "Leads scattered across inboxes and spreadsheets go cold.",
    build: "A structured CRM implementation so every lead has an owner, a status, and a next step — configured for your pipeline, not a generic template.",
    bestFor: "Businesses generating leads but losing track of follow-up.",
    outcomes: ["Every lead visible in one place", "Clear ownership and next steps", "A pipeline you can actually report on"],
    relatedIds: ["automation", "websites"],
    capability: "available",
  },
  {
    id: "customer-portals",
    name: "Customer Portals",
    icon: Building2,
    category: "systems",
    problem: "Clients chasing status updates by phone or email eat up staff time.",
    build: "A secure, branded portal where clients can see project status, documents, or account details without a phone call.",
    bestFor: "Service businesses with clients who need ongoing visibility into an account, project, or case.",
    outcomes: ["Fewer status-update calls", "A branded, professional client experience", "Information available on the client's schedule"],
    relatedIds: ["web-apps", "crm"],
    capability: "in-development",
  },
  {
    id: "automation",
    name: "Business Automation",
    icon: Workflow,
    category: "automation",
    problem: "Manual follow-up and repetitive admin work eat time that should go to customers.",
    build: "Automated follow-up sequences and connected workflows so routine steps happen without someone remembering to do them.",
    bestFor: "Teams doing the same manual follow-up steps for every lead or client.",
    outcomes: ["Follow-up that doesn't depend on memory", "More staff time for real conversations", "Fewer dropped handoffs"],
    relatedIds: ["crm", "ai-receptionist"],
    capability: "in-development",
  },
  {
    id: "ai-receptionist",
    name: "AI Receptionist",
    icon: Phone,
    category: "automation",
    problem: "Missed calls and slow follow-up cost businesses real leads.",
    build: "An AI-powered receptionist that answers and qualifies every inbound text, day or night, so no inquiry goes unanswered.",
    bestFor: "Businesses that lose leads to slow response time, especially after hours.",
    outcomes: ["Every inbound message gets a response", "Qualified details captured automatically", "Fewer missed after-hours inquiries"],
    relatedIds: ["crm", "automation"],
    capability: "available",
  },
  {
    id: "seo",
    name: "SEO & AI Search Visibility",
    icon: Search,
    category: "presence",
    problem: "A site that isn't found — by search engines or AI answer tools — doesn't generate leads.",
    build: "Technical and local SEO foundations built into every page, plus structured content that's easier for both search engines and AI systems to understand.",
    bestFor: "Any business that wants to be found by the right people, not just have a website.",
    outcomes: ["A technically sound SEO foundation", "Structured, machine-readable content", "A site built to be found, not just to exist"],
    relatedIds: ["websites", "maintenance"],
    capability: "available",
  },
  {
    id: "maintenance",
    name: "Maintenance & Support",
    icon: LineChart,
    category: "presence",
    problem: "Sites and systems that aren't maintained slowly break or fall behind.",
    build: "Ongoing care — security updates, monitoring, and priority fixes — so your website and systems keep working long after launch.",
    bestFor: "Anyone who wants a long-term technical partner, not a one-off vendor.",
    outcomes: ["Fewer surprises after launch", "Faster fixes when something breaks", "A system that stays current"],
    relatedIds: ["websites", "web-apps"],
    capability: "available",
  },
  {
    id: "connected-systems",
    name: "Connected Business Systems",
    icon: Wrench,
    category: "automation",
    problem: "Website, CRM, and communication tools that don't talk to each other create manual busywork and dropped leads.",
    build: "Website, CRM, automation, and AI Receptionist wired together as one system, so a single inquiry flows through without manual re-entry.",
    bestFor: "Businesses ready to move from disconnected tools to one connected system.",
    outcomes: ["One system instead of six disconnected tools", "Less manual re-entry between tools", "A clearer view of the full customer journey"],
    relatedIds: ["crm", "automation", "ai-receptionist"],
    capability: "in-development",
  },
];
