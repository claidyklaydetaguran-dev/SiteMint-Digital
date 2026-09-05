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

import { useEffect, useState, type CSSProperties } from "react";
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
import { Reveal } from "@/components/v5/Reveal";
import { useArmedReveal, useHeadlineEntrance, usePausableAmbient } from "@/components/receptionist-v5/heroMotion";
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
 * The film mount contract (owner spec, wp-herofilm): a cinematic film
 * placement in the hero's right-column visual card, shipping now with a
 * composed poster placeholder. No produced asset exists in the repository
 * yet (V5-BLUEPRINT §6 storyboard, §17 performance strategy: poster first,
 * video only ≥768px after load, no source without owner-authorised
 * generation) — setting this to a produced video's URL (mp4/webm, ~2560×1440
 * source, 16:9) is the only step required to go live; the eligibility check
 * below is fully wired for that moment. Until then it stays `null` and
 * always resolves to the poster, so nothing 404s.
 */
import recepFilmSrc from "@/assets/media/recep-hero-film.mp4";
import recepFilmPoster from "@/assets/media/recep-hero-film-poster.jpg";
const HERO_FILM_SRC: string | null = recepFilmSrc;

/** A tiny hand-authored SVG data URI shown as the `<video poster>` for the
 * instant between mount and first frame — separate from the JSX poster
 * below so it needs no render-to-string dependency. */
const HERO_FILM_POSTER_DATA_URI =
  recepFilmPoster;

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

/**
 * A composed Glacier Mint placeholder — a faint availability-grid motif
 * (echoing the calendar/scheduling capability) behind the same concentric
 * voice-object ring used in the Interactive Preview, tying the hero
 * visually to the product it's introducing. The caption lives once, in the
 * overlay label below (`smv5-hero__media-label`) — this graphic carries no
 * text of its own beyond the non-visual `<title>` for assistive tech.
 *
 * Film placement (wp-herofilm): a sprocket-hole rail along both edges reads
 * this card unmistakably as a film container rather than a generic device
 * illustration, at the same 16:9 aspect the eventual produced video ships
 * at — the ring/grid motif underneath is unchanged.
 *
 * Cinematic motion (2026-09-05 owner directive) — "call ring" motif: two
 * extra rings pulse outward ambiently (`.smv5-poster__pulse`), echoing the
 * call theater's own voice-object animation. Ambient and non-essential —
 * `stroke`/`transform`/`opacity` only, paused via `data-ambient-paused`
 * (set by `usePausableAmbient` on the enclosing `.smv5-hero__media`) and
 * removed entirely under `prefers-reduced-motion: reduce` in CSS.
 */
function HeroPosterSvg() {
  const availabilityDots: Array<[number, number]> = [
    [88, 71], [258, 71], [428, 71], [564, 71],
    [54, 275], [190, 309], [394, 309], [599, 275],
  ];
  const sprocketYs = [24, 78, 132, 186, 240, 294, 348];
  return (
    <svg viewBox="0 0 640 400" role="img" aria-labelledby="smv5-hero-poster-title">
      <title id="smv5-hero-poster-title">Brand film — representative small-business scene</title>
      <defs>
        <pattern id="smv5-avail-grid" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect x="3" y="3" width="24" height="24" rx="4" fill="none" stroke="#1c4a4d" strokeWidth="1.1" />
        </pattern>
        <radialGradient id="smv5-hero-glow" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="#0d3336" />
          <stop offset="100%" stopColor="#04181a" />
        </radialGradient>
      </defs>
      <rect width="640" height="400" fill="url(#smv5-hero-glow)" />
      <rect width="640" height="400" fill="url(#smv5-avail-grid)" opacity="0.6" />
      {availabilityDots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#32C5D2" opacity="0.65" />
      ))}
      <circle
        className="smv5-poster__pulse"
        cx="320"
        cy="200"
        r="92"
        fill="none"
        stroke="#32C5D2"
        strokeWidth="2"
        style={{ animationDelay: "0ms" }}
        aria-hidden="true"
      />
      <circle
        className="smv5-poster__pulse"
        cx="320"
        cy="200"
        r="92"
        fill="none"
        stroke="#56D2CF"
        strokeWidth="2"
        style={{ animationDelay: "900ms" }}
        aria-hidden="true"
      />
      <circle cx="320" cy="200" r="92" fill="none" stroke="#32C5D2" strokeWidth="2" opacity="0.85" />
      <circle cx="320" cy="200" r="56" fill="none" stroke="#56D2CF" strokeWidth="2" opacity="0.6" />
      <circle cx="320" cy="200" r="6" fill="#32C5D2" />
      {sprocketYs.map((y) => (
        <g key={`sprocket-${y}`} opacity="0.55">
          <rect x="10" y={y} width="14" height="20" rx="3" fill="none" stroke="#56D2CF" strokeWidth="1.2" />
          <rect x="616" y={y} width="14" height="20" rx="3" fill="none" stroke="#56D2CF" strokeWidth="1.2" />
        </g>
      ))}
    </svg>
  );
}

