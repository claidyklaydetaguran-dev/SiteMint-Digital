// Checkpoint B: unauthenticated, public-facing scheduling routes for
// /schedule/:slug. Every response is scoped to exactly the firm resolved
// from the opaque public slug — never a sequential internal firm id, never
// another firm's data, never a private calendar-event field. A submitted
// request always lands as `pending_review` and is never marked booked here.

import { Router, type Request, type Response } from "express";
import {
  getFirmByPublicSlug,
  getPublicAppointmentTypes,
  getDayAvailability,
  submitAppointmentRequest,
} from "../lib/scheduling/schedulingRepository.js";
import { parseDateKey } from "../lib/scheduling/zonedTime.js";
import { getFreeBusyProvider } from "../lib/calendar/index.js";
import {
  publicSchedulingIpLimiter,
  getClientIp,
  isHoneypotTripped,
  isImplausiblyFast,
  HONEYPOT_FIELD,
} from "../lib/scheduling/publicSchedulingProtection.js";
import {
  isPublicSchedulingRequestsEnabled,
  PUBLIC_SCHEDULING_REQUESTS_DISABLED_MESSAGE,
} from "../lib/publicWriteFlags.js";

const router = Router();

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_PATTERN = /^[a-f0-9]{32}$/;
const MAX_DAY_RANGE = 62;
const NOT_FOUND_MESSAGE = "Scheduling page not found.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Applies the shared IP rate limit to every public scheduling route (browsing and submission alike), so the endpoint set can't be used to scrape or brute-force slugs either. */
function rateLimited(req: Request, res: Response): boolean {
  const ip = getClientIp(req);
  if (publicSchedulingIpLimiter.isOverLimit(ip)) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return true;
  }
  publicSchedulingIpLimiter.record(ip);
  return false;
}

/** Uniform "not found" for a malformed slug, an unknown slug, and a slug that exists but isn't enabled — no branch here reveals which case occurred. */
async function resolveFirmOrNotFound(slug: string, res: Response): Promise<{ firmId: number; firmName: string; timezone: string } | null> {
  if (!SLUG_PATTERN.test(slug)) {
    res.status(404).json({ error: NOT_FOUND_MESSAGE });
    return null;
  }
  const firm = await getFirmByPublicSlug(slug);
  if (!firm) {
    res.status(404).json({ error: NOT_FOUND_MESSAGE });
    return null;
  }
  return firm;
}

function addDays(dateKey: string, count: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const d = new Date(Date.UTC(year, month - 1, day + count));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ── GET /api/public/schedule/:slug/config ─────────────────────────────────────

router.get("/public/schedule/:slug/config", async (req: Request, res: Response) => {
  if (rateLimited(req, res)) return;
  try {
    const firm = await resolveFirmOrNotFound(req.params.slug as string, res);
    if (!firm) return;
    const appointmentTypes = await getPublicAppointmentTypes(firm.firmId);
    res.json({ firmName: firm.firmName, timezone: firm.timezone, appointmentTypes });
  } catch (err) {
    req.log.error({ err }, "[public-scheduling] failed to load config");
    res.status(500).json({ error: GENERIC_ERROR });
  }
});

// ── GET /api/public/schedule/:slug/days ───────────────────────────────────────

router.get("/public/schedule/:slug/days", async (req: Request, res: Response) => {
  if (rateLimited(req, res)) return;
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
    const firm = await resolveFirmOrNotFound(req.params.slug as string, res);
    if (!firm) return;
    const publicTypes = await getPublicAppointmentTypes(firm.firmId);
    if (!publicTypes.some((t) => t.id === appointmentTypeId)) {
      res.status(404).json({ error: "Appointment type not found." });
      return;
    }

    const days: { dateKey: string; reason: string; slotCount: number }[] = [];
    let cursor = start;
    const now = new Date();
    const freeBusyProvider = getFreeBusyProvider();
    for (let i = 0; i < MAX_DAY_RANGE && cursor <= end; i++) {
      const result = await getDayAvailability(firm.firmId, cursor, appointmentTypeId, now, freeBusyProvider);
      days.push({ dateKey: result.dateKey, reason: result.reason, slotCount: result.slots.length });
      cursor = addDays(cursor, 1);
    }
    res.json({ days });
  } catch (err) {
    req.log.error({ err }, "[public-scheduling] failed to compute day availability");
    res.status(500).json({ error: GENERIC_ERROR });
  }
});

// ── GET /api/public/schedule/:slug/slots ──────────────────────────────────────

