/**
 * V5 PR-7/PR-8 — every string and every rule the Appointments workspace
 * displays: the requests list and the request detail drawer.
 *
 * ── What changed from Frontend V2 Phase 13 ────────────────────────────────
 * The Phase 13 version of this module documented, at length, that no
 * confirm/approve/reschedule/calendar-write endpoint existed and that
 * `booked` and `rescheduled` were unreachable states. PR-7 adds exactly that:
 * the calendar router (`receptionistCalendar.ts`) can approve a pending
 * request into `booked` (writing a real calendar event), reschedule a booked
 * request, and cancel a booked request (removing the event). That premise is
 * now false, and this module states the new one instead of quietly dropping
 * the old claim.
 *
 * The booking-preview flow (the calendar browse/hold/submit UI) and the
 * availability-settings form now live in their own routes — see
 * `pages/test-booking/testBookingContract.ts` and
 * `pages/availability/availabilityContract.ts` — and the shared calendar-grid
 * date arithmetic moved to `lib/schedulingDates.ts` so those two screens don't
 * carry two copies of it. This module owns only the requests list and the
 * detail drawer.
 *
 * Cancellation dispatches to one of two different endpoints depending on the
 * row's state, and this module names which:
 *  - `pending_review` / `held` → the unchanged availability router's
 *    `POST .../availability/requests/:id/cancel` (no calendar involved).
 *  - `booked` → the calendar router's `POST .../calendar/requests/:id/cancel`
 *    (removes the written event, best-effort).
 * A row in any other state cannot be cancelled from here.
 */

import type {
  AppointmentContact,
  AppointmentRequestState,
  AvailabilityConfig,
} from "@/lib/availabilityApi";
import type {
  ApproveReason,
  CancelReason,
  RescheduleReason,
  ReconcileReason,
} from "@/lib/calendarApi";

/* ── Page ──────────────────────────────────────────────────────────────── */

export const PAGE = {
  eyebrow: "SCHEDULING",
  title: "Appointments",
  detail: "Review, approve, reschedule, and cancel appointment requests.",
  loading: "Checking your session…",
} as const;

/* ── Prefix marking a request created from Test Booking ───────────────── */

export const TEST_REQUEST_PREFIX = "TEST — ";

export function isTestRequest(contact: AppointmentContact | null | undefined): boolean {
  return typeof contact?.name === "string" && contact.name.startsWith(TEST_REQUEST_PREFIX);
}

/* ── Request states ────────────────────────────────────────────────────── */

const REACHABLE_STATE_LABEL: Partial<Record<AppointmentRequestState, string>> = {
  pending_review: "Pending review",
  held: "Held",
  booked: "Booked",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  expired: "Expired",
};

export function requestStateLabel(state: string): string {
  const known = REACHABLE_STATE_LABEL[state as AppointmentRequestState];
  if (known !== undefined) return known;
  if (typeof state !== "string" || state.trim() === "") return "Unknown";
  const words = state.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type StateTone = "attention" | "neutral" | "settled" | "muted";

export function requestStateTone(state: string): StateTone {
  if (state === "pending_review") return "attention";
  if (state === "held") return "neutral";
  if (state === "booked" || state === "rescheduled") return "settled";
  return "muted";
}

export function canApprove(state: string): boolean {
  return state === "pending_review";
}

export function canReschedule(state: string): boolean {
  return state === "booked";
}

/** Which endpoint a Cancel action must call for this row's state, or `null` if the row can't be cancelled. */
export function cancelEndpointFor(state: string): "availability" | "calendar" | null {
  if (state === "pending_review" || state === "held") return "availability";
  if (state === "booked") return "calendar";
  return null;
}

export function canCancel(state: string): boolean {
  return cancelEndpointFor(state) !== null;
}

const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  ai_receptionist: "AI receptionist",
  manual: "Added manually",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? "Unknown source";
}

/* ── Requests list ─────────────────────────────────────────────────────── */

export const REQUESTS = {
  heading: "Requests",
  detail: "Appointment requests stored on this account.",
  loading: "Loading requests…",
  failed: "Requests couldn't be loaded. Try again shortly.",
  emptyTitle: "No requests yet",
  emptyDetail:
    "Requests submitted from the public scheduling page or the AI receptionist appear here.",
  columnClient: "Client",
  columnType: "Type",
  columnWhen: "Requested time",
  columnStatus: "Status",
  columnSource: "Source",
  noName: "No name given",
  noContact: "No contact details given",
  unknownType: "Unspecified type",
  testChip: "Test",
  openRecord: "Open request",
  reconcileLabel: "Reconcile calendar",
  reconcilePendingLabel: "Reconciling…",
  reconcileSuccessTitle: "Calendar reconciled",
  reconcileFailedTitle: "Reconcile didn't complete",
  reconcileFailedDetail: "Nothing changed. Try again.",
  reconcileDisabledDetail: "Calendar connection is not enabled on this workspace yet.",
} as const;

