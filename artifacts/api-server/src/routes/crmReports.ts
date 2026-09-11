// ── Reporting ───────────────────────────────────────────────────────────────
//
// Every figure here obeys four rules, and the rules are the point of the file.
//
//  1. A figure states its DEFINITION and its DENOMINATOR. "Win rate: 40%" is
//     not information until you know 40% of what, over which dates, counted in
//     which timezone.
//
//  2. A figure is TRACEABLE. `GET /crm/reports/detail/<key>` hands back the
//     rows the figure counted, and the count equals that list — not because
//     somebody kept the two in step, but because the summary is computed BY
//     RUNNING THE DETAIL QUERY. There is one query per figure, and the number
//     is derived from its rows. Two queries answering one question is how two
//     numbers that should agree stop agreeing.
//
//  3. A figure that is NOT ACTUALLY TRACKED reports itself unavailable. Not
//     0%, not "—". A fabricated zero is worse than an honest gap, because a
//     zero is a measurement: it says "we looked, and the answer was none". If
//     nothing is wired to look, say that.
//
//  4. A ratio with an EMPTY DENOMINATOR is null. Never 0%. "Nobody has decided
//     any deals yet" and "everybody lost" are different facts.
//
// Days are counted in a named IANA timezone, stated in every response, and the
// boundaries are computed by PostgreSQL from that zone rather than by offset
// arithmetic here — which is how a report silently moves by an hour twice a
// year.

import { Router, type IRouter, type Request, type Response } from "express";
import { sql, type SQL } from "drizzle-orm";
import { db, TRANSACTION_RECEIVED_STATUS } from "@workspace/db";
import { requireCrmAuth } from "../lib/staffAuth.js";

const router: IRouter = Router();

/** Detail lists are bounded. Past this a figure says it cannot hand back its rows. */
const DETAIL_CAP = 5000;

// ── Request shaping ─────────────────────────────────────────────────────────

type Unit = "count" | "currency" | "percent" | "days" | "minutes";
type Area = "acquisition" | "sales" | "revenue" | "operations" | "support" | "campaigns" | "communications";
type FilterName = "dateRange" | "ownerStaffId" | "source" | "stage" | "status";

interface ReportContext {
  startAt: Date;
  endAt: Date;
  timezone: string;
  fromDate: string;
  toDate: string;
  ownerStaffId: number | undefined;
  source: string | undefined;
  stage: string | undefined;
  status: string | undefined;
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves the reporting window.
 *
 * The zone comes from the request, then the signed-in person's own
 * `crm_staff.timezone`, then UTC. It is echoed in every response because "how
 * many leads did we get on Monday" has a different answer in Manila and in
 * London, and a report that does not say which one it means is not an answer.
 *
 * PostgreSQL does the conversion (`date::timestamp AT TIME ZONE zone`) rather
 * than this process doing offset arithmetic, so a DST transition inside the
 * window is handled by the zone database instead of by a subtraction.
 */
async function resolveWindow(req: Request): Promise<ReportContext | { error: string }> {
  const q = req.query as Record<string, unknown>;

  const staffZone = req.staffAuth?.staff.timezone;
  const timezone = str(q["timezone"]) ?? (staffZone && staffZone.trim() ? staffZone : "UTC");

  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 29 * 86_400_000);
  const fromDate = str(q["from"]) ?? isoDay(defaultFrom);
  const toDate = str(q["to"]) ?? isoDay(today);

  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
    return { error: "Dates must be YYYY-MM-DD." };
  }
  if (fromDate > toDate) {
    return { error: "The window starts after it ends." };
  }

  let startAt: Date;
  let endAt: Date;
  try {
    // `to` is INCLUSIVE as a day, so the exclusive instant is the start of the
    // following local day. Anything else silently drops the last day's evening.
    const result = await db.execute(sql`
      SELECT (${fromDate}::date)::timestamp AT TIME ZONE ${timezone} AS start_at,
             ((${toDate}::date + 1)::timestamp AT TIME ZONE ${timezone}) AS end_at`);
    const row = result.rows[0] as { start_at: Date; end_at: Date } | undefined;
    if (!row) return { error: "Could not resolve the reporting window." };
    startAt = new Date(row.start_at);
    endAt = new Date(row.end_at);
  } catch {
    // An unknown zone is the only realistic failure here, and it is the
    // caller's mistake — name it rather than 500.
    return { error: `"${timezone}" is not a timezone PostgreSQL recognises. Use an IANA name such as Asia/Manila.` };
  }

  return {
    startAt, endAt, timezone, fromDate, toDate,
    ownerStaffId: num(q["ownerStaffId"]),
    source: str(q["source"]),
    stage: str(q["stage"]),
    status: str(q["status"]),
  };
}

// ── Figures ─────────────────────────────────────────────────────────────────

interface DetailRow {
  id: number;
  occurredAt: string | null;
  label: string;
  amount: number | null;
  href: string | null;
}

interface RawDetailRow {
  id: number;
  occurred_at: Date | null;
  label: string | null;
  amount: string | number | null;
  href: string | null;
}

type Aggregate = "count" | "sum" | "median";

interface CountedFigure {
  kind: "counted";
  key: string;
  area: Area;
  label: string;
  unit: Unit;
  aggregate: Aggregate;
  definition: string;
  /** What population the figure is drawn from, in words. */
  denominatorLabel: string | null;
  sources: string[];
  honours: FilterName[];
  limitations?: string[];
  /** Returns rows with columns: id, occurred_at, label, amount, href. */
  query: (ctx: ReportContext) => SQL;
  /** A non-null string means "this is not tracked here, and here is why". */
  availability?: () => string | null;
}

interface RatioFigure {
  kind: "ratio";
  key: string;
  area: Area;
  label: string;
  unit: "percent";
  definition: string;
  numeratorKey: string;
  denominatorKeys: string[];
  denominatorLabel: string;
  sources: string[];
  honours: FilterName[];
  limitations?: string[];
}

interface GapFigure {
  kind: "gap";
  key: string;
  area: Area;
  label: string;
  unit: Unit;
  definition: string;
  sources: string[];
  /** Why this cannot be measured. Always non-null — that is what a gap is. */
  reason: () => string;
  /** What would have to exist for it to become a real figure. */
  wouldRequire: string;
}

type FigureSpec = CountedFigure | RatioFigure | GapFigure;

// ── Shared SQL fragments ────────────────────────────────────────────────────

function inWindow(column: SQL, ctx: ReportContext): SQL {
  return sql`${column} >= ${ctx.startAt} AND ${column} < ${ctx.endAt}`;
}

/** Email open/click/bounce tracking exists only when its webhook is configured. */
function emailEngagementUnavailable(): string | null {
  const configured = typeof process.env["RESEND_WEBHOOK_SECRET"] === "string"
    && process.env["RESEND_WEBHOOK_SECRET"]!.length > 0;
  if (configured) return null;
  return "RESEND_WEBHOOK_SECRET is not set, so the provider webhook that would "
    + "record opens, clicks and bounces is disabled and no such event can ever "
    + "be written. Reporting 0% here would say 'we measured, and nobody opened "
    + "anything'. Nothing is measuring.";
}

