/**
 * Checkpoint B: client for the authenticated scheduling/availability
 * endpoints. Backed by durable, firm-scoped Postgres records server-side
 * (see lib/scheduling/schedulingRepository.ts) — nothing here can ever
 * reach a "booked" state until a real calendar-provider write integration
 * exists.
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

/**
 * A per-appointment-type rule override.
 *
 * `null` means "inherit the business default" and is NOT the same as 0 — a
 * service with no buffer sends 0, a service that follows the business sends
 * null. The server keeps both meanings, so the editor must too.
 */
export interface AppointmentTypeOverrides {
  bufferBeforeMin: number | null;
  bufferAfterMin: number | null;
  minNoticeHours: number | null;
  maxAdvanceDays: number | null;
  slotIntervalMin: number | null;
  dailyLimit: number | null;
}

/** What the server will actually use for this type, after inheritance. */
export interface EffectiveTypeRules {
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  slotIntervalMin: number;
  dailyLimit: number | null;
  typeDailyLimit: number | null;
}

export interface AppointmentTypeDetail {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  active: boolean;
  public: boolean;
  calendarId: string | null;
  overrides: AppointmentTypeOverrides;
  /**
   * Computed server-side by the same function the slot search uses. The editor
   * DISPLAYS this and never recomputes it — a second inheritance calculation
   * here is how a shown rule starts differing from the enforced one.
   */
  effective: EffectiveTypeRules;
}

/** A named departure from the weekly pattern on one date, in the business's zone. */
export interface DateException {
  dateKey: string;
  closed: boolean;
  hours?: DayHours;
  label?: string;
}

export interface AvailabilityConfig {
  timezone: string;
  weeklyHours: Record<number, DayHours | null>;
  appointmentTypes: AppointmentType[];
  /** Present from the scheduling 0002 server; absent from an older one. */
  appointmentTypeDetail?: AppointmentTypeDetail[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  slotIntervalMin?: number;
  blockedDates: string[];
  dateExceptions?: DateException[];
  dailyLimit: number | null;
}

/**
 * What the editor sends back. Distinct from `AvailabilityConfig` because the
 * write shape is not the read shape: types carry their overrides inline, and
 * the read-only `effective` block is never echoed back.
 */
export interface AvailabilityConfigInput {
  timezone: string;
  weeklyHours: Record<number, DayHours | null>;
  appointmentTypes: AppointmentTypeInput[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  blockedDates: string[];
  dateExceptions: DateException[];
  dailyLimit: number | null;
}

export interface AppointmentTypeInput {
  id?: string;
  name: string;
  durationMin: number;
  description?: string | null;
  active?: boolean;
  public?: boolean;
  calendarId?: string | null;
  bufferBeforeMin?: number | null;
  bufferAfterMin?: number | null;
  minNoticeHours?: number | null;
  maxAdvanceDays?: number | null;
  slotIntervalMin?: number | null;
  dailyLimit?: number | null;
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

// The durable schema's full status enum (see
// lib/db/src/schema/scheduling.ts). Only held/pending_review/cancelled/
// expired are reachable via any Checkpoint B code path — requested, booked,
// rescheduled, and failed are modeled now so the admin UI and schema don't
// need another migration once a real calendar-provider integration
// (Checkpoint C) can actually produce them.
export const APPOINTMENT_REQUEST_STATES = [
  "requested",
  "pending_review",
  "held",
  "booked",
  "cancelled",
  "rescheduled",
  "failed",
  "expired",
] as const;
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

export function updateAvailabilityConfig(config: AvailabilityConfigInput): Promise<{ config: AvailabilityConfig }> {
  return apiFetch("/receptionist/availability/config", { method: "PUT", body: JSON.stringify(config) });
}

export function fetchCalendarStatus(): Promise<{ connected: boolean; provider: "google" | "none" }> {
  return apiFetch("/receptionist/availability/calendar-status");
}

export function setPublicSchedulingLink(enabled: boolean): Promise<{ enabled: boolean; slug: string | null }> {
  return apiFetch("/receptionist/availability/public-link", { method: "PUT", body: JSON.stringify({ enabled }) });
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

/**
 * `source` records WHO put the appointment in the book, and it is not
 * cosmetic: "Website" and "Added manually" mean different things to a business
 * looking at the list later, and the receptionist's own bookings are a third
 * thing again. A default of "website" for an appointment the business typed in
 * itself would be a quiet lie in its own records.
 *
 * Consent is never inferred from a phone number or an address being present —
 * only an explicit `true` reaches the server, which defaults it to false.
 */
export function submitAppointmentRequest(
  appointmentTypeId: string,
  startUtc: string,
  contact: AppointmentContact,
  options?: { source?: "website" | "manual"; phoneConsent?: boolean; smsConsent?: boolean; emailConsent?: boolean },
): Promise<{ request: AppointmentRequest }> {
  return apiFetch("/receptionist/availability/requests", {
    method: "POST",
    body: JSON.stringify({
      appointmentTypeId,
      startUtc,
      contact: {
        ...contact,
        phoneConsent: options?.phoneConsent === true,
        smsConsent: options?.smsConsent === true,
        emailConsent: options?.emailConsent === true,
      },
      source: options?.source ?? "website",
    }),
  });
}

export function fetchAppointmentRequests(): Promise<{ items: AppointmentRequest[] }> {
  return apiFetch("/receptionist/availability/requests");
}

export function cancelAppointmentRequest(id: string): Promise<{ ok: true }> {
  return apiFetch(`/receptionist/availability/requests/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}
