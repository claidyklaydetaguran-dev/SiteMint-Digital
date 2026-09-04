/**
 * AI Receptionist V5 — the product-only landing page (§AiReceptionistV5).
 *
 * Seventeen anchored sections, owner-approved order (OWNER-REVIEW-WORKBOOK
 * L-8, V5-BLUEPRINT §8; the ids and their order live in
 * `receptionist-v5/sections.ts` so the contract test cannot drift from what
 * actually renders). Every capability is labelled Available now / Private
 * beta / In development / Planned — nothing planned reads as live. No
 * "24/7", "every call", or active-service implication anywhere on the page.
 *
 * `PublicShell` is rendered here rather than in `App.tsx` so this page
 * carries its own shell wiring end-to-end without touching the shared
 * router file. `headerMode="product"` is being added to `PublicShellProps`
 * by the website owner in a parallel worktree and does not exist in this
 * worktree's `PublicShell.tsx` yet — see the typed cast below.
 */

import { useEffect, useState } from "react";
import { PublicShell } from "@/shells/PublicShell";
import { DASHBOARD_URLS } from "@/lib/routes";
import {
  CONTACT_EMAIL,
  HERO_COPY,
  PRICING_POSTURE,
  RECEPTIONIST_V5_SECTIONS,
  PRIVACY_STATEMENT,
} from "@/pages/receptionist-v5/sections";
import { CallTheaterV5 } from "@/components/receptionist-v5/CallTheaterV5";
import { LiveDemoPanel } from "@/components/receptionist-v5/LiveDemoPanel";
import { BetaRequestForm } from "@/components/receptionist-v5/BetaRequestForm";
import "@/components/receptionist-v5/receptionist-v5.css";

const SECTION_ID = Object.fromEntries(
  RECEPTIONIST_V5_SECTIONS.map((s) => [s.id, s.id]),
) as Record<(typeof RECEPTIONIST_V5_SECTIONS)[number]["id"], string>;

/* ── Readiness badges (§what-it-does) ───────────────────────────────────── */

type Readiness = "available" | "beta" | "development" | "planned";

const READINESS_LABEL: Record<Readiness, string> = {
  available: "Available now",
  beta: "Private beta",
  development: "In development",
  planned: "Planned",
};

function ReadinessBadge({ status }: { status: Readiness }) {
  return <span className={`smv5-badge smv5-badge--${status}`}>{READINESS_LABEL[status]}</span>;
}

/* ── Hero media: poster-first, video only ≥768px after load ────────────── */

/**
 * Development placeholder — final media pending. No cinematic hero video
 * asset exists in the repository yet (V5-BLUEPRINT §6 storyboard, §17
 * performance strategy: poster first, video only ≥768px after load, no
 * source without owner-authorised generation). The eligibility check below
 * is fully wired for when a real file lands; until then it always resolves
 * to the poster so nothing 404s.
 */
const HERO_VIDEO_SRC = "";

function useHeroVideoEligible(): boolean {
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    function check() {
      if (window.innerWidth >= 768) setEligible(true);
    }
    if (document.readyState === "complete") {
      check();
      return undefined;
    }
    window.addEventListener("load", check, { once: true });
    return () => window.removeEventListener("load", check);
  }, []);
  return eligible;
}

function HeroPosterSvg() {
  return (
    <svg viewBox="0 0 640 400" role="img" aria-labelledby="smv5-hero-poster-title">
      <title id="smv5-hero-poster-title">Development placeholder — final media pending</title>
      <rect width="640" height="400" fill="#072022" />
      <circle cx="320" cy="180" r="86" fill="none" stroke="#25D0B0" strokeWidth="2" opacity="0.8" />
      <circle cx="320" cy="180" r="52" fill="none" stroke="#4FD9CF" strokeWidth="2" opacity="0.55" />
      <circle cx="320" cy="180" r="6" fill="#25D0B0" />
      <text x="320" y="330" textAnchor="middle" fill="#cfe9e4" fontSize="15" fontFamily="sans-serif">
        Development placeholder — final media pending
      </text>
    </svg>
  );
}

