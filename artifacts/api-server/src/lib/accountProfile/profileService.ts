// The business profile a customer edits in Settings: what this business is
// called, what trade it is in, and which timezone its day runs on.
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
//   name, industry → intake_firms (columns that already exist; no migration)
//   timezone       → scheduling_availability_settings.timezone, which is
//                    already the one place a business day's timezone lives.
//                    Two editors (Settings and Availability) of ONE value —
//                    never a second copy that can disagree with the first.
//
// primaryContact and defaultLocation have nowhere to be stored and are not
// accepted here. A field that silently discards what the customer typed is
// worse than a field that isn't offered, so the form no longer offers them.

import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms } from "@workspace/db/schema";

import { getSerializedAvailabilitySettings, setBusinessTimezone } from "../scheduling/schedulingRepository.js";

export const MAX_NAME = 120;
export const MAX_INDUSTRY = 80;

export type ProfileValidationCode = "name_empty" | "name_too_long" | "industry_too_long" | "timezone_unknown" | "no_fields";

export interface ProfileValidationError {
  ok: false;
  code: ProfileValidationCode;
  message: string;
}

export interface BusinessProfile {
  name: string;
  industry: string;
  timezone: string;
}

export interface ProfilePatch {
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
 * Validates the patch and returns exactly the fields that were present.
 * Absent means "leave alone"; it never means "clear".
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

  if (Object.keys(patch).length === 0) {
    return { ok: false, code: "no_fields", message: "Nothing was changed." };
  }
  return { ok: true, patch };
}

export interface ProfileDeps {
  updateFirm: (firmId: number, values: { name?: string; industry?: string | null }) => Promise<void>;
  setTimezone: (firmId: number, timezone: string) => Promise<void>;
}

export const productionProfileDeps: ProfileDeps = {
  async updateFirm(firmId, values) {
    await db.update(intakeFirms).set(values).where(eq(intakeFirms.id, firmId));
  },
  setTimezone: setBusinessTimezone,
};

/**
 * Applies a validated patch. The firm row and the scheduling timezone are two
 * separate writes because they live in two tables; the firm row goes first, so
 * a timezone failure can never leave a business renamed to nothing.
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

  if (Object.keys(firmValues).length > 0) await deps.updateFirm(firmId, firmValues);
  if (patch.timezone !== undefined) await deps.setTimezone(firmId, patch.timezone);
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
  const settings = await getSerializedAvailabilitySettings(firmId);
  return {
    name: row?.name ?? "",
    industry: row?.industry ?? "",
    timezone: settings.timezone,
  };
}
