// ── M2: Command Center activity sources ─────────────────────────────────────
//
// Every button on the Command Center resolves to a real query here, and the
// count a button shows is produced by the SAME function that produces its list
// — so a number can never disagree with the rows underneath it.
//
// The rule this file exists to enforce: a metric with no instrumentation
// reports `available: false` with a reason. It never reports zero. A fabricated
// zero is indistinguishable from "nothing happened", which is exactly the lie
// that makes a dashboard untrustworthy.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  db, crmLeads, crmTasks, crmProjects, crmDeals, crmTransactions, crmMessages,
  crmCampaignEvents, crmCampaignRecipients, crmStaff, crmProjectMilestones,
  discoverySubmissions, crmActivities,
} from "@workspace/db";
import { requireCrmAuth } from "../lib/staffAuth.js";
import { localDayBounds } from "../lib/crmScheduler.js";

const router: IRouter = Router();

/**
 * A panel is either backed by real data or explicitly unavailable.
 * `available: false` renders as "Not configured" / "Unavailable" in the UI —
 * never as a zero.
 */
interface Panel {
  key: string;
  label: string;
  available: boolean;
  /** Why it is unavailable. Shown to the operator verbatim. */
  reason?: string;
  count: number | null;
  items: unknown[];
  /** How the number was derived, so a disputed figure can be traced. */
  definition: string;
}

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function rangeFrom(req: Request): { since: Date; until: Date; days: number; label: string } {
  const days = Math.min(Math.max(num(req.query["days"], 30), 1), 365);
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 3600_000);
  return { since, until, days, label: `last ${days} days` };
}

/** Team scope needs the team-read grant; "mine" is always allowed. */
function scopeOf(req: Request): { scope: "mine" | "team"; staffId: number | null; denied: boolean } {
  const wanted = req.query["scope"] === "team" ? "team" : "mine";
  const me = req.staffAuth?.staff ?? null;
  if (wanted === "team") {
    if (!req.staffAuth?.permissions.has("tasks.read.team")) {
      return { scope: "mine", staffId: me?.id ?? null, denied: true };
    }
    return { scope: "team", staffId: null, denied: false };
  }
  return { scope: "mine", staffId: me?.id ?? null, denied: false };
}

// ── Individual panels ───────────────────────────────────────────────────────

async function newLeads(since: Date, limit: number): Promise<Panel> {
  const items = await db.select({
    id: crmLeads.id, name: crmLeads.name, company: crmLeads.company,
    email: crmLeads.email, source: crmLeads.source, status: crmLeads.status,
    assignedTo: crmLeads.assignedTo, createdAt: crmLeads.createdAt,
    lastContactedAt: crmLeads.lastContactedAt,
  }).from(crmLeads).where(gte(crmLeads.createdAt, since))
    .orderBy(desc(crmLeads.createdAt)).limit(limit);
  const [c] = await db.select({ count: sql<number>`count(*)` }).from(crmLeads)
    .where(gte(crmLeads.createdAt, since));
  return {
    key: "new_leads", label: "New leads", available: true,
    count: Number(c?.count ?? 0),
    items: items.map((l) => ({ ...l, responded: l.lastContactedAt != null })),
    definition: "crm_leads created in the period, with whether anyone has contacted them yet.",
  };
}

async function emailReplies(since: Date, limit: number): Promise<Panel> {
  // A reply is an INBOUND message correlated to a contact. Outbound sends and
  // provider open events are different things and are not counted here.
  const items = await db.select({
    id: crmMessages.id, leadId: crmMessages.leadId, channel: crmMessages.channel,
    body: crmMessages.body, createdAt: crmMessages.createdAt, fromNumber: crmMessages.fromNumber,
  }).from(crmMessages)
    .where(and(eq(crmMessages.direction, "inbound"), gte(crmMessages.createdAt, since)))
    .orderBy(desc(crmMessages.createdAt)).limit(limit);
  const [c] = await db.select({ count: sql<number>`count(*)` }).from(crmMessages)
    .where(and(eq(crmMessages.direction, "inbound"), gte(crmMessages.createdAt, since)));

  const leadIds = [...new Set(items.map((m) => m.leadId).filter((v): v is number => v != null))];
  const leads = leadIds.length
    ? await db.select({ id: crmLeads.id, name: crmLeads.name }).from(crmLeads).where(inArray(crmLeads.id, leadIds))
    : [];
  const map = new Map(leads.map((l) => [l.id, l.name]));

  return {
    key: "email_replies", label: "Replies received", available: true,
    count: Number(c?.count ?? 0),
    items: items.map((m) => ({ ...m, leadName: m.leadId ? map.get(m.leadId) ?? null : null })),
    definition: "Inbound crm_messages in the period (SMS and email replies actually received). Outbound sends are excluded.",
  };
}

