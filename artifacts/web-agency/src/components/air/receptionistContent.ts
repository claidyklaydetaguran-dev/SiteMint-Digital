/**
 * Frontend V2 Phase 4 — AI Receptionist landing content (verification-gated).
 *
 * Every statement in this file was checked against repository code before it was
 * written. The verification notes are kept inline deliberately: this page's
 * whole job is to be honest about what ships, and a future edit should not be
 * able to promote a capability without meeting the same bar.
 *
 * Sources of truth consulted:
 *  - `artifacts/api-server/src/routes/intakeAgent.ts` — inbound SMS webhook,
 *    LLM reply, qualifying-question loop, case extraction, completion handling,
 *    scoring call, and the notification email to the firm's `notifyEmail`.
 *  - `artifacts/api-server/src/lib/intakeScoring.ts` — `scoreIntakeCase`, the
 *    five tiers, and the disqualification rules.
 *  - `artifacts/api-server/src/lib/intakeOptOut.ts` — the exact opt-out,
 *    re-opt-in, and help keywords.
 *  - `lib/db/src/schema/intakeAgent.ts` — `intake_firms` (name, industry,
 *    businessDescription, qualifyingQuestions, notifyEmail),
 *    `intake_conversations`, `intake_messages`, `intake_cases`.
 *
 * **Scheduling is not implemented.** There is no appointment or booking table,
 * column, route, or provider call anywhere in the intake pipeline. It therefore
 * ships labelled *in development* and is never described as something a
 * business can use today.
 *
 * Prohibited throughout (CONTENT-SPECIFICATION.md §8 and §9): 24/7 or
 * always-on claims, "every call", response-time figures, customer or call
 * counts, industry counts, delivery timelines, prices, named third-party
 * integrations that are not verified, testimonials, and business results.
 */

import type { ReadinessTier } from "@/components/v2/home/readiness";

/* ── Section 2 — the five core jobs (CONTENT-SPECIFICATION.md §4.2). ────────
   Each is gated on repository evidence. Four are verified against the shipped
   SMS pipeline; `Schedule` is not implemented and is labelled accordingly. */
export interface CoreJob {
  name: string;
  /** Plain description — what the business gets, not how it is built. */
  body: string;
  tier: ReadinessTier;
}

export const CORE_JOBS: CoreJob[] = [
  {
    name: "Answer",
    // Verified: intakeAgent.ts replies to the inbound Twilio webhook.
    // No timing or availability wording — both were removed by §4.2.
    body: "Replies to an inbound text instead of leaving it sitting unread.",
    tier: "available",
  },
  {
    name: "Qualify",
    // Verified: firm.qualifyingQuestions drives the LLM loop; scoreIntakeCase
    // resolves the conversation to a tier.
    body: "Works through the questions your business chose, then sorts the result into a priority tier.",
    tier: "available",
  },
  {
    name: "Schedule",
    // NOT verified: no booking or appointment logic exists in the pipeline.
    body: "Moving a qualified conversation toward a booking. Being built — the receptionist does not book anything today.",
    tier: "in-development",
  },
  {
    name: "Record",
    // Verified: intake_conversations, intake_messages, intake_cases.
    body: "Keeps every message and the resulting case stored against your business, so the detail survives the conversation.",
    tier: "available",
  },
  {
    name: "Escalate",
    // Verified: notification email to firm.notifyEmail on completion, plus the
    // "Needs Review" tier for conversations the rules cannot settle.
    body: "Sends the summary to the person who should handle it, and flags anything it could not settle for review.",
    tier: "available",
  },
];

/* ── Section 3 — the response trail (the page's visual signature). ──────────
   Four stages: lead inquiry → acknowledgment → qualification → human handoff.
   The example wording is illustrative and is labelled as such at the section
   level; it is not a transcript of a real customer conversation.

   `side` splits the trail by **who is acting**, not by who sent a message:
   `human` is a person (the lead at the start, your team at the end) and
   `system` is the receptionist. That is why the trail opens and closes on the
   human side — the composition's whole argument is that a person begins the
   exchange and a person finishes it. */
export type TrailSide = "human" | "system";

export interface TrailStage {
  id: string;
  /** Who is speaking or acting at this point. */
  role: string;
  side: TrailSide;
  title: string;
  /** Illustrative message text, always rendered under an "example" label. */
  example: string;
  body: string;
  /** What is true in the system once this stage has happened. */
  state: string;
}

export const TRAIL_STAGES: TrailStage[] = [
  {
    id: "inquiry",
    role: "From the lead",
    side: "human",
    title: "An inquiry arrives",
    example:
      "Hi — do you handle water damage? Our basement flooded last night.",
    body: "Someone texts the number your receptionist answers on. This is the moment a business normally loses: the message lands somewhere nobody is watching.",
    state: "A conversation is opened and stored against your business.",
  },
  {
    id: "acknowledgment",
    role: "From the receptionist",
    side: "system",
    title: "It gets acknowledged",
    example:
      "Yes, we handle water damage. I can take a few details and pass this to the team — whereabouts are you?",
    body: "The receptionist replies rather than auto-responding with a holding message. The person knows they have reached a business that is paying attention.",
    state: "The reply is recorded in the same conversation thread.",
  },
  {
    id: "qualification",
    role: "From the receptionist",
    side: "system",
    title: "It asks what you need to know",
    example:
      "Got it. Is the water still coming in, and is this a home or a commercial property?",
    body: "It works through the questions you configured — up to six topics — rather than a fixed script written by us. The answers are extracted into a case as they arrive.",
    state:
      "The case is filled in and scored into a priority tier, or flagged for review when the answers do not settle it.",
  },
  {
    id: "handoff",
    role: "To a person at your business",
    side: "human",
    title: "A person takes over",
    example:
      "Summary sent to your team: possible water-damage job, residential, still active. Priority tier attached.",
    body: "The receptionist stops here. Your business is emailed the summary and the tier at the address you set, and the full thread is in your dashboard. What happens next is a person's decision.",
    state: "The handoff is explicit — nothing is closed, quoted, or booked automatically.",
  },
];

