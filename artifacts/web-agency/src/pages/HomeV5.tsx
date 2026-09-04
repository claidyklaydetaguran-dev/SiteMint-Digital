/**
 * Frontend V5 — the SiteMint homepage (owner amendment, workbook W-1,
 * V5-BLUEPRINT.md §4/§6). Supersedes `HomeV4` as the routed `/` page.
 *
 * `HomeV4.tsx` stays in the repository, unrouted, as the rollback reference
 * — see App.tsx. This page reuses `HomeV4`'s hero mechanics (particle
 * canvas, scroll-linked phase HUD, node lighting — `SignalHeroV4`, now
 * prop-driven so the mechanism can be reused with amended copy) and
 * `SignalJourneyV4` (extended in place to the six-step connected-system
 * story, not replaced) rather than re-implementing them.
 *
 * Fifteen sections, one continuous system story (V5-BLUEPRINT §4). Sections
 * may be visually adjacent but every one keeps its own information — nothing
 * from the approved architecture is dropped.
 */

import { useState } from "react";
import { Link } from "wouter";
import { HOME_SECTIONS, ROUTES, dashboardUrl } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { SignalHeroV4 } from "@/pages/HomeV4";
import { SignalJourneyV4 } from "@/components/v4/SignalJourneyV4";
import { HeroMedia } from "@/components/v5/HeroMedia";
import { Reveal } from "@/components/v5/Reveal";
import { pricingTiersV5, PRICING_DISCLAIMER_V5, AI_RECEPTIONIST_PRICING_NOTE_V5 } from "@/components/v5/pricingTiersV5";
import { teamV5 } from "@/components/v5/teamV5";
import { capabilityLabelsV5 } from "@/components/v5/capabilityLabelsV5";
import "@/styles/v5-home.css";

const PAGE_TITLE = "SiteMint Digital | Websites, CRM, and AI Systems Built to Connect";
const PAGE_DESCRIPTION =
  "SiteMint designs websites, web applications, CRM systems, AI automation, and custom software that work together — from the first interaction to the next meaningful action.";

/* ── Section 2 — What SiteMint builds (typographic ledger, not cards) ──── */

interface LedgerRow {
  label: string;
  outcome: string;
}

const LEDGER_ROWS: LedgerRow[] = [
  { label: "Websites", outcome: "A credible, converting front door." },
  { label: "Web Applications", outcome: "Custom software for how the business actually works." },
  { label: "CRM & Internal Systems", outcome: "One place the team trusts, instead of five." },
  { label: "AI Systems & Automation", outcome: "Routine work handled; judgment stays human." },
  { label: "Custom Software Engineering", outcome: "Built for the business, when off-the-shelf doesn't fit." },
  { label: "AI-Assisted Development", outcome: "We build faster without cutting review or testing." },
];

