// Checkpoint B: authenticated, firm-scoped scheduling endpoints backing both
// the Availability Settings admin UI and the visual booking-preview
// calendar. Backed by durable, firm-scoped database records
// (lib/scheduling/schedulingRepository.ts) — Checkpoint A's in-memory store
// has been fully replaced. No appointment here can become "booked" until a
// real calendar-provider write integration exists (Checkpoint C).

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  getDayAvailability,
  createHold,
  submitAppointmentRequest,
  listAppointmentRequests,
  cancelAppointmentRequestByPublicId,
  saveAvailabilitySettings,
  getSerializedAvailabilitySettings,
  setPublicSlug,
  newPublicSlug,
  type AppointmentTypeInput,
  type AvailabilitySettingsInput,
  type DateExceptionInput,
} from "../lib/scheduling/schedulingRepository.js";
import type { DayHours } from "../lib/scheduling/availabilityEngine.js";
import { parseDateKey } from "../lib/scheduling/zonedTime.js";
import { getFreeBusyProvider } from "../lib/calendar/index.js";
import { removeCalendarEventForRequest } from "../lib/calendar/calendarEventSync.js";
import { calendarSyncDeps } from "../lib/calendar/calendarSyncDeps.js";
import type { SchedulingAppointmentRequest } from "@workspace/db/schema/scheduling";

/**
 * Admin-facing serialization: the internal serial `id` is never included —
 * `publicId` (renamed `id` here for frontend-contract continuity with
 * Checkpoint A) is the only identifier this or any other response exposes.
 * Full contact details are included because this endpoint is
 * `requireReceptionistAuth`-gated to the owning firm only.
 */
function serializeRequestForAdmin(row: SchedulingAppointmentRequest) {
  return {
    id: row.publicId,
    firmId: row.firmId,
    appointmentTypeId: String(row.appointmentTypeId),
    startUtc: row.requestedStartAt.toISOString(),
    endUtc: row.requestedEndAt.toISOString(),
    state: row.status,
    source: row.source,
    contact: { name: row.customerName, phone: row.customerPhone, email: row.customerEmail },
    createdAt: row.createdAt.toISOString(),
    holdExpiresAt: row.holdExpiresAt ? row.holdExpiresAt.toISOString() : null,
  };
}

const router = Router();

const MAX_APPOINTMENT_TYPES = 20;
const MAX_BLOCKED_DATES = 366;
const MAX_DATE_EXCEPTIONS = 366;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class ValidationError extends Error {}

function validateDayHours(value: unknown, label: string): DayHours | null {
  if (value === null) return null;
  if (!isPlainObject(value)) throw new ValidationError(`${label} must be an hours object or null.`);
  const { start, end } = value;
  if (typeof start !== "string" || !TIME_PATTERN.test(start)) throw new ValidationError(`${label}.start must be "HH:mm".`);
  if (typeof end !== "string" || !TIME_PATTERN.test(end)) throw new ValidationError(`${label}.end must be "HH:mm".`);
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (sh! * 60 + sm! >= eh! * 60 + em!) throw new ValidationError(`${label}: start must be before end.`);
  return { start, end };
}

/**
 * An optional per-type rule override.
 *
 * Three states have to survive the wire, because collapsing any two of them
 * loses a meaning the business actually needs:
 *   - absent    → leave whatever is stored alone,
 *   - null      → clear the override, go back to inheriting,
 *   - a number  → set it (0 included: "no buffer" is a real choice).
 */
