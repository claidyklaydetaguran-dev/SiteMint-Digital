// ── M2: Operations, My Day, notifications and the reminder queue ────────────
//
// One task system. Everything here reads and writes `crm_tasks` and
// `crm_projects` — the rows Sales, Discovery and the project templates already
// create — so a task raised anywhere shows up in the assignee's My Day rather
// than in a parallel copy.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  db, crmTasks, crmProjects, crmLeads, crmStaff,
  crmProjectMilestones, crmProjectUpdates, crmComments, crmApprovals,
  crmProjectTemplates, crmNotifications, crmScheduledJobs,
  CRM_COMMENT_ENTITIES,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import {
  syncTaskReminder, cancelJob, taskReminderKey, milestoneReminderKey, scheduleJob,
  localDayBounds, getSchedulerStatus, processDueJobs, isValidTimezone, scheduleDailyDigest,
} from "../lib/crmScheduler.js";

const router: IRouter = Router();

/** Who is acting, for attribution. Null on the legacy shared bearer. */
function actor(req: Request): { id: number | null; label: string } {
  const s = req.staffAuth?.staff;
  return { id: s?.id ?? null, label: s?.displayName ?? s?.email ?? "admin" };
}

function actorTimezone(req: Request): string {
  return req.staffAuth?.staff.timezone ?? "UTC";
}

/**
 * Number or undefined — and critically, `null` and `""` are undefined here.
 *
 * `Number(null)` is 0 and `Number("")` is 0, both finite, so a naive
 * implementation turned `{assignedToStaffId: null}` into staff id 0: clearing
 * an assignee silently pointed the task at a person who does not exist rather
 * than unassigning it.
 */
const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const clampLimit = (v: unknown, fallback = 50, max = 200) =>
  Math.min(Math.max(num(v) ?? fallback, 1), max);

// ── Assignable people ───────────────────────────────────────────────────────
// Everyone who can work a task needs the list of names to assign to; this is
// deliberately lighter than the staff directory (no roles, no grants, no
// security state) so it does not need `staff.read`.

router.get("/crm/operations/assignees", requireCrmAuth(), async (_req: Request, res: Response) => {
  const rows = await db.select({
    id: crmStaff.id, displayName: crmStaff.displayName, email: crmStaff.email,
  }).from(crmStaff).where(eq(crmStaff.status, "active")).orderBy(asc(crmStaff.displayName));
  res.json({ assignees: rows });
});

// ── My Day ──────────────────────────────────────────────────────────────────

interface DayBuckets {
  overdue: unknown[]; dueToday: unknown[]; upcoming: unknown[];
  followUps: unknown[]; blocked: unknown[]; unscheduled: unknown[];
}