export function reconcileSummary(eventsRemoved: number, failures: number): string {
  const removedText = eventsRemoved === 1 ? "1 stray event removed" : `${eventsRemoved} stray events removed`;
  return failures > 0 ? `${removedText}, ${failures} couldn't be removed.` : `${removedText}.`;
}

export function contactName(contact: AppointmentContact | null | undefined): string {
  const name = contact?.name;
  if (typeof name === "string" && name.trim() !== "") {
    return isTestRequest(contact) ? name.trim().slice(TEST_REQUEST_PREFIX.length) : name.trim();
  }
  return REQUESTS.noName;
}

export function contactDetail(contact: AppointmentContact | null | undefined): string {
  const parts = [contact?.phone, contact?.email]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  return parts.length > 0 ? parts.join(" · ") : REQUESTS.noContact;
}

export function typeName(config: AvailabilityConfig | undefined, appointmentTypeId: string): string {
  const found = config?.appointmentTypes.find((t) => t.id === appointmentTypeId);
  if (found && typeof found.name === "string" && found.name.trim() !== "") return found.name;
  return REQUESTS.unknownType;
}

/* ── Detail drawer ─────────────────────────────────────────────────────── */

export const DETAIL = {
  closeLabel: "Close",
  statusHistoryHeading: "Status",
  detailsHeading: "Details",
  clientLabel: "Client",
  typeLabel: "Type",
  whenLabel: "Requested time",
  sourceLabel: "Source",

  approveLabel: "Approve",
  approvePendingLabel: "Approving…",
  approveSuccessTitle: "Appointment booked",
  approveSuccessDetail: "SiteMint wrote this appointment to the connected calendar.",
  approveFailedTitle: "This request wasn't approved",

  rescheduleLabel: "Reschedule",
  reschedulePickHeading: "Pick a new time",
  reschedulePendingLabel: "Rescheduling…",
  rescheduleConfirmLabel: "Confirm new time",
  rescheduleSuccessTitle: "Appointment rescheduled",
  rescheduleSuccessDetail: "The calendar event was updated to the new time.",
  rescheduleFailedTitle: "This appointment wasn't rescheduled",
  reschedulePickDay: "Select an open day",
  rescheduleSlotsEmpty: "No times left on this day.",
  rescheduleCancel: "Cancel",

  cancelLabel: "Cancel appointment",
  cancelPendingLabel: "Cancelling…",
  cancelConfirmTitle: "Cancel this appointment?",
  cancelConfirmDetailBooked: "The calendar event is removed. Nobody is notified automatically.",
  cancelConfirmDetailPending: "The request is marked cancelled on this account. Nobody is told, and nothing else changes.",
  cancelConfirmAction: "Cancel appointment",
  cancelConfirmDismiss: "Keep appointment",
  cancelledAnnouncement: "Appointment cancelled.",
  cancelFailedTitle: "This appointment wasn't cancelled",

  conflictTitle: "Something changed on the calendar",
  conflictDetail: "The list has been refreshed with the latest status.",
} as const;

/**
 * Status history for a request's detail drawer, derived from its current
 * state and `createdAt` only — the API carries no separate event log, so
 * nothing before the current state is invented. A row that reached
 * `cancelled` or `expired` may have passed through `held` or `pending_review`
 * first, but which one is not knowable from this response, so only what is
 * certain is shown: it was created, and it is now in its current state.
 */
export interface StatusStep {
  label: string;
  tone: "done" | "current";
  at: string | null;
}

export function statusHistory(state: string, createdAt: string): StatusStep[] {
  const created: StatusStep = { label: "Created", tone: "done", at: createdAt };
  if (state === "booked") {
    return [created, { label: "Pending review", tone: "done", at: null }, { label: "Booked", tone: "current", at: null }];
  }
  if (state === "rescheduled") {
    return [
      created,
      { label: "Pending review", tone: "done", at: null },
      { label: "Booked", tone: "done", at: null },
      { label: "Rescheduled", tone: "current", at: null },
    ];
  }
  return [created, { label: requestStateLabel(state), tone: "current", at: null }];
}

/* ── Reason → plain copy ───────────────────────────────────────────────── */

export interface ReasonCopy {
  title: string;
  detail: string;
}

