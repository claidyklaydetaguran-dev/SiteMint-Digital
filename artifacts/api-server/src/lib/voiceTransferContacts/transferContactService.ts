// V7: the business's own transfer-contact list — create, edit, deactivate.
//
// This is a settings surface, so the interesting work is validation and
// scoping, not cleverness:
//
//   - firmId always comes from the authenticated session. Every query filters on
//     it, so another business's contact id is indistinguishable from a
//     nonexistent one.
//   - A phone number is normalized to E.164 before it is stored, and refused if
//     it cannot be. The database CHECK is the backstop, not the first line.
//   - contact_role is a ROUTING LABEL and nothing else. "Owner" or a custom
//     "CEO" confers no application permission whatsoever; this module never
//     reads a role to decide what a request may do.
//   - Consent is a recorded assertion by an authenticated account, stamped with
//     that account's email. Nothing dials a destination without it, and it is
//     cleared whenever the number changes — consent was given for a person at a
//     number, not for a row.
//   - Saving never dials. Testing is a separate, explicit action.

import { and, asc, eq, ne } from "drizzle-orm";

export const CONTACT_ROLES = ["owner", "manager", "receptionist", "support", "sales", "other", "custom"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export function isContactRole(value: unknown): value is ContactRole {
  return typeof value === "string" && (CONTACT_ROLES as readonly string[]).includes(value);
}

export type ValidationCode =
  | "label_required"
  | "label_too_long"
  | "phone_required"
  | "phone_invalid"
  | "phone_duplicate"
  | "role_invalid"
  | "role_label_required"
  | "role_label_too_long"
  | "timezone_invalid"
  | "hours_incomplete"
  | "hours_invalid"
  | "hours_need_timezone"
  | "consent_required"
  | "not_found";

export interface FieldError {
  field: string;
  code: ValidationCode;
  message: string;
}

/**
 * Normalizes a dialled number to E.164.
 *
 * Deliberately conservative: it strips formatting and accepts an explicit
 * international form, or a national number WITH an explicitly chosen country
 * calling code. It never guesses a country — a silently-assumed +1 is how a
 * business ends up dialling a stranger.
 */
export function normalizeE164(raw: string, countryCode?: string): { ok: true; e164: string } | { ok: false } {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return { ok: false };

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length === 0) return { ok: false };

  let candidate: string;
  if (hasPlus) {
    candidate = `+${digits}`;
  } else {
    const cc = (countryCode ?? "").trim().replace(/[^0-9]/g, "");
    if (cc.length === 0) return { ok: false };
    // A national number that already repeats its own country code (users paste
    // "1 555…" into a US field) must not become "+11555…".
    candidate = digits.startsWith(cc) && digits.length > cc.length ? `+${digits}` : `+${cc}${digits}`;
  }

  // Same shape the database CHECK enforces: E.164 is 8-15 digits, no leading 0.
  if (!/^\+[1-9][0-9]{6,14}$/.test(candidate)) return { ok: false };
  return { ok: true, e164: candidate };
}

