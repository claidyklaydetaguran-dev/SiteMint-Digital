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
//    external-delivery section below for what is actually true.
//  - Timezone-correct. `run_at` is absolute UTC computed from the recipient's
//    IANA zone, so "9am" means 9am where that person actually is.
//  - Cancels and reschedules truthfully. Completing, reassigning or moving a
//    task cancels its pending reminder instead of letting a stale one fire.
//  - Failures are visible. Permanent failures stay queryable rather than
//    vanishing into logs.
//  - Delivery is a separate lifecycle from the job. A message handed to the
//    mail provider gets its own row in `crm_reminder_deliveries`, with its own
//    clock (`next_attempt_at`) and its own recovery actions — so a retry never
//    has to move a job's `run_at`, which is the occurrence identity.

import { and, asc, desc, eq, inArray, isNull, isNotNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import {
  db, crmScheduledJobs, crmNotifications, crmTasks, crmStaff,
  crmProjects, crmProjectMilestones, crmAppointments, crmAppointmentAttendees,
  crmReminderDeliveries, crmDeliveryRecoveryActions,
  type CrmScheduledJob, type CrmReminderDelivery, type CrmDeliveryState,
  type CrmDeliveryRecoveryAction, type CrmDeliveryRecoveryActionRow,
} from "@workspace/db";
import {
  trySendStaffMail, staffMailBlockedReason, RESEND_IDEMPOTENCY_WINDOW_MS,
  type MailOutcome,
} from "./staffMail.js";
import { AUTOMATION_JOB_KIND, runAutomationJob } from "./automationEngine.js";
import {
  AUTOMATION_SWEEP_JOB_KIND, AUTOMATION_EVENTS_JOB_KIND,
  runAutomationSweepJob, runAutomationEventsJob, ensureAutomationWorkersScheduled,
  isOverdueInZone,
} from "./automationSweep.js";
import { startDueCampaigns, marketingAutosendEnabled } from "../routes/crmMarketing.js";
import { processDueSupportDeliveries, ingestSupportReplies } from "./supportDelivery.js";
import { logger } from "./logger.js";

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

/**
 * The identity of one in-app notification: the OCCURRENCE and the PERSON.
 *
 * Not the job id — a recurring reminder is one job row across many
 * occurrences — and not "has this job run", which is precisely what an
 * operator retry undoes. Two attempts at the same occurrence for the same
 * person are the same notification; next week's is a different one.
 */
export function notificationOccurrenceKey(job: CrmScheduledJob, staffId: number, kind: string): string {
  return `${job.dedupeKey}:${job.runAt.toISOString()}:${staffId}:${kind}`;
}

/**
 * Writes one in-app notification.
 *
 * With an `occurrenceKey`, a second write for the same occurrence and person
 * is dropped by the database (partial unique index) rather than by whichever
 * caller happened to remember. Without one — a notification that is not a
 * scheduled reminder — nothing is deduplicated, which is correct: two
 * assignments really are two events.
 */
async function notify(args: {
  staffId: number; kind: string; title: string; body?: string | null;
  href?: string | null; entityType?: string | null; entityId?: number | null;
  occurrenceKey?: string | null;
}): Promise<void> {
  await db.insert(crmNotifications).values({
    staffId: args.staffId, kind: args.kind, title: args.title,
    body: args.body ?? null, href: args.href ?? null,
    entityType: args.entityType ?? null, entityId: args.entityId ?? null,
    occurrenceKey: args.occurrenceKey ?? null,
  }).onConflictDoNothing();
}

// ── External delivery ───────────────────────────────────────────────────────
//
// The bug this replaces, in two parts.
//
// FIRST: the original code wrote `external_dispatched_at` BEFORE calling Resend
// and treated that marker as proof of delivery. A marker written before a
// request proves only that a request was started, so a 500, a dropped
// connection or a timeout silently lost the reminder forever. Preventing
// duplicates had created silent message loss.
//
// SECOND: the fix for that packed one record per (occurrence, recipient) into
// `crm_scheduled_jobs.external_ref` as newline-separated text. The state
// machine was right; the storage was not. Per-recipient queries became
// substring matches, every write became a read-modify-write of one column, and
// the column had to be capped — which meant unresolved history could be
// discarded to make room. A record nobody can find is a record that was lost.
//
// Delivery state now lives in `crm_reminder_deliveries`, one row per
// (occurrence, recipient), UNIQUE on exactly that. `external_ref` and
// `external_dispatched_at` are read once to migrate what they hold and are
// never written again; they are not cleared, so the original text survives.
//
// The identity rule that everything else hangs off: `occurrence_at` is the
// job's ORIGINAL `run_at` and NEVER changes. `next_attempt_at` is the separate
// thing a retry moves. The old operator retry moved `run_at`, which silently
// made a different occurrence with a different idempotency key — an
// unprotected duplicate send wearing the word "retry".

/** How long an `attempting` row may sit before it is presumed worker-lost. */
const DELIVERY_LEASE_MS = 5 * 60 * 1000;

/**
 * Waits between AUTOMATIC attempts, and the cap on them.
 *
 * These are durable (`next_attempt_at`), not an in-process sleep: a worker that
 * dies between attempts loses nothing, and a retry does not hold a job handler
 * open. Only the one failure class that PROVES nothing was sent ever gets here.
 */
const DELIVERY_RETRY_BACKOFF_MS = [30_000, 120_000, 600_000];
const MAX_AUTO_ATTEMPTS = 3;

/** How many due deliveries one worker pass claims. */
const DELIVERY_BATCH = 50;

// ── Classifying an outcome, conservatively ──────────────────────────────────
//
// This is the most consequential judgement in the whole path: read an unknown
// outcome as "not sent" and you duplicate somebody's mail; read a real failure
// as "sent" and you lose it silently.
//
// `staffMail.ts` classifies into four `MailFailure` classes, and its `failed`
// class lumps together two things this layer must keep apart:
//
//   * a connection that never opened — the request was never written to a
//     socket, so no message can exist anywhere; and
//   * a 5xx or a rate-limit ANSWER — which means the request was written, the
//     provider received it, and only then something went wrong on its side.
//
// A 5xx does NOT prove no side effect occurred. The provider may have taken
// the message and failed to answer about it. So this layer re-reads `failed`
// and only calls it "provably not sent" when the reason names a transport code
// that rules the request out. Everything else the provider had a chance to see
// is UNKNOWN, and unknown is never retried automatically.
//
// The cost of being wrong in this direction is an operator row; the cost of
// being wrong the other way is a duplicate in somebody's inbox. A follow-up
// worth doing: have `trySendStaffMail` carry the provider `statusCode` and the
// transport `code` on its outcome, so this becomes exact rather than a match
// on the reason text. Where the evidence is absent, `uncertain` is chosen.

/**
 * Transport codes that prove the request never reached the provider's server.
 * Mirrors `NEVER_LEFT_CODES` in `staffMail.ts`; kept here because the outcome
 * this layer receives has already been collapsed to a class and a string.
 */
const NEVER_LEFT_CODES = [
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH",
  "ERR_INVALID_URL", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID",
] as const;

/** Does this reason name a transport failure that rules out any side effect? */
export function provesNothingWasSent(reason: string): boolean {
  const upper = reason.toUpperCase();
  return NEVER_LEFT_CODES.some((code) => upper.includes(code));
}

/** Short machine reasons, so the UI and the tests agree on one vocabulary. */
export const DELIVERY_FAILURE_REASONS = {
  notConfigured: "mail_not_configured",
  neverLeft: "never_left_this_server",
  refused: "provider_refused",
  answeredUnknown: "provider_answered_but_outcome_unknown",
  noAnswer: "no_answer_from_provider",
  workerLost: "worker_lost_mid_send",
  recipientUnavailable: "recipient_unavailable",
  legacyUnparsed: "unparsed_legacy_record",
  legacyMarker: "pre_2026_09_dispatch_marker",
} as const;

export type DeliveryClassification = {
  state: CrmDeliveryState;
  reason: string;
  detail: string;
  providerRef: string | null;
  /** May the worker try this again by itself, without a person deciding? */
  autoRetryable: boolean;
};

/**
 * The exact mapping, stated once:
 *
 * | outcome                                   | state       | auto-retry |
 * |-------------------------------------------|-------------|------------|
 * | sent                                      | `accepted`  | n/a        |
 * | `not_configured`                          | `pending`   | yes        |
 * | `rejected` (the provider answered "no")   | `refused`   | no         |
 * | `failed`, reason names a never-left code  | `pending`   | yes        |
 * | `failed`, anything else (5xx, rate limit) | `uncertain` | **no**     |
 * | `uncertain` (timeout, hang-up, 409 race)  | `uncertain` | no         |
 */
export function classifyDeliveryOutcome(outcome: MailOutcome): DeliveryClassification {
  if (outcome.sent) {
    return {
      state: "accepted", reason: "", providerRef: outcome.providerId,
      detail: outcome.providerId ?? "accepted without a provider id",
      autoRetryable: false,
    };
  }

  if (outcome.failure === "not_configured") {
    // `trySendStaffMail` returns this before it constructs a request, so
    // nothing was handed over and a retry cannot duplicate.
    return {
      state: "pending", reason: DELIVERY_FAILURE_REASONS.notConfigured,
      detail: outcome.reason, providerRef: null, autoRetryable: true,
    };
  }

  if (outcome.failure === "rejected") {
    return {
      state: "refused", reason: DELIVERY_FAILURE_REASONS.refused,
      detail: outcome.reason, providerRef: null, autoRetryable: false,
    };
  }

  if (outcome.failure === "failed" && provesNothingWasSent(outcome.reason)) {
    return {
      state: "pending", reason: DELIVERY_FAILURE_REASONS.neverLeft,
      detail: outcome.reason, providerRef: null, autoRetryable: true,
    };
  }

  // Everything the provider had a chance to see. A 5xx arrives here: the
  // request WAS written, so "it did not go" is a guess, not a fact.
  return {
    state: "uncertain",
    reason: outcome.failure === "failed"
      ? DELIVERY_FAILURE_REASONS.answeredUnknown
      : DELIVERY_FAILURE_REASONS.noAnswer,
    detail: outcome.reason, providerRef: null, autoRetryable: false,
  };
}

// ── Identity ────────────────────────────────────────────────────────────────

/**
 * The provider idempotency key for one recipient's copy of one occurrence.
 *
 * Per occurrence AND per recipient: two attendees of the same appointment get
 * different messages, and reusing one key across them is exactly the "same key,
 * different payload" that Resend answers with `invalid_idempotent_request`.
 *
 * Stable across every retry of this delivery. A deliberate re-send appends a
 * suffix, because a re-send is a request for a second copy and must not be
 * collapsed into the first.
 */
export function deliveryIdempotencyKey(dedupeKey: string, occurrence: Date, recipient: string): string {
  return `${dedupeKey}:${occurrence.toISOString()}:${recipient}`;
}

const nonce = () => Math.random().toString(36).slice(2, 8);

// ── Reading what was there before ───────────────────────────────────────────
//
// The packed format, for migration only. Nothing writes it any more.
//
//     <state>|<runAt ISO>#<staffId>|<attemptId>|<detail>
//
// A record with no `#` is unattributed: pre-2026-09 markers were written that
// way because the old marker never recorded who it was for.

const LEGACY_STATES = ["attempting", "accepted", "rejected", "failed", "uncertain", "acknowledged"] as const;
type LegacyState = (typeof LEGACY_STATES)[number];

export type LegacyDeliveryRecord = {
  state: LegacyState;
  occurrence: string;
  staffId: number | null;
  attempt: number;
  detail: string;
  /** The line exactly as it was stored. */
  raw: string;
};

/**
 * Parses `external_ref`. A line that does not parse is NOT skipped and NOT
 * guessed at — it comes back as `unparsed` so the migration can preserve it
 * and mark it for a person. Dropping an unreadable delivery record is the same
 * silent loss this whole scheme exists to stop.
 */
export function parseLegacyDeliveryRecords(
  ref: string | null | undefined,
): { parsed: LegacyDeliveryRecord[]; unparsed: string[] } {
  const parsed: LegacyDeliveryRecord[] = [];
  const unparsed: string[] = [];
  if (!ref) return { parsed, unparsed };

  for (const line of ref.split("\n")) {
    if (line.trim() === "") continue;
    const parts = line.split("|");
    const state = parts[0] as LegacyState;
    if (parts.length < 4 || !LEGACY_STATES.includes(state)) { unparsed.push(line); continue; }

    const target = parts[1] ?? "";
    const hash = target.lastIndexOf("#");
    const occurrence = hash === -1 ? target : target.slice(0, hash);
    const staffText = hash === -1 ? null : target.slice(hash + 1);
    const staffId = staffText === null ? Number.NaN : Number.parseInt(staffText, 10);
    const attempt = Number.parseInt((parts[2] ?? "").split(".")[0] ?? "", 10);

    if (occurrence === "" || Number.isNaN(Date.parse(occurrence))) { unparsed.push(line); continue; }

    parsed.push({
      state, occurrence,
      staffId: Number.isFinite(staffId) ? staffId : null,
      attempt: Number.isFinite(attempt) ? attempt : 1,
      detail: parts.slice(3).join("|"),
      raw: line,
    });
  }
  return { parsed, unparsed };
}

/**
 * How a legacy record reads under the current, conservative rules.
 *
 * The interesting one is legacy `failed`. The old classifier called a 5xx
 * "definitely not taken"; this one does not, because a 5xx is an answer from a
 * server that had already received the request. So a legacy `failed` is put
 * through the SAME test as a live outcome — if its detail names a transport
 * code that rules the request out it stays retryable, and otherwise it becomes
 * `uncertain`. One rule, applied to old records and new ones alike.
 */
function legacyToState(record: LegacyDeliveryRecord): { state: CrmDeliveryState; reason: string } {
  switch (record.state) {
    case "accepted":
      return { state: "accepted", reason: "" };
    case "rejected":
      return { state: "refused", reason: DELIVERY_FAILURE_REASONS.refused };
    case "attempting":
      // Any attempt still in flight at migration time belongs to a process
      // that is gone.
      return { state: "uncertain", reason: DELIVERY_FAILURE_REASONS.workerLost };
    case "failed":
      return provesNothingWasSent(record.detail)
        ? { state: "pending", reason: DELIVERY_FAILURE_REASONS.neverLeft }
        : { state: "uncertain", reason: DELIVERY_FAILURE_REASONS.answeredUnknown };
    case "acknowledged":
    case "uncertain":
    default:
      return { state: "uncertain", reason: DELIVERY_FAILURE_REASONS.noAnswer };
  }
}

type LegacySeed = {
  state: CrmDeliveryState;
  attempt: number;
  reason: string;
  detail: string;
  providerRef: string | null;
  origin: "migrated" | "migrated_unattributed";
  legacyRaw: string | null;
  resolution: "acknowledged" | null;
};

/**
 * What the packed column says about ONE recipient of ONE occurrence, or null
 * when it says nothing.
 *
 * An unattributed record falls through to every recipient of its occurrence,
 * because that is all the old marker ever meant. A pre-2026-09 marker with a
 * provider id beside it is read as `accepted`; one with no id is read as
 * `uncertain`, which is exactly the case the old code silently treated as
 * delivered.
 */
function legacySeedFor(
  job: Pick<CrmScheduledJob, "externalRef" | "externalDispatchedAt" | "runAt">,
  staffId: number | null,
): LegacySeed | null {
  const occurrence = job.runAt.toISOString();
  const { parsed } = parseLegacyDeliveryRecords(job.externalRef);

  const match = parsed.find((r) => r.occurrence === occurrence && r.staffId === staffId)
    ?? parsed.find((r) => r.occurrence === occurrence && r.staffId === null);

  if (match) {
    const mapped = legacyToState(match);
    return {
      state: mapped.state,
      attempt: match.attempt,
      reason: mapped.reason,
      detail: match.detail,
      providerRef: match.state === "accepted" ? match.detail || null : null,
      origin: match.staffId === null ? "migrated_unattributed" : "migrated",
      legacyRaw: match.raw,
      resolution: match.state === "acknowledged" ? "acknowledged" : null,
    };
  }

  // The column speaks the packed language but has nothing for this occurrence.
  if (parsed.length > 0) return null;

  const dispatched = job.externalDispatchedAt;
  if (!dispatched || dispatched.getTime() < job.runAt.getTime()) return null;

  const bareId = (job.externalRef ?? "").trim();
  return bareId
    ? {
        state: "accepted", attempt: 1, reason: "", detail: bareId, providerRef: bareId,
        origin: "migrated_unattributed", legacyRaw: bareId, resolution: null,
      }
    : {
        state: "uncertain", attempt: 1, reason: DELIVERY_FAILURE_REASONS.legacyMarker,
        detail: "a pre-2026-09 dispatch marker with no recorded provider answer",
        providerRef: null, origin: "migrated_unattributed", legacyRaw: null, resolution: null,
      };
}

// ── The delivery row ────────────────────────────────────────────────────────

const WORKER_LOST_DETAIL =
  "an attempt started and never resolved; the worker that made it is gone";

/**
 * The delivery record for one recipient of this occurrence, creating it if it
 * does not exist.
 *
 * Two things make this safe to call from anywhere:
 *  - the insert is guarded by the UNIQUE (job, occurrence, recipient) index,
 *    so two workers racing to create the same record produce one row; and
 *  - a brand-new record is SEEDED from whatever the packed column said about
 *    this occurrence, so a message the old scheme already sent is never sent
 *    again, whether or not the bulk migration has run yet.
 *
 * An UNATTRIBUTED inherited record for this occurrence is returned in place of
 * a per-recipient one: the old marker never said who it was for, so it has to
 * cover everybody rather than nobody.
 */
async function ensureDeliveryRow(
  job: CrmScheduledJob, staffId: number, subject: string, body: string,
): Promise<CrmReminderDelivery | undefined> {
  const occurrence = job.runAt;

  const existing = await db.select().from(crmReminderDeliveries).where(and(
    eq(crmReminderDeliveries.jobId, job.id),
    eq(crmReminderDeliveries.occurrenceAt, occurrence),
    or(
      eq(crmReminderDeliveries.recipientStaffId, staffId),
      and(isNull(crmReminderDeliveries.recipientStaffId), isNull(crmReminderDeliveries.recipientAddress)),
    ),
  )).limit(2);

  // Prefer this recipient's own record; fall back to an unattributed one.
  const mine = existing.find((r) => r.recipientStaffId === staffId) ?? existing[0];
  if (mine) return mine;

  const seed = legacySeedFor(job, staffId);
  const key = deliveryIdempotencyKey(job.dedupeKey, occurrence, String(staffId));

  await db.insert(crmReminderDeliveries).values({
    jobId: job.id,
    occurrenceAt: occurrence,
    // A seeded unattributed record keeps its "we do not know who" honestly.
    recipientStaffId: seed?.origin === "migrated_unattributed" ? null : staffId,
    subject, body,
    idempotencyKey: key,
    state: seed?.state ?? "pending",
    attempt: seed?.attempt ?? 0,
    // Only a pending row may carry a scheduled attempt.
    nextAttemptAt: (seed?.state ?? "pending") === "pending" ? new Date() : null,
    providerRef: seed?.providerRef ?? null,
    failureReason: seed?.reason || null,
    failureDetail: seed?.detail || null,
    origin: seed?.origin ?? "live",
    legacyRaw: seed?.legacyRaw ?? null,
    ...(seed?.resolution
      ? {
          resolution: seed.resolution,
          resolvedAt: new Date(),
          resolutionNote:
            "migrated from the packed external_ref column; the original acknowledgement recorded no actor",
        }
      : {}),
  }).onConflictDoNothing();

  const [row] = await db.select().from(crmReminderDeliveries).where(and(
    eq(crmReminderDeliveries.jobId, job.id),
    eq(crmReminderDeliveries.occurrenceAt, occurrence),
    or(
      eq(crmReminderDeliveries.recipientStaffId, staffId),
      and(isNull(crmReminderDeliveries.recipientStaffId), isNull(crmReminderDeliveries.recipientAddress)),
    ),
  )).limit(1);
  return row;
}

/**
 * Takes this delivery, or does not.
 *
 * One conditional UPDATE, so two workers cannot both take it: PostgreSQL
 * serialises the row, the loser re-evaluates its WHERE against the winner's
 * committed state, matches nothing, and returns empty. There is no window
 * between checking and claiming because there is no separate check.
 */
async function claimDelivery(id: number): Promise<CrmReminderDelivery | undefined> {
  const [row] = await db.update(crmReminderDeliveries).set({
    state: "attempting",
    attempt: sql`${crmReminderDeliveries.attempt} + 1`,
    attemptStartedAt: new Date(),
    attemptWorker: WORKER_ID,
    nextAttemptAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(crmReminderDeliveries.id, id),
    eq(crmReminderDeliveries.state, "pending"),
    isNull(crmReminderDeliveries.resolvedAt),
    isNotNull(crmReminderDeliveries.nextAttemptAt),
    lte(crmReminderDeliveries.nextAttemptAt, new Date()),
  )).returning();
  return row;
}

/**
 * Writes down what the provider actually said, for the attempt THIS worker
 * made and no other.
 *
 * The guard matches on the attempt number and worker id, so a worker whose
 * lease expired — and whose in-flight record another worker has already
 * promoted to `uncertain` — may still improve its own guess to the real
 * answer, and may never touch a different attempt's verdict.
 */
async function settleDelivery(claimed: CrmReminderDelivery, outcome: MailOutcome): Promise<void> {
  const verdict = classifyDeliveryOutcome(outcome);
  const now = new Date();

  const nextAttemptAt = verdict.state === "pending" && verdict.autoRetryable
    && claimed.attempt < MAX_AUTO_ATTEMPTS
    ? new Date(now.getTime() + (DELIVERY_RETRY_BACKOFF_MS[claimed.attempt - 1] ?? 0))
    : null;

  // A recovery a person asked for, which then succeeded, closes the case and is
  // attributed to them. An ordinary first-time success closes nothing, because
  // nobody had to do anything.
  const closes = verdict.state === "accepted"
    && claimed.resolvedAt === null
    && (claimed.lastRecoveryAction === "retry" || claimed.lastRecoveryAction === "resend");

  await db.update(crmReminderDeliveries).set({
    state: verdict.state,
    nextAttemptAt,
    attemptStartedAt: null,
    attemptWorker: null,
    providerRef: verdict.providerRef ?? claimed.providerRef,
    failureReason: verdict.state === "accepted" ? null : verdict.reason,
    failureDetail: verdict.state === "accepted" ? null : verdict.detail.slice(0, 500),
    updatedAt: now,
    ...(closes
      ? {
          resolution: claimed.lastRecoveryAction === "resend" ? "resent" as const : "accepted" as const,
          resolvedAt: now,
          resolvedByStaffId: claimed.lastRecoveryByStaffId,
          resolutionNote: claimed.lastRecoveryAction === "resend"
            ? "a deliberate new copy was accepted by the provider"
            : "a retry carrying the original idempotency key was accepted by the provider",
        }
      : {}),
  }).where(and(
    eq(crmReminderDeliveries.id, claimed.id),
    eq(crmReminderDeliveries.attempt, claimed.attempt),
    eq(crmReminderDeliveries.attemptWorker, WORKER_ID),
    or(eq(crmReminderDeliveries.state, "attempting"), eq(crmReminderDeliveries.state, "uncertain")),
  ));

  // Surface the outcome where operators already look. Only for this job's most
  // recent word on the matter; it is a convenience, not the record.
  await db.update(crmScheduledJobs).set({
    lastError: verdict.state === "accepted" ? null : `delivery ${verdict.state}: ${verdict.detail}`.slice(0, 500),
    updatedAt: now,
  }).where(eq(crmScheduledJobs.id, claimed.jobId));
}

/** The address a delivery goes to right now, or why it cannot go anywhere. */
async function resolveRecipient(
  row: CrmReminderDelivery,
): Promise<{ to: string } | { blocked: string }> {
  if (row.recipientAddress) return { to: row.recipientAddress };
  if (row.recipientStaffId === null) {
    return { blocked: "this record was inherited from a marker that never recorded a recipient" };
  }
  const [staff] = await db.select().from(crmStaff)
    .where(eq(crmStaff.id, row.recipientStaffId)).limit(1);
  if (!staff) return { blocked: "the staff account this was for no longer exists" };
  if (staff.status !== "active") return { blocked: "the staff account this was for is not active" };
  return { to: staff.email };
}

/** Claims, sends and settles one delivery. Never throws. */
async function attemptDelivery(row: CrmReminderDelivery): Promise<"sent" | "skipped"> {
  if (staffMailBlockedReason()) return "skipped";

  const claimed = await claimDelivery(row.id);
  if (!claimed) return "skipped";

  const recipient = await resolveRecipient(claimed);
  if ("blocked" in recipient) {
    // Nothing was handed over, and nothing can be. `refused` is the honest
    // state: this message is not going to arrive and no retry changes that.
    await db.update(crmReminderDeliveries).set({
      state: "refused", nextAttemptAt: null, attemptStartedAt: null, attemptWorker: null,
      failureReason: DELIVERY_FAILURE_REASONS.recipientUnavailable,
      failureDetail: recipient.blocked, updatedAt: new Date(),
    }).where(eq(crmReminderDeliveries.id, claimed.id));
    return "skipped";
  }

  const outcome = await trySendStaffMail({
    to: recipient.to, subject: claimed.subject, text: claimed.body,
    idempotencyKey: claimed.idempotencyKey,
  });
  await settleDelivery(claimed, outcome);
  return "sent";
}

/**
 * Email is opt-in per person and silently skipped when Resend is unconfigured
 * or test mode is on — a reminder must never fail because mail is not set up,
 * and a test run must never reach a real inbox.
 *
 * Hands this occurrence's reminder to one recipient and records what actually
 * happened. Never throws: a mail problem must not fail the job, which would
 * re-run the handler.
 */
async function maybeEmail(
  job: CrmScheduledJob, staffId: number, subject: string, text: string,
): Promise<void> {
  const [staff] = await db.select().from(crmStaff).where(eq(crmStaff.id, staffId)).limit(1);
  if (!staff?.reminderEmailEnabled || staff.status !== "active") return;

  // Nothing can reach a provider in this environment. Deliberately records
  // NOTHING — not even a delivery row: a row here would claim the occurrence
  // had been handled, and the reminder would never go out once mail is
  // configured. This is the "failed before the provider call" case, and it
  // must leave no trace.
  if (staffMailBlockedReason()) return;

  const row = await ensureDeliveryRow(job, staffId, subject, text);
  if (!row) return;

  // Anything that is not a due `pending` row is left exactly where it is:
  // `accepted` is settled, `refused` needs a fix first, `uncertain` is never
  // retried by a machine, `attempting` belongs to another worker, and a
  // resolved row has been closed by a person.
  await attemptDelivery(row);
}

// ── The delivery worker ─────────────────────────────────────────────────────

/**
 * Promotes attempts whose worker is gone.
 *
 * A row left `attempting` by a killed process is the one genuinely ambiguous
 * case: bytes may or may not have reached the provider. It is NOT re-sent and
 * NOT dropped — it becomes a visible `uncertain` row that a person can retry,
 * re-send or acknowledge.
 */
export async function recoverStaleAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - DELIVERY_LEASE_MS);
  const rows = await db.update(crmReminderDeliveries).set({
    state: "uncertain",
    nextAttemptAt: null,
    attemptStartedAt: null,
    attemptWorker: null,
    failureReason: DELIVERY_FAILURE_REASONS.workerLost,
    failureDetail: WORKER_LOST_DETAIL,
    updatedAt: new Date(),
  }).where(and(
    eq(crmReminderDeliveries.state, "attempting"),
    isNotNull(crmReminderDeliveries.attemptStartedAt),
    lte(crmReminderDeliveries.attemptStartedAt, cutoff),
  )).returning({ id: crmReminderDeliveries.id });
  return rows.length;
}

