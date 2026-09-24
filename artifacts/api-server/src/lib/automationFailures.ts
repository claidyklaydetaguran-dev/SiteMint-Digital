// ── M6: automation that failed, and what a person may do about it ───────────
//
// ── The gap this closes ─────────────────────────────────────────────────────
//
// `docs/crm-ops/COMPLETENESS-2026-09-14.md` area 10: "No UI surfaces failed
// automation events — visible only by querying the table." Two tables held
// failures nobody could see:
//
//   crm_automation_events      an occurrence that never reached rule
//                              evaluation. No rule ran. Nothing anywhere said
//                              so, except a column.
//   crm_automation_executions  a run whose action failed to its budget, whose
//                              outcome came back unknown, or that a loop brake
//                              stopped.
//
// Both are kept deliberately separate here rather than flattened into one
// "failure" row, because they differ in the way that matters most to whoever is
// reading: a run names the RULE that fired, and an event has no rule at all —
// it never got that far. A list that pretended otherwise would have to invent a
// rule name, and the first question an operator asks is "which automation did
// this".
//
// ── This module decides three things and nothing else ───────────────────────
//
//   1. Which rows count as a failure at all (`eventFailureWhere` /
//      `runFailureWhere`). Deliberate outcomes — a stop condition, a disabled
//      rule, a record that was deleted, a rejected approval — are NOT failures
//      and are not listed. Listing them would bury the four kinds that need a
//      person under noise that does not.
//   2. Which of the two recovery verbs each row may be offered, and the exact
//      words for why the other one is withheld.
//   3. What each verb actually does.
//
// ── Nothing here releases anything ──────────────────────────────────────────
//
// Every read is a SELECT. No listing call drains a queue, emits an event, or
// re-runs anything, and `retry` deliberately does NOT drain either: it re-queues
// the one item a person named and leaves the worker to claim it. Draining inside
// the route would run every other queued execution too, which is a queue
// releasing itself as a side effect of somebody pressing a button about one row.

import {
  and, asc, count, desc, eq, gt, inArray, isNotNull, lt, or, sql,
  type SQL, type SQLWrapper,
} from "drizzle-orm";
import {
  db,
  crmAutomationEvents, crmAutomationExecutions, crmAutomationActionRuns,
  crmAutomationRules, crmAutomationRecoveryActions,
  CRM_AUTOMATION_RECOVERY_ACTIONS,
  type CrmAutomationFailureTarget, type CrmAutomationRecoveryAction,
  type CrmAutomationRecoveryActionRow,
} from "@workspace/db";
import { enqueueAutomationJob } from "./automationEngine.js";

// ── The closed failure vocabulary ───────────────────────────────────────────

/**
 * What kind of failure this is.
 *
 * Closed on purpose, and six rather than two, because "retry" is only a safe
 * offer for some of them and an operator has to be able to see which without
 * reading the code. The `*_retrying` two are not yet anybody's problem — they
 * are listed so that "it is still going to be tried again" is a visible answer
 * rather than an assumption.
 */
export const CRM_AUTOMATION_FAILURES = [
  "event_retrying",
  "event_gave_up",
  "run_retrying",
  "run_failed_definitively",
  "run_outcome_unknown",
  "run_stopped_by_loop_protection",
] as const;
export type CrmAutomationFailure = (typeof CRM_AUTOMATION_FAILURES)[number];

/** What each failure means, in the words the screen shows. */
export const FAILURE_LABEL: Record<CrmAutomationFailure, string> = {
  event_retrying: "Will try again",
  event_gave_up: "Never ran",
  run_retrying: "Will try again",
  run_failed_definitively: "Failed",
  run_outcome_unknown: "Unknown outcome",
  run_stopped_by_loop_protection: "Stopped by loop protection",
};

/**
 * Why `retry` is not on offer, per failure. Empty string where it IS on offer.
 *
 * These are the exact words the API returns and the screen renders — the reason
 * lives here, once, rather than being re-derived by the client and getting
 * subtly wrong.
 */