async function openedEmails(since: Date, limit: number): Promise<Panel> {
  // Opens come from provider webhook events. They are a WEAK signal — image
  // proxies and preview panes fire them, and privacy features suppress them —
  // so the definition says so rather than letting the number imply "read".
  const [configured] = await db.select({ count: sql<number>`count(*)` }).from(crmCampaignEvents)
    .where(eq(crmCampaignEvents.eventType, "opened"));
  if (Number(configured?.count ?? 0) === 0) {
    return {
      key: "opened_emails", label: "Emails opened", available: false,
      reason: "No open events have ever been received. Open tracking requires the Resend webhook to be delivering events to this server.",
      count: null, items: [],
      definition: "Provider 'opened' webhook events. An open is not proof a person read the message.",
    };
  }
  const items = await db.select({
    id: crmCampaignEvents.id, recipientId: crmCampaignEvents.campaignRecipientId,
    createdAt: crmCampaignEvents.occurredAt,
  }).from(crmCampaignEvents)
    .where(and(eq(crmCampaignEvents.eventType, "opened"), gte(crmCampaignEvents.occurredAt, since)))
    .orderBy(desc(crmCampaignEvents.occurredAt)).limit(limit);
  const [c] = await db.select({ count: sql<number>`count(*)` }).from(crmCampaignEvents)
    .where(and(eq(crmCampaignEvents.eventType, "opened"), gte(crmCampaignEvents.occurredAt, since)));

  const recipientIds = [...new Set(items.map((i) => i.recipientId).filter((v): v is number => v != null))];
  const recipients = recipientIds.length
    ? await db.select({
        id: crmCampaignRecipients.id, leadId: crmCampaignRecipients.leadId,
      }).from(crmCampaignRecipients).where(inArray(crmCampaignRecipients.id, recipientIds))
    : [];
  const rMap = new Map(recipients.map((r) => [r.id, r.leadId]));
  const leadIds = [...new Set(recipients.map((r) => r.leadId).filter((v): v is number => v != null))];
  const leads = leadIds.length
    ? await db.select({ id: crmLeads.id, name: crmLeads.name }).from(crmLeads).where(inArray(crmLeads.id, leadIds))
    : [];
  const lMap = new Map(leads.map((l) => [l.id, l.name]));

  return {
    key: "opened_emails", label: "Emails opened", available: true,
    count: Number(c?.count ?? 0),
    items: items.map((i) => {
      const leadId = i.recipientId ? rMap.get(i.recipientId) ?? null : null;
      return { ...i, leadId, leadName: leadId ? lMap.get(leadId) ?? null : null };
    }),
    definition: "Provider 'opened' webhook events in the period. Opens are an imperfect signal, not proof the message was read.",
  };
}

function returnVisits(): Panel {
  // There is no first-party site analytics table. Inventing one from page
  // views we do not collect would be fabrication.
  return {
    key: "return_visits", label: "Returning website visits", available: false,
    reason: "Website visit tracking is not instrumented. Returning-visitor data needs a first-party analytics event stream, and identifying a visitor additionally needs a justified identity link.",
    count: null, items: [],
    definition: "Repeat sessions from a known contact. Anonymous visitors stay anonymous unless a valid identity link exists.",
  };
}

async function tasksDue(staffId: number | null, scope: string, zone: string, limit: number): Promise<Panel> {
  const { end } = localDayBounds(zone);
  const where = [
    ne(crmTasks.status, "completed"),
    isNull(crmTasks.archivedAt),
    isNotNull(crmTasks.dueDate),
    lte(crmTasks.dueDate, end),
    ...(scope === "mine" && staffId ? [eq(crmTasks.assignedToStaffId, staffId)] : []),
  ];
  const items = await db.select().from(crmTasks).where(and(...where))
    .orderBy(asc(crmTasks.dueDate)).limit(limit);
  const [c] = await db.select({ count: sql<number>`count(*)` }).from(crmTasks).where(and(...where));
  return {
    key: "tasks_due", label: "Tasks due", available: true,
    count: Number(c?.count ?? 0), items,
    definition: `Open tasks with a due date at or before the end of today in ${zone}${scope === "mine" ? ", assigned to you" : ", across the team"}.`,
  };
}

