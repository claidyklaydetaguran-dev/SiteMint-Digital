// P3: constrained tool-call dispatcher — the only bridge between a live
// conversation and SiteMint's scheduling engine.
//
// Invariants:
//   - firmId arrives ONLY from the webhook route's assistant linkage; tool
//     arguments cannot name, imply, or override a tenant.
//   - Every argument set is zod-validated against the closed catalog before
//     any collaborator runs; validation failure yields a spoken-back safe
//     result and (firm-scoped) diagnostic issue, never an exception.
//   - Results are REDACTED: they confirm actions in plain language with the
//     request's public reference id, and never echo caller contact details
//     back through the provider.
//   - Booking rides the existing advisory-locked, revalidating
//     submitAppointmentRequest — the dispatcher adds no second, weaker
//     booking path. Reschedule composes create-new-then-cancel-old with
//     compensation, so the failure mode is "extra held slot released", never
//     a lost appointment.
//   - Import hygiene matches reconciliation.ts: pure logic imports no
//     database; production collaborators lazy-load inside the defaults.

import type { DayAvailabilityResult } from "../../scheduling/availabilityEngine.js";
import type { SchedulingAppointmentRequest } from "@workspace/db/schema/scheduling";
import {
  TOOL_ARG_SCHEMAS,
  isVoiceToolName,
  type BookAppointmentArgs,
  type CancelAppointmentArgs,
  type CheckAvailabilityArgs,
  type RescheduleAppointmentArgs,
  type SaveMessageArgs,
} from "./toolCatalog.js";
import { CAPABILITY_BY_TOOL, parseToolCapabilities, type VoiceToolCapability } from "./toolCapabilities.js";
import { composeCallerAckEmail } from "../../voiceNotifications/callerAckComposer.js";
import { callerAppointmentAckDedupeKey } from "../../voiceNotifications/notificationOutbox.js";

export interface ToolCallRequest {
  toolCallId: string;
  name: string;
  args: unknown;
}

/**
 * The call a tool batch arrived on, as established by the WEBHOOK — never by a
 * tool argument.
 *
 * Both fields come from provider-verified context: `providerCallId` from the
 * authenticated payload's own call object, and `assistantRowId` from our
 * voice_assistants lookup of the provider assistant id (the same lookup that
 * produced firmId). A model cannot influence either, which is what makes a
 * saved message reliably attributable to the right business and the right call.
 */
export interface ToolCallContext {
  provider: string;
  providerCallId: string;
  assistantRowId: number | null;
}

export interface ToolCallResult {
  toolCallId: string;
  /** Plain sentence(s) for the model to speak from. Never raw JSON dumps, never caller PII echoes. */
  result: string;
}

type SlotMutation =
  | { ok: true; request: SchedulingAppointmentRequest; duplicate?: boolean }
  | { ok: false; reason: "slot_no_longer_available" | "unknown_appointment_type" };