router.get("/public/schedule/:slug/slots", async (req: Request, res: Response) => {
  if (rateLimited(req, res)) return;
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
    const firm = await resolveFirmOrNotFound(req.params.slug as string, res);
    if (!firm) return;
    const publicTypes = await getPublicAppointmentTypes(firm.firmId);
    if (!publicTypes.some((t) => t.id === appointmentTypeId)) {
      res.status(404).json({ error: "Appointment type not found." });
      return;
    }
    const result = await getDayAvailability(firm.firmId, date, appointmentTypeId, new Date(), getFreeBusyProvider());
    res.json({
      dateKey: result.dateKey,
      reason: result.reason,
      slots: result.slots.map((s) => ({ startUtc: s.startUtc.toISOString(), endUtc: s.endUtc.toISOString() })),
    });
  } catch (err) {
    req.log.error({ err }, "[public-scheduling] failed to compute slot availability");
    res.status(500).json({ error: GENERIC_ERROR });
  }
});

// ── POST /api/public/schedule/:slug/requests ──────────────────────────────────

const MAX_NAME_LEN = 200;
const MAX_PHONE_LEN = 40;
const MAX_EMAIL_LEN = 200;
const MAX_NOTES_LEN = 1000;

router.post("/public/schedule/:slug/requests", async (req: Request, res: Response) => {
  // R7: fail-closed booking gate. First statement in the handler — ahead of the
  // slug/firm lookup, rate limiting, honeypot and timing checks, validation,
  // every database read and write, the appointment-request insert, and any
  // calendar, email or SMS action. The read-only availability routes above are
  // deliberately unaffected.
  if (!isPublicSchedulingRequestsEnabled()) {
    res.status(503).json({ error: PUBLIC_SCHEDULING_REQUESTS_DISABLED_MESSAGE });
    return;
  }
  if (rateLimited(req, res)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;

  // Bot protection: a tripped honeypot or an implausibly fast submission
  // gets the same generic response as a real validation failure — never a
  // distinguishable "we caught you" message.
  if (isHoneypotTripped(body[HONEYPOT_FIELD]) || isImplausiblyFast(body["formStartedAt"])) {
    res.status(400).json({ error: "Please try again." });
    return;
  }

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
  const name = typeof contact["name"] === "string" ? contact["name"].trim().slice(0, MAX_NAME_LEN) : "";
  if (!name) {
    res.status(400).json({ error: "contact.name is required" });
    return;
  }
  const phone = typeof contact["phone"] === "string" ? contact["phone"].trim().slice(0, MAX_PHONE_LEN) || null : null;
  const email = typeof contact["email"] === "string" ? contact["email"].trim().slice(0, MAX_EMAIL_LEN) || null : null;
  if (typeof contact["notes"] === "string" && contact["notes"].length > MAX_NOTES_LEN) {
    res.status(400).json({ error: "notes is too long." });
    return;
  }
  // Consent is never inferred from a phone/email value being present — it
  // must be an explicit `true` selected by the visitor, defaulting to false.
  const consent = {
    phoneConsent: contact["phoneConsent"] === true,
    smsConsent: contact["smsConsent"] === true,
    emailConsent: contact["emailConsent"] === true,
  };

  try {
    const firm = await resolveFirmOrNotFound(req.params.slug as string, res);
    if (!firm) return;
    const publicTypes = await getPublicAppointmentTypes(firm.firmId);
    if (!publicTypes.some((t) => t.id === appointmentTypeId)) {
      res.status(404).json({ error: "Appointment type not found." });
      return;
    }

    const result = await submitAppointmentRequest(
      firm.firmId, appointmentTypeId, start, { name, phone, email }, consent, "website", new Date(), getFreeBusyProvider(),
    );
    if (!result.ok) {
      res.status(409).json({ error: "That time is no longer available. Please choose another." });
      return;
    }

    req.log.info(
      { firmId: firm.firmId, appointmentTypeId },
      "[public-scheduling] appointment request captured (pending_review, not booked)",
    );
    res.status(201).json({
      status: "pending_review",
      booked: false,
      message: "Your appointment request was received and is pending review. It is not booked yet.",
      appointmentType: publicTypes.find((t) => t.id === appointmentTypeId)?.name ?? "",
      startUtc: result.request.requestedStartAt.toISOString(),
      timezone: firm.timezone,
    });
  } catch (err) {
    req.log.error({ err }, "[public-scheduling] failed to submit appointment request");
    res.status(500).json({ error: GENERIC_ERROR });
  }
});

export default router;