async function deadlines(limit: number): Promise<Panel> {
  const horizon = new Date(Date.now() + 14 * 24 * 3600_000);
  const TERMINAL = ["Launched", "Maintenance", "Completed"];

  const projects = await db.select({
    id: crmProjects.id, name: crmProjects.name, stage: crmProjects.stage,
    targetLaunchDate: crmProjects.targetLaunchDate, ownerStaffId: crmProjects.ownerStaffId,
  }).from(crmProjects).where(and(
    isNull(crmProjects.archivedAt),
    isNotNull(crmProjects.targetLaunchDate),
    sql`${crmProjects.stage} NOT IN ('Launched','Maintenance','Completed')`,
    sql`${crmProjects.targetLaunchDate} <= ${horizon.toISOString().slice(0, 10)}`,
  )).orderBy(asc(crmProjects.targetLaunchDate)).limit(limit);

  const milestones = await db.select({
    id: crmProjectMilestones.id, title: crmProjectMilestones.title,
    dueDate: crmProjectMilestones.dueDate, projectId: crmProjectMilestones.projectId,
    status: crmProjectMilestones.status,
  }).from(crmProjectMilestones).where(and(
    ne(crmProjectMilestones.status, "done"),
    isNotNull(crmProjectMilestones.dueDate),
    lte(crmProjectMilestones.dueDate, horizon),
  )).orderBy(asc(crmProjectMilestones.dueDate)).limit(limit);

  const items = [
    ...projects.map((p) => ({ kind: "project" as const, id: p.id, title: p.name, due: p.targetLaunchDate, stage: p.stage })),
    ...milestones.map((m) => ({ kind: "milestone" as const, id: m.id, title: m.title, due: m.dueDate?.toISOString().slice(0, 10) ?? null, projectId: m.projectId })),
  ].sort((a, b) => String(a.due ?? "").localeCompare(String(b.due ?? "")));

  void TERMINAL;
  return {
    key: "deadlines", label: "Deadlines", available: true,
    count: items.length, items,
    definition: "Active projects whose target launch date, and open milestones whose due date, fall within 14 days or have already passed.",
  };
}

function appointments(): Panel {
  // The scheduling_* tables belong to the receptionist product and are not the
  // agency's own calendar. Reporting them here as "our appointments" would be
  // wrong, and there is no internal calendar store yet.
  return {
    key: "appointments", label: "Upcoming appointments", available: false,
    reason: "The internal team calendar is not built yet (Milestone 3). Receptionist booking data belongs to the voice product and is not this team's diary.",
    count: null, items: [],
    definition: "Persisted internal calendar events with timezone and cancellation status.",
  };
}

async function documentsSigned(): Promise<Panel> {
  // Proposal/SOW acceptance is tracked as a status string. A status is not a
  // signature: there is no signer identity, no document version binding and no
  // audit evidence, so this cannot be reported as "signed".
  const [c] = await db.select({ count: sql<number>`count(*)` }).from(crmLeads)
    .where(eq(crmLeads.proposalStatus, "Accepted"));
  return {
    key: "documents_signed", label: "Documents signed", available: false,
    reason: `No e-signature provider is connected. ${Number(c?.count ?? 0)} proposal(s) are marked Accepted, but an accepted status carries no signer identity, document version or audit evidence, so it is not a signature.`,
    count: null, items: [],
    definition: "Verified signature events with signer, document version and audit trail.",
  };
}

async function waitingForDocuments(limit: number): Promise<Panel> {
  // A real outstanding request: a proposal or SOW sent and not yet answered.
  const items = await db.select({
    id: crmLeads.id, name: crmLeads.name, company: crmLeads.company,
    proposalStatus: crmLeads.proposalStatus, sowStatus: crmLeads.sowStatus,
    updatedAt: crmLeads.updatedAt, assignedTo: crmLeads.assignedTo,
  }).from(crmLeads).where(or(
    eq(crmLeads.proposalStatus, "Sent"), eq(crmLeads.sowStatus, "Sent"),
  )).orderBy(asc(crmLeads.updatedAt)).limit(limit);
  return {
    key: "waiting_documents", label: "Waiting for documents", available: true,
    count: items.length, items,
    definition: "Leads whose proposal or SOW is marked Sent and has had no answer recorded. Oldest first.",
  };
}