function validateOverride(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be null (inherit) or an integer between ${min} and ${max}.`);
  }
  return value;
}

function validateAppointmentType(value: unknown, index: number): AppointmentTypeInput {
  if (!isPlainObject(value)) throw new ValidationError(`appointmentTypes[${index}] must be an object.`);
  const { id, name, durationMin, description, calendarId, active, public: isPublic } = value;
  if (id !== undefined && (typeof id !== "string" || id.length > 50)) {
    throw new ValidationError(`appointmentTypes[${index}].id must be a string (max 50 chars) if provided.`);
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
    throw new ValidationError(`appointmentTypes[${index}].name is required (max 100 chars).`);
  }
  if (typeof durationMin !== "number" || !Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) {
    throw new ValidationError(`appointmentTypes[${index}].durationMin must be an integer between 5 and 480.`);
  }
  if (description !== undefined && description !== null && (typeof description !== "string" || description.length > 500)) {
    throw new ValidationError(`appointmentTypes[${index}].description must be a string of 500 characters or fewer, or null.`);
  }
  // The calendar identifier is an opaque provider string the business chose from
  // its own connected-calendar list. It is never used to construct a request URL.
  if (calendarId !== undefined && calendarId !== null && (typeof calendarId !== "string" || calendarId.length > 200)) {
    throw new ValidationError(`appointmentTypes[${index}].calendarId must be a string of 200 characters or fewer, or null.`);
  }
  function validateFlag(flag: unknown, field: string): boolean | undefined {
    if (flag === undefined) return undefined;
    if (typeof flag !== "boolean") throw new ValidationError(`appointmentTypes[${index}].${field} must be true or false.`);
    return flag;
  }
  const parsedActive = validateFlag(active, "active");
  const parsedPublic = validateFlag(isPublic, "public");

  const prefix = `appointmentTypes[${index}]`;
  return {
    ...(typeof id === "string" ? { id } : {}),
    name: name.trim(),
    durationMin,
    // Both stay ABSENT when the client omitted them. Mapping an omission to
    // null would clear a stored value that nobody asked to clear.
    ...(description === undefined ? {} : { description: typeof description === "string" ? description.trim() : null }),
    ...(calendarId === undefined ? {} : { calendarId: typeof calendarId === "string" ? calendarId : null }),
    ...(parsedActive === undefined ? {} : { active: parsedActive }),
    ...(parsedPublic === undefined ? {} : { public: parsedPublic }),
    bufferBeforeMin: validateOverride(value.bufferBeforeMin, `${prefix}.bufferBeforeMin`, 0, 240),
    bufferAfterMin: validateOverride(value.bufferAfterMin, `${prefix}.bufferAfterMin`, 0, 240),
    minNoticeHours: validateOverride(value.minNoticeHours, `${prefix}.minNoticeHours`, 0, 24 * 30),
    maxAdvanceDays: validateOverride(value.maxAdvanceDays, `${prefix}.maxAdvanceDays`, 1, 365),
    slotIntervalMin: validateOverride(value.slotIntervalMin, `${prefix}.slotIntervalMin`, 5, 240),
    dailyLimit: validateOverride(value.dailyLimit, `${prefix}.dailyLimit`, 1, 200),
  };
}

function validateDateException(value: unknown, index: number): DateExceptionInput {
  if (!isPlainObject(value)) throw new ValidationError(`dateExceptions[${index}] must be an object.`);
  const { dateKey, closed, hours, label } = value;
  if (typeof dateKey !== "string" || !DATE_KEY_PATTERN.test(dateKey)) {
    throw new ValidationError(`dateExceptions[${index}].dateKey must be "YYYY-MM-DD".`);
  }
  parseDateKey(dateKey);
  if (typeof closed !== "boolean") {
    // Not defaulted. "Closed" and "open with different hours" are opposite
    // instructions, and guessing which one a business meant is not acceptable.
    throw new ValidationError(`dateExceptions[${index}].closed must be true (closed all day) or false (special hours).`);
  }
  if (label !== undefined && label !== null && (typeof label !== "string" || label.length > 100)) {
    throw new ValidationError(`dateExceptions[${index}].label must be a string of 100 characters or fewer, or null.`);
  }
  if (!closed) {
    const parsed = validateDayHours(hours ?? null, `dateExceptions[${index}].hours`);
    if (parsed === null) {
      throw new ValidationError(`dateExceptions[${index}] is open, so it needs hours: { start, end }.`);
    }
    return { dateKey, closed, hours: parsed, ...(label === undefined ? {} : { label }) };
  }
  return { dateKey, closed, ...(label === undefined ? {} : { label }) };
}

function validateNonNegativeInt(value: unknown, label: string, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    throw new ValidationError(`${label} must be an integer between 0 and ${max}.`);
  }
  return value;
}

/** Full server-side validation for an admin-submitted availability config. Every field is untrusted browser input. */
function validateAvailabilitySettingsInput(body: unknown): AvailabilitySettingsInput {
  if (!isPlainObject(body)) throw new ValidationError("Request body must be an object.");

  const { timezone, weeklyHours, appointmentTypes, bufferBeforeMin, bufferAfterMin, minNoticeHours, maxAdvanceDays, blockedDates, dateExceptions, dailyLimit } = body;

  if (typeof timezone !== "string" || timezone.trim().length === 0 || timezone.length > 100) {
    throw new ValidationError("timezone is required.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new ValidationError(`"${timezone}" is not a recognized IANA timezone.`);
  }

  if (!isPlainObject(weeklyHours)) throw new ValidationError("weeklyHours must be an object keyed 0-6.");
  const parsedWeeklyHours: Record<number, DayHours | null> = {};
  for (let day = 0; day <= 6; day++) {
    parsedWeeklyHours[day] = validateDayHours(weeklyHours[String(day)] ?? null, `weeklyHours[${day}]`);
  }

  if (!Array.isArray(appointmentTypes) || appointmentTypes.length === 0) {
    throw new ValidationError("At least one appointment type is required.");
  }
  if (appointmentTypes.length > MAX_APPOINTMENT_TYPES) {
    throw new ValidationError(`No more than ${MAX_APPOINTMENT_TYPES} appointment types are supported.`);
  }
  const parsedTypes = appointmentTypes.map((t, i) => validateAppointmentType(t, i));

  if (!Array.isArray(blockedDates)) throw new ValidationError("blockedDates must be an array.");
  if (blockedDates.length > MAX_BLOCKED_DATES) throw new ValidationError(`No more than ${MAX_BLOCKED_DATES} blocked dates are supported.`);
  const parsedBlockedDates = blockedDates.map((d, i) => {
    if (typeof d !== "string" || !DATE_KEY_PATTERN.test(d)) throw new ValidationError(`blockedDates[${i}] must be "YYYY-MM-DD".`);
    parseDateKey(d); // throws if not a real calendar date shape
    return d;
  });

  let parsedDateExceptions: DateExceptionInput[] = [];
  if (dateExceptions !== undefined) {
    if (!Array.isArray(dateExceptions)) throw new ValidationError("dateExceptions must be an array.");
    if (dateExceptions.length > MAX_DATE_EXCEPTIONS) {
      throw new ValidationError(`No more than ${MAX_DATE_EXCEPTIONS} date exceptions are supported.`);
    }
    parsedDateExceptions = dateExceptions.map((e, i) => validateDateException(e, i));
    // One instruction per date. Two rows for the same day would make the day's
    // behaviour depend on insert order, and the table's unique index would
    // reject the write anyway — as a 500 rather than as an explanation.
    const seen = new Set<string>();
    for (const e of parsedDateExceptions) {
      if (seen.has(e.dateKey)) throw new ValidationError(`dateExceptions has more than one entry for ${e.dateKey}.`);
      seen.add(e.dateKey);
    }
  }

  // One date cannot be both shut and given special hours. The two are opposite
  // instructions stored in different places, so nothing downstream reconciles
  // them — whichever the availability engine consults first silently wins, and
  // a business that marked a date closed could still have it offered to
  // callers. Rejected here, naming the date, instead of being saved and
  // resolved by accident.
  {
    const blocked = new Set(parsedBlockedDates);
    for (const exception of parsedDateExceptions) {
      if (blocked.has(exception.dateKey)) {
        throw new ValidationError(
          `dateExceptions: ${exception.dateKey} is also listed in blockedDates. A date can be blocked or given different hours, not both.`,
        );
      }
    }
  }

  return {
    timezone: timezone.trim(),
    weeklyHours: parsedWeeklyHours,
    appointmentTypes: parsedTypes,
    bufferBeforeMin: validateNonNegativeInt(bufferBeforeMin, "bufferBeforeMin", 240),
    bufferAfterMin: validateNonNegativeInt(bufferAfterMin, "bufferAfterMin", 240),
    minNoticeHours: validateNonNegativeInt(minNoticeHours, "minNoticeHours", 24 * 30),
    maxAdvanceDays: (() => {
      const v = validateNonNegativeInt(maxAdvanceDays, "maxAdvanceDays", 365);
      if (v === 0) throw new ValidationError("maxAdvanceDays must be at least 1.");
      return v;
    })(),
    blockedDates: parsedBlockedDates,
    ...(dateExceptions === undefined ? {} : { dateExceptions: parsedDateExceptions }),
    ...(dailyLimit !== undefined && dailyLimit !== null
      ? { dailyLimit: validateNonNegativeInt(dailyLimit, "dailyLimit", 200) }
      : {}),
  };
}

// ── GET /api/receptionist/availability/config ─────────────────────────────────

router.get("/receptionist/availability/config", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const config = await getSerializedAvailabilitySettings(req.firmId!);
    res.json({ config });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to read availability config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/receptionist/availability/config ─────────────────────────────────

router.put("/receptionist/availability/config", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const input = validateAvailabilitySettingsInput(req.body);
    await saveAvailabilitySettings(req.firmId!, input);
    const config = await getSerializedAvailabilitySettings(req.firmId!);
    res.json({ config });
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to update availability config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/receptionist/availability/public-link ────────────────────────────
// Enables or disables the public scheduling page. Never exposes a
// sequential internal firm id — the slug is server-generated and opaque.

router.put("/receptionist/availability/public-link", requireReceptionistAuth, async (req: Request, res: Response) => {
  const enabled = (req.body ?? {})["enabled"] === true;
  try {
    if (!enabled) {
      await setPublicSlug(req.firmId!, null);
      res.json({ enabled: false, slug: null });
      return;
    }
    const slug = newPublicSlug();
    await setPublicSlug(req.firmId!, slug);
    res.json({ enabled: true, slug });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to update public scheduling link");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/receptionist/availability/calendar-status ───────────────────────
// Honest connection status only — never a calendar id, account email, or
// any other identifier, connected or not.

router.get("/receptionist/availability/calendar-status", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const provider = getFreeBusyProvider();
    const connected = await provider.isConnected(req.firmId!);
    res.json({ connected, provider: connected ? "google" : "none" });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to read calendar connection status");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/receptionist/availability/days?start=&end=&appointmentTypeId= ────
//
// Lightweight per-day summary (no slot list) for coloring a month calendar
// grid without one request per day.

const MAX_DAY_RANGE = 62;

function addDays(dateKey: string, count: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const d = new Date(Date.UTC(year, month - 1, day + count));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

router.get("/receptionist/availability/days", requireReceptionistAuth, async (req: Request, res: Response) => {
  const start = req.query["start"];
  const end = req.query["end"];
  const appointmentTypeId = req.query["appointmentTypeId"];
  if (typeof start !== "string" || !DATE_KEY_PATTERN.test(start) || typeof end !== "string" || !DATE_KEY_PATTERN.test(end)) {
    res.status(400).json({ error: "start and end must be YYYY-MM-DD" });
    return;
  }
  if (typeof appointmentTypeId !== "string" || appointmentTypeId.length === 0) {
    res.status(400).json({ error: "appointmentTypeId is required" });
    return;
  }
  try {
    parseDateKey(start);
    parseDateKey(end);
  } catch {
    res.status(400).json({ error: "start/end is not a valid calendar date" });
    return;
  }

  try {
    const days: { dateKey: string; reason: string; slotCount: number }[] = [];
    let cursor = start;
    const now = new Date();
    const freeBusyProvider = getFreeBusyProvider();
    for (let i = 0; i < MAX_DAY_RANGE && cursor <= end; i++) {
      const result = await getDayAvailability(req.firmId!, cursor, appointmentTypeId, now, freeBusyProvider);
      days.push({ dateKey: result.dateKey, reason: result.reason, slotCount: result.slots.length });
      cursor = addDays(cursor, 1);
    }
    res.json({ days });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to compute day availability");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/receptionist/availability/slots?date=YYYY-MM-DD&appointmentTypeId=... ──

router.get("/receptionist/availability/slots", requireReceptionistAuth, async (req: Request, res: Response) => {
  const date = req.query["date"];
  const appointmentTypeId = req.query["appointmentTypeId"];
  if (typeof date !== "string" || !DATE_KEY_PATTERN.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  if (typeof appointmentTypeId !== "string" || appointmentTypeId.length === 0) {
    res.status(400).json({ error: "appointmentTypeId is required" });
    return;
  }
  try {
    parseDateKey(date);
  } catch {
    res.status(400).json({ error: "date is not a valid calendar date" });
    return;
  }
  try {
    const result = await getDayAvailability(req.firmId!, date, appointmentTypeId, new Date(), getFreeBusyProvider());
    res.json({
      dateKey: result.dateKey,
      reason: result.reason,
      slots: result.slots.map((s) => ({ startUtc: s.startUtc.toISOString(), endUtc: s.endUtc.toISOString() })),
    });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to compute slot availability");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/receptionist/availability/hold ──────────────────────────────────

router.post("/receptionist/availability/hold", requireReceptionistAuth, async (req: Request, res: Response) => {
  const { appointmentTypeId, startUtc } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof appointmentTypeId !== "string" || typeof startUtc !== "string") {
    res.status(400).json({ error: "appointmentTypeId and startUtc are required" });
    return;
  }
  const start = new Date(startUtc);
  if (Number.isNaN(start.getTime())) {
    res.status(400).json({ error: "startUtc is not a valid date" });
    return;
  }
  try {
    const result = await createHold(req.firmId!, appointmentTypeId, start, new Date(), getFreeBusyProvider());
    if (!result.ok) {
      res.status(409).json({ error: "That slot is no longer available." });
      return;
    }
    res.status(201).json({ request: serializeRequestForAdmin(result.request) });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to create hold");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/receptionist/availability/requests ──────────────────────────────

router.post("/receptionist/availability/requests", requireReceptionistAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { appointmentTypeId, startUtc, contact } = body;
  if (typeof appointmentTypeId !== "string" || typeof startUtc !== "string" || !isPlainObject(contact)) {
    res.status(400).json({ error: "appointmentTypeId, startUtc, and contact are required" });
    return;
  }
  const start = new Date(startUtc);
  if (Number.isNaN(start.getTime())) {
    res.status(400).json({ error: "startUtc is not a valid date" });
    return;
  }
  const name = typeof contact["name"] === "string" ? (contact["name"] as string).trim().slice(0, 200) : "";
  if (!name) {
    res.status(400).json({ error: "contact.name is required" });
    return;
  }
  const phone = typeof contact["phone"] === "string" ? (contact["phone"] as string).trim().slice(0, 40) || null : null;
  const email = typeof contact["email"] === "string" ? (contact["email"] as string).trim().slice(0, 200) || null : null;
  const source = body["source"] === "manual" ? "manual" as const : "website" as const;
  // Consent is never inferred from the presence of a phone/email value —
  // it must be an explicit true from the client, defaulting to false.
  const consent = {
    phoneConsent: contact["phoneConsent"] === true,
    smsConsent: contact["smsConsent"] === true,
    emailConsent: contact["emailConsent"] === true,
  };

  try {
    const result = await submitAppointmentRequest(req.firmId!, appointmentTypeId, start, { name, phone, email }, consent, source, new Date(), getFreeBusyProvider());
    if (!result.ok) {
      res.status(409).json({ error: "That slot is no longer available. Please choose another time." });
      return;
    }
    req.log.info(
      { firmId: req.firmId, requestId: result.request.publicId, appointmentTypeId },
      "[receptionist] appointment request captured (pending_review, durable store)",
    );
    res.status(201).json({ request: serializeRequestForAdmin(result.request) });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to submit appointment request");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/receptionist/availability/requests ───────────────────────────────

router.get("/receptionist/availability/requests", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const items = await listAppointmentRequests(req.firmId!);
    res.json({ items: items.map(serializeRequestForAdmin) });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to list appointment requests");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/receptionist/availability/requests/:publicId/cancel ────────────

router.post("/receptionist/availability/requests/:publicId/cancel", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const firmId = req.firmId!;
    const publicId = req.params.publicId as string;
    // Read the row BEFORE cancelling: the cancel clears the status we would
    // otherwise use to find the event, and the provider ids live on this row.
    // Firm-scoped, so a foreign publicId is simply absent.
    const before = (await listAppointmentRequests(firmId)).find((r) => r.publicId === publicId);

    const cancelled = await cancelAppointmentRequestByPublicId(firmId, publicId);
    if (!cancelled) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    // The cancel itself is already durable. Removing the calendar event is a
    // best-effort follow-up: a provider failure opens a firm-scoped issue and
    // leaves the id in place for reconciliation, and must never turn a
    // successful cancellation into a 500.
    let calendar: string = "skipped";
    if (before?.providerEventId) {
      try {
        calendar = await removeCalendarEventForRequest(before, calendarSyncDeps());
      } catch (syncErr) {
        calendar = "failed";
        req.log.warn(
          { firmId, errorClass: syncErr instanceof Error ? syncErr.name : "unknown" },
          "[receptionist] calendar event removal failed after cancel",
        );
      }
    }
    res.json({ ok: true, calendar });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to cancel appointment request");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