/**
 * One pass over deliveries that are due.
 *
 * This is what makes an operator retry durable: the action moves
 * `next_attempt_at` and nothing else, and the send happens here — so a retry
 * survives the request that asked for it, and never touches the job's `run_at`.
 */
export async function processDueDeliveries(limit = DELIVERY_BATCH): Promise<{
  recovered: number; attempted: number;
}> {
  const recovered = await recoverStaleAttempts();

  const due = await db.select().from(crmReminderDeliveries).where(and(
    eq(crmReminderDeliveries.state, "pending"),
    isNull(crmReminderDeliveries.resolvedAt),
    isNotNull(crmReminderDeliveries.nextAttemptAt),
    lte(crmReminderDeliveries.nextAttemptAt, new Date()),
  )).orderBy(asc(crmReminderDeliveries.nextAttemptAt)).limit(Math.min(Math.max(limit, 1), 500));

  let attempted = 0;
  for (const row of due) {
    if (await attemptDelivery(row) === "sent") attempted += 1;
  }
  return { recovered, attempted };
}

// ── Migrating the packed column ─────────────────────────────────────────────

/**
 * Moves every record out of `crm_scheduled_jobs.external_ref` into real rows.
 *
 * Three rules, and the third is the point:
 *  - idempotent — every insert is guarded by the UNIQUE index, so re-running
 *    it changes nothing;
 *  - non-destructive — `external_ref` is never cleared, so the source text
 *    survives even a rollback of the new tables;
 *  - nothing is dropped. A line this scheme cannot confidently read is stored
 *    verbatim as an `uncertain` row with origin `migrated_unparsed`, which
 *    keeps it on the operator list until a person decides what it was. Guessing
 *    at it, or skipping it, is how history disappears.
 */
