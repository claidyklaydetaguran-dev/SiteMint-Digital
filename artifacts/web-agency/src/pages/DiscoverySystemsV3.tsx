/**
 * Frontend V3 — Discovery Systems service page.
 */

import {
  Search,
  ListChecks,
  GitBranch,
  FileText,
  BellRing,
  Database,
  MessageSquareText,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { ServicePage, type ServicePageContent } from "@/components/v3/ServicePage";

const content: ServicePageContent = {
  eyebrow: "Discovery Systems",
  eyebrowIcon: Search,
  headline: "Turn first contact into a useful brief.",
  lede: "A discovery system asks the right questions in the right order, adapts to the answers, and hands your team something they can price, plan, and respond to — the same day.",
  problem: {
    title: "\"Contact us\" forms produce mysteries, not opportunities.",
    body: "Name, email, message. That's what most businesses know about a new opportunity — and so the first three exchanges are spent asking questions a form should have asked. Slow first responses lose deals, and the busier you get, the slower they get.",
  },
  build: {
    title: "Structured intake that respects the visitor and arms your team.",
    body: "We design guided discovery flows that feel like a good first conversation, not a tax form — branching on what the visitor actually needs and producing a brief on the other end.",
    points: [
      "Guided multi-step flows with save-and-resume, not walls of fields",
      "Branching logic — a booking inquiry and a support request take different paths",
      "A structured brief delivered to your team, not a two-line email",
      "Instant, honest acknowledgment to the visitor about what happens next",
    ],
  },
  how: {
    title: "From click to brief.",
    steps: [
      {
        title: "Ask like an expert",
        body: "We script the questions your best salesperson would ask, in the order they'd ask them — and cut every question that doesn't change your response.",
      },
      {
        title: "Adapt to the answers",
        body: "The flow branches on need, urgency, and readiness, so nobody answers questions that don't apply to them.",
      },
      {
        title: "Produce the brief",
        body: "Answers land as a structured brief: what they need, what changes for them, what happens next.",
      },
      {
        title: "Route and follow up",
        body: "The brief reaches the right person with a follow-up already scheduled — connected to automation when you want it.",
      },
    ],
  },
  capabilities: {
    title: "What a discovery system can do.",
    items: [
      {
        icon: ListChecks,
        title: "Guided flows",
        desc: "Step-by-step intake with progress, save-and-resume, and mobile-first ergonomics.",
      },
      {
        icon: GitBranch,
        title: "Branching logic",
        desc: "Different needs take different paths — no irrelevant questions, no dead ends.",
      },
      {
        icon: FileText,
        title: "Structured briefs",
        desc: "Every submission arrives organized: need, scope, timing, urgency, context.",
      },
      {
        icon: BellRing,
        title: "Instant routing",
        desc: "The right person is notified with the full brief attached, the moment it lands.",
      },
      {
        icon: Database,
        title: "System of record",
        desc: "Submissions become records automatically — no copy-paste, no lost context.",
      },
      {
        icon: MessageSquareText,
        title: "Honest acknowledgment",
        desc: "Visitors are told exactly what happens next, and it actually happens.",
      },
    ],
  },
  connects: {
    title: "Discovery feeds everything downstream.",
    body: "The brief a discovery system produces is what automation routes, what your team acts on, and what the AI Receptionist can collect by voice when the inquiry arrives as a call instead of a click.",
    links: [
      {
        kicker: "Upstream",
        title: "Websites & Web Apps",
        desc: "Where discovery lives — the site designed around starting it.",
        href: ROUTES.websitesApps,
      },
      {
        kicker: "By phone",
        title: "AI Receptionist",
        desc: "The same discovery discipline, conducted in a phone call.",
        href: ROUTES.aiReceptionist,
      },
      {
        kicker: "Downstream",
        title: "AI Systems & Automation",
        desc: "Briefs routed, acknowledged, and followed up automatically.",
        href: ROUTES.aiSystems,
      },
    ],
  },
  who: {
    title: "For teams whose first response decides the deal.",
    body: "Discovery systems pay for themselves wherever a fast, informed first response wins the work — and a slow generic one loses it.",
    fits: [
      "Agencies and studios qualifying project inquiries",
      "Trades and services quoting from job details",
      "Professional practices doing structured intake",
      "Anyone whose inbox is the current intake system",
    ],
  },
  trust: {
    title: "Respectful by design.",
    points: [
      {
        title: "Ask only what's used",
        body: "Every question must change your response, or it gets cut. Visitors' time is part of the design budget.",
      },
      {
        title: "Clear expectations",
        body: "The flow says what happens next and when — and the system makes sure it's true.",
      },
      {
        title: "The visitor's data, handled properly",
        body: "Submissions go to your systems, for the stated purpose — not into a marketing shadow-profile.",
      },
    ],
  },
  related: [
    {
      kicker: "Try it now",
      title: "SiteMint's own discovery flow",
      desc: "The intake on this site is the product — walk through it yourself.",
      href: ROUTES.discovery,
    },
    {
      kicker: "Selected work",
      title: "Representative builds",
      desc: "How discovery fits inside complete systems we've composed.",
      href: ROUTES.workV3,
    },
  ],
  cta: {
    title: "Stop interviewing your inbox.",
    body: "Tell us what you need to know about a new inquiry — we'll design the system that finds it out.",
  },
};

export default function DiscoverySystemsV3() {
  return (
    <ServicePage
      content={content}
      demo={
        <div className="v3-card v3h-demo" data-tone="ice">
          <div className="v3h-demo__head">
            <p className="v3h-demo__title">Two-line email vs. brief</p>
            <span className="v3m-example-note">Demonstration</span>
          </div>
          <div className="v3m-receipt">
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">The old way</span>
              <span className="v3m-receipt__v">
                "Hi, how much for a website? Thanks, Sam."
              </span>
            </div>
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">The brief</span>
              <span className="v3m-receipt__v">
                Booking-led site for a three-chair clinic · replacing phone-tag
                scheduling · existing calendar to keep · ready to start within a
                month
              </span>
            </div>
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">Your first reply</span>
              <span className="v3m-receipt__v">
                Specific, informed, and sent the same day
              </span>
            </div>
          </div>
        </div>
      }
    />
  );
}
