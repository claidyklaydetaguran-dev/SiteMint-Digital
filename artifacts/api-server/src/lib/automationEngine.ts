// ── M4: the CRM workflow automation engine ──────────────────────────────────
//
// Rules a person writes, that fire on real events, evaluate conditions against
// the record AS IT STANDS when the rule runs, take actions that change the
// database, and leave a history of every run.
//
// ── What already existed, and why this is not a second copy of it ───────────
//
// `artifacts/web-agency/src/lib/workflowEngine.ts` is LOCKED and stays locked.
// It is a pure browser module that answers, for ONE lead already loaded on
// screen: which steps of the standard sales sequence are done, what the next
// best action is, and which bucket the lead falls into. It has no persistence,
// no schedule, no history, no notion of a user-authored rule, and it never
// writes anything. It is advice; this is action. The automation queue screen
// keeps rendering its steps alongside these rules rather than replacing them.
//
// ── Where execution happens ─────────────────────────────────────────────────
//
// On the EXISTING durable runner. One execution is one row in
// `crm_scheduled_jobs` with `kind = 'crm_automation'`, claimed with the same
// `FOR UPDATE SKIP LOCKED` lease `crmScheduler.ts` uses, so restarts, retry
// backoff and two workers racing all behave the way the reminder engine already
// behaves. There is no second timer and nothing here calls `setInterval`.
//
// `runAutomationJob` has exactly the signature `crmScheduler`'s `HANDLERS` map
// takes, so registering it there is a one-line change the scheduler's owner
// makes (see the note above `runAutomationJob`). Until it lands,
// `drainAutomationJobs()` claims the same rows with the same semantics — and it
// stays correct afterwards, because the claim skips rows another worker holds.
//
// ── Nothing here can contact a customer ─────────────────────────────────────
//
// Every action type writes to the CRM's own tables: a task, an in-app
// notification, an activity note, a field, a follow-up date, an approval
// request. There is no outbound channel in the action vocabulary at all, so an
// automation cannot email, text or call anybody in development or anywhere
// else. That is a property of the vocabulary, not of a flag somebody could
// forget to set.
//
// ── The three loop brakes ───────────────────────────────────────────────────
//
// An automation that assigns tasks or sends notifications in a loop is the
// worst thing this feature can do. Three independent brakes:
//
//   1. Deduplication, by UNIQUE INDEX. The same rule cannot run twice for the
//      same (trigger, record, occurrence). Two racing emissions both pass any
//      "check first"; only one can win the insert.
//   2. Chain depth, carried through the trigger payload. An action that causes
//      a trigger passes its own execution's chain forward, so a rule that
//      re-enters itself — directly or through another rule — counts its hops
//      and is stopped at the rule's declared `maxChainDepth`.
//   3. A per-record, per-window execution cap. Depth cannot catch a re-entry
//      that arrives as a fresh external event at depth 0; the cap can.

import { and, asc, count, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  crmAutomationRules, crmAutomationExecutions, crmAutomationActionRuns, crmAutomationApprovals,
  crmScheduledJobs, crmLeads, crmDeals, crmTasks, crmAppointments, crmDocumentRequests,
  crmMessages, crmStaff, crmNotifications, crmActivities,
  CRM_AUTOMATION_TRIGGER_RECORD,
  evaluateAutomationConditions, evaluateAutomationStopConditions,
  isAutomationWritableField,
  type CrmAutomationAction, type CrmAutomationActionType, type CrmAutomationExecution,
  type CrmAutomationRecordType, type CrmAutomationRule, type CrmAutomationStopReason,
  type CrmAutomationTriggerEvent, type CrmAutomationChain,
  type CrmScheduledJob,
} from "@workspace/db";
import { resolveOwnerStaffId } from "./leadAssignee.js";

/** The `crm_scheduled_jobs.kind` every automation execution rides on. */
export const AUTOMATION_JOB_KIND = "crm_automation";

/** `crm_scheduled_jobs.dedupe_key` for one execution. One row, one execution. */
export const automationJobKey = (executionId: number) => `${AUTOMATION_JOB_KIND}:${executionId}`;

/**
 * Backoff for an action that DEFINITIVELY failed, by attempt number. Short at
 * the start because most of these are a transient row that has not been
 * committed yet, and capped because a rule nobody has fixed should stop being
 * noise long before it stops being visible.
 */
const RETRY_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000, 300_000];

/** How long a claimed automation job may stay locked before it is reclaimed. */
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const CLAIM_BATCH = 20;

const WORKER_ID = `${process.pid}-automation-${Math.random().toString(36).slice(2, 8)}`;

// ── Outcomes ────────────────────────────────────────────────────────────────

/**
 * What one action ended up doing.
 *
 * The distinction that matters is `failed` versus `unknown`:
 *
 *   failed   the side effect DEMONSTRABLY did not happen — a validation refused
 *            it before any write was attempted. Retrying cannot duplicate
 *            anything, so it is retried to the rule's budget.
 *   unknown  bytes went to the database and we never learned the answer. It may
 *            or may not have happened. NEVER retried automatically, because a
 *            retry could assign a second task or raise a second notification.
 *            It stays visible instead, and a person decides.
 *
 * An error is classified conservatively: anything thrown from the write itself
 * is `unknown`, not `failed`. "We do not know" is not a synonym for "it did not
 * happen", and treating it as one is how automations send things twice.
 */
export type AutomationActionOutcome =
  | { result: "succeeded"; detail: string; affected?: { type: string; id: number } }
  | { result: "skipped"; detail: string }
  | { result: "failed"; detail: string }
  | { result: "unknown"; detail: string };

export interface AutomationActionContext {
  execution: CrmAutomationExecution;
  rule: CrmAutomationRule;
  action: CrmAutomationAction;
  actionIndex: number;
  recordType: CrmAutomationRecordType;
  recordId: number;
  /** The record as it stands right now, not as it was when the trigger fired. */
  record: Record<string, unknown>;
  /** The chain an action's own trigger must carry forward. */
  chain: CrmAutomationChain;
  now: Date;
  deps: AutomationDeps;
}

export type AutomationActionExecutor =
  (ctx: AutomationActionContext) => Promise<AutomationActionOutcome>;