export const RETRY_WITHHELD: Record<CrmAutomationFailure, string> = {
  event_retrying:
    "Nothing to do — this has not given up. A worker will attempt it again by itself, and retrying it "
    + "now would only race that attempt.",
  event_gave_up: "",
  run_retrying:
    "Nothing to do — this run is already queued for another attempt. Retrying it now would only race "
    + "that attempt.",
  run_failed_definitively: "",
  run_outcome_unknown:
    "Retry is withheld here, and deliberately. A step of this run came back UNKNOWN: the write may "
    + "already have landed, so re-running it could create a second task, raise a second notification "
    + "or add a second note. Nobody knows which, including us. Check the record, then acknowledge "
    + "this — or, if the work genuinely did not happen, run the rule from the rule itself, which "
    + "creates a new run you can see rather than silently repeating this one.",
  run_stopped_by_loop_protection:
    "Retry is withheld here, and deliberately. Loop protection stopped this run — re-running it is "
    + "precisely what the brake exists to prevent. If the limit is wrong, change the rule's chain "
    + "depth or its per-record cap; if the rule is looping, fix the rule. Neither is something a "
    + "retry button should be able to do.",
};

/** What retrying this failure would actually do, stated before it is pressed. */
export const RETRY_MEANS: Record<CrmAutomationFailure, string> = {
  event_retrying: "",
  event_gave_up:
    "Puts the event back on the queue for exactly ONE more attempt. It keeps its original occurrence "
    + "key, so any rule that already ran for this occurrence is refused a second execution by the "
    + "database — not by this code remembering to check. Every loop brake is re-evaluated from "
    + "scratch, because the retry goes through the same emission path an ordinary event does.",
  run_retrying: "",
  run_failed_definitively:
    "Puts the run back on the queue for exactly ONE more attempt at the step that failed. Steps that "
    + "already succeeded are skipped, so nothing that worked is repeated; the failed step recorded "
    + "that it definitively did not happen, so attempting it again cannot duplicate anything. The "
    + "rule's conditions and stop conditions are re-checked against the record as it stands now.",
  run_outcome_unknown: "",
  run_stopped_by_loop_protection: "",
};

/** A plain-English line per failure: what it is and what to do. */
export const FAILURE_GUIDANCE: Record<CrmAutomationFailure, string> = {
  event_retrying:
    "Something happened that automation has not managed to act on yet. It is being retried with "
    + "backoff and will either go through or give up visibly. Nothing is lost either way.",
  event_gave_up:
    "This occurrence never reached rule evaluation at all — no rule ran for it, and none will "
    + "without a person. Read the error, fix the cause, then retry it.",
  run_retrying:
    "A step of this run failed and the rule still has retry budget left, so it is queued to try "
    + "again. Nothing needs doing yet.",
  run_failed_definitively:
    "A step failed as many times as this rule allows, and it definitively did not happen — so "
    + "nothing was half-applied. Fix what it was complaining about, then retry.",
  run_outcome_unknown:
    "A step was sent to the database and the answer never came back. It may or may not have taken "
    + "effect, and nothing retries it automatically because a retry could repeat it. Open the record, "
    + "see what is actually there, then acknowledge this.",
  run_stopped_by_loop_protection:
    "A loop brake stopped this run before it could act. That is the protection working, not a fault "
    + "in this run — but a rule hitting it repeatedly is a rule that needs rewriting.",
};

export const AUTOMATION_FAILURE_DEFINITIONS = {
  kinds:
    "An `event` is an occurrence that never became rule executions — there is no rule on it because "
    + "it never got that far. A `run` is one rule against one record for one occurrence.",
  retry:
    "Re-runs it, and is offered ONLY where re-running cannot repeat a side effect. It buys exactly "
    + "one more attempt, keeps the original occurrence key, and passes through every loop brake "
    + "again. It is withheld from a run with an unknown step, from anything a worker will attempt by "
    + "itself, and from a run a loop brake stopped.",
  acknowledge:
    "Records that a person decided nothing more is needed. It re-runs NOTHING and changes no "
    + "automation state at all — the event or the run is left exactly as it was, including its "
    + "status, its attempt count and its error. Only the fact that somebody closed it is new.",
  noAutoRelease:
    "Reading this list never retries, emits or releases anything, and a retry re-queues only the one "
    + "item you named — it does not drain the queue.",
  resolution:
    "An item is resolved when its most recent recovery action is an acknowledgement, and unresolved "
    + "again the moment somebody retries it. There is no resolved flag on the automation tables "
    + "themselves; the recovery log is the record.",
  paging:
    "Events and runs are two tables, so they are paged as two keyset streams on their own immutable "
    + "ids and merged for display. `nextCursor` carries one cursor per stream and `hasMore` is true "
    + "while either has another page. `counts.matchingFilters` is the whole filtered set, not the "
    + "page — nothing unresolved is ever hidden by a display limit.",
} as const;