router.get("/crm/my-day", requireCrmAuth(), async (req: Request, res: Response) => {
  const me = req.staffAuth?.staff;
  const scope = req.query["scope"] === "team" ? "team" : "mine";

  if (scope === "team" && !req.staffAuth?.permissions.has("tasks.read.team")) {
    res.status(403).json({ error: "You do not have permission to see the team's work.", permission: "tasks.read.team" });
    return;
  }

  const zone = actorTimezone(req);
  const { start, end } = localDayBounds(zone);
  const soon = new Date(end.getTime() + 7 * 24 * 3600_000);

  // "Mine" means assigned to me. On the legacy bearer there is no person, so
  // the honest answer is the unassigned queue rather than a pretend inbox.
  const ownership = scope === "team"
    ? undefined
    : me ? eq(crmTasks.assignedToStaffId, me.id) : isNull(crmTasks.assignedToStaffId);

  const openTasks = await db.select().from(crmTasks)
    .where(and(
      ne(crmTasks.status, "completed"),
      isNull(crmTasks.archivedAt),
      ...(ownership ? [ownership] : []),
    ))
    .orderBy(asc(crmTasks.dueDate))
    .limit(500);

  const leadIds = [...new Set(openTasks.map((t) => t.leadId).filter((v): v is number => v != null))];
  const projectIds = [...new Set(openTasks.map((t) => t.projectId).filter((v): v is number => v != null))];
  const staffIds = [...new Set(openTasks.map((t) => t.assignedToStaffId).filter((v): v is number => v != null))];

  const [leads, projects, people] = await Promise.all([
    leadIds.length ? db.select({ id: crmLeads.id, name: crmLeads.name, company: crmLeads.company })
      .from(crmLeads).where(inArray(crmLeads.id, leadIds)) : [],
    projectIds.length ? db.select({ id: crmProjects.id, name: crmProjects.name, stage: crmProjects.stage })
      .from(crmProjects).where(inArray(crmProjects.id, projectIds)) : [],
    staffIds.length ? db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
      .from(crmStaff).where(inArray(crmStaff.id, staffIds)) : [],
  ]);
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const peopleMap = new Map(people.map((p) => [p.id, p.displayName]));

  const decorate = (t: typeof openTasks[number]) => ({
    ...t,
    lead: t.leadId ? leadMap.get(t.leadId) ?? null : null,
    project: t.projectId ? projectMap.get(t.projectId) ?? null : null,
    assigneeName: t.assignedToStaffId ? peopleMap.get(t.assignedToStaffId) ?? null : null,
  });

  const buckets: DayBuckets = { overdue: [], dueToday: [], upcoming: [], followUps: [], blocked: [], unscheduled: [] };
  for (const t of openTasks) {
    const d = decorate(t);
    if (t.blockedReason) { buckets.blocked.push(d); continue; }
    if (!t.dueDate) { buckets.unscheduled.push(d); continue; }
    const ms = t.dueDate.getTime();
    if (ms < start.getTime()) buckets.overdue.push(d);
    else if (ms < end.getTime()) buckets.dueToday.push(d);
    else if (ms < soon.getTime()) buckets.upcoming.push(d);
  }

  // Lead follow-ups are a separate commitment from tasks and are easy to lose,
  // so they get their own bucket rather than being folded into "upcoming".
  const followUpWhere = [
    lt(crmLeads.nextFollowUpAt, end),
    sql`${crmLeads.nextFollowUpAt} IS NOT NULL`,
  ];
  const followUps = await db.select({
    id: crmLeads.id, name: crmLeads.name, company: crmLeads.company,
    status: crmLeads.status, nextFollowUpAt: crmLeads.nextFollowUpAt,
    assignedTo: crmLeads.assignedTo,
  }).from(crmLeads).where(and(...followUpWhere)).orderBy(asc(crmLeads.nextFollowUpAt)).limit(50);
  buckets.followUps = followUps;

  res.json({
    scope,
    timezone: zone,
    dayStart: start.toISOString(),
    dayEnd: end.toISOString(),
    signedInAs: me ? { id: me.id, displayName: me.displayName } : null,
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, (v as unknown[]).length])),
    ...buckets,
  });
});

// ── Tasks (the single task system) ──────────────────────────────────────────

function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : undefined;
}

router.post("/crm/operations/tasks", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const title = typeof b["title"] === "string" ? b["title"].trim() : "";
  if (title.length < 2) { res.status(400).json({ error: "Give the task a title." }); return; }

  const me = actor(req);
  const assignedToStaffId = num(b["assignedToStaffId"]) ?? me.id ?? null;

  // Assigning work to somebody else is a distinct permission from doing
  // your own — enforced here, not just hidden in the UI.
  if (assignedToStaffId !== me.id && !req.staffAuth?.permissions.has("tasks.assign")) {
    res.status(403).json({ error: "You may only create tasks for yourself.", permission: "tasks.assign" });
    return;
  }

  const dueDate = parseDate(b["dueDate"]);
  const remindAt = parseDate(b["remindAt"]);
  if (dueDate === undefined && b["dueDate"] !== undefined) { res.status(400).json({ error: "Invalid due date." }); return; }

  const [task] = await db.insert(crmTasks).values({
    title,
    description: typeof b["description"] === "string" ? b["description"] : null,
    type: typeof b["type"] === "string" ? b["type"] : "Follow Up",
    leadId: num(b["leadId"]) ?? null,
    projectId: num(b["projectId"]) ?? null,
    dueDate: dueDate ?? null,
    remindAt: remindAt ?? null,
    priority: typeof b["priority"] === "string" ? b["priority"] : null,
    recurrence: typeof b["recurrence"] === "string" ? b["recurrence"] : null,
    assignedToStaffId,
    createdByStaffId: me.id,
    createdBy: me.label,
    status: "pending",
  }).returning();

  await syncTaskReminder(task.id);
  res.status(201).json({ task });
});

