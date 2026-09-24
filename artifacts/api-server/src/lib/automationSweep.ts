// ── M5: the two durable automation workers ──────────────────────────────────
//
// This file closes the two holes left in M4's automation engine. They are
// different problems with one shape: an event that should reach rule evaluation
// and does not.
//
// ── Gap 1 — the time-based triggers had no producer ─────────────────────────
//
// `task_overdue` and `no_activity_for_days` were declared triggers that nothing
// ever evaluated. A rule using either could be written, saved, enabled, and
// would then sit there for ever, silently dead. Nobody "does" an overdue task:
// it becomes true as the clock passes a day boundary, with no request, no user
// and no route to hang a producer on. So it is produced by a SWEEP over record
// state, run periodically — and run on the EXISTING `crm_scheduled_jobs`
// runner, with the same lease and the same settle the reminder engine uses.
// There is no second timer and nothing here calls `setInterval`.
//
// ── Gap 2 — business events were held in memory ─────────────────────────────
//
// `fireAutomation()` must never throw and must never be awaited: a fault in
// somebody's rule cannot be allowed to fail the business write that merely
// caused the event. That property is preserved exactly. What changes is where
// the event lives in between. It used to be a promise in a dying process; it is
// now a ROW, and a worker turns rows into executions with retry.
//
// ── What the guarantee actually is, in plain words ──────────────────────────
//
// AT-LEAST-ONCE, with repeats made harmless by deduplication. Not
// exactly-once, and the difference is not a detail:
//
//   * The event row is written AFTER the business write and NOT inside its
//     transaction, because the producers call `fireAutomation()` once they have
//     already answered the request, and this file does not own those routes. A
//     process killed in the gap between those two writes still loses that
//     event. What has changed is that the gap is one INSERT wide instead of a
//     whole rule evaluation wide.
//   * Once the row exists, the event WILL reach rule evaluation — retried with
//     backoff, across restarts, across workers, until it is processed or has
//     visibly run out of attempts.
//   * It may reach rule evaluation more than once, because a worker whose lease
//     expires mid-flight is reclaimed. That is harmless: the engine's
//     `uq_crm_automation_executions_occurrence` index refuses the second
//     execution for the same occurrence, and the event table's own
//     `uq_crm_automation_events_occurrence` refuses the second row.
//
// Closing the remaining gap needs the producers to record the event inside
// their own transaction, which is a change to the business routes and belongs
// to whoever owns them. Until then: automation is a convenience layer over the
// record, never the system of record.
//
// ── Nothing here can contact a customer ─────────────────────────────────────
//
// The sweep records events; events become executions; executions run actions;
// and no action type in the vocabulary has an outbound channel. Adding a
// trigger does not add a way out. See `automationEngine.ts`.

import { and, asc, desc, eq, gte, inArray, isNull, lte, lt, ne, or, sql } from "drizzle-orm";
import {
  db,
  crmAutomationRules, crmAutomationEvents, crmScheduledJobs,
  crmStaff, crmTasks, crmLeads,
  CRM_AUTOMATION_TRIGGER_RECORD, isSweepTrigger, resolveCrmTaskDueKind,
  type CrmAutomationChain, type CrmAutomationEvent, type CrmAutomationTriggerEvent,
  type CrmScheduledJob,
} from "@workspace/db";
import {
  emitAutomationTrigger, defaultAutomationDeps, deriveOccurrenceKey, loadAutomationRecord,
  type AutomationDeps,
} from "./automationEngine.js";
import { logger } from "./logger.js";

/** The `crm_scheduled_jobs.kind` the periodic time-trigger sweep rides on. */
export const AUTOMATION_SWEEP_JOB_KIND = "crm_automation_sweep";
/** The `crm_scheduled_jobs.kind` the durable event drain rides on. */
export const AUTOMATION_EVENTS_JOB_KIND = "crm_automation_events";

/** One row each, for ever. These are singleton workers, not per-record jobs. */
export const AUTOMATION_SWEEP_JOB_KEY = `${AUTOMATION_SWEEP_JOB_KIND}:singleton`;
export const AUTOMATION_EVENTS_JOB_KEY = `${AUTOMATION_EVENTS_JOB_KIND}:singleton`;

/**
 * How often each worker re-arms itself.
 *
 * The sweep asks a day-boundary question, so five minutes is far finer than it
 * needs to be and is chosen to bound how late a firing can be rather than how
 * often it happens — the occurrence key means running it more often changes
 * nothing. The drain re-arms inside one scheduler tick so it runs every tick.
 */
const SWEEP_INTERVAL_MS = 5 * 60_000;
const EVENTS_INTERVAL_MS = 20_000;

/** How long a claimed event may stay locked before another worker reclaims it. */
const EVENT_LEASE_MS = 5 * 60_000;
const EVENT_BATCH = 50;

/** Waits between attempts at an event that failed to reach rule evaluation. */
const EVENT_BACKOFF_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000];

const WORKER_ID = `${process.pid}-automation-events-${Math.random().toString(36).slice(2, 8)}`;

