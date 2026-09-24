// P4: the booked↔calendar reconciliation, built on the schema's own
// Checkpoint-B invariant: `status='booked'` REQUIRES providerEventId AND
// providerCalendarId (CHECK ck_..._booked_requires_provider). That makes
// "booked but not on the calendar" structurally unrepresentable — approval
// and the event write are one transition here, not two hopeful steps.
//
// Everything is gated by CALENDAR_WRITE_ENABLED ("true" exactly; default
// off): with the flag off, approval-to-booked is intentionally impossible
// (nothing else in the codebase can reach 'booked' either — the CHECK has
// guaranteed that since Checkpoint B), and cancel/reconcile touch nothing.
//
// Idempotency layers: the stored provider ids short-circuit repeats, and the
// writer's iCalUID (requestPublicId@sitemint.digital) makes even a
// crash-window insert retry converge on one Google event.

import type { SchedulingAppointmentRequest, SchedulingCalendarConnection } from "@workspace/db/schema/scheduling";
import type { CalendarEventWriter } from "./eventWriter.js";

export const CALENDAR_WRITE_ENABLED_ENV_VAR = "CALENDAR_WRITE_ENABLED";

export function isCalendarWriteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[CALENDAR_WRITE_ENABLED_ENV_VAR] === "true";
}