export async function migratePackedDeliveryRecords(): Promise<{
  jobsScanned: number; migrated: number; unparsed: number;
}> {
  const jobs = await db.select().from(crmScheduledJobs).where(or(
    isNotNull(crmScheduledJobs.externalRef),
    isNotNull(crmScheduledJobs.externalDispatchedAt),
  )!);

  let migrated = 0;
  let unparsed = 0;

  for (const job of jobs) {
    const rows: (typeof crmReminderDeliveries.$inferInsert)[] = [];
    const { parsed, unparsed: bad } = parseLegacyDeliveryRecords(job.externalRef);

    for (const record of parsed) {
      const mapped = legacyToState(record);
      const occurrence = new Date(record.occurrence);
      rows.push({
        jobId: job.id,
        occurrenceAt: occurrence,
        recipientStaffId: record.staffId,
        subject: "(migrated from a packed delivery record)",
        body: "(migrated from a packed delivery record; the original message body was never stored)",
        idempotencyKey: deliveryIdempotencyKey(
          job.dedupeKey, occurrence, record.staffId === null ? "unattributed" : String(record.staffId),
        ),
        state: mapped.state,
        attempt: record.attempt,
        nextAttemptAt: null,   // a person decides; nothing inherited is auto-sent
        providerRef: record.state === "accepted" ? record.detail || null : null,
        failureReason: mapped.reason || null,
        failureDetail: record.detail || null,
        origin: record.staffId === null ? "migrated_unattributed" : "migrated",
        legacyRaw: record.raw,
        ...(record.state === "acknowledged"
          ? {
              resolution: "acknowledged" as const,
              resolvedAt: job.updatedAt,
              resolutionNote:
                "migrated from the packed external_ref column; the original acknowledgement recorded no actor",
            }
          : {}),
      });
    }

    for (const [index, line] of bad.entries()) {
      rows.push({
        jobId: job.id,
        // No occurrence could be read, so the job's own run_at is used as the
        // anchor and the raw line is kept beside it. Offsetting by a
        // millisecond per line keeps two unreadable lines on one job from
        // colliding on the UNIQUE index and silently becoming one.
        occurrenceAt: new Date(job.runAt.getTime() + index),
        recipientStaffId: null,
        subject: "(unreadable packed delivery record)",
        body: "(unreadable packed delivery record; see legacy_raw)",
        idempotencyKey: deliveryIdempotencyKey(job.dedupeKey, job.runAt, `unparsed-${index}`),
        state: "uncertain",
        attempt: 0,
        nextAttemptAt: null,
        failureReason: DELIVERY_FAILURE_REASONS.legacyUnparsed,
        failureDetail:
          "this line could not be read as a delivery record and has been preserved verbatim for review",
        origin: "migrated_unparsed",
        legacyRaw: line,
      });
      unparsed += 1;
    }

    // A row with only the old marker: no packed records at all.
    if (parsed.length === 0 && bad.length === 0) {
      const seed = legacySeedFor(job, null);
      if (seed) {
        rows.push({
          jobId: job.id,
          occurrenceAt: job.runAt,
          recipientStaffId: null,
          subject: "(migrated from a pre-2026-09 dispatch marker)",
          body: "(migrated from a pre-2026-09 dispatch marker; no message was ever stored)",
          idempotencyKey: deliveryIdempotencyKey(job.dedupeKey, job.runAt, "unattributed"),
          state: seed.state,
          attempt: seed.attempt,
          nextAttemptAt: null,
          providerRef: seed.providerRef,
          failureReason: seed.reason || null,
          failureDetail: seed.detail || null,
          origin: "migrated_unattributed",
          legacyRaw: seed.legacyRaw,
        });
      }
    }

    if (rows.length === 0) continue;
    const inserted = await db.insert(crmReminderDeliveries).values(rows)
      .onConflictDoNothing().returning({ id: crmReminderDeliveries.id });
    migrated += inserted.length;
  }

  return { jobsScanned: jobs.length, migrated, unparsed };
}