const APPROVE_REASON_COPY: Record<ApproveReason, ReasonCopy> = {
  disabled: {
    title: DETAIL.approveFailedTitle,
    detail: "Calendar connection is not enabled on this workspace yet.",
  },
  no_connection: {
    title: DETAIL.approveFailedTitle,
    detail: "No calendar is connected. Connect one under Calendar, then try approving again.",
  },
  not_found: {
    title: "This request is gone",
    detail: "It may have already been approved, cancelled, or removed elsewhere.",
  },
  not_approvable: {
    title: DETAIL.approveFailedTitle,
    detail: "This request can no longer be approved from here. Its status may have changed.",
  },
  event_write_failed: {
    title: DETAIL.approveFailedTitle,
    detail: "SiteMint couldn't write this appointment to the connected calendar. Nothing was approved.",
  },
  conflict_after_write: {
    title: "Check the connected calendar",
    detail: "The calendar reported a conflict right after writing this event. Review the connected calendar before trying again.",
  },
};

const CANCEL_REASON_COPY: Record<CancelReason, ReasonCopy> = {
  not_found: { title: "This request is gone", detail: "It may have already been cancelled or removed elsewhere." },
  not_booked: { title: DETAIL.cancelFailedTitle, detail: "This appointment isn't booked, so it can't be cancelled this way. The list has been refreshed." },
  conflict: { title: "Check the connected calendar", detail: "The calendar reported a conflict while cancelling. Review the connected calendar." },
};

const RESCHEDULE_REASON_COPY: Record<RescheduleReason, ReasonCopy> = {
  not_found: { title: "This request is gone", detail: "It may have already been cancelled or removed elsewhere." },
  not_booked: { title: DETAIL.rescheduleFailedTitle, detail: "This appointment isn't booked, so it can't be rescheduled this way." },
  slot_unavailable: { title: "That time is no longer available", detail: "Pick another time to continue." },
  conflict: { title: "Check the connected calendar", detail: "The calendar reported a conflict while rescheduling. Review the connected calendar." },
};

const RECONCILE_REASON_COPY: Record<ReconcileReason, ReasonCopy> = {
  disabled: { title: REQUESTS.reconcileFailedTitle, detail: "Calendar connection is not enabled on this workspace yet." },
};

export const GENERIC_FAILURE: ReasonCopy = {
  title: "Something went wrong",
  detail: "Nothing changed. Try again.",
};

export function approveReasonCopy(reason: string | null): ReasonCopy {
  return APPROVE_REASON_COPY[reason as ApproveReason] ?? { ...GENERIC_FAILURE, title: DETAIL.approveFailedTitle };
}

export function cancelReasonCopy(reason: string | null): ReasonCopy {
  return CANCEL_REASON_COPY[reason as CancelReason] ?? { ...GENERIC_FAILURE, title: DETAIL.cancelFailedTitle };
}

export function rescheduleReasonCopy(reason: string | null): ReasonCopy {
  return RESCHEDULE_REASON_COPY[reason as RescheduleReason] ?? { ...GENERIC_FAILURE, title: DETAIL.rescheduleFailedTitle };
}

export function reconcileReasonCopy(reason: string | null): ReasonCopy {
  return RECONCILE_REASON_COPY[reason as ReconcileReason] ?? { ...GENERIC_FAILURE, title: REQUESTS.reconcileFailedTitle };
}

/* ── Exhaustive string surface ─────────────────────────────────────────── */

export function everyRenderableString(): string[] {
  const states = ["pending_review", "held", "booked", "rescheduled", "cancelled", "expired", "requested", "failed", ""];
  return [
    ...Object.values(PAGE),
    ...Object.values(REQUESTS),
    ...Object.values(DETAIL),
    ...states.map((s) => requestStateLabel(s)),
    ...["website", "ai_receptionist", "manual", "unknown"].map((s) => sourceLabel(s)),
    contactName(null),
    contactDetail(null),
    typeName(undefined, "whatever"),
    reconcileSummary(0, 0),
    reconcileSummary(1, 1),
    ...Object.values(APPROVE_REASON_COPY).flatMap((c) => [c.title, c.detail]),
    ...Object.values(CANCEL_REASON_COPY).flatMap((c) => [c.title, c.detail]),
    ...Object.values(RESCHEDULE_REASON_COPY).flatMap((c) => [c.title, c.detail]),
    ...Object.values(RECONCILE_REASON_COPY).flatMap((c) => [c.title, c.detail]),
    GENERIC_FAILURE.title,
    GENERIC_FAILURE.detail,
  ];
}
