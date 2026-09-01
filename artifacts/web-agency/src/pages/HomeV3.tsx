/**
 * Frontend V3 — the corporate homepage ("Signal Path").
 *
 * The company comes first: SiteMint builds connected digital systems, and the
 * AI Receptionist is one service among four. Copy in the hero is the
 * owner-approved wording, verbatim. Nothing here fabricates clients,
 * testimonials, metrics, or logos — proof is what SiteMint actually builds and
 * operates in production, and demonstrations are labelled as demonstrations.
 */

import { Fragment } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Globe,
  AudioLines,
  Search,
  Workflow,
  PhoneIncoming,
  CalendarCheck,
  UserRound,
  ShieldCheck,
  Clock,
  FileText,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { SignalWave } from "@/components/v3/SignalWave";
import { useReveal } from "@/components/v3/useReveal";
// Magnific "Signal Loop" poster (approved visual program, DESIGN-SPEC §10):
// atmospheric media only — all content stays real DOM above it.
import signalPoster from "@/assets/v3/signal-loop-poster.jpg";

const heroSequence = [
  {
    num: "01",
    label: "Inquiry arrives",
    desc: "A visitor lands on your site, or a call comes in after hours.",
  },
  {
    num: "02",
    label: "Intent understood",
    desc: "Discovery or the AI Receptionist collects what actually matters.",
  },
  {
    num: "03",
    label: "Work is routed",
    desc: "Automation moves the inquiry into the right system, instantly.",
  },
  {
    num: "04",
    label: "A person takes over",
    desc: "Your team steps in with full context — nothing lost, nothing retyped.",
  },
];

const pillars = [
  {
    icon: Globe,
    title: "Websites & Web Apps",
    desc: "Marketing sites and custom software built around how the business actually runs — not a template with your logo on it.",
    href: ROUTES.websitesApps,
  },
  {
    icon: AudioLines,
    title: "AI Receptionist",
    desc: "Answers every call, understands the need, books the time, and knows when to bring in a person.",
    href: ROUTES.aiReceptionist,
  },
  {
    icon: Search,
    title: "Discovery Systems",
    desc: "Structured intake that turns first contact into a brief your team can act on the same day.",
    href: ROUTES.discoverySystems,
  },
  {
    icon: Workflow,
    title: "Workflow Automation",
    desc: "The follow-up, routing, and record-keeping handled automatically, with people kept in the loop.",
    href: ROUTES.automation,
  },
];

const mapNodes = [
  {
    label: "Website",
    desc: "Where attention arrives and inquiry begins.",
    href: ROUTES.websitesApps,
  },
  {
    label: "Discovery",
    desc: "First contact becomes a structured, useful brief.",
    href: ROUTES.discoverySystems,
  },
  {
    label: "Automation & AI",
    desc: "Immediate work handled; every step recorded.",
    href: ROUTES.automation,
  },
  {
    label: "Business system",
    desc: "Information lands in the system of record.",
    href: ROUTES.automation,
  },
  {
    label: "Human outcome",
    desc: "A person takes over with full context.",
    href: ROUTES.process,
  },
];

const processSteps = [
  {
    num: "01",
    title: "Understand the business",
    body: "We start with how inquiries, jobs, and follow-up actually move through your week — not with a feature list. You talk; we map the system you already run in your head.",
  },
  {
    num: "02",
    title: "Design the system",
    body: "Website, intake, automation, receptionist — we design the pieces you need as one connected system, and we tell you plainly which pieces you don't need yet.",
  },
  {
    num: "03",
    title: "Build and connect",
    body: "We build in focused stages you can see and use, connected to your calendar, phone, and records from the start. No big reveal at the end — working software along the way.",
  },
  {
    num: "04",
    title: "Launch with a person in the loop",
    body: "Every automated path has a human handoff and an audit trail. We launch carefully, watch the first weeks together, and tune what the real traffic teaches us.",
  },
];