router.patch("/crm/operations/tasks/:id", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [existing] = await db.select().from(crmTasks).where(eq(crmTasks.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Task not found." }); return; }

  const b = req.body as Record<string, unknown>;
  const me = actor(req);
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof b["title"] === "string" && b["title"].trim().length >= 2) updates["title"] = b["title"].trim();
  if ("description" in b) updates["description"] = typeof b["description"] === "string" ? b["description"] : null;
  if ("priority" in b) updates["priority"] = typeof b["priority"] === "string" ? b["priority"] : null;
  if ("recurrence" in b) updates["recurrence"] = typeof b["recurrence"] === "string" ? b["recurrence"] : null;
  if ("blockedReason" in b) updates["blockedReason"] = typeof b["blockedReason"] === "string" && b["blockedReason"] ? b["blockedReason"] : null;
  if (Array.isArray(b["checklist"])) updates["checklist"] = b["checklist"];

  for (const field of ["dueDate", "remindAt"] as const) {
    if (!(field in b)) continue;
    const parsed = parseDate(b[field]);
    if (parsed === undefined) { res.status(400).json({ error: `Invalid ${field}.` }); return; }
    updates[field] = parsed;
  }

  if ("assignedToStaffId" in b) {
    // An explicit null unassigns; `num` no longer collapses that to 0.
    const next = b["assignedToStaffId"] === null ? null : num(b["assignedToStaffId"]) ?? null;
    if (next !== existing.assignedToStaffId && !req.staffAuth?.permissions.has("tasks.assign")) {
      res.status(403).json({ error: "You may not reassign work.", permission: "tasks.assign" });
      return;
    }
    updates["assignedToStaffId"] = next;
  }

  if (typeof b["status"] === "string") {
    updates["status"] = b["status"];
    if (b["status"] === "completed") {
      updates["completedAt"] = new Date();
      updates["completedByStaffId"] = me.id;
    } else {
      updates["completedAt"] = null;
      updates["completedByStaffId"] = null;
    }
  }
  if ("archived" in b) updates["archivedAt"] = b["archived"] ? new Date() : null;

  const [task] = await db.update(crmTasks).set(updates).where(eq(crmTasks.id, id)).returning();

  // Completion, reassignment, archiving and date changes all flow through the
  // same reconcile, so a stale reminder can never survive any of them.
  await syncTaskReminder(id);

  // Notify the new assignee when somebody else hands them work.
  if (task.assignedToStaffId && task.assignedToStaffId !== existing.assignedToStaffId
    && task.assignedToStaffId !== me.id) {
    await db.insert(crmNotifications).values({
      staffId: task.assignedToStaffId, kind: "task_assigned",
      title: task.title, body: `${me.label} assigned this to you.`,
      href: "/admin/crm/my-day", entityType: "task", entityId: task.id,
    });
  }

  res.json({ task });
});

// ── Operations: projects ────────────────────────────────────────────────────

