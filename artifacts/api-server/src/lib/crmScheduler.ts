// ── M2: the CRM reminder engine ─────────────────────────────────────────────
//
// A durable job queue in PostgreSQL. The properties that matter, and why each
// one is here rather than assumed:
//
//  - Fires with the browser closed. Nothing about dispatch involves a client;
//    the worker ticks on the server.
//  - Survives a restart. Jobs are rows, not timers. A process that dies
//    mid-job leaves a `running` row whose lock expires and is reclaimed.
//  - Runs a job once at a time. `dedupe_key` is UNIQUE, and claiming uses
//    `FOR UPDATE SKIP LOCKED` so two workers cannot take the same row. That is
//    a statement about THIS database and nothing else: it does not make an
//    external side effect happen once, because a worker can die after the
//    provider has already accepted a message. Nothing here claims exactly-once
//    external delivery: see `docs/crm-ops/DELIVERY-GUARANTEE.md` and the
//    delivery-state section below for what is actually true.
//  - Timezone-correct. `run_at` is absolute UTC computed from the recipient's
//    IANA zone, so "9am" means 9am where that person actually is.
//  - Cancels and reschedules truthfully. Completing, reassigning or moving a
//    task cancels its pending reminder instead of letting a stale one fire.
//  - Failures are visible. Permanent failures stay queryable rather than
//    vanishing into logs.