function HeroMedia() {
  const eligible = useHeroVideoEligible();
  const showVideo = eligible && HERO_VIDEO_SRC.length > 0;
  return (
    <div className="smv5-hero__media">
      {showVideo ? (
        <video muted playsInline autoPlay loop aria-hidden="true">
          <source src={HERO_VIDEO_SRC} type="video/mp4" />
        </video>
      ) : (
        <HeroPosterSvg />
      )}
      <span className="smv5-hero__media-label">Development placeholder — final media pending</span>
    </div>
  );
}

/* ── Static content ──────────────────────────────────────────────────────
 * Verified, non-numeric ideas only (no statistics), harvested per W-18 from
 * the retired `LandingLawyers.tsx` / `LandingRealtors.tsx` — the pain-point
 * framing on those pages (response-time pressure, unqualified-lead intake,
 * showing coordination) is dropped along with every percentage claim on
 * them; only the underlying, verifiable capability ideas carry forward.
 */

const WHAT_IT_DOES: { title: string; body: string; status: Readiness }[] = [
  {
    title: "Interactive product preview",
    body: "A simulated conversation you can try right now, with no call, no microphone, and no cost.",
    status: "available",
  },
  {
    title: "Answering and guiding callers",
    body: "Greeting callers, asking your questions, and helping them reach the right next step by your business rules.",
    status: "development",
  },
  {
    title: "Appointment scheduling and calendar",
    body: "Availability check, request, approve/book, reschedule, cancel, and Google Calendar availability — certified on staging; customer controls arriving in the private beta.",
    status: "beta",
  },
  {
    title: "Voice and prompt configuration",
    body: "A guided structured prompt, curated voice presets with samples, and a preview of how callers will hear it.",
    status: "beta",
  },
  {
    title: "Calls, contacts and outcomes",
    body: "A record of what happened on each call and what it led to — without storing audio or a full transcript.",
    status: "beta",
  },
  {
    title: "Assigned number and live inbound calling",
    body: "A dedicated phone number that routes real calls to the receptionist, activated once testing is approved.",
    status: "development",
  },
  {
    title: "Safe-failure handling",
    body: "Defined behaviour for what the receptionist should never attempt, and when a call should be handed off instead.",
    status: "beta",
  },
  {
    title: "Human transfer",
    body: "Handing a call to a person mid-conversation, for situations the receptionist shouldn't resolve alone.",
    status: "planned",
  },
];

const SCHEDULING_STEPS = [
  { title: "Availability check", body: "The receptionist checks real open slots against your calendar and rules." },
  { title: "Request", body: "A caller's preferred time is captured as a request, not an automatic booking." },
  { title: "Approve / book", body: "A request is reviewed and confirmed, moving it onto the calendar." },
  { title: "Reschedule", body: "A booked appointment can be moved to a new time with the change tracked." },
  { title: "Cancel", body: "A booking can be cancelled, freeing the slot and closing out the record." },
  { title: "Google Calendar availability", body: "Availability reflects your connected Google Calendar, not a static schedule." },
];

const EXAMPLES: { label: string; lines: { who: string; text: string }[] }[] = [
  {
    label: "Simulated example — appointment request",
    lines: [
      { who: "Caller", text: "“Hi, do you have anything open this week?”" },
      { who: "Assistant", text: "“I can check. What day works best, and is there a time of day you'd prefer?”" },
      { who: "Caller", text: "“Thursday afternoon, if possible.”" },
      { who: "Assistant", text: "“Got it — I'll put in a request for Thursday afternoon and the team will confirm with you.”" },
    ],
  },
  {
    label: "Simulated example — routine question",
    lines: [
      { who: "Caller", text: "“What are your hours?”" },
      { who: "Assistant", text: "“We're open weekdays, nine to six. Is there anything else I can help with?”" },
      { who: "Caller", text: "“That's all, thanks.”" },
      { who: "Assistant", text: "“You're welcome — have a good day.”" },
    ],
  },
  {
    label: "Simulated example — handoff",
    lines: [
      { who: "Caller", text: "“This is actually kind of urgent, I need to speak with someone directly.”" },
      { who: "Assistant", text: "“Understood — I'll pass this to the team right away with what you've told me so far.”" },
      { who: "System", text: "Escalated to the team with conversation context." },
    ],
  },
];