function videosWatched(): Panel {
  return {
    key: "videos_watched", label: "Videos watched", available: false,
    reason: "No video player events are collected. A link click is not a view, so there is nothing honest to count until player instrumentation exists.",
    count: null, items: [],
    definition: "Supported-player playback events past a defined watch threshold.",
  };
}

async function inquiriesNeedingResponse(limit: number): Promise<Panel> {
  const items = await db.select({
    id: discoverySubmissions.id, contactName: discoverySubmissions.contactName,
    companyName: discoverySubmissions.companyName, createdAt: discoverySubmissions.createdAt,
    crmStatus: discoverySubmissions.crmStatus, leadId: discoverySubmissions.leadId,
  }).from(discoverySubmissions).where(eq(discoverySubmissions.crmStatus, "New"))
    .orderBy(desc(discoverySubmissions.createdAt)).limit(limit);
  const [c] = await db.select({ count: sql<number>`count(*)` }).from(discoverySubmissions)
    .where(eq(discoverySubmissions.crmStatus, "New"));
  return {
    key: "inquiries", label: "Inquiries needing a response", available: true,
    count: Number(c?.count ?? 0), items,
    definition: "Discovery submissions still at crmStatus 'New' — nobody has reviewed them yet.",
  };
}

// ── The dashboard endpoint ──────────────────────────────────────────────────

router.get("/crm/command-center", requireCrmAuth(), async (req: Request, res: Response) => {
  const { since, days, label } = rangeFrom(req);
  const { scope, staffId, denied } = scopeOf(req);
  const zone = req.staffAuth?.staff.timezone ?? "UTC";
  const limit = Math.min(Math.max(num(req.query["limit"], 25), 1), 100);

  const [
    leadsPanel, repliesPanel, opensPanel, tasksPanel, deadlinesPanel,
    waitingPanel, signedPanel, inquiriesPanel,
  ] = await Promise.all([
    newLeads(since, limit), emailReplies(since, limit), openedEmails(since, limit),
    tasksDue(staffId, scope, zone, limit), deadlines(limit),
    waitingForDocuments(limit), documentsSigned(), inquiriesNeedingResponse(limit),
  ]);

  const panels: Panel[] = [
    leadsPanel, inquiriesPanel, repliesPanel, opensPanel, returnVisits(),
    tasksPanel, deadlinesPanel, appointments(), signedPanel, waitingPanel, videosWatched(),
  ];

  // ── Sales summary, with every figure's basis stated ───────────────────────
  const OPEN_STAGES = ["Lead", "Qualified", "Proposal"];
  const [dealAgg] = await db.select({
    openCount: sql<number>`count(*) filter (where ${crmDeals.stage} in ('Lead','Qualified','Proposal'))`,
    openValue: sql<string>`coalesce(sum(${crmDeals.value}) filter (where ${crmDeals.stage} in ('Lead','Qualified','Proposal')), 0)`,
    wonCount: sql<number>`count(*) filter (where ${crmDeals.stage} = 'Won')`,
    wonValue: sql<string>`coalesce(sum(${crmDeals.value}) filter (where ${crmDeals.stage} = 'Won'), 0)`,
    lostCount: sql<number>`count(*) filter (where ${crmDeals.stage} = 'Lost')`,
  }).from(crmDeals);

  const [received] = await db.select({
    total: sql<string>`coalesce(sum(${crmTransactions.amount}), 0)`,
    count: sql<number>`count(*)`,
  }).from(crmTransactions).where(eq(crmTransactions.status, "received"));

  const [receivedInPeriod] = await db.select({
    total: sql<string>`coalesce(sum(${crmTransactions.amount}), 0)`,
  }).from(crmTransactions).where(and(
    eq(crmTransactions.status, "received"), gte(crmTransactions.receivedAt, since),
  ));

  const decided = Number(dealAgg?.wonCount ?? 0) + Number(dealAgg?.lostCount ?? 0);

  // Stage-weighted forecast. The weights are an explicit, stated assumption —
  // not a model — so nobody mistakes this for a prediction.
  const WEIGHTS: Record<string, number> = { Lead: 0.1, Qualified: 0.3, Proposal: 0.6 };
  const openByStage = await db.select({
    stage: crmDeals.stage,
    value: sql<string>`coalesce(sum(${crmDeals.value}), 0)`,
    count: sql<number>`count(*)`,
  }).from(crmDeals).where(inArray(crmDeals.stage, OPEN_STAGES)).groupBy(crmDeals.stage);
  const weightedForecast = openByStage.reduce(
    (sum, row) => sum + Number(row.value) * (WEIGHTS[row.stage] ?? 0), 0,
  );

  res.json({
    generatedAt: new Date().toISOString(),
    range: { days, since: since.toISOString(), label },
    scope,
    scopeDenied: denied,
    timezone: zone,
    signedInAs: req.staffAuth?.staff
      ? { id: req.staffAuth.staff.id, displayName: req.staffAuth.staff.displayName }
      : null,
    panels,
    sales: {
      openDeals: { count: Number(dealAgg?.openCount ?? 0), value: Number(dealAgg?.openValue ?? 0) },
      wonDeals: { count: Number(dealAgg?.wonCount ?? 0), value: Number(dealAgg?.wonValue ?? 0) },
      lostDeals: { count: Number(dealAgg?.lostCount ?? 0) },
      winRate: decided === 0 ? null : Math.round((Number(dealAgg?.wonCount ?? 0) / decided) * 100),
      winRateDenominator: decided,
      weightedForecast: Math.round(weightedForecast),
      moneyReceivedAllTime: Number(received?.total ?? 0),
      moneyReceivedInPeriod: Number(receivedInPeriod?.total ?? 0),
      transactionCount: Number(received?.count ?? 0),
      byStage: openByStage.map((r) => ({ stage: r.stage, count: Number(r.count), value: Number(r.value) })),
      definitions: {
        openDeals: "crm_deals at stage Lead, Qualified or Proposal. Pipeline value — not contracted, not invoiced, not received.",
        wonDeals: "crm_deals at stage Won. Contracted value; money is only counted as received when a transaction says so.",
        winRate: "Won / (Won + Lost), all time. Null when nothing has been decided yet — a rate with no denominator is meaningless.",
        weightedForecast: "Open pipeline value weighted by stage (Lead 10%, Qualified 30%, Proposal 60%). A stated assumption, not a prediction.",
        moneyReceived: "Sum of crm_transactions with status 'received'. This is actual cash, distinct from pipeline and contracted value.",
      },
    },
  });
});

