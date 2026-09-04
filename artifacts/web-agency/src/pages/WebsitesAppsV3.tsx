/**
 * Frontend V3 — Websites & Web Apps service page.
 */

import {
  Globe,
  LayoutTemplate,
  AppWindow,
  Gauge,
  Accessibility,
  Link2,
  PenTool,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { ServicePage, type ServicePageContent } from "@/components/v3/ServicePage";

const content: ServicePageContent = {
  eyebrow: "Websites & Web Apps",
  eyebrowIcon: Globe,
  headline: "A website that knows what happens next.",
  lede: "Most sites end at the contact form. Ours are the front door of a working system: they capture the inquiry, qualify it, route it, and make sure a real person follows up.",
  problem: {
    title: "A pretty site that goes nowhere is a dead end with good lighting.",
    body: "Businesses pay for redesigns that change the paint but not the plumbing. Visitors still land on a generic form, the inquiry still arrives as a two-line email, and follow-up still depends on whoever checks the inbox. The problem was never the design — it was that the site had no idea what should happen after the click.",
  },
  build: {
    title: "Sites and applications designed backwards from the outcome.",
    body: "We start from the action a real customer should complete — book, inquire, order, apply — and build the site, and any custom application behind it, around that path.",
    points: [
      "Marketing sites with editorial-grade design and real conversion paths",
      "Custom web applications for booking, intake, portals, and internal tools",
      "Structured inquiry capture wired into your records from day one",
      "Performance and accessibility as defaults, not add-ons",
    ],
  },
  how: {
    title: "From first visit to finished system.",
    steps: [
      {
        title: "Map the customer's path",
        body: "We chart what a visitor needs at each moment — and what your team needs to know the moment they act.",
      },
      {
        title: "Design the pages that matter",
        body: "Editorial layouts, honest copy, and one clear action per page. No template grids, no filler sections.",
      },
      {
        title: "Build the system behind it",
        body: "Forms become structured intake; intake becomes records; records trigger follow-up. The site is the visible tip of a working pipeline.",
      },
      {
        title: "Launch, measure, refine",
        body: "We watch real traffic together and tune the pages real visitors actually use.",
      },
    ],
  },
  capabilities: {
    title: "What ships with a SiteMint build.",
    items: [
      {
        icon: LayoutTemplate,
        title: "Editorial design system",
        desc: "A typographic system tuned to your brand — consistent from homepage to invoice footer.",
      },
      {
        icon: AppWindow,
        title: "Custom applications",
        desc: "Portals, dashboards, booking flows, and internal tools built on the same foundation as the site.",
      },
      {
        icon: Gauge,
        title: "Performance discipline",
        desc: "Fast first paint, no layout shift, media that respects the visitor's connection.",
      },
      {
        icon: Accessibility,
        title: "Accessibility by default",
        desc: "Keyboard, screen reader, contrast, and reduced-motion support built in, not bolted on.",
      },
      {
        icon: Link2,
        title: "Connected from day one",
        desc: "Calendar, records, notifications — the site talks to the systems you already run.",
      },
      {
        icon: PenTool,
        title: "Content you can keep",
        desc: "Clear structure and honest copy your team can extend without calling an agency.",
      },
    ],
  },
  connects: {
    title: "The front door of the SiteMint system.",
    body: "A SiteMint site hands visitors to Discovery, Discovery hands briefs to Automation, and the AI Receptionist covers the hours the site can't.",
    links: [
      {
        kicker: "Next in the system",
        title: "Discovery Systems",
        desc: "Turn the site's inquiries into briefs your team can act on.",
        href: ROUTES.discoverySystems,
      },
      {
        kicker: "Around the clock",
        title: "AI Receptionist",
        desc: "The phone-side companion to your website's front door.",
        href: ROUTES.aiReceptionist,
      },
      {
        kicker: "Behind the scenes",
        title: "AI Systems & Automation",
        desc: "Everything that should happen after the click, handled.",
        href: ROUTES.aiSystems,
      },
    ],
  },
  who: {
    title: "For businesses where an inquiry is worth real money.",
    body: "If a missed inquiry costs you a job, a patient, a client, or a booking, your website should be doing more than looking presentable.",
    fits: [
      "Service businesses that live on inbound inquiries",
      "Teams replacing a template site that never produced leads",
      "Operators who need a portal or internal tool, not just pages",
      "Businesses tired of retyping the same customer details three times",
    ],
  },
  trust: {
    title: "Built to be owned, not rented.",
    points: [
      {
        title: "Your system",
        body: "You own the site, the content, and the data it collects. No hostage platforms.",
      },
      {
        title: "No dark patterns",
        body: "We don't ship popup walls, fake countdowns, or consent tricks. Conversion comes from clarity.",
      },
      {
        title: "Privacy-minded capture",
        body: "Forms collect what the follow-up needs — not everything we could get away with.",
      },
    ],
  },
  related: [
    {
      kicker: "Live on this site",
      title: "The SiteMint discovery flow",
      desc: "This site practices what this page preaches — try the intake yourself.",
      href: ROUTES.discovery,
    },
    {
      kicker: "Selected work",
      title: "Representative builds",
      desc: "Capability examples, labelled honestly for what they are.",
      href: ROUTES.workV3,
    },
  ],
  cta: {
    title: "Your next site should earn its keep.",
    body: "Tell us what the site needs to produce — we'll tell you what it takes to get there.",
  },
};

export default function WebsitesAppsV3() {
  return (
    <ServicePage
      content={content}
      demo={
        <div className="v3-card v3h-demo" data-tone="ice">
          <div className="v3h-demo__head">
            <p className="v3h-demo__title">Anatomy of a SiteMint page</p>
            <span className="v3m-example-note">Demonstration</span>
          </div>
          <div className="v3m-receipt">
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">Above the fold</span>
              <span className="v3m-receipt__v">
                One promise, one action, zero sliders
              </span>
            </div>
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">The middle</span>
              <span className="v3m-receipt__v">
                Proof and specifics — how it works, what it costs to ignore
              </span>
            </div>
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">The action</span>
              <span className="v3m-receipt__v">
                Structured intake that starts the real conversation
              </span>
            </div>
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">After the click</span>
              <span className="v3m-receipt__v">
                Record created, team notified, follow-up scheduled
              </span>
            </div>
          </div>
        </div>
      }
    />
  );
}