// ── Which rows are failures ─────────────────────────────────────────────────

/** The two loop brakes that stop a run. A stop for any other reason is not a failure. */
export const LOOP_BRAKE_STOP_REASONS = ["chain_depth_exceeded", "rate_cap_exceeded"] as const;

/**
 * Events that failed.
 *
 * `failed` is the event that gave up. `pending` with an attempt and an error
 * behind it is one that is still being retried — it has already gone wrong once
 * and is worth seeing, which is the same judgement `deliveryNeedsAttention()`
 * makes about a reminder delivery. A `pending` event with no attempt yet is
 * simply queued and is nobody's problem.
 */
export function eventFailureWhere(): SQL {
  return or(
    eq(crmAutomationEvents.status, "failed"),
    and(
      eq(crmAutomationEvents.status, "pending"),
      gt(crmAutomationEvents.attempts, 0),
      isNotNull(crmAutomationEvents.lastError),
    ),
  )!;
}

/**
 * Runs that failed.
 *
 * Deliberately NOT every `stopped` run. A stop condition becoming true, a rule
 * being switched off mid-flight, a record being deleted and an approver saying
 * no are all correct outcomes that the system is supposed to produce; listing
 * them as failures would bury the ones that need a person.
 */
export function runFailureWhere(): SQL {
  return or(
    eq(crmAutomationExecutions.status, "failed"),
    // A queued run that has ALREADY been attempted — by the engine's own retry
    // path, or by a person through this surface. Either marker is enough: the
    // engine sets both when it re-arms a failed step, and a fresh run that has
    // never been attempted has neither, which is why it is correctly absent.
    and(
      eq(crmAutomationExecutions.status, "queued"),
      or(
        gt(crmAutomationExecutions.attempts, 0),
        isNotNull(crmAutomationExecutions.nextAttemptAt),
      ),
    ),
    and(
      eq(crmAutomationExecutions.status, "stopped"),
      inArray(crmAutomationExecutions.stopReason, [...LOOP_BRAKE_STOP_REASONS]),
    ),
  )!;
}

/**
 * "The latest recovery action for this row is not an acknowledgement."
 *
 * Ordered by id rather than by time so two actions inside one millisecond still
 * have a defined latest, and written as a correlated subquery so the unresolved
 * filter is one predicate the database can apply rather than a second pass in
 * application code that would page incorrectly.
 */
function notAcknowledged(kind: CrmAutomationFailureTarget, idColumn: SQLWrapper): SQL {
  return sql`(
    SELECT ra.action FROM crm_automation_recovery_actions ra
    WHERE ra.target_kind = ${kind} AND ra.target_id = ${idColumn}
    ORDER BY ra.id DESC LIMIT 1
  ) IS DISTINCT FROM 'acknowledge'`;
}

// ── The shape one failure takes over HTTP ───────────────────────────────────

export interface AutomationFailureStep {
  actionIndex: number;
  actionType: string;
  status: string;
  attempts: number;
  detail: string | null;
  affectedRecordType: string | null;
  affectedRecordId: number | null;
}

export interface AutomationFailureRecovery {
  id: number;
  action: string;
  reason: string;
  actorStaffId: number | null;
  actorLabel: string;
  previousStatus: string;
  previousFailure: string | null;
  detail: string | null;
  at: string;
}

export interface AutomationFailureRow {
  /** Stable composite key, so a merged list has no id collisions. */
  key: string;
  kind: CrmAutomationFailureTarget;
  id: number;

  failure: CrmAutomationFailure;
  failureLabel: string;

  /** Null on an event: it never reached rule evaluation, so no rule fired. */
  ruleId: number | null;
  ruleName: string | null;

  trigger: string;
  recordType: string;
  recordId: number;
  occurrenceKey: string;

  /** The row's own status, verbatim, so nothing is hidden behind our label. */
  status: string;
  stopReason: string | null;

  attempts: number;
  /** The budget: the event's own, or the rule's `maxActionAttempts` for a run. */
  maxAttempts: number | null;
  nextAttemptAt: string | null;
  willRetryAutomatically: boolean;

  /** The error, in the words the machine recorded. Never a stack trace. */
  error: string | null;

