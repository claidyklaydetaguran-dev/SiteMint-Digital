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
  type AvailabilitySettingsInput,
} from "../lib/scheduling/schedulingRepository.js";
import type { DayHours } from "../lib/scheduling/availabilityEngine.js";
import { parseDateKey } from "../lib/scheduling/zonedTime.js";
import { getFreeBusyProvider } from "../lib/calendar/index.js";
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

function validateAppointmentType(value: unknown, index: number): { id?: string; name: string; durationMin: number } {
  if (!isPlainObject(value)) throw new ValidationError(`appointmentTypes[${index}] must be an object.`);
  const { id, name, durationMin } = value;
  if (id !== undefined && (typeof id !== "string" || id.length > 50)) {
    throw new ValidationError(`appointmentTypes[${index}].id must be a string (max 50 chars) if provided.`);
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
    throw new ValidationError(`appointmentTypes[${index}].name is required (max 100 chars).`);
  }
  if (typeof durationMin !== "number" || !Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) {
    throw new ValidationError(`appointmentTypes[${index}].durationMin must be an integer between 5 and 480.`);
  }
  return { ...(typeof id === "string" ? { id } : {}), name: name.trim(), durationMin };
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

  const { timezone, weeklyHours, appointmentTypes, bufferBeforeMin, bufferAfterMin, minNoticeHours, maxAdvanceDays, blockedDates, dailyLimit } = body;

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
    const cancelled = await cancelAppointmentRequestByPublicId(req.firmId!, req.params.publicId as string);
    if (!cancelled) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to cancel appointment request");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
