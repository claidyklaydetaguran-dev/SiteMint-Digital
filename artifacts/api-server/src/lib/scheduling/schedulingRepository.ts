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
  schedulingDateExceptions,
  schedulingAppointmentRequests,
  type SchedulingAppointmentType,
  type SchedulingAppointmentRequest,
  type AppointmentRequestSource,
} from "@workspace/db/schema/scheduling";
import {
  computeDayAvailability,
  isSlotStillAvailable,
  resolveTypeRules,
  type AvailabilityConfig,
  type AppointmentType,
  type DateException,
  type DayHours,
  type EffectiveTypeRules,
  type ExistingBooking,
  type DayAvailabilityResult,
} from "./availabilityEngine.js";
import { parseDateKey, zonedDateKey, zonedTimeToUtc } from "./zonedTime.js";
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

/**
 * A NULL override column means "inherit the business default" and must stay
 * absent from the engine's type, not become 0 — `resolveTypeRules` distinguishes
 * the two, and collapsing them here would silently rewrite every inheriting
 * type's buffer to zero.
 */
function toEngineAppointmentType(row: SchedulingAppointmentType): AppointmentType {
  return {
    id: String(row.id),
    name: row.name,
    durationMin: row.durationMinutes,
    ...(row.bufferBeforeMinutes !== null ? { bufferBeforeMin: row.bufferBeforeMinutes } : {}),
    ...(row.bufferAfterMinutes !== null ? { bufferAfterMin: row.bufferAfterMinutes } : {}),
    ...(row.minNoticeMinutes !== null ? { minNoticeHours: row.minNoticeMinutes / 60 } : {}),
    ...(row.maxAdvanceDays !== null ? { maxAdvanceDays: row.maxAdvanceDays } : {}),
    ...(row.slotIntervalMinutes !== null ? { slotIntervalMin: row.slotIntervalMinutes } : {}),
    ...(row.dailyLimit !== null ? { dailyLimit: row.dailyLimit } : {}),
  };
}

async function getDateExceptions(firmId: number): Promise<DateException[]> {
  const rows = await db
    .select()
    .from(schedulingDateExceptions)
    .where(eq(schedulingDateExceptions.firmId, firmId))
    .orderBy(asc(schedulingDateExceptions.dateKey));
  return rows.map((row) => ({
    dateKey: row.dateKey,
    closed: row.closed,
    ...(row.startTime !== null && row.endTime !== null
      ? { hours: { start: row.startTime, end: row.endTime } }
      : {}),
    ...(row.label !== null ? { label: row.label } : {}),
  }));
}

/**
 * Builds the pure engine's AvailabilityConfig from durable settings, weekly
 * hours, active appointment types and per-date exceptions.
 *
 * `blockedDates` is derived from all-day blocked_periods rows so the engine can
 * answer "closed" rather than "fully booked" for a whole-day closure — an
 * honest reason matters, because "fully booked" invites the caller to ask about
 * a later time on a day nobody is there. Partial-day blocks stay as busy ranges
 * (see getBookingsForAvailability), which a flat date list cannot express.
 */