// ── Time zones and day boundaries ───────────────────────────────────────────
//
// "Overdue" and "quiet for N days" are DAY-BOUNDARY questions, not elapsed-hour
// questions. A task due Friday is not overdue at 23:00 on Friday and is overdue
// at 00:01 on Saturday — where the person responsible for it actually is.
//
// ── Which zone decides ──────────────────────────────────────────────────────
//
// The zone of the staff member who OWNS the record:
//
//   task_overdue          the task's assignee (`crm_tasks.assigned_to_staff_id`)
//   no_activity_for_days  the contact's owner (`crm_leads.assigned_to_staff_id`,
//                         M6). Never the free-text `assigned_to`: a name looked
//                         up at read time picks a zone for whichever of two
//                         same-named people the map happened to keep, and
//                         changes answer when somebody is renamed. A contact
//                         whose owner is not resolved to a person gets the
//                         fallback zone, like an unassigned one.
//
// and `UTC` when there is no owner, the account is gone or inactive, or the
// zone string is not one `Intl` recognises.
//
// This is the same rule the reminder engine already follows: `runDailyDigest`
// bounds "today" with `localDayBounds(staff.timezone)`, `scheduleDailyDigest`
// computes the digest instant in `staff.timezone`, and both fall back to UTC —
// `crm_staff.timezone` is itself NOT NULL DEFAULT 'UTC'. A CRM-wide zone
// setting would have been the other option and would be wrong here for the same
// reason it is wrong there: the person who has to act on an overdue task is the
// person whose Friday it is.
//
// The day itself is named with `Intl.DateTimeFormat("en-CA")`, which is exactly
// how `scheduleDailyDigest` names the local date it keys a digest on — the same
// idiom, so the two engines cannot drift apart on what "a day" is.

/** When a record has no owner, or the owner's zone is unusable. */
export const AUTOMATION_FALLBACK_TIMEZONE = "UTC";

/** The local calendar day of `at` in `zone`, as "YYYY-MM-DD". */
export function localCalendarDay(zone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: AUTOMATION_FALLBACK_TIMEZONE }).format(at);
  }
}

/** Whole calendar days from day `from` to day `to`, both "YYYY-MM-DD". */
export function calendarDaysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Local wall-clock time of an instant, as "HH:mm", in `zone`.
 *
 * This is what the old midnight heuristic looked at, and it no longer decides
 * anything: `due_kind` does. It survives because it is still the right question
 * for CLASSIFYING a legacy row — "what clock time does this land on for the
 * person who owns it" is exactly what the reviewed backfill asks — and because
 * the tests use it to show that the answer differs by zone while overdue-ness
 * now does not.
 */