/**
 * The engine's injected dependencies.
 *
 * Passed explicitly rather than mutated globally, on the same principle as the
 * voice platform's publish seam: a test provider reaches the engine ONLY by
 * being handed in at the call site. Production calls `runAutomationJob`, which
 * passes `defaultAutomationDeps()`, so there is no environment variable, no
 * registry and no silent fallback that could wire a fake into a real run.
 */
export interface AutomationDeps {
  now: () => Date;
  executors: Record<CrmAutomationActionType, AutomationActionExecutor>;
}

export function defaultAutomationDeps(
  overrides: { now?: () => Date; executors?: Partial<Record<CrmAutomationActionType, AutomationActionExecutor>> } = {},
): AutomationDeps {
  return {
    now: overrides.now ?? (() => new Date()),
    executors: { ...BUILT_IN_EXECUTORS, ...(overrides.executors ?? {}) },
  };
}

// ── Records ─────────────────────────────────────────────────────────────────

const RECORD_TABLES = {
  lead: crmLeads,
  deal: crmDeals,
  task: crmTasks,
  appointment: crmAppointments,
  document_request: crmDocumentRequests,
  message: crmMessages,
} as const;

/** The record a rule's conditions are evaluated against, read fresh. */
export async function loadAutomationRecord(
  recordType: CrmAutomationRecordType, recordId: number,
): Promise<Record<string, unknown> | null> {
  const table = RECORD_TABLES[recordType];
  const [row] = await db.select().from(table).where(eq(table.id, recordId)).limit(1);
  return (row as Record<string, unknown> | undefined) ?? null;
}

/**
 * The contact a record is about, when it is about one. Notes and follow-ups
 * hang off a contact, so an action that needs one says "skipped" rather than
 * inventing a lead id.
 */
