/**
 * V5 PR-8 — client for the phone-number management endpoints
 * (`GET /receptionist/voice/numbers`, `.../:id/pause`, `.../:id/unpause`).
 * Same-origin, cookie-authenticated, firm-scoped. Built against the
 * documented contract: `{ items: [{ id, phoneNumberDisplay, state,
 * assistantId, assignedAt }], count }`.
 *
 * Assignment (`POST .../:id/assign`) is documented on the same router but is
 * not exercised by this screen — Phone Number, per the approved scope, shows
 * the number SiteMint already assigned during onboarding and offers only
 * pause/unpause. The endpoint is typed here for completeness and future use.
 */

const API_BASE = "/api";

export type PhoneNumberState = "inventory" | "assigned" | "paused" | "released";

export interface PhoneNumberSummary {
  id: number;
  phoneNumberDisplay: string;
  state: PhoneNumberState;
  assistantId: number | null;
  assignedAt: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.trim()) message = body.error.slice(0, 300);
    } catch {
      // no JSON body
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json() as Promise<T>;
}

/** Raw row as the committed route's numberDto actually serialises it. */
interface NumberDtoWire {
  id: number;
  phoneE164?: string | null;
  phoneNumberDisplay?: string | null;
  state: PhoneNumberState;
  assignedAssistantId?: number | null;
  assistantId?: number | null;
  assignedAt?: string | null;
}

/** Human-friendly rendering of an E.164 number: +14155550190 → +1 (415) 555-0190. */
function formatE164(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function normalizeNumber(row: NumberDtoWire): PhoneNumberSummary {
  const raw = row.phoneNumberDisplay ?? row.phoneE164 ?? "";
  return {
    id: row.id,
    phoneNumberDisplay: row.phoneNumberDisplay ?? (raw ? formatE164(raw) : "Unknown number"),
    state: row.state,
    assistantId: row.assistantId ?? row.assignedAssistantId ?? null,
    assignedAt: row.assignedAt ?? null,
  };
}

export async function fetchNumbers(): Promise<{ items: PhoneNumberSummary[]; count: number }> {
  const res = await apiFetch<{ items: NumberDtoWire[]; count: number }>("/receptionist/voice/numbers");
  return { items: res.items.map(normalizeNumber), count: res.count };
}

async function mutateNumber(path: string, body?: unknown): Promise<{ number: PhoneNumberSummary }> {
  const res = await apiFetch<{ number: NumberDtoWire }>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { number: normalizeNumber(res.number) };
}

export function assignNumber(id: number, assistantId: number): Promise<{ number: PhoneNumberSummary }> {
  return mutateNumber(`/receptionist/voice/numbers/${id}/assign`, { assistantId });
}

export function pauseNumber(id: number): Promise<{ number: PhoneNumberSummary }> {
  return mutateNumber(`/receptionist/voice/numbers/${id}/pause`);
}

export function unpauseNumber(id: number): Promise<{ number: PhoneNumberSummary }> {
  return mutateNumber(`/receptionist/voice/numbers/${id}/unpause`);
}