export function localClockTime(zone: string, at: Date): string {
  const fmt = (z: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: z, hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(at);
  try {
    return fmt(zone);
  } catch {
    return fmt(AUTOMATION_FALLBACK_TIMEZONE);
  }
}

/**
 * Is a task with this deadline overdue, for somebody in this zone, now?
 *
 * ── The author decides, not the value ───────────────────────────────────────
 *
 * `crm_tasks.due_date` is a `timestamp with time zone`: it always carries a
 * time, whether or not anybody chose one. So the column cannot, by itself,
 * distinguish "due on the 15th" from "due at 00:00 on the 15th", and comparing
 * instants would make every date-only task overdue one minute into the very day
 * it is due.
 *
 * This used to be guessed — local midnight meant date-only, any other local
 * time meant timed — and the guess was wrong twice over. It had no way to
 * express "by 00:00 Friday": somebody who genuinely meant that was quietly
 * given until Friday ended. And it was answered in the zone of whoever was
 * asking, so the same stored instant was date-only for a colleague in Manila
 * and timed for one in California. A meaning that changes with the reader is
 * not a meaning.
 *
 * So `due_kind` carries what the author chose, and this reads it:
 *
 *   - **"date"** — the day has to END. `localCalendarDay` names that day in the
 *     assignee's zone, because a day is a local thing.
 *   - **"time"** — the instant has to have PASSED. An instant is the same
 *     everywhere, so no zone is consulted and none is needed.
 *
 * `resolveCrmTaskDueKind` decides what an unset or unrecognised kind means, in
 * one named place, rather than each caller improvising a default.
 *
 * Daylight saving is handled by construction, unchanged. The timed branch
 * compares instants, which have no wall-clock ambiguity. The date branch
 * compares day labels produced by `Intl` in the target zone, which is correct
 * across a transition — including the spring-forward day that has no 02:00 and
 * the autumn day that has two 01:30s.
 */
export function isOverdueInZone(
  zone: string, dueAt: Date, dueKind: unknown, now: Date,
): boolean {
  if (resolveCrmTaskDueKind(dueKind) === "time") {
    return dueAt.getTime() < now.getTime();
  }
  return localCalendarDay(zone, dueAt) < localCalendarDay(zone, now);
}

/**
 * Active staff timezones, by id. An owner is named only by id now — M6 retired
 * the display-name lookup a contact's free-text owner used to need.
 */
async function staffZones(): Promise<{ byId: Map<number, string> }> {
  const rows = await db.select({
    id: crmStaff.id, timezone: crmStaff.timezone, status: crmStaff.status,
  }).from(crmStaff);

  const byId = new Map<number, string>();
  for (const row of rows) {
    if (row.status !== "active") continue;
    byId.set(row.id, row.timezone || AUTOMATION_FALLBACK_TIMEZONE);
  }
  return { byId };
}

// ── What counts as activity on a contact ────────────────────────────────────
//
// Written down ONCE, as a named list, rather than as conditions scattered
// through a query. "Has this contact gone quiet" is a question a person has to
// be able to predict the answer to, and they cannot do that if the definition
// lives in six different WHERE clauses.
//
// The rule behind the list: activity is anything that shows the relationship is
// being worked, from EITHER side. An inbound message is them; an outbound one
// is us; a meeting, a completed task or a deal moving is us doing the work even
// though the contact never saw it. All of them mean the contact is not being
// neglected, which is the only thing this trigger is for.
//
// The last entry is the one that is easy to forget and the one that matters
// most: the contact's own creation. Without it a brand-new contact with no
// history at all looks infinitely silent, and every silence rule fires on every
// lead the moment it is captured.

export const AUTOMATION_ACTIVITY_SOURCES = [
  {
    name: "message",
    what: "Any message on the contact's record — SMS, email or a logged call — in EITHER direction. "
      + "Inbound is them answering; outbound is us reaching out. Both mean the contact is not silent.",
    since: (since: Date) => sql`
      SELECT lead_id, created_at AS at FROM crm_messages
      WHERE lead_id IS NOT NULL AND created_at >= ${since}`,
  },
  {
    name: "timeline",
    what: "Anything on the contact's CRM timeline: a note, a status change, an email logged as sent, "
      + "a task created or completed, a follow-up date moved, a field updated.",
    since: (since: Date) => sql`
      SELECT lead_id, created_at AS at FROM crm_activities
      WHERE created_at >= ${since}`,
  },
  {
    name: "meeting",
    what: "A meeting booked with the contact, and the meeting itself once it has taken place. A "
      + "cancelled meeting still counts as of when it was BOOKED — somebody did something — but its "
      + "start time does not count, because it never happened.",
    since: (since: Date) => sql`
      SELECT lead_id,
             GREATEST(
               created_at,
               CASE WHEN status <> 'cancelled' AND start_at <= now() THEN start_at ELSE created_at END
             ) AS at
      FROM crm_appointments
      WHERE lead_id IS NOT NULL
        AND GREATEST(
              created_at,
              CASE WHEN status <> 'cancelled' AND start_at <= now() THEN start_at ELSE created_at END
            ) >= ${since}`,
  },
  {
    name: "task_completed",
    what: "A task for this contact being completed — work finished on their behalf, whether or not "
      + "they ever saw it.",
    since: (since: Date) => sql`
      SELECT lead_id, completed_at AS at FROM crm_tasks
      WHERE lead_id IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= ${since}`,
  },
  {
    name: "deal",
    what: "A deal on this contact moving. Editing a deal is us working the account.",
    since: (since: Date) => sql`
      SELECT lead_id, updated_at AS at FROM crm_deals
      WHERE lead_id IS NOT NULL AND updated_at >= ${since}`,
  },
  {
    name: "contacted_stamp",
    what: "The contact's own `last_contacted_at` stamp, for touches recorded directly on the record "
      + "rather than as a message.",
    since: (since: Date) => sql`
      SELECT id AS lead_id, last_contacted_at AS at FROM crm_leads
      WHERE last_contacted_at IS NOT NULL AND last_contacted_at >= ${since}`,
  },
  {
    name: "created",
    what: "The contact being captured. THE FLOOR, and the entry that is easy to forget: silence is "
      + "measured from when the contact entered the CRM, not from the beginning of time. Without "
      + "this, a brand-new contact with no history looks infinitely quiet and every silence rule "
      + "fires on it immediately.",
    since: (since: Date) => sql`
      SELECT id AS lead_id, created_at AS at FROM crm_leads
      WHERE created_at >= ${since}`,
  },
] as const;

/**
 * The most recent qualifying activity per contact, for contacts that have had
 * ANY since `since`.
 *
 * A contact with nothing in the window is deliberately absent rather than
 * reported as "silent since the epoch": it has been quiet for longer than this
 * sweep is willing to announce, and see `AUTOMATION_ANNOUNCE_WINDOW_DAYS`.
 */
export async function lastActivityByLead(since: Date): Promise<Map<number, Date>> {
  const union = sql.join(
    AUTOMATION_ACTIVITY_SOURCES.map((source) => source.since(since)),
    sql` UNION ALL `,
  );
  const result = await db.execute<{ lead_id: number; at: Date }>(sql`
    SELECT lead_id, MAX(at) AS at FROM (${union}) AS activity
    WHERE lead_id IS NOT NULL AND at IS NOT NULL
    GROUP BY lead_id`);

  const rows = (result as unknown as { rows?: { lead_id: number; at: Date }[] }).rows
    ?? (result as unknown as { lead_id: number; at: Date }[]);
  const out = new Map<number, Date>();
  for (const row of rows) {
    const at = row.at instanceof Date ? row.at : new Date(String(row.at));
    if (Number.isFinite(at.getTime())) out.set(Number(row.lead_id), at);
  }
  return out;
}

// ── Occurrence identity ─────────────────────────────────────────────────────
//
// The whole point of a periodic sweep is that it runs again in five minutes and
// sees the same thing. What stops that becoming a rule firing 288 times a day
// is the OCCURRENCE KEY: the sweep's answer to "which real-world occurrence is
// this", chosen so that re-evaluating is not just safe but a no-op.

/**
 * One occurrence of "this task is overdue" is ONE TASK, ONE DUE DAY.
 *
 * Not per tick (which would fire every five minutes), and not per day of being
 * late (which would nag daily about something the rule already announced). A
 * task that lapses, is rescheduled and lapses AGAIN has genuinely gone overdue
 * twice, and the new due day gives it a new key — which is right, because
 * missing a deadline you were given a second chance on is a second event.
 * Nudging the time WITHIN the due day does not change the key, because moving a
 * task from 17:00 to 18:00 on the day it was already late is not a new failure.
 */
export function taskOverdueOccurrenceKey(zone: string, taskId: number, dueAt: Date): string {
  return `task_overdue:${taskId}:${localCalendarDay(zone, dueAt)}`;
}

/**
 * One occurrence of "this contact has gone quiet" is ONE SILENCE RUN, per
 * window length.
 *
 * A silence is a gap, and a gap is identified by where it STARTS — the last
 * qualifying activity. So the key is anchored on that instant. Any qualifying
 * activity moves the anchor, which is precisely what makes activity reset the
 * trigger: the contact is no longer in the silence that was announced, and the
 * next one is a different occurrence with a different key.
 *
 * The window length is in the key too, because two rules with different windows
 * are asking different questions about the same contact and both are entitled
 * to an answer.
 */
export function inactivityOccurrenceKey(leadId: number, days: number, lastActivityAt: Date): string {
  return `no_activity_for_days:${leadId}:${days}d:${lastActivityAt.toISOString()}`;
}

// ── How far back a sweep is willing to look ─────────────────────────────────
//
// Switching a rule on must not fire it for two years of history. The first
// sweep after a rule is enabled would otherwise announce every task that ever
// went overdue and every contact that ever went quiet, all at once — which is
// the "it did it a thousand times" failure the engine's three brakes exist to
// prevent, arriving through the front door.
//
// So a sweep announces only what became true RECENTLY. This is the same
// judgement `syncTaskReminder` makes with its 24-hour stale floor, at a longer
// scale because a day boundary is a coarser clock than a reminder time.

/** A task that went overdue longer ago than this is never announced. */
export const AUTOMATION_OVERDUE_ANNOUNCE_WINDOW_DAYS = 30;
/** Silence older than (the rule's window + this) is never announced. */
export const AUTOMATION_ANNOUNCE_WINDOW_DAYS = 30;

/** How many records one sweep will announce, per trigger. A brake, not a page. */
const SWEEP_ANNOUNCE_LIMIT = 200;

// ── Recording an event ──────────────────────────────────────────────────────

export interface RecordEventOptions {
  source?: "producer" | "sweep" | "manual";
  /** Rules this event is for. Null/absent = every rule listening. */
  targetRuleIds?: number[] | null;
  /**
   * The instant the event is recorded at, and therefore the instant it first
   * becomes due. Stamped explicitly rather than left to the column default
   * because the workers take their clock from injected deps — a row defaulted
   * to the database's `now()` while the worker believes it is an hour earlier
   * would sit there looking pending and never be claimed.
   */
  now?: Date;
}

/**
 * Writes one business occurrence down, durably, and returns the row.
 *
 * The occurrence key is FROZEN here. The engine will derive one from the
 * record's own `updated_at` if it is not told, and that derivation must not
 * happen at processing time: a record that changed again in between would
 * produce a different key, and the retry would create a second execution
 * instead of deduplicating against the first.
 *
 * Returns the existing row when this occurrence has already been recorded —
 * the UNIQUE index, not a check-then-insert, decides that.
 */
export async function recordAutomationEvent(
  event: CrmAutomationTriggerEvent,
  options: RecordEventOptions = {},
): Promise<{ event: CrmAutomationEvent; created: boolean } | null> {
  const recordType = CRM_AUTOMATION_TRIGGER_RECORD[event.trigger];
  const recordId = Number(event.payload.recordId);
  if (!recordType || !Number.isFinite(recordId) || recordId <= 0) return null;

  let occurrenceKey = event.occurrenceKey;
  if (!occurrenceKey) {
    // Reading the record costs one query on a path that is already off the
    // request's critical path. If it cannot be read, the key falls back to this
    // row's own recording instant: every RETRY of this row then reuses the
    // stored key and stays idempotent, which is the property that matters. A
    // genuinely separate second recording of the same occurrence would not
    // collapse — the same exposure the engine has always had when the record
    // is unreadable, neither better nor worse.
    const record = await loadAutomationRecord(recordType, recordId).catch(() => null);
    occurrenceKey = record
      ? deriveOccurrenceKey(event.trigger, recordId, record)
      : `${event.trigger}:${recordId}:recorded:${new Date().toISOString()}`;
  }

  const chain: CrmAutomationChain = event.chain ?? { depth: 0, ruleIds: [] };
  const now = options.now ?? new Date();

  const [inserted] = await db.insert(crmAutomationEvents).values({
    trigger: event.trigger,
    recordType,
    recordId,
    occurrenceKey,
    payload: event.payload as unknown as Record<string, unknown>,
    chainDepth: chain.depth,
    chainRuleIds: chain.ruleIds,
    causedByExecutionId: chain.causedByExecutionId ?? null,
    targetRuleIds: options.targetRuleIds ?? null,
    source: options.source ?? "producer",
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({
    target: [
      crmAutomationEvents.trigger, crmAutomationEvents.recordType,
      crmAutomationEvents.recordId, crmAutomationEvents.occurrenceKey,
    ],
  }).returning();

  // An empty `returning()` here is the UNIQUE index refusing a second row for
  // this occurrence — the dedup working, not a failure — so the existing row is
  // read back and reported as "not created".
  if (inserted) return { event: inserted, created: true };

  const [row] = await db.select().from(crmAutomationEvents).where(and(
    eq(crmAutomationEvents.trigger, event.trigger),
    eq(crmAutomationEvents.recordType, recordType),
    eq(crmAutomationEvents.recordId, recordId),
    eq(crmAutomationEvents.occurrenceKey, occurrenceKey),
  )).limit(1);
  return row ? { event: row, created: false } : null;
}

// ── Cancelling an event that stopped being true ─────────────────────────────
//
// A business event cannot un-happen. A lead WAS created; a deal WAS won; the
// record may be edited or deleted afterwards but the occurrence still occurred,
// and the engine handles a missing record itself.
//
// The two SWEEP triggers are different, and this is the asymmetry that has to
// be written down rather than assumed. They describe a STATE, and a state can
// stop being true between the sweep noticing it and the worker acting on it:
// somebody completes the task; somebody replies to the contact. Firing then
// would be the automation telling a person off for something they have just
// done, which is worse than not firing at all.
//
// So a pending sweep event is re-checked immediately before it is emitted, and
// called off — visibly, with a reason — if the thing it was about is no longer
// the case.

type StillTrue = { ok: true } | { ok: false; reason: string };

async function taskOverdueStillTrue(event: CrmAutomationEvent, now: Date): Promise<StillTrue> {
  const [task] = await db.select().from(crmTasks).where(eq(crmTasks.id, event.recordId)).limit(1);
  if (!task) return { ok: false, reason: "the task no longer exists" };
  if (task.status === "completed") {
    return { ok: false, reason: "the task was completed before the rule ran" };
  }
  if (task.archivedAt) return { ok: false, reason: "the task was archived before the rule ran" };
  if (!task.dueDate) return { ok: false, reason: "the task's due date was cleared before the rule ran" };

  const { byId } = await staffZones();
  const zone = (task.assignedToStaffId != null ? byId.get(task.assignedToStaffId) : undefined)
    ?? AUTOMATION_FALLBACK_TIMEZONE;

  if (!isOverdueInZone(zone, task.dueDate, task.dueKind, now)) {
    return { ok: false, reason: "the task's due date moved and it is no longer overdue" };
  }
  const fresh = taskOverdueOccurrenceKey(zone, task.id, task.dueDate);
  if (fresh !== event.occurrenceKey) {
    return {
      ok: false,
      reason: "the task's due date moved to a different day; that is a new occurrence and will be "
        + "announced on its own",
    };
  }
  return { ok: true };
}

async function inactivityStillTrue(event: CrmAutomationEvent, now: Date): Promise<StillTrue> {
  const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, event.recordId)).limit(1);
  if (!lead) return { ok: false, reason: "the contact no longer exists" };

  const days = Number(event.payload["days"]);
  if (!Number.isFinite(days) || days <= 0) {
    return { ok: false, reason: "this event carries no silence window" };
  }

  const since = new Date(now.getTime() - (days + AUTOMATION_ANNOUNCE_WINDOW_DAYS) * 86_400_000);
  const lastActivity = (await lastActivityByLead(since)).get(lead.id) ?? null;
  if (!lastActivity) {
    return { ok: false, reason: "this contact's last activity is now older than the sweep announces" };
  }

  const fresh = inactivityOccurrenceKey(lead.id, days, lastActivity);
  if (fresh !== event.occurrenceKey) {
    return {
      ok: false,
      reason: "activity arrived on this contact after the silence was noticed, so the silence this "
        + "event was about has ended",
    };
  }
  return { ok: true };
}

/**
 * Is this event still worth emitting?
 *
 * Only the sweep triggers can answer no — see the note above. Everything else
 * is a business occurrence that happened, and happened is permanent.
 */
export async function eventStillTrue(event: CrmAutomationEvent, now: Date): Promise<StillTrue> {
  if (!isSweepTrigger(event.trigger)) return { ok: true };
  if (event.trigger === "task_overdue") return taskOverdueStillTrue(event, now);
  return inactivityStillTrue(event, now);
}

// ── Processing an event ─────────────────────────────────────────────────────

async function settleEvent(
  event: CrmAutomationEvent,
  patch: Partial<typeof crmAutomationEvents.$inferInsert>,
  now: Date,
): Promise<void> {
  await db.update(crmAutomationEvents)
    .set({ ...patch, lockedAt: null, lockedBy: null, updatedAt: now })
    .where(eq(crmAutomationEvents.id, event.id));
}

/**
 * What to write in `last_error`.
 *
 * The database driver's own message is the failed statement, which says WHICH
 * write broke and not WHY; the reason — "violates check constraint", "deadlock
 * detected", "permission denied" — is on the cause. An operator reading this
 * column needs the second one, so both are recorded, cause first.
 */
function eventErrorText(err: unknown): string {
  const top = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  return (cause ? `${cause} — ${top}` : top).slice(0, 500);
}

/** Turns one claimed event into executions. Never throws. */
async function emitClaimedEvent(event: CrmAutomationEvent, deps: AutomationDeps): Promise<void> {
  const now = deps.now();

  try {
    // Inside the try on purpose: a re-check that ITSELF fails is a transient
    // fault, not evidence that the event stopped being true, and must lead to a
    // retry rather than to a cancellation nobody asked for.
    const still = await eventStillTrue(event, now);
    if (!still.ok) {
      await settleEvent(event, {
        status: "cancelled", cancelledReason: still.reason, processedAt: now,
      }, now);
      return;
    }

    await emitAutomationTrigger(
      {
        trigger: event.trigger,
        payload: event.payload,
        occurrenceKey: event.occurrenceKey,
        chain: {
          depth: event.chainDepth,
          ruleIds: event.chainRuleIds ?? [],
          causedByExecutionId: event.causedByExecutionId,
        },
      } as CrmAutomationTriggerEvent,
      deps,
      { onlyRuleIds: event.targetRuleIds ?? null },
    );
    await settleEvent(event, { status: "processed", processedAt: now, lastError: null }, now);
  } catch (err) {
    const attempts = event.attempts;
    const message = eventErrorText(err);
    if (attempts >= event.maxAttempts) {
      // Permanently stuck events stay VISIBLE rather than vanishing into logs.
      // A rule that never ran is exactly the thing this table exists to stop
      // being invisible.
      await settleEvent(event, { status: "failed", lastError: message }, now);
      logger.error({ eventId: event.id, trigger: event.trigger, err },
        "automation event gave up after its attempt budget; it is recorded as failed");
      return;
    }
    const delay = EVENT_BACKOFF_MS[Math.min(attempts - 1, EVENT_BACKOFF_MS.length - 1)]
      ?? EVENT_BACKOFF_MS[0]!;
    await settleEvent(event, {
      status: "pending",
      nextAttemptAt: new Date(now.getTime() + delay),
      lastError: message,
    }, now);
  }
}

/**
 * Takes ONE event by id, if it is available, and processes it.
 *
 * The claim is a single conditional UPDATE, so the immediate attempt made by
 * `fireAutomation()` and a worker pass that happens to be running at the same
 * moment cannot both take it: PostgreSQL serialises the row, the loser matches
 * nothing and returns.
 */
export async function processAutomationEvent(
  eventId: number,
  deps: AutomationDeps = defaultAutomationDeps(),
): Promise<"processed" | "skipped"> {
  const now = deps.now();
  const [claimed] = await db.update(crmAutomationEvents).set({
    status: "processing",
    attempts: sql`${crmAutomationEvents.attempts} + 1`,
    lockedAt: now, lockedBy: WORKER_ID, updatedAt: now,
  }).where(and(
    eq(crmAutomationEvents.id, eventId),
    eq(crmAutomationEvents.status, "pending"),
    lte(crmAutomationEvents.nextAttemptAt, now),
  )).returning();

  if (!claimed) return "skipped";
  await emitClaimedEvent(claimed, deps);
  return "processed";
}

/**
 * One pass over recorded events that are due.
 *
 * The same claim the reminder engine makes: `FOR UPDATE SKIP LOCKED`, so two
 * workers never take the same row and neither blocks. A `processing` row whose
 * lease has expired belongs to a process that is gone and is reclaimable — that
 * is what makes an event survive the worker that was holding it being killed.
 */
export async function drainAutomationEvents(
  deps: AutomationDeps = defaultAutomationDeps(),
  limit = EVENT_BATCH,
): Promise<{ claimed: number; processed: number; cancelled: number }> {
  const now = deps.now();
  const staleBefore = new Date(now.getTime() - EVENT_LEASE_MS);

  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.select().from(crmAutomationEvents)
      .where(and(
        lte(crmAutomationEvents.nextAttemptAt, now),
        or(
          eq(crmAutomationEvents.status, "pending"),
          and(
            eq(crmAutomationEvents.status, "processing"),
            lte(crmAutomationEvents.lockedAt, staleBefore),
          ),
        ),
      ))
      .orderBy(asc(crmAutomationEvents.nextAttemptAt), asc(crmAutomationEvents.id))
      .limit(Math.min(Math.max(limit, 1), 500))
      .for("update", { skipLocked: true });

    if (rows.length === 0) return [];
    await tx.update(crmAutomationEvents).set({
      status: "processing",
      // Each row carries its own budget, so the counter is incremented in SQL
      // rather than written from the value this worker happened to read.
      attempts: sql`${crmAutomationEvents.attempts} + 1`,
      lockedAt: now, lockedBy: WORKER_ID, updatedAt: now,
    }).where(inArray(crmAutomationEvents.id, rows.map((r) => r.id)));
    return rows.map((r) => ({ ...r, attempts: r.attempts + 1 }));
  });

  let processed = 0;
  let cancelled = 0;
  for (const event of claimed) {
    await emitClaimedEvent(event, deps);
    const [after] = await db.select({ status: crmAutomationEvents.status })
      .from(crmAutomationEvents).where(eq(crmAutomationEvents.id, event.id)).limit(1);
    if (after?.status === "processed") processed += 1;
    if (after?.status === "cancelled") cancelled += 1;
  }
  return { claimed: claimed.length, processed, cancelled };
}

