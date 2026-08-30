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
  if (!written.ok) {
    await deps.openIssue({
      firmId,
      level: written.reason === "revoked" ? "error" : "warning",
      code: written.reason === "revoked" ? "calendar_revoked" : "calendar_sync_failed",
      message: "Writing an approved appointment to Google Calendar failed; the request stays pending.",
      dedupeKey: `event-insert:${request.publicId}`,
      context: { requestPublicId: request.publicId },
    });
    return "event_write_failed";
  }

  const stamped = await deps.markBooked(firmId, request.id, written.eventId, connection.calendarId);
  if (!stamped) {
    // The row changed underneath us — undo the event so nothing orphaned
    // blocks the firm's calendar.
    await deps.writer.deleteEvent(connection, written.eventId);
    return "conflict_after_write";
  }
  deps.logger?.("calendar_event_booked", { firmId, requestId: request.id });
  return "booked";
}

export type CancelSyncOutcome = "disabled" | "skipped" | "no_connection" | "deleted" | "failed";

/** For a request that left the calendar-worthy world (cancelled/rescheduled/failed/expired): remove its event. */
export async function removeCalendarEventForRequest(
  request: SchedulingAppointmentRequest,
  deps: CalendarSyncDeps,
): Promise<CancelSyncOutcome> {
  if (!(deps.isEnabled ?? isCalendarWriteEnabled)()) return "disabled";
  if (!request.providerEventId) return "skipped";
  const connection = await deps.getActiveConnection(request.firmId);
  if (!connection) return "no_connection";

  const result = await deps.writer.deleteEvent(connection, request.providerEventId);
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
