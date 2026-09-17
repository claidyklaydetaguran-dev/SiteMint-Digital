// Adding and editing contacts by hand.
//
// A contact someone adds is stored with origin 'manual' and keeps it forever;
// a contact a caller created stays 'call' however much it is edited. The
// phone number is the contact's identity (it is how calls are matched to it),
// so it can be set when adding but never changed by an edit — changing it
// would silently re-point every past and future call.
//
// Every write is scoped to the signed-in business: an id from another
// business matches nothing and reads as not found.

import { normalizePhoneE164 } from "./contactLinker.js";

export const CONTACT_NAME_MAX = 120;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_NOTES_MAX = 2000;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactFields {
  name?: string | null;
  email?: string | null;
  notes?: string | null;
}

export type FieldError = { field: "phone" | "name" | "email" | "notes"; message: string };

function optionalText(
  value: unknown,
  field: "name" | "email" | "notes",
  max: number,
): { ok: true; value: string | null | undefined } | { ok: false; error: FieldError } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: { field, message: "Enter text." } };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, error: { field, message: `Keep this under ${max} characters.` } };
  if (field === "email" && (!EMAIL_SHAPE.test(trimmed) || trimmed.length < 3)) {
    return { ok: false, error: { field, message: "Enter a valid email address." } };
  }
  return { ok: true, value: field === "email" ? trimmed.toLowerCase() : trimmed };
}

export function validateContactFields(body: Record<string, unknown>): { ok: true; fields: ContactFields } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const fields: ContactFields = {};
  const name = optionalText(body.name, "name", CONTACT_NAME_MAX);
  const email = optionalText(body.email, "email", CONTACT_EMAIL_MAX);
  const notes = optionalText(body.notes, "notes", CONTACT_NOTES_MAX);
  for (const [key, result] of [["name", name], ["email", email], ["notes", notes]] as const) {
    if (!result.ok) errors.push(result.error);
    else if (result.value !== undefined) fields[key] = result.value;
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, fields };
}

export interface ContactWriteDeps {
  insertManual: (row: { firmId: number; phoneE164: string } & ContactFields) => Promise<{ id: number } | undefined>;
  update: (firmId: number, contactId: number, fields: ContactFields) => Promise<{ id: number } | undefined>;
  now?: () => Date;
}

async function productionDeps(): Promise<ContactWriteDeps> {
  const { db } = await import("@workspace/db");
  const { voiceContacts } = await import("@workspace/db/schema/voice");
  const { and, eq } = await import("drizzle-orm");
  return {
    insertManual: async (row) => {
      const now = new Date();
      const [inserted] = await db
        .insert(voiceContacts)
        .values({
          firmId: row.firmId,
          phoneE164: row.phoneE164,
          displayName: row.name ?? null,
          email: row.email ?? null,
          notes: row.notes ?? null,
          origin: "manual",
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: voiceContacts.id });
      return inserted;
    },
    update: async (firmId, contactId, fields) => {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.name !== undefined) set.displayName = fields.name;
      if (fields.email !== undefined) set.email = fields.email;
      if (fields.notes !== undefined) set.notes = fields.notes;
      const [row] = await db
        .update(voiceContacts)
        .set(set)
        .where(and(eq(voiceContacts.firmId, firmId), eq(voiceContacts.id, contactId)))
        .returning({ id: voiceContacts.id });
      return row;
    },
  };
}

export type CreateContactResult =
  | { ok: true; id: number }
  | { ok: false; reason: "invalid"; errors: FieldError[] }
  | { ok: false; reason: "exists" };

export async function createManualContact(
  firmId: number,
  body: Record<string, unknown>,
  deps?: ContactWriteDeps,
): Promise<CreateContactResult> {
  const errors: FieldError[] = [];
  const phone = normalizePhoneE164(typeof body.phone === "string" ? body.phone : undefined);
  if (!phone) errors.push({ field: "phone", message: "Enter a phone number with its country code, for example +1 555 123 4567." });
  const validated = validateContactFields(body);
  if (!validated.ok) errors.push(...validated.errors);
  if (errors.length > 0 || !phone || !validated.ok) return { ok: false, reason: "invalid", errors };
  const d = deps ?? (await productionDeps());
  const inserted = await d.insertManual({ firmId, phoneE164: phone.e164, ...validated.fields });
  if (!inserted) return { ok: false, reason: "exists" };
  return { ok: true, id: inserted.id };
}

export type UpdateContactResult =
  | { ok: true; id: number }
  | { ok: false; reason: "invalid"; errors: FieldError[] }
  | { ok: false; reason: "not_found" };

export async function updateContact(
  firmId: number,
  contactId: number,
  body: Record<string, unknown>,
  deps?: ContactWriteDeps,
): Promise<UpdateContactResult> {
  if ("phone" in body) {
    return { ok: false, reason: "invalid", errors: [{ field: "phone", message: "A contact's phone number can't be changed. Add a new contact instead." }] };
  }
  const validated = validateContactFields(body);
  if (!validated.ok) return { ok: false, reason: "invalid", errors: validated.errors };
  if (Object.keys(validated.fields).length === 0) {
    return { ok: false, reason: "invalid", errors: [{ field: "name", message: "Nothing to change." }] };
  }
  const d = deps ?? (await productionDeps());
  const updated = await d.update(firmId, contactId, validated.fields);
  return updated ? { ok: true, id: updated.id } : { ok: false, reason: "not_found" };
}