router.get("/crm/operations/projects", requireCrmAuth("projects.read"), async (req: Request, res: Response) => {
  const limit = clampLimit(req.query["limit"]);
  const offset = Math.max(num(req.query["offset"]) ?? 0, 0);
  const stage = typeof req.query["stage"] === "string" ? req.query["stage"] : undefined;
  const ownerId = num(req.query["ownerStaffId"]);
  const includeArchived = req.query["includeArchived"] === "true";

  const where = [
    ...(includeArchived ? [] : [isNull(crmProjects.archivedAt)]),
    ...(stage ? [eq(crmProjects.stage, stage)] : []),
    ...(ownerId ? [eq(crmProjects.ownerStaffId, ownerId)] : []),
  ];

  const [rows, [countRow]] = await Promise.all([
    db.select().from(crmProjects).where(where.length ? and(...where) : undefined)
      .orderBy(desc(crmProjects.updatedAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(crmProjects)
      .where(where.length ? and(...where) : undefined),
  ]);

  // Open-task and milestone counts come from one grouped query each rather
  // than a query per project.
  const ids = rows.map((r) => r.id);
  const [taskCounts, milestoneCounts] = await Promise.all([
    ids.length ? db.select({
      projectId: crmTasks.projectId,
      open: sql<number>`count(*) filter (where ${crmTasks.status} <> 'completed')`,
      total: sql<number>`count(*)`,
    }).from(crmTasks).where(and(inArray(crmTasks.projectId, ids), isNull(crmTasks.archivedAt)))
      .groupBy(crmTasks.projectId) : [],
    ids.length ? db.select({
      projectId: crmProjectMilestones.projectId,
      done: sql<number>`count(*) filter (where ${crmProjectMilestones.status} = 'done')`,
      total: sql<number>`count(*)`,
    }).from(crmProjectMilestones).where(inArray(crmProjectMilestones.projectId, ids))
      .groupBy(crmProjectMilestones.projectId) : [],
  ]);
  const tc = new Map(taskCounts.map((r) => [r.projectId, r]));
  const mc = new Map(milestoneCounts.map((r) => [r.projectId, r]));

  res.json({
    projects: rows.map((p) => {
      const t = tc.get(p.id); const m = mc.get(p.id);
      const doneTasks = Number(t?.total ?? 0) - Number(t?.open ?? 0);
      return {
        ...p,
        openTasks: Number(t?.open ?? 0),
        totalTasks: Number(t?.total ?? 0),
        doneMilestones: Number(m?.done ?? 0),
        totalMilestones: Number(m?.total ?? 0),
        // Progress is DERIVED from real task/milestone state, never typed in.
        progressPercent: Number(t?.total ?? 0) === 0 ? null
          : Math.round((doneTasks / Number(t!.total)) * 100),
      };
    }),
    total: Number(countRow?.count ?? 0),
    limit, offset,
  });
});

router.get("/crm/operations/projects/:id", requireCrmAuth("projects.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, id)).limit(1);
  if (!project) { res.status(404).json({ error: "Project not found." }); return; }

  const [tasks, milestones, updates, comments, approvals] = await Promise.all([
    db.select().from(crmTasks).where(and(eq(crmTasks.projectId, id), isNull(crmTasks.archivedAt)))
      .orderBy(asc(crmTasks.dueDate), asc(crmTasks.id)),
    db.select().from(crmProjectMilestones).where(eq(crmProjectMilestones.projectId, id))
      .orderBy(asc(crmProjectMilestones.orderIndex), asc(crmProjectMilestones.id)),
    db.select().from(crmProjectUpdates).where(eq(crmProjectUpdates.projectId, id))
      .orderBy(desc(crmProjectUpdates.createdAt)).limit(50),
    db.select().from(crmComments).where(and(
      eq(crmComments.entityType, "project"), eq(crmComments.entityId, id), isNull(crmComments.deletedAt),
    )).orderBy(asc(crmComments.createdAt)).limit(200),
    db.select().from(crmApprovals).where(and(
      eq(crmApprovals.entityType, "project"), eq(crmApprovals.entityId, id),
    )).orderBy(desc(crmApprovals.createdAt)),
  ]);

  const lead = project.leadId
    ? (await db.select({ id: crmLeads.id, name: crmLeads.name, company: crmLeads.company, email: crmLeads.email })
        .from(crmLeads).where(eq(crmLeads.id, project.leadId)).limit(1))[0] ?? null
    : null;

  res.json({ project, lead, tasks, milestones, updates, comments, approvals });
});

router.patch("/crm/operations/projects/:id", requireCrmAuth("projects.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const b = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  for (const f of ["name", "stage", "projectType", "notes", "nextAction", "priority", "blockedReason"] as const) {
    if (f in b) updates[f] = typeof b[f] === "string" && b[f] !== "" ? b[f] : null;
  }
  if ("ownerStaffId" in b) updates["ownerStaffId"] = num(b["ownerStaffId"]) ?? null;
  if (Array.isArray(b["collaboratorStaffIds"])) {
    updates["collaboratorStaffIds"] = (b["collaboratorStaffIds"] as unknown[]).map(Number).filter(Number.isFinite);
  }
  if ("nextActionDueAt" in b) {
    const d = parseDate(b["nextActionDueAt"]);
    if (d === undefined) { res.status(400).json({ error: "Invalid next-action date." }); return; }
    updates["nextActionDueAt"] = d;
  }
  for (const f of ["startDate", "targetLaunchDate"] as const) {
    if (f in b) updates[f] = typeof b[f] === "string" && b[f] ? b[f] : null;
  }
  if ("archived" in b) updates["archivedAt"] = b["archived"] ? new Date() : null;

  const [project] = await db.update(crmProjects).set(updates).where(eq(crmProjects.id, id)).returning();
  if (!project) { res.status(404).json({ error: "Project not found." }); return; }
  if ("archived" in b) {
    await auditAction(req, b["archived"] ? "project.archived" : "project.restored", `project:${id}`);
  }
  res.json({ project });
});

// ── Milestones ──────────────────────────────────────────────────────────────

router.post("/crm/operations/projects/:id/milestones", requireCrmAuth("projects.write"), async (req: Request, res: Response) => {
  const projectId = num(req.params["id"]);
  if (!projectId) { res.status(400).json({ error: "Invalid project id." }); return; }
  const b = req.body as Record<string, unknown>;
  const title = typeof b["title"] === "string" ? b["title"].trim() : "";
  if (title.length < 2) { res.status(400).json({ error: "Give the milestone a title." }); return; }

  const dueDate = parseDate(b["dueDate"]);
  if (dueDate === undefined && b["dueDate"] !== undefined) { res.status(400).json({ error: "Invalid due date." }); return; }

  const [{ next }] = await db.select({
    next: sql<number>`coalesce(max(${crmProjectMilestones.orderIndex}), -1) + 1`,
  }).from(crmProjectMilestones).where(eq(crmProjectMilestones.projectId, projectId));

  const [milestone] = await db.insert(crmProjectMilestones).values({
    projectId, title,
    description: typeof b["description"] === "string" ? b["description"] : null,
    dueDate: dueDate ?? null,
    dependsOnMilestoneId: num(b["dependsOnMilestoneId"]) ?? null,
    orderIndex: Number(next ?? 0),
  }).returning();

  if (milestone.dueDate) {
    await scheduleJob({
      kind: "milestone_reminder", dedupeKey: milestoneReminderKey(milestone.id),
      runAt: milestone.dueDate, payload: { milestoneId: milestone.id },
    });
  }
  res.status(201).json({ milestone });
});

router.patch("/crm/operations/milestones/:id", requireCrmAuth("projects.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [existing] = await db.select().from(crmProjectMilestones)
    .where(eq(crmProjectMilestones.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Milestone not found." }); return; }

  const b = req.body as Record<string, unknown>;
  const me = actor(req);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof b["title"] === "string" && b["title"].trim()) updates["title"] = b["title"].trim();
  if ("description" in b) updates["description"] = typeof b["description"] === "string" ? b["description"] : null;
  if ("blockedReason" in b) updates["blockedReason"] = typeof b["blockedReason"] === "string" && b["blockedReason"] ? b["blockedReason"] : null;
  if ("orderIndex" in b) updates["orderIndex"] = num(b["orderIndex"]) ?? existing.orderIndex;
  if ("dueDate" in b) {
    const d = parseDate(b["dueDate"]);
    if (d === undefined) { res.status(400).json({ error: "Invalid due date." }); return; }
    updates["dueDate"] = d;
  }
  if (typeof b["status"] === "string") {
    // A milestone cannot be completed while something it depends on is open —
    // otherwise "done" stops meaning anything.
    if (b["status"] === "done" && existing.dependsOnMilestoneId) {
      const [dep] = await db.select().from(crmProjectMilestones)
        .where(eq(crmProjectMilestones.id, existing.dependsOnMilestoneId)).limit(1);
      if (dep && dep.status !== "done") {
        res.status(409).json({ error: `"${dep.title}" has to be finished first.` });
        return;
      }
    }
    updates["status"] = b["status"];
    updates["completedAt"] = b["status"] === "done" ? new Date() : null;
    updates["completedByStaffId"] = b["status"] === "done" ? me.id : null;
  }

  const [milestone] = await db.update(crmProjectMilestones).set(updates)
    .where(eq(crmProjectMilestones.id, id)).returning();

  if (milestone.status === "done" || !milestone.dueDate) {
    await cancelJob(milestoneReminderKey(id));
  } else {
    await scheduleJob({
      kind: "milestone_reminder", dedupeKey: milestoneReminderKey(id),
      runAt: milestone.dueDate, payload: { milestoneId: id },
    });
  }
  res.json({ milestone });
});

// ── Dated work updates ──────────────────────────────────────────────────────

router.post("/crm/operations/projects/:id/updates", requireCrmAuth("projects.write"), async (req: Request, res: Response) => {
  const projectId = num(req.params["id"]);
  const body = typeof (req.body as Record<string, unknown>)["body"] === "string"
    ? String((req.body as Record<string, unknown>)["body"]).trim() : "";
  if (!projectId) { res.status(400).json({ error: "Invalid project id." }); return; }
  if (body.length < 2) { res.status(400).json({ error: "Write what happened." }); return; }

  const me = actor(req);
  const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, projectId)).limit(1);
  if (!project) { res.status(404).json({ error: "Project not found." }); return; }

  const [update] = await db.insert(crmProjectUpdates).values({
    projectId, body, stageAtUpdate: project.stage,
    authorStaffId: me.id, authorLabel: me.label,
  }).returning();
  res.status(201).json({ update });
});

