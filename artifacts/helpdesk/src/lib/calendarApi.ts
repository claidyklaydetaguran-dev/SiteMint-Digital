/**
 * V5 PR-7 — client for the authenticated calendar router
 * (`artifacts/api-server/src/routes/receptionistCalendar.ts`).
 *
 * Six endpoints, all cookie-authenticated and firm-scoped by the session. The
 * browser never sends a firm id. Every non-2xx answer is raised as a
 * `CalendarActionError` carrying the HTTP status and, when the server sent
 * one, the coarse `reason` token — the page maps that token to plain copy in
 * `pages/appointments/appointmentsContract.ts` and never shows a raw token.
 *
 * The router is deliberately coarse in what it returns: no provider event id,
 * calendar id, account email or token ever reaches this client.
 */

const API_BASE = "/api";

export type ApproveReason =
  | "disabled"
  | "no_connection"
  | "not_found"
  | "not_approvable"
  | "event_write_failed"
  | "conflict_after_write";

export type CancelReason = "not_found" | "not_booked" | "conflict";

export type RescheduleReason = "not_found" | "not_booked" | "slot_unavailable" | "conflict";

export type ReconcileReason = "disabled";

export type CalendarEventOutcome = "deleted" | "skipped" | "failed";

export interface ApproveResult {
  ok: true;
  status: "booked";
}

export interface CancelBookedResult {
  ok: true;
  status: "cancelled";
  calendar: CalendarEventOutcome;
}

export interface RescheduleResult {
  ok: true;
  status: "rescheduled";
  calendar: CalendarEventOutcome;
  replacement: { id: string; startUtc: string; endUtc: string };
}

export interface ReconcileResult {
  ok: true;
  events_removed: number;
  failures: number;
}

/**
 * A failed calendar action. `status` is the HTTP status; `reason` is the
 * server's token when the body carried `{ ok: false, reason }`, otherwise
 * null (a `{ error }` body, a 500, or no body at all).
 */
export class CalendarActionError extends Error {
  readonly status: number;
  readonly reason: string | null;

  constructor(message: string, status: number, reason: string | null) {
    super(message);
    this.name = "CalendarActionError";
    this.status = status;
    this.reason = reason;
  }
}

export function isCalendarActionError(err: unknown): err is CalendarActionError {
  return err instanceof CalendarActionError;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function calendarFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const record = (body ?? {}) as { error?: unknown; reason?: unknown };
    const message =
      typeof record.error === "string" && record.error.trim() !== ""
        ? record.error.slice(0, 300)
        : GENERIC_ERROR;
    const reason = typeof record.reason === "string" ? record.reason : null;
    throw new CalendarActionError(message, res.status, reason);
  }
  return body as T;
}

/** `POST /calendar/google/start` → `{ authorizeUrl }`; 503 when connect is off. */
export function startGoogleCalendarConnect(): Promise<{ authorizeUrl: string }> {
  return calendarFetch("/receptionist/calendar/google/start", { method: "POST" });
}

/** `DELETE /calendar/connection` → `{ disconnected: true }`; 404 when nothing is connected. */
export function disconnectCalendar(): Promise<{ disconnected: true }> {
  return calendarFetch("/receptionist/calendar/connection", { method: "DELETE" });
}

/** `POST /calendar/requests/:publicId/approve` — pending_review → booked, one event written. */
export function approveAppointmentRequest(publicId: string): Promise<ApproveResult> {
  return calendarFetch(`/receptionist/calendar/requests/${encodeURIComponent(publicId)}/approve`, {
    method: "POST",
  });
}

/** `POST /calendar/requests/:publicId/cancel` — booked → cancelled, event removed best-effort. */
export function cancelBookedAppointment(publicId: string): Promise<CancelBookedResult> {
  return calendarFetch(`/receptionist/calendar/requests/${encodeURIComponent(publicId)}/cancel`, {
    method: "POST",
  });
}

/** `POST /calendar/requests/:publicId/reschedule` body `{ startUtc }` — booked → rescheduled + a replacement request. */
export function rescheduleBookedAppointment(publicId: string, startUtc: string): Promise<RescheduleResult> {
  return calendarFetch(`/receptionist/calendar/requests/${encodeURIComponent(publicId)}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ startUtc }),
  });
}

/** `POST /calendar/reconcile` — removes stray events for rows that left the booked state. */
export function reconcileCalendar(): Promise<ReconcileResult> {
  return calendarFetch("/receptionist/calendar/reconcile", { method: "POST" });
}