/** Human-readable rendering for the settings list. Never used for dialling. */
export function formatE164ForDisplay(e164: string): string {
  const m = /^\+(\d{1,3})(\d{3})(\d{3})(\d+)$/.exec(e164);
  if (m) return `+${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  return e164;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export interface TransferContactInput {
  label?: unknown;
  phone?: unknown;
  countryCode?: unknown;
  contactRole?: unknown;
  roleLabel?: unknown;
  timezone?: unknown;
  hoursStartMinute?: unknown;
  hoursEndMinute?: unknown;
  useBusinessHours?: unknown;
  businessHoursOnly?: unknown;
  active?: unknown;
  priority?: unknown;
  isDefault?: unknown;
  consentConfirmed?: unknown;
}

export interface NormalizedContact {
  label: string;
  phoneE164: string;
  contactRole: ContactRole;
  roleLabel: string | null;
  timezone: string | null;
  hoursStartMinute: number | null;
  hoursEndMinute: number | null;
  businessHoursOnly: boolean;
  active: boolean;
  priority: number;
  isDefault: boolean;
  consentConfirmed: boolean;
}

function asOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isInteger(n) ? n : Number.NaN;
}

export function validateTransferContact(
  input: TransferContactInput,
): { ok: true; value: NormalizedContact } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];

  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (label.length === 0) {
    errors.push({ field: "label", code: "label_required", message: "Enter the contact's name." });
  } else if (label.length > 80) {
    errors.push({ field: "label", code: "label_too_long", message: "Name must be 80 characters or fewer." });
  }

  const rawPhone = typeof input.phone === "string" ? input.phone : "";
  const countryCode = typeof input.countryCode === "string" ? input.countryCode : undefined;
  let phoneE164 = "";
  if (rawPhone.trim().length === 0) {
    errors.push({ field: "phone", code: "phone_required", message: "Enter a phone number." });
  } else {
    const normalized = normalizeE164(rawPhone, countryCode);
    if (!normalized.ok) {
      errors.push({
        field: "phone",
        code: "phone_invalid",
        message: "Enter a valid phone number, and choose the country it belongs to.",
      });
    } else {
      phoneE164 = normalized.e164;
    }
  }

  const contactRole = input.contactRole === undefined ? "other" : input.contactRole;
  if (!isContactRole(contactRole)) {
    errors.push({ field: "contactRole", code: "role_invalid", message: "Choose a role from the list." });
  }
  let roleLabel: string | null = null;
  if (contactRole === "custom") {
    const custom = typeof input.roleLabel === "string" ? input.roleLabel.trim() : "";
    if (custom.length === 0) {
      errors.push({ field: "roleLabel", code: "role_label_required", message: "Enter the custom job title." });
    } else if (custom.length > 60) {
      errors.push({ field: "roleLabel", code: "role_label_too_long", message: "Title must be 60 characters or fewer." });
    } else {
      roleLabel = custom;
    }
  }

  // Own hours are opt-in. "Use business hours" is the default and means: store
  // no window at all, so there is one source of truth for the common case.
  const useBusinessHours = input.useBusinessHours === undefined ? true : input.useBusinessHours === true;
  let timezone: string | null = null;
  let hoursStartMinute: number | null = null;
  let hoursEndMinute: number | null = null;

  if (!useBusinessHours) {
    const tz = typeof input.timezone === "string" ? input.timezone.trim() : "";
    if (tz.length === 0 || !isValidTimeZone(tz)) {
      errors.push({ field: "timezone", code: "timezone_invalid", message: "Choose a valid timezone." });
    } else {
      timezone = tz;
    }
    const start = asOptionalInt(input.hoursStartMinute);
    const end = asOptionalInt(input.hoursEndMinute);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      errors.push({ field: "hoursStartMinute", code: "hours_invalid", message: "Enter valid start and end times." });
    } else if ((start ?? null) === null || (end ?? null) === null) {
      errors.push({ field: "hoursStartMinute", code: "hours_incomplete", message: "Enter both a start and an end time." });
    } else if (start! < 0 || start! > 1439 || end! < 0 || end! > 1440) {
      errors.push({ field: "hoursStartMinute", code: "hours_invalid", message: "Times must be within a single day." });
    } else {
      hoursStartMinute = start!;
      hoursEndMinute = end!;
    }
    if (timezone === null && hoursStartMinute !== null) {
      errors.push({ field: "timezone", code: "hours_need_timezone", message: "Own hours need a timezone." });
    }
  }

  const rawPriority = asOptionalInt(input.priority);
  const priority =
    rawPriority === undefined || rawPriority === null || Number.isNaN(rawPriority)
      ? 100
      : Math.min(Math.max(rawPriority, 1), 999);

  const value: NormalizedContact = {
    label,
    phoneE164,
    contactRole: isContactRole(contactRole) ? contactRole : "other",
    roleLabel,
    timezone,
    hoursStartMinute,
    hoursEndMinute,
    businessHoursOnly: input.businessHoursOnly === undefined ? true : input.businessHoursOnly === true,
    active: input.active === undefined ? true : input.active === true,
    priority,
    isDefault: input.isDefault === true,
    consentConfirmed: input.consentConfirmed === true,
  };

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

// ── persistence ──────────────────────────────────────────────────────────────

async function wdb() {
  const { db } = await import("@workspace/db");
  const { voiceTransferDestinations } = await import("@workspace/db/schema/voice");
  return { db, table: voiceTransferDestinations };
}

export async function listTransferContacts(firmId: number) {
  const { db, table } = await wdb();
  return db
    .select()
    .from(table)
    .where(eq(table.firmId, firmId))
    .orderBy(asc(table.priority), asc(table.id));
}

/** Clears any other default for this firm, so the partial unique index holds. */
async function demoteOtherDefaults(firmId: number, keepId: number | null): Promise<void> {
  const { db, table } = await wdb();
  const where =
    keepId === null
      ? and(eq(table.firmId, firmId), eq(table.isDefault, true))
      : and(eq(table.firmId, firmId), eq(table.isDefault, true), ne(table.id, keepId));
  await db.update(table).set({ isDefault: false, updatedAt: new Date() }).where(where);
}

export async function createTransferContact(
  firmId: number,
  value: NormalizedContact,
  confirmedBy: string,
): Promise<{ ok: true; id: number } | { ok: false; errors: FieldError[] }> {
  const { db, table } = await wdb();
  const now = new Date();

  const [duplicate] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.firmId, firmId), eq(table.phoneE164, value.phoneE164)))
    .limit(1);
  if (duplicate) {
    return {
      ok: false,
      errors: [{ field: "phone", code: "phone_duplicate", message: "That number is already on your list." }],
    };
  }

  if (value.isDefault) await demoteOtherDefaults(firmId, null);

  const [row] = await db
    .insert(table)
    .values({
      firmId,
      label: value.label,
      phoneE164: value.phoneE164,
      contactRole: value.contactRole,
      roleLabel: value.roleLabel,
      timezone: value.timezone,
      hoursStartMinute: value.hoursStartMinute,
      hoursEndMinute: value.hoursEndMinute,
      businessHoursOnly: value.businessHoursOnly,
      active: value.active,
      priority: value.priority,
      isDefault: value.isDefault,
      consentConfirmedAt: value.consentConfirmed ? now : null,
      consentConfirmedBy: value.consentConfirmed ? confirmedBy : null,
    })
    .returning({ id: table.id });
  return { ok: true, id: row!.id };
}

export async function updateTransferContact(
  firmId: number,
  id: number,
  value: NormalizedContact,
  confirmedBy: string,
): Promise<{ ok: true } | { ok: false; errors: FieldError[] }> {
  const { db, table } = await wdb();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(table)
    .where(and(eq(table.firmId, firmId), eq(table.id, id)))
    .limit(1);
  if (!existing) {
    return { ok: false, errors: [{ field: "id", code: "not_found", message: "That contact no longer exists." }] };
  }

  const [duplicate] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.firmId, firmId), eq(table.phoneE164, value.phoneE164), ne(table.id, id)))
    .limit(1);
  if (duplicate) {
    return {
      ok: false,
      errors: [{ field: "phone", code: "phone_duplicate", message: "That number is already on your list." }],
    };
  }

  if (value.isDefault) await demoteOtherDefaults(firmId, id);

  // Consent was given for a person AT A NUMBER. Change the number and the old
  // assertion no longer covers anything, so it is cleared rather than carried
  // over — the business must confirm again for the new number.
  const numberChanged = existing.phoneE164 !== value.phoneE164;
  const keepConsent = !numberChanged && existing.consentConfirmedAt !== null;
  const consentConfirmedAt = value.consentConfirmed ? (keepConsent ? existing.consentConfirmedAt : now) : null;
  const consentConfirmedBy = consentConfirmedAt === null ? null : keepConsent ? existing.consentConfirmedBy : confirmedBy;

  await db
    .update(table)
    .set({
      label: value.label,
      phoneE164: value.phoneE164,
      contactRole: value.contactRole,
      roleLabel: value.roleLabel,
      timezone: value.timezone,
      hoursStartMinute: value.hoursStartMinute,
      hoursEndMinute: value.hoursEndMinute,
      businessHoursOnly: value.businessHoursOnly,
      active: value.active,
      priority: value.priority,
      isDefault: value.isDefault,
      consentConfirmedAt,
      consentConfirmedBy,
      // A changed number invalidates any previous test result too.
      lastTestAt: numberChanged ? null : existing.lastTestAt,
      lastTestOutcome: numberChanged ? null : existing.lastTestOutcome,
      updatedAt: now,
    })
    .where(and(eq(table.firmId, firmId), eq(table.id, id)));
  return { ok: true };
}

export async function deleteTransferContact(firmId: number, id: number): Promise<boolean> {
  const { db, table } = await wdb();
  const deleted = await db
    .delete(table)
    .where(and(eq(table.firmId, firmId), eq(table.id, id)))
    .returning({ id: table.id });
  return deleted.length > 0;
}

export async function getTransferContact(firmId: number, id: number) {
  const { db, table } = await wdb();
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.firmId, firmId), eq(table.id, id)))
    .limit(1);
  return row;
}