// ── The sweep ───────────────────────────────────────────────────────────────

export interface SweepResult {
  overdueAnnounced: number;
  inactivityAnnounced: number;
}

/** Rules currently listening for a trigger. */
async function liveRules(trigger: string) {
  return db.select().from(crmAutomationRules).where(and(
    eq(crmAutomationRules.trigger, trigger),
    eq(crmAutomationRules.enabled, true),
    isNull(crmAutomationRules.archivedAt),
  ));
}

/**
 * Announces tasks that have gone overdue.
 *
 * Costs nothing at all when nobody has written a rule for it: the rule lookup
 * comes first and a sweep with no listeners does not read the task table.
 */
async function sweepTaskOverdue(now: Date): Promise<number> {
  const rules = await liveRules("task_overdue");
  if (rules.length === 0) return 0;

  const floor = new Date(now.getTime() - AUTOMATION_OVERDUE_ANNOUNCE_WINDOW_DAYS * 86_400_000);
  const candidates = await db.select().from(crmTasks).where(and(
    ne(crmTasks.status, "completed"),
    isNull(crmTasks.archivedAt),
    // `due_date < now` is a cheap superset: nothing due in the future is
    // overdue in any zone. The day-boundary test below is the real answer.
    lt(crmTasks.dueDate, now),
    gte(crmTasks.dueDate, floor),
  )).orderBy(desc(crmTasks.dueDate)).limit(SWEEP_ANNOUNCE_LIMIT);
  if (candidates.length === 0) return 0;

  const { byId } = await staffZones();
  let announced = 0;

  for (const task of candidates) {
    if (!task.dueDate) continue;
    const zone = (task.assignedToStaffId != null ? byId.get(task.assignedToStaffId) : undefined)
      ?? AUTOMATION_FALLBACK_TIMEZONE;
    if (!isOverdueInZone(zone, task.dueDate, task.dueKind, now)) continue;

    const recorded = await recordAutomationEvent({
      trigger: "task_overdue",
      payload: { recordId: task.id, dueDate: task.dueDate.toISOString() },
      occurrenceKey: taskOverdueOccurrenceKey(zone, task.id, task.dueDate),
    }, { source: "sweep", now });
    // A row that already existed is the dedup working, not a second firing.
    if (recorded?.created) announced += 1;
  }
  return announced;
}