function leadIdOf(recordType: CrmAutomationRecordType, recordId: number, record: Record<string, unknown>): number | null {
  if (recordType === "lead") return recordId;
  const raw = record["leadId"];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A record's own change stamp, used to name an occurrence of a change event. */
function recordStamp(record: Record<string, unknown> | null): string {
  const v = record?.["updatedAt"] ?? record?.["createdAt"];
  if (v instanceof Date) return v.toISOString();
  return v === undefined || v === null ? "unknown" : String(v);
}

/**
 * The identity of one occurrence of an event.
 *
 * Two emissions that share this key are the same real-world event — a double
 * submit, a retried request, two workers racing — and the rule runs once for
 * all of them. Once-ever events (a lead is created once, a deal is won once)
 * key on the record alone; change events key on the record's own `updated_at`,
 * which is identical for every emission caused by one change and different for
 * the next one.
 */
export function deriveOccurrenceKey(
  trigger: string, recordId: number, record: Record<string, unknown> | null,
): string {
  const onceEver = trigger === "lead_created" || trigger === "deal_won" || trigger === "deal_lost";
  return onceEver ? `${trigger}:${recordId}` : `${trigger}:${recordId}:${recordStamp(record)}`;
}

// ── Emission ────────────────────────────────────────────────────────────────

export interface AutomationEmitResult {
  /** Executions created and queued by this emission. */
  queued: { executionId: number; ruleId: number }[];
  /** Rules that had already run for this occurrence. The dedup gate firing. */
  deduplicated: { ruleId: number; occurrenceKey: string }[];
  /** Rules stopped before they ran, with the brake that stopped them. */
  stopped: { ruleId: number; executionId: number | null; reason: CrmAutomationStopReason }[];
}

/**
 * Narrowing applied to one emission.
 *
 * `onlyRuleIds` exists for events that are about a SPECIFIC rule's parameter
 * rather than about the trigger in general. A contact that has been silent for
 * seven days is an occurrence for the rules that wait seven days and is not an
 * occurrence for a rule that waits thirty; fanning that event out to every
 * `no_activity_for_days` rule would make every silence window fire on every
 * other window's event. `null`/absent keeps the default behaviour — every
 * enabled rule listening for this trigger.
 */
export interface AutomationEmitOptions {
  onlyRuleIds?: number[] | null;
}

/**
 * Announce that something happened. Every rule listening for this trigger gets
 * an execution row — or is refused one by a brake, which is itself recorded.
 *
 * Called from the routes that change records, and from actions that cause a
 * further change. Never throws on a rule-level problem: one broken rule must
 * not fail the business operation that emitted the event.
 */
export async function emitAutomationTrigger(
  event: CrmAutomationTriggerEvent,
  deps: AutomationDeps = defaultAutomationDeps(),
  options: AutomationEmitOptions = {},
): Promise<AutomationEmitResult> {
  const result: AutomationEmitResult = { queued: [], deduplicated: [], stopped: [] };

  const recordType = CRM_AUTOMATION_TRIGGER_RECORD[event.trigger];
  const recordId = Number(event.payload.recordId);
  if (!Number.isFinite(recordId) || recordId <= 0) return result;

  const only = options.onlyRuleIds ?? null;
  // An explicit EMPTY list means "no rules want this", which is not the same as
  // "no filter". Treating the two alike would fan an empty target out to
  // everything, which is the exact bug this option exists to prevent.
  if (only !== null && only.length === 0) return result;

  const rules = await db.select().from(crmAutomationRules).where(and(
    eq(crmAutomationRules.trigger, event.trigger),
    eq(crmAutomationRules.enabled, true),
    isNull(crmAutomationRules.archivedAt),
    ...(only === null ? [] : [inArray(crmAutomationRules.id, only)]),
  ));
  if (rules.length === 0) return result;

  const record = await loadAutomationRecord(recordType, recordId);
  const occurrenceKey = event.occurrenceKey ?? deriveOccurrenceKey(event.trigger, recordId, record);
  const chain: CrmAutomationChain = event.chain ?? { depth: 0, ruleIds: [] };
  const now = deps.now();

  for (const rule of rules) {
    // Brake 2 — chain depth. Checked BEFORE the window cap because it is the
    // precise one: it names the path that re-entered, which is what somebody
    // debugging a runaway rule actually needs.
    if (chain.depth >= rule.maxChainDepth) {
      const id = await insertExecution({
        rule, event, recordType, recordId, occurrenceKey, chain, now,
        status: "stopped",
        stopReason: "chain_depth_exceeded",
        detail: `Stopped at chain depth ${chain.depth}: this rule's limit is ${rule.maxChainDepth}. `
          + `Path: ${[...chain.ruleIds, rule.id].join(" → ")}.`,
      });
      result.stopped.push({ ruleId: rule.id, executionId: id, reason: "chain_depth_exceeded" });
      continue;
    }

    // Brake 3 — per-record, per-window cap. The occurrence key for a capped
    // execution is the WINDOW, not the event, so a runaway trigger records one
    // "we stopped this" row per window rather than one per attempt.
    const windowStart = new Date(now.getTime() - rule.windowMinutes * 60_000);
    const [{ value: recent } = { value: 0 }] = await db
      .select({ value: count() })
      .from(crmAutomationExecutions)
      .where(and(
        eq(crmAutomationExecutions.ruleId, rule.id),
        eq(crmAutomationExecutions.recordId, recordId),
        eq(crmAutomationExecutions.recordType, recordType),
        gte(crmAutomationExecutions.createdAt, windowStart),
        sql`${crmAutomationExecutions.stopReason} IS DISTINCT FROM 'rate_cap_exceeded'`,
      ));

    if (Number(recent) >= rule.windowCap) {
      const bucket = Math.floor(now.getTime() / (rule.windowMinutes * 60_000));
      const id = await insertExecution({
        rule, event, recordType, recordId, chain, now,
        occurrenceKey: `ratecap:${bucket}`,
        status: "stopped",
        stopReason: "rate_cap_exceeded",
        detail: `Stopped: this rule already ran ${recent} time(s) against ${recordType} ${recordId} `
          + `in the last ${rule.windowMinutes} minute(s), and its cap is ${rule.windowCap}.`,
      });
      result.stopped.push({ ruleId: rule.id, executionId: id, reason: "rate_cap_exceeded" });
      continue;
    }

    // Brake 1 — the unique index. A null id back means another emission of this
    // same occurrence already created the row, which is the dedup working.
    const executionId = await insertExecution({
      rule, event, recordType, recordId, occurrenceKey, chain, now, status: "queued",
    });
    if (executionId === null) {
      result.deduplicated.push({ ruleId: rule.id, occurrenceKey });
      continue;
    }

    await enqueueAutomationJob(executionId, now);
    result.queued.push({ executionId, ruleId: rule.id });
  }

  return result;
}

async function insertExecution(args: {
  rule: CrmAutomationRule;
  event: CrmAutomationTriggerEvent;
  recordType: CrmAutomationRecordType;
  recordId: number;
  occurrenceKey: string;
  chain: CrmAutomationChain;
  now: Date;
  status: "queued" | "stopped";
  stopReason?: CrmAutomationStopReason;
  detail?: string;
}): Promise<number | null> {
  const rows = await db.insert(crmAutomationExecutions).values({
    ruleId: args.rule.id,
    trigger: args.event.trigger,
    recordType: args.recordType,
    recordId: args.recordId,
    occurrenceKey: args.occurrenceKey,
    status: args.status,
    conditionOutcome: "not_evaluated",
    stopReason: args.stopReason ?? null,
    detail: args.detail ?? null,
    chainDepth: args.chain.depth,
    chainRuleIds: args.chain.ruleIds,
    causedByExecutionId: args.chain.causedByExecutionId ?? null,
    triggerPayload: args.event.payload as unknown as Record<string, unknown>,
    startedByStaffId: null,
    finishedAt: args.status === "stopped" ? args.now : null,
    createdAt: args.now,
    updatedAt: args.now,
  }).onConflictDoNothing({
    target: [
      crmAutomationExecutions.ruleId, crmAutomationExecutions.trigger,
      crmAutomationExecutions.recordType, crmAutomationExecutions.recordId,
      crmAutomationExecutions.occurrenceKey,
    ],
  }).returning({ id: crmAutomationExecutions.id });

  return rows[0]?.id ?? null;
}

/**
 * Puts (or moves) an execution's job on the shared queue.
 *
 * Mirrors `crmScheduler.scheduleJob` exactly — same table, same dedupe-key
 * upsert, same revival of a cancelled row. It is written here rather than
 * called there because `scheduleJob`'s `kind` parameter is a closed union owned
 * by that module, and widening somebody else's type from the outside is not a
 * thing to do quietly. The one-line registration described above
 * `runAutomationJob` is the deliberate version of that change.
 */
export async function enqueueAutomationJob(executionId: number, runAt: Date): Promise<void> {
  await db.insert(crmScheduledJobs).values({
    kind: AUTOMATION_JOB_KIND,
    dedupeKey: automationJobKey(executionId),
    runAt,
    payload: { executionId },
  }).onConflictDoUpdate({
    target: crmScheduledJobs.dedupeKey,
    set: {
      runAt,
      payload: { executionId },
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

// ── The handler ─────────────────────────────────────────────────────────────

/**
 * The drop-in for `crmScheduler`'s `HANDLERS` map.
 *
 * INTEGRATION (one line, plus its import), in
 * `artifacts/api-server/src/lib/crmScheduler.ts`:
 *
 *   import { AUTOMATION_JOB_KIND, runAutomationJob } from "./automationEngine.js";
 *   ...
 *   const HANDLERS: Record<string, (job: CrmScheduledJob) => Promise<void>> = {
 *     [AUTOMATION_JOB_KIND]: runAutomationJob,
 *     ...
 *   };
 *
 * Until that lands, `drainAutomationJobs()` claims the same rows with the same
 * lease semantics; it remains correct afterwards because a row another worker
 * holds is skipped rather than taken twice.
 */
export async function runAutomationJob(job: CrmScheduledJob): Promise<void> {
  const executionId = Number(job.payload["executionId"]);
  if (!Number.isFinite(executionId)) return;
  await runAutomationExecution(executionId, defaultAutomationDeps());
}

/**
 * Claims due automation jobs and runs them.
 *
 * The same claim `crmScheduler.claimDueJobs` makes, narrowed to this kind:
 * `FOR UPDATE SKIP LOCKED` so two workers never take the same row, and a
 * `running` row whose lease has expired is reclaimable so a killed process does
 * not strand an execution.
 *
 * Settling mirrors the scheduler's: the completion update is GUARDED on the
 * `run_at` that was claimed, so a handler that re-armed the row for a retry
 * (which moves `run_at`) correctly leaves it pending instead of marking it
 * finished.
 */
export async function drainAutomationJobs(
  deps: AutomationDeps = defaultAutomationDeps(), limit = CLAIM_BATCH,
): Promise<{ claimed: number; failed: number }> {
  const now = deps.now();
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.select().from(crmScheduledJobs)
      .where(and(
        eq(crmScheduledJobs.kind, AUTOMATION_JOB_KIND),
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
    await tx.update(crmScheduledJobs)
      .set({ status: "running", lockedAt: now, lockedBy: WORKER_ID, updatedAt: now })
      .where(inArray(crmScheduledJobs.id, rows.map((r) => r.id)));
    return rows;
  });

  let failed = 0;
  for (const job of claimed) {
    try {
      const executionId = Number(job.payload["executionId"]);
      if (Number.isFinite(executionId)) await runAutomationExecution(executionId, deps);
      await db.update(crmScheduledJobs)
        .set({ status: "completed", completedAt: now, lockedAt: null, lockedBy: null, updatedAt: now })
        .where(and(eq(crmScheduledJobs.id, job.id), eq(crmScheduledJobs.runAt, job.runAt)));
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
      await db.update(crmScheduledJobs)
        .set({ status: "failed", lastError: message, lockedAt: null, lockedBy: null, updatedAt: now })
        .where(eq(crmScheduledJobs.id, job.id));
    }
  }
  return { claimed: claimed.length, failed };
}

// ── The execution ───────────────────────────────────────────────────────────

async function finish(
  executionId: number,
  patch: Partial<typeof crmAutomationExecutions.$inferInsert>,
  now: Date,
): Promise<void> {
  await db.update(crmAutomationExecutions)
    .set({ ...patch, finishedAt: now, updatedAt: now })
    .where(eq(crmAutomationExecutions.id, executionId));
}

/**
 * Runs one execution to its next resting point.
 *
 * Resumable by construction: every action's outcome is its own row, and the
 * loop skips any index already recorded as `succeeded`. So a retry after a
 * failure, and a resume after an approval, both re-enter here and continue
 * where they stopped instead of repeating work that already happened.
 */
export async function runAutomationExecution(
  executionId: number,
  deps: AutomationDeps = defaultAutomationDeps(),
): Promise<void> {
  const now = deps.now();

  const [execution] = await db.select().from(crmAutomationExecutions)
    .where(eq(crmAutomationExecutions.id, executionId)).limit(1);
  // A job for an execution that no longer exists is a no-op, not an error.
  if (!execution) return;
  if (execution.status === "completed" || execution.status === "failed" || execution.status === "stopped") return;

  const [rule] = await db.select().from(crmAutomationRules)
    .where(eq(crmAutomationRules.id, execution.ruleId)).limit(1);
  if (!rule || rule.archivedAt || !rule.enabled) {
    await finish(executionId, {
      status: "stopped", stopReason: "rule_disabled",
      detail: rule
        ? `Rule "${rule.name}" was ${rule.archivedAt ? "deleted" : "switched off"} before this run started.`
        : `Rule ${execution.ruleId} no longer exists.`,
    }, now);
    return;
  }

  const recordType = execution.recordType as CrmAutomationRecordType;
  await db.update(crmAutomationExecutions)
    .set({ status: "running", startedAt: execution.startedAt ?? now, updatedAt: now })
    .where(eq(crmAutomationExecutions.id, executionId));

  // Conditions are evaluated against the CURRENT record. The record the trigger
  // described may have moved on — somebody may have re-qualified the lead, or
  // the deal may now be lost — and acting on the stale snapshot is how an
  // automation does the wrong thing confidently.
  const record = await loadAutomationRecord(recordType, execution.recordId);
  if (!record) {
    await finish(executionId, {
      status: "stopped", stopReason: "record_missing",
      detail: `The ${recordType} this run was about (id ${execution.recordId}) no longer exists.`,
    }, now);
    return;
  }

  if (evaluateAutomationStopConditions(rule.stopConditions, record)) {
    await finish(executionId, {
      status: "stopped", stopReason: "stop_condition", conditionOutcome: "not_evaluated",
      detail: `A stop condition on "${rule.name}" was already true, so nothing ran.`,
    }, now);
    return;
  }

  if (!evaluateAutomationConditions(rule.conditions, record)) {
    await finish(executionId, {
      status: "completed", conditionOutcome: "not_matched",
      detail: `Conditions did not match ${recordType} ${execution.recordId} when the rule ran.`,
    }, now);
    return;
  }

  await db.update(crmAutomationExecutions)
    .set({ conditionOutcome: "matched", updatedAt: now })
    .where(eq(crmAutomationExecutions.id, executionId));

  const actions = rule.actions ?? [];
  const existingRuns = await db.select().from(crmAutomationActionRuns)
    .where(eq(crmAutomationActionRuns.executionId, executionId));
  const runByIndex = new Map(existingRuns.map((r) => [r.actionIndex, r]));

  const chain: CrmAutomationChain = {
    depth: execution.chainDepth + 1,
    ruleIds: [...(execution.chainRuleIds ?? []), rule.id],
    causedByExecutionId: executionId,
  };

  let current = record;

  for (let i = 0; i < actions.length; i += 1) {
    const action = actions[i]!;
    const prior = runByIndex.get(i);
    if (prior?.status === "succeeded" || prior?.status === "skipped") continue;

    // Re-read before every action, then re-check the stop conditions. This is
    // what makes a stop condition halt a rule MID-RUN: the first action may be
    // the very thing that makes stopping correct.
    if (i > 0) {
      const fresh = await loadAutomationRecord(recordType, execution.recordId);
      if (!fresh) {
        await markSkippedFrom(executionId, actions, i, "The record was deleted part-way through this run.", now);
        await finish(executionId, {
          status: "stopped", stopReason: "record_missing",
          detail: `The ${recordType} this run was about (id ${execution.recordId}) was deleted part-way through.`,
        }, now);
        return;
      }
      current = fresh;
      if (evaluateAutomationStopConditions(rule.stopConditions, current)) {
        await markSkippedFrom(executionId, actions, i, "A stop condition became true before this step.", now);
        await finish(executionId, {
          status: "stopped", stopReason: "stop_condition",
          detail: `A stop condition on "${rule.name}" became true after step ${i} — the remaining `
            + `${actions.length - i} step(s) did not run.`,
        }, now);
        return;
      }
    }

    // ── Approval gate ───────────────────────────────────────────────────────
    const approverStaffId = resolveApprover(action);
    if (approverStaffId !== null) {
      const decision = await resolveApproval({
        executionId, rule, action, actionIndex: i, approverStaffId,
        recordType, recordId: execution.recordId, now,
      });

      if (decision.state === "pending") {
        await upsertActionRun(executionId, i, action.type, {
          status: "awaiting_approval", detail: decision.detail, startedAt: now,
        }, now);
        await db.update(crmAutomationExecutions)
          .set({ status: "awaiting_approval", detail: decision.detail, updatedAt: now })
          .where(eq(crmAutomationExecutions.id, executionId));
        return;
      }
      if (decision.state === "rejected") {
        await upsertActionRun(executionId, i, action.type, {
          status: "rejected", detail: decision.detail, finishedAt: now,
        }, now);
        await markSkippedFrom(executionId, actions, i + 1, "An earlier step was rejected.", now);
        await finish(executionId, {
          status: "stopped", stopReason: "approval_rejected", detail: decision.detail,
        }, now);
        return;
      }
      // approved — fall through and run it.
    }

    // ── Run it ──────────────────────────────────────────────────────────────
    const attempts = (prior?.attempts ?? 0) + 1;
    await upsertActionRun(executionId, i, action.type, { status: "skipped", attempts, startedAt: now }, now);

    const executor = deps.executors[action.type];
    const outcome: AutomationActionOutcome = executor
      ? await executor({
          execution, rule, action, actionIndex: i, recordType,
          recordId: execution.recordId, record: current, chain, now, deps,
        }).catch((err: unknown) => ({
          // An executor that threw where we could not see the boundary is
          // `unknown`, never `failed`: the write may have landed.
          result: "unknown" as const,
          detail: `The step threw after it may already have written: ${errText(err)}`,
        }))
      : { result: "failed" as const, detail: `This build has no executor for "${action.type}".` };

    await upsertActionRun(executionId, i, action.type, {
      status: outcome.result === "succeeded" ? "succeeded"
        : outcome.result === "skipped" ? "skipped"
          : outcome.result === "failed" ? "failed" : "unknown",
      attempts,
      detail: outcome.detail,
      affectedRecordType: outcome.result === "succeeded" ? outcome.affected?.type ?? recordType : null,
      affectedRecordId: outcome.result === "succeeded"
        ? outcome.affected?.id ?? execution.recordId : null,
      finishedAt: now,
    }, now);

    if (outcome.result === "unknown") {
      // Deliberately terminal. The whole point of `unknown` is that a retry
      // could do the thing a second time.
      await finish(executionId, {
        status: "failed",
        detail: `Step ${i + 1} (${action.type}) left an unknown outcome and was NOT retried, because `
          + `retrying could repeat a side effect that may already have happened: ${outcome.detail}`,
      }, now);
      return;
    }

    if (outcome.result === "failed") {
      if (attempts < rule.maxActionAttempts) {
        const delay = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)]!;
        const nextAttemptAt = new Date(now.getTime() + delay);
        await db.update(crmAutomationExecutions).set({
          status: "queued", attempts, nextAttemptAt, updatedAt: now,
          detail: `Step ${i + 1} (${action.type}) failed on attempt ${attempts} of `
            + `${rule.maxActionAttempts}; retrying. ${outcome.detail}`,
        }).where(eq(crmAutomationExecutions.id, executionId));
        await enqueueAutomationJob(executionId, nextAttemptAt);
        return;
      }
      await markSkippedFrom(executionId, actions, i + 1, "An earlier step used up its retries.", now);
      await finish(executionId, {
        status: "failed", attempts,
        detail: `Step ${i + 1} (${action.type}) failed ${attempts} time(s), which is this rule's budget. `
          + `It has stopped and stays visible here. Last reason: ${outcome.detail}`,
      }, now);
      return;
    }
  }

  await finish(executionId, {
    status: "completed", conditionOutcome: "matched",
    detail: `All ${actions.length} step(s) ran.`,
  }, now);
}

function errText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

async function markSkippedFrom(
  executionId: number, actions: CrmAutomationAction[], from: number, why: string, now: Date,
): Promise<void> {
  for (let i = from; i < actions.length; i += 1) {
    await upsertActionRun(executionId, i, actions[i]!.type, {
      status: "skipped", detail: why, finishedAt: now,
    }, now);
  }
}

async function upsertActionRun(
  executionId: number, actionIndex: number, actionType: CrmAutomationActionType,
  patch: Partial<typeof crmAutomationActionRuns.$inferInsert>, now: Date,
): Promise<void> {
  await db.insert(crmAutomationActionRuns).values({
    executionId, actionIndex, actionType,
    status: (patch.status as string | undefined) ?? "skipped",
    attempts: patch.attempts ?? 0,
    detail: patch.detail ?? null,
    affectedRecordType: patch.affectedRecordType ?? null,
    affectedRecordId: patch.affectedRecordId ?? null,
    startedAt: patch.startedAt ?? null,
    finishedAt: patch.finishedAt ?? null,
    createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: [crmAutomationActionRuns.executionId, crmAutomationActionRuns.actionIndex],
    set: { ...patch, updatedAt: now },
  });
}

// ── Approvals ───────────────────────────────────────────────────────────────

/**
 * The approver for an action, if it has one.
 *
 * Two spellings, one mechanism: `approverStaffId` gates any action, and the
 * `request_approval` action IS that gate written out explicitly. Keeping them
 * as one code path means a rule cannot be built that "asks" without waiting.
 */
function resolveApprover(action: CrmAutomationAction): number | null {
  const direct = Number(action.approverStaffId);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (action.type === "request_approval") {
    const fromConfig = Number(action.config?.["approverStaffId"]);
    if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;
  }
  return null;
}

async function resolveApproval(args: {
  executionId: number; rule: CrmAutomationRule; action: CrmAutomationAction; actionIndex: number;
  approverStaffId: number; recordType: CrmAutomationRecordType; recordId: number; now: Date;
}): Promise<{ state: "pending" | "approved" | "rejected"; detail: string }> {
  const [existing] = await db.select().from(crmAutomationApprovals).where(and(
    eq(crmAutomationApprovals.executionId, args.executionId),
    eq(crmAutomationApprovals.actionIndex, args.actionIndex),
  )).limit(1);

  if (existing) {
    if (existing.status === "approved") {
      return { state: "approved", detail: `Approved by staff ${existing.decidedByStaffId ?? "?"}.` };
    }
    if (existing.status === "rejected") {
      return {
        state: "rejected",
        detail: `Rejected by staff ${existing.decidedByStaffId ?? "?"}: `
          + `${existing.decisionReason ?? "no reason recorded"}.`,
      };
    }
    return {
      state: "pending",
      detail: `Waiting on staff ${existing.approverStaffId} to approve step ${args.actionIndex + 1} `
        + `(${args.action.type}).`,
    };
  }

  const summary = typeof args.action.config?.["summary"] === "string"
    ? String(args.action.config["summary"]).slice(0, 500)
    : `"${args.rule.name}" wants to ${args.action.type.replace(/_/g, " ")} on `
      + `${args.recordType} ${args.recordId}.`;

  // Unique on (execution, action index): a retry or a second worker cannot
  // raise a second request for the same step.
  await db.insert(crmAutomationApprovals).values({
    executionId: args.executionId,
    ruleId: args.rule.id,
    actionIndex: args.actionIndex,
    actionType: args.action.type,
    approverStaffId: args.approverStaffId,
    status: "pending",
    summary,
    recordType: args.recordType,
    recordId: args.recordId,
    createdAt: args.now,
    updatedAt: args.now,
  }).onConflictDoNothing({
    target: [crmAutomationApprovals.executionId, crmAutomationApprovals.actionIndex],
  });

  return {
    state: "pending",
    detail: `Waiting on staff ${args.approverStaffId} to approve step ${args.actionIndex + 1} `
      + `(${args.action.type}).`,
  };
}

/**
 * Records a decision and moves the execution on.
 *
 * Approving re-queues the execution so it resumes at the step it parked on;
 * rejecting stops it immediately with the reason attached, so nobody has to
 * wait for a worker tick to learn that a run is over.
 */
export async function decideAutomationApproval(args: {
  approvalId: number;
  decision: "approve" | "reject";
  reason: string | null;
  deciderStaffId: number;
  now?: Date;
}): Promise<{ ok: true; approval: typeof crmAutomationApprovals.$inferSelect } | { ok: false; error: string }> {
  const now = args.now ?? new Date();
  const [approval] = await db.select().from(crmAutomationApprovals)
    .where(eq(crmAutomationApprovals.id, args.approvalId)).limit(1);
  if (!approval) return { ok: false, error: "Not found." };
  if (approval.status !== "pending") {
    return { ok: false, error: `This was already ${approval.status}.` };
  }
  if (args.decision === "reject" && !args.reason?.trim()) {
    return { ok: false, error: "Say why you are rejecting it. The person whose rule stopped needs to know." };
  }

  // Guarded on `pending`, so two people deciding at once cannot both win.
  const [updated] = await db.update(crmAutomationApprovals).set({
    status: args.decision === "approve" ? "approved" : "rejected",
    decidedByStaffId: args.deciderStaffId,
    decidedAt: now,
    decisionReason: args.reason?.trim().slice(0, 1000) ?? null,
    updatedAt: now,
  }).where(and(
    eq(crmAutomationApprovals.id, args.approvalId),
    eq(crmAutomationApprovals.status, "pending"),
  )).returning();
  if (!updated) return { ok: false, error: "Somebody else decided this first." };

  if (args.decision === "approve") {
    await db.update(crmAutomationExecutions)
      .set({ status: "queued", nextAttemptAt: now, updatedAt: now })
      .where(and(
        eq(crmAutomationExecutions.id, updated.executionId),
        eq(crmAutomationExecutions.status, "awaiting_approval"),
      ));
    await enqueueAutomationJob(updated.executionId, now);
  } else {
    // The rejection ends the run HERE, so this is the last code that will look
    // at it — the executor never re-enters a stopped execution. If it did not
    // write the step outcomes itself, the rejected step would sit in the
    // history as "awaiting approval" forever and the steps after it would have
    // no row at all, which reads as "we lost track" rather than "it was
    // refused".
    const detail = `Rejected by staff ${args.deciderStaffId}: ${updated.decisionReason}.`;
    await upsertActionRun(updated.executionId, updated.actionIndex,
      updated.actionType as CrmAutomationActionType,
      { status: "rejected", detail, finishedAt: now }, now);

    const [rule] = await db.select().from(crmAutomationRules)
      .where(eq(crmAutomationRules.id, updated.ruleId)).limit(1);
    if (rule) {
      await markSkippedFrom(updated.executionId, rule.actions ?? [], updated.actionIndex + 1,
        "An earlier step was rejected.", now);
    }

    await finish(updated.executionId, {
      status: "stopped", stopReason: "approval_rejected", detail,
    }, now);
  }
  return { ok: true, approval: updated };
}

// ── The built-in actions ────────────────────────────────────────────────────
//
// Every one of these writes to a CRM table and none has an outbound channel.
// The classification rule they all follow: a refusal decided BEFORE any write
// is `failed` (deterministic, a retry cannot duplicate); anything thrown by the
// write itself is `unknown` (it may have landed) and is never retried.

async function writeOrUnknown(
  what: string, write: () => Promise<AutomationActionOutcome>,
): Promise<AutomationActionOutcome> {
  try {
    return await write();
  } catch (err) {
    return { result: "unknown", detail: `${what} may or may not have happened: ${errText(err)}` };
  }
}

async function activeStaff(staffId: number): Promise<{ id: number; displayName: string } | null> {
  const [row] = await db.select({ id: crmStaff.id, displayName: crmStaff.displayName, status: crmStaff.status })
    .from(crmStaff).where(eq(crmStaff.id, staffId)).limit(1);
  return row && row.status === "active" ? { id: row.id, displayName: row.displayName } : null;
}

const assignOwner: AutomationActionExecutor = async (ctx) => {
  const staffId = Number(ctx.action.config["staffId"]);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return { result: "failed", detail: "This step has no staff member to assign to." };
  }
  const staff = await activeStaff(staffId);
  if (!staff) {
    return { result: "failed", detail: `Staff ${staffId} is not an active account, so nothing was assigned.` };
  }

  return writeOrUnknown("The assignment", async () => {
    if (ctx.recordType === "lead") {
      // M6: both columns, always. This is the one place that already HAD the
      // staff row in hand and still wrote only a name, so the id is free here
      // and the contact never lands in the unmapped-owners panel.
      await db.update(crmLeads)
        .set({ assignedTo: staff.displayName, assignedToStaffId: staff.id, updatedAt: ctx.now })
        .where(eq(crmLeads.id, ctx.recordId));
    } else if (ctx.recordType === "deal") {
      await db.update(crmDeals).set({ ownerStaffId: staff.id, updatedAt: ctx.now })
        .where(eq(crmDeals.id, ctx.recordId));
    } else if (ctx.recordType === "task") {
      await db.update(crmTasks).set({ assignedToStaffId: staff.id, updatedAt: ctx.now })
        .where(eq(crmTasks.id, ctx.recordId));
    } else {
      return { result: "skipped", detail: `A ${ctx.recordType} has no owner to set.` };
    }
    return {
      result: "succeeded",
      detail: `Assigned ${ctx.recordType} ${ctx.recordId} to ${staff.displayName}.`,
      affected: { type: ctx.recordType, id: ctx.recordId },
    };
  });
};

const createTask: AutomationActionExecutor = async (ctx) => {
  const title = String(ctx.action.config["title"] ?? "").trim();
  if (!title) return { result: "failed", detail: "This step has no task title." };

  const assigneeRaw = Number(ctx.action.config["assigneeStaffId"]);
  const assignee = Number.isFinite(assigneeRaw) && assigneeRaw > 0 ? assigneeRaw : null;
  if (assignee !== null && !(await activeStaff(assignee))) {
    return { result: "failed", detail: `Staff ${assignee} is not an active account, so no task was created.` };
  }

  const dueInDays = Number(ctx.action.config["dueInDays"]);
  const dueDate = Number.isFinite(dueInDays)
    ? new Date(ctx.now.getTime() + dueInDays * 86_400_000) : null;

  const leadId = leadIdOf(ctx.recordType, ctx.recordId, ctx.record);
  const projectId = ctx.recordType === "task" ? null : Number(ctx.record["projectId"]) || null;

  return writeOrUnknown("The task", async () => {
    const [task] = await db.insert(crmTasks).values({
      leadId, projectId,
      type: String(ctx.action.config["type"] ?? "Follow Up"),
      title: title.slice(0, 500),
      description: ctx.action.config["description"] ? String(ctx.action.config["description"]) : null,
      dueDate,
      status: "pending",
      createdBy: `automation:${ctx.rule.name}`.slice(0, 200),
      assignedToStaffId: assignee,
      priority: ctx.action.config["priority"] ? String(ctx.action.config["priority"]) : null,
    }).returning({ id: crmTasks.id });
    return {
      result: "succeeded",
      detail: `Created task "${title}"${assignee ? ` for staff ${assignee}` : ""}`
        + `${dueDate ? `, due ${dueDate.toISOString().slice(0, 10)}` : ""}.`,
      affected: { type: "task", id: task!.id },
    };
  });
};

const notifyStaff: AutomationActionExecutor = async (ctx) => {
  const staffId = Number(ctx.action.config["staffId"]);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return { result: "failed", detail: "This step has nobody to notify." };
  }
  if (!(await activeStaff(staffId))) {
    return { result: "failed", detail: `Staff ${staffId} is not an active account, so nothing was sent.` };
  }
  const title = String(ctx.action.config["title"] ?? ctx.rule.name).slice(0, 300);

  return writeOrUnknown("The notification", async () => {
    // In-app only. `crm_notifications` is the bell in the CRM; there is no
    // outbound channel in this vocabulary, so no customer can receive this.
    await db.insert(crmNotifications).values({
      staffId,
      kind: "automation",
      title,
      body: ctx.action.config["body"] ? String(ctx.action.config["body"]).slice(0, 2000) : null,
      href: typeof ctx.action.config["href"] === "string" && String(ctx.action.config["href"]).startsWith("/")
        ? String(ctx.action.config["href"]) : null,
      entityType: ctx.recordType,
      entityId: ctx.recordId,
    });
    return {
      result: "succeeded",
      detail: `Notified staff ${staffId}: "${title}".`,
      affected: { type: ctx.recordType, id: ctx.recordId },
    };
  });
};

/**
 * Sets one allowlisted field on the triggering record.
 *
 * This is the action that can cause another trigger, so it is also the one that
 * carries the chain forward. A status or stage change emits the matching
 * trigger with `depth + 1` and the rule path so far — which is what makes the
 * loop brake able to see a rule re-entering itself.
 */
const setField: AutomationActionExecutor = async (ctx) => {
  const field = String(ctx.action.config["field"] ?? "");
  const value = ctx.action.config["value"];
  if (!isAutomationWritableField(ctx.recordType, field)) {
    return {
      result: "failed",
      detail: `"${field}" is not a field an automation may set on a ${ctx.recordType}.`,
    };
  }

  const before = ctx.record[field];

  const written = await writeOrUnknown("The field change", async () => {
    const table = RECORD_TABLES[ctx.recordType];
    const patch: Record<string, unknown> = { [field]: value, updatedAt: ctx.now };
    // M6: a rule may set a lead's `assignedTo` to any string it likes. The
    // staff reference beside it must not survive that — an id left pointing at
    // the PREVIOUS owner is worse than no id, because it attributes a contact
    // to somebody who was never given it. It is re-resolved through the same
    // mapping rules the pickers use; no match leaves NULL, and the value shows
    // up in the unmapped-owners panel rather than being guessed at.
    if (ctx.recordType === "lead" && field === "assignedTo") {
      patch["assignedToStaffId"] = await resolveOwnerStaffId(
        typeof value === "string" ? value : null,
      );
    }
    await db.update(table).set(patch as never).where(eq(table.id, ctx.recordId));
    return {
      result: "succeeded",
      detail: `Set ${field} on ${ctx.recordType} ${ctx.recordId} from `
        + `"${before ?? ""}" to "${String(value ?? "")}".`,
      affected: { type: ctx.recordType, id: ctx.recordId },
    };
  });
  if (written.result !== "succeeded") return written;

  // The change may itself be an event other rules listen for. Emitted with the
  // chain advanced, so a rule that comes back round to itself is countable.
  //
  // The occurrence key is stated explicitly rather than derived, because this
  // caller knows EXACTLY which change it made: step `actionIndex` of execution
  // `id`. Deriving it from the record's `updated_at` would be wrong here — two
  // steps of one execution stamp the same instant, and the second change would
  // be mistaken for a re-announcement of the first and silently dropped. That
  // is precisely the case where a loop must stay visible.
  const from = before === null || before === undefined ? null : String(before);
  const occurrenceKey = `automation:${ctx.execution.id}:${ctx.actionIndex}`;

  if (ctx.recordType === "lead" && field === "status" && from !== String(value)) {
    await emitAutomationTrigger({
      trigger: "lead_status_changed",
      payload: { recordId: ctx.recordId, from, to: String(value) },
      occurrenceKey, chain: ctx.chain,
    }, ctx.deps);
  }
  if (ctx.recordType === "deal" && field === "stage" && from !== String(value)) {
    await emitAutomationTrigger({
      trigger: "deal_stage_changed",
      payload: { recordId: ctx.recordId, from, to: String(value) },
      occurrenceKey, chain: ctx.chain,
    }, ctx.deps);
  }
  return written;
};

const addNote: AutomationActionExecutor = async (ctx) => {
  const body = String(ctx.action.config["body"] ?? "").trim();
  if (!body) return { result: "failed", detail: "This step has no note to add." };
  const leadId = leadIdOf(ctx.recordType, ctx.recordId, ctx.record);
  if (leadId === null) {
    return { result: "skipped", detail: `A ${ctx.recordType} with no contact has nowhere to put a note.` };
  }

  return writeOrUnknown("The note", async () => {
    const [row] = await db.insert(crmActivities).values({
      leadId,
      type: "note_added",
      title: `Automation: ${ctx.rule.name}`.slice(0, 300),
      description: body.slice(0, 4000),
      createdBy: `automation:${ctx.rule.name}`.slice(0, 200),
      metadata: { ruleId: ctx.rule.id, executionId: ctx.execution.id },
    }).returning({ id: crmActivities.id });
    return {
      result: "succeeded",
      detail: `Added a note to contact ${leadId}.`,
      affected: { type: "lead", id: leadId },
    };
  });
};

const scheduleFollowUp: AutomationActionExecutor = async (ctx) => {
  const inDays = Number(ctx.action.config["inDays"]);
  if (!Number.isFinite(inDays)) {
    return { result: "failed", detail: "This step does not say how far ahead to schedule the follow-up." };
  }
  const leadId = leadIdOf(ctx.recordType, ctx.recordId, ctx.record);
  if (leadId === null) {
    return { result: "skipped", detail: `A ${ctx.recordType} with no contact has no follow-up date.` };
  }
  const at = new Date(ctx.now.getTime() + inDays * 86_400_000);

  return writeOrUnknown("The follow-up date", async () => {
    await db.update(crmLeads).set({ nextFollowUpAt: at, updatedAt: ctx.now })
      .where(eq(crmLeads.id, leadId));
    return {
      result: "succeeded",
      detail: `Set the next follow-up for contact ${leadId} to ${at.toISOString().slice(0, 10)}.`,
      affected: { type: "lead", id: leadId },
    };
  });
};

/**
 * The approval gate, written out as its own step.
 *
 * By the time this executor runs, the gate above has already been satisfied —
 * the approver said yes. So the step's own work is to record that, which is the
 * honest thing for it to do rather than pretending to perform something else.
 */
const requestApproval: AutomationActionExecutor = async (ctx) => ({
  result: "succeeded",
  detail: `Approval for step ${ctx.actionIndex + 1} was granted, so the rule continued.`,
  affected: { type: ctx.recordType, id: ctx.recordId },
});

const BUILT_IN_EXECUTORS: Record<CrmAutomationActionType, AutomationActionExecutor> = {
  assign_owner: assignOwner,
  create_task: createTask,
  notify: notifyStaff,
  set_field: setField,
  add_note: addNote,
  schedule_follow_up: scheduleFollowUp,
  request_approval: requestApproval,
};

// ── Manual runs ─────────────────────────────────────────────────────────────

/**
 * Runs one rule against one named record, on a person's say-so.
 *
 * The brakes stay on. A manual run gets its own occurrence key so it is never
 * mistaken for an event, but it still counts against the window cap and still
 * carries a chain — a person pressing "run now" on a looping rule must not be
 * the way round the protection.
 */
export async function runRuleManually(args: {
  rule: CrmAutomationRule;
  recordId: number;
  staffId: number | null;
  deps?: AutomationDeps;
}): Promise<
  | { started: true; executionId: number }
  | { started: false; executionId: number | null; reason: string }
> {
  const deps = args.deps ?? defaultAutomationDeps();
  const now = deps.now();
  const recordType = CRM_AUTOMATION_TRIGGER_RECORD[
    args.rule.trigger as keyof typeof CRM_AUTOMATION_TRIGGER_RECORD
  ];
  const record = await loadAutomationRecord(recordType, args.recordId);
  if (!record) {
    return {
      started: false, executionId: null,
      reason: `There is no ${recordType} with id ${args.recordId}.`,
    };
  }

  const emitted = await emitAutomationTrigger({
    trigger: args.rule.trigger as never,
    payload: { recordId: args.recordId } as never,
    occurrenceKey: `manual:${args.staffId ?? "system"}:${now.toISOString()}`,
    chain: { depth: 0, ruleIds: [] },
  }, deps);

  const mine = emitted.queued.find((q) => q.ruleId === args.rule.id);
  if (mine) {
    await db.update(crmAutomationExecutions)
      .set({ startedByStaffId: args.staffId, updatedAt: now })
      .where(eq(crmAutomationExecutions.id, mine.executionId));
    return { started: true, executionId: mine.executionId };
  }

  // A brake stopped it. The refusal still has an execution row — the history
  // must show that somebody asked and what refused them — so the id is
  // returned alongside the reason rather than instead of it. Reporting this as
  // "started" because a row exists is exactly the bug that would let "run now"
  // look like a way round the loop protection.
  const stopped = emitted.stopped.find((s) => s.ruleId === args.rule.id);
  if (stopped) {
    return {
      started: false,
      executionId: stopped.executionId,
      reason: stopped.reason === "rate_cap_exceeded"
        ? `This rule has already run its limit (${args.rule.windowCap}) against that record `
          + `inside the last ${args.rule.windowMinutes} minute(s).`
        : "Loop protection stopped this run before it started.",
    };
  }

  const deduped = emitted.deduplicated.find((d) => d.ruleId === args.rule.id);
  if (deduped) {
    return { started: false, executionId: null, reason: "This rule has already run for that event." };
  }
  return { started: false, executionId: null, reason: "The rule did not accept this record." };
}