/** What the trail deliberately does not do. Shown inside the same composition
    so a future capability can never look as available as the shipped path. */
export const TRAIL_BOUNDARIES: Array<{
  name: string;
  body: string;
  tier: ReadinessTier;
}> = [
  {
    name: "Booking the job",
    body: "The receptionist does not put anything in a calendar. Scheduling is being built.",
    tier: "in-development",
  },
  {
    name: "Answering the phone",
    body: "This trail is text only. A spoken version is being built and is not taking customer calls.",
    tier: "in-development",
  },
  {
    name: "Filing it into a CRM",
    body: "Conversations do not flow into a CRM record on their own, and follow-up does not run itself. That is the direction, not a shipped feature.",
    tier: "planned",
  },
];

/* ── Section 4 — human control. Every line is a verified boundary. ───────── */
export const HUMAN_CONTROL: Array<{ title: string; body: string }> = [
  {
    title: "It never decides who you take on",
    body: "Scoring sorts a conversation into a tier so the urgent ones are obvious. It does not accept, decline, or rank your customers for you — a person reads the summary and decides.",
  },
  {
    title: "It never quotes or commits",
    body: "The receptionist gathers information. It does not negotiate, price work, or promise that your business will take a job.",
  },
  {
    title: "It stops when someone says stop",
    body: "A message of STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, or QUIT ends the conversation and no further replies are sent. START, YES, or UNSTOP resumes it.",
  },
  {
    title: "You can read everything it said",
    body: "Every inbound and outbound message is kept in the conversation thread in your dashboard. There is no part of the exchange you cannot see afterwards.",
  },
];

/* ── Section 5 — business scenarios, described as scenarios. ─────────────── */
export const SCENARIOS: Array<{ sector: string; body: string }> = [
  {
    sector: "Home services",
    body: "A burst pipe at 9pm. The question that matters is whether it is still leaking and where the property is — not a form with eleven fields.",
  },
  {
    sector: "Law",
    body: "Someone describing an incident. What the firm needs first is the type of matter, when it happened, and whether they already have counsel.",
  },
  {
    sector: "Real estate",
    body: "An enquiry about a listing. Which property, whether they are buying or selling, and how to reach them decides who picks it up.",
  },
  {
    sector: "Med spa",
    body: "A question about a treatment. Which service, and whether they have been in before, changes who should answer it.",
  },
  {
    sector: "Restaurant",
    body: "A message about a large table or a private event. Party size and date are what the manager needs before replying properly.",
  },
  {
    sector: "Retail",
    body: "A question about stock or a repair. Knowing the item and the branch turns a vague message into something answerable.",
  },
];

/* ── Section 7 — setup. Honest steps, honest effort, and no timeline. ────── */
export const SETUP_STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Create the account",
    body: "You sign up for an AI Receptionist account with your details and your business name.",
  },
  {
    title: "Describe the business",
    body: "What the business does and which industry it is in. This is what shapes how the receptionist talks and how a conversation is scored.",
  },
  {
    title: "Choose your questions",
    body: "Up to six topics you want asked before a lead reaches a person. These are yours to set — they are the difference between a message and a usable lead.",
  },
  {
    title: "Point it at the right people",
    body: "SiteMint connects the text number your receptionist answers on, and you tell us the address that should receive the summaries.",
  },
];

/* ── Section 8 — FAQ. No price, no timeline, no response time, no results. ─ */
export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What can we actually use today?",
    a: "The SMS receptionist. It answers inbound texts, asks the questions you configured, scores the result, stores the conversation, and emails the summary to whoever should handle it. Voice is in development. Connected CRM and automated follow-up are planned direction, not shipped features.",
  },
  {
    q: "Does it answer phone calls?",
    a: "No. A voice experience is being built and is not answering customer calls. Everything described on this page happens over text.",
  },
  {
    q: "Does it book appointments?",
    a: "Not today. Scheduling is in development, and the receptionist does not put anything in a calendar. It gathers the details and hands them to a person.",
  },
  {
    q: "What does it ask our customers?",
    a: "The topics you choose — up to six — together with your industry and your description of the business. It is a conversation rather than a fixed questionnaire, but it is working through your list, not ours.",
  },
  {
    q: "How do we find out about a new lead?",
    a: "When a conversation reaches its end, the summary and the priority tier are emailed to the address you set. The full thread is also in your receptionist dashboard.",
  },
  {
    q: "Can someone stop receiving messages?",
    a: "Yes. STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, or QUIT ends it, and no further replies are sent to that number. START, YES, or UNSTOP starts the conversation again.",
  },
  {
    q: "Where does our information go?",
    a: "Conversations, individual messages, and the resulting cases are stored against your business account and reached through the receptionist dashboard, which requires signing in. Your account only shows your own conversations.",
  },
  {
    q: "Which tools does it connect to?",
    a: "None yet, and we would rather say so than list logos. Today the receptionist works on its own: it answers, it stores the conversation, and it emails you. Connecting it to a CRM is planned, and it is labelled planned everywhere on this page.",
  },
  {
    q: "What does it cost?",
    a: "We are not publishing a price for the receptionist yet. Ask us and we will tell you honestly what your setup involves before you commit to anything.",
  },
];
