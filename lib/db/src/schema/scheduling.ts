// Durable scheduling schema — Checkpoint B (durable storage + public
// scheduling page). Versioned-migration-only, mirroring the voice-platform
// precedent (see ./voiceAssistants.ts, docs/ai-receptionist/DATABASE_STRATEGY.md
// ADR-05): these tables are NOT re-exported from the shared push-mode schema
// barrel (./index.ts), so `drizzle-kit push` (drizzle.config.ts) can never
// create, alter, or synchronize them. Use drizzle.scheduling.config.ts
// + `drizzle-kit generate`/`migrate` only.
//
// Absence from the barrel does NOT protect them from deletion. push
// reconciles the whole managed schema: anything it introspects that the
// barrel does not export is a drop candidate, which is how a second
// `migrate:fresh` removed all ten domain-migration-owned tables on staging
// (AR-001O correction 4). Deletion protection comes from the
// `!scheduling_*` entry in ./drizzle.config.ts's `tablesFilter`. Do not
// remove it.
//
// Replaces the in-memory Development store from Checkpoint A
// (artifacts/api-server/src/lib/scheduling/availabilityStore.ts) with
// firm-scoped, durable records. See docs/ai-receptionist/SCHEDULING.md for
// the full data-model rationale.

import { pgTable, serial, integer, text, boolean, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "./intakeAgent";

// ── scheduling_availability_settings ─────────────────────────────────────────
// One row per firm. Created lazily (getOrCreate) the first time a firm reads
// or writes its scheduling settings — there is no seed/backfill step.

export const schedulingAvailabilitySettings = pgTable("scheduling_availability_settings", {
  id:                                serial("id").primaryKey(),
  firmId:                            integer("firm_id")
                                        .notNull()
                                        .references(() => intakeFirms.id, { onDelete: "cascade" }),
  timezone:                          text("timezone").notNull(),
  // Opaque, non-sequential public identifier for /schedule/:slug. Null until
  // a firm's public scheduling page is explicitly enabled by an admin.
  publicSlug:                        text("public_slug"),
  minimumSchedulingNoticeMinutes:    integer("minimum_scheduling_notice_minutes").notNull().default(0),
  maximumAdvanceBookingDays:         integer("maximum_advance_booking_days").notNull().default(30),
  defaultBufferBeforeMinutes:        integer("default_buffer_before_minutes").notNull().default(0),
  defaultBufferAfterMinutes:         integer("default_buffer_after_minutes").notNull().default(0),
  defaultDailyAppointmentLimit:      integer("default_daily_appointment_limit"),
  createdAt:                         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:                         timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_scheduling_availability_settings_firm_id").on(table.firmId),
  uniqueIndex("uq_scheduling_availability_settings_public_slug")
    .on(table.publicSlug)
    .where(sql`${table.publicSlug} IS NOT NULL`),
  check(
    "ck_scheduling_availability_settings_notice_nonneg",
    sql`${table.minimumSchedulingNoticeMinutes} >= 0`,
  ),
  check(
    "ck_scheduling_availability_settings_advance_positive",
    sql`${table.maximumAdvanceBookingDays} >= 1`,
  ),
]);

// ── scheduling_weekly_hours ───────────────────────────────────────────────────
// Multiple rows per weekday are supported by the schema (durable model can
// represent split shifts); the Checkpoint A/B admin UI and availability
// engine currently read only the first enabled row per weekday — see
// docs/ai-receptionist/SCHEDULING.md ("Known limitation: single window per
// weekday").

export const schedulingWeeklyHours = pgTable("scheduling_weekly_hours", {
  id:         serial("id").primaryKey(),
  firmId:     integer("firm_id")
                .notNull()
                .references(() => intakeFirms.id, { onDelete: "cascade" }),
  weekday:    integer("weekday").notNull(),
  enabled:    boolean("enabled").notNull().default(true),
  startTime:  text("start_time").notNull(),
  endTime:    text("end_time").notNull(),
}, (table) => [
  index("ix_scheduling_weekly_hours_firm_id_weekday").on(table.firmId, table.weekday),
  check("ck_scheduling_weekly_hours_weekday_range", sql`${table.weekday} >= 0 AND ${table.weekday} <= 6`),
]);

// ── scheduling_appointment_types ──────────────────────────────────────────────

// Every rule column except `durationMinutes` is NULLABLE ON PURPOSE. NULL means
// "inherit the business default"; a number means "this service is different".
// That distinction is not decorative: 0 and NULL would otherwise be
// indistinguishable, and a type that genuinely wants no buffer would be
// impossible to express. See availabilityEngine.resolveTypeRules, which is the
// one place the pair is collapsed.
export const schedulingAppointmentTypes = pgTable("scheduling_appointment_types", {
  id:                     serial("id").primaryKey(),
  firmId:                 integer("firm_id")
                            .notNull()
                            .references(() => intakeFirms.id, { onDelete: "cascade" }),
  name:                   text("name").notNull(),
  description:            text("description"),
  durationMinutes:        integer("duration_minutes").notNull(),
  bufferBeforeMinutes:    integer("buffer_before_minutes"),
  bufferAfterMinutes:     integer("buffer_after_minutes"),
  minNoticeMinutes:       integer("min_notice_minutes"),
  maxAdvanceDays:         integer("max_advance_days"),
  slotIntervalMinutes:    integer("slot_interval_minutes"),
  // Which calendar a confirmed appointment of this type is written to. NULL
  // means the firm's selected calendar. Held as the provider's own opaque
  // calendar identifier — it is never accepted from a voice tool call.
  calendarId:             text("calendar_id"),
  active:                 boolean("active").notNull().default(true),
  // Public-facing types are selectable on the public scheduling page; a type
  // created without this flag stays admin/AI-receptionist-only.
  public:                 boolean("public").notNull().default(false),
  dailyLimit:             integer("daily_limit"),
  createdAt:              timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_scheduling_appointment_types_firm_id_active").on(table.firmId, table.active),
  check("ck_scheduling_appointment_types_duration_positive", sql`${table.durationMinutes} > 0`),
  // An override may be absent, but it may not be nonsense. A negative notice
  // or a zero-length slot interval would silently corrupt every slot search.
  check(
    "ck_scheduling_appointment_types_overrides_sane",
    sql`(${table.bufferBeforeMinutes} IS NULL OR ${table.bufferBeforeMinutes} >= 0)
    AND (${table.bufferAfterMinutes}  IS NULL OR ${table.bufferAfterMinutes}  >= 0)
    AND (${table.minNoticeMinutes}    IS NULL OR ${table.minNoticeMinutes}    >= 0)
    AND (${table.maxAdvanceDays}      IS NULL OR ${table.maxAdvanceDays}      >= 1)
    AND (${table.slotIntervalMinutes} IS NULL OR ${table.slotIntervalMinutes} >= 5)
    AND (${table.dailyLimit}          IS NULL OR ${table.dailyLimit}          >= 1)`,
  ),
]);

// ── scheduling_date_exceptions ────────────────────────────────────────────────
//
// A named departure from the weekly pattern on one specific date, in the
// business's own timezone.
//
// This is stored as a DATE KEY, not as a UTC instant range, and that is the
// point. The previous representation for a holiday was an all-day
// `scheduling_blocked_periods` row spanning 00:00-23:59:59.999 UTC, which for a
// business in America/Los_Angeles closed 17:00 the previous day through 16:59
// of the intended day — the wrong day, silently. A date key cannot be wrong
// about which day it means; the conversion to instants happens once, in the
// engine, against the firm's timezone.
//
// `closed` and `startTime`/`endTime` are the two distinct cases:
//   - closed = true  → a holiday. Shut regardless of weekly hours.
//   - closed = false → special hours, which REPLACE the weekday's hours, so a
//     date can also open a day the business is normally closed.

export const schedulingDateExceptions = pgTable("scheduling_date_exceptions", {
  id:         serial("id").primaryKey(),
  firmId:     integer("firm_id")
                .notNull()
                .references(() => intakeFirms.id, { onDelete: "cascade" }),
  /** "YYYY-MM-DD" in the firm's timezone. */
  dateKey:    text("date_key").notNull(),
  closed:     boolean("closed").notNull().default(true),
  startTime:  text("start_time"),
  endTime:    text("end_time"),
  /** Shown to the business only; never returned by a public or voice response. */
  label:      text("label"),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // One exception per date per firm — a date cannot be both closed and open.
  // This unique index is also the lookup index (firm_id, date_key is exactly
  // how the engine reads them), so no separate index is needed.
  uniqueIndex("uq_scheduling_date_exceptions_firm_id_date").on(table.firmId, table.dateKey),
  check("ck_scheduling_date_exceptions_date_key", sql`${table.dateKey} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`),
  // An open day must carry the hours it is open for; a closed day must not.
  // Without this, an exception row could be open with no hours, which the
  // engine would have to interpret — and interpretation is where a business's
  // stated intent quietly becomes something else.
  check(
    "ck_scheduling_date_exceptions_hours_match_closed",
    sql`(${table.closed} = true  AND ${table.startTime} IS NULL AND ${table.endTime} IS NULL)
     OR (${table.closed} = false AND ${table.startTime} IS NOT NULL AND ${table.endTime} IS NOT NULL)`,
  ),
  check(
    "ck_scheduling_date_exceptions_time_format",
    sql`(${table.startTime} IS NULL OR ${table.startTime} ~ '^[0-9]{2}:[0-9]{2}$')
    AND (${table.endTime}   IS NULL OR ${table.endTime}   ~ '^[0-9]{2}:[0-9]{2}$')`,
  ),
  check(
    "ck_scheduling_date_exceptions_range",
    sql`${table.startTime} IS NULL OR ${table.endTime} > ${table.startTime}`,
  ),
]);

// ── scheduling_blocked_periods ─────────────────────────────────────────────────
// internalLabel is never returned by any public API response.

export const schedulingBlockedPeriods = pgTable("scheduling_blocked_periods", {
  id:             serial("id").primaryKey(),
  firmId:         integer("firm_id")
                    .notNull()
                    .references(() => intakeFirms.id, { onDelete: "cascade" }),
  startsAt:       timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt:         timestamp("ends_at", { withTimezone: true }).notNull(),
  internalLabel:  text("internal_label"),
  allDay:         boolean("all_day").notNull().default(false),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_scheduling_blocked_periods_firm_id_range").on(table.firmId, table.startsAt, table.endsAt),
  check("ck_scheduling_blocked_periods_range", sql`${table.endsAt} > ${table.startsAt}`),
]);

// ── scheduling_appointment_requests ───────────────────────────────────────────
// `id` (serial) is an internal-only key and is never sent to any client.
// `publicId` is the only identifier ever exposed to a browser (admin or
// public) — non-sequential, unguessable, and stable across the request's
// lifecycle.
//
// Checkpoint B invariant (unchanged from Checkpoint A): providerEventId and
// providerCalendarId stay NULL, and status can never be 'booked', until a
// real calendar-provider write integration exists (Checkpoint C). Enforced
// here with a CHECK so a future application bug cannot silently mark a
// request booked without an actual provider confirmation.

export const APPOINTMENT_REQUEST_STATUSES = [
  "requested",
  "pending_review",
  "held",
  "booked",
  "cancelled",
  "rescheduled",
  "failed",
  "expired",
] as const;

export const APPOINTMENT_REQUEST_SOURCES = ["website", "ai_receptionist", "manual"] as const;

export const schedulingAppointmentRequests = pgTable("scheduling_appointment_requests", {
  id:                   serial("id").primaryKey(),
  publicId:             uuid("public_id").defaultRandom().notNull(),
  firmId:               integer("firm_id")
                          .notNull()
                          .references(() => intakeFirms.id, { onDelete: "cascade" }),
  appointmentTypeId:    integer("appointment_type_id")
                          .notNull()
                          .references(() => schedulingAppointmentTypes.id, { onDelete: "restrict" }),
  source:               text("source").notNull(),
  status:               text("status").notNull().default("pending_review"),
  requestedStartAt:     timestamp("requested_start_at", { withTimezone: true }).notNull(),
  requestedEndAt:        timestamp("requested_end_at", { withTimezone: true }).notNull(),
  timezone:             text("timezone").notNull(),
  customerName:         text("customer_name").notNull(),
  customerEmail:        text("customer_email"),
  customerPhone:        text("customer_phone"),
  notes:                text("notes"),
  phoneConsent:         boolean("phone_consent").notNull().default(false),
  smsConsent:           boolean("sms_consent").notNull().default(false),
  emailConsent:         boolean("email_consent").notNull().default(false),
  // Remain NULL for the entirety of Checkpoint B — see invariant above.
  providerEventId:      text("provider_event_id"),
  providerCalendarId:   text("provider_calendar_id"),
  /**
   * The voice provider's own id for the tool call that created this row.
   *
   * It exists so a RETRIED tool call is recognised as the same request rather
   * than treated as a second one. Without it the repeat reaches the
   * availability recheck, finds the slot occupied by the caller's own first
   * request, and the caller is told the time they just took is no longer
   * available — a confusing refusal for something that actually succeeded.
   *
   * NULL for every request that did not come from a tool call (the public
   * page, the dashboard), which is why the unique index below is partial.
   */
  toolCallId:           text("tool_call_id"),
  holdExpiresAt:        timestamp("hold_expires_at", { withTimezone: true }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  cancelledAt:          timestamp("cancelled_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("uq_scheduling_appointment_requests_public_id").on(table.publicId),
  // Partial: one row per (firm, tool call), and no constraint at all on the
  // many rows that never came from a tool call.
  uniqueIndex("uq_scheduling_appointment_requests_firm_tool_call")
    .on(table.firmId, table.toolCallId)
    .where(sql`${table.toolCallId} IS NOT NULL`),
  index("ix_scheduling_appointment_requests_firm_id_status").on(table.firmId, table.status),
  index("ix_scheduling_appointment_requests_firm_id_start").on(table.firmId, table.requestedStartAt),
  check(
    "ck_scheduling_appointment_requests_status",
    sql`${table.status} IN ('requested', 'pending_review', 'held', 'booked', 'cancelled', 'rescheduled', 'failed', 'expired')`,
  ),
  check(
    "ck_scheduling_appointment_requests_source",
    sql`${table.source} IN ('website', 'ai_receptionist', 'manual')`,
  ),
  check("ck_scheduling_appointment_requests_range", sql`${table.requestedEndAt} > ${table.requestedStartAt}`),
  // Checkpoint B invariant: no row may claim a provider-confirmed booking
  // without both provider identifiers present, and 'booked' is unreachable
  // by any Checkpoint B code path regardless of this constraint's presence.
  check(
    "ck_scheduling_appointment_requests_booked_requires_provider",
    sql`${table.status} <> 'booked' OR (${table.providerEventId} IS NOT NULL AND ${table.providerCalendarId} IS NOT NULL)`,
  ),
  check(
    "ck_scheduling_appointment_requests_notes_length",
    sql`${table.notes} IS NULL OR char_length(${table.notes}) <= 2000`,
  ),
]);

export type SchedulingAvailabilitySettings = typeof schedulingAvailabilitySettings.$inferSelect;
export type SchedulingWeeklyHours = typeof schedulingWeeklyHours.$inferSelect;
export type SchedulingAppointmentType = typeof schedulingAppointmentTypes.$inferSelect;
export type SchedulingBlockedPeriod = typeof schedulingBlockedPeriods.$inferSelect;
export type SchedulingDateException = typeof schedulingDateExceptions.$inferSelect;
export type SchedulingAppointmentRequest = typeof schedulingAppointmentRequests.$inferSelect;
export type AppointmentRequestStatus = (typeof APPOINTMENT_REQUEST_STATUSES)[number];
export type AppointmentRequestSource = (typeof APPOINTMENT_REQUEST_SOURCES)[number];