/**
 * Announces contacts that have gone quiet.
 *
 * One event per (contact, window length) rather than per rule: two rules that
 * both wait fourteen days are asking the same question and deserve one answer,
 * while a rule that waits thirty is asking a different one. The event names the
 * rules it is for so a seven-day rule cannot fire on a thirty-day event.
 */
async function sweepNoActivity(now: Date): Promise<number> {
  const rules = await liveRules("no_activity_for_days");
  if (rules.length === 0) return 0;

  const byWindow = new Map<number, number[]>();
  for (const rule of rules) {
    const days = Math.trunc(Number(rule.inactivityDays));
    if (!Number.isFinite(days) || days <= 0) continue;
    byWindow.set(days, [...(byWindow.get(days) ?? []), rule.id]);
  }
  if (byWindow.size === 0) return 0;

  const widest = Math.max(...byWindow.keys());
  const since = new Date(now.getTime() - (widest + AUTOMATION_ANNOUNCE_WINDOW_DAYS) * 86_400_000);
  const lastActivity = await lastActivityByLead(since);
  if (lastActivity.size === 0) return 0;

  const leadRows = await db.select({
    id: crmLeads.id, ownerStaffId: crmLeads.assignedToStaffId,
  }).from(crmLeads).where(inArray(crmLeads.id, [...lastActivity.keys()]));
  const { byId } = await staffZones();

  const today = new Map<string, string>();
  const dayIn = (zone: string) => {
    const cached = today.get(zone);
    if (cached) return cached;
    const day = localCalendarDay(zone, now);
    today.set(zone, day);
    return day;
  };

  let announced = 0;
  for (const lead of leadRows) {
    if (announced >= SWEEP_ANNOUNCE_LIMIT) break;
    const last = lastActivity.get(lead.id);
    if (!last) continue;

    const zone = (lead.ownerStaffId != null ? byId.get(lead.ownerStaffId) : undefined)
      ?? AUTOMATION_FALLBACK_TIMEZONE;
    const silentDays = calendarDaysBetween(localCalendarDay(zone, last), dayIn(zone));

    for (const [days, ruleIds] of byWindow) {
      if (silentDays < days) continue;
      // Older than the announce window: the contact went quiet long before
      // anybody switched this rule on, and announcing it now would be a history
      // dump wearing the word "event".
      if (silentDays > days + AUTOMATION_ANNOUNCE_WINDOW_DAYS) continue;

      const recorded = await recordAutomationEvent({
        trigger: "no_activity_for_days",
        payload: { recordId: lead.id, days },
        occurrenceKey: inactivityOccurrenceKey(lead.id, days, last),
      }, { source: "sweep", targetRuleIds: ruleIds, now });
      if (recorded?.created) announced += 1;
    }
  }
  return announced;
}

