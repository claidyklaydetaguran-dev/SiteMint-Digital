// ── Which CRM record an email belongs to ────────────────────────────────────
//
// Every CRM email carries one provider tag, `crm_ref=<kind>-<id>`, and the
// provider echoes it back on every event about that message.
//
// Why a tag rather than the provider's message id alone. The id is only
// learned when a send SUCCEEDS. The sends that matter most are the ones that
// did not: a timeout or a 5xx leaves an `uncertain` record with no id at all,
// and `docs/crm-ops/DELIVERY-GUARANTEE.md` is explicit that such a record is
// never retried by a machine and waits for a person. A `delivered` event is
// exactly the evidence that closes it — but without the tag there is nothing
// to match it to, so the evidence would arrive and be discarded.
//
// Matching still prefers the provider id where one exists. The tag is the
// second path, not a replacement.

/** Every record type that can be the subject of an outbound CRM email. */
export const EMAIL_RECORD_KINDS = [
  /** `crm_messages` — a one-off email to a contact, on a conversation. */
  "message",
  /** `crm_marketing_recipients` — one contact's copy of an M4 campaign. */
  "marketing_recipient",
  /** `crm_support_messages` — a reply on a support ticket. */
  "support_message",
  /** `crm_reminder_deliveries` — one recipient's copy of one reminder occurrence. */
  "reminder_delivery",
  /** `crm_appointment_attendees` — one attendee's calendar invitation. */
  "appointment_attendee",
  /** `crm_staff_tokens` — a staff invitation or password reset. */
  "staff_token",
  /** `crm_portal_invitations` — a customer portal invitation. */
  "portal_invitation",
  /** `crm_campaign_recipients` — the legacy broadcast ledger. */
  "campaign_recipient",
  /** `crm_campaign_scheduled_messages` — the legacy sequence queue. */
  "sequence_message",
] as const;

export type EmailRecordKind = (typeof EMAIL_RECORD_KINDS)[number];

/** The tag name. Resend allows ASCII letters, numbers, underscores and dashes. */
export const EMAIL_REF_TAG_NAME = "crm_ref";

/** Resend's own limit on a tag value. */
const MAX_TAG_VALUE = 256;

export interface EmailRef {
  kind: EmailRecordKind;
  id: number;
  /**
   * Extra identity a record's own columns cannot carry across revisions.
   *
   * A calendar attendee row holds only its LATEST invitation's outcome, so an
   * event about an older revision must not be read as evidence about the
   * current one: the ref carries the method and sequence, and the processor
   * compares them before it changes anything.
   */
  qualifiers: string[];
}

/** Anything a tag value may not contain becomes a dash. */
function sanitise(part: string): string {
  return part.replace(/[^A-Za-z0-9_]/g, "-");
}

/** `emailRef("support_message", 12)` → `"support_message-12"`. */
export function emailRef(kind: EmailRecordKind, id: number, ...qualifiers: Array<string | number>): string {
  const parts = [kind, String(Math.trunc(id)), ...qualifiers.map((q) => sanitise(String(q)))];
  return parts.join("-").slice(0, MAX_TAG_VALUE);
}

/** The inverse. Returns null for anything this system did not write. */
export function parseEmailRef(raw: unknown): EmailRef | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_TAG_VALUE) return null;
  const parts = raw.split("-");
  const kind = parts[0] as EmailRecordKind;
  if (!(EMAIL_RECORD_KINDS as readonly string[]).includes(kind)) return null;
  const id = Number(parts[1]);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { kind, id, qualifiers: parts.slice(2) };
}

/** The tag list to hand the provider for one record. */
export function emailRefTags(ref: string): Array<{ name: string; value: string }> {
  return [{ name: EMAIL_REF_TAG_NAME, value: ref.slice(0, MAX_TAG_VALUE) }];
}

/**
 * The `crm_ref` an event carries, from the provider's echoed tags.
 *
 * Resend documents tags as an object (`"tags": { "category": "confirm_email" }`)
 * and accepts them on send as `[{ name, value }]`. Both shapes are read here
 * because the payload shape is the provider's to change, and a reader that
 * understands only one of them fails silently — the events still arrive, they
 * simply stop matching anything.
 */
export function refFromTags(tags: unknown): string | null {
  if (!tags) return null;
  if (Array.isArray(tags)) {
    for (const entry of tags) {
      if (entry && typeof entry === "object") {
        const name = (entry as { name?: unknown }).name;
        const value = (entry as { value?: unknown }).value;
        if (name === EMAIL_REF_TAG_NAME && typeof value === "string") return value;
      }
    }
    return null;
  }
  if (typeof tags === "object") {
    const value = (tags as Record<string, unknown>)[EMAIL_REF_TAG_NAME];
    return typeof value === "string" ? value : null;
  }
  return null;
}
