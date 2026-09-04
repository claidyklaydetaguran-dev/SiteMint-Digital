/**
 * Frontend V2 Phase 14 — every string and every rule the Call Logs workspace
 * displays, in one module with no React and no network access.
 *
 * ── What this route is ────────────────────────────────────────────────────
 * A **read-only viewer for stored call records**. It renders what
 * `GET /api/receptionist/voice/calls` and
 * `GET /api/receptionist/voice/calls/:callId` already hold — records SiteMint
 * wrote after receiving verified provider webhook events. There is no endpoint
 * behind this route that places, answers, transfers, retries or records a
 * call, publishes or tests an assistant, connects a number, sends a message,
 * books anything, or writes any row. So the wording here stays inside that
 * boundary and the contract tests beside this file walk the surface
 * exhaustively to prove no stronger claim is reachable.
 *
 * ── What was removed ──────────────────────────────────────────────────────
 * The previous page shipped four fabricated calls from `lib/demoCallLog.ts`
 * (invented names, invented phone numbers, invented transcripts and invented
 * outcomes) rendered in a "Demo Mode" section, and a header line claiming the
 * voice assistant answers calls. Both are gone; the fixture module is deleted.
 * Nothing replaces them: when there are no records, the route says there are
 * no records.
 *
 * Why a separate module at all: the phrases that matter most here are the ones
 * that must *never* appear, and a phrase inlined in JSX can only be checked by
 * reading the component. Centralising them gives the test one enumerable
 * surface — `everyRenderableString()` at the foot of this file.
 */

import type {
  DispositionOutcome,
  InternalCallState,
  RealCallSummary,
  StructuredOutcomeAvailability,
  Urgency,
} from "@/lib/voiceCallsApi";

/* ── Page ──────────────────────────────────────────────────────────────── */

export const PAGE = {
  eyebrow: "RECORDS",
  title: "Call Logs",
  /* Owner-approved wording. The line it replaces — "Calls your voice
     assistant answers, with transcripts and outcomes." — asserted an
     answering service that is not connected. */
  detail: "Review stored call records, transcripts, and analysis received by SiteMint.",
  sessionLoading: "Checking your session…",
} as const;

/* ── Absent values ─────────────────────────────────────────────────────────
   Three words, used consistently, never substituted with a zero, a dash that
   means nothing, or an inferred outcome. "Not provided" is for a field the
   record simply does not carry; "Not available" is for a moment that has not
   happened or was never reported; "Analysis unavailable" is the API's own
   `analysisAvailability: "unavailable"`. */

export const NOT_PROVIDED = "Not provided";
export const NOT_AVAILABLE = "Not available";
export const ANALYSIS_UNAVAILABLE = "Analysis unavailable";

/* ── List ──────────────────────────────────────────────────────────────── */

export const LIST = {
  heading: "Call records",
  loading: "Loading call records…",
  emptyTitle: "No call records yet",
  emptyDetail: "Call records will appear here after SiteMint receives them.",
  errorTitle: "Call records couldn't be loaded",
  errorDetail: "SiteMint couldn't read the stored call records. Try again.",
  retryLabel: "Try again",
  retryPendingLabel: "Trying…",
  announceRetrying: "Loading call records.",
  announceLoaded: "Call records loaded.",
  announceFailed: "Call records still couldn't be loaded.",
  colCaller: "Caller",
  colStarted: "Call time",
  colDuration: "Duration",
  colState: "State",
  openRecord: "Open call record",
} as const;

/** Plain count of what is on screen. A real number from the response, never an estimate. */
export function recordCount(n: number): string {
  return n === 1 ? "1 record" : `${n} records`;
}

/* ── Detail ────────────────────────────────────────────────────────────── */

