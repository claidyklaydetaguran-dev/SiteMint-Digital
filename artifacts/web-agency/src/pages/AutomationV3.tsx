/**
 * Frontend V3 — Workflow Automation service page.
 * Carries the #integrations anchor referenced from navigation.
 */

import {
  Workflow,
  Repeat,
  BellRing,
  ClipboardList,
  Eye,
  Plug,
  PauseCircle,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { ServicePage, type ServicePageContent } from "@/components/v3/ServicePage";

const content: ServicePageContent = {
  eyebrow: "Workflow Automation",
  eyebrowIcon: Workflow,
  headline: "Less handoff. Less busywork. More momentum.",
  lede: "The work between the work — follow-ups, reminders, record updates, routing — is where opportunities quietly die. We automate it, with a person kept in the loop and an audit trail on every step.",
  problem: {
    title: "Your team's memory is not a workflow engine.",
    body: "Every business runs invisible processes: reply to the inquiry, update the record, chase the quote, confirm the appointment. When those live in people's heads, busy weeks break them — and nobody notices until the customer does.",
  },
  build: {
    title: "Automation for the steps people shouldn't have to remember.",
    body: "We map the handoffs that actually happen in your business and automate the mechanical ones — acknowledgments, routing, record-keeping, scheduled follow-ups — while decisions stay human.",
    points: [
      "Follow-up sequences that stop the moment a person replies",
      "Records created and updated automatically as work moves",
      "Routing rules that put the right task in front of the right person",
      "Clear pause switches and an audit trail on every automated action",
    ],
  },
  how: {
    title: "From invisible process to reliable system.",
    steps: [
      {
        title: "Map what actually happens",
        body: "Not the org chart version — the real path an inquiry, job, or renewal takes through your week, including where it stalls.",
      },
      {
        title: "Automate the mechanical steps",
        body: "Acknowledgments, reminders, record updates, and routing become system behavior instead of memory work.",
      },
      {
        title: "Keep decisions human",
        body: "Anything requiring judgment lands as a clear task with context attached — never a silent automated guess.",
      },
      {
        title: "Watch it run, then tune",
        body: "Every action is logged. We review the first weeks together and adjust what real volume teaches us.",
      },
    ],
  },
  capabilities: {
    title: "What we automate.",
    items: [
      {
        icon: Repeat,
        title: "Follow-up sequences",
        desc: "Timed, polite persistence that stops instantly when a human takes over or a reply arrives.",
      },
      {
        icon: ClipboardList,
        title: "Record-keeping",
        desc: "The system of record updates itself as work moves — no end-of-day data entry.",
      },
      {
        icon: BellRing,
        title: "Routing & tasks",
        desc: "New work reaches the right person as a task with the full context attached.",
      },
      {
        icon: Plug,
        title: "Integrations",
        desc: "Calendar, phone, email, and billing connected so information stops being retyped.",
      },
      {
        icon: Eye,
        title: "Visibility",
        desc: "A trail of what ran, when, and why — reviewable at any time.",
      },
      {
        icon: PauseCircle,
        title: "Control",
        desc: "Every workflow has an off switch that doesn't break the rest of the system.",
      },
    ],
  },
  connects: {
    title: "The connective tissue of the SiteMint system.",
    body: "Automation is what turns a website, a discovery flow, and a receptionist into one system: it carries the work between them.",
    links: [
      {
        kicker: "Sources",
        title: "Discovery Systems",
        desc: "Structured briefs are what automation routes best.",
        href: ROUTES.discoverySystems,
      },
      {
        kicker: "Sources",
        title: "AI Receptionist",
        desc: "Calls become bookings, records, and follow-ups automatically.",
        href: ROUTES.aiReceptionist,
      },
      {
        kicker: "Foundation",
        title: "Websites & Web Apps",
        desc: "The front door automation stands behind.",
        href: ROUTES.websitesApps,
      },
    ],
  },
  who: {
    title: "For operators drowning in follow-up.",
    body: "If your growth is capped by administrative follow-through rather than demand, automation is the cheapest hire you'll ever make.",
    fits: [
      "Teams losing leads to slow or forgotten follow-up",
      "Businesses double-entering data across tools",
      "Owners who are the single point of failure for routing work",
      "Operations that break every time volume spikes",
    ],
  },
  trust: {
    title: "Automation you can see and stop.",
    points: [
      {
        title: "Humans decide",
        body: "Automation handles the mechanical; judgment calls always land with a person.",
      },
      {
        title: "Auditable",
        body: "Every automated action is recorded — what ran, when, and on whose behalf.",
      },
      {
        title: "Stoppable",
        body: "Pause any workflow without collateral damage. No automation is load-bearing for safety.",
      },
      {
        title: "Consent-respecting",
        body: "Outbound sequences honor opt-outs immediately and permanently.",
      },
    ],
  },
  related: [
    {
      kicker: "In production",
      title: "SiteMint's own operations",
      desc: "Our pipeline, campaigns, and delivery run on the automation engine we build with.",
      href: ROUTES.workV3,
    },
    {
      kicker: "By phone",
      title: "AI Receptionist",
      desc: "Automation's voice-shaped sibling for the calls you can't take.",
      href: ROUTES.aiReceptionist,
    },
  ],
  cta: {
    title: "What should stop depending on memory?",
    body: "Name the follow-through that keeps slipping — we'll design the workflow that makes it automatic.",
  },
};

export default function AutomationV3() {
  return (
    <div id="integrations-scope">
      <ServicePage
        content={content}
        demo={
          <div className="v3-card v3h-demo" data-tone="ice" id="integrations">
            <div className="v3h-demo__head">
              <p className="v3h-demo__title">A week of invisible work, handled</p>
              <span className="v3m-example-note">Demonstration</span>
            </div>
            <ul className="v3h-chain">
              <li>
                <span className="v3h-chain__dot" aria-hidden="true" />
                <span>
                  <strong>Mon</strong> — 6 inquiries acknowledged within a minute
                </span>
              </li>
              <li>
                <span className="v3h-chain__dot" aria-hidden="true" />
                <span>
                  <strong>Tue</strong> — 2 quotes chased politely, 1 reply
                  received, sequence stopped
                </span>
              </li>
              <li>
                <span className="v3h-chain__dot" aria-hidden="true" />
                <span>
                  <strong>Wed</strong> — appointment confirmations sent, calendar
                  reconciled
                </span>
              </li>
              <li>
                <span className="v3h-chain__dot" aria-hidden="true" />
                <span>
                  <strong>Thu</strong> — a judgment call routed to you, context
                  attached
                </span>
              </li>
              <li>
                <span className="v3h-chain__dot" aria-hidden="true" />
                <span>
                  <strong>Fri</strong> — every record current, nothing owed to
                  memory
                </span>
              </li>
            </ul>
          </div>
        }
      />
    </div>
  );
}