const USE_CASES: { title: string; body: string }[] = [
  {
    title: "Professional services",
    body: "Fielding routine questions and appointment requests so staff time goes to the work itself, not the phone.",
  },
  {
    title: "Legal offices",
    body: "Capturing the basics of an inquiry — what it's about and how soon it's needed — before a person picks it up.",
  },
  {
    title: "Real estate teams",
    body: "Handling incoming questions about availability and coordinating a next step while an agent is with a client.",
  },
  {
    title: "Home services",
    body: "Answering calls about scheduling and service questions when the team is on a job site, not at a desk.",
  },
  {
    title: "Healthcare offices",
    body: "Handling routine scheduling questions only, within the same no-audio, no-transcript retention policy as every other business — sensitive clinical conversations still route to staff.",
  },
  {
    title: "Appointment-based businesses",
    body: "Any business whose calls are mostly about booking, changing, or confirming a time.",
  },
];

const SETUP_STEPS = [
  "Tell SiteMint about your business.",
  "Configure the receptionist, its voice, and its permitted actions.",
  "Set availability and connect Google Calendar.",
  "Test and approve the experience.",
  "Activate the assigned number.",
  "Review calls, contacts, and appointments.",
];

const OUTCOMES = [
  "Fewer missed opportunities",
  "Consistent caller handling",
  "Less repetitive admin",
  "Easier appointment coordination",
  "Visibility after each call",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is this live today?",
    a: "The Interactive Preview above is a real, working simulation you can try right now — it makes no call and stores nothing. Live call answering is still being certified and is not yet advertised as active.",
  },
  {
    q: "What happens to call data?",
    a: "SiteMint does not retain call audio or full transcripts. The dashboard stores only the operational call details and outcomes needed to manage the receptionist.",
  },
  {
    q: "How much does it cost?",
    a: PRICING_POSTURE,
  },
  {
    q: "Can I sign up right now?",
    a: "The AI Receptionist is invite-only during private beta. Requesting access starts the conversation — it does not create an account immediately.",
  },
  {
    q: "What if the receptionist can't handle something?",
    a: "Every account defines what the receptionist should never attempt and when a call should be handed to a person instead — see the safe-failure section below.",
  },
  {
    q: "Which businesses is this built for?",
    a: "Any business whose calls are mostly routine questions and appointment coordination — see the use-cases section for specifics.",
  },
];