// ── Delivery visibility ─────────────────────────────────────────────────────
//
// An ambiguous delivery that nobody can find is the same as a lost one. There
// is deliberately NO cap on how many unresolved records exist: a display limit
// pages, it never discards.

/**
 * Deliveries a person still has to deal with.
 *
 * `pending` with an attempt behind it counts — something already went wrong,
 * even though the worker will try again. `pending` with no attempt yet is
 * simply queued and is nobody's problem.
 */
export function deliveryNeedsAttention(): SQL {
  return and(
    isNull(crmReminderDeliveries.resolvedAt),
    or(
      inArray(crmReminderDeliveries.state, ["attempting", "refused", "uncertain"]),
      and(eq(crmReminderDeliveries.state, "pending"), sql`${crmReminderDeliveries.attempt} > 0`),
    ),
  )!;
}

/** Would the provider still collapse a retry of this exact message? */
export function idempotencyProtected(row: CrmReminderDelivery, now = Date.now()): boolean {
  const since = row.attemptStartedAt?.getTime() ?? row.updatedAt.getTime();
  return row.attempt > 0 && now - since <= RESEND_IDEMPOTENCY_WINDOW_MS;
}

/**
 * A retry re-uses the original idempotency key, so it can only duplicate in
 * one situation: the outcome is unknown AND the provider has forgotten the key.
 * Everywhere else the provider either demonstrably never took the message, or
 * still holds the key and collapses the repeat.
 */
