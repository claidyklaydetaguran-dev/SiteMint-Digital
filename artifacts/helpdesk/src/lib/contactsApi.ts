/**
 * V5 PR-8 — client for the contacts read endpoints
 * (`GET /receptionist/contacts`, `GET /receptionist/contacts/:id`).
 * Same-origin, cookie-authenticated, firm-scoped by the session — the
 * browser never sends a firm id. Implemented by the backend owner in
 * parallel; this module builds against the documented response shape.
 */

const API_BASE = "/api";

export type ContactSource = "voice" | "sms" | "manual";

export interface ContactSummary {
  id: string;
  name: string | null;
  phone: string;
  source: ContactSource;
  lastInteractionAt: string | null;
  disposition: string | null;
  nextAppointmentAt: string | null;
  optedOut: boolean;
  callCount: number;
  conversationCount: number;
  /** J4: texts from this contact nobody has opened yet. Optional for older backends. */
  unreadTexts?: number;
  /** Optional so a dashboard deployed ahead of its backend still renders. */
  email?: string | null;
  /** Detail only. */
  notes?: string | null;
}

export interface ContactCallRef {
  callId: string;
  startedAt: string;
  state: string;
}

export interface ContactConversationRef {
  id: string;
  lastMessageAt: string;
  status: string;
}

/** One saved message, reached through this contact's calls by foreign key. */
export interface ContactInquiryRef {
  id: number;
  callId: string;
  topic: string;
  urgency: string;
  followUpStatus: string;
  createdAt: string;
}

export interface ContactDetailResponse {
  contact: ContactSummary;
  calls: ContactCallRef[];
  conversations: ContactConversationRef[];
  /** Optional so a dashboard deployed ahead of its backend still renders. */
  inquiries?: ContactInquiryRef[];
  /**
   * The most recent name a caller gave on one of this contact's own calls,
   * used only when the contact record has no name of its own. A quoted value
   * from a saved message, never an inference.
   */
  callerNameFromInquiry?: string | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export function fetchContacts(query: string): Promise<{ items: ContactSummary[]; count: number }> {
  const params = new URLSearchParams();
  if (query.trim() !== "") params.set("query", query.trim());
  const qs = params.toString();
  return apiFetch(`/receptionist/contacts${qs ? `?${qs}` : ""}`);
}

/**
 * The contact linked to one call, resolved server-side through the call-link
 * foreign key — never by matching a name or a number. Resolves to `undefined`
 * when no contact is linked, which is an ordinary answer, not a failure.
 */
export function fetchContactForCall(callId: string): Promise<ContactSummary | undefined> {
  return apiFetch<{ items: ContactSummary[]; count: number }>(
    `/receptionist/contacts?callId=${encodeURIComponent(callId)}`,
  ).then((res) => res.items[0]);
}

export interface ContactFieldError {
  field: "phone" | "name" | "email" | "notes";
  message: string;
}

export type ContactWriteResult =
  | { ok: true; detail: ContactDetailResponse }
  | { ok: false; message: string; errors: ContactFieldError[] };

async function writeContact(path: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<ContactWriteResult> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errors = Array.isArray(data.errors) ? (data.errors as ContactFieldError[]) : [];
      const message = typeof data.error === "string" && data.error.trim() !== "" ? data.error : "The contact wasn't saved. Try again.";
      return { ok: false, message, errors };
    }
    return { ok: true, detail: data as unknown as ContactDetailResponse };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Nothing was saved.", errors: [] };
  }
}

/** Adds a contact by hand. The server records it as added manually. */
export function createContact(fields: { phone: string; name: string; email: string; notes: string }): Promise<ContactWriteResult> {
  return writeContact("/receptionist/contacts", "POST", fields);
}

/** Edits name, email and notes. The phone number is the contact's identity and never changes. */
export function updateContact(id: string, fields: { name: string; email: string; notes: string }): Promise<ContactWriteResult> {
  return writeContact(`/receptionist/contacts/${encodeURIComponent(id)}`, "PATCH", fields);
}

export function fetchContactDetail(id: string): Promise<ContactDetailResponse | undefined> {
  return apiFetch<ContactDetailResponse>(`/receptionist/contacts/${encodeURIComponent(id)}`).catch((err: unknown) => {
    if (err instanceof Error && (err as Error & { status?: number }).status === 404) return undefined;
    throw err;
  });
}

/** J4: one text in the thread between the business's voice number and a contact. */
export interface ContactText {
  direction: "in" | "out";
  body: string;
  at: string;
  /** Outbound: queued | sending | sent | failed | blocked_no_consent. Inbound: received. */
  status: string;
  deliveryStatus: string | null;
  errorCode: string | null;
  keyword: "stop" | "start" | "help" | "other" | null;
  unread: boolean;
}

export function fetchContactTexts(id: string): Promise<{ items: ContactText[]; count: number; unread: number }> {
  return apiFetch(`/receptionist/contacts/${encodeURIComponent(id)}/texts`);
}

export async function markContactTextsRead(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/receptionist/contacts/${encodeURIComponent(id)}/texts/read`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
}