function HeroMedia() {
  const eligible = useHeroVideoEligible();
  const showVideo = eligible && !!HERO_FILM_SRC;
  const ambientRef = usePausableAmbient<HTMLDivElement>();
  return (
    <div className="smv5-hero__media" ref={ambientRef}>
      {showVideo && HERO_FILM_SRC ? (
        <video
          muted
          playsInline
          autoPlay
          loop
          preload="none"
          poster={HERO_FILM_POSTER_DATA_URI}
          aria-hidden="true"
        >
          <source src={HERO_FILM_SRC} type="video/mp4" />
        </video>
      ) : (
        <HeroPosterSvg />
      )}
      <span className="smv5-hero__media-label">Brand film — representative small-business scene</span>
    </div>
  );
}

/**
 * The hero headline's masked-line reveal (2026-09-05 owner directive).
 *
 * Deliberately NOT built on `components/v5/Reveal.tsx` — this heading is
 * expected to be the page's LCP element (largest text block, first paint,
 * above the fold with no image ahead of it), and Reveal's word-clip-rise
 * animates each word's `opacity` from 0, which delays/forfeits LCP credit
 * for a fade-from-invisible element. `clip-path` does not carry that
 * penalty (Chrome's LCP algorithm only excludes `opacity: 0` content), so
 * this component reveals the line with an `inset()` wipe instead — the
 * glyphs themselves stay at `opacity: 1` for their entire lifetime,
 * including the very first painted frame.
 *
 * Progressive by construction, same contract as `useRevealV5`: the heading
 * renders unclipped (fully visible, no class) until `armed` flips true in a
 * post-mount effect, so a reader with JavaScript disabled — or an observer
 * that never fires — always sees the finished heading, never a stuck wipe.
 */
function HeroHeadlineReveal({ text }: { text: string }) {
  const { ref, armed, revealed } = useHeadlineEntrance<HTMLHeadingElement>();
  const classes = [
    "smv5-hero__title",
    armed && "smv5-hero__title--armed",
    revealed && "smv5-hero__title--in",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <h1 ref={ref} className={classes}>
      {text}
    </h1>
  );
}

/**
 * A quiet cue that content continues below the fold — required because the
 * hero is now a full first viewport with the primary/secondary actions
 * already in view, so nothing else hints there's more page beneath it.
 * Ambient bounce, paused via `usePausableAmbient`; static (no animation) and
 * still visibly present under reduced motion, so it keeps communicating
 * "scroll for more" without motion. Hidden below 768px (§ mobile
 * simplification) where vertical space is already tight.
 */
function HeroScrollCue() {
  const ambientRef = usePausableAmbient<HTMLDivElement>();
  return (
    <div className="smv5-hero__scrollcue" ref={ambientRef} aria-hidden="true">
      <span className="smv5-hero__scrollcue-glyph" />
      <span className="smv5-hero__scrollcue-label">Scroll</span>
    </div>
  );
}

/**
 * "Calendar availability" motif (§SCHEDULING_STEPS) — a small 3×2 slot grid
 * where one slot lights up once the step scrolls into view, representing a
 * checked, open slot. Reveal-once; `opacity`/`transform` only — the lit
 * slot is mint from the start, it simply fades and scales in rather than
 * changing color, so nothing here animates a `fill`.
 */
function AvailabilitySlotGlyph() {
  const { ref, armed, revealed } = useArmedReveal<SVGSVGElement>(0.4);
  const classes = [
    "smv5-step__glyph",
    armed && "smv5-step__glyph--armed",
    revealed && "smv5-step__glyph--in",
  ]
    .filter(Boolean)
    .join(" ");
  const litIndex = 4;
  return (
    <svg ref={ref} className={classes} viewBox="0 0 66 44" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = (i % 3) * 22 + 2;
        const y = Math.floor(i / 3) * 20 + 2;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width="18"
            height="16"
            rx="3"
            className={i === litIndex ? "smv5-step__slot smv5-step__slot--lit" : "smv5-step__slot"}
          />
        );
      })}
    </svg>
  );
}