// ── Comments (generic) ──────────────────────────────────────────────────────

router.get("/crm/operations/comments", requireCrmAuth(), async (req: Request, res: Response) => {
  const entityType = String(req.query["entityType"] ?? "");
  const entityId = num(req.query["entityId"]);
  if (!(CRM_COMMENT_ENTITIES as readonly string[]).includes(entityType) || !entityId) {
    res.status(400).json({ error: "Unknown record." }); return;
  }
  const rows = await db.select().from(crmComments).where(and(
    eq(crmComments.entityType, entityType), eq(crmComments.entityId, entityId), isNull(crmComments.deletedAt),
  )).orderBy(asc(crmComments.createdAt)).limit(200);
  res.json({ comments: rows });
});

router.post("/crm/operations/comments", requireCrmAuth(), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const entityType = String(b["entityType"] ?? "");
  const entityId = num(b["entityId"]);
  const body = typeof b["body"] === "string" ? b["body"].trim() : "";
  if (!(CRM_COMMENT_ENTITIES as readonly string[]).includes(entityType) || !entityId) {
    res.status(400).json({ error: "Unknown record." }); return;
  }
  if (body.length < 1) { res.status(400).json({ error: "Write a comment." }); return; }
  const me = actor(req);
  const [comment] = await db.insert(crmComments).values({
    entityType, entityId, body,
    // Internal by default: staff discussion must never leak to a customer
    // surface by accident.
    isInternal: b["isInternal"] === false ? false : true,
    authorStaffId: me.id, authorLabel: me.label,
  }).returning();
  res.status(201).json({ comment });
});

