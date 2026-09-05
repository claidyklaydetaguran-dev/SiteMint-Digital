/**
 * Frontend V5 — AI Systems & Automation service page (W-6, renamed from
 * "Workflow Automation"). Evolved from `AutomationV3`: same automation
 * content, plus a substantial CRM & internal systems section (`#crm-systems`)
 * since there is no separate CRM route yet (IA §2). `/automation` 301s here
 * — see App.tsx.
 */

import {
  Workflow,
  Repeat,
  BellRing,
  ClipboardList,
  Eye,
  Plug,
  PauseCircle,
  Database,
  ListChecks,
  Users,
  LineChart,
  Webhook,
  Cookie,
  Tags,
  Gauge,
  Layers,
} from "lucide-react";
import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { ServicePage, type ServicePageContent } from "@/components/v3/ServicePage";
import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import "@/styles/v5-pages.css";

const content: ServicePageContent = {
  eyebrow: "AI Systems & Automation",
  eyebrowIcon: Workflow,
  headline: "Less handoff. Less busywork. More momentum.",
  lede: "The work between the work — follow-ups, reminders, record updates, routing, and the CRM that holds it all — is where opportunities quietly die. We automate it, with a person kept in the loop and an audit trail on every step.",
  problem: {
    title: "Your team's memory is not a workflow engine.",
    body: "Every business runs invisible processes: reply to the inquiry, update the record, chase the quote, confirm the appointment. When those live in people's heads — or in a CRM nobody trusts — busy weeks break them, and nobody notices until the customer does.",
  },
  build: {
    title: "Automation for the steps people shouldn't have to remember.",
    body: "We map the handoffs that actually happen in your business and automate the mechanical ones — acknowledgments, routing, record-keeping, scheduled follow-ups — while decisions stay human. A Growth Digital System includes a starting workflow set; a Custom Connected System scopes automation around your specific process during discovery.",
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
    body: "Automation and the CRM are what turn a website, a discovery flow, and a receptionist into one system: it carries the work between them and gives your team one place to see it.",
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
        desc: "The front door automation and the CRM stand behind.",
        href: ROUTES.websitesApps,
      },
    ],
  },
  who: {
    title: "For operators drowning in follow-up.",
    body: "If your growth is capped by administrative follow-through rather than demand, automation and a CRM your team actually uses is the cheapest hire you'll ever make.",
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
    body: "Name the follow-through that keeps slipping — we'll design the workflow and the CRM record behind it.",
  },
};