  chainDepth: number;
  chainRuleIds: number[];

  /** For a run: what each action did. Empty for an event — none were attempted. */
  steps: AutomationFailureStep[];

  availableActions: CrmAutomationRecoveryAction[];
  /** Why retry is not on offer. Empty string when it is. */
  retryWithheldReason: string;
  /** What retry would do. Empty string when retry is not on offer. */
  retryMeans: string;
  guidance: string;

  createdAt: string;
  at: string;

  resolvedAt: string | null;
  resolvedByLabel: string | null;
  resolutionNote: string | null;
  lastRecovery: AutomationFailureRecovery | null;
}

type EventRow = typeof crmAutomationEvents.$inferSelect;
type RunRow = typeof crmAutomationExecutions.$inferSelect;
type ActionRunRow = typeof crmAutomationActionRuns.$inferSelect;

export function classifyEvent(row: EventRow): CrmAutomationFailure {
  return row.status === "failed" ? "event_gave_up" : "event_retrying";
}

/**
 * Classifies a run, which needs its action runs.
 *
 * The `unknown` test is the consequential one: it is what separates "retrying
 * cannot duplicate" from "retrying might do it twice", and it is answered from
 * the recorded step outcomes rather than from the execution's own status, which
 * says `failed` in both cases.
 */
export function classifyRun(row: RunRow, steps: ActionRunRow[]): CrmAutomationFailure {
  if (row.status === "stopped") return "run_stopped_by_loop_protection";
  if (row.status === "queued") return "run_retrying";
  return steps.some((s) => s.status === "unknown")
    ? "run_outcome_unknown"
    : "run_failed_definitively";
}

function availableActions(failure: CrmAutomationFailure, resolved: boolean): CrmAutomationRecoveryAction[] {
  const actions: CrmAutomationRecoveryAction[] = [];
  if (RETRY_WITHHELD[failure] === "") actions.push("retry");
  // Acknowledging something a worker is still going to attempt would be closing
  // a case the machine has not finished, and it would re-open itself.
  const settled = failure !== "event_retrying" && failure !== "run_retrying";
  if (settled && !resolved) actions.push("acknowledge");
  return actions;
}

function recoveryShape(row: CrmAutomationRecoveryActionRow): AutomationFailureRecovery {
  return {
    id: row.id,
    action: row.action,
    reason: row.reason,
    actorStaffId: row.actorStaffId,
    actorLabel: row.actorLabel,
    previousStatus: row.previousStatus,
    previousFailure: row.previousFailure,
    detail: row.detail,
    at: row.createdAt.toISOString(),
  };
}

function withRecovery(
  base: Omit<AutomationFailureRow,
    "availableActions" | "retryWithheldReason" | "retryMeans" | "guidance"
    | "resolvedAt" | "resolvedByLabel" | "resolutionNote" | "lastRecovery" | "failureLabel">,
  latest: CrmAutomationRecoveryActionRow | undefined,
): AutomationFailureRow {
  const resolved = latest?.action === "acknowledge";
  return {
    ...base,
    failureLabel: FAILURE_LABEL[base.failure],
    availableActions: availableActions(base.failure, resolved),
    retryWithheldReason: RETRY_WITHHELD[base.failure],
    retryMeans: RETRY_MEANS[base.failure],
    guidance: FAILURE_GUIDANCE[base.failure],
    resolvedAt: resolved ? latest!.createdAt.toISOString() : null,
    resolvedByLabel: resolved ? latest!.actorLabel : null,
    resolutionNote: resolved ? latest!.reason : null,
    lastRecovery: latest ? recoveryShape(latest) : null,
  };
}

export function eventShape(
  row: EventRow, latest: CrmAutomationRecoveryActionRow | undefined,
): AutomationFailureRow {
  const failure = classifyEvent(row);
  return withRecovery({
    key: `event:${row.id}`,
    kind: "event",
    id: row.id,
    failure,
    ruleId: null,
    ruleName: null,
    trigger: row.trigger,
    recordType: row.recordType,
    recordId: row.recordId,
    occurrenceKey: row.occurrenceKey,
    status: row.status,
    stopReason: null,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    willRetryAutomatically: failure === "event_retrying",
    error: row.lastError,
    chainDepth: row.chainDepth,
    chainRuleIds: row.chainRuleIds ?? [],
    steps: [],
    createdAt: row.createdAt.toISOString(),
    at: row.updatedAt.toISOString(),
  }, latest);
}