// ── Approvals ───────────────────────────────────────────────────────────────

router.post("/crm/operations/approvals", requireCrmAuth("projects.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const entityType = String(b["entityType"] ?? "project");
  const entityId = num(b["entityId"]);
  const title = typeof b["title"] === "string" ? b["title"].trim() : "";
  if (!entityId || title.length < 2) { res.status(400).json({ error: "Say what needs approving." }); return; }
  const me = actor(req);
  const approverStaffId = num(b["approverStaffId"]) ?? null;

  const [approval] = await db.insert(crmApprovals).values({
    entityType, entityId, title,
    detail: typeof b["detail"] === "string" ? b["detail"] : null,
    requestedByStaffId: me.id, requestedByLabel: me.label,
    approverStaffId,
  }).returning();

  if (approverStaffId) {
    await db.insert(crmNotifications).values({
      staffId: approverStaffId, kind: "approval_requested", title: `Approval needed: ${title}`,
      body: `${me.label} asked for your decision.`, href: "/admin/crm/operations",
      entityType, entityId,
    });
  }
  res.status(201).json({ approval });
});

router.post("/crm/operations/approvals/:id/decide", requireCrmAuth("projects.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  const b = req.body as Record<string, unknown>;
  const decision = b["decision"] === "approved" ? "approved" : b["decision"] === "rejected" ? "rejected" : null;
  if (!id || !decision) { res.status(400).json({ error: "Approve or reject." }); return; }

  const [existing] = await db.select().from(crmApprovals).where(eq(crmApprovals.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found." }); return; }
  if (existing.status !== "pending") { res.status(409).json({ error: "Already decided." }); return; }

  const me = actor(req);
  // When an approval is routed to one person, only that person may decide it.
  if (existing.approverStaffId && existing.approverStaffId !== me.id) {
    res.status(403).json({ error: "This approval is assigned to someone else." });
    return;
  }

  const [approval] = await db.update(crmApprovals).set({
    status: decision, decidedByStaffId: me.id, decidedAt: new Date(),
    decisionNote: typeof b["note"] === "string" ? b["note"] : null,
  }).where(eq(crmApprovals.id, id)).returning();

  if (existing.requestedByStaffId && existing.requestedByStaffId !== me.id) {
    await db.insert(crmNotifications).values({
      staffId: existing.requestedByStaffId, kind: "approval_decided",
      title: `${decision === "approved" ? "Approved" : "Rejected"}: ${existing.title}`,
      body: `${me.label} decided.`, href: "/admin/crm/operations",
      entityType: existing.entityType, entityId: existing.entityId,
    });
  }
  await auditAction(req, `approval.${decision}`, `approval:${id}`);
  res.json({ approval });
});

// ── Templates ───────────────────────────────────────────────────────────────

router.get("/crm/operations/templates", requireCrmAuth("projects.read"), async (_req: Request, res: Response) => {
  const rows = await db.select().from(crmProjectTemplates)
    .where(isNull(crmProjectTemplates.archivedAt)).orderBy(asc(crmProjectTemplates.name));
  res.json({ templates: rows });
});

router.post("/crm/operations/templates", requireCrmAuth("projects.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const name = typeof b["name"] === "string" ? b["name"].trim() : "";
  if (name.length < 2) { res.status(400).json({ error: "Give the template a name." }); return; }
  const me = actor(req);
  try {
    const [template] = await db.insert(crmProjectTemplates).values({
      name,
      description: typeof b["description"] === "string" ? b["description"] : null,
      projectType: typeof b["projectType"] === "string" ? b["projectType"] : null,
      tasks: Array.isArray(b["tasks"]) ? b["tasks"] as never : [],
      milestones: Array.isArray(b["milestones"]) ? b["milestones"] as never : [],
      checklist: Array.isArray(b["checklist"]) ? b["checklist"] as never : [],
      createdByStaffId: me.id,
    }).returning();
    res.status(201).json({ template });
  } catch {
    res.status(409).json({ error: "A template with that name already exists." });
  }
});

router.post("/crm/operations/projects/:id/apply-template", requireCrmAuth("projects.write"), async (req: Request, res: Response) => {
  const projectId = num(req.params["id"]);
  const templateId = num((req.body as Record<string, unknown>)["templateId"]);
  if (!projectId || !templateId) { res.status(400).json({ error: "Pick a template." }); return; }

  const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, projectId)).limit(1);
  const [template] = await db.select().from(crmProjectTemplates)
    .where(eq(crmProjectTemplates.id, templateId)).limit(1);
  if (!project || !template) { res.status(404).json({ error: "Not found." }); return; }

  const me = actor(req);
  const base = project.startDate ? new Date(`${project.startDate}T00:00:00Z`) : new Date();
  const offsetDate = (days?: number) =>
    days == null ? null : new Date(base.getTime() + days * 24 * 3600_000);

  const createdTasks = template.tasks.length
    ? await db.insert(crmTasks).values(template.tasks.map((t) => ({
        projectId, leadId: project.leadId ?? null,
        title: t.title, description: t.description ?? null,
        type: t.type ?? "Project Task",
        dueDate: offsetDate(t.dayOffset),
        assignedToStaffId: project.ownerStaffId ?? me.id,
        createdByStaffId: me.id, createdBy: me.label, status: "pending" as const,
      }))).returning()
    : [];

  const [{ next }] = await db.select({
    next: sql<number>`coalesce(max(${crmProjectMilestones.orderIndex}), -1) + 1`,
  }).from(crmProjectMilestones).where(eq(crmProjectMilestones.projectId, projectId));

  const createdMilestones = template.milestones.length
    ? await db.insert(crmProjectMilestones).values(template.milestones.map((m, i) => ({
        projectId, title: m.title, description: m.description ?? null,
        dueDate: offsetDate(m.dayOffset), orderIndex: Number(next ?? 0) + i,
      }))).returning()
    : [];

  for (const t of createdTasks) await syncTaskReminder(t.id);
  for (const m of createdMilestones) {
    if (m.dueDate) {
      await scheduleJob({
        kind: "milestone_reminder", dedupeKey: milestoneReminderKey(m.id),
        runAt: m.dueDate, payload: { milestoneId: m.id },
      });
    }
  }

  await db.insert(crmProjectUpdates).values({
    projectId, body: `Applied the "${template.name}" template: ${createdTasks.length} task(s), ${createdMilestones.length} milestone(s).`,
    stageAtUpdate: project.stage, authorStaffId: me.id, authorLabel: me.label,
  });

  res.status(201).json({ tasks: createdTasks, milestones: createdMilestones });
});