/**
 * "Appointment result" motif (§SCHEDULING_STEPS) — a confirmation checkmark
 * that draws in via `stroke-dashoffset` once the "Approve / book" step
 * scrolls into view. Reveal-once; `stroke-dashoffset` only, no `opacity`.
 */
function ConfirmCheckGlyph() {
  const { ref, armed, revealed } = useArmedReveal<SVGSVGElement>(0.4);
  const classes = [
    "smv5-step__glyph",
    armed && "smv5-step__glyph--armed",
    revealed && "smv5-step__glyph--in",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <svg ref={ref} className={classes} viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="19" className="smv5-step__confirm-ring" />
      <path d="M13 22.5 19 28.5 31 15" className="smv5-step__confirm-check" />
    </svg>
  );
}

/* ── Hero capability strip — three qualitative outcomes as compact inline
 * items, balancing the left column against the media card at desktop
 * heights instead of leaving empty space below the sign-in link. ───────── */

const HERO_CAPABILITY_HIGHLIGHTS = [
  "Fewer missed opportunities",
  "Consistent caller handling",
  "Less repetitive admin",
];

function HeroCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="7" fill="#32C5D2" opacity="0.22" />
      <path d="M4 7.2 6.1 9.3 10 5" fill="none" stroke="#56D2CF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The same check mark, sized for the mint outcome chips (§outcomes strip). */
function OutcomeCheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 7.4 5.6 10 11 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A composed placeholder for the owner-dashboard section — a small mock
 * console (header bar, three stat tiles, four data rows) rather than a
 * dashed box holding only a caption. Purely illustrative, no real or
 * implied numbers.
 *
 * "Dashboard outcome" motif (2026-09-05): once the section scrolls into
 * view, the three stat tiles and four rows populate in sequence instead of
 * appearing all at once — `transform` + `opacity` only, staggered via
 * `--sm-stagger-index`, scoped under `.sm-reveal`/`.sm-reveal--in` (added
 * post-mount by the `<Reveal>` wrapper below) so the illustration is fully
 * visible by default with no JavaScript.
 */
function DashboardIllustration() {
  return (
    <Reveal as="div" className="smv5-illustration">
      <svg viewBox="0 0 320 220" aria-hidden="true" className="smv5-illustration__svg">
        <rect x="1" y="1" width="318" height="218" rx="14" fill="var(--smv5-white, #fff)" stroke="var(--smv5-line, #CFE7EA)" />
        <circle cx="30" cy="30" r="6" fill="var(--smv5-mint-500, #32C5D2)" />
        <rect x="44" y="26" width="120" height="8" rx="4" fill="var(--smv5-line-strong, #A9CFD6)" />
        {[0, 1, 2].map((i) => (
          <g
            key={i}
            className="smv5-illustration__tile"
            transform={`translate(${16 + i * 100}, 56)`}
            style={{ "--sm-stagger-index": i } as CSSProperties}
          >
            <rect width="88" height="46" rx="8" fill="var(--smv5-mint-100, #DFF7F7)" />
            <rect x="10" y="12" width="40" height="6" rx="3" fill="var(--smv5-mint-700, #0B7487)" opacity="0.5" />
            <rect x="10" y="24" width="28" height="10" rx="4" fill="var(--smv5-mint-700, #0B7487)" />
          </g>
        ))}
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            className="smv5-illustration__row"
            x="16"
            y={116 + i * 24}
            width="288"
            height="16"
            rx="4"
            fill={i % 2 === 0 ? "var(--smv5-mist-100, #EDF9FA)" : "var(--smv5-white, #fff)"}
            stroke="var(--smv5-line, #CFE7EA)"
            style={{ "--sm-stagger-index": i + 3 } as CSSProperties}
          />
        ))}
      </svg>
      <span className="smv5-illustration__label">
        Illustration — dashboard overview, development placeholder
      </span>
    </Reveal>
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

/**
 * `motif` drives the two scheduling-lifecycle cinematic beats (2026-09-05
 * owner directive): "availability" renders `AvailabilitySlotGlyph` (calendar
 * availability — a slot grid with one slot lighting) on the two steps that
 * are literally about checking availability; "confirm" renders
 * `ConfirmCheckGlyph` (appointment result — a confirmation state) on the
 * step where a request becomes a booking.
 */