export async function buildAvailabilityConfig(firmId: number): Promise<AvailabilityConfig> {
  const [settings, weeklyHours, typeRows, dateExceptions] = await Promise.all([
    getOrCreateSettingsRow(firmId),
    getWeeklyHoursConfig(firmId),
    getActiveAppointmentTypeRows(firmId),
    getDateExceptions(firmId),
  ]);

  const allDayBlocks = await db
    .select({ startsAt: schedulingBlockedPeriods.startsAt })
    .from(schedulingBlockedPeriods)
    .where(and(eq(schedulingBlockedPeriods.firmId, firmId), eq(schedulingBlockedPeriods.allDay, true)));

  return {
    timezone: settings.timezone,
    weeklyHours,
    appointmentTypes: typeRows.map(toEngineAppointmentType),
    bufferBeforeMin: settings.defaultBufferBeforeMinutes,
    bufferAfterMin: settings.defaultBufferAfterMinutes,
    minNoticeHours: settings.minimumSchedulingNoticeMinutes / 60,
    maxAdvanceDays: settings.maximumAdvanceBookingDays,
    // The local date the block falls on — NOT the UTC date. A block stored as a
    // local-midnight instant is 08:00Z, so reading its UTC date would be right
    // by luck for a business east of Greenwich and wrong for one west of it.
    blockedDates: allDayBlocks.map((b) => zonedDateKey(settings.timezone, b.startsAt)),
    dateExceptions,
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
      .select({
        startAt: schedulingAppointmentRequests.requestedStartAt,
        endAt: schedulingAppointmentRequests.requestedEndAt,
        // Carried through so a per-type daily cap counts appointments of that
        // type. Blocked periods and calendar busy ranges belong to no type and
        // are deliberately left unattributed below.
        appointmentTypeId: schedulingAppointmentRequests.appointmentTypeId,
      })
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

  const bookings: ExistingBooking[] = requestRows.map((r) => ({
    startUtc: r.startAt,
    endUtc: r.endAt,
    appointmentTypeId: String(r.appointmentTypeId),
  }));
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
  | {
      ok: true;
      request: SchedulingAppointmentRequest;
      /**
       * True when this call did not create the row — an identical earlier call
       * did, and this is that same request returned again.
       *
       * The caller needs to know so it can repeat the original answer rather
       * than announce a second booking, and so a duplicate is never counted as
       * new activity.
       */
      duplicate?: boolean;
    }
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
  toolCallId?: string,
  providerCallId?: string,
): Promise<SlotMutationResult> {
  const typeIdNum = Number(appointmentTypeId);
  if (!Number.isInteger(typeIdNum)) return { ok: false, reason: "unknown_appointment_type" };

  return db.transaction(async (tx) => {
    const [firmKey, slotKey] = advisoryLockKeys(firmId, startUtc);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${firmKey}, ${slotKey})`);

    // A repeat of the same tool call is the same request, not a second one.
    //
    // Checked INSIDE the lock and before the availability recheck, because the
    // recheck is exactly what makes a duplicate look like a conflict: the
    // caller's own first request occupies the slot, so the repeat would be
    // refused with "that time is no longer available" for a booking that in
    // fact succeeded.
    if (toolCallId !== undefined && toolCallId !== "") {
      const [existing] = await tx
        .select()
        .from(schedulingAppointmentRequests)
        .where(
          and(
            eq(schedulingAppointmentRequests.firmId, firmId),
            eq(schedulingAppointmentRequests.toolCallId, toolCallId),
          ),
        )
        .limit(1);
      if (existing) return { ok: true, request: existing, duplicate: true };
    }

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
        ...(toolCallId !== undefined && toolCallId !== "" ? { toolCallId } : {}),
        ...(providerCallId !== undefined && providerCallId !== "" ? { providerCallId } : {}),
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
  /** The provider's tool-call id, when this came from a voice tool call. */
  toolCallId?: string,
  /** The provider's call id, so the call this was requested on can be named. */
  providerCallId?: string,
): Promise<SlotMutationResult> {
  return createRequestRow(
    firmId, appointmentTypeId, startUtc, "pending_review", source, contact, consent, now, freeBusyProvider, toolCallId,
    providerCallId,
  );
}

/**
 * The requests made on one call, oldest first.
 *
 * Firm-scoped like every other read here: another business's call id returns
 * nothing rather than someone else's appointments.
 */
export async function listAppointmentRequestsForCall(
  firmId: number,
  providerCallId: string,
): Promise<SchedulingAppointmentRequest[]> {
  if (providerCallId === "") return [];
  return db
    .select()
    .from(schedulingAppointmentRequests)
    .where(
      and(
        eq(schedulingAppointmentRequests.firmId, firmId),
        eq(schedulingAppointmentRequests.providerCallId, providerCallId),
      ),
    )
    .orderBy(schedulingAppointmentRequests.createdAt)
    .limit(20);
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

/**
 * One appointment type as the business submits it.
 *
 * Every rule field is `number | null | undefined` on purpose:
 *   - a number sets an override,
 *   - `null` clears it back to inheriting the business default,
 *   - `undefined` (absent from the body) leaves whatever is stored alone.
 *
 * A single nullable field could not express all three, and the missing one is
 * the dangerous one: without `undefined`, a client that omits a field would
 * silently clear it.
 */
export interface AppointmentTypeInput {
  id?: string;
  name: string;
  durationMin: number;
  description?: string | null;
  bufferBeforeMin?: number | null;
  bufferAfterMin?: number | null;
  minNoticeHours?: number | null;
  maxAdvanceDays?: number | null;
  slotIntervalMin?: number | null;
  dailyLimit?: number | null;
  calendarId?: string | null;
  active?: boolean;
  public?: boolean;
}

export interface DateExceptionInput {
  dateKey: string;
  closed: boolean;
  hours?: DayHours | null;
  label?: string | null;
}

export interface AvailabilitySettingsInput {
  timezone: string;
  weeklyHours: Record<number, DayHours | null>;
  appointmentTypes: AppointmentTypeInput[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  blockedDates: string[];
  /** Absent leaves stored exceptions untouched; an array replaces them wholly. */
  dateExceptions?: DateExceptionInput[];
  dailyLimit?: number;
}

/** `undefined` leaves the column as it is; `null` clears it; a number sets it. */
function overrideColumn(value: number | null | undefined): { set: boolean; value: number | null } {
  if (value === undefined) return { set: false, value: null };
  return { set: true, value };
}

function typeRuleColumns(input: AppointmentTypeInput): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  const pairs: Array<[string, number | null | undefined]> = [
    ["bufferBeforeMinutes", input.bufferBeforeMin],
    ["bufferAfterMinutes", input.bufferAfterMin],
    ["minNoticeMinutes", input.minNoticeHours === undefined || input.minNoticeHours === null ? input.minNoticeHours : Math.round(input.minNoticeHours * 60)],
    ["maxAdvanceDays", input.maxAdvanceDays],
    ["slotIntervalMinutes", input.slotIntervalMin],
    ["dailyLimit", input.dailyLimit],
  ];
  for (const [column, value] of pairs) {
    const resolved = overrideColumn(value);
    if (resolved.set) columns[column] = resolved.value;
  }
  if (input.description !== undefined) columns.description = input.description;
  if (input.calendarId !== undefined) columns.calendarId = input.calendarId;
  if (input.public !== undefined) columns.public = input.public;
  return columns;
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

    // Appointment types: upsert by numeric id when it matches a row of THIS
    // firm — active or not. Matching only active rows made a deactivated type
    // unreachable: submitting it again could not find it, so a duplicate row was
    // inserted instead of the original being brought back.
    //
    // Any active row absent from the submitted list is soft-deleted
    // (active=false) — never hard-deleted, since appointment_requests reference
    // it by FK and a past appointment must keep naming the service it was for.
    const existing = await tx
      .select({ id: schedulingAppointmentTypes.id, active: schedulingAppointmentTypes.active })
      .from(schedulingAppointmentTypes)
      .where(eq(schedulingAppointmentTypes.firmId, firmId));
    const ownedIds = new Set(existing.map((r) => r.id));
    const activeIds = new Set(existing.filter((r) => r.active).map((r) => r.id));
    const keptActiveIds = new Set<number>();

    for (const t of input.appointmentTypes) {
      // `active` defaults to true: a type the business submits is one it wants
      // bookable unless it explicitly said otherwise.
      const active = t.active ?? true;
      const asNum = t.id !== undefined ? Number(t.id) : NaN;
      if (Number.isInteger(asNum) && ownedIds.has(asNum)) {
        await tx
          .update(schedulingAppointmentTypes)
          .set({ name: t.name, durationMinutes: t.durationMin, active, ...typeRuleColumns(t), updatedAt: new Date() })
          .where(and(eq(schedulingAppointmentTypes.id, asNum), eq(schedulingAppointmentTypes.firmId, firmId)));
        if (active) keptActiveIds.add(asNum);
      } else {
        const [created] = await tx
          .insert(schedulingAppointmentTypes)
          // Public by default unless the business says otherwise, matching the
          // long-standing behaviour of this endpoint. A type submitted with
          // `public: false` stays internal to the dashboard and the receptionist.
          .values({ firmId, name: t.name, durationMinutes: t.durationMin, public: true, active, ...typeRuleColumns(t) })
          .returning({ id: schedulingAppointmentTypes.id });
        if (created && active) keptActiveIds.add(created.id);
      }
    }
    const removedIds = [...activeIds].filter((id) => !keptActiveIds.has(id));
    if (removedIds.length > 0) {
      await tx
        .update(schedulingAppointmentTypes)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(schedulingAppointmentTypes.firmId, firmId), inArray(schedulingAppointmentTypes.id, removedIds)));
    }

    // Blocked dates: full replace of all-day blocked_periods rows.
    //
    // The instants are derived from the BUSINESS's midnight, not from UTC
    // midnight. The previous `${dateKey}T00:00:00.000Z` closed 17:00 the
    // previous day through 16:59 of the intended day for a business in
    // America/Los_Angeles — a holiday on the wrong day, with no error anywhere.
    await tx.delete(schedulingBlockedPeriods).where(and(eq(schedulingBlockedPeriods.firmId, firmId), eq(schedulingBlockedPeriods.allDay, true)));
    if (input.blockedDates.length > 0) {
      await tx.insert(schedulingBlockedPeriods).values(
        input.blockedDates.map((dateKey) => {
          const { year, month, day } = parseDateKey(dateKey);
          const startsAt = zonedTimeToUtc(input.timezone, year, month, day, 0, 0);
          // The next local midnight, so a 23-hour or 25-hour DST day is still
          // covered exactly — a fixed 24-hour span would leak or overreach by
          // an hour twice a year.
          const endsAt = zonedTimeToUtc(input.timezone, year, month, day + 1, 0, 0);
          return { firmId, startsAt, endsAt, allDay: true };
        }),
      );
    }

    // Date exceptions: absent means "leave what is stored"; an array replaces
    // the set wholly, which is what an editor that shows every row submits.
    if (input.dateExceptions !== undefined) {
      await tx.delete(schedulingDateExceptions).where(eq(schedulingDateExceptions.firmId, firmId));
      if (input.dateExceptions.length > 0) {
        await tx.insert(schedulingDateExceptions).values(
          input.dateExceptions.map((e) => ({
            firmId,
            dateKey: e.dateKey,
            closed: e.closed,
            // The table's CHECK requires hours exactly when the day is open, so
            // a closed day's hours are dropped rather than stored and ignored.
            startTime: e.closed ? null : (e.hours?.start ?? null),
            endTime: e.closed ? null : (e.hours?.end ?? null),
            label: e.label ?? null,
          })),
        );
      }
    }
  });
}

/**
 * One appointment type as the dashboard shows it: the overrides the business
 * set, alongside the numbers that will ACTUALLY be used once inheritance is
 * applied.
 *
 * Both are sent because either alone misleads. The overrides alone cannot tell
 * a business what a type will do; the effective values alone cannot tell it
 * which of those it chose and which it is inheriting — so a change to the
 * business default would appear to change nothing.
 */
export interface SerializedAppointmentType {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  active: boolean;
  public: boolean;
  calendarId: string | null;
  /** null = inheriting the business default. */
  overrides: {
    bufferBeforeMin: number | null;
    bufferAfterMin: number | null;
    minNoticeHours: number | null;
    maxAdvanceDays: number | null;
    slotIntervalMin: number | null;
    dailyLimit: number | null;
  };
  /** What the slot search will use — computed by the engine, not by the caller. */
  effective: EffectiveTypeRules;
}

export interface SerializedAvailabilityConfig {
  timezone: string;
  weeklyHours: Record<number, DayHours | null>;
  /** Engine-shaped types, kept for the existing consumers of this endpoint. */
  appointmentTypes: AppointmentType[];
  /** The full per-type detail the Appointment Types editor needs. */
  appointmentTypeDetail: SerializedAppointmentType[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  slotIntervalMin: number;
  blockedDates: string[];
  dateExceptions: DateException[];
  dailyLimit: number | null;
}

export async function getSerializedAvailabilitySettings(firmId: number): Promise<SerializedAvailabilityConfig> {
  const config = await buildAvailabilityConfig(firmId);
  // ALL of the firm's types, not only the active ones, plus the columns the
  // engine's type deliberately does not carry (description, active, public,
  // calendar). Inactive types are included so the editor can show and reactivate
  // them — a type that vanishes from the interface when it is switched off looks
  // deleted, and the business has no way back to it.
  const rows = await db
    .select()
    .from(schedulingAppointmentTypes)
    .where(eq(schedulingAppointmentTypes.firmId, firmId))
    .orderBy(asc(schedulingAppointmentTypes.id));

  const detail: SerializedAppointmentType[] = rows.map((row) => {
    const engineType = toEngineAppointmentType(row);
    return {
      id: String(row.id),
      name: row.name,
      description: row.description,
      durationMin: row.durationMinutes,
      active: row.active,
      public: row.public,
      calendarId: row.calendarId,
      overrides: {
        bufferBeforeMin: row.bufferBeforeMinutes,
        bufferAfterMin: row.bufferAfterMinutes,
        minNoticeHours: row.minNoticeMinutes === null ? null : row.minNoticeMinutes / 60,
        maxAdvanceDays: row.maxAdvanceDays,
        slotIntervalMin: row.slotIntervalMinutes,
        dailyLimit: row.dailyLimit,
      },
      // The one calculation. The dashboard never recomputes inheritance.
      effective: resolveTypeRules(config, engineType),
    };
  });

  return {
    timezone: config.timezone,
    weeklyHours: config.weeklyHours,
    appointmentTypes: config.appointmentTypes,
    appointmentTypeDetail: detail,
    bufferBeforeMin: config.bufferBeforeMin,
    bufferAfterMin: config.bufferAfterMin,
    minNoticeHours: config.minNoticeHours,
    maxAdvanceDays: config.maxAdvanceDays,
    slotIntervalMin: config.slotIntervalMin,
    // Already the business's own local dates (see buildAvailabilityConfig);
    // re-deriving them from the stored instant's UTC date is what put holidays
    // on the wrong day before.
    blockedDates: config.blockedDates,
    dateExceptions: config.dateExceptions ?? [],
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

/**
 * The business day's timezone, editable from Settings as well as from
 * Availability. Deliberately the SAME row both pages already read, so the two
 * screens cannot drift into disagreeing about when this business is open.
 * Only the timezone is touched — hours, buffers and limits are untouched.
 */
export async function setBusinessTimezone(firmId: number, timezone: string): Promise<void> {
  await getOrCreateSettingsRow(firmId);
  await db
    .update(schedulingAvailabilitySettings)
    .set({ timezone, updatedAt: new Date() })
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