/** One panel on its own — used when a button is clicked, so the list matches the count. */
router.get("/crm/command-center/panel/:key", requireCrmAuth(), async (req: Request, res: Response) => {
  const { since } = rangeFrom(req);
  const { scope, staffId } = scopeOf(req);
  const zone = req.staffAuth?.staff.timezone ?? "UTC";
  const limit = Math.min(Math.max(num(req.query["limit"], 50), 1), 200);
  const key = String(req.params["key"] ?? "");

  const resolvers: Record<string, () => Promise<Panel> | Panel> = {
    new_leads: () => newLeads(since, limit),
    inquiries: () => inquiriesNeedingResponse(limit),
    email_replies: () => emailReplies(since, limit),
    opened_emails: () => openedEmails(since, limit),
    return_visits: () => returnVisits(),
    tasks_due: () => tasksDue(staffId, scope, zone, limit),
    deadlines: () => deadlines(limit),
    appointments: () => appointments(),
    documents_signed: () => documentsSigned(),
    waiting_documents: () => waitingForDocuments(limit),
    videos_watched: () => videosWatched(),
  };

  const resolver = resolvers[key];
  if (!resolver) { res.status(404).json({ error: "Unknown panel." }); return; }
  res.json({ panel: await resolver() });
});

/** Recent activity feed — real rows, newest first. */
router.get("/crm/command-center/activity", requireCrmAuth(), async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(num(req.query["limit"], 30), 1), 100);
  const rows = await db.select({
    id: crmActivities.id, leadId: crmActivities.leadId, type: crmActivities.type,
    title: crmActivities.title, description: crmActivities.description,
    createdBy: crmActivities.createdBy, createdAt: crmActivities.createdAt,
  }).from(crmActivities).orderBy(desc(crmActivities.createdAt)).limit(limit);

  const leadIds = [...new Set(rows.map((r) => r.leadId).filter((v): v is number => v != null))];
  const leads = leadIds.length
    ? await db.select({ id: crmLeads.id, name: crmLeads.name }).from(crmLeads).where(inArray(crmLeads.id, leadIds))
    : [];
  const map = new Map(leads.map((l) => [l.id, l.name]));

  res.json({
    generatedAt: new Date().toISOString(),
    activity: rows.map((r) => ({ ...r, leadName: r.leadId ? map.get(r.leadId) ?? null : null })),
  });
});

export default router;