// ── Notifications ───────────────────────────────────────────────────────────

router.get("/crm/notifications", requireCrmAuth(), async (req: Request, res: Response) => {
  const me = req.staffAuth?.staff;
  if (!me) { res.json({ notifications: [], unread: 0, available: false }); return; }
  const limit = clampLimit(req.query["limit"], 30, 100);
  const rows = await db.select().from(crmNotifications)
    .where(eq(crmNotifications.staffId, me.id))
    .orderBy(desc(crmNotifications.createdAt)).limit(limit);
  const [unread] = await db.select({ count: sql<number>`count(*)` }).from(crmNotifications)
    .where(and(eq(crmNotifications.staffId, me.id), isNull(crmNotifications.readAt)));
  res.json({ notifications: rows, unread: Number(unread?.count ?? 0), available: true });
});

router.post("/crm/notifications/read", requireCrmAuth(), async (req: Request, res: Response) => {
  const me = req.staffAuth?.staff;
  if (!me) { res.status(400).json({ error: "No personal account on this session." }); return; }
  const ids = Array.isArray((req.body as Record<string, unknown>)["ids"])
    ? ((req.body as Record<string, unknown>)["ids"] as unknown[]).map(Number).filter(Number.isFinite)
    : [];
  await db.update(crmNotifications).set({ readAt: new Date() }).where(and(
    eq(crmNotifications.staffId, me.id),
    isNull(crmNotifications.readAt),
    ...(ids.length ? [inArray(crmNotifications.id, ids)] : []),
  ));
  res.json({ ok: true });
});