/**
 * One sweep over record state.
 *
 * Idempotent by construction: it announces OCCURRENCES, and an occurrence that
 * has already been recorded is refused by the event table's unique index. So
 * running it every five minutes, or every tick, or twice at once, produces the
 * same set of rule executions as running it once.
 */
export async function runAutomationSweep(
  deps: AutomationDeps = defaultAutomationDeps(),
): Promise<SweepResult> {
  const now = deps.now();
  return {
    overdueAnnounced: await sweepTaskOverdue(now),
    inactivityAnnounced: await sweepNoActivity(now),
  };
}

// ── Riding the existing runner ──────────────────────────────────────────────
//
// Both workers are ordinary `crm_scheduled_jobs` rows with a fixed dedupe key.
// They are claimed with the scheduler's own lease, so two processes never sweep
// at once, a killed process's lock expires and is reclaimed, and the whole
// thing is visible on the operations jobs screen like everything else.
//
// The upsert is written here rather than calling `crmScheduler.scheduleJob`
// because that function's `kind` parameter is a closed union owned by that
// module — the same reason `automationEngine.enqueueAutomationJob` is written
// out there. It is also what keeps this file free of any import from
// `crmScheduler.ts`, which would be a cycle: the scheduler imports these
// handlers.

async function rearm(dedupeKey: string, kind: string, runAt: Date): Promise<void> {
  await db.insert(crmScheduledJobs).values({
    kind, dedupeKey, runAt, payload: {},
  }).onConflictDoUpdate({
    target: crmScheduledJobs.dedupeKey,
    set: {
      runAt, status: "pending", attempts: 0,
      lockedAt: null, lockedBy: null, cancelledAt: null, completedAt: null,
      lastError: null, updatedAt: new Date(),
    },
  });
}

