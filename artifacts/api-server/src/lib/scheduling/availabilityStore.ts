// Checkpoint A: an in-memory, per-firm Development store for availability
// configuration and appointment requests/holds. Deliberately NOT a database
// table — a durable, admin-configurable settings/appointments schema needs a
// reviewed migration that hasn't been approved yet (see
// docs/ai-receptionist/SCHEDULING.md). This store resets on every server
// restart and is never treated as a source of truth beyond this Development
// preview; nothing here is a real, provider-confirmed calendar appointment.
//
// Concurrency: every mutating operation here is a single synchronous
// function body with no `await` between its availability check and its
// write, so Node's single-threaded event loop gives it the same
// check-then-write atomicity a unique DB constraint would — two "concurrent"
// requests for the identical slot are still serialized in arrival order,
// and the loser gets an honest conflict rather than a second silent booking.

import { randomUUID } from "node:crypto";
import {
  computeDayAvailability,
  isSlotStillAvailable,
  SAMPLE_DEVELOPMENT_AVAILABILITY_CONFIG,
  type AvailabilityConfig,
  type ExistingBooking,
  type DayAvailabilityResult,
} from "./availabilityEngine.js";

export const APPOINTMENT_REQUEST_STATES = [
  "held",
  "pending_review",
  "cancelled",
  "expired",
] as const;
export type AppointmentRequestState = (typeof APPOINTMENT_REQUEST_STATES)[number];

export type AppointmentSource = "website" | "ai_receptionist" | "manual";

export interface AppointmentContact {
  name: string;
  phone: string | null;
  email: string | null;
}

export interface AppointmentRequestRecord {
  id: string;
  firmId: number;
  appointmentTypeId: string;
  startUtc: Date;
  endUtc: Date;
  state: AppointmentRequestState;
  source: AppointmentSource;
  contact: AppointmentContact | null;
  createdAt: Date;
  /** Only set while state === "held". */
  holdExpiresAt: Date | null;
}

const HOLD_DURATION_MIN = 5;

interface FirmSchedulingState {
  config: AvailabilityConfig;
  requests: AppointmentRequestRecord[];
}

const firmState = new Map<number, FirmSchedulingState>();

function getOrInitFirmState(firmId: number): FirmSchedulingState {
  let state = firmState.get(firmId);
  if (!state) {
    state = { config: cloneConfig(SAMPLE_DEVELOPMENT_AVAILABILITY_CONFIG), requests: [] };
    firmState.set(firmId, state);
  }
  return state;
}

function cloneConfig(config: AvailabilityConfig): AvailabilityConfig {
  return {
    ...config,
    weeklyHours: { ...config.weeklyHours },
    appointmentTypes: config.appointmentTypes.map((t) => ({ ...t })),
    blockedDates: [...config.blockedDates],
  };
}

export function getAvailabilityConfig(firmId: number): AvailabilityConfig {
  return cloneConfig(getOrInitFirmState(firmId).config);
}

export function setAvailabilityConfig(firmId: number, config: AvailabilityConfig): void {
  getOrInitFirmState(firmId).config = cloneConfig(config);
}

/** Expires stale holds in place (lazy expiry — no timer/background job). */
function sweepExpiredHolds(state: FirmSchedulingState, now: Date): void {
  for (const req of state.requests) {
    if (req.state === "held" && req.holdExpiresAt && req.holdExpiresAt.getTime() <= now.getTime()) {
      req.state = "expired";
      req.holdExpiresAt = null;
    }
  }
}

function activeBookingsForAvailability(state: FirmSchedulingState, now: Date): ExistingBooking[] {
  sweepExpiredHolds(state, now);
  return state.requests
    .filter((r) => r.state === "held" || r.state === "pending_review")
    .map((r) => ({ startUtc: r.startUtc, endUtc: r.endUtc }));
}

export function getDayAvailability(firmId: number, dateKey: string, appointmentTypeId: string, now: Date): DayAvailabilityResult {
  const state = getOrInitFirmState(firmId);
  const bookings = activeBookingsForAvailability(state, now);
  return computeDayAvailability(state.config, bookings, dateKey, appointmentTypeId, now);
}

export type SlotMutationResult =
  | { ok: true; request: AppointmentRequestRecord }
  | { ok: false; reason: "slot_no_longer_available" };

/** Places a short-lived hold on a slot while the visitor fills in contact details. Purely a Development-preview UX aid — never a real reservation with any external provider. */
export function createHold(
  firmId: number,
  appointmentTypeId: string,
  startUtc: Date,
  now: Date,
): SlotMutationResult {
  const state = getOrInitFirmState(firmId);
  const bookings = activeBookingsForAvailability(state, now);
  if (!isSlotStillAvailable(state.config, bookings, startUtc, appointmentTypeId, now)) {
    return { ok: false, reason: "slot_no_longer_available" };
  }
  const type = state.config.appointmentTypes.find((t) => t.id === appointmentTypeId);
  if (!type) return { ok: false, reason: "slot_no_longer_available" };

  const request: AppointmentRequestRecord = {
    id: randomUUID(),
    firmId,
    appointmentTypeId,
    startUtc,
    endUtc: new Date(startUtc.getTime() + type.durationMin * 60_000),
    state: "held",
    source: "website",
    contact: null,
    createdAt: now,
    holdExpiresAt: new Date(now.getTime() + HOLD_DURATION_MIN * 60_000),
  };
  state.requests.push(request);
  return { ok: true, request };
}

/**
 * Submits the final appointment request. Always lands as `pending_review` —
 * this checkpoint has no calendar integration, so nothing can ever become
 * `booked` here. Revalidates the slot one more time regardless of any prior
 * hold, so a hold that expired (or was never taken) doesn't bypass the check.
 */
export function submitAppointmentRequest(
  firmId: number,
  appointmentTypeId: string,
  startUtc: Date,
  contact: AppointmentContact,
  source: AppointmentSource,
  now: Date,
): SlotMutationResult {
  const state = getOrInitFirmState(firmId);
  const bookings = activeBookingsForAvailability(state, now);
  if (!isSlotStillAvailable(state.config, bookings, startUtc, appointmentTypeId, now)) {
    return { ok: false, reason: "slot_no_longer_available" };
  }
  const type = state.config.appointmentTypes.find((t) => t.id === appointmentTypeId);
  if (!type) return { ok: false, reason: "slot_no_longer_available" };

  const request: AppointmentRequestRecord = {
    id: randomUUID(),
    firmId,
    appointmentTypeId,
    startUtc,
    endUtc: new Date(startUtc.getTime() + type.durationMin * 60_000),
    state: "pending_review",
    source,
    contact,
    createdAt: now,
    holdExpiresAt: null,
  };
  state.requests.push(request);
  return { ok: true, request };
}

export function listAppointmentRequests(firmId: number, now: Date): AppointmentRequestRecord[] {
  const state = getOrInitFirmState(firmId);
  sweepExpiredHolds(state, now);
  return [...state.requests].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function cancelAppointmentRequest(firmId: number, requestId: string): boolean {
  const state = getOrInitFirmState(firmId);
  const request = state.requests.find((r) => r.id === requestId);
  if (!request || request.state === "cancelled") return false;
  request.state = "cancelled";
  request.holdExpiresAt = null;
  return true;
}

/** Test-only: clears all in-memory state between test cases. Never called from application routes. */
export function _resetSchedulingStoreForTests(): void {
  firmState.clear();
}