export function retryCouldDuplicate(row: CrmReminderDelivery, now = Date.now()): boolean {
  return row.state === "uncertain" && !idempotencyProtected(row, now);
}

/** What retrying or re-sending this row would actually mean, in operator words. */
export function deliveryGuidance(row: CrmReminderDelivery, now = Date.now()): string {
  switch (row.state) {
    case "attempting":
      return "A send is in flight, or the worker that started it was lost. Wait one worker tick — "
        + "it becomes 'unknown' by itself if nobody resolves it.";
    case "accepted":
      return "The provider took this message. Nothing further is needed.";
    case "refused":
      return "The provider refused the message (address, sending domain or API key), so nothing was "
        + "delivered. Fix the cause first; retrying it unchanged will be refused the same way.";
    case "uncertain":
      return idempotencyProtected(row, now)
        ? "This may or may not have been delivered. A retry carries the SAME idempotency key and the "
          + "last attempt was under 24 hours ago, so the provider collapses it into the original — "
          + "a retry here cannot produce a second copy."
        : "This may or may not have been delivered, and the provider's 24-hour idempotency window has "
          + "closed, so a retry is no longer protected. Ask the recipient whether it arrived, then "
          + "either re-send deliberately or acknowledge it.";
    default:
      return row.attempt === 0
        ? "Queued. Nothing has been handed to the provider yet."
        : "The last attempt never reached the provider, so nothing was delivered and another attempt "
          + "cannot duplicate.";
  }
}