export const DETAIL = {
  retentionHeading: "What SiteMint keeps",
  retentionDetail:
    "SiteMint does not retain call audio or full transcripts. The dashboard stores only the operational call details and outcomes needed to manage the receptionist.",
  back: "Back to Call Logs",
  loading: "Loading call record…",
  notFoundTitle: "That call record isn't here",
  notFoundDetail: "No stored call record matches this address.",
  errorTitle: "This call record couldn't be loaded",
  errorDetail: "SiteMint couldn't read the stored record. Try again.",
  retryLabel: "Try again",
  retryPendingLabel: "Trying…",
  announceRetrying: "Loading call record.",
  announceLoaded: "Call record loaded.",
  announceFailed: "The call record still couldn't be loaded.",

  factsHeading: "Record",
  started: "Started",
  ended: "Ended",
  duration: "Duration",

  transcriptHeading: "Transcript",
  summaryHeading: "Summary",
  analysisHeading: "Analysis",

  callerHeading: "Caller",
  callerName: "Name",
  callerEmail: "Email",
  callerCompany: "Company or business",

  inquiryHeading: "Inquiry",
  inquiryReason: "Reason for the call",
  inquiryServices: "Services mentioned",
  inquiryBusinessType: "Business type",
  inquiryPricing: "Asked about pricing",
  inquiryUrgency: "Urgency",

  appointmentHeading: "Appointment request",
  appointmentRequested: "Requested",
  appointmentDate: "Preferred date",
  appointmentTime: "Preferred time",
  appointmentTimezone: "Timezone",
  appointmentStatus: "Status",

  followUpHeading: "Follow-up",
  followUpRequested: "Requested",
  followUpPhone: "Phone",
  followUpSms: "SMS",
  followUpEmail: "Email",
  followUpStatus: "Status",

  dispositionHeading: "Outcome",
  dispositionCategory: "Category",
  dispositionSummary: "Assistant's summary",

  /* One note, at the foot of the analysis, doing one job: naming the limit of
     everything above it. It replaces three separate disclaimers the previous
     page carried, one of which ("A calendar isn't connected") asserted a
     configuration state this route cannot observe. */
  note:
    "Analysis is what the assistant recorded during the call. This page only displays it — nothing here contacts anyone, books anything, or changes a record.",
} as const;

/* ── Yes / no ───────────────────────────────────────────────────────────── */

export const YES = "Yes";
export const NO = "No";
export const GIVEN = "Given";
export const NOT_GIVEN = "Not given";

export function yesNo(value: boolean): string {
  return value ? YES : NO;
}

export function consent(value: boolean): string {
  return value ? GIVEN : NOT_GIVEN;
}

/* ── Internal call state ───────────────────────────────────────────────────
   `INTERNAL_CALL_STATES` in `lib/voiceCallsApi.ts` is the only authority for
   which states exist, and the server sends the label for each one
   (`callStateLabel` in the api-server's `callStateModel.ts`). The map below is
   a byte-for-byte copy of the server's, used only when a response omits
   `stateLabel`; the contract test asserts the two cannot drift.

   No state is celebratory. A completed call is a record, not an achievement,
   so it takes the settled tone rather than a success colour — mint stays
   reserved for action and focus. */

const STATE_LABEL: Record<InternalCallState, string> = {
  queued: "Queued",
  ringing: "Ringing",
  connecting: "Connecting",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  no_answer: "No answer",
  busy: "Busy",
  canceled: "Canceled",
  provider_error: "Provider error",
};

export type StateTone = "settled" | "open" | "attention" | "failed";

const STATE_TONE: Record<InternalCallState, StateTone> = {
  queued: "open",
  ringing: "open",
  connecting: "open",
  in_progress: "open",
  completed: "settled",
  failed: "failed",
  no_answer: "attention",
  busy: "attention",
  canceled: "attention",
  provider_error: "failed",
};