/**
 * Creates the two worker rows if they are missing, and revives them if they
 * have come to rest.
 *
 * Deliberately NOT an unconditional upsert. Re-arming a pending sweep on every
 * scheduler tick would reset its `run_at` to now every thirty seconds, which
 * would quietly turn a five-minute sweep into a thirty-second one — the cadence
 * would live in the caller instead of in the constant that claims to set it.
 */
export async function ensureAutomationWorkersScheduled(now: Date = new Date()): Promise<void> {
  const pairs: [string, string][] = [
    [AUTOMATION_SWEEP_JOB_KEY, AUTOMATION_SWEEP_JOB_KIND],
    [AUTOMATION_EVENTS_JOB_KEY, AUTOMATION_EVENTS_JOB_KIND],
  ];
  for (const [dedupeKey, kind] of pairs) {
    await db.insert(crmScheduledJobs)
      .values({ kind, dedupeKey, runAt: now, payload: {} })
      .onConflictDoNothing({ target: crmScheduledJobs.dedupeKey });
    // A worker row that finished, failed or was cancelled is brought back.
    // These two are perpetual by definition: "the sweep completed" is not a
    // state it is allowed to stay in.
    await db.update(crmScheduledJobs).set({
      status: "pending", runAt: now, attempts: 0,
      lockedAt: null, lockedBy: null, cancelledAt: null, completedAt: null, updatedAt: now,
    }).where(and(
      eq(crmScheduledJobs.dedupeKey, dedupeKey),
      inArray(crmScheduledJobs.status, ["completed", "failed", "cancelled"]),
    ));
  }
}

/**
 * The sweep handler, shaped for `crmScheduler`'s `HANDLERS` map.
 *
 * Re-arms itself at the END, exactly as the daily digest does: the next
 * occurrence is scheduled once this one has run, so a restart cannot fan the
 * series out. Moving `run_at` also makes the scheduler's guarded settle match
 * nothing, which correctly leaves the row pending rather than completed.
 */
export async function runAutomationSweepJob(_job: CrmScheduledJob): Promise<void> {
  const deps = defaultAutomationDeps();
  try {
    await runAutomationSweep(deps);
  } finally {
    await rearm(AUTOMATION_SWEEP_JOB_KEY, AUTOMATION_SWEEP_JOB_KIND,
      new Date(deps.now().getTime() + SWEEP_INTERVAL_MS));
  }
}

/** The event-drain handler, same shape and the same self-re-arming contract. */
export async function runAutomationEventsJob(_job: CrmScheduledJob): Promise<void> {
  const deps = defaultAutomationDeps();
  try {
    await drainAutomationEvents(deps);
  } finally {
    await rearm(AUTOMATION_EVENTS_JOB_KEY, AUTOMATION_EVENTS_JOB_KIND,
      new Date(deps.now().getTime() + EVENTS_INTERVAL_MS));
  }
}