/**
 * What a person may do to this row right now.
 *
 * `retry` is absent exactly when it could duplicate — an unknown outcome past
 * the idempotency window — so "retry cannot duplicate" stays a guarantee
 * rather than a hope. The deliberate second copy is `resend`, which says so.
 */
export function availableRecoveryActions(
  row: CrmReminderDelivery, now = Date.now(),
): CrmDeliveryRecoveryAction[] {
  if (row.state === "attempting") return [];
  const actions: CrmDeliveryRecoveryAction[] = [];
  if (row.state !== "accepted" && !retryCouldDuplicate(row, now)) actions.push("retry");
  actions.push("resend");
  if (row.state !== "accepted" && row.resolvedAt === null) actions.push("acknowledge");
  return actions;
}

/** The duplicate risk of a deliberate re-send, in the words the operator sees. */
export function resendDuplicateRisk(row: CrmReminderDelivery): string {
  if (row.attempt === 0) {
    return "Nothing has been handed to the provider for this delivery yet, so a new copy cannot "
      + "duplicate anything.";
  }
  if (row.state === "accepted") {
    return "The provider ALREADY accepted a copy of this message. A re-send carries a new idempotency "
      + "key, so it will not be collapsed: the recipient will receive a second copy.";
  }
  if (row.state === "refused" || row.failureReason === DELIVERY_FAILURE_REASONS.neverLeft) {
    return "The last attempt demonstrably did not reach the recipient, so a new copy is very unlikely "
      + "to duplicate — but it carries a NEW idempotency key, so the provider will not collapse it if "
      + "that reading is wrong.";
  }
  return "This delivery's outcome is unknown: the message may already have arrived. A re-send carries "
    + "a NEW idempotency key precisely so the provider does NOT collapse it, which is what makes it a "
    + "second copy. If the first one arrived, the recipient gets two.";
}

export type DeliveryAttentionRow = {
  deliveryId: number;
  jobId: number; kind: string; dedupeKey: string; jobStatus: string;
  /** Who the message was for. Null on records inherited from a bare marker. */
  staffId: number | null;
  recipientAddress: string | null;
  /** The ORIGINAL run_at. Never moves. */
  occurrence: string;
  state: CrmDeliveryState;
  attempt: number;
  nextAttemptAt: string | null;
  providerRef: string | null;
  failureReason: string | null;
  failureDetail: string | null;
  /** One human-readable line: the provider's id on success, otherwise the reason. */
  detail: string;
  origin: string;
  legacyRaw: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  idempotencyProtected: boolean;
  availableActions: CrmDeliveryRecoveryAction[];
  guidance: string;
};

export function deliveryAttentionShape(
  row: CrmReminderDelivery,
  job: { kind: string; dedupeKey: string; status: string } | undefined,
  now = Date.now(),
): DeliveryAttentionRow {
  return {
    deliveryId: row.id,
    jobId: row.jobId,
    kind: job?.kind ?? "unknown",
    dedupeKey: job?.dedupeKey ?? "",
    jobStatus: job?.status ?? "unknown",
    staffId: row.recipientStaffId,
    recipientAddress: row.recipientAddress,
    occurrence: row.occurrenceAt.toISOString(),
    state: row.state as CrmDeliveryState,
    attempt: row.attempt,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    providerRef: row.providerRef,
    failureReason: row.failureReason,
    failureDetail: row.failureDetail,
    detail: row.providerRef ?? row.failureDetail ?? "",
    origin: row.origin,
    legacyRaw: row.legacyRaw,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolution: row.resolution,
    idempotencyProtected: idempotencyProtected(row, now),
    availableActions: availableRecoveryActions(row, now),
    guidance: deliveryGuidance(row, now),
  };
}

