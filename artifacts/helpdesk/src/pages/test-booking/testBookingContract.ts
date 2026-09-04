/**
 * V5 PR-7 — every string the Test Booking screen displays.
 *
 * This is the Frontend V2 Phase 13 booking-preview flow (browse the calendar,
 * hold a time, submit contact details), split out into its own route and
 * relabelled for what it has always actually done: post to the exact same
 * endpoints the public scheduling page posts to, storing a real row on this
 * account. The disclosure below says so, unchanged in substance from Phase 13.
 *
 * The one behavioural difference from Phase 13: selecting and even holding a
 * time never, on its own, submits anything a client would see as a real
 * request — the only control that stores a *submitted* request is "Create
 * test request", and it is required to prefix the contact name with
 * `TEST — ` (see `appointments/appointmentsContract.ts`'s
 * `TEST_REQUEST_PREFIX`) so the Appointments list can mark the row with a
 * Test chip and nobody mistakes it for a client's request.
 */

import type { AvailabilityConfig } from "@/lib/availabilityApi";
import { TEST_REQUEST_PREFIX } from "../appointments/appointmentsContract";

export const PAGE = {
  eyebrow: "SCHEDULING",
  title: "Test Booking",
  detail: "The request form a client sees. Try it yourself without creating a request a client would see.",
  loading: "Checking your session…",
} as const;

export const PREVIEW = {
  noTypesTitle: "No appointment types yet",
  noTypesDetail: "Clients can't request a time until at least one appointment type exists. Add one under Availability.",
  readFailed: "Availability couldn't be loaded. Try again shortly.",
  slotsLoading: "Loading times…",
  slotsFailed: "Times couldn't be loaded for this day.",
  slotsEmpty: "No times left on this day.",
  pickDay: "Select an open day",
  pickDayDetail: "Choose a day marked open to see the times a client could request.",
  typeLabel: "Appointment type",

  holdLabel: "Hold this time",
  holdPendingLabel: "Holding…",
  holdConflictTitle: "That time was taken",
  holdConflictDetail: "Someone else took this time while it was open. Choose another time to continue.",
  holdFailedTitle: "The time couldn't be held",
  holdFailedDetail: "Nothing was stored. Try holding the time again.",
  holdNote: "A hold stores a temporary row exactly like a client's hold would, without a name attached. It expires on its own.",

  contactHeading: "Test contact details",
  nameLabel: "Client name",
  phoneLabel: "Phone (optional)",
  emailLabel: "Email (optional)",
  nameRequired: "Enter a name to continue.",
  back: "Back to calendar",

  createLabel: "Create test request",
  createPendingLabel: "Creating…",
  disclosure:
    "Selecting or even holding a time creates nothing a client would see. Only \"Create test request\" stores a request, and it is always saved as a test row — never a real client request.",
  createFailedTitle: "The test request wasn't created",
  createFailedDetail: "Nothing was stored. Try again.",
  conflictTitle: "That time was taken",
  conflictDetail: "The time is no longer available. Choose another time to continue.",

  resultTitle: "Test request created",
  resultState: "Pending review",
  resultDetail:
    "A test request is stored on this account, prefixed so it can never be mistaken for a client's request. Find it under Appointments with a Test chip.",
  resultAgain: "Create another test request",
  continueLabel: "Continue to test contact",
  chooseNote: "Continuing performs no action on its own. Holding stores a temporary hold and takes the time out of the list.",
  heldState: "Held",
  heldTitle: "Time held",
  heldDetail: "The hold is listed under Appointments. It stops holding the time once it expires.",
  heldUntilPrefix: "Holds the time until",
} as const;

export function withTestPrefix(name: string): string {
  const trimmed = name.trim();
  return trimmed.startsWith(TEST_REQUEST_PREFIX) ? trimmed : `${TEST_REQUEST_PREFIX}${trimmed}`;
}

export function activeAppointmentTypeId(
  config: AvailabilityConfig | undefined,
  selected: string | undefined,
): string | undefined {
  return selected ?? config?.appointmentTypes[0]?.id;
}

/* ── Exhaustive string surface ─────────────────────────────────────────── */

export function everyRenderableString(): string[] {
  return [...Object.values(PAGE), ...Object.values(PREVIEW), withTestPrefix("Jane Doe")];
}