import { and, asc, desc, eq, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import {
  db, crmScheduledJobs, crmNotifications, crmTasks, crmStaff,
  crmProjects, crmProjectMilestones, crmAppointments, crmAppointmentAttendees,
  type CrmScheduledJob,
} from "@workspace/db";
import {
  trySendStaffMail, staffMailBlockedReason, RESEND_IDEMPOTENCY_WINDOW_MS,
} from "./staffMail.js";

const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** How long a claimed job may stay locked before another worker reclaims it. */
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const BATCH_SIZE = 20;
const TICK_MS = 30_000;

export const JOB_KINDS = ["task_reminder", "milestone_reminder", "daily_digest", "appointment_reminder"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

// ── Timezone helpers ────────────────────────────────────────────────────────
//
// Intl is the only correct way to do this without a dependency: it knows the
// real offset for a zone on a given date, including DST transitions, which a
// fixed offset never does.

/** The UTC offset (minutes) that `zone` had at `instant`. */
function zoneOffsetMinutes(zone: string, instant: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = Object.fromEntries(
      dtf.formatToParts(instant).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const asUtc = Date.UTC(
      Number(parts["year"]), Number(parts["month"]) - 1, Number(parts["day"]),
      Number(parts["hour"] === "24" ? "0" : parts["hour"]), Number(parts["minute"]), Number(parts["second"]),
    );
    return (asUtc - instant.getTime()) / 60_000;
  } catch {
    return 0; // unknown zone → treat as UTC rather than throwing
  }
}

export function isValidTimezone(zone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

/**
 * The UTC instant at which it is `hour:minute` local time in `zone`, on the
 * local calendar day of `onDateUtc`.
 *
 * Computed by converging once: the offset is looked up at the approximate
 * answer, which is correct except for instants inside a DST shift, where the
 * second pass settles it.
 */
export function localTimeToUtc(zone: string, onDateUtc: Date, hour: number, minute = 0): Date {
  const local = new Date(onDateUtc.getTime() + zoneOffsetMinutes(zone, onDateUtc) * 60_000);
  const naive = Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute, 0, 0,
  );
  let guess = new Date(naive - zoneOffsetMinutes(zone, new Date(naive)) * 60_000);
  guess = new Date(naive - zoneOffsetMinutes(zone, guess) * 60_000);
  return guess;
}

/** Calendar-day boundaries in `zone`, returned as absolute UTC instants. */
export function localDayBounds(zone: string, now: Date = new Date()): { start: Date; end: Date } {
  const start = localTimeToUtc(zone, now, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ── Scheduling ──────────────────────────────────────────────────────────────

/**
 * Upserts a job on its dedupe key. Re-scheduling the same logical reminder
 * moves it rather than adding a second one, and a cancelled job is revived
 * rather than duplicated.
 */
export async function scheduleJob(args: {
  kind: JobKind;
  dedupeKey: string;
  runAt: Date;
  payload: Record<string, unknown>;
}): Promise<void> {
  await db.insert(crmScheduledJobs).values({
    kind: args.kind, dedupeKey: args.dedupeKey, runAt: args.runAt, payload: args.payload,
  }).onConflictDoUpdate({
    target: crmScheduledJobs.dedupeKey,
    set: {
      runAt: args.runAt,
      payload: args.payload,
      status: "pending",
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      cancelledAt: null,
      completedAt: null,
      lastError: null,
      updatedAt: new Date(),
    },
  });
}

/** Cancels a pending job. A job already completed is left alone. */
export async function cancelJob(dedupeKey: string): Promise<void> {
  await db.update(crmScheduledJobs)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(crmScheduledJobs.dedupeKey, dedupeKey),
      or(eq(crmScheduledJobs.status, "pending"), eq(crmScheduledJobs.status, "running")),
    ));
}

export const taskReminderKey = (taskId: number) => `task_reminder:${taskId}`;
export const milestoneReminderKey = (id: number) => `milestone_reminder:${id}`;
export const digestKey = (staffId: number, localDate: string) => `daily_digest:${staffId}:${localDate}`;

/**
 * Brings a task's reminder in line with its current state — the one function
 * every task write calls, so a completed, archived, unassigned or
 * reminder-cleared task can never leave a live reminder behind.
 */
export async function syncTaskReminder(taskId: number): Promise<void> {
  const [task] = await db.select().from(crmTasks).where(eq(crmTasks.id, taskId)).limit(1);
  if (!task) { await cancelJob(taskReminderKey(taskId)); return; }

  // A reminder time that has just passed still fires — somebody setting "remind
  // me at 9am" at 9:05 means now, not never. The 24h floor is what stops a
  // backlog of long-stale reminders from all firing at once after a deploy or
  // an import.
  const STALE_FLOOR_MS = 24 * 60 * 60 * 1000;
  const shouldFire = task.status !== "completed"
    && !task.archivedAt
    && task.assignedToStaffId != null
    && task.remindAt != null
    && task.remindAt.getTime() > Date.now() - STALE_FLOOR_MS;

  if (!shouldFire) { await cancelJob(taskReminderKey(taskId)); return; }

  await scheduleJob({
    kind: "task_reminder",
    dedupeKey: taskReminderKey(taskId),
    runAt: task.remindAt!,
    payload: { taskId, staffId: task.assignedToStaffId },
  });
}

// ── Delivery ────────────────────────────────────────────────────────────────

async function notify(args: {
  staffId: number; kind: string; title: string; body?: string | null;
  href?: string | null; entityType?: string | null; entityId?: number | null;
}): Promise<void> {
  await db.insert(crmNotifications).values({
    staffId: args.staffId, kind: args.kind, title: args.title,
    body: args.body ?? null, href: args.href ?? null,
    entityType: args.entityType ?? null, entityId: args.entityId ?? null,
  });
}

// ── External delivery state ─────────────────────────────────────────────────
//
// The bug this replaces: the old code wrote `external_dispatched_at` BEFORE
// calling Resend and treated that marker as proof of delivery. A marker
// written before the request suppresses every future attempt even when the
// provider never accepted anything — so a 500, a dropped connection or a
// timeout silently lost the reminder forever. Preventing duplicates had
// created silent message loss.
//
// The fix is to stop conflating "we tried" with "it went". A delivery attempt
// is written as an ATTEMPTING record before the call and RESOLVED after it,
// and only a resolved success suppresses a later attempt:
//
//   none         nothing has been attempted for this recipient and occurrence
//   attempting   a request is in flight (or its worker was lost mid-call)
//   accepted     the provider took the message — the only state the machine
//                itself may treat as settled
//   rejected     the provider refused it; deterministic, nothing was delivered
//   failed       the provider definitively did not take it, for a passing
//                reason; retrying cannot duplicate, because nothing was taken
//   uncertain    bytes went out and we never learned the answer. May or may
//                not have been delivered. Never retried automatically; stays
//                visible until a human resolves it
//   acknowledged a human looked at an uncertain record and closed it
//
// Where it is stored: `crm_scheduled_jobs.external_ref`, a text column, as one
// newline-separated record per (occurrence, recipient):
//
//     <state>|<runAt ISO>#<staffId>|<attemptId>|<detail>
//
// One record per RECIPIENT, because one job row can email several people: an
// appointment reminder fans out to every staff attendee, and attendee three's
// message must not be suppressed by attendee one's success.
//
// Naming the occurrence is what lets one row carry a recurring reminder:
// yesterday's record cannot suppress today's message, and today's cannot be
// mistaken for yesterday's. `attemptId` is `<n>.<nonce>`, unique per attempt,
// so a worker can only ever resolve the attempt it made itself. `detail` is
// the provider id on success, or a short reason otherwise; `|` and newlines
// are stripped from it, so `|` only ever separates fields and a record always
// parses.
//
// `external_dispatched_at` keeps its old meaning — the instant of the most
// recent hand-off — and is still stamped before the call. It is no longer
// evidence of delivery on its own.
//
// Every write is a read-modify-write with a compare-and-set on the exact
// column value that was read, so two workers can never both believe they own
// an occurrence. See `docs/crm-ops/DELIVERY-GUARANTEE.md`.

/** Every state a delivery record can be in, as written into `external_ref`. */
export const DELIVERY_STATES = [
  "attempting", "accepted", "rejected", "failed", "uncertain", "acknowledged",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export type DeliveryRecord = {
  state: DeliveryState;
  /** The job's `run_at` in ISO form. */
  occurrence: string;
  /** Who the message was for. Null only on rows written before this scheme. */
  staffId: number | null;
  attempt: number;
  attemptId: string | null;
  detail: string;
};

/**
 * The two states that mean "do not hand this occurrence to the provider again
 * for this recipient". `accepted` is the machine's own verdict; `acknowledged`
 * is a human's. Nothing else suppresses — that is the whole point.
 */
const SETTLED_STATES = new Set<DeliveryState>(["accepted", "acknowledged"]);

/** States that still need somebody to look at them. */
const UNRESOLVED_STATES = new Set<DeliveryState>(["attempting", "uncertain", "failed", "rejected"]);

/** In-run retries for the one failure class where a retry cannot duplicate. */
const DELIVERY_RETRY_DELAYS_MS = [250, 1000];

/** How many attempts a read-modify-write makes before giving up its turn. */
const CAS_ATTEMPTS = 4;

/**
 * How many records for OTHER occurrences a row carries. Unresolved records are
 * kept so nothing ambiguous is ever dropped silently; settled ones are pruned
 * because they are answered. Ten is far more than a human will let accumulate,
 * and it bounds the column for a recurring job that fails every day.
 */
const MAX_CARRIED_RECORDS = 10;

const RECORD_SEPARATOR = "\n";

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

function sanitiseDetail(detail: string): string {
  return detail.replace(/[|\r\n]+/g, " ").trim().slice(0, 200);
}

export function formatDeliveryRecord(record: Omit<DeliveryRecord, "attempt">): string {
  const target = record.staffId === null ? record.occurrence : `${record.occurrence}#${record.staffId}`;
  return [record.state, target, record.attemptId ?? "-", sanitiseDetail(record.detail)].join("|");
}

/** Parses `external_ref`. Unrecognisable lines are skipped, never guessed at. */
export function parseDeliveryRecords(ref: string | null | undefined): DeliveryRecord[] {
  if (!ref) return [];
  const records: DeliveryRecord[] = [];
  for (const line of ref.split(RECORD_SEPARATOR)) {
    const parts = line.split("|");
    if (parts.length < 4) continue;
    const state = parts[0] as DeliveryState;
    if (!DELIVERY_STATES.includes(state)) continue;

    const hash = (parts[1] ?? "").lastIndexOf("#");
    const occurrence = hash === -1 ? (parts[1] ?? "") : (parts[1] ?? "").slice(0, hash);
    const staffText = hash === -1 ? null : (parts[1] ?? "").slice(hash + 1);
    const staffId = staffText === null ? null : Number.parseInt(staffText, 10);

    const attemptId = parts[2] === "-" ? null : (parts[2] ?? null);
    const attempt = Number.parseInt((attemptId ?? "").split(".")[0] ?? "", 10);

    records.push({
      state, occurrence,
      staffId: staffId !== null && Number.isFinite(staffId) ? staffId : null,
      attemptId,
      attempt: Number.isFinite(attempt) ? attempt : 0,
      detail: parts.slice(3).join("|"),
    });
  }
  return records;
}

function serialiseDeliveryRecords(records: DeliveryRecord[]): string | null {
  if (records.length === 0) return null;
  return records.map(formatDeliveryRecord).join(RECORD_SEPARATOR);
}

/**
 * Replaces (or adds) one recipient's record, then prunes.
 *
 * Answered records for other occurrences are dropped — they are history.
 * Unanswered ones are kept, because dropping an ambiguous record is exactly
 * the silent loss this whole scheme exists to stop.
 */
function withRecord(records: DeliveryRecord[], next: DeliveryRecord): DeliveryRecord[] {
  const isSame = (r: DeliveryRecord) => r.occurrence === next.occurrence && r.staffId === next.staffId;
  const current = records.filter(isSame).length > 0
    ? records.map((r) => (isSame(r) ? next : r))
    : [...records, next];

  const thisOccurrence = current.filter((r) => r.occurrence === next.occurrence);
  const carried = current
    .filter((r) => r.occurrence !== next.occurrence && UNRESOLVED_STATES.has(r.state))
    .sort((a, b) => b.occurrence.localeCompare(a.occurrence))
    .slice(0, MAX_CARRIED_RECORDS);
  return [...carried, ...thisOccurrence];
}

/**
 * This recipient's record, falling back to an UNATTRIBUTED record for the same
 * occurrence. The fallback matters for inherited rows: a pre-2026-09 marker
 * says "we called and do not know the answer" without saying for whom, so it
 * has to cover every recipient of that occurrence rather than none of them.
 */
function findRecord(
  records: DeliveryRecord[], occurrence: string, staffId: number | null,
): DeliveryRecord | undefined {
  return records.find((r) => r.occurrence === occurrence && r.staffId === staffId)
    ?? records.find((r) => r.occurrence === occurrence && r.staffId === null);
}

export type ReadDeliveryResult = { state: DeliveryState | "none"; legacy: boolean } & Omit<DeliveryRecord, "state">;

/**
 * What we know about delivery to `staffId` for this row's occurrence.
 *
 * Rows written before this scheme are read honestly rather than
 * optimistically. The old code stamped `external_dispatched_at` before the
 * call and wrote `external_ref` only on success, so for an occurrence that
 * marker already covers:
 *   marker + provider id  → the provider accepted it       (`accepted`)
 *   marker, no id         → we called and never wrote down an answer
 *                           (`uncertain`) — exactly the case the old code
 *                           silently treated as delivered.
 */
export function readDeliveryState(
  job: { externalRef: string | null; externalDispatchedAt: Date | null; runAt: Date },
  staffId: number | null,
): ReadDeliveryResult {
  const occurrence = job.runAt.toISOString();
  const records = parseDeliveryRecords(job.externalRef);
  const found = findRecord(records, occurrence, staffId);
  if (found) return { ...found, legacy: false };

  // The column already speaks this language; there is simply no record for
  // this recipient yet.
  if (records.length > 0) {
    return { state: "none", occurrence, staffId, attempt: 0, attemptId: null, detail: "", legacy: false };
  }

  const dispatched = job.externalDispatchedAt;
  if (dispatched && dispatched.getTime() >= job.runAt.getTime()) {
    return job.externalRef
      ? {
          state: "accepted", occurrence, staffId, attempt: 1, attemptId: null,
          detail: job.externalRef, legacy: true,
        }
      : {
          state: "uncertain", occurrence, staffId, attempt: 1, attemptId: null, legacy: true,
          detail: "a pre-2026-09 dispatch marker with no recorded provider answer",
        };
  }
  return { state: "none", occurrence, staffId, attempt: 0, attemptId: null, detail: "", legacy: false };
}

type DeliveryWritePlan = {
  records: DeliveryRecord[];
  lastError?: string | null;
  stampDispatch?: boolean;
};

/**
 * Read-modify-write on the delivery column, compare-and-set on the exact value
 * that was read. `plan` returns the records to write, or null to stand down —
 * which is how a worker that has lost its claim declines to act.
 *
 * A lost compare-and-set means somebody else wrote in between, so the plan is
 * recomputed against the new value rather than applied blindly on top of it.
 */
async function updateDeliveryRecords(
  jobId: number,
  plan: (records: DeliveryRecord[]) => DeliveryWritePlan | null,
): Promise<boolean> {
  for (let round = 0; round < CAS_ATTEMPTS; round += 1) {
    const [row] = await db.select().from(crmScheduledJobs).where(eq(crmScheduledJobs.id, jobId)).limit(1);
    if (!row) return false;

    const decided = plan(parseDeliveryRecords(row.externalRef));
    if (!decided) return false;

    // Built explicitly rather than with a bound null, so PostgreSQL never has
    // to infer the type of a NULL parameter.
    const guard: SQL = row.externalRef === null
      ? sql`${crmScheduledJobs.externalRef} IS NULL`
      : sql`${crmScheduledJobs.externalRef} = ${row.externalRef}`;

    const updated = await db.update(crmScheduledJobs)
      .set({
        externalRef: serialiseDeliveryRecords(decided.records),
        updatedAt: new Date(),
        ...(decided.stampDispatch ? { externalDispatchedAt: new Date() } : {}),
        ...(decided.lastError !== undefined ? { lastError: decided.lastError?.slice(0, 500) ?? null } : {}),
      })
      .where(and(eq(crmScheduledJobs.id, jobId), guard))
      .returning({ id: crmScheduledJobs.id });

    if (updated.length > 0) return true;
  }
  return false;
}

/**
 * Email is opt-in per person and silently skipped when Resend is unconfigured
 * or test mode is on — a reminder must never fail because mail is not set up,
 * and a test run must never reach a real inbox.
 *
 * Sends this occurrence's reminder to one recipient and records what actually
 * happened. Never throws: a mail problem must not fail the job, which would
 * re-run the handler and duplicate the in-app notification.
 *
 * The guarantee, stated plainly: a recipient receives AT MOST ONE copy per
 * occurrence unless a human deliberately retries an `uncertain` one, and
 * receives AT LEAST ONE copy unless the record is left in `rejected`, `failed`
 * or `uncertain` — all three of which are visible to an operator. It is not
 * exactly-once, and `docs/crm-ops/DELIVERY-GUARANTEE.md` says so in full.
 */
async function maybeEmail(
  job: CrmScheduledJob, staffId: number, subject: string, text: string,
): Promise<void> {
  const [staff] = await db.select().from(crmStaff).where(eq(crmStaff.id, staffId)).limit(1);
  if (!staff?.reminderEmailEnabled || staff.status !== "active") return;

  // Nothing can reach a provider in this environment. Deliberately records
  // NOTHING: a marker here would burn the occurrence, and the reminder would
  // never be sent once mail is configured. This is the "failed before the
  // provider call" case, and it must leave no trace.
  if (staffMailBlockedReason()) return;

  const occurrence = job.runAt.toISOString();
  const idempotencyKey = `${job.dedupeKey}:${occurrence}:${staffId}`;

  // The row in hand was read when the batch was claimed. Re-read it: a worker
  // whose lease expired may have written to it since, and so may this job's
  // own previous recipient.
  const [fresh] = await db.select().from(crmScheduledJobs)
    .where(eq(crmScheduledJobs.id, job.id)).limit(1);
  if (!fresh) return;

  const current = readDeliveryState(
    { externalRef: fresh.externalRef, externalDispatchedAt: fresh.externalDispatchedAt, runAt: job.runAt },
    staffId,
  );

  if (current.state !== "none" && SETTLED_STATES.has(current.state)) return;

  if (current.state === "attempting") {
    // An attempt on this occurrence started and never resolved: the worker was
    // killed between handing the message over and writing down the answer, or
    // its lease expired while it was still talking to Resend. We do not know
    // whether a message exists, so we do not create a second one — we make the
    // ambiguity a fact an operator can find.
    const detail = "an attempt started and never resolved (worker lost mid-send)";
    await updateDeliveryRecords(job.id, (records) => {
      const mine = records.find(
        (r) => r.occurrence === occurrence && r.staffId === staffId && r.state === "attempting",
      );
      if (!mine) return null;   // somebody resolved it properly in the meantime
      return {
        records: withRecord(records, { ...mine, state: "uncertain", detail }),
        lastError: `delivery uncertain: ${detail}`,
      };
    });
    return;
  }

  if (current.state === "uncertain") {
    // Never retried automatically. Past Resend's 24h idempotency window a
    // retry genuinely duplicates, and inside it we would still be guessing;
    // either way the decision belongs to a person, not to a timer.
    if (current.legacy) {
      // Promote the inherited marker to a real record so it is queryable. It
      // is written UNATTRIBUTED (`staffId: null`), because the old marker
      // never said who it was for — so it covers every recipient of this
      // occurrence rather than just the first one processed.
      await updateDeliveryRecords(job.id, (records) => {
        if (records.length > 0) return null;
        return {
          records: [{
            state: "uncertain", occurrence, staffId: null, attempt: 1,
            attemptId: null, detail: current.detail,
          }],
          lastError: `delivery uncertain: ${current.detail}`,
        };
      });
    }
    return;
  }

  // Remaining states — `none`, `failed`, `rejected` — all mean the provider
  // demonstrably does not hold a copy of this message, so attempting is safe.
  let attemptNumber = current.attempt;

  for (let round = 0; round <= DELIVERY_RETRY_DELAYS_MS.length; round += 1) {
    attemptNumber += 1;
    const attemptId = `${attemptNumber}.${Math.random().toString(36).slice(2, 8)}`;

    const claimed = await updateDeliveryRecords(job.id, (records) => {
      const mine = findRecord(records, occurrence, staffId);
      // Only an untouched recipient, or one whose last attempt is known not to
      // have reached the provider, may be claimed. Anything else means that
      // between deciding to attempt and claiming, somebody else took this
      // recipient's occurrence over — and sending now would be the double-send
      // this whole scheme exists to prevent.
      const claimable = !mine
        || ((mine.state === "failed" || mine.state === "rejected") && mine.attempt < attemptNumber);
      if (!claimable) return null;
      return {
        records: withRecord(records, {
          state: "attempting", occurrence, staffId, attempt: attemptNumber, attemptId, detail: "",
        }),
        stampDispatch: true,
      };
    });
    if (!claimed) return;

    const outcome = await trySendStaffMail({ to: staff.email, subject, text, idempotencyKey });

    // `not_configured` this late means the environment changed under us. No
    // message was handed over, so it is recorded as a retryable failure rather
    // than as an in-flight attempt.
    const state: DeliveryState = outcome.sent
      ? "accepted"
      : (outcome.failure === "not_configured" ? "failed" : outcome.failure);
    const detail = outcome.sent
      ? (outcome.providerId ?? "accepted without a provider id")
      : outcome.reason;

    // Resolve MY attempt, wherever it currently stands. Another worker whose
    // lease overlapped mine may already have promoted my in-flight record to
    // `uncertain`. That worker was guessing; this one has the answer, so it is
    // allowed to improve its OWN attempt's record — and only its own. A
    // different attempt's verdict, and any settled verdict, is untouchable.
    const wrote = await updateDeliveryRecords(job.id, (records) => {
      const mine = records.find(
        (r) => r.attemptId === attemptId && (r.state === "attempting" || r.state === "uncertain"),
      );
      if (!mine) return null;
      return {
        records: withRecord(records, { ...mine, state, detail }),
        lastError: outcome.sent ? null : `delivery ${state}: ${outcome.reason}`,
      };
    });
    if (!wrote || state !== "failed") return;

    // Only `failed` is retried here, and only because it is the one class
    // where the provider is known NOT to hold the message — so a retry cannot
    // duplicate, and does not lean on Resend's 24h key window at all.
    const delay = DELIVERY_RETRY_DELAYS_MS[round];
    if (delay === undefined) return;
    await sleep(delay);
  }
}

// ── Delivery visibility ─────────────────────────────────────────────────────
//
// An ambiguous delivery that nobody can find is the same as a lost one.

/**
 * Rows holding at least one delivery record that is not a recorded success.
 *
 * Matching on `<state>|` is exact rather than approximate: `|` separates
 * fields and is stripped from every detail, so a state name immediately
 * followed by `|` can only ever be a record's first field.
 */
function deliveryNeedsAttention(): SQL {
  return or(
    ...[...UNRESOLVED_STATES].map((state) => sql`${crmScheduledJobs.externalRef} LIKE ${`%${state}|%`}`),
    // Pre-2026-09 rows: a dispatch marker for this occurrence with no provider
    // answer recorded beside it.
    sql`${crmScheduledJobs.externalRef} IS NULL
        AND ${crmScheduledJobs.externalDispatchedAt} IS NOT NULL
        AND ${crmScheduledJobs.externalDispatchedAt} >= ${crmScheduledJobs.runAt}`,
  )!;
}

export type DeliveryAttentionRow = {
  jobId: number; kind: string; dedupeKey: string; runAt: Date;
  jobStatus: string; dispatchedAt: Date | null;
  /** Who the message was for. Null on rows written before this scheme. */
  staffId: number | null;
  occurrence: string;
  state: DeliveryState | "none"; attempt: number; detail: string; legacy: boolean;
  /** Would Resend still collapse a retry of this exact message? */
  idempotencyProtected: boolean;
  /** What retrying would actually mean right now, in words an operator can act on. */
  guidance: string;
};

function retryGuidance(state: DeliveryState | "none", protectedByKey: boolean): string {
  switch (state) {
    case "attempting":
      return "A send is in flight, or the worker that started it was lost. Wait one worker tick; "
        + "it becomes 'uncertain' if nobody resolves it.";
    case "uncertain":
      return protectedByKey
        ? "The message may or may not have been delivered. A retry within 24 hours of the attempt "
          + "carries the same idempotency key, so Resend collapses it into the original send."
        : "The message may or may not have been delivered, and Resend's 24-hour idempotency window "
          + "has closed — a retry WILL deliver a second copy. Confirm with the recipient first.";
    case "failed":
      return "The provider never took the message, so nothing was delivered and a retry cannot duplicate.";
    case "rejected":
      return "The provider refused the message (address, sending domain or API key). "
        + "Fix the cause; retrying it unchanged will be refused the same way.";
    default:
      return "No provider answer was ever recorded for this occurrence. Treat it as undelivered but unconfirmed.";
  }
}

/**
 * Every reminder delivery that is unresolved or unsuccessful, one entry per
 * recipient, newest row first. `state === "uncertain"` is the answer to
 * "which reminders are in an unknown delivery state?".
 */
export async function listDeliveriesNeedingAttention(limit = 50): Promise<DeliveryAttentionRow[]> {
  const rows = await db.select().from(crmScheduledJobs)
    .where(deliveryNeedsAttention())
    .orderBy(desc(crmScheduledJobs.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 500));

  const now = Date.now();
  // The window runs from the attempt, which is what `external_dispatched_at`
  // records. With no attempt time we cannot claim protection.
  const out: DeliveryAttentionRow[] = [];
  for (const row of rows) {
    const since = row.externalDispatchedAt?.getTime();
    const idempotencyProtected = since !== undefined && now - since <= RESEND_IDEMPOTENCY_WINDOW_MS;
    const base = {
      jobId: row.id, kind: row.kind, dedupeKey: row.dedupeKey, runAt: row.runAt,
      jobStatus: row.status, dispatchedAt: row.externalDispatchedAt, idempotencyProtected,
    };

    const records = parseDeliveryRecords(row.externalRef);
    if (records.length > 0) {
      for (const record of records) {
        if (!UNRESOLVED_STATES.has(record.state)) continue;
        out.push({
          ...base,
          staffId: record.staffId, occurrence: record.occurrence, state: record.state,
          attempt: record.attempt, detail: record.detail, legacy: false,
          guidance: retryGuidance(record.state, idempotencyProtected),
        });
      }
      continue;
    }

    // A row matched only by the legacy clause.
    const legacy = readDeliveryState(
      { externalRef: row.externalRef, externalDispatchedAt: row.externalDispatchedAt, runAt: row.runAt },
      null,
    );
    if (legacy.state === "none" || !UNRESOLVED_STATES.has(legacy.state)) continue;
    out.push({
      ...base,
      staffId: null, occurrence: legacy.occurrence, state: legacy.state,
      attempt: legacy.attempt, detail: legacy.detail, legacy: true,
      guidance: retryGuidance(legacy.state, idempotencyProtected),
    });
  }
  return out;
}

/** How many deliveries need a human, for the operator dashboard's health line. */
export async function countDeliveriesNeedingAttention(): Promise<number> {
  return (await listDeliveriesNeedingAttention(500)).length;
}


async function runTaskReminder(job: CrmScheduledJob): Promise<void> {
  const taskId = Number(job.payload["taskId"]);
  const [task] = await db.select().from(crmTasks).where(eq(crmTasks.id, taskId)).limit(1);
  // The task may have been completed or reassigned between scheduling and now.
  if (!task || task.status === "completed" || task.archivedAt || task.assignedToStaffId == null) return;

  const due = task.dueDate ? ` (due ${task.dueDate.toISOString().slice(0, 10)})` : "";
  await notify({
    staffId: task.assignedToStaffId,
    kind: "task_reminder",
    title: task.title,
    body: `Reminder for your task${due}.`,
    href: "/admin/crm/my-day",
    entityType: "task", entityId: task.id,
  });
  await maybeEmail(job, task.assignedToStaffId, `Reminder: ${task.title}`,
    `This is your SiteMint CRM reminder for "${task.title}"${due}.`);

  // A recurring task schedules its next occurrence only after this one fires,
  // so a paused or completed series cannot run away.
  if (task.recurrence && task.recurrence !== "none" && task.remindAt) {
    const next = new Date(task.remindAt);
    if (task.recurrence === "daily") next.setUTCDate(next.getUTCDate() + 1);
    else if (task.recurrence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
    else if (task.recurrence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
    else return;
    await db.update(crmTasks).set({ remindAt: next, updatedAt: new Date() }).where(eq(crmTasks.id, task.id));
    await scheduleJob({
      kind: "task_reminder", dedupeKey: taskReminderKey(task.id),
      runAt: next, payload: { taskId: task.id, staffId: task.assignedToStaffId },
    });
  }
}

async function runMilestoneReminder(job: CrmScheduledJob): Promise<void> {
  const milestoneId = Number(job.payload["milestoneId"]);
  const [m] = await db.select().from(crmProjectMilestones)
    .where(eq(crmProjectMilestones.id, milestoneId)).limit(1);
  if (!m || m.status === "done") return;
  const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, m.projectId)).limit(1);
  const staffId = project?.ownerStaffId;
  if (!staffId) return;
  await notify({
    staffId, kind: "milestone_reminder", title: `Milestone due: ${m.title}`,
    body: project ? `On ${project.name}.` : null,
    href: "/admin/crm/operations", entityType: "project", entityId: m.projectId,
  });
}

async function runDailyDigest(job: CrmScheduledJob): Promise<void> {
  const staffId = Number(job.payload["staffId"]);
  const [staff] = await db.select().from(crmStaff).where(eq(crmStaff.id, staffId)).limit(1);
  if (!staff || staff.status !== "active" || !staff.dailyDigestEnabled) return;

  const { end } = localDayBounds(staff.timezone);
  const open = await db.select().from(crmTasks).where(and(
    eq(crmTasks.assignedToStaffId, staffId),
    sql`${crmTasks.status} <> 'completed'`,
    isNull(crmTasks.archivedAt),
    lte(crmTasks.dueDate, end),
  ));
  if (open.length === 0) return;

  const overdue = open.filter((t) => t.dueDate && t.dueDate.getTime() < Date.now()).length;
  await notify({
    staffId, kind: "daily_digest",
    title: `${open.length} task${open.length === 1 ? "" : "s"} for today`,
    body: overdue > 0 ? `${overdue} overdue.` : "Nothing overdue.",
    href: "/admin/crm/my-day",
  });
  await maybeEmail(job, staffId, "Your SiteMint CRM day",
    `${open.length} task(s) due today or earlier${overdue > 0 ? `, ${overdue} overdue` : ""}.`);

  // Tomorrow's digest is scheduled once today's has run, so the chain cannot
  // fan out if the worker restarts.
  await scheduleDailyDigest(staffId);
}

export async function scheduleDailyDigest(staffId: number): Promise<void> {
  const [staff] = await db.select().from(crmStaff).where(eq(crmStaff.id, staffId)).limit(1);
  if (!staff) return;
  if (!staff.dailyDigestEnabled || staff.status !== "active") {
    // Cancel any outstanding digest rather than leaving it to fire.
    await db.update(crmScheduledJobs)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(and(
        eq(crmScheduledJobs.kind, "daily_digest"),
        eq(crmScheduledJobs.status, "pending"),
        sql`${crmScheduledJobs.payload} ->> 'staffId' = ${String(staffId)}`,
      ));
    return;
  }
  const now = new Date();
  let runAt = localTimeToUtc(staff.timezone, now, staff.dailyDigestHour, 0);
  if (runAt.getTime() <= now.getTime()) {
    runAt = localTimeToUtc(staff.timezone, new Date(now.getTime() + 24 * 3600_000), staff.dailyDigestHour, 0);
  }
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: staff.timezone }).format(runAt);
  await scheduleJob({
    kind: "daily_digest", dedupeKey: digestKey(staffId, localDate),
    runAt, payload: { staffId },
  });
}

async function runAppointmentReminder(job: CrmScheduledJob): Promise<void> {
  const appointmentId = Number(job.payload["appointmentId"]);
  const [appt] = await db.select().from(crmAppointments)
    .where(eq(crmAppointments.id, appointmentId)).limit(1);
  // It may have been cancelled or completed between scheduling and now.
  if (!appt || appt.status !== "scheduled") return;

  const attendees = await db.select().from(crmAppointmentAttendees)
    .where(eq(crmAppointmentAttendees.appointmentId, appointmentId));
  const staffIds = [...new Set(attendees.map((a) => a.staffId).filter((v): v is number => v != null))];
  const when = appt.startAt.toISOString().slice(11, 16);

  for (const staffId of staffIds) {
    await notify({
      staffId, kind: "appointment_reminder", title: appt.title,
      body: `Starts at ${when} UTC${appt.location ? ` · ${appt.location}` : ""}.`,
      href: "/admin/crm/calendar", entityType: "appointment", entityId: appt.id,
    });
    await maybeEmail(job, staffId, `Reminder: ${appt.title}`,
      `${appt.title} starts at ${when} UTC.${appt.location ? ` Location: ${appt.location}.` : ""}`);
  }
}

const HANDLERS: Record<string, (job: CrmScheduledJob) => Promise<void>> = {
  appointment_reminder: runAppointmentReminder,
  task_reminder: runTaskReminder,
  milestone_reminder: runMilestoneReminder,
  daily_digest: runDailyDigest,
};

// ── The worker ──────────────────────────────────────────────────────────────

/**
 * Claims a batch of due jobs. `FOR UPDATE SKIP LOCKED` is what makes several
 * workers safe: a row another worker is claiming is skipped rather than waited
 * for, so no job is handed out twice and no worker blocks.
 *
 * A `running` row whose lock is older than LOCK_TIMEOUT_MS is reclaimable —
 * that is how a job survives the process that was running it being killed.
 */
async function claimDueJobs(limit = BATCH_SIZE): Promise<CrmScheduledJob[]> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(crmScheduledJobs)
      .where(and(
        lte(crmScheduledJobs.runAt, now),
        isNull(crmScheduledJobs.cancelledAt),
        or(
          eq(crmScheduledJobs.status, "pending"),
          and(eq(crmScheduledJobs.status, "running"), lte(crmScheduledJobs.lockedAt, staleBefore)),
        ),
      ))
      .orderBy(asc(crmScheduledJobs.runAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    await tx.update(crmScheduledJobs)
      .set({ status: "running", lockedAt: now, lockedBy: WORKER_ID, updatedAt: now })
      .where(inArray(crmScheduledJobs.id, ids));
    return rows;
  });
}