export function runShape(
  row: RunRow,
  steps: ActionRunRow[],
  rule: { id: number; name: string; maxActionAttempts: number } | undefined,
  latest: CrmAutomationRecoveryActionRow | undefined,
): AutomationFailureRow {
  const failure = classifyRun(row, steps);
  return withRecovery({
    key: `run:${row.id}`,
    kind: "run",
    id: row.id,
    failure,
    ruleId: row.ruleId,
    ruleName: rule?.name ?? null,
    trigger: row.trigger,
    recordType: row.recordType,
    recordId: row.recordId,
    occurrenceKey: row.occurrenceKey,
    status: row.status,
    stopReason: row.stopReason,
    attempts: row.attempts,
    maxAttempts: rule?.maxActionAttempts ?? null,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    willRetryAutomatically: failure === "run_retrying",
    error: row.detail,
    chainDepth: row.chainDepth,
    chainRuleIds: row.chainRuleIds ?? [],
    steps: steps
      .slice()
      .sort((a, b) => a.actionIndex - b.actionIndex)
      .map((s) => ({
        actionIndex: s.actionIndex,
        actionType: s.actionType,
        status: s.status,
        attempts: s.attempts,
        detail: s.detail,
        affectedRecordType: s.affectedRecordType,
        affectedRecordId: s.affectedRecordId,
      })),
    createdAt: row.createdAt.toISOString(),
    at: row.updatedAt.toISOString(),
  }, latest);
}

// ── Reading the recovery log ────────────────────────────────────────────────

async function latestRecoveryByTarget(
  kind: CrmAutomationFailureTarget, ids: number[],
): Promise<Map<number, CrmAutomationRecoveryActionRow>> {
  const out = new Map<number, CrmAutomationRecoveryActionRow>();
  if (ids.length === 0) return out;
  const rows = await db.select().from(crmAutomationRecoveryActions)
    .where(and(
      eq(crmAutomationRecoveryActions.targetKind, kind),
      inArray(crmAutomationRecoveryActions.targetId, ids),
    ))
    .orderBy(asc(crmAutomationRecoveryActions.id));
  // Ascending, so the last write per target wins and "latest" needs no
  // comparison logic that could disagree with the ORDER BY above.
  for (const row of rows) out.set(row.targetId, row);
  return out;
}

export async function recoveryHistory(
  kind: CrmAutomationFailureTarget, id: number,
): Promise<AutomationFailureRecovery[]> {
  const rows = await db.select().from(crmAutomationRecoveryActions)
    .where(and(
      eq(crmAutomationRecoveryActions.targetKind, kind),
      eq(crmAutomationRecoveryActions.targetId, id),
    ))
    .orderBy(desc(crmAutomationRecoveryActions.id))
    .limit(200);
  return rows.map(recoveryShape);
}

// ── Listing ─────────────────────────────────────────────────────────────────

export interface AutomationFailureListArgs {
  /** `unresolved` (default) hides anything whose latest action is an acknowledgement. */
  scope?: "unresolved" | "all";
  /** Narrow to one stream. Absent means both. */
  kind?: CrmAutomationFailureTarget | null;
  limit?: number;
  /** Keyset position in each stream. Absent means "from the newest". */
  runCursor?: number | null;
  eventCursor?: number | null;
}

export interface AutomationFailureList {
  failures: AutomationFailureRow[];
  nextCursor: { run: number | null; event: number | null };
  hasMore: boolean;
  counts: {
    matchingFilters: number;
    byFailure: Record<CrmAutomationFailure, number>;
    byKind: { event: number; run: number };
    returnedOnThisPage: number;
  };
}

const LIMIT_DEFAULT = 25;
const LIMIT_MAX = 100;

/**
 * The failure queue, merged from two tables and paged on each table's own
 * immutable id.
 *
 * Keyset rather than offset, for the same reason the delivery queue is: an
 * unresolved failure is an automation that did not happen, and a page that can
 * drop one is worse than no page at all because it looks complete. Two streams
 * means two cursors — merging them onto one would need a shared ordering key
 * that neither table has, and inventing one out of timestamps would silently
 * skip rows that share an instant.
 */