const SCHEDULING_STEPS: {
  title: string;
  body: string;
  motif?: "availability" | "confirm";
}[] = [
  {
    title: "Availability check",
    body: "The receptionist checks real open slots against your calendar and rules.",
    motif: "availability",
  },
  { title: "Request", body: "A caller's preferred time is captured as a request, not an automatic booking." },
  {
    title: "Approve / book",
    body: "A request is reviewed and confirmed, moving it onto the calendar.",
    motif: "confirm",
  },
  { title: "Reschedule", body: "A booked appointment can be moved to a new time with the change tracked." },
  { title: "Cancel", body: "A booking can be cancelled, freeing the slot and closing out the record." },
  {
    title: "Google Calendar availability",
    body: "Availability reflects your connected Google Calendar, not a static schedule.",
    motif: "availability",
  },
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
  {
    title: "Tell SiteMint about your business",
    body: "Share your business details, hours, and services so the receptionist starts with real context.",
  },
  {
    title: "Configure the receptionist",
    body: "Set its voice, its structured prompt, and exactly what it's permitted to say and do.",
  },
  {
    title: "Set availability",
    body: "Connect Google Calendar so scheduling reflects your real, current openings.",
  },
  {
    title: "Test and approve",
    body: "Run through real scenarios yourself before anything is activated.",
  },
  {
    title: "Activate the assigned number",
    body: "Turn on live inbound calling once testing is approved.",
  },
  {
    title: "Review calls and appointments",
    body: "See what happened on each call and how requests were handled.",
  },
];

/* ── Content used to ground the thinner text-only sections in specifics
 * (voice/prompt, calls & outcomes, safe-failure) without adding new claims
 * — each restates, as scannable tags, what its section's lede already
 * says. ─────────────────────────────────────────────────────────────── */

const CONFIG_TOPICS = [
  "Greeting",
  "Business info",
  "Questions to ask",
  "Appointment rules",
  "Permitted actions",
  "Escalation behaviour",
  "Closing",
];

const CALL_RECORD_FIELDS = ["Status", "Outcome", "Linked contact", "Linked appointment"];

