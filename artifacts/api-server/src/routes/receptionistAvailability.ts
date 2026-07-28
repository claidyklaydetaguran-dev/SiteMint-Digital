// Checkpoint A: authenticated, firm-scoped scheduling endpoints backing both
// the Availability Settings admin UI and the visual booking-preview
// calendar. Backed by the in-memory Development store
// (lib/scheduling/availabilityStore.ts) — no migration, no real calendar
// provider, no appointment here can ever reach "booked".

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  getAvailabilityConfig,
  setAvailabilityConfig,
  getDayAvailability,
  createHold,
  submitAppointmentRequest,
  listAppointmentRequests,
  cancelAppointmentRequest,
  type AppointmentSource,
} from "../lib/scheduling/availabilityStore.js";
import type { AvailabilityConfig, DayHours, AppointmentType } from "../lib/scheduling/availabilityEngine.js";
import { parseDateKey } from "../lib/scheduling/zonedTime.js";

const router = Router();

const MAX_APPOINTMENT_TYPES = 20;
const MAX_BLOCKED_DATES = 366;
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

function validateAppointmentType(value: unknown, index: number): AppointmentType {
  if (!isPlainObject(value)) throw new ValidationError(`appointmentTypes[${index}] must be an object.`);
  const { id, name, durationMin } = value;
  if (typeof id !== "string" || id.trim().length === 0 || id.length > 50) {
    throw new ValidationError(`appointmentTypes[${index}].id is required (max 50 chars).`);
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
    throw new ValidationError(`appointmentTypes[${index}].name is required (max 100 chars).`);
  }
  if (typeof durationMin !== "number" || !Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) {
    throw new ValidationError(`appointmentTypes[${index}].durationMin must be an integer between 5 and 480.`);
  }
  return { id: id.trim(), name: name.trim(), durationMin };
}

function validateNonNegativeInt(value: unknown, label: string, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    throw new ValidationError(`${label} must be an integer between 0 and ${max}.`);
  }
  return value;
}

/** Full server-side validation for an admin-submitted availability config. Every field is untrusted browser input. */
function validateAvailabilityConfig(body: unknown): AvailabilityConfig {
  if (!isPlainObject(body)) throw new ValidationError("Request body must be an object.");

  const { timezone, weeklyHours, appointmentTypes, bufferBeforeMin, bufferAfterMin, minNoticeHours, maxAdvanceDays, blockedDates, slotIntervalMin, dailyLimit } = body;

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
  const ids = new Set(parsedTypes.map((t) => t.id));
  if (ids.size !== parsedTypes.length) throw new ValidationError("appointmentTypes ids must be unique.");

  if (!Array.isArray(blockedDates)) throw new ValidationError("blockedDates must be an array.");
  if (blockedDates.length > MAX_BLOCKED_DATES) throw new ValidationError(`No more than ${MAX_BLOCKED_DATES} blocked dates are supported.`);
  const parsedBlockedDates = blockedDates.map((d, i) => {
    if (typeof d !== "string" || !DATE_KEY_PATTERN.test(d)) throw new ValidationError(`blockedDates[${i}] must be "YYYY-MM-DD".`);
    parseDateKey(d); // throws if not a real calendar date shape
    return d;
  });

  const parsed: AvailabilityConfig = {
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
    slotIntervalMin: (() => {
      const v = validateNonNegativeInt(slotIntervalMin, "slotIntervalMin", 240);
      if (v < 5) throw new ValidationError("slotIntervalMin must be at least 5.");
      return v;
    })(),
    ...(dailyLimit !== undefined && dailyLimit !== null
      ? { dailyLimit: validateNonNegativeInt(dailyLimit, "dailyLimit", 200) }
      : {}),
  };
  return parsed;
}