/**
 * Every delivery that is unresolved or unsuccessful, newest first.
 *
 * `limit` is a DISPLAY limit and nothing else — the operator route pages
 * through the whole set on the immutable id, so no unresolved record can be
 * hidden by there being too many of them.
 */
export async function listDeliveriesNeedingAttention(limit = 50): Promise<DeliveryAttentionRow[]> {
  const rows = await db.select().from(crmReminderDeliveries)
    .where(deliveryNeedsAttention())
    .orderBy(desc(crmReminderDeliveries.id))
    .limit(Math.min(Math.max(limit, 1), 500));
  if (rows.length === 0) return [];

  const jobs = await db.select({
    id: crmScheduledJobs.id, kind: crmScheduledJobs.kind,
    dedupeKey: crmScheduledJobs.dedupeKey, status: crmScheduledJobs.status,
  }).from(crmScheduledJobs).where(inArray(crmScheduledJobs.id, [...new Set(rows.map((r) => r.jobId))]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const now = Date.now();
  return rows.map((row) => deliveryAttentionShape(row, jobById.get(row.jobId), now));
}

/** How many deliveries need a human, for the operator dashboard's health line. */
export async function countDeliveriesNeedingAttention(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(crmReminderDeliveries).where(deliveryNeedsAttention());
  return Number(row?.n ?? 0);
}

// ── Operator recovery ───────────────────────────────────────────────────────
//
// Three genuinely different things, not one button:
//
//   retry      — the SAME occurrence, recipient, payload and idempotency key.
//                Only `next_attempt_at` moves. It is offered only where it
//                cannot duplicate.
//   resend     — a deliberate NEW copy with a NEW idempotency key. Requires an
//                explicit confirmation and records what the operator was told
//                about the duplicate risk. Never the default.
//   acknowledge— closes an unknown outcome without sending anything. Requires
//                a reason.
//
// Every one of them writes a `crm_delivery_recovery_actions` row in the same
// flow, with the staff id, the action, the reason and the timestamp.

export type RecoveryResult =
  | { ok: true; delivery: CrmReminderDelivery; action: CrmDeliveryRecoveryActionRow }
  | { ok: false; status: number; error: string; duplicateRisk?: string };

export async function recoverDelivery(args: {
  deliveryId: number;
  action: CrmDeliveryRecoveryAction;
  reason: string;
  actorStaffId: number | null;
  actorLabel: string;
  confirmDuplicateRisk?: boolean;
}): Promise<RecoveryResult> {
  const reason = args.reason.trim();
  if (reason.length < 3) {
    return { ok: false, status: 400, error: "Say why you are doing this — it is recorded against the delivery." };
  }

  const [row] = await db.select().from(crmReminderDeliveries)
    .where(eq(crmReminderDeliveries.id, args.deliveryId)).limit(1);
  if (!row) return { ok: false, status: 404, error: "No delivery with that id." };

  if (row.state === "attempting") {
    return {
      ok: false, status: 409,
      error: "A send is in flight for this delivery. Wait one worker tick — it resolves itself into an "
        + "unknown outcome if the worker is gone.",
    };
  }

  const now = new Date();
  const audit = {
    deliveryId: row.id,
    action: args.action,
    reason,
    actorStaffId: args.actorStaffId,
    actorLabel: args.actorLabel,
    previousState: row.state,
    previousIdempotencyKey: row.idempotencyKey,
  };

  if (args.action === "acknowledge") {
    if (row.state === "accepted") {
      return { ok: false, status: 409, error: "This delivery was accepted by the provider; there is nothing to acknowledge." };
    }
    if (row.resolvedAt !== null) {
      return { ok: false, status: 409, error: "This delivery has already been resolved." };
    }
    const [delivery] = await db.update(crmReminderDeliveries).set({
      resolution: "acknowledged", resolvedAt: now, resolvedByStaffId: args.actorStaffId,
      resolutionNote: reason,
      // A resolved row is already skipped by the worker, but leaving a time
      // here would tell an operator an attempt is coming that never will.
      // `next_attempt_at IS NULL` means exactly "nothing is scheduled", and
      // acknowledging is how that becomes true.
      nextAttemptAt: null,
      lastRecoveryAction: "acknowledge", lastRecoveryByStaffId: args.actorStaffId, lastRecoveryAt: now,
      updatedAt: now,
    }).where(and(
      eq(crmReminderDeliveries.id, row.id),
      isNull(crmReminderDeliveries.resolvedAt),
      ne(crmReminderDeliveries.state, "attempting"),
    )).returning();
    if (!delivery) return { ok: false, status: 409, error: "The delivery changed while you were looking at it. Reload and try again." };
    const [action] = await db.insert(crmDeliveryRecoveryActions)
      .values({ ...audit, newIdempotencyKey: null, duplicateRisk: null }).returning();
    return { ok: true, delivery, action };
  }

  if (args.action === "retry") {
    if (row.state === "accepted") {
      return {
        ok: false, status: 409,
        error: "The provider already accepted this message. If the recipient says it never arrived, "
          + "use Re-send — it deliberately creates a second copy.",
      };
    }
    if (retryCouldDuplicate(row)) {
      return {
        ok: false, status: 409,
        error: "This delivery's outcome is unknown and the provider's 24-hour idempotency window has "
          + "closed, so a retry is no longer collapsed into the original and could deliver a second "
          + "copy. Use Re-send (which says so explicitly) or Acknowledge.",
        duplicateRisk: resendDuplicateRisk(row),
      };
    }
    // The occurrence, the recipient, the payload and the key are untouched.
    // Only when the next attempt may happen moves.
    const [delivery] = await db.update(crmReminderDeliveries).set({
      state: "pending", nextAttemptAt: now,
      resolution: null, resolvedAt: null, resolvedByStaffId: null, resolutionNote: null,
      lastRecoveryAction: "retry", lastRecoveryByStaffId: args.actorStaffId, lastRecoveryAt: now,
      updatedAt: now,
    }).where(and(
      eq(crmReminderDeliveries.id, row.id),
      ne(crmReminderDeliveries.state, "attempting"),
      ne(crmReminderDeliveries.state, "accepted"),
    )).returning();
    if (!delivery) return { ok: false, status: 409, error: "The delivery changed while you were looking at it. Reload and try again." };
    const [action] = await db.insert(crmDeliveryRecoveryActions).values({
      ...audit, newIdempotencyKey: delivery.idempotencyKey,
      duplicateRisk: "Retry re-uses the original idempotency key and was offered only because it "
        + "cannot produce a second copy.",
    }).returning();
    return { ok: true, delivery, action };
  }

  // ── resend ────────────────────────────────────────────────────────────────
  const risk = resendDuplicateRisk(row);
  if (args.confirmDuplicateRisk !== true) {
    return {
      ok: false, status: 400,
      error: "Re-sending creates a NEW copy. Confirm you intend that by sending "
        + "\"confirmDuplicateRisk\": true.",
      duplicateRisk: risk,
    };
  }

  const nextKey = `${row.idempotencyKey}#resend${row.resendCount + 1}.${nonce()}`;
  const [delivery] = await db.update(crmReminderDeliveries).set({
    state: "pending", nextAttemptAt: now,
    idempotencyKey: nextKey,
    resendCount: row.resendCount + 1,
    resolution: null, resolvedAt: null, resolvedByStaffId: null, resolutionNote: null,
    lastRecoveryAction: "resend", lastRecoveryByStaffId: args.actorStaffId, lastRecoveryAt: now,
    updatedAt: now,
  }).where(and(
    eq(crmReminderDeliveries.id, row.id),
    eq(crmReminderDeliveries.idempotencyKey, row.idempotencyKey),
    ne(crmReminderDeliveries.state, "attempting"),
  )).returning();
  if (!delivery) return { ok: false, status: 409, error: "The delivery changed while you were looking at it. Reload and try again." };

  const [action] = await db.insert(crmDeliveryRecoveryActions)
    .values({ ...audit, newIdempotencyKey: nextKey, duplicateRisk: risk }).returning();
  return { ok: true, delivery, action };
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
    // A re-run of this job — an operator retry, a reclaimed lease — must not
    // write a second notification for the same occurrence and person.
    occurrenceKey: notificationOccurrenceKey(job, task.assignedToStaffId, "task_reminder"),
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
    occurrenceKey: notificationOccurrenceKey(job, staffId, "milestone_reminder"),
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

  // The same rule My Day and the automation sweep use, not a third one. The
  // digest is the first thing the person reads each morning, so "2 overdue"
  // here and "nothing overdue" on the screen they open next would be the CRM
  // arguing with itself about their own work.
  const digestNow = new Date();
  const overdue = open.filter((t) =>
    t.dueDate && isOverdueInZone(staff.timezone, t.dueDate, t.dueKind, digestNow)).length;
  await notify({
    staffId, kind: "daily_digest",
    title: `${open.length} task${open.length === 1 ? "" : "s"} for today`,
    body: overdue > 0 ? `${overdue} overdue.` : "Nothing overdue.",
    href: "/admin/crm/my-day",
    occurrenceKey: notificationOccurrenceKey(job, staffId, "daily_digest"),
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
      occurrenceKey: notificationOccurrenceKey(job, staffId, "appointment_reminder"),
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
  // Automation executions ride this same runner — same lease, same settle,
  // same visibility — rather than a second timer nobody watches.
  [AUTOMATION_JOB_KIND]: runAutomationJob,
  // The two M5 automation workers ride it for the same reasons. Both are
  // singleton rows that re-arm themselves at the end of their own handler,
  // exactly as the daily digest does, so the series cannot fan out on restart
  // and two processes can never run one of them at once.
  //
  //   crm_automation_sweep   produces `task_overdue` and `no_activity_for_days`,
  //                          which no business write can announce because
  //                          nobody DOES them — they become true as the clock
  //                          passes a day boundary.
  //   crm_automation_events  turns recorded business events into executions,
  //                          with retry, so an event survives the process that
  //                          recorded it.
  [AUTOMATION_SWEEP_JOB_KIND]: runAutomationSweepJob,
  [AUTOMATION_EVENTS_JOB_KIND]: runAutomationEventsJob,
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
export async function processDueJobs(): Promise<{
  processed: number; failed: number; deliveriesAttempted: number; deliveriesRecovered: number;
}> {
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

  // Deliveries have their own clock. A retry an operator asked for, and an
  // automatic attempt after a failure that provably never reached the
  // provider, both happen here — so neither has to move a job's `run_at`, and
  // neither depends on the request or the handler that started it still being
  // alive. A delivery problem must never fail the job pass.
  let deliveries = { recovered: 0, attempted: 0 };
  try {
    deliveries = await processDueDeliveries();
  } catch { /* the queue's own health is reported separately */ }

  return {
    processed: jobs.length, failed,
    deliveriesAttempted: deliveries.attempted,
    deliveriesRecovered: deliveries.recovered,
  };
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

/**
 * The one-time move out of the packed `external_ref` column, run at most once
 * per process and never allowed to stop the scheduler starting.
 *
 * It is idempotent (every insert is guarded by the UNIQUE index), so a restart
 * costs a scan and changes nothing. Per-recipient seeding in
 * `ensureDeliveryRow` means correctness does not depend on this having run —
 * this is what makes inherited UNRESOLVED records visible on the operator list
 * rather than only discoverable at send time.
 */
let legacyMigration: Promise<unknown> | undefined;
function migrateLegacyDeliveriesOnce(): Promise<unknown> {
  legacyMigration ??= migratePackedDeliveryRecords().catch(() => undefined);
  return legacyMigration;
}

export function startCrmScheduler(intervalMs = TICK_MS): void {
  if (timer) return;
  const tick = async () => {
    try {
      await migrateLegacyDeliveriesOnce();
      // Self-healing, and deliberately not an unconditional re-schedule: it
      // creates the two automation worker rows when they are missing and
      // revives them when they have come to rest, but leaves a pending row's
      // `run_at` alone. Re-arming a pending sweep every tick would quietly
      // move its cadence out of the constant that claims to set it.
      await ensureAutomationWorkersScheduled();
      const r = await processDueJobs();
      status.processed += r.processed;
      status.lastError = null;
      status.deliveriesNeedingAttention = await countDeliveriesNeedingAttention();
      status.deliveriesCheckedAt = new Date();

      // Scheduled marketing broadcasts. A no-op unless
      // CRM_MARKETING_AUTOSEND_ENABLED is exactly "true" — a worker that
      // mails customers with nobody pressing a button does not arrive
      // switched on. Isolated from the reminder work above so a campaign
      // fault cannot stop reminders going out.
      // Support replies: retry the ones whose next attempt is due, and file
      // any customer replies the inbound pipeline has matched to a ticket.
      // Wrapped separately so a support fault cannot stop reminders or
      // campaigns, in the same shape as the marketing block below.
      try {
        await processDueSupportDeliveries();
        await ingestSupportReplies();
      } catch (err) {
        logger.error({ err }, "support: delivery tick failed; reminders are unaffected");
      }

      if (marketingAutosendEnabled()) {
        try {
          const started = await startDueCampaigns();
          if (started.length) logger.info({ started }, "marketing: scheduled campaigns advanced");
        } catch (err) {
          logger.error({ err }, "marketing: scheduled campaign tick failed; reminders are unaffected");
        }
      }
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