function WhatWeBuildLedger() {
  const reveal = useReveal();
  return (
    <section className="v4-section sm-ledger" id="what-we-build" data-tone="white">
      <div className="v4-container">
        <div className="v4-chapter-head" ref={reveal} data-v4-reveal>
          <span className="v4-kicker">02 — What we build</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>
        <Reveal as="h2" className="v4-h2" words>
          Six capabilities. One connected system.
        </Reveal>
        <p className="v4-lede">
          Every SiteMint engagement draws from the same six capabilities —
          alone or combined into one system, depending on what the business
          actually needs.
        </p>
        <ol className="sm-ledger__list" ref={reveal} data-v4-reveal>
          {LEDGER_ROWS.map((row, i) => (
            <li className="sm-ledger__row" key={row.label}>
              <span className="sm-ledger__no">{String(i + 1).padStart(2, "0")}</span>
              <span className="sm-ledger__label">{row.label}</span>
              <span className="sm-ledger__outcome">{row.outcome}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── Section 4 — Websites & Web Apps (layered browser/device frames, CSS only) */

function WebsitesAppsSection() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id="websites-apps" data-tone="porcelain">
      <div className="v4-container sm-split">
        <div className="sm-split__copy" ref={reveal} data-v4-reveal>
          <span className="v4-kicker">03 — Websites & Web Apps</span>
          <h2 className="v4-h2">A site that knows what happens after the click.</h2>
          <p className="v4-lede">
            Marketing sites and custom applications built around the action a
            real visitor should take next — a form that reaches an inbox, a
            tracked event, a clean hand-off to the next system.
          </p>
          <Link href={ROUTES.websitesApps} className="v3-btn v3-btn--outline">
            Explore Websites &amp; Web Apps →
          </Link>
        </div>
        <div className="sm-devices" ref={reveal} data-v4-reveal aria-hidden="true">
          <div className="sm-devices__browser">
            <span className="sm-devices__dot" />
            <span className="sm-devices__dot" />
            <span className="sm-devices__dot" />
            <div className="sm-devices__browser-body">
              <div className="sm-devices__line sm-devices__line--wide" />
              <div className="sm-devices__line" />
              <div className="sm-devices__line sm-devices__line--short" />
            </div>
          </div>
          <div className="sm-devices__phone">
            <div className="sm-devices__phone-body">
              <div className="sm-devices__line sm-devices__line--short" />
              <div className="sm-devices__line" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Section 5 — CRM & internal systems (labelled illustration) ─────────── */

function CrmSystemsSection() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id="crm-systems" data-tone="white">
      <div className="v4-container sm-split sm-split--reverse">
        <div className="sm-split__copy" ref={reveal} data-v4-reveal>
          <span className="v4-kicker">04 — CRM &amp; Internal Systems</span>
          <h2 className="v4-h2">Where the business runs, in one place.</h2>
          <p className="v4-lede">
            Pipeline, tasks, and records the owner actually looks at — built
            around how the business already works instead of forcing a
            generic template onto it.
          </p>
          <Link href={`${ROUTES.aiSystems}#crm-systems`} className="v3-btn v3-btn--outline">
            See CRM &amp; internal systems →
          </Link>
        </div>
        <div className="sm-record" ref={reveal} data-v4-reveal aria-hidden="true">
          <span className="sm-record__badge">Illustration</span>
          <div className="sm-record__row">
            <span className="sm-record__dot" />
            <span className="sm-record__k">Lead</span>
            <span className="sm-record__v">New inquiry — routed</span>
          </div>
          <div className="sm-record__row">
            <span className="sm-record__dot sm-record__dot--amber" />
            <span className="sm-record__k">Task</span>
            <span className="sm-record__v">Follow up — due today</span>
          </div>
          <div className="sm-record__row">
            <span className="sm-record__dot sm-record__dot--mint" />
            <span className="sm-record__k">Stage</span>
            <span className="sm-record__v">Proposal sent</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Section 6 — AI Systems & Automation (connected node sequence) ──────── */

function AiSystemsSection() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id="ai-systems" data-tone="ink">
      <div className="v4-container sm-split">
        <div className="sm-split__copy" ref={reveal} data-v4-reveal>
          <span className="v4-kicker">05 — AI Systems &amp; Automation</span>
          <h2 className="v4-h2">Evaluate, route, follow up, draft — where it's allowed to act.</h2>
          <p className="v4-lede">
            Automation handles the mechanical steps; anything requiring
            judgment lands as a task for a person, with context attached.
            Every automated action is logged and stoppable.
          </p>
          <Link href={ROUTES.aiSystems} className="v3-btn v3-btn--outline">
            Explore AI Systems &amp; Automation →
          </Link>
        </div>
        <div className="sm-nodes-wrap" ref={reveal} data-v4-reveal>
          <svg
            className="sm-nodes"
            viewBox="0 0 420 160"
            role="img"
            aria-label="Diagram: an inquiry moves through evaluation, routing, and follow-up nodes"
          >
            <path
              d="M30 130 C 100 60, 150 150, 210 90 S 320 40, 390 60"
              fill="none"
              stroke="var(--sm-mint-500, #25D0B0)"
              strokeWidth="2"
              opacity="0.7"
            />
            {[
              { x: 30, y: 130, label: "Evaluate" },
              { x: 210, y: 90, label: "Route" },
              { x: 390, y: 60, label: "Follow up" },
            ].map((n) => (
              <g key={n.label} transform={`translate(${n.x} ${n.y})`}>
                <circle r="20" fill="none" stroke="var(--sm-mint-400, #4FD9CF)" strokeWidth="1.6" />
                <circle r="4" fill="var(--sm-mint-500, #25D0B0)" />
                <text y="38" textAnchor="middle" fill="var(--sm-dark-text, #E9F7F3)" fontSize="12">
                  {n.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}

/* ── Section 7 — AI Receptionist spotlight (waveform ring) ──────────────── */

function ReceptionistSpotlight() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id="ai-receptionist" data-tone="porcelain">
      <div className="v4-container sm-split sm-split--reverse">
        <div className="sm-split__copy" ref={reveal} data-v4-reveal>
          <span className="v4-kicker">06 — AI Receptionist</span>
          <span className="sm-badge sm-badge--beta">Private beta — invite only</span>
          <h2 className="v4-h2">Never let a good opportunity end at a missed call.</h2>
          <p className="v4-lede">
            SiteMint AI Receptionist is built to answer incoming calls, handle
            routine questions, and help callers reach the right next step
            using the business's actual rules and availability.
          </p>
          <Link href={ROUTES.aiReceptionist} className="v3-btn v3-btn--primary">
            See the AI Receptionist →
          </Link>
        </div>
        <div className="sm-ring" ref={reveal} data-v4-reveal aria-hidden="true">
          <span className="sm-ring__pulse sm-ring__pulse--1" />
          <span className="sm-ring__pulse sm-ring__pulse--2" />
          <span className="sm-ring__pulse sm-ring__pulse--3" />
          <span className="sm-ring__core" />
        </div>
      </div>
    </section>
  );
}

/* ── Section 8 — Discovery & lead capture ────────────────────────────────── */

function DiscoverySection() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id="discovery" data-tone="white">
      <div className="v4-container" ref={reveal} data-v4-reveal>
        <div className="v4-chapter-head">
          <span className="v4-kicker">07 — Discovery &amp; lead capture</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>
        <h2 className="v4-h2">A structured brief, not a contact form.</h2>
        <p className="v4-lede">
          Every project starts with a guided, structured intake — the same
          one live on this site right now. It saves as you go, and a person
          reads every answer before you hear back.
        </p>
        <ol className="sm-steps-inline">
          <li>Answer structured questions about the business and the goal</li>
          <li>Save and resume any time — nothing is lost</li>
          <li>SiteMint reviews the brief and replies with a straight answer</li>
        </ol>
        <div className="sm-actions">
          <Link href={ROUTES.discovery} className="v3-btn v3-btn--primary">
            Start the discovery brief
          </Link>
          <Link href={ROUTES.discoverySystems} className="v3-btn v3-btn--outline">
            See Discovery Systems →
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Section 9 — Selected work / capability demonstrations ──────────────── */

interface WorkItem {
  title: string;
  desc: string;
  status: keyof typeof capabilityLabelsV5;
}

const SELECTED_WORK: WorkItem[] = [
  {
    title: "SiteMint discovery intake",
    desc: "The structured project-intake flow on this website — guided steps, branching questions, save-and-resume drafts.",
    status: "available",
  },
  {
    title: "AI Receptionist",
    desc: "SiteMint's own voice and SMS receptionist product — answering, qualifying, and routing callers.",
    status: "private-beta",
  },
  {
    title: "SiteMint operations engine",
    desc: "The internal CRM and automation system that runs SiteMint's own pipeline — lead scoring, sequences, task routing.",
    status: "in-development",
  },
];

function SelectedWorkSection() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id={HOME_SECTIONS.work} data-tone="porcelain">
      <div className="v4-container" ref={reveal} data-v4-reveal>
        <div className="v4-chapter-head">
          <span className="v4-kicker">08 — Selected work</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>
        <h2 className="v4-h2">What SiteMint has actually built and run.</h2>
        <div className="sm-work-grid">
          {SELECTED_WORK.map((item) => (
            <article className="sm-work-card" key={item.title}>
              <span className={`sm-badge sm-badge--${item.status}`}>
                {capabilityLabelsV5[item.status]}
              </span>
              <h3 className="sm-work-card__title">{item.title}</h3>
              <p className="sm-work-card__desc">{item.desc}</p>
            </article>
          ))}
        </div>
        <Link href={ROUTES.workV3} className="v3-btn v3-btn--outline">
          See all of our work →
        </Link>
      </div>
    </section>
  );
}

/* ── Section 10 — How SiteMint works ─────────────────────────────────────── */

const PROCESS_STEPS = [
  { title: "Discover", output: "A structured brief we both work from." },
  { title: "Design", output: "Real pages and flows you see before they ship." },
  { title: "Build", output: "Working software at every checkpoint." },
  { title: "Validate", output: "Verified — typechecked, tested, reviewed." },
  { title: "Launch & Improve", output: "A human handoff, then ongoing tuning." },
];

function HowItWorksSection() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id={HOME_SECTIONS.process} data-tone="ink">
      <div className="v4-container" ref={reveal} data-v4-reveal>
        <div className="v4-chapter-head">
          <span className="v4-kicker">09 — How SiteMint works</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>
        <h2 className="v4-h2">Five stages, each with a visible outcome.</h2>
        <ol className="sm-timeline">
          {PROCESS_STEPS.map((step, i) => (
            <li className="sm-timeline__step" key={step.title}>
              <span className="sm-timeline__no">{String(i + 1).padStart(2, "0")}</span>
              <span className="sm-timeline__title">{step.title}</span>
              <span className="sm-timeline__output">{step.output}</span>
            </li>
          ))}
        </ol>
        <Link href={ROUTES.process} className="v3-btn v3-btn--outline">
          See the full process →
        </Link>
      </div>
    </section>
  );
}

/* ── Section 11 — Pricing estimates ──────────────────────────────────────── */

function PricingSection() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id="pricing-estimates" data-tone="white">
      <div className="v4-container" ref={reveal} data-v4-reveal>
        <div className="v4-chapter-head">
          <span className="v4-kicker">10 — Pricing estimates</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>
        <h2 className="v4-h2">Three starting points. Every system is scoped.</h2>
        <div className="sm-pricing-grid">
          {pricingTiersV5.map((tier) => (
            <div className={`sm-pricing-card${tier.recommended ? " is-recommended" : ""}`} key={tier.id}>
              {tier.recommended && <span className="sm-badge sm-badge--available">Most common</span>}
              <h3 className="sm-pricing-card__name">{tier.name}</h3>
              <p className="sm-pricing-card__price">{tier.priceFrom}</p>
              <p className="sm-pricing-card__tagline">{tier.tagline}</p>
            </div>
          ))}
        </div>
        <p className="sm-disclaimer">{PRICING_DISCLAIMER_V5}</p>
        <p className="sm-disclaimer">{AI_RECEPTIONIST_PRICING_NOTE_V5}</p>
        <Link href={ROUTES.pricing} className="v3-btn v3-btn--primary">
          Configure your scope →
        </Link>
      </div>
    </section>
  );
}

