/**
 * V7: client for the messages an assistant took ("inquiries"), their follow-up
 * workflow, and the honest delivery status of the emails that announced them.
 *
 * Same-origin, cookie-authenticated requests only — never a client-controlled
 * firmId. Error responses are reduced to a status code; response bodies are
 * never surfaced or logged.
 */

const API_BASE = "/api";

export const FOLLOW_UP_STATUSES = ["new", "in_progress", "resolved"] as const;
export type InquiryStatus = (typeof FOLLOW_UP_STATUSES)[number];

// Reader-facing labels for these values live in the page contracts
// (pages/inquiries, pages/transfer-contacts) — the copy layer. This module
// carries only the wire vocabulary, so there is exactly one place to change a
// word and one place to change a protocol value.

export interface Inquiry {
  id: number;
  callId: string;
  callerName: string;
  topic: string;
  details: string;
  callbackPhone: string | null;
  callbackEmail: string | null;
  urgency: "normal" | "urgent";
  emailAckRequested: boolean;
  followUpStatus: InquiryStatus;
  statusChangedAt: string | null;
  createdAt: string;
}

export interface InquiryList {
  items: Inquiry[];
  count: number;
  counts: Record<InquiryStatus, number>;
}

/**
 * Delivery state, in the provider's terms rather than in reassuring ones.
 *
 * `accepted` means the email provider accepted the message. It is NOT a claim
 * that it reached an inbox — nothing in this product can observe that, so no
 * label here says "delivered".
 */
export const NOTIFICATION_STATES = ["queued", "sending", "accepted", "failed", "abandoned"] as const;
export type NotificationState = (typeof NOTIFICATION_STATES)[number];

export interface NotificationRecord {
  id: number;
  kind: string;
  callId: string | null;
  recipient: string;
  subject: string;
  state: NotificationState;
  attempts: number;
  lastErrorCode: string | null;
  acceptedAt: string | null;
  nextAttemptAt: string;
  createdAt: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function fetchInquiries(status?: InquiryStatus): Promise<InquiryList> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<InquiryList>(`/receptionist/voice/messages${query}`);
}

export function updateInquiryStatus(id: number, followUpStatus: InquiryStatus): Promise<{ message: Inquiry }> {
  return apiFetch<{ message: Inquiry }>(`/receptionist/voice/messages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ followUpStatus }),
  });
}

export function fetchNotifications(): Promise<{ items: NotificationRecord[]; count: number }> {
  return apiFetch<{ items: NotificationRecord[]; count: number }>("/receptionist/voice/notifications");
}

// ── transfer contacts ────────────────────────────────────────────────────────

export const CONTACT_ROLES = ["owner", "manager", "receptionist", "support", "sales", "other", "custom"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export interface TransferContact {
  id: number;
  label: string;
  phoneE164: string;
  phoneDisplay: string;
  contactRole: ContactRole;
  roleLabel: string | null;
  useBusinessHours: boolean;
  timezone: string | null;
  hoursStartMinute: number | null;
  hoursEndMinute: number | null;
  businessHoursOnly: boolean;
  active: boolean;
  priority: number;
  isDefault: boolean;
  consentConfirmed: boolean;
  consentConfirmedAt: string | null;
  consentConfirmedBy: string | null;
  lastTestAt: string | null;
  lastTestOutcome: string | null;
}

export interface TransferCapability {
  telephoneTransferAvailable: boolean;
  browserTransferAvailable: boolean;
  explanation: string;
}

export interface TransferContactList {
  items: TransferContact[];
  count: number;
  roles: readonly ContactRole[];
  capability: TransferCapability;
}

export interface TransferContactFieldError {
  field: string;
  code: string;
  message: string;
}

export interface TransferContactDraft {
  label: string;
  phone: string;
  countryCode: string;
  contactRole: ContactRole;
  roleLabel?: string;
  useBusinessHours: boolean;
  timezone?: string;
  hoursStartMinute?: number;
  hoursEndMinute?: number;
  businessHoursOnly: boolean;
  active: boolean;
  priority: number;
  isDefault: boolean;
  consentConfirmed: boolean;
}

export interface TransferTestCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface TransferTestReport {
  contact: TransferContact;
  /** Always false today. A settings check never places a call. */
  dialed: boolean;
  mode: "preflight_only" | "preflight_then_live_available";
  checks: TransferTestCheck[];
  readyToAttempt: boolean;
  limitation: string;
}

export class TransferContactValidationError extends Error {
  readonly errors: TransferContactFieldError[];
  constructor(errors: TransferContactFieldError[]) {
    super("validation_failed");
    this.name = "TransferContactValidationError";
    this.errors = errors;
  }
}

async function writeContact<T>(path: string, method: "POST" | "PATCH", draft: TransferContactDraft): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (res.status === 400 || res.status === 404) {
    // Field-level errors are the point of this form, so they are surfaced as a
    // typed error rather than collapsed into a generic failure.
    const body = (await res.json().catch(() => ({}))) as { errors?: TransferContactFieldError[] };
    throw new TransferContactValidationError(
      Array.isArray(body.errors) && body.errors.length > 0
        ? body.errors
        : [{ field: "form", code: "unknown", message: "That could not be saved. Please check the details." }],
    );
  }
  if (!res.ok) throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  return (await res.json()) as T;
}

export function fetchTransferContacts(): Promise<TransferContactList> {
  return apiFetch<TransferContactList>("/receptionist/voice/transfer-contacts");
}

export function createTransferContact(draft: TransferContactDraft): Promise<{ contact: TransferContact | null }> {
  return writeContact<{ contact: TransferContact | null }>("/receptionist/voice/transfer-contacts", "POST", draft);
}

export function updateTransferContact(
  id: number,
  draft: TransferContactDraft,
): Promise<{ contact: TransferContact | null }> {
  return writeContact<{ contact: TransferContact | null }>(
    `/receptionist/voice/transfer-contacts/${id}`,
    "PATCH",
    draft,
  );
}

export function deleteTransferContact(id: number): Promise<void> {
  return apiFetch<void>(`/receptionist/voice/transfer-contacts/${id}`, { method: "DELETE" });
}

export function runTransferContactCheck(id: number): Promise<TransferTestReport> {
  return apiFetch<TransferTestReport>(`/receptionist/voice/transfer-contacts/${id}/test`, { method: "POST" });
}