// ── The registry ────────────────────────────────────────────────────────────
//
// One entry per figure. The summary and the detail route both read this, so a
// figure cannot mean one thing on a dashboard and another in its own evidence.

const FIGURES: readonly FigureSpec[] = [
  // ── Acquisition ───────────────────────────────────────────────────────────
  {
    kind: "counted", key: "leadsCreated", area: "acquisition",
    label: "Contacts created", unit: "count", aggregate: "count",
    definition: "Contact records whose created_at falls inside the window.",
    denominatorLabel: null,
    sources: ["crm_leads.created_at within the window"],
    honours: ["dateRange", "source"],
    limitations: ["Counts when the RECORD was created here, which is not necessarily when the enquiry arrived — an imported backlog all lands on its import date."],
    query: (ctx) => sql`
      SELECT l.id AS id, l.created_at AS occurred_at,
             (l.name || coalesce(' · ' || l.company, ''))::text AS label,
             NULL::numeric AS amount,
             ('/admin/crm/leads/' || l.id)::text AS href
      FROM crm_leads l
      WHERE ${inWindow(sql`l.created_at`, ctx)}
        ${ctx.source ? sql`AND l.source = ${ctx.source}` : sql``}
      ORDER BY l.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "leadStatusChanges", area: "acquisition",
    label: "Recorded status changes", unit: "count", aggregate: "count",
    definition: "Activity rows of type 'status_changed' written inside the window, each carrying the status moved from and to.",
    denominatorLabel: null,
    sources: ["crm_activities WHERE type = 'status_changed' within the window"],
    honours: ["dateRange"],
    limitations: [
      "Only the contact-edit route writes this activity. A status set by a CSV import, by the sales conversion path, or by any other writer leaves no activity row and is invisible here.",
      "This is therefore a LOWER BOUND on status movement, not a census of it. It is reported because the rows are real, not because the set is complete.",
    ],
    query: (ctx) => sql`
      SELECT a.id AS id, a.created_at AS occurred_at,
             (a.title || coalesce(' (' || (a.metadata->>'from') || ' → ' || (a.metadata->>'to') || ')', ''))::text AS label,
             NULL::numeric AS amount,
             ('/admin/crm/leads/' || a.lead_id)::text AS href
      FROM crm_activities a
      WHERE a.type = 'status_changed' AND ${inWindow(sql`a.created_at`, ctx)}
      ORDER BY a.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },

  // ── Sales ─────────────────────────────────────────────────────────────────
  {
    kind: "counted", key: "dealsOpened", area: "sales",
    label: "Deals opened", unit: "count", aggregate: "count",
    definition: "Deals whose created_at falls inside the window.",
    denominatorLabel: null,
    sources: ["crm_deals.created_at within the window"],
    honours: ["dateRange", "ownerStaffId", "source", "stage"],
    query: (ctx) => sql`
      SELECT d.id AS id, d.created_at AS occurred_at, d.name::text AS label,
             d.value AS amount, ('/admin/crm/deals?id=' || d.id)::text AS href
      FROM crm_deals d LEFT JOIN crm_leads l ON l.id = d.lead_id
      WHERE ${inWindow(sql`d.created_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND d.owner_staff_id = ${ctx.ownerStaffId}` : sql``}
        ${ctx.source ? sql`AND l.source = ${ctx.source}` : sql``}
        ${ctx.stage ? sql`AND d.stage = ${ctx.stage}` : sql``}
      ORDER BY d.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "dealsWon", area: "sales",
    label: "Deals won", unit: "count", aggregate: "count",
    definition: "Deals whose won_at — the instant somebody marked them won, not the expected close date — falls inside the window.",
    denominatorLabel: null,
    sources: ["crm_deals WHERE won_at within the window"],
    honours: ["dateRange", "ownerStaffId", "source"],
    query: (ctx) => sql`
      SELECT d.id AS id, d.won_at AS occurred_at, d.name::text AS label,
             d.value AS amount, ('/admin/crm/deals?id=' || d.id)::text AS href
      FROM crm_deals d LEFT JOIN crm_leads l ON l.id = d.lead_id
      WHERE d.won_at IS NOT NULL AND ${inWindow(sql`d.won_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND d.owner_staff_id = ${ctx.ownerStaffId}` : sql``}
        ${ctx.source ? sql`AND l.source = ${ctx.source}` : sql``}
      ORDER BY d.won_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "dealsLost", area: "sales",
    label: "Deals lost", unit: "count", aggregate: "count",
    definition: "Deals whose lost_at falls inside the window.",
    denominatorLabel: null,
    sources: ["crm_deals WHERE lost_at within the window"],
    honours: ["dateRange", "ownerStaffId", "source"],
    query: (ctx) => sql`
      SELECT d.id AS id, d.lost_at AS occurred_at,
             (d.name || coalesce(' — ' || d.lost_reason, ' — no reason recorded'))::text AS label,
             d.value AS amount, ('/admin/crm/deals?id=' || d.id)::text AS href
      FROM crm_deals d LEFT JOIN crm_leads l ON l.id = d.lead_id
      WHERE d.lost_at IS NOT NULL AND ${inWindow(sql`d.lost_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND d.owner_staff_id = ${ctx.ownerStaffId}` : sql``}
        ${ctx.source ? sql`AND l.source = ${ctx.source}` : sql``}
      ORDER BY d.lost_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "ratio", key: "winRate", area: "sales",
    label: "Win rate", unit: "percent",
    definition: "Deals won as a share of deals DECIDED in the window. Open deals are excluded: they have not been decided, and counting them as losses would make every healthy pipeline look like a failure.",
    numeratorKey: "dealsWon", denominatorKeys: ["dealsWon", "dealsLost"],
    denominatorLabel: "Deals won plus deals lost, both dated by when they were decided",
    sources: ["crm_deals WHERE won_at within the window", "crm_deals WHERE lost_at within the window"],
    honours: ["dateRange", "ownerStaffId", "source"],
  },
  {
    kind: "counted", key: "contractedValue", area: "sales",
    label: "Contracted value", unit: "currency", aggregate: "sum",
    definition: "The face value of deals won in the window. AGREED money, not money that has arrived — see moneyReceived, which is a different figure and usually a smaller one.",
    denominatorLabel: "The deals counted by dealsWon",
    sources: ["sum(crm_deals.value) WHERE won_at within the window"],
    honours: ["dateRange", "ownerStaffId", "source"],
    query: (ctx) => sql`
      SELECT d.id AS id, d.won_at AS occurred_at, d.name::text AS label,
             d.value AS amount, ('/admin/crm/deals?id=' || d.id)::text AS href
      FROM crm_deals d LEFT JOIN crm_leads l ON l.id = d.lead_id
      WHERE d.won_at IS NOT NULL AND ${inWindow(sql`d.won_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND d.owner_staff_id = ${ctx.ownerStaffId}` : sql``}
        ${ctx.source ? sql`AND l.source = ${ctx.source}` : sql``}
      ORDER BY d.won_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "openPipelineValue", area: "sales",
    label: "Open pipeline value", unit: "currency", aggregate: "sum",
    definition: "Face value of every deal not yet won or lost. An upper bound on what could close, not a prediction, and NOT weighted by likelihood.",
    denominatorLabel: "Deals currently at a stage other than Won or Lost",
    sources: ["sum(crm_deals.value) WHERE stage NOT IN ('Won','Lost')"],
    honours: ["ownerStaffId", "source", "stage"],
    limitations: ["A snapshot of NOW. The date range does not apply to it, because 'the pipeline as it stood last March' is not something this database records."],
    query: (ctx) => sql`
      SELECT d.id AS id, d.created_at AS occurred_at, (d.name || ' · ' || d.stage)::text AS label,
             d.value AS amount, ('/admin/crm/deals?id=' || d.id)::text AS href
      FROM crm_deals d LEFT JOIN crm_leads l ON l.id = d.lead_id
      WHERE d.stage NOT IN ('Won', 'Lost')
        ${ctx.ownerStaffId ? sql`AND d.owner_staff_id = ${ctx.ownerStaffId}` : sql``}
        ${ctx.source ? sql`AND l.source = ${ctx.source}` : sql``}
        ${ctx.stage ? sql`AND d.stage = ${ctx.stage}` : sql``}
      ORDER BY d.value DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "medianDaysToWin", area: "sales",
    label: "Median days from opening to won", unit: "days", aggregate: "median",
    definition: "For deals won in the window, the median of (won_at − created_at) in days. Median rather than mean because one nine-month deal should not move the number everybody plans around.",
    denominatorLabel: "Deals won in the window",
    sources: ["crm_deals WHERE won_at within the window"],
    honours: ["dateRange", "ownerStaffId", "source"],
    query: (ctx) => sql`
      SELECT d.id AS id, d.won_at AS occurred_at, d.name::text AS label,
             (EXTRACT(EPOCH FROM (d.won_at - d.created_at)) / 86400.0)::numeric AS amount,
             ('/admin/crm/deals?id=' || d.id)::text AS href
      FROM crm_deals d LEFT JOIN crm_leads l ON l.id = d.lead_id
      WHERE d.won_at IS NOT NULL AND ${inWindow(sql`d.won_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND d.owner_staff_id = ${ctx.ownerStaffId}` : sql``}
        ${ctx.source ? sql`AND l.source = ${ctx.source}` : sql``}
      ORDER BY d.won_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },

  // ── Revenue ───────────────────────────────────────────────────────────────
  {
    kind: "counted", key: "moneyReceived", area: "revenue",
    label: "Money received", unit: "currency", aggregate: "sum",
    definition: `Transactions at status '${TRANSACTION_RECEIVED_STATUS}' — the one status every write path actually produces when money arrives — summed over the window. This is the only figure on this page that is money the business HAS.`,
    denominatorLabel: "Payments recorded as received in the window",
    sources: [`sum(crm_transactions.amount) WHERE status = TRANSACTION_RECEIVED_STATUS ('${TRANSACTION_RECEIVED_STATUS}') AND coalesce(received_at, created_at) within the window`],
    honours: ["dateRange", "source"],
    limitations: [
      "The status is imported from lib/db (TRANSACTION_RECEIVED_STATUS), never typed out here. A reader filtering on a value no write path produces is exactly how this figure was once structurally zero on two screens at once.",
      "Dated by received_at, falling back to created_at where a completed row has no received_at. See completedPaymentsMissingReceivedAt for how often that fallback is used.",
    ],
    query: (ctx) => sql`
      SELECT tx.id AS id, coalesce(tx.received_at, tx.created_at) AS occurred_at,
             (tx.method || coalesce(' · ' || l.name, ''))::text AS label,
             tx.amount AS amount, ('/admin/crm/transactions?id=' || tx.id)::text AS href
      FROM crm_transactions tx
      LEFT JOIN crm_deals d ON d.id = tx.deal_id
      LEFT JOIN crm_leads l ON l.id = coalesce(tx.lead_id, d.lead_id)
      WHERE tx.status = ${TRANSACTION_RECEIVED_STATUS}
        AND ${inWindow(sql`coalesce(tx.received_at, tx.created_at)`, ctx)}
        ${ctx.source ? sql`AND l.source = ${ctx.source}` : sql``}
      ORDER BY coalesce(tx.received_at, tx.created_at) DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "paymentsReceived", area: "revenue",
    label: "Payments received", unit: "count", aggregate: "count",
    definition: `The number of transactions at status '${TRANSACTION_RECEIVED_STATUS}' in the window. The same rows moneyReceived sums.`,
    denominatorLabel: null,
    sources: [`crm_transactions WHERE status = TRANSACTION_RECEIVED_STATUS within the window`],
    honours: ["dateRange", "source"],
    query: (ctx) => sql`
      SELECT tx.id AS id, coalesce(tx.received_at, tx.created_at) AS occurred_at,
             (tx.method || coalesce(' · ' || l.name, ''))::text AS label,
             tx.amount AS amount, ('/admin/crm/transactions?id=' || tx.id)::text AS href
      FROM crm_transactions tx
      LEFT JOIN crm_deals d ON d.id = tx.deal_id
      LEFT JOIN crm_leads l ON l.id = coalesce(tx.lead_id, d.lead_id)
      WHERE tx.status = ${TRANSACTION_RECEIVED_STATUS}
        AND ${inWindow(sql`coalesce(tx.received_at, tx.created_at)`, ctx)}
        ${ctx.source ? sql`AND l.source = ${ctx.source}` : sql``}
      ORDER BY coalesce(tx.received_at, tx.created_at) DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "moneyPending", area: "revenue",
    label: "Money pending", unit: "currency", aggregate: "sum",
    definition: "Transactions at status 'pending' created in the window — charges started but not settled. Deliberately NOT added to money received.",
    denominatorLabel: "Pending transactions created in the window",
    sources: ["sum(crm_transactions.amount) WHERE status = 'pending' AND created_at within the window"],
    honours: ["dateRange"],
    query: (ctx) => sql`
      SELECT tx.id AS id, tx.created_at AS occurred_at, tx.method::text AS label,
             tx.amount AS amount, ('/admin/crm/transactions?id=' || tx.id)::text AS href
      FROM crm_transactions tx
      WHERE tx.status = 'pending' AND ${inWindow(sql`tx.created_at`, ctx)}
      ORDER BY tx.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "moneyRefunded", area: "revenue",
    label: "Money refunded", unit: "currency", aggregate: "sum",
    definition: "Transactions at status 'refunded', dated by coalesce(received_at, created_at) in the window. Reported separately rather than netted off, because a month with heavy refunds and a quiet month are not the same month.",
    denominatorLabel: "Refunded transactions in the window",
    sources: ["sum(crm_transactions.amount) WHERE status = 'refunded' within the window"],
    honours: ["dateRange"],
    query: (ctx) => sql`
      SELECT tx.id AS id, coalesce(tx.received_at, tx.created_at) AS occurred_at,
             tx.method::text AS label, tx.amount AS amount,
             ('/admin/crm/transactions?id=' || tx.id)::text AS href
      FROM crm_transactions tx
      WHERE tx.status = 'refunded' AND ${inWindow(sql`coalesce(tx.received_at, tx.created_at)`, ctx)}
      ORDER BY coalesce(tx.received_at, tx.created_at) DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "completedPaymentsMissingReceivedAt", area: "revenue",
    label: "Received payments with no received_at", unit: "count", aggregate: "count",
    definition: "Data quality: transactions marked received that do not record WHEN. They are dated by created_at in every revenue figure above, which is an approximation this figure makes visible instead of hiding.",
    denominatorLabel: null,
    sources: [`crm_transactions WHERE status = TRANSACTION_RECEIVED_STATUS AND received_at IS NULL`],
    honours: [],
    query: () => sql`
      SELECT tx.id AS id, tx.created_at AS occurred_at, tx.method::text AS label,
             tx.amount AS amount, ('/admin/crm/transactions?id=' || tx.id)::text AS href
      FROM crm_transactions tx
      WHERE tx.status = ${TRANSACTION_RECEIVED_STATUS} AND tx.received_at IS NULL
      ORDER BY tx.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },

  // ── Operations ────────────────────────────────────────────────────────────
  {
    kind: "counted", key: "tasksCreated", area: "operations",
    label: "Tasks created", unit: "count", aggregate: "count",
    definition: "Tasks whose created_at falls inside the window, archived ones included — archiving hides work from a queue, it does not unmake it.",
    denominatorLabel: null,
    sources: ["crm_tasks.created_at within the window"],
    honours: ["dateRange", "ownerStaffId"],
    query: (ctx) => sql`
      SELECT t.id AS id, t.created_at AS occurred_at, t.title::text AS label,
             NULL::numeric AS amount, ('/admin/crm/tasks?id=' || t.id)::text AS href
      FROM crm_tasks t
      WHERE ${inWindow(sql`t.created_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND t.assigned_to_staff_id = ${ctx.ownerStaffId}` : sql``}
      ORDER BY t.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "tasksCompleted", area: "operations",
    label: "Tasks completed", unit: "count", aggregate: "count",
    definition: "Tasks whose completed_at falls inside the window, whenever they were created.",
    denominatorLabel: null,
    sources: ["crm_tasks WHERE completed_at within the window"],
    honours: ["dateRange", "ownerStaffId"],
    query: (ctx) => sql`
      SELECT t.id AS id, t.completed_at AS occurred_at, t.title::text AS label,
             NULL::numeric AS amount, ('/admin/crm/tasks?id=' || t.id)::text AS href
      FROM crm_tasks t
      WHERE t.completed_at IS NOT NULL AND ${inWindow(sql`t.completed_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND t.assigned_to_staff_id = ${ctx.ownerStaffId}` : sql``}
      ORDER BY t.completed_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "ratio", key: "taskThroughput", area: "operations",
    label: "Tasks completed per task created", unit: "percent",
    definition: "Completions in the window as a share of creations in the window. Above 100% means the backlog shrank; below, it grew. It is NOT a per-task completion rate — the two sets overlap but are not the same tasks, and pretending otherwise would make a busy week look like failure.",
    numeratorKey: "tasksCompleted", denominatorKeys: ["tasksCreated"],
    denominatorLabel: "Tasks created in the window",
    sources: ["crm_tasks.created_at within the window", "crm_tasks.completed_at within the window"],
    honours: ["dateRange", "ownerStaffId"],
  },
  {
    kind: "counted", key: "tasksOverdueNow", area: "operations",
    label: "Tasks overdue right now", unit: "count", aggregate: "count",
    definition: "Unfinished, unarchived tasks whose due date is in the past as of this request.",
    denominatorLabel: null,
    sources: ["crm_tasks WHERE status <> 'completed' AND due_date < now() AND archived_at IS NULL"],
    honours: ["ownerStaffId"],
    limitations: ["A snapshot of now. The date range does not apply — nothing records what was overdue on a past date."],
    query: (ctx) => sql`
      SELECT t.id AS id, t.due_date AS occurred_at, t.title::text AS label,
             NULL::numeric AS amount, ('/admin/crm/tasks?id=' || t.id)::text AS href
      FROM crm_tasks t
      WHERE t.status <> 'completed' AND t.archived_at IS NULL
        AND t.due_date IS NOT NULL AND t.due_date < now()
        ${ctx.ownerStaffId ? sql`AND t.assigned_to_staff_id = ${ctx.ownerStaffId}` : sql``}
      ORDER BY t.due_date ASC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "appointmentsScheduled", area: "operations",
    label: "Meetings scheduled", unit: "count", aggregate: "count",
    definition: "Appointments whose start_at falls inside the window, whatever their status now.",
    denominatorLabel: null,
    sources: ["crm_appointments.start_at within the window"],
    honours: ["dateRange", "ownerStaffId"],
    query: (ctx) => sql`
      SELECT ap.id AS id, ap.start_at AS occurred_at, ap.title::text AS label,
             NULL::numeric AS amount, ('/admin/crm/calendar?appointment=' || ap.id)::text AS href
      FROM crm_appointments ap
      WHERE ${inWindow(sql`ap.start_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND ap.organizer_staff_id = ${ctx.ownerStaffId}` : sql``}
      ORDER BY ap.start_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "appointmentsCancelled", area: "operations",
    label: "Meetings cancelled", unit: "count", aggregate: "count",
    definition: "Appointments whose start_at falls inside the window and which are now cancelled.",
    denominatorLabel: null,
    sources: ["crm_appointments WHERE start_at within the window AND cancelled_at IS NOT NULL"],
    honours: ["dateRange", "ownerStaffId"],
    query: (ctx) => sql`
      SELECT ap.id AS id, ap.start_at AS occurred_at, ap.title::text AS label,
             NULL::numeric AS amount, ('/admin/crm/calendar?appointment=' || ap.id)::text AS href
      FROM crm_appointments ap
      WHERE ap.cancelled_at IS NOT NULL AND ${inWindow(sql`ap.start_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND ap.organizer_staff_id = ${ctx.ownerStaffId}` : sql``}
      ORDER BY ap.start_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "ratio", key: "meetingCancellationRate", area: "operations",
    label: "Meeting cancellation rate", unit: "percent",
    definition: "Cancelled meetings as a share of meetings scheduled in the window.",
    numeratorKey: "appointmentsCancelled", denominatorKeys: ["appointmentsScheduled"],
    denominatorLabel: "Meetings whose start_at falls in the window",
    sources: ["crm_appointments.start_at within the window"],
    honours: ["dateRange", "ownerStaffId"],
  },

  // ── Support ───────────────────────────────────────────────────────────────
  {
    kind: "counted", key: "ticketsOpened", area: "support",
    label: "Support tickets opened", unit: "count", aggregate: "count",
    definition: "Support tickets whose created_at falls inside the window.",
    denominatorLabel: null,
    sources: ["crm_support_tickets.created_at within the window"],
    honours: ["dateRange", "ownerStaffId", "status"],
    query: (ctx) => sql`
      SELECT tk.id AS id, tk.created_at AS occurred_at, tk.subject::text AS label,
             NULL::numeric AS amount, ('/admin/crm/support?ticket=' || tk.id)::text AS href
      FROM crm_support_tickets tk
      WHERE ${inWindow(sql`tk.created_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND tk.assigned_to_staff_id = ${ctx.ownerStaffId}` : sql``}
        ${ctx.status ? sql`AND tk.status = ${ctx.status}` : sql``}
      ORDER BY tk.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "ticketsResolved", area: "support",
    label: "Support tickets resolved", unit: "count", aggregate: "count",
    definition: "Tickets whose resolved_at falls inside the window, whenever they were opened.",
    denominatorLabel: null,
    sources: ["crm_support_tickets WHERE resolved_at within the window"],
    honours: ["dateRange", "ownerStaffId"],
    query: (ctx) => sql`
      SELECT tk.id AS id, tk.resolved_at AS occurred_at,
             (tk.subject || coalesce(' — ' || tk.resolution, ''))::text AS label,
             NULL::numeric AS amount, ('/admin/crm/support?ticket=' || tk.id)::text AS href
      FROM crm_support_tickets tk
      WHERE tk.resolved_at IS NOT NULL AND ${inWindow(sql`tk.resolved_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND tk.assigned_to_staff_id = ${ctx.ownerStaffId}` : sql``}
      ORDER BY tk.resolved_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "medianFirstResponseMinutes", area: "support",
    label: "Median minutes to first human reply", unit: "minutes", aggregate: "median",
    definition: "For tickets opened in the window that HAVE had a first reply, the median of (first_response_at − created_at). first_response_at is stamped only by a customer-visible message from a staff member — an internal note is not a reply to anybody.",
    denominatorLabel: "Tickets opened in the window that have received a first reply",
    sources: ["crm_support_tickets WHERE created_at within the window AND first_response_at IS NOT NULL"],
    honours: ["dateRange", "ownerStaffId"],
    limitations: ["Tickets still waiting for a first reply are EXCLUDED, which flatters the figure. ticketsOpened minus this figure's denominator is how many are missing."],
    query: (ctx) => sql`
      SELECT tk.id AS id, tk.created_at AS occurred_at, tk.subject::text AS label,
             (EXTRACT(EPOCH FROM (tk.first_response_at - tk.created_at)) / 60.0)::numeric AS amount,
             ('/admin/crm/support?ticket=' || tk.id)::text AS href
      FROM crm_support_tickets tk
      WHERE tk.first_response_at IS NOT NULL AND ${inWindow(sql`tk.created_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND tk.assigned_to_staff_id = ${ctx.ownerStaffId}` : sql``}
      ORDER BY tk.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "ratio", key: "ticketResolutionRate", area: "support",
    label: "Tickets resolved per ticket opened", unit: "percent",
    definition: "Resolutions in the window as a share of tickets opened in the window. As with tasks, the two sets overlap but are not identical — this measures whether the queue is shrinking, not what share of THESE tickets got solved.",
    numeratorKey: "ticketsResolved", denominatorKeys: ["ticketsOpened"],
    denominatorLabel: "Tickets opened in the window",
    sources: ["crm_support_tickets.created_at within the window", "crm_support_tickets.resolved_at within the window"],
    honours: ["dateRange", "ownerStaffId"],
  },

  // ── Campaigns ─────────────────────────────────────────────────────────────
  {
    kind: "counted", key: "campaignEmailsSent", area: "campaigns",
    label: "Campaign emails sent", unit: "count", aggregate: "count",
    definition: "Campaign recipients whose sent_at falls inside the window and whose status is 'sent' — that is, a send the provider accepted.",
    denominatorLabel: null,
    sources: ["crm_campaign_recipients WHERE status = 'sent' AND sent_at within the window"],
    honours: ["dateRange"],
    limitations: ["'Sent' means the provider accepted it. It is not delivery, and it is certainly not readership."],
    query: (ctx) => sql`
      SELECT r.id AS id, r.sent_at AS occurred_at, c.name::text AS label,
             NULL::numeric AS amount, ('/admin/crm/campaigns?id=' || r.campaign_id)::text AS href
      FROM crm_campaign_recipients r
      JOIN crm_campaigns c ON c.id = r.campaign_id
      WHERE r.status = 'sent' AND r.sent_at IS NOT NULL AND ${inWindow(sql`r.sent_at`, ctx)}
      ORDER BY r.sent_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "campaignSendFailures", area: "campaigns",
    label: "Campaign send failures", unit: "count", aggregate: "count",
    definition: "Campaign recipients at status 'failed' created in the window — a send that did not happen, including bounces the webhook marked failed.",
    denominatorLabel: null,
    sources: ["crm_campaign_recipients WHERE status = 'failed' AND created_at within the window"],
    honours: ["dateRange"],
    query: (ctx) => sql`
      SELECT r.id AS id, r.created_at AS occurred_at,
             (c.name || coalesce(' — ' || r.last_error, ''))::text AS label,
             NULL::numeric AS amount, ('/admin/crm/campaigns?id=' || r.campaign_id)::text AS href
      FROM crm_campaign_recipients r
      JOIN crm_campaigns c ON c.id = r.campaign_id
      WHERE r.status = 'failed' AND ${inWindow(sql`r.created_at`, ctx)}
      ORDER BY r.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "campaignEmailsOpened", area: "campaigns",
    label: "Campaign emails opened", unit: "count", aggregate: "count",
    definition: "Provider 'opened' webhook events in the window. An open is a tracking pixel loading; it is an imperfect signal and not proof anybody read anything.",
    denominatorLabel: "Campaign emails sent in the window",
    sources: ["crm_campaign_events WHERE event_type = 'opened' AND occurred_at within the window"],
    honours: ["dateRange"],
    availability: emailEngagementUnavailable,
    query: (ctx) => sql`
      SELECT e.id AS id, e.occurred_at AS occurred_at, c.name::text AS label,
             NULL::numeric AS amount, ('/admin/crm/campaigns?id=' || r.campaign_id)::text AS href
      FROM crm_campaign_events e
      JOIN crm_campaign_recipients r ON r.id = e.campaign_recipient_id
      JOIN crm_campaigns c ON c.id = r.campaign_id
      WHERE e.event_type = 'opened' AND ${inWindow(sql`e.occurred_at`, ctx)}
      ORDER BY e.occurred_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "campaignEmailsClicked", area: "campaigns",
    label: "Campaign emails clicked", unit: "count", aggregate: "count",
    definition: "Provider 'clicked' webhook events in the window.",
    denominatorLabel: "Campaign emails sent in the window",
    sources: ["crm_campaign_events WHERE event_type = 'clicked' AND occurred_at within the window"],
    honours: ["dateRange"],
    availability: emailEngagementUnavailable,
    query: (ctx) => sql`
      SELECT e.id AS id, e.occurred_at AS occurred_at, c.name::text AS label,
             NULL::numeric AS amount, ('/admin/crm/campaigns?id=' || r.campaign_id)::text AS href
      FROM crm_campaign_events e
      JOIN crm_campaign_recipients r ON r.id = e.campaign_recipient_id
      JOIN crm_campaigns c ON c.id = r.campaign_id
      WHERE e.event_type = 'clicked' AND ${inWindow(sql`e.occurred_at`, ctx)}
      ORDER BY e.occurred_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "ratio", key: "campaignOpenRate", area: "campaigns",
    label: "Campaign open rate", unit: "percent",
    definition: "Opens as a share of sends in the window. Unavailable — not 0% — whenever open tracking is not wired, because those two answers mean opposite things.",
    numeratorKey: "campaignEmailsOpened", denominatorKeys: ["campaignEmailsSent"],
    denominatorLabel: "Campaign emails sent in the window",
    sources: ["crm_campaign_events WHERE event_type = 'opened'", "crm_campaign_recipients WHERE status = 'sent'"],
    honours: ["dateRange"],
  },
  {
    kind: "ratio", key: "campaignClickRate", area: "campaigns",
    label: "Campaign click rate", unit: "percent",
    definition: "Clicks as a share of sends in the window.",
    numeratorKey: "campaignEmailsClicked", denominatorKeys: ["campaignEmailsSent"],
    denominatorLabel: "Campaign emails sent in the window",
    sources: ["crm_campaign_events WHERE event_type = 'clicked'", "crm_campaign_recipients WHERE status = 'sent'"],
    honours: ["dateRange"],
  },
  {
    kind: "gap", key: "campaignAttributedRevenue", area: "campaigns",
    label: "Revenue attributed to campaigns", unit: "currency",
    definition: "Money that arrived because of a campaign.",
    sources: ["crm_transactions", "crm_campaign_recipients"],
    reason: () => "Nothing in this database links a payment, or the deal it "
      + "belongs to, to the campaign that influenced it. The only join available "
      + "is 'this contact once received a campaign', and turning that into a "
      + "revenue number would be an attribution MODEL presented as a "
      + "measurement — a figure that rises whenever you email more people, "
      + "whether or not the emails did anything.",
    wouldRequire: "A campaign reference recorded on the deal or the transaction at the point it is created.",
  },

  // ── Communications ────────────────────────────────────────────────────────
  {
    kind: "counted", key: "messagesSent", area: "communications",
    label: "Messages sent", unit: "count", aggregate: "count",
    definition: "Outbound messages — SMS, calls and email — whose created_at falls inside the window.",
    denominatorLabel: null,
    sources: ["crm_messages WHERE direction <> 'inbound' AND created_at within the window"],
    honours: ["dateRange"],
    query: (ctx) => sql`
      SELECT m.id AS id, m.created_at AS occurred_at,
             (m.channel || coalesce(' · ' || l.name, ''))::text AS label,
             NULL::numeric AS amount,
             coalesce('/admin/crm/leads/' || m.lead_id, '/admin/crm/inbox')::text AS href
      FROM crm_messages m LEFT JOIN crm_leads l ON l.id = m.lead_id
      WHERE m.direction <> 'inbound' AND ${inWindow(sql`m.created_at`, ctx)}
      ORDER BY m.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "messagesReceived", area: "communications",
    label: "Messages received", unit: "count", aggregate: "count",
    definition: "Inbound messages whose created_at falls inside the window.",
    denominatorLabel: null,
    sources: ["crm_messages WHERE direction = 'inbound' AND created_at within the window"],
    honours: ["dateRange"],
    query: (ctx) => sql`
      SELECT m.id AS id, m.created_at AS occurred_at,
             (m.channel || coalesce(' · ' || l.name, ''))::text AS label,
             NULL::numeric AS amount,
             coalesce('/admin/crm/leads/' || m.lead_id, '/admin/crm/inbox')::text AS href
      FROM crm_messages m LEFT JOIN crm_leads l ON l.id = m.lead_id
      WHERE m.direction = 'inbound' AND ${inWindow(sql`m.created_at`, ctx)}
      ORDER BY m.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "outboundSmsWithProviderStatus", area: "communications",
    label: "Outbound SMS with a provider status", unit: "count", aggregate: "count",
    definition: "Outbound SMS in the window for which Twilio's status callback actually reported something. This, not 'all outbound SMS', is the denominator a delivery rate can honestly use.",
    denominatorLabel: null,
    sources: ["crm_messages WHERE channel = 'sms' AND direction <> 'inbound' AND status IS NOT NULL"],
    honours: ["dateRange"],
    query: (ctx) => sql`
      SELECT m.id AS id, m.created_at AS occurred_at, coalesce(m.status, 'unknown')::text AS label,
             NULL::numeric AS amount, '/admin/crm/inbox'::text AS href
      FROM crm_messages m
      WHERE m.channel = 'sms' AND m.direction <> 'inbound' AND m.status IS NOT NULL
        AND ${inWindow(sql`m.created_at`, ctx)}
      ORDER BY m.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "counted", key: "outboundSmsDelivered", area: "communications",
    label: "Outbound SMS confirmed delivered", unit: "count", aggregate: "count",
    definition: "Outbound SMS in the window whose provider status is 'delivered'.",
    denominatorLabel: "Outbound SMS in the window that have any provider status at all",
    sources: ["crm_messages WHERE channel = 'sms' AND direction <> 'inbound' AND status = 'delivered'"],
    honours: ["dateRange"],
    query: (ctx) => sql`
      SELECT m.id AS id, m.created_at AS occurred_at, m.status::text AS label,
             NULL::numeric AS amount, '/admin/crm/inbox'::text AS href
      FROM crm_messages m
      WHERE m.channel = 'sms' AND m.direction <> 'inbound' AND m.status = 'delivered'
        AND ${inWindow(sql`m.created_at`, ctx)}
      ORDER BY m.created_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "ratio", key: "smsDeliveryRate", area: "communications",
    label: "SMS delivery rate", unit: "percent",
    definition: "Confirmed deliveries as a share of outbound SMS that carry a provider status. Messages with no status are excluded from BOTH halves rather than counted as failures, because 'the callback never arrived' is not 'the phone never rang'.",
    numeratorKey: "outboundSmsDelivered", denominatorKeys: ["outboundSmsWithProviderStatus"],
    denominatorLabel: "Outbound SMS in the window with a recorded provider status",
    sources: ["crm_messages.status, written by the Twilio status callback"],
    honours: ["dateRange"],
  },
  {
    kind: "counted", key: "conversationsResolved", area: "communications",
    label: "Conversations resolved", unit: "count", aggregate: "count",
    definition: "Conversations whose resolved_at falls inside the window.",
    denominatorLabel: null,
    sources: ["crm_conversations WHERE resolved_at within the window"],
    honours: ["dateRange", "ownerStaffId"],
    query: (ctx) => sql`
      SELECT c.id AS id, c.resolved_at AS occurred_at,
             coalesce(c.subject, c.external_name, c.external_address, c.channel)::text AS label,
             NULL::numeric AS amount, ('/admin/crm/inbox?conversation=' || c.id)::text AS href
      FROM crm_conversations c
      WHERE c.resolved_at IS NOT NULL AND ${inWindow(sql`c.resolved_at`, ctx)}
        ${ctx.ownerStaffId ? sql`AND c.assigned_to_staff_id = ${ctx.ownerStaffId}` : sql``}
      ORDER BY c.resolved_at DESC LIMIT ${DETAIL_CAP + 1}`,
  },
  {
    kind: "gap", key: "medianMinutesToFirstReply", area: "communications",
    label: "Median minutes to first reply", unit: "minutes",
    definition: "How long a customer waits for the first answer to a new conversation.",
    sources: ["crm_conversations"],
    reason: () => "crm_conversations records last_inbound_at and "
      + "last_outbound_at — the most recent of each — and nothing else. There "
      + "is no first_response_at, so the earliest reply to the earliest "
      + "message cannot be recovered from a thread that has since continued. "
      + "Computing it from the two 'last' columns would answer a different "
      + "question and label it with this one's name. (Support tickets DO "
      + "record this; see medianFirstResponseMinutes.)",
    wouldRequire: "A first_response_at column on crm_conversations, stamped by the first outbound message after an inbound one.",
  },
];

const FIGURE_BY_KEY = new Map<string, FigureSpec>(FIGURES.map((f) => [f.key, f]));

// ── Evaluation ──────────────────────────────────────────────────────────────

interface Evaluated {
  key: string;
  rows: DetailRow[];
  truncated: boolean;
  count: number;
  sum: number | null;
  median: number | null;
  value: number | null;
}

function toRow(raw: RawDetailRow): DetailRow {
  const amount = raw.amount == null ? null : Number(raw.amount);
  return {
    id: raw.id,
    occurredAt: raw.occurred_at ? new Date(raw.occurred_at).toISOString() : null,
    label: raw.label ?? "",
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    href: raw.href ?? null,
  };
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1
    ? sorted[mid]!
    : ((sorted[mid - 1]! + sorted[mid]!) / 2);
  return Math.round(value * 100) / 100;
}

/**
 * Runs one figure's query and derives its number FROM ITS OWN ROWS.
 *
 * This is the whole traceability guarantee in four lines: there is no separate
 * `count(*)`, so there is nothing for the count to disagree with. The rows are
 * the evidence and the number is a function of them.
 */
async function evaluate(spec: CountedFigure, ctx: ReportContext): Promise<Evaluated> {
  const result = await db.execute(spec.query(ctx));
  const raw = result.rows as unknown as RawDetailRow[];
  const truncated = raw.length > DETAIL_CAP;
  const rows = (truncated ? raw.slice(0, DETAIL_CAP) : raw).map(toRow);

  const amounts = rows.map((r) => r.amount).filter((v): v is number => v != null);
  const sum = amounts.length ? Math.round(amounts.reduce((s, n) => s + n, 0) * 100) / 100 : 0;
  const median = medianOf(amounts);

  const value = spec.aggregate === "count" ? rows.length
    : spec.aggregate === "sum" ? sum
    : median;

  return { key: spec.key, rows, truncated, count: rows.length, sum, median, value };
}

interface FigureOutput {
  key: string;
  area: Area;
  label: string;
  unit: Unit;
  available: boolean;
  value: number | null;
  definition: string;
  denominator: { label: string; value: number | null } | null;
  sources: string[];
  honoursFilters: FilterName[];
  ignoredFilters: FilterName[];
  traceable: boolean;
  detail: string | null;
  limitations: string[];
  unavailableReason?: string;
  wouldRequire?: string;
}

/** Which of the filters the caller actually set this figure does not use. */
function ignoredFilters(honours: FilterName[], ctx: ReportContext): FilterName[] {
  const set: FilterName[] = [];
  if (ctx.ownerStaffId !== undefined && !honours.includes("ownerStaffId")) set.push("ownerStaffId");
  if (ctx.source !== undefined && !honours.includes("source")) set.push("source");
  if (ctx.stage !== undefined && !honours.includes("stage")) set.push("stage");
  if (ctx.status !== undefined && !honours.includes("status")) set.push("status");
  if (!honours.includes("dateRange")) set.push("dateRange");
  return set;
}

function detailHref(key: string, req: Request): string {
  const q = new URLSearchParams();
  for (const name of ["from", "to", "timezone", "ownerStaffId", "source", "stage", "status"]) {
    const v = (req.query as Record<string, unknown>)[name];
    if (typeof v === "string" && v) q.set(name, v);
  }
  const qs = q.toString();
  return `/api/crm/reports/detail/${key}${qs ? `?${qs}` : ""}`;
}

// ── GET /crm/reports/summary ────────────────────────────────────────────────

/**
 * Every figure, with its definition, its denominator, and the handle that
 * hands back the rows behind it.
 *
 * Unavailable figures are returned, not omitted. A dashboard that silently
 * drops what it cannot measure teaches its reader that everything shown is
 * everything there is.
 */
router.get("/crm/reports/summary", requireCrmAuth("reports.read"), async (req: Request, res: Response) => {
  const resolved = await resolveWindow(req);
  if ("error" in resolved) { res.status(400).json({ error: resolved.error }); return; }
  const ctx = resolved;

  // Counted figures first — ratios are functions of them, so the two can never
  // be computed from different data.
  const counted = FIGURES.filter((f): f is CountedFigure => f.kind === "counted");
  const unavailableReasons = new Map<string, string>();
  const evaluated = new Map<string, Evaluated>();

  await Promise.all(counted.map(async (spec) => {
    const reason = spec.availability?.() ?? null;
    if (reason) { unavailableReasons.set(spec.key, reason); return; }
    evaluated.set(spec.key, await evaluate(spec, ctx));
  }));

  const figures: FigureOutput[] = [];

  for (const spec of FIGURES) {
    if (spec.kind === "counted") {
      const reason = unavailableReasons.get(spec.key);
      const ev = evaluated.get(spec.key);
      const base: FigureOutput = {
        key: spec.key, area: spec.area, label: spec.label, unit: spec.unit,
        available: !reason,
        value: reason ? null : ev?.value ?? null,
        definition: spec.definition,
        denominator: spec.denominatorLabel
          ? { label: spec.denominatorLabel, value: reason ? null : ev?.count ?? null }
          : null,
        sources: spec.sources,
        honoursFilters: spec.honours,
        ignoredFilters: ignoredFilters(spec.honours, ctx),
        traceable: !reason && !(ev?.truncated ?? false),
        detail: reason ? null : detailHref(spec.key, req),
        limitations: [
          ...(spec.limitations ?? []),
          ...(ev?.truncated
            ? [`More than ${DETAIL_CAP} rows match, so the detail list cannot hand back everything this figure counted. Narrow the window.`]
            : []),
        ],
      };
      if (reason) base.unavailableReason = reason;
      figures.push(base);
      continue;
    }

    if (spec.kind === "ratio") {
      const numerator = evaluated.get(spec.numeratorKey);
      const numeratorBlocked = unavailableReasons.get(spec.numeratorKey);
      const denominatorParts = spec.denominatorKeys.map((k) => evaluated.get(k));
      const denominatorBlocked = spec.denominatorKeys
        .map((k) => unavailableReasons.get(k)).find((r) => r);

      if (numeratorBlocked || denominatorBlocked) {
        figures.push({
          key: spec.key, area: spec.area, label: spec.label, unit: spec.unit,
          available: false, value: null,
          definition: spec.definition,
          denominator: { label: spec.denominatorLabel, value: null },
          sources: spec.sources,
          honoursFilters: spec.honours,
          ignoredFilters: ignoredFilters(spec.honours, ctx),
          traceable: false, detail: null,
          limitations: spec.limitations ?? [],
          unavailableReason: numeratorBlocked ?? denominatorBlocked!,
        });
        continue;
      }

      const denominator = denominatorParts.reduce((s, e) => s + (e?.value ?? 0), 0);
      // The rule this whole file exists to enforce: an empty denominator has
      // no rate. Not 0%. "Nothing has been decided" and "everything failed"
      // are different facts and must not share a number.
      const value = denominator > 0
        ? Math.round(((numerator?.value ?? 0) / denominator) * 1000) / 10
        : null;

      figures.push({
        key: spec.key, area: spec.area, label: spec.label, unit: spec.unit,
        available: true, value,
        definition: denominator > 0
          ? spec.definition
          : `${spec.definition} The denominator is zero for this window, so there is no rate to report — which is why this is null rather than 0%.`,
        denominator: { label: spec.denominatorLabel, value: denominator },
        sources: spec.sources,
        honoursFilters: spec.honours,
        ignoredFilters: ignoredFilters(spec.honours, ctx),
        traceable: true,
        detail: detailHref(spec.numeratorKey, req),
        limitations: spec.limitations ?? [],
      });
      continue;
    }

    // A structural gap. It has no query and never will until the schema says
    // otherwise — which is exactly what `wouldRequire` records.
    figures.push({
      key: spec.key, area: spec.area, label: spec.label, unit: spec.unit,
      available: false, value: null,
      definition: spec.definition,
      denominator: null,
      sources: spec.sources,
      honoursFilters: [],
      ignoredFilters: [],
      traceable: false, detail: null,
      limitations: [],
      unavailableReason: spec.reason(),
      wouldRequire: spec.wouldRequire,
    });
  }

  const areas: Record<string, FigureOutput[]> = {};
  for (const f of figures) (areas[f.area] ??= []).push(f);

  res.json({
    window: {
      from: ctx.fromDate,
      to: ctx.toDate,
      timezone: ctx.timezone,
      startAt: ctx.startAt.toISOString(),
      endAt: ctx.endAt.toISOString(),
      definition: `Days are counted in ${ctx.timezone}. The window runs from the start of ${ctx.fromDate} to the end of ${ctx.toDate} in that zone — ${ctx.toDate} is INCLUDED. The absolute instants above are what every query actually compares against.`,
    },
    filters: {
      ownerStaffId: ctx.ownerStaffId ?? null,
      source: ctx.source ?? null,
      stage: ctx.stage ?? null,
      status: ctx.status ?? null,
      note: "Not every figure can honour every filter. Each one lists honoursFilters and ignoredFilters, so a filter that did nothing says so rather than appearing to have worked.",
    },
    areas,
    unavailable: figures
      .filter((f) => !f.available)
      .map((f) => ({ key: f.key, label: f.label, reason: f.unavailableReason ?? "", wouldRequire: f.wouldRequire ?? null })),
    contract: {
      traceability: "Every available figure carries a `detail` URL returning the rows it counted. The figure is computed FROM those rows, so `count` equals the list by construction rather than by agreement.",
      emptyDenominator: "A ratio with a zero denominator is null, never 0%.",
      untracked: "A figure nothing is measuring reports available:false with a reason. It never reports 0.",
      money: `Money received filters on TRANSACTION_RECEIVED_STATUS, imported from lib/db. No status string is written out by hand anywhere in this file.`,
    },
  });
});

// ── GET /crm/reports/detail/:key ────────────────────────────────────────────

/**
 * The rows behind one figure.
 *
 * Same registry, same query, same filters. If this list and the summary ever
 * disagree, one of them is reading a different query — and there is only one.
 */
router.get("/crm/reports/detail/:key", requireCrmAuth("reports.read"), async (req: Request, res: Response) => {
  const key = String(req.params["key"] ?? "");
  const spec = FIGURE_BY_KEY.get(key);
  if (!spec) {
    res.status(404).json({
      error: "No such figure.",
      known: FIGURES.map((f) => f.key),
    });
    return;
  }

  if (spec.kind === "gap") {
    res.status(409).json({
      error: "This figure is not tracked, so there are no rows behind it.",
      key: spec.key, reason: spec.reason(), wouldRequire: spec.wouldRequire,
    });
    return;
  }
  if (spec.kind === "ratio") {
    res.status(409).json({
      error: "A ratio has no rows of its own. Ask for its numerator.",
      key: spec.key, numerator: spec.numeratorKey, denominators: spec.denominatorKeys,
    });
    return;
  }

  const reason = spec.availability?.() ?? null;
  if (reason) {
    res.status(409).json({ error: "This figure is not tracked in this environment.", key: spec.key, reason });
    return;
  }

  const resolved = await resolveWindow(req);
  if ("error" in resolved) { res.status(400).json({ error: resolved.error }); return; }

  const ev = await evaluate(spec, resolved);

  res.json({
    key: spec.key,
    label: spec.label,
    unit: spec.unit,
    aggregate: spec.aggregate,
    definition: spec.definition,
    window: { from: resolved.fromDate, to: resolved.toDate, timezone: resolved.timezone },
    // The figure as the summary would report it, recomputed here from the very
    // rows below it.
    value: ev.value,
    count: ev.count,
    sum: ev.sum,
    median: ev.median,
    rows: ev.rows,
    truncated: ev.truncated,
    guarantee: ev.truncated
      ? `More than ${DETAIL_CAP} rows match. The list below is capped, so it is NOT the full evidence for the figure.`
      : "count equals rows.length, and value is derived from these exact rows.",
  });
});

/** The registry itself, so the figure catalogue can be read without guessing. */
router.get("/crm/reports/figures", requireCrmAuth("reports.read"), async (_req: Request, res: Response) => {
  res.json({
    figures: FIGURES.map((f) => ({
      key: f.key, area: f.area, label: f.label, unit: f.unit,
      kind: f.kind,
      definition: f.definition,
      sources: f.sources,
      tracked: f.kind !== "gap" && !(f.kind === "counted" && f.availability?.()),
    })),
  });
});

export default router;
