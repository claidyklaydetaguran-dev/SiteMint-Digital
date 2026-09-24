// The business profile a customer edits in Settings: what this business is
// called, what trade it is in, which timezone its day runs on, who to contact,
// and where it is.
//
// Why this exists as its own service rather than more fields on the agent-config
// route: that route is the SMS receptionist's *agent* configuration (greeting,
// description, qualifying questions) and is a protected file. Settings sent it
// `name`, `industry`, `timezone`, `primaryContact` and `defaultLocation`; it
// accepts none of them, ignored all five, and answered `400 No fields to
// update`. The Business profile form could therefore never save, and because
// Setup step 1 is complete only when name AND industry are both set, the whole
// setup journey was stuck on its first step.
//
// Storage, deliberately:
//   name, industry     → intake_firms (columns that already exist)
//   timezone           → scheduling_availability_settings.timezone, which is
//                        already the one place a business day's timezone lives.
//                        Two editors (Settings and Availability) of ONE value —
//                        never a second copy that can disagree with the first.
//   primary contact,   → voice_business_profiles (voice migration 0011). The
//   default location     frozen intake_firms row has no columns for them, and
//                        adding any would mean a push against a protected
//                        table; a firm-scoped side table does not.

import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms } from "@workspace/db/schema";
import {
  voiceBusinessProfiles,
  PROFILE_CONTACT_EMAIL_MAX,
  PROFILE_CONTACT_NAME_MAX,
  PROFILE_LOCATION_MAX,
} from "@workspace/db/schema/voice";

import { getSerializedAvailabilitySettings, setBusinessTimezone } from "../scheduling/schedulingRepository.js";

export const MAX_NAME = 120;
export const MAX_INDUSTRY = 80;
export { PROFILE_CONTACT_EMAIL_MAX, PROFILE_CONTACT_NAME_MAX, PROFILE_LOCATION_MAX };

export type ProfileValidationCode =
  | "name_empty"
  | "name_too_long"
  | "industry_too_long"
  | "timezone_unknown"
  | "contact_name_too_long"
  | "contact_email_invalid"
  | "location_too_long"
  | "no_fields";

export interface ProfileValidationError {
  ok: false;
  code: ProfileValidationCode;
  message: string;
}

export interface BusinessProfile {
  name: string;
  industry: string;
  timezone: string;
  primaryContact: { name: string; email: string };
  defaultLocation: string;
}

/** A field set to `null` is being cleared; an absent field is left alone. */
export interface ProfileDetailsPatch {
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  defaultLocation?: string | null;
}

export interface ProfilePatch extends ProfileDetailsPatch {
  name?: string;
  industry?: string;
  timezone?: string;
}

/**
 * Is this a timezone this runtime actually knows? Asking Intl is the only
 * honest check — a hardcoded list goes stale, and storing a name the server
 * cannot resolve turns every later slot calculation into a crash.
 */
export function isKnownTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Deliberately modest. It catches what a person actually mistypes — no "@",
 * nothing either side of it, a space, no dot in the domain — without refusing
 * a real address because it is unusual. Deliverability is not provable here.
 */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Trimmed text, with an emptied field meaning "clear it". */
function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Validates the patch and returns exactly the fields that were present.
 * Absent means "leave alone"; it never means "clear".
 *
 * Settings sends the primary contact nested (`primaryContact: { name, email }`)
 * because that is how the form groups it; each part is still optional on its
 * own, so a business can record a name without an email.
 */
export function validateProfilePatch(
  body: unknown,
): { ok: true; patch: ProfilePatch } | ProfileValidationError {
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: ProfilePatch = {};

  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name === "") {
      return { ok: false, code: "name_empty", message: "Enter the name of your business." };
    }
    if (name.length > MAX_NAME) {
      return { ok: false, code: "name_too_long", message: `Business name must be ${MAX_NAME} characters or fewer.` };
    }
    patch.name = name;
  }

  if (input.industry !== undefined) {
    const industry = typeof input.industry === "string" ? input.industry.trim() : "";
    if (industry.length > MAX_INDUSTRY) {
      return {
        ok: false,
        code: "industry_too_long",
        message: `Business type must be ${MAX_INDUSTRY} characters or fewer.`,
      };
    }
    patch.industry = industry;
  }

  if (input.timezone !== undefined) {
    const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";
    if (!isKnownTimezone(timezone)) {
      return {
        ok: false,
        code: "timezone_unknown",
        message: "That timezone isn't one we recognise. Pick one from the list.",
      };
    }
    patch.timezone = timezone;
  }

  const contact = input.primaryContact;
  if (contact !== undefined && contact !== null && typeof contact === "object") {
    const parts = contact as Record<string, unknown>;
    if (parts.name !== undefined) {
      const contactName = optionalText(parts.name);
      if (contactName !== null && contactName.length > PROFILE_CONTACT_NAME_MAX) {
        return {
          ok: false,
          code: "contact_name_too_long",
          message: `Contact name must be ${PROFILE_CONTACT_NAME_MAX} characters or fewer.`,
        };
      }
      patch.primaryContactName = contactName;
    }
    if (parts.email !== undefined) {
      const contactEmail = optionalText(parts.email);
      if (
        contactEmail !== null &&
        (contactEmail.length > PROFILE_CONTACT_EMAIL_MAX || !isPlausibleEmail(contactEmail))
      ) {
        return {
          ok: false,
          code: "contact_email_invalid",
          message: "Enter a contact email like name@example.com, or leave it blank.",
        };
      }
      patch.primaryContactEmail = contactEmail === null ? null : contactEmail.toLowerCase();
    }
  }

  if (input.defaultLocation !== undefined) {
    const location = optionalText(input.defaultLocation);
    if (location !== null && location.length > PROFILE_LOCATION_MAX) {
      return {
        ok: false,
        code: "location_too_long",
        message: `Business location must be ${PROFILE_LOCATION_MAX} characters or fewer.`,
      };
    }
    patch.defaultLocation = location;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, code: "no_fields", message: "Nothing was changed." };
  }
  return { ok: true, patch };
}