export interface CalendarSyncDeps {
  isEnabled?: () => boolean;
  getActiveConnection: (firmId: number) => Promise<SchedulingCalendarConnection | undefined>;
  writer: CalendarEventWriter;
  /** Loads one firm-scoped request by public id. */
  findRequest: (firmId: number, publicId: string) => Promise<SchedulingAppointmentRequest | undefined>;
  /**
   * The approve transition: pending_review/held → booked, stamping BOTH
   * provider ids in the same UPDATE (satisfying the CHECK). Returns false
   * when the row was no longer approvable (raced away).
   */
  markBooked: (firmId: number, requestId: number, providerEventId: string, providerCalendarId: string) => Promise<boolean>;
  /** Clears both provider ids (after a successful event delete). Never touches status. */
  clearProviderEvent: (firmId: number, requestId: number) => Promise<void>;
  /**
   * Records that the calendar answered us successfully.
   *
   * Writing an event proves the connection works at least as well as reading
   * free/busy does, but only the read used to record it. A business could
   * therefore have a real appointment sitting in its calendar while the
   * Calendar page still said "Connected, not yet used" — the product
   * disbelieving something it had just done itself.
   */
  markConnectionUsed?: (firmId: number) => Promise<void>;
  openIssue: (input: {
    firmId: number;
    level: "warning" | "error";
    code: "calendar_sync_failed" | "calendar_revoked";
    message: string;
    dedupeKey: string;
    context?: Record<string, unknown>;
  }) => Promise<unknown>;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

export type ApproveOutcome =
  | "booked"
  | "disabled"
  | "no_connection"
  | "not_found"
  | "not_approvable"
  | "event_write_failed"
  /**
   * The provider neither confirmed nor denied the write, and asking did not
   * settle it either. Distinct from a failure because the opposite action is
   * called for: a failure invites another approval, this one must not be
   * retried until reconciliation has looked.
   */
  | "event_write_uncertain"
  | "conflict_after_write";

/**
 * Approves one request into 'booked': writes the calendar event, then stamps
 * status+ids. If the stamp loses a race (the request was cancelled between
 * write and stamp), the event is deleted again — never an orphan event for a
 * non-booked request.
 */
export async function approveRequestToBooked(
  firmId: number,
  publicId: string,
  deps: CalendarSyncDeps,
): Promise<ApproveOutcome> {
  if (!(deps.isEnabled ?? isCalendarWriteEnabled)()) return "disabled";

  const request = await deps.findRequest(firmId, publicId);
  if (!request) return "not_found";
  if (request.status === "booked") return "booked"; // idempotent repeat
  if (request.status !== "pending_review" && request.status !== "held") return "not_approvable";

  const connection = await deps.getActiveConnection(firmId);
  if (!connection) return "no_connection";

  const written = await deps.writer.insertEvent(connection, {
    requestPublicId: request.publicId,
    // Recognizable to the office without pushing contact details into a
    // possibly-shared calendar: name only, no phone/email/notes.
    summary: `Appointment — ${request.customerName}`.slice(0, 120),
    startUtc: request.requestedStartAt,
    endUtc: request.requestedEndAt,
    timezone: request.timezone,
  });

  let eventId: string | null = written.ok ? written.eventId : null;

  if (!written.ok && written.reason === "uncertain") {
    // The write may have landed with the response lost on the way back. The
    // one thing NOT to do here is try again: a blind retry is how a single
    // appointment becomes two events in a customer's calendar.
    //
    // So ask. The iCalUID is derived from this request, which makes "did my
    // write land?" a question the provider can answer authoritatively.
    const lookup = await deps.writer.findEventByRequest(connection, request.publicId);
    if (lookup.ok && lookup.eventId !== null) {
      eventId = lookup.eventId;
      deps.logger?.("calendar_event_recovered_after_uncertain_write", { firmId, requestId: request.id });
    } else if (lookup.ok) {
      // A real answer: nothing was created. Treated as an ordinary failure,
      // and the request stays pending for the business to approve again.
      await deps.openIssue({
        firmId,
        level: "warning",
        code: "calendar_sync_failed",
        message: "The calendar did not answer in time, and no event was created. The appointment is still pending.",
        dedupeKey: `event-insert:${request.publicId}`,
        context: { requestPublicId: request.publicId },
      });
      return "event_write_failed";
    } else {
      // We could not find out either. NOT reported as a failure and NOT
      // retried — an unknown outcome is its own answer, and reconciliation is
      // what settles it.
      await deps.openIssue({
        firmId,
        level: "warning",
        code: "calendar_sync_failed",
        message:
          "The calendar did not confirm whether this appointment's event was created. It has not been approved, and nothing was retried — reconcile the calendar to settle it.",
        dedupeKey: `event-insert-unresolved:${request.publicId}`,
        context: { requestPublicId: request.publicId },
      });
      return "event_write_uncertain";
    }
  }

  if (eventId === null) {
    await deps.openIssue({
      firmId,
      level: written.ok || written.reason !== "revoked" ? "warning" : "error",
      code: !written.ok && written.reason === "revoked" ? "calendar_revoked" : "calendar_sync_failed",
      message: "Writing an approved appointment to Google Calendar failed; the request stays pending.",
      dedupeKey: `event-insert:${request.publicId}`,
      context: { requestPublicId: request.publicId },
    });
    return "event_write_failed";
  }

  const stamped = await deps.markBooked(firmId, request.id, eventId, connection.calendarId);
  if (!stamped) {
    // The row changed underneath us — undo the event so nothing orphaned
    // blocks the firm's calendar.
    await deps.writer.deleteEvent(connection, eventId);
    return "conflict_after_write";
  }
  // Best-effort, and deliberately after the booking is safe: a bookkeeping
  // failure must never undo an appointment that is already in the calendar.
  try {
    await deps.markConnectionUsed?.(firmId);
  } catch {
    /* health bookkeeping is not worth failing a booking over */
  }
  deps.logger?.("calendar_event_booked", { firmId, requestId: request.id });
  return "booked";
}

export type CancelSyncOutcome = "disabled" | "skipped" | "no_connection" | "deleted" | "failed";

/**
 * Which calendar an ALREADY-WRITTEN event lives on.
 *
 * Not the connection's current selection. Once a business points new
 * appointments at a different calendar, every event already written stays
 * exactly where it was written — `provider_calendar_id` is stamped on the row
 * at booking time for precisely this reason. Addressing an old event by the
 * new selection asks Google to delete an id that calendar has never held, and
 * Google answers 404 — which `deleteEvent` reads as "already gone" and reports
 * as success. The cancellation would look clean while the appointment stayed
 * on the customer's old calendar indefinitely.
 *
 * A row with no stored calendar predates that column being written and can
 * only have gone to the selection in force at the time; the connection's
 * value is the best available answer for it.
 */
export function calendarHoldingEvent<T extends { calendarId: string }>(
  connection: T,
  storedCalendarId: string | null,
): T {
  if (storedCalendarId === null || storedCalendarId.trim() === "") return connection;
  if (storedCalendarId === connection.calendarId) return connection;
  return { ...connection, calendarId: storedCalendarId };
}

/** For a request that left the calendar-worthy world (cancelled/rescheduled/failed/expired): remove its event. */
export async function removeCalendarEventForRequest(
  request: SchedulingAppointmentRequest,
  deps: CalendarSyncDeps,
): Promise<CancelSyncOutcome> {
  if (!(deps.isEnabled ?? isCalendarWriteEnabled)()) return "disabled";
  if (!request.providerEventId) return "skipped";
  const connection = await deps.getActiveConnection(request.firmId);
  if (!connection) return "no_connection";

  const result = await deps.writer.deleteEvent(
    calendarHoldingEvent(connection, request.providerCalendarId),
    request.providerEventId,
  );
  if (!result.ok) {
    await deps.openIssue({
      firmId: request.firmId,
      level: result.reason === "revoked" ? "error" : "warning",
      code: result.reason === "revoked" ? "calendar_revoked" : "calendar_sync_failed",
      message: "Removing a no-longer-booked appointment from Google Calendar failed.",
      dedupeKey: `event-delete:${request.publicId}`,
      context: { requestPublicId: request.publicId },
    });
    return "failed";
  }
  await deps.clearProviderEvent(request.firmId, request.id);
  deps.logger?.("calendar_event_removed", { firmId: request.firmId, requestId: request.id });
  return "deleted";
}

// ── booked-row lifecycle (cancel / reschedule) ───────────────────────────────
//
// Until these existed, NOTHING in the application could move a row out of
// 'booked': the repository cancel is deliberately pending/held-only (it is
// shared with the voice tool dispatcher), and 'rescheduled' had no writer at
// all — the reconcile pass enumerated statuses no reachable code could
// produce. A booked appointment was permanent. These two orchestrations are
// the narrow, firm-scoped fix: status-guarded single-row transitions plus the
// same best-effort event removal the pending-cancel path already uses, with
// reconciliation as the backstop when the provider call fails.

/** The extra transitions the booked lifecycle needs beyond CalendarSyncDeps. */
export interface BookedLifecycleDeps extends CalendarSyncDeps {
  /** booked → cancelled, status-guarded; false when the row raced away. */
  cancelBooked: (firmId: number, requestId: number) => Promise<boolean>;
  /** booked → rescheduled, status-guarded; false when the row raced away. */
  markRescheduled: (firmId: number, requestId: number) => Promise<boolean>;
  /**
   * Creates the replacement request (pending_review) for a reschedule, fully
   * availability-validated like any new request. Returns ok:false when the
   * requested slot is not bookable.
   */
  submitReplacement: (
    firmId: number,
    before: SchedulingAppointmentRequest,
    startUtc: Date,
  ) => Promise<{ ok: true; publicId: string; startUtc: Date; endUtc: Date } | { ok: false }>;
  /** Cancels the just-created pending replacement after a lost race. */
  discardReplacement: (firmId: number, publicId: string) => Promise<void>;
}

export type CancelBookedOutcome = "not_found" | "not_booked" | "conflict" | "cancelled";

/**
 * Cancels one BOOKED request and removes its event. The DB cancellation is
 * the business action and always proceeds; event removal is best-effort — a
 * provider failure opens a firm-scoped issue and leaves the provider ids in
 * place for reconciliation, exactly like the pending-cancel path.
 */
export async function cancelBookedRequest(
  firmId: number,
  publicId: string,
  deps: BookedLifecycleDeps,
): Promise<{ outcome: CancelBookedOutcome; calendar?: CancelSyncOutcome }> {
  const request = await deps.findRequest(firmId, publicId);
  if (!request) return { outcome: "not_found" };
  if (request.status !== "booked") return { outcome: "not_booked" };

  const cancelled = await deps.cancelBooked(firmId, request.id);
  if (!cancelled) return { outcome: "conflict" }; // raced away — nothing changed here

  let calendar: CancelSyncOutcome;
  try {
    calendar = await removeCalendarEventForRequest(request, deps);
  } catch {
    // The cancellation is already durable; reconciliation removes the event.
    calendar = "failed";
  }
  deps.logger?.("calendar_booked_cancelled", { firmId, requestId: request.id });
  return { outcome: "cancelled", calendar };
}

export type RescheduleOutcome = "not_found" | "not_booked" | "slot_unavailable" | "conflict" | "rescheduled";

/**
 * Reschedules one BOOKED request using the replacement-request model: a new
 * fully-validated pending_review request at the new time, then the old row's
 * status-guarded booked→rescheduled transition, then best-effort removal of
 * the old event. Ordering is deliberate:
 *   - replacement first, so an unavailable slot changes nothing at all;
 *   - the guarded transition second, so a lost race discards the replacement
 *     and leaves the winner's state untouched — never a partial move;
 *   - event removal last, so a provider failure degrades to an open issue
 *     plus reconciliation, never a lost cancellation.
 * The replacement goes through the normal approve path afterwards; nothing
 * here writes a calendar event.
 */
export async function rescheduleBookedRequest(
  firmId: number,
  publicId: string,
  newStartUtc: Date,
  deps: BookedLifecycleDeps,
): Promise<{
  outcome: RescheduleOutcome;
  calendar?: CancelSyncOutcome;
  replacement?: { publicId: string; startUtc: Date; endUtc: Date };
}> {
  const request = await deps.findRequest(firmId, publicId);
  if (!request) return { outcome: "not_found" };
  if (request.status !== "booked") return { outcome: "not_booked" };

  const replacement = await deps.submitReplacement(firmId, request, newStartUtc);
  if (!replacement.ok) return { outcome: "slot_unavailable" };

  const moved = await deps.markRescheduled(firmId, request.id);
  if (!moved) {
    try {
      await deps.discardReplacement(firmId, replacement.publicId);
    } catch {
      // A lingering pending_review replacement is inert and operator-visible;
      // losing it here must not mask the conflict outcome.
    }
    return { outcome: "conflict" };
  }

  let calendar: CancelSyncOutcome;
  try {
    calendar = await removeCalendarEventForRequest(request, deps);
  } catch {
    calendar = "failed";
  }
  deps.logger?.("calendar_booked_rescheduled", { firmId, requestId: request.id });
  return {
    outcome: "rescheduled",
    calendar,
    replacement: { publicId: replacement.publicId, startUtc: replacement.startUtc, endUtc: replacement.endUtc },
  };
}

export interface CalendarReconcileSummary {
  events_removed: number;
  failures: number;
}

/**
 * One reconciliation pass for one firm: any request that is no longer in a
 * calendar-worthy status but still carries a provider event id gets its
 * event removed. (The inverse direction — booked without an event — is
 * unrepresentable by the CHECK constraint, so there is nothing to backfill.)
 */
export async function reconcileCalendarForFirm(
  firmId: number,
  deps: CalendarSyncDeps,
): Promise<CalendarReconcileSummary> {
  const summary: CalendarReconcileSummary = { events_removed: 0, failures: 0 };
  if (!(deps.isEnabled ?? isCalendarWriteEnabled)()) return summary;

  const { db } = await import("@workspace/db");
  const { schedulingAppointmentRequests } = await import("@workspace/db/schema/scheduling");
  const { and, eq, isNotNull, inArray } = await import("drizzle-orm");

  const lingering = await db
    .select()
    .from(schedulingAppointmentRequests)
    .where(
      and(
        eq(schedulingAppointmentRequests.firmId, firmId),
        inArray(schedulingAppointmentRequests.status, ["cancelled", "rescheduled", "failed", "expired"]),
        isNotNull(schedulingAppointmentRequests.providerEventId),
      ),
    )
    .limit(50);

  for (const request of lingering) {
    const outcome = await removeCalendarEventForRequest(request, deps);
    if (outcome === "deleted") summary.events_removed += 1;
    else if (outcome === "failed") summary.failures += 1;
  }
  deps.logger?.("calendar_reconcile", { firmId, ...summary });
  return summary;
}

// ── production persisters (lazy db imports; firm-scoped; status-guarded) ─────

export async function markBookedInDb(
  firmId: number,
  requestId: number,
  providerEventId: string,
  providerCalendarId: string,
): Promise<boolean> {
  const { db } = await import("@workspace/db");
  const { schedulingAppointmentRequests } = await import("@workspace/db/schema/scheduling");
  const { and, eq, inArray } = await import("drizzle-orm");
  const [row] = await db
    .update(schedulingAppointmentRequests)
    .set({ status: "booked", providerEventId, providerCalendarId, updatedAt: new Date() })
    .where(
      and(
        eq(schedulingAppointmentRequests.firmId, firmId),
        eq(schedulingAppointmentRequests.id, requestId),
        inArray(schedulingAppointmentRequests.status, ["pending_review", "held"]),
      ),
    )
    .returning({ id: schedulingAppointmentRequests.id });
  return row !== undefined;
}

export async function clearProviderEventInDb(firmId: number, requestId: number): Promise<void> {
  const { db } = await import("@workspace/db");
  const { schedulingAppointmentRequests } = await import("@workspace/db/schema/scheduling");
  const { and, eq } = await import("drizzle-orm");
  await db
    .update(schedulingAppointmentRequests)
    .set({ providerEventId: null, providerCalendarId: null, updatedAt: new Date() })
    .where(and(eq(schedulingAppointmentRequests.firmId, firmId), eq(schedulingAppointmentRequests.id, requestId)));
}

/**
 * The booked→cancelled transition. Deliberately separate from the repository's
 * pending/held cancel, which is shared with the voice tool dispatcher — this
 * one is reachable only through the authenticated calendar router, so wiring
 * it here widens no AI capability.
 */
export async function cancelBookedInDb(firmId: number, requestId: number): Promise<boolean> {
  const { db } = await import("@workspace/db");
  const { schedulingAppointmentRequests } = await import("@workspace/db/schema/scheduling");
  const { and, eq } = await import("drizzle-orm");
  const now = new Date();
  const [row] = await db
    .update(schedulingAppointmentRequests)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(schedulingAppointmentRequests.firmId, firmId),
        eq(schedulingAppointmentRequests.id, requestId),
        eq(schedulingAppointmentRequests.status, "booked"),
      ),
    )
    .returning({ id: schedulingAppointmentRequests.id });
  return row !== undefined;
}

/** The booked→rescheduled transition; provider ids stay until the event delete succeeds. */
export async function markRescheduledInDb(firmId: number, requestId: number): Promise<boolean> {
  const { db } = await import("@workspace/db");
  const { schedulingAppointmentRequests } = await import("@workspace/db/schema/scheduling");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await db
    .update(schedulingAppointmentRequests)
    .set({ status: "rescheduled", updatedAt: new Date() })
    .where(
      and(
        eq(schedulingAppointmentRequests.firmId, firmId),
        eq(schedulingAppointmentRequests.id, requestId),
        eq(schedulingAppointmentRequests.status, "booked"),
      ),
    )
    .returning({ id: schedulingAppointmentRequests.id });
  return row !== undefined;
}