/* ── Section 12 — Why SiteMint ───────────────────────────────────────────── */

const WHY_POINTS = [
  {
    title: "Connected, not collected",
    body: "One system carries the work between the website, the CRM, and automation — not five disconnected tools.",
  },
  {
    title: "AI-assisted, human-reviewed",
    body: "We use AI to build faster and to automate routine work — every judgment call still lands with a person.",
  },
  {
    title: "Honest about capability",
    body: "Every feature on this site is labelled available, private beta, in development, or planned. Nothing planned looks live.",
  },
  {
    title: "A small, senior team",
    body: "The people who design the system are the people who build it and the people who answer when something needs attention.",
  },
];

function WhySiteMintSection() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id="why-sitemint" data-tone="porcelain">
      <div className="v4-container" ref={reveal} data-v4-reveal>
        <div className="v4-chapter-head">
          <span className="v4-kicker">11 — Why SiteMint</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>
        <div className="sm-why-grid">
          {WHY_POINTS.map((point) => (
            <div className="sm-why-item" key={point.title}>
              <h3 className="sm-why-item__title">{point.title}</h3>
              <p className="sm-why-item__body">{point.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 13 — Team ────────────────────────────────────────────────────── */

function TeamSection() {
  const reveal = useReveal();
  return (
    <section className="v4-section" id="team" data-tone="white">
      <div className="v4-container" ref={reveal} data-v4-reveal>
        <div className="v4-chapter-head">
          <span className="v4-kicker">12 — Team</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>
        <h2 className="v4-h2">The people doing the work.</h2>
        <div className="sm-team-grid">
          {teamV5.map((member) => (
            <div className="sm-team-card" key={member.name}>
              <span className="sm-team-card__avatar" aria-hidden="true">
                {member.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span className="sm-team-card__name">{member.name}</span>
              <span className="sm-team-card__role">{member.role}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 14 — FAQ ─────────────────────────────────────────────────────── */

interface FaqItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "What's actually included in the scope you quote?",
    a: "Every project starts with the discovery brief, so scope is written down before work starts — pages, integrations, and what's explicitly out of scope. Nothing is assumed.",
  },
  {
    q: "How long does a typical project take?",
    a: "It depends on scope. A Starter Site System is typically the fastest to launch; a Custom Connected System takes longer because it includes a custom application and CRM/automation work. You'll get a real timeline after discovery, not before.",
  },
  {
    q: "Who owns the website, code, and data when we're done?",
    a: "You do. Credentials, content, and records belong to the business from day one — that's a standing rule of every SiteMint project, not a launch-day handoff.",
  },
  {
    q: "How is AI actually used in what you build?",
    a: "Two ways: AI-assisted development (we use AI tools to build faster, with human review and testing on everything that ships) and, where it's in scope, AI automation inside your system — evaluation, routing, drafting. Judgment calls stay with a person.",
  },
  {
    q: "What is the AI Receptionist private beta?",
    a: "SiteMint's AI Receptionist product is in an invite-only private beta. It does not retain call audio or full transcripts. Request beta access from the AI Receptionist page to be considered.",
  },
];

function FaqSection() {
  const reveal = useReveal();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="v4-section" id={HOME_SECTIONS.faq} data-tone="ink">
      <div className="v4-container" ref={reveal} data-v4-reveal>
        <div className="v4-chapter-head">
          <span className="v4-kicker">13 — FAQ</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>
        <h2 className="v4-h2">Straight answers to common questions.</h2>
        <div className="sm-faq">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div className="sm-faq__item" key={item.q}>
                <button
                  type="button"
                  className="sm-faq__question"
                  aria-expanded={isOpen}
                  aria-controls={`sm-faq-panel-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  {item.q}
                  <span className="sm-faq__chevron" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <p className="sm-faq__answer" id={`sm-faq-panel-${i}`}>
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Section 15 — Final CTA ───────────────────────────────────────────────── */

function FinalCtaSection() {
  return (
    <section className="v4-section v4-cta-band" id="final-cta" data-tone="ink">
      <div className="v4-container">
        <span className="v4-kicker">14 — Start</span>
        <h2 className="v4-h2">
          Tell us where attention leaks out of your business. We'll design
          the system that catches it.
        </h2>
        <div className="v4-cta-band__actions">
          <Link href={ROUTES.start} className="v4-btn v4-btn--primary">
            Build Your SiteMint System
          </Link>
          <Link href={ROUTES.aiReceptionist} className="v4-btn v4-btn--outline">
            Explore the AI Receptionist
          </Link>
        </div>
        <p className="sm-final-cta__signin">
          Already a client? <a href={dashboardUrl("/login")}>Sign in</a>
        </p>
      </div>
      <span className="v4-signal-rule v4-cta-band__thread" aria-hidden="true" />
    </section>
  );
}

/* ── The page ─────────────────────────────────────────────────────────────── */

export default function HomeV5() {
  const reveal = useReveal();
  usePageMeta({ title: PAGE_TITLE, description: PAGE_DESCRIPTION });

  return (
    <div className="v4-home sm-home-v5">
      {/* Section 1 — Hero. Reuses SignalHeroV4's particle canvas / scroll
          transition / phase HUD unchanged; only the copy region and CTAs are
          overridden (W-1 amendment). */}
      <div id="hero">
        <SignalHeroV4
          hideKicker
          title="Digital systems built to move your business forward."
          hideSub1
          sub={
            <>
              SiteMint designs websites, web applications, CRM systems, AI
              automation, and custom software that work together—from the
              first interaction to the next meaningful action.
            </>
          }
          brandLine="Capture. Organize. Connect. Resolve."
          primaryHref={ROUTES.start}
          primaryLabel="Build Your SiteMint System"
          secondaryHref={ROUTES.services}
          secondaryLabel="Explore What We Build"
          secondaryIsRoute
        />
      </div>

      <WhatWeBuildLedger />

      {/* Poster-first hero media (V5-BLUEPRINT §6/§17): a below-the-fold,
          non-LCP visual break before the interactive diagram. No produced
          video exists yet, so this renders the labelled development
          placeholder poster only — `videoSrc` stays unset until the owner
          approves a produced asset per the hero storyboard. */}
      <section className="v4-section sm-media-break" data-tone="ink" aria-label="SiteMint connected system, visualised">
        <div className="v4-container">
          <HeroMedia label="Development placeholder — SiteMint connected-system visual, final media pending" />
        </div>
      </section>

      {/* Section 3 — the interactive connected-system explanation. Reuses
          SignalJourneyV4 (extended to six stages in place, not replaced). */}
      <div id="connected-system">
        <SignalJourneyV4 reveal={reveal} />
      </div>

      <WebsitesAppsSection />
      <CrmSystemsSection />
      <AiSystemsSection />
      <ReceptionistSpotlight />
      <DiscoverySection />
      <SelectedWorkSection />
      <HowItWorksSection />
      <PricingSection />
      <WhySiteMintSection />
      <TeamSection />
      <FaqSection />
      <FinalCtaSection />
    </div>
  );
}