export interface ProfileDeps {
  updateFirm: (firmId: number, values: { name?: string; industry?: string | null }) => Promise<void>;
  setTimezone: (firmId: number, timezone: string) => Promise<void>;
  /** Writes only the detail fields present; creates the row on first save. */
  upsertDetails: (firmId: number, values: ProfileDetailsPatch) => Promise<void>;
}

export const productionProfileDeps: ProfileDeps = {
  async updateFirm(firmId, values) {
    await db.update(intakeFirms).set(values).where(eq(intakeFirms.id, firmId));
  },
  setTimezone: setBusinessTimezone,
  async upsertDetails(firmId, values) {
    const now = new Date();
    await db
      .insert(voiceBusinessProfiles)
      .values({ firmId, ...values, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: voiceBusinessProfiles.firmId,
        set: { ...values, updatedAt: now },
      });
  },
};

/**
 * Applies a validated patch. The firm row, the scheduling timezone and the
 * profile details are separate writes because they live in separate tables;
 * the firm row goes first, so a later failure can never leave a business
 * renamed to nothing.
 */
export async function applyProfilePatch(
  firmId: number,
  patch: ProfilePatch,
  deps: ProfileDeps = productionProfileDeps,
): Promise<void> {
  const firmValues: { name?: string; industry?: string | null } = {};
  if (patch.name !== undefined) firmValues.name = patch.name;
  // An industry the customer cleared is stored as NULL, not "": every readiness
  // check asks whether industry is set, and an empty string would read as set.
  if (patch.industry !== undefined) firmValues.industry = patch.industry === "" ? null : patch.industry;

  const details: ProfileDetailsPatch = {};
  if (patch.primaryContactName !== undefined) details.primaryContactName = patch.primaryContactName;
  if (patch.primaryContactEmail !== undefined) details.primaryContactEmail = patch.primaryContactEmail;
  if (patch.defaultLocation !== undefined) details.defaultLocation = patch.defaultLocation;

  if (Object.keys(firmValues).length > 0) await deps.updateFirm(firmId, firmValues);
  if (patch.timezone !== undefined) await deps.setTimezone(firmId, patch.timezone);
  if (Object.keys(details).length > 0) await deps.upsertDetails(firmId, details);
}

/**
 * The profile as stored. The timezone comes from the scheduling settings row
 * rather than a second copy on the firm — the form previously received no
 * timezone at all and fell back to whichever option happened to be first in
 * the list, which showed every business a timezone it had never chosen.
 */
export async function readBusinessProfile(firmId: number): Promise<BusinessProfile> {
  const [row] = await db
    .select({ name: intakeFirms.name, industry: intakeFirms.industry })
    .from(intakeFirms)
    .where(eq(intakeFirms.id, firmId))
    .limit(1);
  const [details] = await db
    .select({
      primaryContactName: voiceBusinessProfiles.primaryContactName,
      primaryContactEmail: voiceBusinessProfiles.primaryContactEmail,
      defaultLocation: voiceBusinessProfiles.defaultLocation,
    })
    .from(voiceBusinessProfiles)
    .where(eq(voiceBusinessProfiles.firmId, firmId))
    .limit(1);
  const settings = await getSerializedAvailabilitySettings(firmId);
  return {
    name: row?.name ?? "",
    industry: row?.industry ?? "",
    timezone: settings.timezone,
    primaryContact: {
      name: details?.primaryContactName ?? "",
      email: details?.primaryContactEmail ?? "",
    },
    defaultLocation: details?.defaultLocation ?? "",
  };
}