// ── Reminder preferences ────────────────────────────────────────────────────

router.patch("/crm/operations/reminder-preferences", requireCrmAuth(), async (req: Request, res: Response) => {
  const me = req.staffAuth?.staff;
  if (!me) { res.status(400).json({ error: "No personal account on this session." }); return; }
  const b = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof b["timezone"] === "string") {
    if (!isValidTimezone(b["timezone"])) { res.status(400).json({ error: "Unknown timezone." }); return; }
    updates["timezone"] = b["timezone"];
  }
  if ("reminderEmailEnabled" in b) updates["reminderEmailEnabled"] = !!b["reminderEmailEnabled"];
  if ("dailyDigestEnabled" in b) updates["dailyDigestEnabled"] = !!b["dailyDigestEnabled"];
  if ("dailyDigestHour" in b) {
    const h = num(b["dailyDigestHour"]);
    if (h == null || h < 0 || h > 23) { res.status(400).json({ error: "Pick an hour between 0 and 23." }); return; }
    updates["dailyDigestHour"] = h;
  }

  const [staff] = await db.update(crmStaff).set(updates).where(eq(crmStaff.id, me.id)).returning();
  await scheduleDailyDigest(me.id);
  res.json({
    timezone: staff.timezone,
    reminderEmailEnabled: staff.reminderEmailEnabled,
    dailyDigestEnabled: staff.dailyDigestEnabled,
    dailyDigestHour: staff.dailyDigestHour,
  });
});

// ── Reminder-queue visibility ───────────────────────────────────────────────
//
// Permanent failures must be visible to an operator, not just logged.

router.get("/crm/operations/jobs", requireCrmAuth("settings.read"), async (req: Request, res: Response) => {
  const [counts] = await db.select({
    pending: sql<number>`count(*) filter (where ${crmScheduledJobs.status} = 'pending')`,
    running: sql<number>`count(*) filter (where ${crmScheduledJobs.status} = 'running')`,
    failed: sql<number>`count(*) filter (where ${crmScheduledJobs.status} = 'failed')`,
    completed: sql<number>`count(*) filter (where ${crmScheduledJobs.status} = 'completed')`,
  }).from(crmScheduledJobs);

  const failures = await db.select().from(crmScheduledJobs)
    .where(eq(crmScheduledJobs.status, "failed"))
    .orderBy(desc(crmScheduledJobs.updatedAt)).limit(clampLimit(req.query["limit"], 20, 100));

  const upcoming = await db.select().from(crmScheduledJobs)
    .where(eq(crmScheduledJobs.status, "pending"))
    .orderBy(asc(crmScheduledJobs.runAt)).limit(10);

  res.json({
    scheduler: getSchedulerStatus(),
    counts: {
      pending: Number(counts?.pending ?? 0), running: Number(counts?.running ?? 0),
      failed: Number(counts?.failed ?? 0), completed: Number(counts?.completed ?? 0),
    },
    failures, upcoming,
  });
});

/** Operator-triggered tick, for verifying delivery without waiting. */
router.post("/crm/operations/jobs/run", requireCrmAuth("settings.write"), async (_req: Request, res: Response) => {
  const result = await processDueJobs();
  res.json(result);
});

router.post("/crm/operations/jobs/:id/retry", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [job] = await db.update(crmScheduledJobs)
    .set({ status: "pending", attempts: 0, runAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(and(eq(crmScheduledJobs.id, id), eq(crmScheduledJobs.status, "failed")))
    .returning();
  if (!job) { res.status(404).json({ error: "No failed job with that id." }); return; }
  res.json({ job });
});

export default router;