export default function AiReceptionistV5() {
  return (
    <PublicShell
      routeLabel="AI Receptionist"
      chrome="v4"
      heroTone="ink"
      // INTEGRATION: headerMode prop from website owner. `PublicShellProps`
      // does not declare `headerMode` in this worktree yet — the website
      // owner is adding it in a parallel worktree so this route's header
      // shows product-only actions (Request Beta Access / Explore the
      // Interactive Preview / sign in) instead of the company CTA.
      {...({ headerMode: "product" } as any)}
    >
      <div className="smv5">
        {/* ── 1 · Hero ──────────────────────────────────────────────── */}
        <section id={SECTION_ID.hero} className="smv5-hero">
          <div className="smv5__container smv5-hero__grid">
            <div>
              <span className="smv5-hero__pill">{HERO_COPY.pill}</span>
              <h1 className="smv5-hero__title">{HERO_COPY.title}</h1>
              <p className="smv5-hero__sub">{HERO_COPY.supporting}</p>
              <div className="smv5-hero__ctas">
                <a href={`#${SECTION_ID.beta}`} className="smv5-btn smv5-btn--primary">
                  {HERO_COPY.primaryCta}
                </a>
                <a href={`#${SECTION_ID.preview}`} className="smv5-btn smv5-btn--outline">
                  {HERO_COPY.secondaryCta}
                </a>
              </div>
              <p className="smv5-hero__signin">
                {HERO_COPY.signInPrompt}{" "}
                <a href={DASHBOARD_URLS.login}>{HERO_COPY.signInCta}</a>
              </p>
            </div>
            <HeroMedia />
          </div>
        </section>

        {/* ── 2 · Call theater / Interactive Preview ───────────────────── */}
        <section id={SECTION_ID.preview} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Interactive preview</span>
            <h2 className="smv5__h2">See how it responds, before you request access</h2>
            <p className="smv5__lede">
              Pick a topic and watch the same voice-object states a real conversation moves
              through — Ready, Listening, Thinking, Speaking. Nothing here places a call.
            </p>
            <CallTheaterV5 />
          </div>
        </section>

        {/* ── 3 · Try the AI ────────────────────────────────────────────── */}
        <section id={SECTION_ID.try} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Try the AI</span>
            <h2 className="smv5__h2">Two ways to try it</h2>
            <p className="smv5__lede">
              The Interactive Preview above is the default: a simulated conversation with no
              provider call and no marginal cost, available to everyone. A short, consent-based
              live demo is planned for after the browser call passes end-to-end certification.
            </p>
            <div className="smv5-grid">
              <div className="smv5-card">
                <h3>Interactive Preview</h3>
                <p>
                  Curated, scripted branches that show the product's behaviour today. Try it in
                  the section above.
                </p>
              </div>
              <LiveDemoPanel />
            </div>
          </div>
        </section>

        {/* ── 4 · What it does ─────────────────────────────────────────── */}
        <section id={SECTION_ID["what-it-does"]} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">What it does</span>
            <h2 className="smv5__h2">What's available now, and what's coming</h2>
            <p className="smv5__lede">
              Every capability below is labelled honestly. Nothing marked Private beta, In
              development, or Planned is active for the public today.
            </p>
            <div className="smv5-grid">
              {WHAT_IT_DOES.map((item) => (
                <div className="smv5-card" key={item.title}>
                  <ReadinessBadge status={item.status} />
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5 · Appointment and calendar journey ─────────────────────── */}
        <section id={SECTION_ID.scheduling} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Appointments and calendar</span>
            <h2 className="smv5__h2">The full appointment lifecycle</h2>
            <p className="smv5__lede">
              Certified on staging; customer controls arriving in the private beta.
            </p>
            <ol className="smv5-steps smv5-steps--horizontal">
              {SCHEDULING_STEPS.map((step, i) => (
                <li className="smv5-step" key={step.title}>
                  <span className="smv5-step__num">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── 6 · Caller-experience examples ───────────────────────────── */}
        <section id={SECTION_ID.examples} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Caller examples</span>
            <h2 className="smv5__h2">What a conversation looks like</h2>
            <p className="smv5__lede">
              Three short, simulated exchanges — illustrative, not recordings of real calls.
            </p>
            <div className="smv5-grid">
              {EXAMPLES.map((ex) => (
                <div className="smv5-example" key={ex.label}>
                  <span className="smv5-example__label">{ex.label}</span>
                  {ex.lines.map((line, i) => (
                    <p key={i}>
                      <b>{line.who}:</b> {line.text}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 7 · Business-owner dashboard ─────────────────────────────── */}
        <section id={SECTION_ID.dashboard} className="smv5__section">
          <div className="smv5__container smv5-hero__grid">
            <div>
              <span className="smv5__eyebrow">Owner dashboard</span>
              <h2 className="smv5__h2">One place to see what the receptionist is doing</h2>
              <p className="smv5__lede">
                Setup progress, receptionist status, what needs attention, recent calls,
                appointments, and usage — with one clear next action, not a wall of numbers.
              </p>
            </div>
            <div className="smv5-illustration" role="img" aria-label="Illustration — dashboard overview, development placeholder">
              Illustration — dashboard overview
            </div>
          </div>
        </section>

        {/* ── 8 · Voice and prompt configuration ───────────────────────── */}
        <section id={SECTION_ID.configuration} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Voice and prompt</span>
            <h2 className="smv5__h2">Configured to sound and act like your business</h2>
            <p className="smv5__lede">
              A guided, structured prompt covers your greeting, business information, the
              questions to ask, appointment rules, permitted actions, escalation behaviour, and
              closing — with a preview of how callers will hear it. Curated voice presets ship
              with samples so you can hear the receptionist before it ever answers a call.
            </p>
          </div>
        </section>

        {/* ── 9 · Calls, contacts and outcomes ─────────────────────────── */}
        <section id={SECTION_ID.outcomes} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Calls, contacts, outcomes</span>
            <h2 className="smv5__h2">A clear record, without the raw recording</h2>
            <p className="smv5__lede">
              Each call is tracked with a status, an outcome, and — when relevant — a linked
              contact and appointment, so you can see what happened without listening to
              audio that was never kept.
            </p>
          </div>
        </section>

        {/* ── 10 · Safe-failure behaviour ───────────────────────────────── */}
        <section id={SECTION_ID["safe-failure"]} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Safe failure</span>
            <h2 className="smv5__h2">What the receptionist won't attempt on its own</h2>
            <p className="smv5__lede">
              Every account sets explicit boundaries: topics it won't address, actions it won't
              take, and the situations — an upset caller, a request outside scope, anything
              ambiguous — where it hands off to a person with the conversation's context
              instead of guessing.
            </p>
          </div>
        </section>

        {/* ── 11 · Privacy and retention ────────────────────────────────── */}
        <section id={SECTION_ID.privacy} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Privacy and retention</span>
            <h2 className="smv5__h2">What's kept, and what isn't</h2>
            <p className="smv5-privacy">{PRIVACY_STATEMENT}</p>
          </div>
        </section>

        {/* ── 12 · Built for different businesses ──────────────────────── */}
        <section id={SECTION_ID["use-cases"]} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Built for different businesses</span>
            <h2 className="smv5__h2">Where it fits</h2>
            <div className="smv5-grid">
              {USE_CASES.map((uc) => (
                <div className="smv5-card smv5-usecase" key={uc.title}>
                  <h3>{uc.title}</h3>
                  <p>{uc.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 13 · Setup process ───────────────────────────────────────── */}
        <section id={SECTION_ID.setup} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Setup process</span>
            <h2 className="smv5__h2">Six steps from invite to first call</h2>
            <ol className="smv5-steps smv5-steps--horizontal">
              {SETUP_STEPS.map((step, i) => (
                <li className="smv5-step" key={step}>
                  <span className="smv5-step__num">{String(i + 1).padStart(2, "0")}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── 14 · Private-beta posture ────────────────────────────────── */}
        <section id={SECTION_ID["beta-posture"]} className="smv5__section smv5__section--tight">
          <div className="smv5__container">
            <span className="smv5-badge smv5-badge--beta">{HERO_COPY.pill}</span>
            <p className="smv5__lede" style={{ marginBottom: 0 }}>
              {PRICING_POSTURE}
            </p>
          </div>
        </section>

        {/* ── Outcomes strip (L-4, folded into the flow near the FAQ) ──── */}
        <section className="smv5__section smv5__section--tight">
          <div className="smv5__container">
            <span className="smv5__eyebrow">What businesses notice</span>
            <ul className="smv5-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {OUTCOMES.map((o) => (
                <li className="smv5-card" key={o}>
                  <p style={{ color: "var(--smv5-teal-900)", fontWeight: 600 }}>{o}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 15 · FAQ ──────────────────────────────────────────────────── */}
        <section id={SECTION_ID.faq} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">FAQ</span>
            <h2 className="smv5__h2">Straight answers</h2>
            <div className="smv5-faq">
              {FAQ.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── 16 · Request Beta Access ──────────────────────────────────── */}
        <section id={SECTION_ID.beta} className="smv5__section">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Request Beta Access</span>
            <h2 className="smv5__h2">Start the conversation</h2>
            <p className="smv5__lede">
              The AI Receptionist is invite-only during private beta. Tell us about your
              business and the SiteMint team will follow up to walk through onboarding. If
              beta requests aren't open yet, you'll see exactly why below.
            </p>
            <BetaRequestForm />
            <p className="smv5__lede" style={{ marginTop: 20, fontSize: 13 }}>
              Prefer email? Reach us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </div>
        </section>

        {/* ── 17 · Existing client sign-in ─────────────────────────────── */}
        <section id={SECTION_ID["sign-in"]} className="smv5__section smv5__section--tight smv5-cta-band">
          <div className="smv5__container">
            <span className="smv5__eyebrow">Existing clients</span>
            <h2 className="smv5__h2">Already have an account?</h2>
            <a href={DASHBOARD_URLS.login} className="smv5-btn smv5-btn--primary">
              Sign in
            </a>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