const SAFE_FAILURE_EXAMPLES = [
  { situation: "Outside its script", response: "Hands off with context" },
  { situation: "Caller sounds upset", response: "Hands off with context" },
  { situation: "Request is ambiguous", response: "Hands off instead of guessing" },
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
      headerMode="product"
    >
      <div className="smv5">
        {/*
         * ── 1 · Hero ──────────────────────────────────────────────────
         * Full first viewport (owner directive, 2026-09-05): min-height is
         * 100svh, minus the fixed product header's `--v4-hdr-h` (read from
         * v4-chrome.css, never edited here — see receptionist-v5.css).
         * Entrance sequence — eyebrow → beta status → headline (masked line
         * reveal, LCP-safe) → support → actions → theater visual
         * (scale-settle) — each a `<Reveal>` beat except the headline,
         * which uses `HeroHeadlineReveal` specifically to avoid animating
         * the likely-LCP element via opacity (see that component's doc
         * comment). `HeroScrollCue` signals there's more below the fold.
         */}
        <section id={SECTION_ID.hero} className="smv5-hero">
          <div className="smv5__container smv5-hero__grid">
            <div>
              <Reveal as="span" className="smv5-hero__eyebrow" delay={0}>
                {HERO_COPY.eyebrow}
              </Reveal>
              <Reveal as="span" className="smv5-hero__pill" delay={60}>
                {HERO_COPY.betaStatus}
              </Reveal>
              <HeroHeadlineReveal text={HERO_COPY.title} />
              <Reveal as="p" className="smv5-hero__sub" delay={420}>
                {HERO_COPY.supporting}
              </Reveal>
              <Reveal as="div" className="smv5-hero__ctas" delay={520}>
                {/* Filled/primary — Interactive Preview is the lowest-friction
                    next step and gets the visual emphasis. */}
                <a href={`#${SECTION_ID.preview}`} className="smv5-btn smv5-btn--primary">
                  {HERO_COPY.primaryCta}
                </a>
                <a href={`#${SECTION_ID.beta}`} className="smv5-btn smv5-btn--outline">
                  {HERO_COPY.secondaryCta}
                </a>
              </Reveal>
              <Reveal as="p" className="smv5-hero__signin" delay={560}>
                {HERO_COPY.signInPrompt}{" "}
                <a href={DASHBOARD_URLS.login}>{HERO_COPY.signInCta}</a>
              </Reveal>
              <ul className="smv5-hero__capabilities">
                {HERO_CAPABILITY_HIGHLIGHTS.map((c) => (
                  <li key={c}>
                    <HeroCheckIcon />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <Reveal as="div" className="smv5-hero__visual" delay={620}>
              <HeroMedia />
            </Reveal>
          </div>
          <HeroScrollCue />
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
            <Reveal as="div">
              <CallTheaterV5 />
            </Reveal>
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
                  Seven curated topics — what SiteMint builds, what the receptionist does, how
                  setup works, and more — showing exactly how it responds today. Try it in the
                  section above.
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
            {/* "Business-rule lookup" motif: the six stops themselves reveal
                in order (transform + opacity, staggered) as this checklist
                scrolls into view — see `.smv5-steps--horizontal.sm-reveal`
                below. The two availability stops and the confirmation stop
                additionally carry their own dedicated glyph motif. */}
            <Reveal as="ol" className="smv5-steps smv5-steps--horizontal">
              {SCHEDULING_STEPS.map((step, i) => (
                <li
                  className="smv5-step"
                  key={step.title}
                  style={{ "--sm-stagger-index": i } as CSSProperties}
                >
                  <span className="smv5-step__num">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                    {step.motif === "availability" && <AvailabilitySlotGlyph />}
                    {step.motif === "confirm" && <ConfirmCheckGlyph />}
                  </div>
                </li>
              ))}
            </Reveal>
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
              {/* "Progressive conversation" motif: each card's lines reveal
                  in order (transform + opacity only) once the card scrolls
                  into view — see the `.smv5-example.sm-reveal` rules in
                  receptionist-v5.css. Default-visible with no class until
                  `Reveal` arms it post-mount, so a stalled observer never
                  leaves a line stuck invisible. */}
              {EXAMPLES.map((ex) => (
                <Reveal as="div" className="smv5-example" key={ex.label}>
                  <span className="smv5-example__label">{ex.label}</span>
                  {ex.lines.map((line, i) => (
                    <p
                      key={i}
                      className={`smv5-example__line smv5-example__line--${line.who.toLowerCase()}`}
                      style={{ "--sm-stagger-index": i } as CSSProperties}
                    >
                      <span className="smv5-example__who">{line.who}</span>
                      {line.text}
                    </p>
                  ))}
                </Reveal>
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
            <DashboardIllustration />
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
            <ul className="smv5-tag-row">
              {CONFIG_TOPICS.map((topic) => (
                <li className="smv5-tag" key={topic}>
                  {topic}
                </li>
              ))}
            </ul>
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
            <ul className="smv5-tag-row">
              {CALL_RECORD_FIELDS.map((field) => (
                <li className="smv5-tag" key={field}>
                  {field}
                </li>
              ))}
            </ul>
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
            <ul className="smv5-tag-row">
              {SAFE_FAILURE_EXAMPLES.map((ex) => (
                <li className="smv5-tag" key={ex.situation}>
                  {ex.situation} <span className="smv5-tag__arrow">→</span>{" "}
                  <span className="smv5-tag--rule">{ex.response}</span>
                </li>
              ))}
            </ul>
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
            <p className="smv5__lede">
              The same underlying receptionist, configured differently for how each business
              actually uses its phone.
            </p>
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

        {/* ── 14 · Private-beta posture ────────────────────────────────── */}
        <section id={SECTION_ID["beta-posture"]} className="smv5__section smv5__section--tight">
          <div className="smv5__container">
            <span className="smv5-badge smv5-badge--beta">{HERO_COPY.betaStatus}</span>
            <p className="smv5__lede" style={{ marginBottom: 0 }}>
              {PRICING_POSTURE}
            </p>
          </div>
        </section>

        {/* ── Outcomes strip (L-4, folded into the flow near the FAQ) ──── */}
        <section className="smv5__section smv5__section--tight">
          <div className="smv5__container">
            <span className="smv5__eyebrow">What businesses notice</span>
            <ul className="smv5-outcomes">
              {OUTCOMES.map((o) => (
                <li key={o}>
                  <OutcomeCheckIcon />
                  {o}
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