export default function HomeV3() {
  const reveal = useReveal();

  return (
    <div className="v3-home">
      {/* ── 1 · Hero ─────────────────────────────────────────────────── */}
      <section className="v3m-hero v3h-hero" data-tone="ink">
        <div className="v3-container v3m-hero__inner v3m-hero__inner--split">
          <div className="v3m-hero__copy">
            <p className="v3m-hero__kicker v3-eyebrow">
              Websites · Applications · Automation · AI
            </p>
            <h1 className="v3-hero-title">
              We build the digital systems behind growing businesses.
            </h1>
            <p className="v3-lede v3h-hero__lede">
              SiteMint designs websites, applications, and intelligent workflows
              that help businesses attract attention, respond faster, organize
              opportunities, and grow.
            </p>
            <div className="v3m-hero__actions">
              <Link href={ROUTES.start} className="v3-btn v3-btn--primary">
                Start with SiteMint
              </Link>
              <Link href={ROUTES.services} className="v3-btn v3-btn--outline">
                See what we build
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </div>

          <div className="v3h-theater">
            <div className="v3m-theater">
              <div className="v3m-theater__stage">
                <img
                  className="v3m-theater__poster"
                  src={signalPoster}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  fetchPriority="low"
                />
                <p className="v3m-theater__status">
                  <span className="v3-dot v3-dot--live" aria-hidden="true" />
                  SiteMint system · Live
                </p>
                <SignalWave />
                <div className="v3m-theater__floats">
                  <div className="v3-float v3h-float--inquiry">
                    <p className="v3m-float__title">
                      <PhoneIncoming aria-hidden="true" size={15} />
                      Inquiry received
                    </p>
                    <p className="v3m-float__meta">
                      New project inquiry · routed to discovery
                    </p>
                  </div>
                  <div className="v3-float v3h-float--discovery">
                    <p className="v3m-float__title">
                      <FileText aria-hidden="true" size={15} />
                      Discovery completed
                    </p>
                    <ul className="v3m-float__list">
                      <li>
                        <CheckCircle2 aria-hidden="true" size={13} />
                        Need and scope captured
                      </li>
                      <li>
                        <CheckCircle2 aria-hidden="true" size={13} />
                        Timeline understood
                      </li>
                    </ul>
                  </div>
                  <div className="v3-float v3h-float--project">
                    <p className="v3m-float__title">
                      <UserRound aria-hidden="true" size={15} />
                      Human follow-up ready
                    </p>
                    <p className="v3m-float__meta">
                      Project created · full context attached
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <ol className="v3m-seq">
              {heroSequence.map((beat) => (
                <li key={beat.num} className="v3m-seq__item">
                  <span className="v3m-seq__num">{beat.num}</span>
                  <span className="v3m-seq__label">{beat.label}</span>
                  <span className="v3m-seq__desc">{beat.desc}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── 2 · Proof — what SiteMint builds and runs ─────────────────── */}
      <section className="v3h-proof" data-tone="ink">
        <div className="v3-container v3h-proof__inner">
          <p className="v3h-proof__label">Built and operated by SiteMint</p>
          <ul className="v3h-proof__list">
            <li className="v3h-proof__item">
              <strong>AI Receptionist platform</strong>
              <span>
                Our own voice and SMS receptionist product, run in production
                with consent-aware handling and human handoff.
              </span>
            </li>
            <li className="v3h-proof__item">
              <strong>Discovery intake system</strong>
              <span>
                The structured project-intake flow on this site — the same
                system we build for clients.
              </span>
            </li>
            <li className="v3h-proof__item">
              <strong>Operations & CRM engine</strong>
              <span>
                The internal system running SiteMint's own pipeline, campaigns,
                and delivery work every day.
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── 3 · One SiteMint system ───────────────────────────────────── */}
      <section className="v3-section v3h-map-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">01</span>
            <p className="v3-serif-note">One system.</p>
            <h2 className="v3-display">Everything connected.</h2>
            <p className="v3-lede">
              Most businesses run on disconnected tools that don't talk to each
              other. SiteMint builds the connections — so an inquiry becomes a
              brief, a brief becomes a booking, and a booking becomes a customer
              without anything falling through.
            </p>
          </div>
          <div className="v3m-map" role="list">
            {mapNodes.map((node, i) => (
              <Fragment key={node.label}>
                <Link
                  href={node.href}
                  className="v3-card v3-card--hover v3m-map__node"
                  role="listitem"
                >
                  <span className="v3m-map__node-label">
                    <span className="v3-dot v3-dot--ok" aria-hidden="true" />
                    {node.label}
                  </span>
                  <span className="v3m-map__node-desc">{node.desc}</span>
                </Link>
                {i < mapNodes.length - 1 && (
                  <span className="v3m-map__link" aria-hidden="true">
                    <ArrowRight />
                  </span>
                )}
              </Fragment>
            ))}
          </div>
          <p className="v3h-map-note">
            Each stage works on its own. Connected, they compound.
          </p>
        </div>
      </section>

      {/* ── 4 · Service pillars ───────────────────────────────────────── */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">02</span>
            <h2 className="v3-display">What we build.</h2>
          </div>
          <div className="v3m-pillars v3m-pillars--4">
            {pillars.map((pillar) => (
              <Link
                key={pillar.title}
                href={pillar.href}
                className="v3-card v3-card--hover v3m-pillar"
              >
                <span className="v3m-pillar__icon">
                  <pillar.icon aria-hidden="true" />
                </span>
                <h3 className="v3m-pillar__title">{pillar.title}</h3>
                <p className="v3m-pillar__desc">{pillar.desc}</p>
                <span className="v3m-pillar__go">
                  Explore
                  <ArrowRight aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5 · Websites & apps showcase ──────────────────────────────── */}
      <section className="v3-section" data-tone="white">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">
              <Globe aria-hidden="true" size={14} />
              Websites & Web Apps
            </span>
            <h2 className="v3-h2">A website that knows what happens next.</h2>
            <p className="v3-body">
              A brochure page collects visits. A SiteMint site collects
              decisions: what the visitor needs, how urgent it is, and where it
              should go. Every page is designed backwards from the action you
              want a real customer to take.
            </p>
            <Link href={ROUTES.websitesApps} className="v3-btn v3-btn--outline">
              How we build sites
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="v3m-split__media">
            <div className="v3-card v3h-demo" data-tone="ice">
              <div className="v3h-demo__head">
                <p className="v3h-demo__title">What a visit becomes</p>
                <span className="v3m-example-note">Demonstration</span>
              </div>
              <ul className="v3h-chain">
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Visitor arrives</strong> — service page, 9:41 PM
                  </span>
                </li>
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Starts discovery</strong> — needs a booking system
                  </span>
                </li>
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Brief created</strong> — scope, timing, urgency
                  </span>
                </li>
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Team notified</strong> — follow-up scheduled for
                    morning
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6 · AI Receptionist theater ───────────────────────────────── */}
      <section className="v3-section v3h-air" data-tone="ink">
        <div className="v3-container v3m-split v3m-split--flip v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">
              <AudioLines aria-hidden="true" size={14} />
              AI Receptionist
            </span>
            <h2 className="v3-h2">
              The call you miss shouldn't be the customer you lose.
            </h2>
            <p className="v3-body">
              A business receptionist that answers, understands, books, follows
              up, and knows when to bring in a person. Consent-aware, with a
              human handoff built into every path.
            </p>
            <div className="v3m-hero__actions">
              <Link href={ROUTES.aiReceptionist} className="v3-btn v3-btn--primary">
                Meet the receptionist
              </Link>
            </div>
            <ul className="v3m-hero__trust">
              <li>
                <Clock aria-hidden="true" />
                24/7 coverage
              </li>
              <li>
                <UserRound aria-hidden="true" />
                Human handoff
              </li>
              <li>
                <ShieldCheck aria-hidden="true" />
                Consent-aware
              </li>
            </ul>
          </div>
          <div className="v3m-split__media">
            <div className="v3m-theater">
              <div className="v3m-theater__stage">
                <p className="v3m-theater__status">
                  <span className="v3-dot v3-dot--live" aria-hidden="true" />
                  SiteMint Receptionist · Listening
                </p>
                <SignalWave />
                <div className="v3m-theater__floats">
                  <div className="v3-float v3h-float--inquiry">
                    <p className="v3m-float__title">
                      <Sparkles aria-hidden="true" size={15} />
                      Intent: new project
                    </p>
                    <p className="v3m-float__meta">Detected · 00:03</p>
                  </div>
                  <div className="v3-float v3h-float--project">
                    <p className="v3m-float__title">
                      <CalendarCheck aria-hidden="true" size={15} />
                      Consultation confirmed
                    </p>
                    <p className="v3m-float__meta">
                      Booked for Tuesday, 10:00 AM · 00:24
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7 · Discovery demonstration ───────────────────────────────── */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">
              <Search aria-hidden="true" size={14} />
              Discovery Systems
            </span>
            <h2 className="v3-h2">Turn first contact into a useful brief.</h2>
            <p className="v3-body">
              "Contact us" forms produce two-line mysteries. A discovery system
              asks the right questions in the right order, adapts to the
              answers, and hands your team something they can actually price,
              plan, and respond to.
            </p>
            <Link href={ROUTES.discoverySystems} className="v3-btn v3-btn--outline">
              How discovery works
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="v3m-split__media">
            <div className="v3-card v3h-demo" data-tone="white">
              <div className="v3h-demo__head">
                <p className="v3h-demo__title">The brief your team receives</p>
                <span className="v3m-example-note">Demonstration</span>
              </div>
              <div className="v3m-receipt">
                <div className="v3m-receipt__row">
                  <span className="v3m-receipt__k">What they need</span>
                  <span className="v3m-receipt__v">
                    Online booking connected to an existing calendar
                  </span>
                </div>
                <div className="v3m-receipt__row">
                  <span className="v3m-receipt__k">What changes</span>
                  <span className="v3m-receipt__v">
                    Phone-tag scheduling replaced by same-day confirmations
                  </span>
                </div>
                <div className="v3m-receipt__row">
                  <span className="v3m-receipt__k">What happens next</span>
                  <span className="v3m-receipt__v">
                    Scoped recommendation and a working-session invitation
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8 · Automation demonstration ──────────────────────────────── */}
      <section className="v3-section" data-tone="white">
        <div className="v3-container v3m-split v3m-split--flip v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">
              <Workflow aria-hidden="true" size={14} />
              Workflow Automation
            </span>
            <h2 className="v3-h2">Less handoff. Less busywork. More momentum.</h2>
            <p className="v3-body">
              The work between the work — follow-ups, reminders, record
              updates, routing — is where opportunities quietly die. We automate
              it with a person kept in the loop and an audit trail on every
              step.
            </p>
            <Link href={ROUTES.automation} className="v3-btn v3-btn--outline">
              What we automate
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="v3m-split__media">
            <div className="v3-card v3h-demo" data-tone="ice">
              <div className="v3h-demo__head">
                <p className="v3h-demo__title">One inquiry, handled</p>
                <span className="v3m-example-note">Demonstration</span>
              </div>
              <ul className="v3h-chain">
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Inquiry captured</strong> — record created
                    automatically
                  </span>
                </li>
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Acknowledgment sent</strong> — in your voice, right
                    away
                  </span>
                </li>
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Task assigned</strong> — with the full brief
                    attached
                  </span>
                </li>
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Follow-up scheduled</strong> — nothing relies on
                    memory
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9 · Selected work / honest capability examples ────────────── */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">03</span>
            <h2 className="v3-display">Work in the open.</h2>
            <p className="v3-lede">
              We show real systems, not stock screenshots. Start with the ones
              we run ourselves.
            </p>
          </div>
          <div className="v3m-cards v3m-cards--3">
            <Link href={ROUTES.aiReceptionist} className="v3-card v3-card--hover v3m-card-link">
              <span className="v3m-card-link__kicker">Product · in production</span>
              <h3 className="v3m-card-link__title">SiteMint AI Receptionist</h3>
              <p className="v3m-card-link__desc">
                Voice and SMS receptionist with booking, consent handling, and
                human handoff — the product this site offers, running for real.
              </p>
            </Link>
            <Link href={ROUTES.discovery} className="v3-card v3-card--hover v3m-card-link">
              <span className="v3m-card-link__kicker">System · live on this site</span>
              <h3 className="v3m-card-link__title">Discovery intake</h3>
              <p className="v3m-card-link__desc">
                The structured project-intake flow you can try right now — the
                same pattern we build into client systems.
              </p>
            </Link>
            <Link href={ROUTES.workV3} className="v3-card v3-card--hover v3m-card-link">
              <span className="v3m-card-link__kicker">Capability examples</span>
              <h3 className="v3m-card-link__title">Selected work</h3>
              <p className="v3m-card-link__desc">
                Representative builds and system compositions, labelled honestly
                for what they are.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 10 · Process ──────────────────────────────────────────────── */}
      <section className="v3-section" data-tone="white" id="process">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">04</span>
            <p className="v3-serif-note">No mystery, no big reveal.</p>
            <h2 className="v3-display">How a project runs.</h2>
          </div>
          <ol className="v3m-steps">
            {processSteps.map((step) => (
              <li key={step.num} className="v3m-step">
                <span className="v3m-step__no" aria-hidden="true">
                  {step.num}
                </span>
                <h3 className="v3m-step__title v3m-step__head">{step.title}</h3>
                <p className="v3m-step__body">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 11 · Trust, safety, human control ─────────────────────────── */}
      <section className="v3-section" data-tone="ink">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">
              <ShieldCheck aria-hidden="true" size={14} />
              Trust & control
            </span>
            <h2 className="v3-h2">Automation with a person in charge.</h2>
            <p className="v3-body">
              AI should do the immediate work, not make the important decisions.
              Every SiteMint system is built so you can see what happened, step
              in at any moment, and switch any automated path off.
            </p>
          </div>
          <div className="v3m-split__media">
            <ul className="v3m-checks">
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>Human handoff everywhere.</strong> Every automated
                  conversation has a clear route to a real person.
                </span>
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>Consent-aware by design.</strong> Opt-outs are honored
                  immediately, and recording policies are explicit — never
                  assumed.
                </span>
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>Everything on the record.</strong> Actions leave an
                  audit trail you can review, not a black box.
                </span>
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>You own the off switch.</strong> Any workflow can be
                  paused without breaking the rest of the system.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 12 · Company intro ────────────────────────────────────────── */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">About SiteMint</span>
            <h2 className="v3-h2">A small studio that builds like an operator.</h2>
            <p className="v3-body">
              SiteMint Digital is a focused team that designs, builds, and runs
              business systems — including our own. The tools we sell are the
              tools we operate every day, which keeps us honest about what
              actually works.
            </p>
            <Link href={ROUTES.about} className="v3-btn v3-btn--outline">
              More about us
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="v3m-split__media">
            <div className="v3m-receipt">
              <div className="v3m-receipt__row">
                <span className="v3m-receipt__k">What we believe</span>
                <span className="v3m-receipt__v">
                  Software should reduce the number of things you have to
                  remember.
                </span>
              </div>
              <div className="v3m-receipt__row">
                <span className="v3m-receipt__k">How we work</span>
                <span className="v3m-receipt__v">
                  Small scopes, visible progress, and systems that connect
                  instead of multiply.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 13 · Insights teaser ──────────────────────────────────────── */}
      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">05</span>
            <h2 className="v3-display">Thinking out loud.</h2>
            <p className="v3-lede">
              Notes on building business systems — practical, specific, and
              free of hype.
            </p>
          </div>
          <Link href={ROUTES.insights} className="v3-btn v3-btn--outline">
            Visit Insights
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </section>

      {/* ── 14 · Final conversion ─────────────────────────────────────── */}
      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <p className="v3-serif-note">Ready when you are.</p>
          <h2 className="v3-display">
            Tell us what keeps falling through the cracks.
          </h2>
          <p className="v3-lede">
            Start with a short discovery brief. You'll get a straight answer
            about what to build, what to skip, and what it takes.
          </p>
          <div className="v3m-cta__actions">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary">
              Start with SiteMint
            </Link>
            <Link href={ROUTES.process} className="v3-btn v3-btn--outline">
              See the process first
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