async function settle(job: CrmScheduledJob, error?: unknown): Promise<void> {
  const now = new Date();
  if (!error) {
    // Guarded on the runAt we claimed. A recurring handler re-arms the SAME
    // row for its next occurrence, and that write moves runAt — so this update
    // matches nothing and correctly leaves the job pending instead of marking
    // the series finished.
    await db.update(crmScheduledJobs)
      .set({ status: "completed", completedAt: now, lockedAt: null, lockedBy: null, updatedAt: now })
      .where(and(eq(crmScheduledJobs.id, job.id), eq(crmScheduledJobs.runAt, job.runAt)));
    return;
  }
  const attempts = job.attempts + 1;
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  if (attempts >= job.maxAttempts) {
    // Permanently failed jobs stay queryable — see GET /crm/ops/jobs/failures.
    await db.update(crmScheduledJobs)
      .set({ status: "failed", attempts, lastError: message, lockedAt: null, lockedBy: null, updatedAt: now })
      .where(eq(crmScheduledJobs.id, job.id));
    return;
  }
  const backoffMs = Math.min(30_000 * 2 ** (attempts - 1), 60 * 60_000);
  await db.update(crmScheduledJobs)
    .set({
      status: "pending", attempts, lastError: message,
      runAt: new Date(now.getTime() + backoffMs),
      lockedAt: null, lockedBy: null, updatedAt: now,
    })
    .where(eq(crmScheduledJobs.id, job.id));
}