/** W-6: a substantial CRM & internal systems section, not a fourth nav card. */
function CrmSystemsSection() {
  const reveal = useReveal();
  return (
    <section className="v3-section" data-tone="white" id="crm-systems" style={{ scrollMarginTop: "5rem" }}>
      <div className="v3-container v3-reveal" ref={reveal}>
        <div className="v3m-sechead">
          <span className="v3m-sechead__no">04b · CRM &amp; internal systems</span>
          <h2 className="v3-h2 reveal-clip">Where the business runs, in one place.</h2>
          <p className="v3-lede reveal-fade-up">
            There is no separate CRM route yet — CRM &amp; internal systems is
            part of this service, because the CRM is where automation's
            output actually lives: the pipeline, the tasks, and the records
            your team looks at every day.
          </p>
          <p className="v3-body reveal-fade-up">
            It's the record every website form, AI Receptionist call, and
            discovery brief writes to — so the CRM is honest by construction:
            it only ever shows what actually happened, not what someone
            remembered to log.
          </p>
        </div>
        <div className="v3m-pillars v3m-pillars--3">
          <div className="v3-card v3m-pillar reveal-scale-settle">
            <span className="v3m-pillar__icon">
              <Database aria-hidden="true" />
            </span>
            <h3 className="v3m-pillar__title">One system of record</h3>
            <p className="v3m-pillar__desc">
              Leads, contacts, and jobs live in one place instead of a
              spreadsheet, an inbox, and someone's memory.
            </p>
          </div>
          <div className="v3-card v3m-pillar reveal-scale-settle">
            <span className="v3m-pillar__icon">
              <ListChecks aria-hidden="true" />
            </span>
            <h3 className="v3m-pillar__title">Pipeline &amp; tasks</h3>
            <p className="v3m-pillar__desc">
              Every stage and every task is visible — what's next, what's
              overdue, and who owns it.
            </p>
          </div>
          <div className="v3-card v3m-pillar reveal-scale-settle">
            <span className="v3m-pillar__icon">
              <Users aria-hidden="true" />
            </span>
            <h3 className="v3m-pillar__title">Built for your team</h3>
            <p className="v3m-pillar__desc">
              Configured around how your business actually runs — not a
              generic template with fields you'll never use.
            </p>
          </div>
        </div>
        {/* CRM screenshots are never shown publicly (owner directive,
            2026-09-05: "CRM shouldn't be publicized") — the section returns
            to its icon-card treatment above as the sole visual, closed out
            with a deliberate divider rather than trailing into empty space. */}
        <div className="sm-crm-cta">
          <Link href={ROUTES.start} className="v3-btn v3-btn--outline">
            Talk about a CRM for your business
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Growth Infrastructure (V5 nine-capability expansion, 2026-09-05 owner
 * directive) — technical SEO, analytics, conversion tracking, cookie-consent
 * implementation, pixels, webhooks, campaign-ready landing pages, and
 * attribution/event instrumentation. Reachable at #growth-infrastructure
 * from the homepage ledger and the /services hub entry. Offered on its own
 * or as the foundation under an Advertising Services engagement — this
 * section never implies advertising management is included.
 */
const GROWTH_INFRA_ITEMS = [
  {
    icon: Gauge,
    title: "Technical SEO",
    desc: "Page speed, structured data, indexability, and the crawl hygiene search engines actually reward.",
  },
  {
    icon: LineChart,
    title: "Analytics & conversion tracking",
    desc: "Third-party analytics configured against real conversion events, not just page views.",
  },
  {
    icon: Cookie,
    title: "Cookie-consent implementation",
    desc: "A compliant consent layer that gates tracking correctly, region by region.",
  },
  {
    icon: Tags,
    title: "Meta, Google & TikTok pixels",
    desc: "Conversion events wired to the platforms you actually advertise on.",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    desc: "Events from the site or CRM pushed to the ad platforms and tools that need them.",
  },
  {
    icon: Layers,
    title: "Campaign-ready landing pages",
    desc: "Pages built to receive paid traffic, with tracking already wired in before launch.",
  },
];

function GrowthInfrastructureSection() {
  const reveal = useReveal();
  return (
    <section
      className="v3-section"
      data-tone="porcelain"
      id="growth-infrastructure"
      style={{ scrollMarginTop: "5rem" }}
    >
      <div className="v3-container v3-reveal" ref={reveal}>
        <div className="v3m-sechead">
          <span className="v3m-sechead__no">04c · Growth infrastructure</span>
          <h2 className="v3-h2 reveal-clip">The tracking that has to work before ad spend does.</h2>
          <p className="v3-lede reveal-fade-up">
            Every SiteMint website ships with the instrumentation an
            advertising or growth engagement will eventually need — so
            nothing gets rebuilt later under time pressure. Available on its
            own, scoped per project, whether or not you ever run paid media
            with us.
          </p>
        </div>
        <div className="sm-growth-grid">
          {GROWTH_INFRA_ITEMS.map((item) => (
            <div className="sm-growth-item reveal-scale-settle" key={item.title}>
              <span className="sm-growth-item__icon">
                <item.icon aria-hidden="true" size={20} />
              </span>
              <span className="sm-growth-item__title">{item.title}</span>
              <p className="sm-growth-item__desc">{item.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "1.5rem" }}>
          <Link href={ROUTES.start} className="v3-btn v3-btn--outline">
            Scope growth infrastructure for your site
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function AiSystemsV5() {
  usePageMeta({
    title: "AI Systems & Automation — SiteMint Digital",
    description:
      "Automation, CRM & internal systems, growth infrastructure, and AI-assisted workflows — evaluation, routing, follow-up, tracking, and record-keeping handled automatically, with people kept in the loop.",
  });
  return (
    <div id="integrations-scope" className="sm-v5page sm-v5page--ai-systems">
      <ServicePage
        content={content}
        extraSection={
          <>
            <CrmSystemsSection />
            <GrowthInfrastructureSection />
          </>
        }
        demo={
          <div className="v3-card v3h-demo reveal-scale-settle" data-tone="ice" id="integrations">
            <div className="sm-flow reveal-h-left" role="img" aria-label="Workflow: evaluate, then route, then follow up, then draft">
              <span className="sm-flow__node"><span className="sm-flow__dot" aria-hidden="true" />Evaluate</span>
              <svg className="sm-flow__arrow" viewBox="0 0 24 2" aria-hidden="true" focusable="false">
                <line x1="0" y1="1" x2="24" y2="1" pathLength={1} />
              </svg>
              <span className="sm-flow__node"><span className="sm-flow__dot" aria-hidden="true" />Route</span>
              <svg className="sm-flow__arrow" viewBox="0 0 24 2" aria-hidden="true" focusable="false">
                <line x1="0" y1="1" x2="24" y2="1" pathLength={1} />
              </svg>
              <span className="sm-flow__node"><span className="sm-flow__dot" aria-hidden="true" />Follow up</span>
              <svg className="sm-flow__arrow" viewBox="0 0 24 2" aria-hidden="true" focusable="false">
                <line x1="0" y1="1" x2="24" y2="1" pathLength={1} />
              </svg>
              <span className="sm-flow__node"><span className="sm-flow__dot" aria-hidden="true" />Draft</span>
            </div>
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