/** The server's label wins; the copy above is the fallback; an unknown state is humanised, never guessed at. */
export function stateLabel(call: Pick<RealCallSummary, "state" | "stateLabel">): string {
  const sent = call.stateLabel;
  if (typeof sent === "string" && sent.trim() !== "") return sent.trim();
  const known = STATE_LABEL[call.state];
  if (known !== undefined) return known;
  const words = String(call.state ?? "").replace(/_/g, " ").trim();
  if (words === "") return "Unknown";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function stateTone(state: string): StateTone {
  return STATE_TONE[state as InternalCallState] ?? "settled";
}

/* ── Call category (V5 PR-8) ───────────────────────────────────────────────
   A coarser grouping layered on top of the ten internal states above, for
   the Calls list and detail chip. `endedReason` and `analysisAvailability`
   are only present on `RealCallDetail`, never on the list's `RealCallSummary`
   — so a list row can resolve to "in_progress"/"completed"/"failed" from
   `state`/`isFinal` alone, and only the detail page (which has both extra
   fields) can additionally resolve "needs_attention". Neither field is
   invented when absent; the function simply degrades to the coarser answer
   it can support with what it was given. */

export const CALL_CATEGORY_LABEL = {
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  needs_attention: "Needs attention",
} as const;

export type CallCategory = keyof typeof CALL_CATEGORY_LABEL;

export function callCategory(call: {
  state: string;
  isFinal: boolean;
  endedReason?: string | null;
  analysisAvailability?: StructuredOutcomeAvailability | string | null;
}): CallCategory {
  if (!call.isFinal) return "in_progress";
  const endedReasonIndicatesError = typeof call.endedReason === "string" && /error|fail/i.test(call.endedReason);
  if (call.analysisAvailability === "unavailable" || endedReasonIndicatesError) return "needs_attention";
  return call.state === "completed" ? "completed" : "failed";
}

export function callCategoryLabel(category: CallCategory): string {
  return CALL_CATEGORY_LABEL[category];
}

/** The mark beside a row carries colour only; the state is always spelled out in text as well. */
export function stateAccessibleName(label: string): string {
  return `Call state: ${label}`;
}

/** Exposed so the test can prove this map matches the server's, key for key. */
export function stateLabelMap(): Record<string, string> {
  return { ...STATE_LABEL };
}

/* ── Disposition, urgency, request status ──────────────────────────────────
   Application-owned enums from `structuredOutcome.ts`, not provider vocabulary. */

const DISPOSITION_LABEL: Record<DispositionOutcome, string> = {
  information_requested: "Information requested",
  appointment_requested: "Appointment requested",
  message_taken: "Message taken",
  spam: "Spam",
  unresolved: "Unresolved",
};

export function dispositionLabel(outcome: string): string {
  return DISPOSITION_LABEL[outcome as DispositionOutcome] ?? NOT_PROVIDED;
}

const URGENCY_LABEL: Record<Urgency, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

export function urgencyLabel(urgency: string | null | undefined): string {
  if (typeof urgency !== "string") return NOT_PROVIDED;
  return URGENCY_LABEL[urgency as Urgency] ?? NOT_PROVIDED;
}

/** Both `AppointmentStatus` and `FollowUpStatus` carry the same two values. */
const REQUEST_STATUS_LABEL: Record<string, string> = {
  not_requested: "Not requested",
  pending_review: "Pending review",
};

export function requestStatusLabel(status: string): string {
  return REQUEST_STATUS_LABEL[status] ?? NOT_PROVIDED;
}

/* ── Values that may simply be absent ──────────────────────────────────────
   Nothing below invents a value, and nothing turns an absent number into 0. */

export function textOrMissing(value: string | null | undefined, missing = NOT_PROVIDED): string {
  if (typeof value !== "string") return missing;
  const trimmed = value.trim();
  return trimmed === "" ? missing : trimmed;
}

export function listOrMissing(values: readonly string[] | null | undefined): string {
  if (!Array.isArray(values)) return NOT_PROVIDED;
  const kept = values.filter((v) => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
  return kept.length > 0 ? kept.join(", ") : NOT_PROVIDED;
}

/** `durationSec` is null while a call has no measured length. Null is stated, never rendered as 0:00. */
export function formatDuration(sec: number | null | undefined): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return NOT_AVAILABLE;
  const whole = Math.floor(sec);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Compact form for the list column: no year, because every column shares one. */
export function formatListTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (d === null) return NOT_AVAILABLE;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Full form for the record header, where there is room to be unambiguous. */
export function formatFullTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (d === null) return NOT_AVAILABLE;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** ISO-8601 for the machine-readable half of a <time> element. */
export function machineTime(iso: string | null | undefined): string | undefined {
  const d = toDate(iso);
  return d === null ? undefined : d.toISOString();
}

function toDate(iso: string | null | undefined): Date | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ── Routing ───────────────────────────────────────────────────────────────
   Base-relative, exactly as `lib/routes.ts` declares them; `wouter` prepends
   the app's base itself, so these are correct under both the configured
   prefix and a root-base build. */

export const LIST_PATH = "/logs";

export function callHref(callId: string): string {
  return `${LIST_PATH}/${encodeURIComponent(callId)}`;
}

/* ── Not found versus read failure ─────────────────────────────────────────
   `fetchRealCallDetail` resolves `undefined` for a 404 — that is how
   `lib/voiceCallsApi.ts` says "no such record for this firm", and it is also
   what a cross-firm id returns, so the two are indistinguishable here by
   design. React Query cannot store `undefined`, so it surfaces that
   resolution as an error of its own instead.

   Every genuine transport failure that module raises carries a numeric
   `status` (`apiFetch` attaches it before throwing, and non-404 errors are
   rethrown untouched). So a settled error with no numeric status, whose
   message names the undefined resolution, is the missing-record case; an
   error with a status, or any other message, is a read failure. If that
   message ever changes, this returns false and a 404 renders as a read
   failure with a Try again — never as a fabricated record, and never as a
   "not found" for a call that does exist. */

export function isRecordMissing(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (typeof (error as Error & { status?: unknown }).status === "number") return false;
  return /undefined/i.test(error.message);
}

/* ── Analysis availability ─────────────────────────────────────────────────
   The API collapses its internal "invalid" into "unavailable" before sending,
   so exactly two values can arrive. Anything else is treated as unavailable —
   the interface never upgrades an unknown value into a result. */

export function analysisIsAvailable(
  availability: StructuredOutcomeAvailability | string | null | undefined,
): boolean {
  return availability === "available";
}

/* ── Exhaustive string surface ─────────────────────────────────────────────
   Everything this route can render. A phrase not reachable from here is not
   reachable from either page. */

export function everyRenderableString(): string[] {
  const states = [
    ...Object.keys(STATE_LABEL),
    "some_unknown_state",
    "",
  ];
  return [
    ...Object.values(PAGE),
    ...Object.values(LIST),
    ...Object.values(DETAIL),
    ...Object.values(CALL_CATEGORY_LABEL),
    NOT_PROVIDED,
    NOT_AVAILABLE,
    ANALYSIS_UNAVAILABLE,
    YES,
    NO,
    GIVEN,
    NOT_GIVEN,
    recordCount(0),
    recordCount(1),
    recordCount(2),
    ...states.map((s) => stateLabel({ state: s as InternalCallState, stateLabel: "" })),
    ...states.map((s) => stateAccessibleName(stateLabel({ state: s as InternalCallState, stateLabel: "" }))),
    ...Object.values(DISPOSITION_LABEL),
    dispositionLabel("nonsense"),
    ...Object.values(URGENCY_LABEL),
    urgencyLabel(null),
    ...Object.values(REQUEST_STATUS_LABEL),
    requestStatusLabel("nonsense"),
    formatDuration(null),
    formatDuration(0),
    formatListTime(null),
    formatFullTime(null),
    textOrMissing(null),
    listOrMissing(null),
  ];
}