export async function listAutomationFailures(
  args: AutomationFailureListArgs = {},
): Promise<AutomationFailureList> {
  const scope = args.scope === "all" ? "all" : "unresolved";
  const limit = Math.min(Math.max(Math.trunc(args.limit ?? LIMIT_DEFAULT), 1), LIMIT_MAX);
  const wantEvents = args.kind !== "run";
  const wantRuns = args.kind !== "event";

  const eventWhere = (extra: SQL[] = []) => and(
    eventFailureWhere(),
    ...(scope === "unresolved" ? [notAcknowledged("event", crmAutomationEvents.id)] : []),
    ...extra,
  );
  const runWhere = (extra: SQL[] = []) => and(
    runFailureWhere(),
    ...(scope === "unresolved" ? [notAcknowledged("run", crmAutomationExecutions.id)] : []),
    ...extra,
  );

  // One extra row per stream answers "is there another page?" without a second
  // count that could disagree with the list it labels.
  const [eventRows, runRows] = await Promise.all([
    wantEvents
      ? db.select().from(crmAutomationEvents)
          .where(eventWhere(args.eventCursor != null
            ? [lt(crmAutomationEvents.id, args.eventCursor)] : []))
          .orderBy(desc(crmAutomationEvents.id)).limit(limit + 1)
      : Promise.resolve([] as EventRow[]),
    wantRuns
      ? db.select().from(crmAutomationExecutions)
          .where(runWhere(args.runCursor != null
            ? [lt(crmAutomationExecutions.id, args.runCursor)] : []))
          .orderBy(desc(crmAutomationExecutions.id)).limit(limit + 1)
      : Promise.resolve([] as RunRow[]),
  ]);

  const eventsHaveMore = eventRows.length > limit;
  const runsHaveMore = runRows.length > limit;
  const eventPage = eventsHaveMore ? eventRows.slice(0, limit) : eventRows;
  const runPage = runsHaveMore ? runRows.slice(0, limit) : runRows;

  const runIds = runPage.map((r) => r.id);
  const ruleIds = [...new Set(runPage.map((r) => r.ruleId))];

  const [steps, rules, eventRecovery, runRecovery] = await Promise.all([
    runIds.length
      ? db.select().from(crmAutomationActionRuns)
          .where(inArray(crmAutomationActionRuns.executionId, runIds))
      : Promise.resolve([] as ActionRunRow[]),
    ruleIds.length
      ? db.select({
          id: crmAutomationRules.id, name: crmAutomationRules.name,
          maxActionAttempts: crmAutomationRules.maxActionAttempts,
        }).from(crmAutomationRules).where(inArray(crmAutomationRules.id, ruleIds))
      : Promise.resolve([] as { id: number; name: string; maxActionAttempts: number }[]),
    latestRecoveryByTarget("event", eventPage.map((r) => r.id)),
    latestRecoveryByTarget("run", runIds),
  ]);

  const stepsByRun = new Map<number, ActionRunRow[]>();
  for (const s of steps) stepsByRun.set(s.executionId, [...(stepsByRun.get(s.executionId) ?? []), s]);
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  const failures = [
    ...eventPage.map((row) => eventShape(row, eventRecovery.get(row.id))),
    ...runPage.map((row) => runShape(
      row, stepsByRun.get(row.id) ?? [], ruleById.get(row.ruleId), runRecovery.get(row.id),
    )),
    // Merged newest-first for display. Paging stays per-stream, so this ordering
    // is presentation only and can never decide which rows exist.
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  // Counts over the WHOLE filtered set, not the page. The classification is
  // expressed in SQL so a tally cannot drift from the labels above.
  const [eventTally, runTally] = await Promise.all([
    wantEvents
      ? db.select({
          failure: sql<string>`CASE WHEN ${crmAutomationEvents.status} = 'failed'
            THEN 'event_gave_up' ELSE 'event_retrying' END`,
          n: count(),
        }).from(crmAutomationEvents).where(eventWhere()).groupBy(sql`1`)
      : Promise.resolve([] as { failure: string; n: number }[]),
    wantRuns
      ? db.select({
          failure: sql<string>`CASE
            WHEN ${crmAutomationExecutions.status} = 'stopped' THEN 'run_stopped_by_loop_protection'
            WHEN ${crmAutomationExecutions.status} = 'queued'  THEN 'run_retrying'
            WHEN EXISTS (
              SELECT 1 FROM crm_automation_action_runs ar
              WHERE ar.execution_id = ${crmAutomationExecutions.id} AND ar.status = 'unknown'
            ) THEN 'run_outcome_unknown'
            ELSE 'run_failed_definitively' END`,
          n: count(),
        }).from(crmAutomationExecutions).where(runWhere()).groupBy(sql`1`)
      : Promise.resolve([] as { failure: string; n: number }[]),
  ]);

  const byFailure = Object.fromEntries(
    CRM_AUTOMATION_FAILURES.map((f) => [f, 0]),
  ) as Record<CrmAutomationFailure, number>;
  let eventTotal = 0;
  let runTotal = 0;
  for (const row of eventTally) {
    byFailure[row.failure as CrmAutomationFailure] = Number(row.n);
    eventTotal += Number(row.n);
  }
  for (const row of runTally) {
    byFailure[row.failure as CrmAutomationFailure] = Number(row.n);
    runTotal += Number(row.n);
  }

  return {
    failures,
    nextCursor: {
      event: eventsHaveMore ? eventPage[eventPage.length - 1]?.id ?? null : null,
      run: runsHaveMore ? runPage[runPage.length - 1]?.id ?? null : null,
    },
    hasMore: eventsHaveMore || runsHaveMore,
    counts: {
      matchingFilters: eventTotal + runTotal,
      byFailure,
      byKind: { event: eventTotal, run: runTotal },
      returnedOnThisPage: failures.length,
    },
  };
}

/** One failure in full, or null when nothing by that id is one. */
export async function getAutomationFailure(
  kind: CrmAutomationFailureTarget, id: number,
): Promise<AutomationFailureRow | null> {
  if (kind === "event") {
    const [row] = await db.select().from(crmAutomationEvents)
      .where(and(eq(crmAutomationEvents.id, id), eventFailureWhere())).limit(1);
    if (!row) return null;
    const latest = await latestRecoveryByTarget("event", [row.id]);
    return eventShape(row, latest.get(row.id));
  }

  const [row] = await db.select().from(crmAutomationExecutions)
    .where(and(eq(crmAutomationExecutions.id, id), runFailureWhere())).limit(1);
  if (!row) return null;
  const [steps, rules, latest] = await Promise.all([
    db.select().from(crmAutomationActionRuns)
      .where(eq(crmAutomationActionRuns.executionId, row.id)),
    db.select({
      id: crmAutomationRules.id, name: crmAutomationRules.name,
      maxActionAttempts: crmAutomationRules.maxActionAttempts,
    }).from(crmAutomationRules).where(eq(crmAutomationRules.id, row.ruleId)).limit(1),
    latestRecoveryByTarget("run", [row.id]),
  ]);
  return runShape(row, steps, rules[0], latest.get(row.id));
}

// ── Recovery ────────────────────────────────────────────────────────────────

export type AutomationRecoveryResult =
  | { ok: true; failure: AutomationFailureRow; action: CrmAutomationRecoveryActionRow }
  | { ok: false; status: number; error: string };

/**
 * Does one of the two things a person may do, and records that they did it.
 *
 * Both verbs go through here so the recording cannot be forgotten by one of
 * them, and so the refusals are decided in one place from one classification
 * rather than re-derived per route.
 */
export async function recoverAutomationFailure(args: {
  kind: CrmAutomationFailureTarget;
  id: number;
  action: CrmAutomationRecoveryAction;
  reason: string;
  actorStaffId: number | null;
  actorLabel: string;
  now?: Date;
}): Promise<AutomationRecoveryResult> {
  const reason = (args.reason ?? "").trim();
  if (reason.length < 3) {
    return {
      ok: false, status: 400,
      error: "Say why you are doing this — it is recorded against the automation and it is the only "
        + "thing that will explain this decision to whoever finds it next.",
    };
  }
  if (!(CRM_AUTOMATION_RECOVERY_ACTIONS as readonly string[]).includes(args.action)) {
    return { ok: false, status: 400, error: "Unknown recovery action." };
  }

  const before = await getAutomationFailure(args.kind, args.id);
  if (!before) {
    return {
      ok: false, status: 404,
      error: "Nothing by that id is a failed automation. It may have succeeded, been retried by a "
        + "worker, or never have failed at all.",
    };
  }

  if (!before.availableActions.includes(args.action)) {
    if (args.action === "retry") {
      return { ok: false, status: 409, error: before.retryWithheldReason || "Retry is not available here." };
    }
    return {
      ok: false, status: 409,
      error: before.resolvedAt
        ? "Somebody has already acknowledged this."
        : "This has not finished yet — a worker is still going to attempt it. Acknowledging it now "
          + "would close a case the machine has not closed, and it would re-open itself on the next "
          + "attempt.",
    };
  }

  const now = args.now ?? new Date();
  const audit = {
    targetKind: args.kind,
    targetId: args.id,
    action: args.action,
    reason,
    actorStaffId: args.actorStaffId,
    actorLabel: args.actorLabel,
    previousStatus: before.status,
    previousAttempts: before.attempts,
    previousFailure: before.failure,
  };

  // ── acknowledge ───────────────────────────────────────────────────────────
  //
  // Writes the decision and NOTHING else. No status change, no queue write, no
  // re-run, not even an `updated_at` touch on the automation row — so "somebody
  // looked at this" can never be mistaken for "something happened to it".
  if (args.action === "acknowledge") {
    const [action] = await db.insert(crmAutomationRecoveryActions).values({
      ...audit,
      detail: "Closed by a person. Nothing was re-run and no automation state changed.",
      createdAt: now,
    }).returning();
    const after = await getAutomationFailure(args.kind, args.id);
    return { ok: true, failure: after ?? before, action: action! };
  }

  // ── retry ─────────────────────────────────────────────────────────────────
  if (args.kind === "event") {
    // Guarded on the status we classified from, so two people retrying at once
    // cannot both win and a row a worker moved underneath us is refused rather
    // than silently re-queued from a stale reading.
    //
    // `max_attempts` is raised to `attempts + 1` rather than `attempts` being
    // zeroed: the attempt history stays true, and the row buys exactly ONE more
    // attempt before it comes back here visibly instead of an unbounded budget
    // nobody asked for.
    const [updated] = await db.update(crmAutomationEvents).set({
      status: "pending",
      nextAttemptAt: now,
      maxAttempts: sql`${crmAutomationEvents.attempts} + 1`,
      lockedAt: null,
      lockedBy: null,
      updatedAt: now,
    }).where(and(
      eq(crmAutomationEvents.id, args.id),
      eq(crmAutomationEvents.status, "failed"),
    )).returning();
    if (!updated) {
      return {
        ok: false, status: 409,
        error: "This event changed while you were looking at it. Reload and try again.",
      };
    }
    const [action] = await db.insert(crmAutomationRecoveryActions).values({
      ...audit,
      detail: "Re-queued for exactly one more attempt, keeping its original occurrence key. Every "
        + "loop brake is re-evaluated when it runs.",
      createdAt: now,
    }).returning();
    const after = await getAutomationFailure(args.kind, args.id);
    return { ok: true, failure: after ?? before, action: action! };
  }

  // A run. `queued` is what the engine's own retry path sets, so this puts the
  // execution back exactly where a failed-but-not-exhausted step would be. The
  // executor skips every step already recorded `succeeded` or `skipped`, so the
  // only thing re-attempted is the step that failed — and it failed
  // definitively, which is why retry was offered at all.
  const [updated] = await db.update(crmAutomationExecutions).set({
    status: "queued",
    nextAttemptAt: now,
    finishedAt: null,
    detail: `Retried by ${args.actorLabel}: ${reason}`.slice(0, 1000),
    updatedAt: now,
  }).where(and(
    eq(crmAutomationExecutions.id, args.id),
    eq(crmAutomationExecutions.status, "failed"),
  )).returning();
  if (!updated) {
    return {
      ok: false, status: 409,
      error: "This run changed while you were looking at it. Reload and try again.",
    };
  }

  // Queued, not drained. The worker claims it on its own tick; running it here
  // would also claim every other queued execution, which is a queue releasing
  // itself because somebody pressed a button about one row.
  await enqueueAutomationJob(args.id, now);

  const [action] = await db.insert(crmAutomationRecoveryActions).values({
    ...audit,
    detail: "Re-queued for exactly one more attempt at the step that failed. Steps that already "
      + "succeeded are skipped, and the rule's conditions are re-checked against the record as it "
      + "stands now.",
    createdAt: now,
  }).returning();
  const after = await getAutomationFailure(args.kind, args.id);
  return { ok: true, failure: after ?? before, action: action! };
}
