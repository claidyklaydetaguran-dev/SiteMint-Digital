/**
 * Checkpoint B: client for the public, unauthenticated scheduling routes
 * (/api/public/schedule/:slug/*). No session cookie is sent — this page is
 * reachable by anyone with the link, and the server never returns anything
 * beyond what's safe for a stranger to see (no internal firm id, no other
 * customer's data, no private calendar-event fields).
 */

const API_BASE = "/api/public/schedule";

export interface PublicAppointmentType {
  id: string;
  name: string;
  durationMin: number;
}

export interface PublicScheduleConfig {
  firmName: string;
  timezone: string;
  appointmentTypes: PublicAppointmentType[];
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

export interface PublicContact {
  name: string;
  phone: string | null;
  email: string | null;
  notes?: string;
  phoneConsent: boolean;
  smsConsent: boolean;
  emailConsent: boolean;
}

export interface PublicRequestResult {
  status: "pending_review";
  booked: false;
  message: string;
  appointmentType: string;
  startUtc: string;
  timezone: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NOT_FOUND_ERROR = "This scheduling page could not be found.";

async function apiFetch<T>(slug: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(slug)}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = res.status === 404 ? NOT_FOUND_ERROR : GENERIC_ERROR;
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

export function fetchPublicConfig(slug: string): Promise<PublicScheduleConfig> {
  return apiFetch(slug, "/config");
}

export function fetchPublicDays(slug: string, start: string, end: string, appointmentTypeId: string): Promise<{ days: DaySummary[] }> {
  const params = new URLSearchParams({ start, end, appointmentTypeId });
  return apiFetch(slug, `/days?${params}`);
}

export function fetchPublicSlots(slug: string, date: string, appointmentTypeId: string): Promise<DayDetail> {
  const params = new URLSearchParams({ date, appointmentTypeId });
  return apiFetch(slug, `/slots?${params}`);
}

/** `companyFax` is a honeypot — deliberately never a real, labeled field. `formStartedAt` is captured client-side when the page first renders, for a simple bot-speed check. */
export function submitPublicRequest(
  slug: string,
  appointmentTypeId: string,
  startUtc: string,
  contact: PublicContact,
  formStartedAt: string,
): Promise<PublicRequestResult> {
  return apiFetch(slug, "/requests", {
    method: "POST",
    body: JSON.stringify({ appointmentTypeId, startUtc, contact, formStartedAt, companyFax: "" }),
  });
}
