/**
 * Checkpoint A: client for the scheduling/availability endpoints. Backed by
 * an in-memory Development store server-side (see
 * lib/scheduling/availabilityStore.ts) — settings and requests reset when
 * the server restarts, and nothing here can ever reach a "booked" state,
 * since no real calendar provider is connected yet.
 */

const API_BASE = "/api";

export interface DayHours {
  start: string;
  end: string;
}

export interface AppointmentType {
  id: string;
  name: string;
  durationMin: number;
}

export interface AvailabilityConfig {
  timezone: string;
  weeklyHours: Record<number, DayHours | null>;
  appointmentTypes: AppointmentType[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  blockedDates: string[];
  slotIntervalMin: number;
  dailyLimit: number | null;
}

export const DAY_REASONS = [
  "open",
  "blocked",
  "outside_hours",
  "fully_booked",
  "past_booking_window",
  "beyond_advance_window",
] as const;
export type DayReason = (typeof DAY_REASONS)[number];

export interface DaySummary {
  dateKey: string;
  reason: DayReason;
  slotCount: number;
}

export interface DaySlot {
  startUtc: string;
  endUtc: string;
}

export interface DayDetail {
  dateKey: string;
  reason: DayReason;
  slots: DaySlot[];
}

export const APPOINTMENT_REQUEST_STATES = ["held", "pending_review", "cancelled", "expired"] as const;
export type AppointmentRequestState = (typeof APPOINTMENT_REQUEST_STATES)[number];
export type AppointmentSource = "website" | "ai_receptionist" | "manual";

export interface AppointmentContact {
  name: string;
  phone: string | null;
  email: string | null;
}

export interface AppointmentRequest {
  id: string;
  firmId: number;
  appointmentTypeId: string;
  startUtc: string;
  endUtc: string;
  state: AppointmentRequestState;
  source: AppointmentSource;
  contact: AppointmentContact | null;
  createdAt: string;
  holdExpiresAt: string | null;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = GENERIC_ERROR;
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.trim()) message = body.error.slice(0, 300);
    } catch {
      // no JSON body — keep the generic message
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export function fetchAvailabilityConfig(): Promise<{ config: AvailabilityConfig }> {
  return apiFetch("/receptionist/availability/config");
}

export function updateAvailabilityConfig(config: AvailabilityConfig): Promise<{ config: AvailabilityConfig }> {
  return apiFetch("/receptionist/availability/config", { method: "PUT", body: JSON.stringify(config) });
}

export function fetchAvailabilityDays(start: string, end: string, appointmentTypeId: string): Promise<{ days: DaySummary[] }> {
  const params = new URLSearchParams({ start, end, appointmentTypeId });
  return apiFetch(`/receptionist/availability/days?${params}`);
}

export function fetchAvailabilitySlots(date: string, appointmentTypeId: string): Promise<DayDetail> {
  const params = new URLSearchParams({ date, appointmentTypeId });
  return apiFetch(`/receptionist/availability/slots?${params}`);
}

export function holdSlot(appointmentTypeId: string, startUtc: string): Promise<{ request: AppointmentRequest }> {
  return apiFetch("/receptionist/availability/hold", { method: "POST", body: JSON.stringify({ appointmentTypeId, startUtc }) });
}

export function submitAppointmentRequest(
  appointmentTypeId: string,
  startUtc: string,
  contact: AppointmentContact,
): Promise<{ request: AppointmentRequest }> {
  return apiFetch("/receptionist/availability/requests", {
    method: "POST",
    body: JSON.stringify({ appointmentTypeId, startUtc, contact, source: "website" }),
  });
}

export function fetchAppointmentRequests(): Promise<{ items: AppointmentRequest[] }> {
  return apiFetch("/receptionist/availability/requests");
}

export function cancelAppointmentRequest(id: string): Promise<{ ok: true }> {
  return apiFetch(`/receptionist/availability/requests/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}
