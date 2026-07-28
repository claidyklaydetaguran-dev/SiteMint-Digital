// Checkpoint B: durable, firm-scoped persistence for scheduling settings and
// appointment requests, replacing the Checkpoint A in-memory Development
// store (availabilityStore.ts, now removed). Every function requires an
// explicit firmId and every read/write is scoped by it — no lookup by record
// id alone. See docs/ai-receptionist/SCHEDULING.md.
//
// Concurrency: createHold and submitAppointmentRequest each run inside a
// single Postgres transaction that takes a transaction-scoped advisory lock
// keyed on (firmId, slot start time) before rechecking availability and
// inserting. Two concurrent requests for the identical slot are serialized
// by Postgres itself — the second transaction blocks on the lock until the
// first commits, then re-evaluates availability against the now-committed
// row and gets an honest conflict. This is the real-database equivalent of
// Checkpoint A's single-threaded in-memory check-then-write guarantee.

import { randomUUID, createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  schedulingAvailabilitySettings,
  schedulingWeeklyHours,
  schedulingAppointmentTypes,
  schedulingBlockedPeriods,
  schedulingAppointmentRequests,
  type SchedulingAppointmentType,
  type SchedulingAppointmentRequest,
  type AppointmentRequestSource,
} from "@workspace/db/schema/scheduling";
import {
  computeDayAvailability,
  isSlotStillAvailable,
  type AvailabilityConfig,
  type AppointmentType,
  type DayHours,
  type ExistingBooking,
  type DayAvailabilityResult,
} from "./availabilityEngine.js";
import type { FreeBusyProvider } from "../calendar/FreeBusyProvider.js";

// ── Safe defaults for a firm with no configured schedule ────────────────────
// Deliberately closed (no weekly hours) rather than assuming business hours,
// so a firm that never visited Availability Settings never publicly
// advertises availability it hasn't confirmed.

const DEFAULT_TIMEZONE = "America/Los_Angeles";
const DEFAULT_MIN_NOTICE_MINUTES = 240;
const DEFAULT_MAX_ADVANCE_DAYS = 30;
const DEFAULT_BUFFER_MINUTES = 10;
const DEFAULT_SLOT_INTERVAL_MIN = 30;
const HOLD_DURATION_MIN = 5;

