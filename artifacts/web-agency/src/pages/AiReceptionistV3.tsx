/**
 * Frontend V3 — the AI Receptionist product landing ("Voice Theater").
 *
 * Honesty rules applied throughout: the hero copy is the approved wording;
 * capabilities describe what the committed product actually does; nothing
 * implies retained recordings or transcripts (the artifact policy is explicit
 * and server-owned); pricing is presented as the honest early-access state
 * with no invented numbers; demonstrations are labelled.
 */

import { Link } from "wouter";
import {
  ArrowRight,
  AudioLines,
  CalendarCheck,
  Clock,
  MessageSquareText,
  PhoneForwarded,
  ShieldCheck,
  Sparkles,
  UserRound,
  CheckCircle2,
  CalendarDays,
  FileText,
  Ban,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { SignalWave } from "@/components/v3/SignalWave";
import { useReveal } from "@/components/v3/useReveal";

const productNav = [
  { label: "Overview", href: "#overview" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Safety", href: "#safety" },
  { label: "Getting started", href: "#getting-started" },
];

const howItWorks = [
  {
    num: "01",
    icon: AudioLines,
    title: "Answers instantly",
    body: "Greets every caller naturally — day or night — so they never hit voicemail.",
  },
  {
    num: "02",
    icon: Sparkles,
    title: "Understands & qualifies",
    body: "Captures intent, details, and urgency to route each conversation the right way.",
  },
  {
    num: "03",
    icon: CalendarCheck,
    title: "Books & follows up",
    body: "Confirms the appointment and sends reminders — so everyone shows up prepared.",
  },
];

const capabilities = [
  {
    icon: Clock,
    title: "24/7 coverage",
    desc: "After-hours, weekends, and the busy stretch when everyone's on a job — every inquiry gets a proper answer.",
  },
  {
    icon: MessageSquareText,
    title: "SMS conversations",
    desc: "Text conversations handled with the same care as calls, with STOP honored immediately and permanently.",
  },
  {
    icon: CalendarDays,
    title: "Booking & availability",
    desc: "Offers real open times from your availability rules and confirms bookings without phone-tag.",
  },
  {
    icon: PhoneForwarded,
    title: "Human handoff",
    desc: "High-value or sensitive conversations transfer to your team — and when nobody's free, you get a clear follow-up task, not silence.",
  },
  {
    icon: FileText,
    title: "Structured outcomes",
    desc: "Every conversation ends as an organized record: who called, what they needed, what happened next.",
  },
  {
    icon: Ban,
    title: "Knows its limits",
    desc: "It doesn't guess prices, give advice it shouldn't, or bluff. Out-of-scope questions route to a person.",
  },
];

const setupSteps = [
  {
    title: "Create your workspace",
    body: "Sign up and tell the receptionist about your business — services, hours, and how you like things handled.",
  },
  {
    title: "Shape the conversations",
    body: "Set greeting, tone, booking rules, and the moments that must reach a person. Preview as you go.",
  },
  {
    title: "Test it yourself",
    body: "Run test conversations until it sounds like your business — before any customer ever hears it.",
  },
  {
    title: "Go live deliberately",
    body: "Launch on your number when you're ready, watch the first conversations, and tune together.",
  },
];

const faqs = [
  {
    q: "Will callers know it's an AI?",
    a: "Yes. The receptionist introduces itself honestly and never pretends to be a person. Trust with your customers is worth more than a trick.",
  },
  {
    q: "What happens when it can't help?",
    a: "It brings in a person. Transfers go to your team during business hours; outside them, the caller is told exactly what happens next and your team gets a clear follow-up task.",
  },
  {
    q: "Are my calls recorded?",
    a: "Only according to an explicit retention policy you can see. Where the policy is set to none, recordings and transcripts are not retained — the receptionist works from the outcome of the conversation, not a stored copy of it.",
  },
  {
    q: "How do opt-outs work?",
    a: "Reply STOP to any SMS conversation and it ends immediately; the opt-out is recorded and enforced permanently. Consent handling is built into the platform, not an afterthought.",
  },
  {
    q: "What does it cost?",
    a: "The receptionist is in early access, with straightforward monthly plans and metered usage. Current pricing is shared during setup — we don't publish numbers here that could be stale by the time you read them.",
  },
];

export default function AiReceptionistV3() {
  const reveal = useReveal();

  return (
    <div className="v3-air-page">
      {/* ── Product subnav ── */}
      <nav className="v3a-subnav" aria-label="AI Receptionist sections" data-tone="ink">
        <div className="v3-container v3a-subnav__inner">
          <span className="v3a-subnav__label">
            <AudioLines aria-hidden="true" size={14} />
            AI Receptionist
          </span>
          <ul className="v3a-subnav__list">
            {productNav.map((item) => (
              <li key={item.label}>
                <a href={item.href} className="v3a-subnav__link">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* ── 1 · Hero + voice theater ── */}
      <section className="v3m-hero v3a-hero" data-tone="ink" id="overview">
        <div className="v3-container v3m-hero__inner v3m-hero__inner--split">
          <div className="v3m-hero__copy">
            <h1 className="v3-hero-title">
              The call you miss shouldn't be the customer you lose.
            </h1>
            <p className="v3-lede">
              A business receptionist that answers, understands, books, follows
              up, and knows when to bring in a person.
            </p>
            <div className="v3m-hero__actions">
              <Link
                href={ROUTES.aiReceptionistSignup}
                className="v3-btn v3-btn--primary"
              >
                Get started
              </Link>
              <a href="#how-it-works" className="v3-btn v3-btn--outline">
                See the full workflow
                <ArrowRight aria-hidden="true" size={16} />
              </a>
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
            <div className="v3m-theater v3a-theater">
              <div className="v3m-theater__stage">
                <p className="v3m-theater__status">
                  <span className="v3-dot v3-dot--live" aria-hidden="true" />
                  SiteMint Receptionist · Listening
                </p>
                <SignalWave />
                <div className="v3m-theater__floats">
                  <div className="v3-float v3a-float--intent">
                    <p className="v3m-float__title">
                      <Sparkles aria-hidden="true" size={15} />
                      Intent: new project
                    </p>
                    <p className="v3m-float__meta">Detected · 00:03</p>
                  </div>
                  <div className="v3-float v3a-float--avail">
                    <p className="v3m-float__title">
                      <CalendarDays aria-hidden="true" size={15} />
                      Availability checked
                    </p>
                    <p className="v3m-float__meta">Matching times found · 00:08</p>
                  </div>
                  <div className="v3-float v3a-float--handoff">
                    <p className="v3m-float__title">
                      <UserRound aria-hidden="true" size={15} />
                      Handoff ready
                    </p>
                    <p className="v3m-float__meta">
                      High-value opportunity · transferring · 00:31
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2 · How it works ── */}
      <section className="v3-section" data-tone="porcelain" id="how-it-works">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead v3m-sechead--center">
            <p className="v3-serif-note">The magic, step by step</p>
            <h2 className="v3-display">What happens while you're busy.</h2>
          </div>
          <div className="v3m-pillars v3m-pillars--3">
            {howItWorks.map((step) => (
              <div key={step.num} className="v3-card v3m-pillar">
                <span className="v3m-seq__num">{step.num}</span>
                <span className="v3m-pillar__icon">
                  <step.icon aria-hidden="true" />
                </span>
                <h3 className="v3m-pillar__title">{step.title}</h3>
                <p className="v3m-pillar__desc">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3 · Capabilities ── */}
      <section className="v3-section" data-tone="white" id="capabilities">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">Capabilities</span>
            <h2 className="v3-display">A receptionist, not a phone tree.</h2>
            <p className="v3-lede">
              It holds real conversations, produces real outcomes, and hands
              your team real context.
            </p>
          </div>
          <div className="v3m-pillars v3m-pillars--3">
            {capabilities.map((cap) => (
              <div key={cap.title} className="v3-card v3m-pillar">
                <span className="v3m-pillar__icon">
                  <cap.icon aria-hidden="true" />
                </span>
                <h3 className="v3m-pillar__title">{cap.title}</h3>
                <p className="v3m-pillar__desc">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4 · Outcome example ── */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">
              <FileText aria-hidden="true" size={14} />
              After every conversation
            </span>
            <h2 className="v3-h2">You get the outcome, not homework.</h2>
            <p className="v3-body">
              Every call and text ends as a structured record — who reached
              out, what they needed, what the receptionist did, and what (if
              anything) needs you. No listening back through audio to find out
              what happened.
            </p>
          </div>
          <div className="v3m-split__media">
            <div className="v3-card v3h-demo" data-tone="white">
              <div className="v3h-demo__head">
                <p className="v3h-demo__title">Outcome receipt</p>
                <span className="v3m-example-note">Demonstration</span>
              </div>
              <div className="v3m-receipt">
                <div className="v3m-receipt__row">
                  <span className="v3m-receipt__k">What happened</span>
                  <span className="v3m-receipt__v">
                    New caller asked about a kitchen remodel; urgency this
                    month
                  </span>
                </div>
                <div className="v3m-receipt__row">
                  <span className="v3m-receipt__k">What the receptionist did</span>
                  <span className="v3m-receipt__v">
                    Qualified the project and booked a consultation for Tuesday
                    10:00 AM
                  </span>
                </div>
                <div className="v3m-receipt__row">
                  <span className="v3m-receipt__k">What needs you</span>
                  <span className="v3m-receipt__v">
                    Nothing — confirmation and reminder are scheduled
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5 · Human handoff ── */}
      <section className="v3-section" data-tone="ink">
        <div className="v3-container v3m-split v3m-split--flip v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">
              <UserRound aria-hidden="true" size={14} />
              Human handoff
            </span>
            <h2 className="v3-h2">It knows when to bring in a person.</h2>
            <p className="v3-body">
              Some conversations are worth interrupting your day for. You
              decide which — by topic, by urgency, by caller — and the
              receptionist transfers them to your team. When nobody can pick
              up, the caller hears the truth about what happens next, and you
              get a clear task instead of a mystery voicemail.
            </p>
          </div>
          <div className="v3m-split__media">
            <ul className="v3m-checks">
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>Your transfer rules.</strong> High-value inquiries,
                  existing customers, sensitive topics — routed the way you
                  choose.
                </span>
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>No dead ends.</strong> A missed transfer becomes a
                  follow-up task with the full context attached.
                </span>
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>Honest with callers.</strong> Nobody is strung along
                  by a bot pretending it can help.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 6 · Safety: consent & artifact policy ── */}
      <section className="v3-section" data-tone="white" id="safety">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">Safety</span>
            <h2 className="v3-display">Consent-aware by design.</h2>
            <p className="v3-lede">
              Trust is the product. These aren't settings buried in a menu —
              they're how the platform is built.
            </p>
          </div>
          <div className="v3m-receipt">
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">Explicit retention policy</span>
              <span className="v3m-receipt__v">
                Whether recordings or transcripts are kept is an explicit,
                visible policy — never a default. Set to none, nothing is
                retained and the receptionist works from conversation outcomes
                only.
              </span>
            </div>
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">Opt-outs enforced</span>
              <span className="v3m-receipt__v">
                STOP ends an SMS conversation immediately and permanently. The
                platform enforces it — not a policy document.
              </span>
            </div>
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">Your data, isolated</span>
              <span className="v3m-receipt__v">
                Every business's conversations, contacts, and configuration are
                scoped to that business. Full stop.
              </span>
            </div>
            <div className="v3m-receipt__row">
              <span className="v3m-receipt__k">Honest identity</span>
              <span className="v3m-receipt__v">
                The receptionist says what it is. It never impersonates a
                person or another business.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7 · Works with your systems ── */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">
              <CalendarCheck aria-hidden="true" size={14} />
              Connected
            </span>
            <h2 className="v3-h2">Part of the SiteMint system.</h2>
            <p className="v3-body">
              The receptionist books against your availability, writes to your
              records, and pairs naturally with SiteMint discovery and
              automation — so a phone call and a website inquiry end up in the
              same organized place.
            </p>
            <div className="v3m-hero__actions">
              <Link href={ROUTES.automation} className="v3-btn v3-btn--outline">
                How SiteMint systems connect
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </div>
          <div className="v3m-split__media">
            <div className="v3-card v3h-demo" data-tone="white">
              <div className="v3h-demo__head">
                <p className="v3h-demo__title">One inquiry, two doors</p>
                <span className="v3m-example-note">Demonstration</span>
              </div>
              <ul className="v3h-chain">
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Website visitor</strong> — completes discovery at
                    2 PM
                  </span>
                </li>
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Caller</strong> — reaches the receptionist at 9 PM
                  </span>
                </li>
                <li>
                  <span className="v3h-chain__dot" aria-hidden="true" />
                  <span>
                    <strong>Same system</strong> — both are organized records by
                    morning
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8 · Getting started ── */}
      <section className="v3-section" data-tone="white" id="getting-started">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">Getting started</span>
            <h2 className="v3-display">Live when you say so.</h2>
            <p className="v3-lede">
              Nothing answers your customers until you've tested it yourself
              and said go.
            </p>
          </div>
          <ol className="v3m-steps">
            {setupSteps.map((step, i) => (
              <li key={step.title} className="v3m-step">
                <span className="v3m-step__no" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="v3m-step__title v3m-step__head">{step.title}</h3>
                <p className="v3m-step__body">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 9 · Early access ── */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3sp-two v3-reveal" ref={reveal}>
          <span className="v3m-sechead__no">Pricing</span>
          <div className="v3sp-two__body">
            <h2 className="v3-h2">Early access, honestly priced.</h2>
            <p className="v3-body">
              The AI Receptionist is in early access: straightforward monthly
              plans with metered usage, shared in full during setup. We don't
              publish numbers here that could be stale by the time you read
              them — and there's no long-term lock-in while the product earns
              its keep.
            </p>
          </div>
        </div>
      </section>

      {/* ── 10 · FAQ ── */}
      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">FAQ</span>
            <h2 className="v3-h2">Fair questions, straight answers.</h2>
          </div>
          <div className="v3m-faq">
            {faqs.map((faq) => (
              <details key={faq.q} className="v3m-faq__item">
                <summary className="v3m-faq__q">{faq.q}</summary>
                <p className="v3m-faq__a">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 11 · Final CTA ── */}
      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <p className="v3-serif-note">Every call answered.</p>
          <h2 className="v3-display">
            Your next missed call doesn't have to be one.
          </h2>
          <div className="v3m-cta__actions">
            <Link
              href={ROUTES.aiReceptionistSignup}
              className="v3-btn v3-btn--primary"
            >
              Get started
            </Link>
            <Link href={ROUTES.start} className="v3-btn v3-btn--outline">
              Start with SiteMint
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