function serializeConfig(config: AvailabilityConfig) {
  return {
    timezone: config.timezone,
    weeklyHours: config.weeklyHours,
    appointmentTypes: config.appointmentTypes,
    bufferBeforeMin: config.bufferBeforeMin,
    bufferAfterMin: config.bufferAfterMin,
    minNoticeHours: config.minNoticeHours,
    maxAdvanceDays: config.maxAdvanceDays,
    blockedDates: config.blockedDates,
    slotIntervalMin: config.slotIntervalMin,
    dailyLimit: config.dailyLimit ?? null,
  };
}

// ── GET /api/receptionist/availability/config ─────────────────────────────────

router.get("/receptionist/availability/config", requireReceptionistAuth, (req: Request, res: Response) => {
  res.json({ config: serializeConfig(getAvailabilityConfig(req.firmId!)) });
});

// ── PUT /api/receptionist/availability/config ─────────────────────────────────

router.put("/receptionist/availability/config", requireReceptionistAuth, (req: Request, res: Response) => {
  try {
    const config = validateAvailabilityConfig(req.body);
    setAvailabilityConfig(req.firmId!, config);
    res.json({ config: serializeConfig(config) });
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to update availability config");
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

router.get("/receptionist/availability/days", requireReceptionistAuth, (req: Request, res: Response) => {
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

  const days: { dateKey: string; reason: string; slotCount: number }[] = [];
  let cursor = start;
  const now = new Date();
  for (let i = 0; i < MAX_DAY_RANGE && cursor <= end; i++) {
    const result = getDayAvailability(req.firmId!, cursor, appointmentTypeId, now);
    days.push({ dateKey: result.dateKey, reason: result.reason, slotCount: result.slots.length });
    cursor = addDays(cursor, 1);
  }
  res.json({ days });
});

// ── GET /api/receptionist/availability/slots?date=YYYY-MM-DD&appointmentTypeId=... ──

router.get("/receptionist/availability/slots", requireReceptionistAuth, (req: Request, res: Response) => {
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
  const result = getDayAvailability(req.firmId!, date, appointmentTypeId, new Date());
  res.json({
    dateKey: result.dateKey,
    reason: result.reason,
    slots: result.slots.map((s) => ({ startUtc: s.startUtc.toISOString(), endUtc: s.endUtc.toISOString() })),
  });
});

// ── POST /api/receptionist/availability/hold ──────────────────────────────────

router.post("/receptionist/availability/hold", requireReceptionistAuth, (req: Request, res: Response) => {
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
  const result = createHold(req.firmId!, appointmentTypeId, start, new Date());
  if (!result.ok) {
    res.status(409).json({ error: "That slot is no longer available." });
    return;
  }
  res.status(201).json({ request: result.request });
});

// ── POST /api/receptionist/availability/requests ──────────────────────────────

router.post("/receptionist/availability/requests", requireReceptionistAuth, (req: Request, res: Response) => {
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
  const source: AppointmentSource = body["source"] === "manual" ? "manual" : "website";

  const result = submitAppointmentRequest(req.firmId!, appointmentTypeId, start, { name, phone, email }, source, new Date());
  if (!result.ok) {
    res.status(409).json({ error: "That slot is no longer available. Please choose another time." });
    return;
  }
  req.log.info(
    { firmId: req.firmId, requestId: result.request.id, appointmentTypeId },
    "[receptionist] appointment request captured (pending_review, Development store)",
  );
  res.status(201).json({ request: result.request });
});

// ── GET /api/receptionist/availability/requests ───────────────────────────────

router.get("/receptionist/availability/requests", requireReceptionistAuth, (req: Request, res: Response) => {
  const requests = listAppointmentRequests(req.firmId!, new Date());
  res.json({ items: requests });
});

// ── POST /api/receptionist/availability/requests/:id/cancel ──────────────────

router.post("/receptionist/availability/requests/:id/cancel", requireReceptionistAuth, (req: Request, res: Response) => {
  const cancelled = cancelAppointmentRequest(req.firmId!, req.params.id as string);
  if (!cancelled) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