async function getOrCreateSettingsRow(firmId: number) {
  const [existing] = await db
    .select()
    .from(schedulingAvailabilitySettings)
    .where(eq(schedulingAvailabilitySettings.firmId, firmId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(schedulingAvailabilitySettings)
    .values({
      firmId,
      timezone: DEFAULT_TIMEZONE,
      minimumSchedulingNoticeMinutes: DEFAULT_MIN_NOTICE_MINUTES,
      maximumAdvanceBookingDays: DEFAULT_MAX_ADVANCE_DAYS,
      defaultBufferBeforeMinutes: DEFAULT_BUFFER_MINUTES,
      defaultBufferAfterMinutes: DEFAULT_BUFFER_MINUTES,
    })
    .onConflictDoNothing({ target: schedulingAvailabilitySettings.firmId })
    .returning();

  if (created) return created;

  // Lost a race with a concurrent first-touch insert — read back the winner.
  const [row] = await db
    .select()
    .from(schedulingAvailabilitySettings)
    .where(eq(schedulingAvailabilitySettings.firmId, firmId))
    .limit(1);
  if (!row) throw new Error("scheduling_availability_settings: getOrCreate failed to read back a row");
  return row;
}

async function getWeeklyHoursConfig(firmId: number): Promise<Record<number, DayHours | null>> {
  const rows = await db
    .select()
    .from(schedulingWeeklyHours)
    .where(and(eq(schedulingWeeklyHours.firmId, firmId), eq(schedulingWeeklyHours.enabled, true)))
    .orderBy(asc(schedulingWeeklyHours.id));

  const weeklyHours: Record<number, DayHours | null> = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
  for (const row of rows) {
    // Known limitation (documented in SCHEDULING.md): only the first enabled
    // row per weekday is used; multi-window days are stored but not yet
    // read by the availability engine.
    if (weeklyHours[row.weekday] === null) {
      weeklyHours[row.weekday] = { start: row.startTime, end: row.endTime };
    }
  }
  return weeklyHours;
}

async function getActiveAppointmentTypeRows(firmId: number): Promise<SchedulingAppointmentType[]> {
  return db
    .select()
    .from(schedulingAppointmentTypes)
    .where(and(eq(schedulingAppointmentTypes.firmId, firmId), eq(schedulingAppointmentTypes.active, true)))
    .orderBy(asc(schedulingAppointmentTypes.id));
}

function toEngineAppointmentType(row: SchedulingAppointmentType): AppointmentType {
  return { id: String(row.id), name: row.name, durationMin: row.durationMinutes };
}

/** Builds the pure engine's AvailabilityConfig from durable settings + weekly hours + active appointment types. blockedDates stays empty here — blocked_periods rows are merged as busy ranges instead (see getBookingsForAvailability), which also supports partial-day blocks that a flat date list cannot express. */
export async function buildAvailabilityConfig(firmId: number): Promise<AvailabilityConfig> {
  const [settings, weeklyHours, typeRows] = await Promise.all([
    getOrCreateSettingsRow(firmId),
    getWeeklyHoursConfig(firmId),
    getActiveAppointmentTypeRows(firmId),
  ]);

  return {
    timezone: settings.timezone,
    weeklyHours,
    appointmentTypes: typeRows.map(toEngineAppointmentType),
    bufferBeforeMin: settings.defaultBufferBeforeMinutes,
    bufferAfterMin: settings.defaultBufferAfterMinutes,
    minNoticeHours: settings.minimumSchedulingNoticeMinutes / 60,
    maxAdvanceDays: settings.maximumAdvanceBookingDays,
    blockedDates: [],
    slotIntervalMin: DEFAULT_SLOT_INTERVAL_MIN,
    ...(settings.defaultDailyAppointmentLimit !== null ? { dailyLimit: settings.defaultDailyAppointmentLimit } : {}),
  };
}

const BLOCKING_STATUSES = ["held", "pending_review", "booked"] as const;

/**
 * Bookings that occupy calendar time for this firm, merged from three
 * sources: durable appointment requests whose status blocks availability
 * (held/pending_review/booked — cancelled/failed/expired never block),
 * durable manual blocked periods, and (when a provider is connected) Google
 * Calendar free/busy ranges. All three are flattened into the same
 * `ExistingBooking` shape the pure engine already accepts, so
 * computeDayAvailability/isSlotStillAvailable never need to know the source
 * of a conflict.
 */
export async function getBookingsForAvailability(
  firmId: number,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
  now: Date,
  freeBusyProvider?: FreeBusyProvider,
): Promise<ExistingBooking[]> {
  const [requestRows, blockedRows, googleBusy] = await Promise.all([
    db
      .select({ startAt: schedulingAppointmentRequests.requestedStartAt, endAt: schedulingAppointmentRequests.requestedEndAt })
      .from(schedulingAppointmentRequests)
      .where(
        and(
          eq(schedulingAppointmentRequests.firmId, firmId),
          inArray(schedulingAppointmentRequests.status, BLOCKING_STATUSES),
          or(isNull(schedulingAppointmentRequests.holdExpiresAt), gte(schedulingAppointmentRequests.holdExpiresAt, now)),
          lte(schedulingAppointmentRequests.requestedStartAt, rangeEndUtc),
          gte(schedulingAppointmentRequests.requestedEndAt, rangeStartUtc),
        ),
      ),
    db
      .select()
      .from(schedulingBlockedPeriods)
      .where(
        and(
          eq(schedulingBlockedPeriods.firmId, firmId),
          lte(schedulingBlockedPeriods.startsAt, rangeEndUtc),
          gte(schedulingBlockedPeriods.endsAt, rangeStartUtc),
        ),
      ),
    freeBusyProvider ? freeBusyProvider.getBusyRanges(firmId, rangeStartUtc, rangeEndUtc) : Promise.resolve([]),
  ]);

  const bookings: ExistingBooking[] = requestRows.map((r) => ({ startUtc: r.startAt, endUtc: r.endAt }));
  for (const b of blockedRows) bookings.push({ startUtc: b.startsAt, endUtc: b.endsAt });
  for (const g of googleBusy) bookings.push({ startUtc: g.startUtc, endUtc: g.endUtc });
  return bookings;
}

export async function getDayAvailability(
  firmId: number,
  dateKey: string,
  appointmentTypeId: string,
  now: Date,
  freeBusyProvider?: FreeBusyProvider,
): Promise<DayAvailabilityResult> {
  const config = await buildAvailabilityConfig(firmId);
  // A full day window in UTC is a safe superset of the business-timezone day
  // for the purpose of pulling candidate bookings/busy ranges to merge.
  const rangeStart = new Date(`${dateKey}T00:00:00.000Z`);
  const rangeEnd = new Date(new Date(rangeStart).setUTCDate(rangeStart.getUTCDate() + 2));
  const bookings = await getBookingsForAvailability(firmId, rangeStart, rangeEnd, now, freeBusyProvider);
  return computeDayAvailability(config, bookings, dateKey, appointmentTypeId, now);
}

export type SlotMutationResult =
  | { ok: true; request: SchedulingAppointmentRequest }
  | { ok: false; reason: "slot_no_longer_available" | "unknown_appointment_type" };

function advisoryLockKeys(firmId: number, startUtc: Date): [number, number] {
  // Two-int4 advisory lock key: firmId as-is (already a small positive int),
  // and a stable hash of the ISO start time folded into a signed int4 range.
  // Collisions across different (firmId, start) pairs would only cause
  // extra serialization, never a correctness issue — the availability
  // recheck inside the lock is still authoritative.
  const hash = createHash("sha256").update(startUtc.toISOString()).digest();
  const slotKey = hash.readInt32BE(0);
  return [firmId, slotKey];
}

interface ContactInput {
  name: string;
  phone: string | null;
  email: string | null;
}

interface ConsentInput {
  phoneConsent: boolean;
  smsConsent: boolean;
  emailConsent: boolean;
}

async function createRequestRow(
  firmId: number,
  appointmentTypeId: string,
  startUtc: Date,
  status: "held" | "pending_review",
  source: AppointmentRequestSource,
  contact: ContactInput,
  consent: ConsentInput,
  now: Date,
  freeBusyProvider: FreeBusyProvider | undefined,
): Promise<SlotMutationResult> {
  const typeIdNum = Number(appointmentTypeId);
  if (!Number.isInteger(typeIdNum)) return { ok: false, reason: "unknown_appointment_type" };

  return db.transaction(async (tx) => {
    const [firmKey, slotKey] = advisoryLockKeys(firmId, startUtc);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${firmKey}, ${slotKey})`);

    const config = await buildAvailabilityConfig(firmId);
    const type = config.appointmentTypes.find((t) => t.id === appointmentTypeId);
    if (!type) return { ok: false, reason: "unknown_appointment_type" };

    const rangeStart = new Date(startUtc.getTime() - 24 * 60 * 60_000);
    const rangeEnd = new Date(startUtc.getTime() + 24 * 60 * 60_000);
    const bookings = await getBookingsForAvailability(firmId, rangeStart, rangeEnd, now, freeBusyProvider);

    if (!isSlotStillAvailable(config, bookings, startUtc, appointmentTypeId, now)) {
      return { ok: false, reason: "slot_no_longer_available" };
    }

    const endUtc = new Date(startUtc.getTime() + type.durationMin * 60_000);
    const [row] = await tx
      .insert(schedulingAppointmentRequests)
      .values({
        firmId,
        appointmentTypeId: typeIdNum,
        source,
        status,
        requestedStartAt: startUtc,
        requestedEndAt: endUtc,
        timezone: config.timezone,
        customerName: contact.name,
        customerEmail: contact.email,
        customerPhone: contact.phone,
        phoneConsent: consent.phoneConsent,
        smsConsent: consent.smsConsent,
        emailConsent: consent.emailConsent,
        holdExpiresAt: status === "held" ? new Date(now.getTime() + HOLD_DURATION_MIN * 60_000) : null,
      })
      .returning();

    if (!row) throw new Error("scheduling_appointment_requests insert did not return a row");
    return { ok: true, request: row };
  });
}

/** Short-lived Development-preview hold. Never a real reservation with any external provider. */
export async function createHold(
  firmId: number,
  appointmentTypeId: string,
  startUtc: Date,
  now: Date,
  freeBusyProvider?: FreeBusyProvider,
): Promise<SlotMutationResult> {
  return createRequestRow(
    firmId, appointmentTypeId, startUtc, "held", "website",
    { name: "", phone: null, email: null },
    { phoneConsent: false, smsConsent: false, emailConsent: false },
    now, freeBusyProvider,
  );
}

/**
 * Submits the final appointment request. Always lands as `pending_review` —
 * no calendar-write integration exists yet, so nothing here can ever become
 * `booked`. Revalidates the slot inside the same locked transaction
 * regardless of any prior hold.
 */
export async function submitAppointmentRequest(
  firmId: number,
  appointmentTypeId: string,
  startUtc: Date,
  contact: ContactInput,
  consent: ConsentInput,
  source: AppointmentRequestSource,
  now: Date,
  freeBusyProvider?: FreeBusyProvider,
): Promise<SlotMutationResult> {
  return createRequestRow(firmId, appointmentTypeId, startUtc, "pending_review", source, contact, consent, now, freeBusyProvider);
}

export async function listAppointmentRequests(firmId: number): Promise<SchedulingAppointmentRequest[]> {
  return db
    .select()
    .from(schedulingAppointmentRequests)
    .where(eq(schedulingAppointmentRequests.firmId, firmId))
    .orderBy(desc(schedulingAppointmentRequests.createdAt))
    .limit(200);
}

/** Firm-scoped cancellation by the durable public_id — never a bare internal id, and never usable cross-firm. */
export async function cancelAppointmentRequestByPublicId(firmId: number, publicId: string): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .update(schedulingAppointmentRequests)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(schedulingAppointmentRequests.firmId, firmId),
        eq(schedulingAppointmentRequests.publicId, publicId),
        inArray(schedulingAppointmentRequests.status, ["held", "pending_review"]),
      ),
    )
    .returning({ id: schedulingAppointmentRequests.id });
  return row !== undefined;
}

export async function expireStaleHolds(firmId: number, now: Date): Promise<void> {
  await db
    .update(schedulingAppointmentRequests)
    .set({ status: "expired", holdExpiresAt: null, updatedAt: now })
    .where(
      and(
        eq(schedulingAppointmentRequests.firmId, firmId),
        eq(schedulingAppointmentRequests.status, "held"),
        lte(schedulingAppointmentRequests.holdExpiresAt, now),
      ),
    );
}

// ── Availability settings + appointment types (admin CRUD) ──────────────────

export interface AvailabilitySettingsInput {
  timezone: string;
  weeklyHours: Record<number, DayHours | null>;
  appointmentTypes: { id?: string; name: string; durationMin: number }[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  blockedDates: string[];
  dailyLimit?: number;
}

export async function saveAvailabilitySettings(firmId: number, input: AvailabilitySettingsInput): Promise<void> {
  await db.transaction(async (tx) => {
    await getOrCreateSettingsRow(firmId);
    await tx
      .update(schedulingAvailabilitySettings)
      .set({
        timezone: input.timezone,
        minimumSchedulingNoticeMinutes: Math.round(input.minNoticeHours * 60),
        maximumAdvanceBookingDays: input.maxAdvanceDays,
        defaultBufferBeforeMinutes: input.bufferBeforeMin,
        defaultBufferAfterMinutes: input.bufferAfterMin,
        defaultDailyAppointmentLimit: input.dailyLimit ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schedulingAvailabilitySettings.firmId, firmId));

    // Weekly hours: full replace (only ever one row per weekday from this UI).
    await tx.delete(schedulingWeeklyHours).where(eq(schedulingWeeklyHours.firmId, firmId));
    const weeklyRows = Object.entries(input.weeklyHours)
      .filter(([, hours]) => hours !== null)
      .map(([weekday, hours]) => ({
        firmId,
        weekday: Number(weekday),
        enabled: true,
        startTime: hours!.start,
        endTime: hours!.end,
      }));
    if (weeklyRows.length > 0) await tx.insert(schedulingWeeklyHours).values(weeklyRows);

    // Appointment types: upsert by numeric id when it matches an existing
    // active row for this firm; otherwise insert. Any existing active row
    // not present in the submitted list is soft-deleted (active=false) —
    // never hard-deleted, since appointment_requests reference it by FK.
    const existing = await tx
      .select({ id: schedulingAppointmentTypes.id })
      .from(schedulingAppointmentTypes)
      .where(and(eq(schedulingAppointmentTypes.firmId, firmId), eq(schedulingAppointmentTypes.active, true)));
    const existingIds = new Set(existing.map((r) => r.id));
    const keptIds = new Set<number>();

    for (const t of input.appointmentTypes) {
      const asNum = t.id !== undefined ? Number(t.id) : NaN;
      if (Number.isInteger(asNum) && existingIds.has(asNum)) {
        await tx
          .update(schedulingAppointmentTypes)
          .set({ name: t.name, durationMinutes: t.durationMin, updatedAt: new Date() })
          .where(and(eq(schedulingAppointmentTypes.id, asNum), eq(schedulingAppointmentTypes.firmId, firmId)));
        keptIds.add(asNum);
      } else {
        const [created] = await tx
          .insert(schedulingAppointmentTypes)
          // Public by default: the admin Availability Settings UI has no
          // per-type visibility toggle yet (documented limitation), so a
          // type created there is immediately selectable on the public
          // scheduling page too.
          .values({ firmId, name: t.name, durationMinutes: t.durationMin, public: true })
          .returning({ id: schedulingAppointmentTypes.id });
        if (created) keptIds.add(created.id);
      }
    }
    const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
    if (removedIds.length > 0) {
      await tx
        .update(schedulingAppointmentTypes)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(schedulingAppointmentTypes.firmId, firmId), inArray(schedulingAppointmentTypes.id, removedIds)));
    }

    // Blocked dates: full replace of all-day blocked_periods rows.
    await tx.delete(schedulingBlockedPeriods).where(and(eq(schedulingBlockedPeriods.firmId, firmId), eq(schedulingBlockedPeriods.allDay, true)));
    if (input.blockedDates.length > 0) {
      await tx.insert(schedulingBlockedPeriods).values(
        input.blockedDates.map((dateKey) => ({
          firmId,
          startsAt: new Date(`${dateKey}T00:00:00.000Z`),
          endsAt: new Date(`${dateKey}T23:59:59.999Z`),
          allDay: true,
        })),
      );
    }
  });
}

export interface SerializedAvailabilityConfig {
  timezone: string;
  weeklyHours: Record<number, DayHours | null>;
  appointmentTypes: AppointmentType[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  blockedDates: string[];
  dailyLimit: number | null;
}

export async function getSerializedAvailabilitySettings(firmId: number): Promise<SerializedAvailabilityConfig> {
  const config = await buildAvailabilityConfig(firmId);
  const blockedRows = await db
    .select({ startsAt: schedulingBlockedPeriods.startsAt })
    .from(schedulingBlockedPeriods)
    .where(and(eq(schedulingBlockedPeriods.firmId, firmId), eq(schedulingBlockedPeriods.allDay, true)));

  return {
    timezone: config.timezone,
    weeklyHours: config.weeklyHours,
    appointmentTypes: config.appointmentTypes,
    bufferBeforeMin: config.bufferBeforeMin,
    bufferAfterMin: config.bufferAfterMin,
    minNoticeHours: config.minNoticeHours,
    maxAdvanceDays: config.maxAdvanceDays,
    blockedDates: blockedRows.map((r) => r.startsAt.toISOString().slice(0, 10)),
    dailyLimit: config.dailyLimit ?? null,
  };
}

/** Test-only: clears durable scheduling state for one firm. Never called from application routes. */
export async function _resetSchedulingForTests(firmId: number): Promise<void> {
  await db.delete(schedulingAppointmentRequests).where(eq(schedulingAppointmentRequests.firmId, firmId));
  await db.delete(schedulingBlockedPeriods).where(eq(schedulingBlockedPeriods.firmId, firmId));
  await db.delete(schedulingAppointmentTypes).where(eq(schedulingAppointmentTypes.firmId, firmId));
  await db.delete(schedulingWeeklyHours).where(eq(schedulingWeeklyHours.firmId, firmId));
  await db.delete(schedulingAvailabilitySettings).where(eq(schedulingAvailabilitySettings.firmId, firmId));
}

// ── Public scheduling (slug-based, no internal IDs exposed) ─────────────────

export interface PublicFirmSummary {
  firmId: number;
  firmName: string;
  timezone: string;
}

/** Resolves an opaque public slug to a firm — never an internal sequential id. Returns null for any unknown or unassigned slug (indistinguishable from a slug that was never enabled). */
export async function getFirmByPublicSlug(slug: string): Promise<PublicFirmSummary | null> {
  const { intakeFirms } = await import("@workspace/db/schema");
  const [row] = await db
    .select({ firmId: schedulingAvailabilitySettings.firmId, timezone: schedulingAvailabilitySettings.timezone, firmName: intakeFirms.name })
    .from(schedulingAvailabilitySettings)
    .innerJoin(intakeFirms, eq(intakeFirms.id, schedulingAvailabilitySettings.firmId))
    .where(eq(schedulingAvailabilitySettings.publicSlug, slug))
    .limit(1);
  return row ?? null;
}

export async function setPublicSlug(firmId: number, slug: string | null): Promise<void> {
  await getOrCreateSettingsRow(firmId);
  await db
    .update(schedulingAvailabilitySettings)
    .set({ publicSlug: slug, updatedAt: new Date() })
    .where(eq(schedulingAvailabilitySettings.firmId, firmId));
}

export async function getPublicAppointmentTypes(firmId: number): Promise<AppointmentType[]> {
  const rows = await db
    .select()
    .from(schedulingAppointmentTypes)
    .where(and(eq(schedulingAppointmentTypes.firmId, firmId), eq(schedulingAppointmentTypes.active, true), eq(schedulingAppointmentTypes.public, true)))
    .orderBy(asc(schedulingAppointmentTypes.id));
  return rows.map(toEngineAppointmentType);
}

export function newPublicSlug(): string {
  // Opaque, non-sequential, unguessable — not derived from firmId or name.
  return randomUUID().replace(/-/g, "");
}