export interface ToolSchedulingDeps {
  now?: () => Date;
  getDayAvailability: (firmId: number, dateKey: string, appointmentTypeId: string, now: Date) => Promise<DayAvailabilityResult>;
  /** Business timezone + bookable types — one call, one consistent snapshot. */
  getSchedulingContext: (firmId: number) => Promise<{ timezone: string; types: Array<{ id: string; name: string; durationMin: number }> }>;
  /** Firm-scoped lookup of an existing request by its public reference id. */
  findRequestByPublicId: (firmId: number, publicId: string) => Promise<SchedulingAppointmentRequest | undefined>;
  submitAppointmentRequest: (
    firmId: number,
    appointmentTypeId: string,
    startUtc: Date,
    contact: { name: string; phone: string | null; email: string | null },
    consent: { phoneConsent: boolean; smsConsent: boolean; emailConsent: boolean },
    now: Date,
    /** The provider tool-call id, so a retry returns the original request. */
    toolCallId?: string,
    /**
     * The provider call id, so the request can be named in the call record and
     * in the business's post-call email. Without it a call that requested a
     * time reports "nothing outstanding".
     */
    providerCallId?: string,
  ) => Promise<SlotMutation>;
  cancelAppointmentRequestByPublicId: (firmId: number, publicId: string) => Promise<boolean>;
  /**
   * Turns a just-created request into a confirmed booking, on the call.
   *
   * This is the SAME service the dashboard's Approve button calls — not a
   * second booking path. That matters for more than tidiness: the duplicate
   * guard, the single-insert rule and the "never retry an unanswered write"
   * rule all live in there, and a parallel implementation would have to earn
   * them again and would eventually disagree.
   *
   * Absent (or returning anything but "booked") means the business still
   * confirms by hand, and the caller is told so. It is never assumed.
   */
  confirmRequest?: (firmId: number, publicId: string) => Promise<string>;
  /**
   * V7: persists a message for the business. Resolves only on a durable write;
   * anything else must reject, because the spoken confirmation is emitted
   * strictly after this resolves.
   */
  saveVoiceMessage?: (input: {
    firmId: number;
    provider: string;
    providerCallId: string;
    assistantId: number | null;
    toolCallId: string;
    callerName: string;
    callbackPhone: string | null;
    callbackEmail: string | null;
    topic: string;
    details: string;
    urgency: "normal" | "urgent";
    emailAckRequested: boolean;
  }) => Promise<{ inserted: boolean }>;
  /** P5: best-effort confirmation enqueue after a successful booking; consent-gated inside the outbox service. */
  enqueueBookingConfirmation?: (input: {
    firmId: number;
    rawPhone: string | null | undefined;
    requestPublicId: string;
    spokenSummary: string;
    callerConsented: boolean;
  }) => Promise<unknown>;
  /** Firm-scoped issue sink for diagnostics; injected so tests stay DB-free. */
  openIssue?: (input: {
    firmId: number;
    level: "info" | "warning" | "error";
    code: "tool_invalid_args" | "tool_execution_failed";
    message: string;
    dedupeKey: string;
    context?: Record<string, unknown>;
  }) => Promise<unknown>;
  /**
   * V7: the capabilities this deployment has authorized. Defaults to reading
   * VOICE_TOOLS_CAPABILITIES.
   *
   * The provider only advertises the authorized tools, so a model cannot ask
   * for anything else — but "the model can't" is not the same as "we won't".
   * An authenticated webhook carrying an unauthorized tool name previously
   * executed it, because the catalog is closed but was not capability-checked.
   * Checking here makes the gate hold on both sides of the wire.
   */
  authorizedCapabilities?: () => readonly VoiceToolCapability[];
  /** The business's own name, for the caller's copy. */
  loadBusinessName?: (firmId: number) => Promise<string>;
  /**
   * Queues the caller's appointment email. Optional so an existing caller that
   * supplies its own deps keeps working, and absent simply means no caller
   * email is sent — never that one is sent somewhere else.
   */
  enqueueCallerAck?: (input: {
    firmId: number;
    recipient: string;
    dedupeKey: string;
    subject: string;
    body: string;
  }) => Promise<void>;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

async function defaultDeps(): Promise<ToolSchedulingDeps> {
  const repo = await import("../../scheduling/schedulingRepository.js");
  const issues = await import("../../voiceIssues/voiceIssueService.js");
  return {
    getDayAvailability: (firmId, dateKey, typeId, now) => repo.getDayAvailability(firmId, dateKey, typeId, now),
    getSchedulingContext: async (firmId) => {
      const config = await repo.buildAvailabilityConfig(firmId);
      return {
        timezone: config.timezone,
        types: config.appointmentTypes.map((t) => ({ id: t.id, name: t.name, durationMin: t.durationMin })),
      };
    },
    findRequestByPublicId: async (firmId, publicId) => {
      const rows = await repo.listAppointmentRequests(firmId);
      return rows.find((r) => r.publicId === publicId);
    },
    submitAppointmentRequest: (firmId, typeId, startUtc, contact, consent, now, toolCallId, providerCallId) =>
      repo.submitAppointmentRequest(
        firmId, typeId, startUtc, contact, consent, "ai_receptionist", now, undefined, toolCallId, providerCallId,
      ),
    cancelAppointmentRequestByPublicId: (firmId, publicId) => repo.cancelAppointmentRequestByPublicId(firmId, publicId),
    // The dashboard's Approve, called from the call instead of from a click.
    // It answers "disabled" when calendar writing is off and "no_connection"
    // when the business has not connected one — both of which simply mean the
    // caller is told the time is requested, which is the truth.
    confirmRequest: async (firmId, publicId) => {
      const sync = await import("../../calendar/calendarEventSync.js");
      // The same dependency bundle the calendar router hands it, so the call
      // path and the dashboard path are the same code with the same gates.
      const { calendarSyncDeps } = await import("../../calendar/calendarSyncDeps.js");
      return sync.approveRequestToBooked(firmId, publicId, calendarSyncDeps());
    },
    enqueueBookingConfirmation: async (input) => {
      const outbox = await import("../../voiceSms/outboxService.js");
      return outbox.enqueueBookingConfirmation(input);
    },
    saveVoiceMessage: async (input) => {
      const messages = await import("../../voiceMessages/messageRepository.js");
      const result = await messages.saveVoiceMessage(input);
      return { inserted: result.inserted };
    },
    openIssue: (input) => issues.openVoiceIssue(input),
    loadBusinessName: async (firmId) => {
      const { db } = await import("@workspace/db");
      const { intakeFirms } = await import("@workspace/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .select({ name: intakeFirms.name })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, firmId))
        .limit(1);
      return row?.name ?? "Your appointment";
    },
    enqueueCallerAck: async (input) => {
      const outbox = await import("../../voiceNotifications/notificationOutbox.js");
      await outbox.enqueueNotification({
        firmId: input.firmId,
        kind: "caller_acknowledgement",
        dedupeKey: input.dedupeKey,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
      });
    },
  };
}

const SAFE_INVALID = "I couldn't use those details. Let me take your information and have the office follow up instead.";
const SAFE_FAILED = "I'm having trouble with the scheduling system right now. The office will follow up to confirm a time.";
const MAX_OFFERED_SLOTS = 6;

function formatSlotForSpeech(startUtc: Date, timezone: string): string {
  // Business-timezone, speech-friendly ("Tuesday, September 1 at 2:30 PM").
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(startUtc);
}

function dayReasonSentence(reason: DayAvailabilityResult["reason"]): string {
  switch (reason) {
    case "blocked": return "The office isn't taking appointments that day.";
    case "outside_hours": return "The office is closed that day.";
    case "fully_booked": return "That day is fully booked.";
    case "past_booking_window": return "That date is too soon to book.";
    case "beyond_advance_window": return "That date is further out than the office books.";
    case "open": return "No open times remain on that day.";
  }
}

// ── individual executors ─────────────────────────────────────────────────────

async function runCheckAvailability(
  firmId: number,
  args: CheckAvailabilityArgs,
  deps: ToolSchedulingDeps,
  now: Date,
): Promise<string> {
  const { timezone, types } = await deps.getSchedulingContext(firmId);
  if (types.length === 0) return "Online scheduling isn't set up yet; the office will call back to arrange a time.";

  // The model does not know today's date and has asked for dates in the wrong
  // year (a staging call checked 2024-09-22 for "Tuesday the 22nd", which fell
  // on a Sunday, and told the caller the office was closed). A past date is
  // refused with today's date in the business's timezone, so it can correct
  // the year instead of reporting a false closure.
  const today = businessToday(now, timezone);
  if (args.date < today.key) {
    return `${args.date} has already passed. Today is ${today.spoken} (${today.key}). Work out the date the caller means from today and check again.`;
  }

  const type = args.appointmentTypeId ? types.find((t) => t.id === args.appointmentTypeId) : types[0];
  if (!type) return "That appointment type isn't offered. " + typeMenu(types);

  const day = await deps.getDayAvailability(firmId, args.date, type.id, now);
  if (day.slots.length === 0) return dayReasonSentence(day.reason);

  const offered = day.slots.slice(0, MAX_OFFERED_SLOTS);
  const spoken = offered
    .map((s) => `${formatSlotForSpeech(s.startUtc, timezone)} (slot ${s.startUtc.toISOString()})`)
    .join("; ");
  // The id is stated outright: without it the model invented one from the
  // type name ("TEST" from "[TEST] Consultation") and every booking was refused.
  return `Open ${type.name} times (appointment type id ${type.id}): ${spoken}. Offer these to the caller. Only after the caller confirms a time, book it with appointmentTypeId "${type.id}" and the exact slot value.`;
}

/** Today's date in the business's timezone, as a YYYY-MM-DD key and as speech. */
function businessToday(now: Date, timezone: string): { key: string; spoken: string } {
  let zone = timezone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const spoken = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
  return { key, spoken };
}

function typeMenu(types: Array<{ id: string; name: string; durationMin: number }>): string {
  return (
    "Available appointment types: " +
    types.map((t) => `${t.name} (${t.durationMin} minutes, id ${t.id})`).join("; ") +
    "."
  );
}

/**
 * Queues the caller's own copy of an appointment, when — and only when — they
 * gave an address and confirmed it on the call.
 *
 * Every refusal here is silent to the caller and total: no address, no consent,
 * or no transport wired means no email, never a fallback recipient and never
 * the business's address instead. Emailing an appointment to whoever we happen
 * to know is worse than emailing nobody.
 *
 * Best-effort by design: a booking that succeeded must not be undone because
 * the outbox was unreachable, so every failure is swallowed after logging.
 */
async function enqueueCallerAppointmentAck(
  firmId: number,
  request: SchedulingAppointmentRequest,
  confirmed: boolean,
  deps: ToolSchedulingDeps,
): Promise<void> {
  if (!deps.enqueueCallerAck) return;
  const recipient = request.customerEmail;
  if (typeof recipient !== "string" || recipient === "") return;
  // The persisted consent, not the tool argument: what was actually recorded
  // against the row is the thing we are willing to act on later.
  if (request.emailConsent !== true) return;

  try {
    const context = await deps.getSchedulingContext(firmId);
    const serviceName =
      context.types.find((t) => t.id === String(request.appointmentTypeId))?.name ?? "Appointment";
    const businessName = (await deps.loadBusinessName?.(firmId)) ?? "Your appointment";
    const stage = confirmed ? "booked" : "pending";
    const composed = composeCallerAckEmail({
      businessName,
      serviceName,
      startAt: request.requestedStartAt,
      timeZone: request.timezone ?? context.timezone,
      status: stage,
      reference: request.publicId,
    });
    await deps.enqueueCallerAck({
      firmId,
      recipient,
      dedupeKey: callerAppointmentAckDedupeKey(request.publicId, stage),
      subject: composed.subject,
      body: composed.body,
    });
  } catch (err) {
    deps.logger?.("voice_caller_ack_not_queued", {
      firmId,
      requestPublicId: request.publicId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function runBookAppointment(
  firmId: number,
  toolCallId: string,
  args: BookAppointmentArgs,
  deps: ToolSchedulingDeps,
  now: Date,
  providerCallId: string,
): Promise<string> {
  const startUtc = new Date(args.startIso);
  const result = await deps.submitAppointmentRequest(
    firmId,
    args.appointmentTypeId,
    startUtc,
    { name: args.customerName, phone: args.customerPhone ?? null, email: args.customerEmail ?? null },
    // Text messages are deferred: no SMS consent is recorded from a call.
    // Email consent is recorded only when the caller heard the address read
    // back and asked to be written to — the schema refuses the flag without an
    // address, and this refuses it without both.
    {
      phoneConsent: true,
      smsConsent: false,
      emailConsent: args.emailConfirmed === true && typeof args.customerEmail === "string",
    },
    now,
    // The provider's id for THIS tool call. A retry carries the same id, and
    // the repository returns the original request instead of creating a second
    // one — or, worse, refusing the repeat because the caller's own first
    // request now occupies the slot.
    toolCallId,
    providerCallId,
  );
  if (!result.ok) {
    return result.reason === "slot_no_longer_available"
      ? "That time was just taken. Check availability again and offer another slot."
      : "That appointment type isn't valid. " + typeMenu((await deps.getSchedulingContext(firmId)).types) + " Book again with one of those ids.";
  }
  // A repeat returns the same reference and sends nothing again: the caller
  // already has the confirmation text, and a second one would read as a second
  // appointment.
  if (result.duplicate === true) {
    return `Already requested — this is the same request, not a new one. Reference id ${result.request.publicId}. Repeat what you already told the caller; do not say it is booked.`;
  }
  // Try to finish the job while the caller is still on the line. Only a
  // "booked" answer counts; every other outcome — no calendar, write refused,
  // and above all an UNANSWERED write — leaves the request pending and the
  // caller correctly told it is not confirmed. An unanswered write is never
  // retried here, exactly as it is never retried from the dashboard.
  let confirmed = false;
  if (deps.confirmRequest) {
    try {
      confirmed = (await deps.confirmRequest(firmId, result.request.publicId)) === "booked";
    } catch {
      // A confirmation that throws is a confirmation that did not happen.
      confirmed = false;
    }
  }

  // P5: consent-gated confirmation text (best-effort; the outbox enforces
  // consent and the send-time flag — a failure here never fails the booking).
  try {
    await deps.enqueueBookingConfirmation?.({
      firmId,
      rawPhone: args.customerPhone ?? null,
      requestPublicId: result.request.publicId,
      spokenSummary: confirmed
        ? `Your appointment is confirmed — reference ${result.request.publicId}. Reply STOP to opt out.`
        : `Your appointment request is in — reference ${result.request.publicId}. The office will confirm shortly. Reply STOP to opt out.`,
      callerConsented: false, // texts are deferred; nothing is sent from a call
    });
  } catch {
    // outbox unavailability must not undo a successful booking
  }

  // The caller's own copy. Queued, never sent inline: a mail provider that
  // hangs must not hold up a live conversation, and the outbox already owns
  // retries, idempotency and delivery state.
  //
  // `booked` is passed only when the calendar write actually returned booked,
  // so an unanswered or refused write can never produce "CONFIRMED" in the
  // caller's inbox while the dashboard still shows a pending request.
  await enqueueCallerAppointmentAck(firmId, result.request, confirmed, deps);

  if (confirmed) {
    return `Confirmed and in the calendar. Reference id ${result.request.publicId}. Tell the caller the appointment is booked.`;
  }
  // A request is not a booking. This path writes a `pending_review` row that a
  // human still has to accept, so the caller must not be told a time is theirs
  // — they would arrive expecting an appointment nobody confirmed. The spoken
  // line says requested, and says who confirms it.
  return `Requested, not yet confirmed. Reference id ${result.request.publicId}. Tell the caller you have asked the office to hold that time and they will confirm it — do not tell them it is booked.`;
}

async function runCancelAppointment(
  firmId: number,
  args: CancelAppointmentArgs,
  deps: ToolSchedulingDeps,
): Promise<string> {
  const cancelled = await deps.cancelAppointmentRequestByPublicId(firmId, args.requestId);
  return cancelled
    ? "The appointment is cancelled."
    : "I couldn't find an appointment with that reference. The office can help if the caller doesn't have it.";
}

/** Statuses in which a request still holds its time. */
const LIVE_STATUSES = new Set(["pending_review", "held", "booked", "requested"]);

async function runRescheduleAppointment(
  firmId: number,
  toolCallId: string,
  args: RescheduleAppointmentArgs,
  deps: ToolSchedulingDeps,
  now: Date,
  providerCallId: string,
): Promise<string> {
  // Order of operations: verify the old request exists (firm-scoped), book
  // the new slot first (revalidated + advisory-locked, preserving the old
  // request's type and contact details), then cancel the old reference.
  // Compensation: if the old reference fails to cancel after the new one was
  // created, release the new one so nothing is double-held.
  //
  // The original is never released before the replacement exists, so a failure
  // anywhere above leaves the caller with the appointment they already had.
  const old = await deps.findRequestByPublicId(firmId, args.requestId);
  if (!old) {
    return "I couldn't find an appointment with that reference. The office can help if the caller doesn't have it.";
  }

  const created = await deps.submitAppointmentRequest(
    firmId,
    String(old.appointmentTypeId),
    new Date(args.newStartIso),
    { name: old.customerName, phone: old.customerPhone ?? null, email: old.customerEmail ?? null },
    { phoneConsent: old.phoneConsent, smsConsent: old.smsConsent, emailConsent: old.emailConsent },
    now,
    toolCallId,
    providerCallId,
  );
  if (!created.ok) {
    return created.reason === "slot_no_longer_available"
      ? "That new time was just taken. Check availability again and offer another slot."
      : SAFE_FAILED;
  }

  // A retry of the same tool call. The move already ran once, so the old
  // reference is already cancelled and re-running the cancel would report a
  // failure that is not one.
  if (created.duplicate === true) {
    // Unless the first attempt compensated it away — then the replacement is
    // gone and saying "requested" would promise a time nobody holds.
    return LIVE_STATUSES.has(created.request.status)
      ? `Already moved — this is the same change, not another one. New reference id ${created.request.publicId}. Repeat what you already told the caller; do not say it is confirmed.`
      : "That change didn't go through, and the original appointment is unchanged. The office can help.";
  }

  const cancelledOld = await deps.cancelAppointmentRequestByPublicId(firmId, args.requestId);
  if (!cancelledOld) {
    // Compensate: never leave two live holds for one caller intent.
    await deps.cancelAppointmentRequestByPublicId(firmId, created.request.publicId);
    return "I couldn't find the original appointment to move. The office can help with the existing booking.";
  }
  // The moved time carries the original's consent, so a caller who agreed to
  // be emailed about the appointment is told where it went. Always `pending`:
  // a reschedule writes a request that a human still accepts.
  await enqueueCallerAppointmentAck(firmId, created.request, false, deps);
  return `The new time is requested, not yet confirmed. New reference id ${created.request.publicId}. Tell the caller the office will confirm the change — do not tell them it is rescheduled.`;
}

/**
 * V7: take a message for the business.
 *
 * The one rule that shapes this function: the caller is told their message is
 * saved ONLY after the write has succeeded. So there is no optimistic
 * confirmation, no "we'll take care of it" before the await, and the failure
 * path says the office will be told by another route rather than implying a
 * record exists. A duplicate delivery of the same tool call confirms the same
 * single message, which is both idempotent and true.
 */
async function runSaveMessage(
  firmId: number,
  toolCallId: string,
  args: SaveMessageArgs,
  context: ToolCallContext,
  deps: ToolSchedulingDeps,
): Promise<string> {
  if (!deps.saveVoiceMessage) {
    // The capability is attached but unwired. Say nothing that implies a save.
    return "I can't save that to the system right now. Please hold the details and the office will follow up.";
  }

  const { inserted } = await deps.saveVoiceMessage({
    firmId,
    provider: context.provider,
    providerCallId: context.providerCallId,
    assistantId: context.assistantRowId,
    // The provider's own id for this tool call — the idempotency key. It is
    // taken from the authenticated webhook envelope, never from `args`.
    toolCallId,
    callerName: args.callerName,
    callbackPhone: args.callbackPhone ?? null,
    callbackEmail: args.callbackEmail ?? null,
    topic: args.topic,
    details: args.details,
    urgency: args.urgency ?? "normal",
    emailAckRequested: args.emailCopyRequested === true,
  });

  deps.logger?.("voice_tool_message_saved", { firmId, inserted });
  return args.callbackPhone
    ? "Saved. Tell the caller their message is with the office and someone will follow up on the number they gave."
    : "Saved. Tell the caller their message is with the office and someone will follow up.";
}

// ── dispatcher ───────────────────────────────────────────────────────────────

export async function dispatchToolCalls(
  firmId: number,
  calls: readonly ToolCallRequest[],
  context: ToolCallContext,
  deps?: ToolSchedulingDeps,
): Promise<ToolCallResult[]> {
  const resolved = deps ?? (await defaultDeps());
  const now = resolved.now?.() ?? new Date();
  const results: ToolCallResult[] = [];

  for (const call of calls) {
    results.push({ toolCallId: call.toolCallId, result: await executeOne(firmId, call, context, resolved, now) });
  }
  return results;
}

async function executeOne(
  firmId: number,
  call: ToolCallRequest,
  context: ToolCallContext,
  deps: ToolSchedulingDeps,
  now: Date,
): Promise<string> {
  if (!isVoiceToolName(call.name)) {
    deps.logger?.("voice_tool_unknown", { firmId, name: String(call.name).slice(0, 40) });
    return SAFE_INVALID;
  }

  // Capability gate, fail-closed. An unparseable or absent allowlist authorizes
  // NOTHING — the same rule the publish payload follows, so the two cannot
  // disagree about what this deployment is allowed to do.
  // V8: EXECUTABLE, not merely published.
  //
  // Readiness can lapse after publication — a business deletes its last
  // appointment type, or closes every day in its schedule — and the provider
  // goes on advertising whatever was attached at publish time. Re-resolving
  // here is what stops the assistant taking an action it can no longer honour,
  // immediately, instead of at the business's next publish.
  //
  // The pure `authorizedCapabilities` seam stays for unit tests, which have no
  // database; production resolves the same shared calculation everything else
  // uses.
  let executable: readonly VoiceToolCapability[];
  if (deps.authorizedCapabilities) {
    executable = deps.authorizedCapabilities();
  } else {
    try {
      const { resolveEffectiveCapabilities } = await import("./firmCapabilities.js");
      const effective = await resolveEffectiveCapabilities(firmId);
      executable = effective.reports.filter((r) => r.state === "active").map((r) => r.key);
    } catch {
      // Unresolvable capability state authorizes nothing.
      executable = [];
    }
  }
  if (!executable.includes(CAPABILITY_BY_TOOL[call.name])) {
    deps.logger?.("voice_tool_capability_not_executable", { firmId, tool: call.name });
    return SAFE_INVALID;
  }

  const parsed = TOOL_ARG_SCHEMAS[call.name].safeParse(call.args ?? {});
  if (!parsed.success) {
    deps.logger?.("voice_tool_invalid_args", { firmId, tool: call.name });
    try {
      await deps.openIssue?.({
        firmId,
        level: "info",
        code: "tool_invalid_args",
        message: `The assistant sent arguments that failed validation for ${call.name}.`,
        dedupeKey: `${call.name}:${call.toolCallId}`,
        context: { tool: call.name, toolCallId: call.toolCallId },
      });
    } catch { /* diagnostics are best-effort */ }
    return SAFE_INVALID;
  }

  try {
    switch (call.name) {
      case "check_availability":
        return await runCheckAvailability(firmId, parsed.data as CheckAvailabilityArgs, deps, now);
      case "book_appointment":
        return await runBookAppointment(
          firmId, call.toolCallId, parsed.data as BookAppointmentArgs, deps, now, context.providerCallId,
        );
      case "cancel_appointment":
        return await runCancelAppointment(firmId, parsed.data as CancelAppointmentArgs, deps);
      case "reschedule_appointment":
        return await runRescheduleAppointment(
          firmId, call.toolCallId, parsed.data as RescheduleAppointmentArgs, deps, now, context.providerCallId,
        );
      case "save_message":
        return await runSaveMessage(firmId, call.toolCallId, parsed.data as SaveMessageArgs, context, deps);
    }
  } catch (err) {
    deps.logger?.("voice_tool_execution_failed", {
      firmId,
      tool: call.name,
      errorClass: err instanceof Error ? err.name : "unknown",
    });
    try {
      await deps.openIssue?.({
        firmId,
        level: "error",
        code: "tool_execution_failed",
        message: `Executing ${call.name} threw; the caller was given the safe fallback line.`,
        dedupeKey: `${call.name}:${call.toolCallId}`,
        context: { tool: call.name, toolCallId: call.toolCallId },
      });
    } catch { /* diagnostics are best-effort */ }
    return SAFE_FAILED;
  }
}