/** One pass. Exported so tests can drive the queue deterministically. */
export async function processDueJobs(): Promise<{ processed: number; failed: number }> {
  const jobs = await claimDueJobs();
  let failed = 0;
  for (const job of jobs) {
    const handler = HANDLERS[job.kind];
    if (!handler) { await settle(job, new Error(`unknown job kind: ${job.kind}`)); failed++; continue; }
    try {
      await handler(job);
      await settle(job);
    } catch (err) {
      failed++;
      await settle(job, err);
    }
  }
  return { processed: jobs.length, failed };
}

let timer: NodeJS.Timeout | undefined;
const status = {
  lastTickAt: null as Date | null,
  lastError: null as string | null,
  processed: 0,
  /**
   * Reminders whose external delivery is unresolved or unsuccessful, refreshed
   * each tick. Carried here so the count reaches the operator dashboard
   * through the scheduler block that `GET /crm/operations/jobs` already
   * returns; `listDeliveriesNeedingAttention()` has the detail.
   */
  deliveriesNeedingAttention: null as number | null,
  deliveriesCheckedAt: null as Date | null,
};

export function getSchedulerStatus() {
  return { ...status, running: timer !== undefined, workerId: WORKER_ID, tickMs: TICK_MS };
}

export function startCrmScheduler(intervalMs = TICK_MS): void {
  if (timer) return;
  const tick = async () => {
    try {
      const r = await processDueJobs();
      status.processed += r.processed;
      status.lastError = null;
      status.deliveriesNeedingAttention = await countDeliveriesNeedingAttention();
      status.deliveriesCheckedAt = new Date();
    } catch (err) {
      status.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      status.lastTickAt = new Date();
    }
  };
  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
}

export function stopCrmScheduler(): void {
  if (timer) { clearInterval(timer); timer = undefined; }
}
