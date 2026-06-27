import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, crmLeads, crmActivities, crmTasks, crmEmailTemplates, discoverySubmissions, crmDeals, crmCampaigns, crmCampaignRecipients, crmCampaignEvents, crmMessages, crmBehavioralEvents, crmCampaignSteps, crmCampaignScheduledMessages } from "@workspace/db";
import type { InsertCrmBehavioralEvent } from "@workspace/db";
import type { CrmLead, DiscoverySubmission } from "@workspace/db";
import { eq, desc, and, gte, lte, lt, or, ilike, sql, inArray } from "drizzle-orm";
import { validateToken } from "../lib/admin-session.js";
import { getResend } from "../lib/email.js";
import { generateProposal, generateSOW } from "../lib/generators.js";
import { normalizePhone } from "../lib/twilio.js";

const router: IRouter = Router();

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.substring(7);
  if (!validateToken(token)) { res.status(401).json({ error: "Invalid token" }); return; }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function logActivity(leadId: number, type: string, title: string, description?: string, metadata?: Record<string, unknown>) {
  await db.insert(crmActivities).values({ leadId, type, title, description, metadata });
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────
router.get("/crm/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, newLeads, hotLeads, won, lost, followUpToday, overdue, smsSent30d, smsDelivered30d] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.status, "New")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.priority, "High")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.status, "Won")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.status, "Lost")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(and(gte(crmLeads.nextFollowUpAt, todayStart), lt(crmLeads.nextFollowUpAt, todayEnd))).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(lt(crmLeads.nextFollowUpAt, todayStart)).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmMessages)
        .where(and(eq(crmMessages.direction, "outbound"), eq(crmMessages.channel, "sms"), gte(crmMessages.createdAt, thirtyDaysAgo)))
        .then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmMessages)
        .where(and(eq(crmMessages.direction, "outbound"), eq(crmMessages.channel, "sms"), eq(crmMessages.status, "delivered"), gte(crmMessages.createdAt, thirtyDaysAgo)))
        .then(r => Number(r[0].count)),
    ]);

    const recentActivity = await db.select({
      id: crmActivities.id,
      type: crmActivities.type,
      title: crmActivities.title,
      description: crmActivities.description,
      createdAt: crmActivities.createdAt,
      leadId: crmActivities.leadId,
    }).from(crmActivities).orderBy(desc(crmActivities.createdAt)).limit(15);

    res.json({ stats: { total, newLeads, hotLeads, won, lost, followUpToday, overdue, smsSent30d, smsDelivered30d }, recentActivity });
  } catch (err) {
    req.log.error({ err }, "Error fetching CRM stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ── Leads list ────────────────────────────────────────────────────────────────
router.get("/crm/leads", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { search, status, priority, source } = req.query as Record<string, string>;
    const conditions = [];
    if (search) {
      conditions.push(or(
        ilike(crmLeads.name, `%${search}%`),
        ilike(crmLeads.email, `%${search}%`),
        ilike(crmLeads.company, `%${search}%`),
        ilike(crmLeads.phone, `%${search}%`),
      ));
    }
    if (status) conditions.push(eq(crmLeads.status, status));
    if (priority) conditions.push(eq(crmLeads.priority, priority));
    if (source) conditions.push(eq(crmLeads.source, source));

    const leads = await db.select().from(crmLeads)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(crmLeads.createdAt));
    res.json({ leads });
  } catch (err) {
    req.log.error({ err }, "Error fetching CRM leads");
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// ── Create lead ───────────────────────────────────────────────────────────────
router.post("/crm/leads", requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = req.body as Record<string, unknown>;
    if (!data.name || !data.email) { res.status(400).json({ error: "Name and email are required" }); return; }

    const [lead] = await db.insert(crmLeads).values({
      name: String(data.name),
      email: String(data.email),
      company: data.company ? String(data.company) : undefined,
      phone: data.phone ? String(data.phone) : undefined,
      website: data.website ? String(data.website) : undefined,
      source: data.source ? String(data.source) : "Manual Entry",
      serviceInterest: data.serviceInterest ? String(data.serviceInterest) : undefined,
      status: data.status ? String(data.status) : "New",
      priority: data.priority ? String(data.priority) : "Medium",
      assignedTo: data.assignedTo ? String(data.assignedTo) : undefined,
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      notes: data.notes ? String(data.notes) : undefined,
      estimatedValue: data.estimatedValue ? String(data.estimatedValue) : undefined,
      packageType: data.packageType ? String(data.packageType) : undefined,
      nextFollowUpAt: data.nextFollowUpAt ? new Date(String(data.nextFollowUpAt)) : undefined,
    }).returning();

    await logActivity(lead.id, "lead_created", `Lead created: ${lead.name}`, `Source: ${lead.source}`);
    res.status(201).json({ lead });
  } catch (err) {
    req.log.error({ err }, "Error creating lead");
    res.status(500).json({ error: "Failed to create lead" });
  }
});

// ── Get lead ──────────────────────────────────────────────────────────────────
router.get("/crm/leads/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    const [activities, tasks] = await Promise.all([
      db.select().from(crmActivities).where(eq(crmActivities.leadId, id)).orderBy(desc(crmActivities.createdAt)),
      db.select().from(crmTasks).where(eq(crmTasks.leadId, id)).orderBy(desc(crmTasks.createdAt)),
    ]);

    res.json({ lead, activities, tasks });
  } catch (err) {
    req.log.error({ err }, "Error fetching lead");
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// ── Update lead ───────────────────────────────────────────────────────────────
router.patch("/crm/leads/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [existing] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }

    const data = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const fields = ["name","company","email","website","source","serviceInterest",
      "priority","assignedTo","notes","estimatedValue","packageType",
      "discoveryFormStatus","proposalStatus","sowStatus"];
    for (const f of fields) {
      if (data[f] !== undefined) updates[f] = data[f];
    }
    // Normalize phone to E.164 before storing; preserve null/empty as-is
    if (data.phone !== undefined) {
      const rawPhone = data.phone as string | null | undefined;
      updates.phone = rawPhone ? normalizePhone(rawPhone) : rawPhone ?? null;
    }
    if (data.tags !== undefined) updates.tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    if (data.nextFollowUpAt !== undefined) updates.nextFollowUpAt = data.nextFollowUpAt ? new Date(String(data.nextFollowUpAt)) : null;
    if (data.lastContactedAt !== undefined) updates.lastContactedAt = data.lastContactedAt ? new Date(String(data.lastContactedAt)) : null;

    const prevStatus = existing.status;
    if (data.status !== undefined && data.status !== prevStatus) {
      updates.status = data.status;
      await logActivity(id, "status_changed", `Status changed to ${data.status}`, `From: ${prevStatus} → To: ${data.status}`, { from: prevStatus, to: data.status });
    }
    if (data.nextFollowUpAt !== undefined && String(data.nextFollowUpAt) !== String(existing.nextFollowUpAt)) {
      await logActivity(id, "follow_up_changed", `Follow-up set for ${new Date(String(data.nextFollowUpAt)).toLocaleDateString()}`);
    }

    const [updated] = await db.update(crmLeads).set(updates).where(eq(crmLeads.id, id)).returning();
    res.json({ lead: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating lead");
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// ── Delete lead ───────────────────────────────────────────────────────────────
router.delete("/crm/leads/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmTasks).where(eq(crmTasks.leadId, id));
    await db.delete(crmActivities).where(eq(crmActivities.leadId, id));
    const [deleted] = await db.delete(crmLeads).where(eq(crmLeads.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Lead not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting lead");
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

// ── Add note ──────────────────────────────────────────────────────────────────
router.post("/crm/leads/:id/notes", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { note } = req.body as { note?: string };
    if (!note?.trim()) { res.status(400).json({ error: "Note is required" }); return; }

    const [existing] = await db.select({ notes: crmLeads.notes }).from(crmLeads).where(eq(crmLeads.id, id));
    if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }

    const timestamp = new Date().toLocaleString();
    const appended = existing.notes ? `${existing.notes}\n\n[${timestamp}] ${note}` : `[${timestamp}] ${note}`;
    await db.update(crmLeads).set({ notes: appended, updatedAt: new Date() }).where(eq(crmLeads.id, id));
    await logActivity(id, "note_added", "Note added", note.substring(0, 120));
    res.json({ ok: true, notes: appended });
  } catch (err) {
    req.log.error({ err }, "Error adding note");
    res.status(500).json({ error: "Failed to add note" });
  }
});

// ── Activities (manual creation) ──────────────────────────────────────────────
router.post("/crm/leads/:id/activities", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { type, title, description, metadata } = req.body as {
      type?: string; title?: string; description?: string; metadata?: Record<string, unknown>;
    };
    if (!type?.trim()) { res.status(400).json({ error: "type is required" }); return; }
    if (!title?.trim()) { res.status(400).json({ error: "title is required" }); return; }

    const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    const [activity] = await db.insert(crmActivities).values({
      leadId: id,
      type: type.trim(),
      title: title.trim(),
      description: description?.trim() || undefined,
      metadata: metadata ?? undefined,
    }).returning();

    res.json({ activity });
  } catch (err) {
    req.log.error({ err }, "Error creating activity");
    res.status(500).json({ error: "Failed to create activity" });
  }
});

// ── Tasks ──────────────────────────────────────────────────────────────────────
router.post("/crm/leads/:id/tasks", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const data = req.body as Record<string, unknown>;
    if (!data.title) { res.status(400).json({ error: "Title is required" }); return; }

    const [task] = await db.insert(crmTasks).values({
      leadId: id,
      type: data.type ? String(data.type) : "Follow Up",
      title: String(data.title),
      description: data.description ? String(data.description) : undefined,
      dueDate: data.dueDate ? new Date(String(data.dueDate)) : undefined,
      status: "pending",
    }).returning();

    await logActivity(id, "task_created", `Task created: ${task.title}`, `Type: ${task.type}`);
    res.status(201).json({ task });
  } catch (err) {
    req.log.error({ err }, "Error creating task");
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.patch("/crm/tasks/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const data = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === "completed") updates.completedAt = new Date();
    }
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.dueDate !== undefined) updates.dueDate = data.dueDate ? new Date(String(data.dueDate)) : null;
    if (data.type !== undefined) updates.type = data.type;

    const [updated] = await db.update(crmTasks).set(updates).where(eq(crmTasks.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Task not found" }); return; }

    if (data.status === "completed") {
      await logActivity(updated.leadId, "task_completed", `Task completed: ${updated.title}`);
    }
    res.json({ task: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating task");
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/crm/tasks/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [deleted] = await db.delete(crmTasks).where(eq(crmTasks.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Task not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting task");
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ── All tasks (for tasks page) ────────────────────────────────────────────────
router.get("/crm/tasks", requireAdmin, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const tasks = await db.select({
      id: crmTasks.id, leadId: crmTasks.leadId, type: crmTasks.type,
      title: crmTasks.title, description: crmTasks.description,
      dueDate: crmTasks.dueDate, status: crmTasks.status,
      completedAt: crmTasks.completedAt, createdAt: crmTasks.createdAt,
      leadName: crmLeads.name, leadCompany: crmLeads.company,
    }).from(crmTasks).leftJoin(crmLeads, eq(crmTasks.leadId, crmLeads.id))
      .orderBy(crmTasks.dueDate);

    // Auto-mark overdue
    const overdueTasks = tasks.filter(t => t.status === "pending" && t.dueDate && new Date(t.dueDate) < now);
    if (overdueTasks.length) {
      await db.update(crmTasks).set({ status: "overdue" })
        .where(and(eq(crmTasks.status, "pending"), lt(crmTasks.dueDate!, now)));
    }

    res.json({ tasks });
  } catch (err) {
    req.log.error({ err }, "Error fetching tasks");
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// ── Send email ────────────────────────────────────────────────────────────────
router.post("/crm/leads/:id/email", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { subject, body, testMode } = req.body as { subject?: string; body?: string; testMode?: boolean };
    if (!subject || !body) { res.status(400).json({ error: "Subject and body are required" }); return; }

    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    const isTestMode = testMode !== false && process.env.CRM_EMAIL_TEST_MODE !== "false";

    if (!isTestMode) {
      const resend = getResend();
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>",
        to: [lead.email],
        subject,
        html: body.replace(/\n/g, "<br>"),
      });
    }

    await db.update(crmLeads).set({ lastContactedAt: new Date(), updatedAt: new Date() }).where(eq(crmLeads.id, id));
    await logActivity(id, "email_sent", `Email sent: ${subject}`, isTestMode ? "[TEST MODE - not actually sent]" : `To: ${lead.email}`, { subject, testMode: isTestMode });

    res.json({ ok: true, testMode: isTestMode });
  } catch (err) {
    req.log.error({ err }, "Error sending email");
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ── Email Templates ───────────────────────────────────────────────────────────
router.get("/crm/email-templates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const templates = await db.select().from(crmEmailTemplates).orderBy(crmEmailTemplates.name);
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.post("/crm/email-templates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, type, subject, body } = req.body as Record<string, string>;
    if (!name || !subject || !body) { res.status(400).json({ error: "Name, subject, and body are required" }); return; }
    const [template] = await db.insert(crmEmailTemplates).values({ name, type: type || "Other", subject, body }).returning();
    res.status(201).json({ template });
  } catch (err) {
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.put("/crm/email-templates/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { name, type, subject, body } = req.body as Record<string, string>;
    const [updated] = await db.update(crmEmailTemplates)
      .set({ name, type, subject, body, updatedAt: new Date() })
      .where(eq(crmEmailTemplates.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
    res.json({ template: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/crm/email-templates/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmEmailTemplates).where(eq(crmEmailTemplates.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// ── Campaign CRUD ─────────────────────────────────────────────────────────────

router.get("/crm/campaigns", requireAdmin, async (req: Request, res: Response) => {
  try {
    const list = await db.select().from(crmCampaigns).orderBy(desc(crmCampaigns.updatedAt));
    // Attach recipient counts
    const counts = await db
      .select({ campaignId: crmCampaignRecipients.campaignId, count: sql<number>`count(*)::int` })
      .from(crmCampaignRecipients)
      .groupBy(crmCampaignRecipients.campaignId);
    const countMap = new Map(counts.map(c => [c.campaignId, c.count]));
    const campaigns = list.map(c => ({ ...c, recipientCount: countMap.get(c.id) ?? 0 }));
    res.json({ campaigns });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaigns");
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

router.post("/crm/campaigns", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, subject, body, status, type, objective, toneProfile, description, stopOnReply, autoSend } = req.body as Record<string, unknown>;
    if (!name || !subject || !body) {
      res.status(400).json({ error: "name, subject, and body are required" }); return;
    }
    const allowedStatus = ["draft","ready","archived"];
    const allowedType   = ["broadcast","nurture","drip"];
    const safeStatus = allowedStatus.includes(String(status)) ? String(status) : "draft";
    const safeType   = allowedType.includes(String(type)) ? String(type) : "broadcast";
    const [campaign] = await db.insert(crmCampaigns)
      .values({
        name: String(name), subject: String(subject), body: String(body),
        status: safeStatus, type: safeType,
        objective:   objective   !== undefined ? String(objective)   : undefined,
        toneProfile: toneProfile !== undefined ? String(toneProfile) : undefined,
        description: description !== undefined ? String(description) : undefined,
        stopOnReply: stopOnReply !== undefined ? Boolean(stopOnReply) : true,
        autoSend:    autoSend    !== undefined ? Boolean(autoSend)    : false,
      })
      .returning();
    res.status(201).json({ campaign });
  } catch (err) {
    req.log.error({ err }, "Error creating campaign");
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// ── Campaign Scheduled Message Queue (static routes — must come before /:id) ──

router.get("/crm/campaigns/queue", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, campaignId } = req.query as Record<string, string>;
    const conditions = [];
    if (status)     conditions.push(eq(crmCampaignScheduledMessages.status, status));
    if (campaignId) conditions.push(eq(crmCampaignScheduledMessages.campaignId, Number(campaignId)));
    const msgs = await db
      .select({
        id:          crmCampaignScheduledMessages.id,
        campaignId:  crmCampaignScheduledMessages.campaignId,
        recipientId: crmCampaignScheduledMessages.recipientId,
        stepId:      crmCampaignScheduledMessages.stepId,
        leadId:      crmCampaignScheduledMessages.leadId,
        channel:     crmCampaignScheduledMessages.channel,
        subject:     crmCampaignScheduledMessages.subject,
        body:        crmCampaignScheduledMessages.body,
        status:      crmCampaignScheduledMessages.status,
        scheduledAt: crmCampaignScheduledMessages.scheduledAt,
        sentAt:      crmCampaignScheduledMessages.sentAt,
        lastError:   crmCampaignScheduledMessages.lastError,
        createdAt:   crmCampaignScheduledMessages.createdAt,
        leadName:    crmLeads.name,
        leadEmail:   crmLeads.email,
        campaignName: crmCampaigns.name,
      })
      .from(crmCampaignScheduledMessages)
      .innerJoin(crmLeads,     eq(crmCampaignScheduledMessages.leadId,     crmLeads.id))
      .innerJoin(crmCampaigns, eq(crmCampaignScheduledMessages.campaignId, crmCampaigns.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(crmCampaignScheduledMessages.scheduledAt));
    res.json({ messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Error fetching scheduled message queue");
    res.status(500).json({ error: "Failed to fetch queue" });
  }
});

router.patch("/crm/campaigns/queue/:messageId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    if (isNaN(messageId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { subject, body, scheduledAt, status } = req.body as Record<string, string>;
    const updates: Record<string, unknown> = {};
    if (subject !== undefined)     updates.subject     = subject;
    if (body !== undefined)        updates.body        = body;
    if (scheduledAt !== undefined) updates.scheduledAt = new Date(scheduledAt);
    if (status !== undefined) {
      const allowed = ["scheduled","queued","canceled","skipped"];
      if (!allowed.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
      updates.status = status;
    }
    if (!Object.keys(updates).length) { res.status(400).json({ error: "No fields to update" }); return; }
    const [msg] = await db.update(crmCampaignScheduledMessages)
      .set(updates)
      .where(eq(crmCampaignScheduledMessages.id, messageId))
      .returning();
    if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
    res.json({ message: msg });
  } catch (err) {
    req.log.error({ err }, "Error updating scheduled message");
    res.status(500).json({ error: "Failed to update message" });
  }
});

router.post("/crm/campaigns/queue/:messageId/send-now", requireAdmin, async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    if (isNaN(messageId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [msg] = await db
      .select()
      .from(crmCampaignScheduledMessages)
      .where(eq(crmCampaignScheduledMessages.id, messageId));
    if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
    if (!["scheduled","queued"].includes(msg.status)) {
      res.status(400).json({ error: "Message is not in a sendable state" }); return;
    }
    if (msg.channel !== "email") {
      await db.update(crmCampaignScheduledMessages)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(crmCampaignScheduledMessages.id, messageId));
      res.json({ ok: true, note: "Non-email channel marked sent" }); return;
    }
    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, msg.leadId));
    if (!lead?.email || lead.email.includes("@imported.local")) {
      await db.update(crmCampaignScheduledMessages)
        .set({ status: "failed", lastError: "No valid email address" })
        .where(eq(crmCampaignScheduledMessages.id, messageId));
      res.status(400).json({ error: "No valid email address" }); return;
    }
    const isTestMode = process.env.CRM_EMAIL_TEST_MODE !== "false";
    let resendId: string | null = null;
    if (!isTestMode) {
      const resend = getResend();
      const { data } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>",
        to: [lead.email],
        subject: msg.subject ?? "(no subject)",
        html: (msg.body ?? "").replace(/\n/g, "<br>"),
      });
      resendId = data?.id ?? null;
    }
    await db.update(crmCampaignScheduledMessages)
      .set({ status: "sent", sentAt: new Date(), resendEmailId: resendId })
      .where(eq(crmCampaignScheduledMessages.id, messageId));
    res.json({ ok: true, testMode: isTestMode });
  } catch (err) {
    req.log.error({ err }, "Error sending scheduled message");
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.delete("/crm/campaigns/queue/:messageId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    if (isNaN(messageId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.update(crmCampaignScheduledMessages)
      .set({ status: "canceled" })
      .where(eq(crmCampaignScheduledMessages.id, messageId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error canceling scheduled message");
    res.status(500).json({ error: "Failed to cancel message" });
  }
});

// ── Campaign CRUD (parameterized routes) ──────────────────────────────────────

router.get("/crm/campaigns/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
    const recipients = await db
      .select({
        id: crmCampaignRecipients.id,
        leadId: crmCampaignRecipients.leadId,
        status: crmCampaignRecipients.status,
        discStyleUsed: crmCampaignRecipients.discStyleUsed,
        personalizedSubject: crmCampaignRecipients.personalizedSubject,
        personalizedBody: crmCampaignRecipients.personalizedBody,
        sentAt: crmCampaignRecipients.sentAt,
        leadName: crmLeads.name,
        leadEmail: crmLeads.email,
        leadCompany: crmLeads.company,
      })
      .from(crmCampaignRecipients)
      .innerJoin(crmLeads, eq(crmCampaignRecipients.leadId, crmLeads.id))
      .where(eq(crmCampaignRecipients.campaignId, id));
    res.json({ campaign, recipients });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaign");
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

router.patch("/crm/campaigns/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { name, subject, body, status, type, objective, toneProfile, description, stopOnReply, autoSend } = req.body as Record<string, unknown>;
    const allowedStatus = ["draft","ready","archived"];
    const allowedType   = ["broadcast","nurture","drip"];
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name    !== undefined) updates.name    = String(name);
    if (subject !== undefined) updates.subject = String(subject);
    if (body    !== undefined) updates.body    = String(body);
    if (status  !== undefined && allowedStatus.includes(String(status))) updates.status = String(status);
    if (type    !== undefined && allowedType.includes(String(type)))     updates.type   = String(type);
    if (objective   !== undefined) updates.objective   = objective   ? String(objective)   : null;
    if (toneProfile !== undefined) updates.toneProfile = toneProfile ? String(toneProfile) : null;
    if (description !== undefined) updates.description = description ? String(description) : null;
    if (stopOnReply !== undefined) updates.stopOnReply = Boolean(stopOnReply);
    if (autoSend    !== undefined) updates.autoSend    = Boolean(autoSend);
    const [updated] = await db.update(crmCampaigns).set(updates).where(eq(crmCampaigns.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Campaign not found" }); return; }
    res.json({ campaign: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating campaign");
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/crm/campaigns/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmCampaigns).where(eq(crmCampaigns.id, id)); // cascade deletes recipients
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting campaign");
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

// Replace all recipients for a campaign (upsert pattern)
router.post("/crm/campaigns/:id/recipients", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { recipients } = req.body as {
      recipients: Array<{
        leadId: number;
        discStyleUsed?: string;
        personalizedSubject?: string;
        personalizedBody?: string;
      }>;
    };
    if (!Array.isArray(recipients)) {
      res.status(400).json({ error: "recipients array required" }); return;
    }
    // Delete existing then re-insert
    await db.delete(crmCampaignRecipients).where(eq(crmCampaignRecipients.campaignId, id));
    if (recipients.length > 0) {
      await db.insert(crmCampaignRecipients).values(
        recipients.map(r => ({
          campaignId: id,
          leadId: r.leadId,
          status: "selected" as const,
          discStyleUsed: r.discStyleUsed ?? null,
          personalizedSubject: r.personalizedSubject ?? null,
          personalizedBody: r.personalizedBody ?? null,
        })),
      );
    }
    // Bump campaign updatedAt
    await db.update(crmCampaigns).set({ updatedAt: new Date() }).where(eq(crmCampaigns.id, id));
    res.json({ ok: true, count: recipients.length });
  } catch (err) {
    req.log.error({ err }, "Error saving campaign recipients");
    res.status(500).json({ error: "Failed to save recipients" });
  }
});

// Per-campaign test send (uses persisted campaign data)
router.post("/crm/campaigns/:id/test-send", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { to } = req.body as { to?: string };
    if (!to) { res.status(400).json({ error: "to is required" }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      res.status(400).json({ error: "Invalid test email address" }); return;
    }
    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const isTestMode = process.env.CRM_EMAIL_TEST_MODE !== "false";
    if (!isTestMode) {
      const resend = getResend();
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>",
        to: [to],
        subject: `[TEST] ${campaign.subject}`,
        html: campaign.body.replace(/\n/g, "<br>"),
      });
    }

    req.log.info({ to, campaignId: id, testMode: isTestMode }, "Campaign test email dispatched");
    res.json({ ok: true, testMode: isTestMode, to });
  } catch (err) {
    req.log.error({ err }, "Error sending campaign test email");
    res.status(500).json({ error: "Failed to send test email" });
  }
});

// ── Campaign Test Send ────────────────────────────────────────────────────────
// Sends a single test email to a manually specified address — NOT to leads.
router.post("/crm/campaigns/test-send", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { to, subject, body } = req.body as { to?: string; subject?: string; body?: string };
    if (!to || !subject || !body) {
      res.status(400).json({ error: "to, subject, and body are required" }); return;
    }
    // Basic email format guard
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      res.status(400).json({ error: "Invalid test email address" }); return;
    }

    const isTestMode = process.env.CRM_EMAIL_TEST_MODE !== "false";
    if (!isTestMode) {
      const resend = getResend();
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>",
        to: [to],
        subject: `[TEST] ${subject}`,
        html: body.replace(/\n/g, "<br>"),
      });
    }

    req.log.info({ to, testMode: isTestMode }, "Campaign test email dispatched");
    res.json({ ok: true, testMode: isTestMode, to });
  } catch (err) {
    req.log.error({ err }, "Error sending campaign test email");
    res.status(500).json({ error: "Failed to send test email" });
  }
});

// ── Campaign Analytics ────────────────────────────────────────────────────────
router.get("/crm/campaigns/:id/analytics", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    // All recipients with lead info
    const recipients = await db
      .select({
        id: crmCampaignRecipients.id,
        leadId: crmCampaignRecipients.leadId,
        status: crmCampaignRecipients.status,
        discStyleUsed: crmCampaignRecipients.discStyleUsed,
        sentAt: crmCampaignRecipients.sentAt,
        lastError: crmCampaignRecipients.lastError,
        leadName: crmLeads.name,
        leadEmail: crmLeads.email,
      })
      .from(crmCampaignRecipients)
      .innerJoin(crmLeads, eq(crmCampaignRecipients.leadId, crmLeads.id))
      .where(eq(crmCampaignRecipients.campaignId, id))
      .orderBy(desc(crmCampaignRecipients.createdAt));

    // Totals
    const total    = recipients.length;
    const sent     = recipients.filter(r => r.status === "sent").length;
    const failed   = recipients.filter(r => r.status === "failed").length;
    const skipped  = recipients.filter(r => r.status === "skipped").length;
    const selected = recipients.filter(r => r.status === "selected").length;
    const sendRate    = total > 0 ? Math.round((sent / total) * 100)   : 0;
    const failureRate = total > 0 ? Math.round((failed / total) * 100) : 0;

    // DISC breakdown
    const DISC_STYLES = ["Driver", "Expressive", "Amiable", "Analytical"];
    const discBreakdown = DISC_STYLES.map(style => {
      const group = recipients.filter(r => r.discStyleUsed === style);
      return {
        style,
        count:   group.length,
        sent:    group.filter(r => r.status === "sent").length,
        failed:  group.filter(r => r.status === "failed").length,
        skipped: group.filter(r => r.status === "skipped").length,
      };
    });

    // Reply estimate — inbound CRM messages from recipient leads after their sentAt
    const sentRecipients = recipients.filter(r => r.status === "sent" && r.sentAt);
    let replyEstimate = { count: 0, total: sentRecipients.length, rate: 0 };
    if (sentRecipients.length > 0) {
      const sentLeadIds = sentRecipients.map(r => r.leadId);
      const inboundMsgs = await db
        .select({ leadId: crmMessages.leadId, createdAt: crmMessages.createdAt })
        .from(crmMessages)
        .where(and(
          eq(crmMessages.direction, "inbound"),
          inArray(crmMessages.leadId, sentLeadIds),
        ));
      const repliedLeads = new Set<number>();
      for (const msg of inboundMsgs) {
        if (msg.leadId) {
          const rec = sentRecipients.find(r => r.leadId === msg.leadId);
          if (rec?.sentAt && new Date(msg.createdAt) > new Date(rec.sentAt)) {
            repliedLeads.add(msg.leadId);
          }
        }
      }
      const count = repliedLeads.size;
      replyEstimate = {
        count,
        total: sentRecipients.length,
        rate: sentRecipients.length > 0 ? Math.round((count / sentRecipients.length) * 100) : 0,
      };
    }

    // Event metrics from crm_campaign_events (opened, clicked, bounced, failed via webhook)
    const recipientIds = recipients.map(r => r.id);
    let eventMetrics = { hasEvents: false, opened: 0, clicked: 0, bounced: 0, deliveryFailed: 0, uniqueOpeners: 0, uniqueClickers: 0, openRate: 0, clickRate: 0, bounceRate: 0 };
    if (recipientIds.length > 0) {
      const events = await db
        .select({ eventType: crmCampaignEvents.eventType, campaignRecipientId: crmCampaignEvents.campaignRecipientId })
        .from(crmCampaignEvents)
        .where(inArray(crmCampaignEvents.campaignRecipientId, recipientIds));
      if (events.length > 0) {
        const openedEvents  = events.filter(e => e.eventType === "opened");
        const clickedEvents = events.filter(e => e.eventType === "clicked");
        const opened        = openedEvents.length;
        const clicked       = clickedEvents.length;
        const bounced       = events.filter(e => e.eventType === "bounced").length;
        const deliveryFailed = events.filter(e => e.eventType === "failed").length;
        // Unique counts — distinct recipient per event type (what rates are based on)
        const uniqueOpeners  = new Set(openedEvents.map(e => e.campaignRecipientId)).size;
        const uniqueClickers = new Set(clickedEvents.map(e => e.campaignRecipientId)).size;
        const sentCount = sent > 0 ? sent : 1; // avoid div/0
        eventMetrics = {
          hasEvents:    true,
          opened,
          clicked,
          bounced,
          deliveryFailed,
          uniqueOpeners,
          uniqueClickers,
          openRate:    Math.round((uniqueOpeners  / sentCount) * 100),
          clickRate:   Math.round((uniqueClickers / sentCount) * 100),
          bounceRate:  Math.round((bounced        / sentCount) * 100),
        };
      }
    }

    res.json({
      campaign,
      totals: { recipients: total, sent, failed, skipped, selected, sendRate, failureRate },
      discBreakdown,
      recentRecipients: recipients.map(r => ({
        leadId:       r.leadId,
        name:         r.leadName,
        email:        r.leadEmail,
        discStyleUsed: r.discStyleUsed,
        status:       r.status,
        sentAt:       r.sentAt,
        lastError:    r.lastError,
      })),
      replyEstimate,
      eventMetrics,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaign analytics");
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ── Campaign Send Execution ───────────────────────────────────────────────────
// Sends to all selected recipients one at a time, tracks status per recipient.
router.post("/crm/campaigns/:id/send", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const recipientsWithLeads = await db
      .select({
        id: crmCampaignRecipients.id,
        leadId: crmCampaignRecipients.leadId,
        status: crmCampaignRecipients.status,
        personalizedSubject: crmCampaignRecipients.personalizedSubject,
        personalizedBody: crmCampaignRecipients.personalizedBody,
        leadEmail: crmLeads.email,
        leadName: crmLeads.name,
      })
      .from(crmCampaignRecipients)
      .innerJoin(crmLeads, eq(crmCampaignRecipients.leadId, crmLeads.id))
      .where(eq(crmCampaignRecipients.campaignId, id));

    if (recipientsWithLeads.length === 0) {
      res.status(400).json({ error: "No recipients saved for this campaign" }); return;
    }

    const isTestMode = process.env.CRM_EMAIL_TEST_MODE !== "false";
    const results: Array<{ recipientId: number; leadId: number; email: string; status: string; error?: string }> = [];
    let sent = 0, failed = 0, skipped = 0;

    for (const r of recipientsWithLeads) {
      // Skip already-sent recipients
      if (r.status === "sent") {
        results.push({ recipientId: r.id, leadId: r.leadId, email: r.leadEmail ?? "", status: "skipped", error: "Already sent" });
        skipped++;
        continue;
      }
      // Skip recipients with no valid email
      if (!r.leadEmail || r.leadEmail.includes("@imported.local")) {
        await db.update(crmCampaignRecipients)
          .set({ status: "skipped", lastError: "No valid email address" })
          .where(eq(crmCampaignRecipients.id, r.id));
        results.push({ recipientId: r.id, leadId: r.leadId, email: r.leadEmail ?? "", status: "skipped", error: "No valid email address" });
        skipped++;
        continue;
      }

      const subject = r.personalizedSubject ?? campaign.subject;
      const body    = r.personalizedBody   ?? campaign.body;

      let resendEmailId: string | null = null;
      try {
        if (!isTestMode) {
          const resend = getResend();
          const { data } = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>",
            to: [r.leadEmail],
            subject,
            html: body.replace(/\n/g, "<br>"),
          });
          // 200 ms rate-limit guard between live sends
          await new Promise(resolve => setTimeout(resolve, 200));
          resendEmailId = data?.id ?? null;
        }
        await db.update(crmCampaignRecipients)
          .set({ status: "sent", sentAt: new Date(), lastError: null, resendEmailId })
          .where(eq(crmCampaignRecipients.id, r.id));
        results.push({ recipientId: r.id, leadId: r.leadId, email: r.leadEmail, status: "sent" });
        sent++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown send error";
        await db.update(crmCampaignRecipients)
          .set({ status: "failed", lastError: errMsg })
          .where(eq(crmCampaignRecipients.id, r.id));
        results.push({ recipientId: r.id, leadId: r.leadId, email: r.leadEmail, status: "failed", error: errMsg });
        failed++;
      }
    }

    // Mark campaign as archived if fully sent
    if (failed === 0 && sent > 0) {
      await db.update(crmCampaigns).set({ status: "archived", updatedAt: new Date() }).where(eq(crmCampaigns.id, id));
    }

    req.log.info({ campaignId: id, sent, failed, skipped, testMode: isTestMode }, "Campaign send complete");
    res.json({ sent, failed, skipped, results, testMode: isTestMode });
  } catch (err) {
    req.log.error({ err }, "Error executing campaign send");
    res.status(500).json({ error: "Failed to send campaign" });
  }
});

// Resend to a single failed or skipped recipient
router.post("/crm/campaigns/:id/recipients/:recipientId/resend", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id          = Number(req.params.id);
    const recipientId = Number(req.params.recipientId);
    if (isNaN(id) || isNaN(recipientId)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const [r] = await db
      .select({
        id: crmCampaignRecipients.id,
        leadId: crmCampaignRecipients.leadId,
        personalizedSubject: crmCampaignRecipients.personalizedSubject,
        personalizedBody: crmCampaignRecipients.personalizedBody,
        leadEmail: crmLeads.email,
      })
      .from(crmCampaignRecipients)
      .innerJoin(crmLeads, eq(crmCampaignRecipients.leadId, crmLeads.id))
      .where(and(
        eq(crmCampaignRecipients.id, recipientId),
        eq(crmCampaignRecipients.campaignId, id),
      ));

    if (!r) { res.status(404).json({ error: "Recipient not found" }); return; }
    if (!r.leadEmail || r.leadEmail.includes("@imported.local")) {
      res.status(400).json({ error: "No valid email address for this recipient" }); return;
    }

    const subject = r.personalizedSubject ?? campaign.subject;
    const body    = r.personalizedBody   ?? campaign.body;
    const isTestMode = process.env.CRM_EMAIL_TEST_MODE !== "false";

    let resendEmailIdSingle: string | null = null;
    try {
      if (!isTestMode) {
        const resend = getResend();
        const { data } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>",
          to: [r.leadEmail],
          subject,
          html: body.replace(/\n/g, "<br>"),
        });
        resendEmailIdSingle = data?.id ?? null;
      }
      await db.update(crmCampaignRecipients)
        .set({ status: "sent", sentAt: new Date(), lastError: null, resendEmailId: resendEmailIdSingle })
        .where(eq(crmCampaignRecipients.id, recipientId));
      req.log.info({ campaignId: id, recipientId, testMode: isTestMode }, "Recipient resent");
      res.json({ ok: true, status: "sent", testMode: isTestMode, email: r.leadEmail });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Unknown send error";
      await db.update(crmCampaignRecipients)
        .set({ status: "failed", lastError: errMsg })
        .where(eq(crmCampaignRecipients.id, recipientId));
      res.status(500).json({ ok: false, status: "failed", error: errMsg });
    }
  } catch (err) {
    req.log.error({ err }, "Error resending to recipient");
    res.status(500).json({ error: "Failed to resend" });
  }
});

// ── Resend Webhook ────────────────────────────────────────────────────────────
// Public endpoint — no admin auth. Signature verified via svix (RESEND_WEBHOOK_SECRET).
router.post("/crm/webhooks/resend", async (req: Request, res: Response) => {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      req.log.warn("RESEND_WEBHOOK_SECRET not set — webhook endpoint disabled");
      res.status(500).json({ error: "Webhook not configured — RESEND_WEBHOOK_SECRET is missing" });
      return;
    }

    // req.body is a Buffer thanks to express.raw() mounted in app.ts for this path
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);

    // Verify Resend webhook signature using svix
    let payload: Record<string, unknown>;
    try {
      const { Webhook } = await import("svix");
      const wh = new Webhook(secret);
      payload = wh.verify(rawBody, {
        "svix-id":        req.headers["svix-id"] as string,
        "svix-timestamp": req.headers["svix-timestamp"] as string,
        "svix-signature": req.headers["svix-signature"] as string,
      }) as Record<string, unknown>;
    } catch (verifyErr) {
      req.log.warn({ err: verifyErr }, "Resend webhook signature verification failed");
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    // Map Resend event type → internal event_type
    const RESEND_EVENT_MAP: Record<string, string> = {
      "email.opened":          "opened",
      "email.clicked":         "clicked",
      "email.bounced":         "bounced",
      "email.delivery_failed": "failed",
    };
    const resendEventType = (payload.type as string) ?? "";
    const eventType = RESEND_EVENT_MAP[resendEventType];
    if (!eventType) {
      // Unknown event type — ack but ignore
      res.json({ ok: true, ignored: true, reason: "unknown_event_type" });
      return;
    }

    // Extract Resend email id from payload data
    const data = (payload.data as Record<string, unknown>) ?? {};
    const resendEmailId = (data.email_id as string) ?? null;
    if (!resendEmailId) {
      res.json({ ok: true, ignored: true, reason: "no_email_id" });
      return;
    }

    // Find matching recipient
    const [recipient] = await db
      .select({ id: crmCampaignRecipients.id, campaignId: crmCampaignRecipients.campaignId })
      .from(crmCampaignRecipients)
      .where(eq(crmCampaignRecipients.resendEmailId, resendEmailId))
      .limit(1);

    if (!recipient) {
      res.json({ ok: true, ignored: true, reason: "no_matching_recipient" });
      return;
    }

    // Determine occurred_at from payload if available
    const occurredAt = data.created_at ? new Date(data.created_at as string) : new Date();

    // Application-level dedup for opened/clicked — Resend retries can send duplicates
    const errorReason = (data.reason as string) ?? (data.error as string) ?? null;
    if (eventType === "opened" || eventType === "clicked") {
      const [existing] = await db
        .select({ id: crmCampaignEvents.id })
        .from(crmCampaignEvents)
        .where(and(
          eq(crmCampaignEvents.campaignRecipientId, recipient.id),
          eq(crmCampaignEvents.eventType, eventType),
        ))
        .limit(1);
      if (existing) {
        req.log.info({ recipientId: recipient.id, eventType }, "Duplicate webhook event skipped");
        res.json({ ok: true, eventType, recipientId: recipient.id, deduplicated: true });
        return;
      }
    }

    await db.insert(crmCampaignEvents).values({
      campaignRecipientId: recipient.id,
      eventType,
      occurredAt,
      metadata: { resendEventType, resendEmailId, raw: data },
    });

    // For bounce / failure: update recipient status
    if (eventType === "bounced" || eventType === "failed") {
      await db.update(crmCampaignRecipients)
        .set({ status: "failed", lastError: errorReason ?? `${resendEventType} via webhook` })
        .where(eq(crmCampaignRecipients.id, recipient.id));
    }

    req.log.info({ recipientId: recipient.id, eventType, resendEmailId }, "Resend webhook event recorded");
    res.json({ ok: true, eventType, recipientId: recipient.id });
  } catch (err) {
    req.log.error({ err }, "Error processing Resend webhook");
    res.status(500).json({ error: "Internal error processing webhook" });
  }
});

// ── CSV Import ────────────────────────────────────────────────────────────────
router.post("/crm/import", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "No rows provided" }); return; }

    const VALID_STS = new Set(["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"]);
    const VALID_PRI = new Set(["Low","Medium","High"]);
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normSt = (s?: string) => { const c = s?.trim(); if (!c) return "New"; if (VALID_STS.has(c)) return c; const l = c.toLowerCase(); return [...VALID_STS].find(x => x.toLowerCase() === l) ?? "New"; };
    const normPr = (p?: string) => { const c = p?.trim(); if (!c) return "Medium"; if (VALID_PRI.has(c)) return c; const l = c.toLowerCase(); return [...VALID_PRI].find(x => x.toLowerCase() === l) ?? "Medium"; };

    let created = 0, skippedDuplicates = 0, invalid = 0;
    const errors: { rowIndex: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row.name || row.Name || "").trim();
      const email = (row.email || row.Email || "").trim().toLowerCase();
      const phone = (row.phone || row.Phone || "").trim();

      if (!name) { invalid++; errors.push({ rowIndex: i, message: "Name is required" }); continue; }
      if (email && !EMAIL_RE.test(email)) { invalid++; errors.push({ rowIndex: i, message: `Invalid email: ${email}` }); continue; }

      if (email) {
        const [existing] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.email, email)).limit(1);
        if (existing) { skippedDuplicates++; continue; }
      }

      const finalEmail = email || (phone ? `${phone.replace(/\D/g, "")}@imported.local` : `import-${i}-${Date.now()}@imported.local`);
      const rawEv = (row.estimatedValue || row.estimated_value || row["Estimated Value"] || "").replace(/[^0-9.]/g, "");
      const estimatedValue = rawEv && !isNaN(parseFloat(rawEv)) ? String(parseFloat(rawEv)) : null;
      const rawTags = (row.tags || row.Tags || "").trim();
      const tags = rawTags ? rawTags.split(",").map((t: string) => t.trim()).filter(Boolean) : [];

      try {
        const [lead] = await db.insert(crmLeads).values({
          name,
          email: finalEmail,
          company: (row.company || row.Company || "").trim() || undefined,
          phone: phone || undefined,
          website: (row.website || row.Website || "").trim() || undefined,
          source: "CSV Import",
          serviceInterest: (row.serviceInterest || row.service_interest || row["Service Interest"] || "").trim() || undefined,
          status: normSt(row.status || row.Status),
          priority: normPr(row.priority || row.Priority),
          assignedTo: (row.assignedTo || row.assigned_to || row["Assigned To"] || "").trim() || undefined,
          notes: (row.notes || row.Notes || "").trim() || undefined,
          tags,
          estimatedValue,
        }).returning();
        await logActivity(lead.id, "lead_imported", `Imported from CSV: ${lead.name}`, "Lead imported through CRM Import page.");
        created++;
      } catch (e) {
        invalid++;
        errors.push({ rowIndex: i, message: `Insert failed: ${String(e).slice(0, 80)}` });
      }
    }

    res.json({ created, skippedDuplicates, invalid, errors: errors.slice(0, 20) });
  } catch (err) {
    req.log.error({ err }, "Error importing CSV");
    res.status(500).json({ error: "Failed to import" });
  }
});

// ── Import from discovery submissions ─────────────────────────────────────────
router.post("/crm/import-discovery", requireAdmin, async (req: Request, res: Response) => {
  try {
    const submissions = await db.select().from(discoverySubmissions);
    let imported = 0, skipped = 0;

    for (const sub of submissions) {
      const [existing] = await db.select({ id: crmLeads.id }).from(crmLeads)
        .where(or(eq(crmLeads.email, sub.email), eq(crmLeads.discoverySubmissionId, sub.id))).limit(1);
      if (existing) { skipped++; continue; }

      const score = sub.leadScore ?? 1;
      const priority = score >= 8 ? "High" : score >= 5 ? "Medium" : "Low";

      const [lead] = await db.insert(crmLeads).values({
        name: sub.contactName,
        email: sub.email,
        company: sub.companyName,
        phone: sub.phone ?? undefined,
        source: "Discovery Form",
        serviceInterest: sub.serviceInterest ?? undefined,
        status: sub.status === "New" ? "New" : sub.status,
        priority,
        tags: sub.tags,
        notes: sub.internalNotes ?? undefined,
        packageType: sub.recommendedPackage ?? undefined,
        discoverySubmissionId: sub.id,
        discoveryFormStatus: "Completed",
      }).returning();

      await logActivity(lead.id, "lead_imported", `Imported from discovery form`, `Original submission ID: ${sub.id}`);
      imported++;
    }

    res.json({ imported, skipped });
  } catch (err) {
    req.log.error({ err }, "Error importing discovery submissions");
    res.status(500).json({ error: "Failed to import" });
  }
});

// ── Single submission import ───────────────────────────────────────────────────
router.post("/crm/import-discovery/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const subId = Number(req.params.id);
    if (!subId) { res.status(400).json({ error: "Invalid submission id" }); return; }

    const [sub] = await db.select().from(discoverySubmissions)
      .where(eq(discoverySubmissions.id, subId)).limit(1);
    if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }

    // Check for existing lead by discoverySubmissionId OR email
    const [existing] = await db.select({ id: crmLeads.id })
      .from(crmLeads)
      .where(or(eq(crmLeads.discoverySubmissionId, subId), eq(crmLeads.email, sub.email)))
      .limit(1);

    if (existing) {
      res.json({
        imported: false,
        existing: true,
        leadId: existing.id,
        message: "Submission is already connected to a CRM lead.",
      });
      return;
    }

    const score = sub.leadScore ?? 1;
    const priority = score >= 8 ? "High" : score >= 5 ? "Medium" : "Low";

    const [lead] = await db.insert(crmLeads).values({
      name: sub.contactName,
      email: sub.email,
      company: sub.companyName,
      phone: sub.phone ?? undefined,
      source: "Discovery Form",
      serviceInterest: sub.serviceInterest ?? undefined,
      status: "New",
      priority,
      tags: sub.tags,
      notes: sub.internalNotes ?? undefined,
      packageType: sub.recommendedPackage ?? undefined,
      discoverySubmissionId: sub.id,
      discoveryFormStatus: "Completed",
    }).returning();

    await logActivity(
      lead.id,
      "lead_imported",
      "Imported from Discovery Portal",
      `${sub.companyName} — ${sub.contactName}${sub.serviceInterest ? ` · ${sub.serviceInterest}` : ""}`,
    );

    res.json({
      imported: true,
      existing: false,
      leadId: lead.id,
      message: `${sub.contactName} from ${sub.companyName} added to CRM.`,
    });
  } catch (err) {
    req.log.error({ err }, "Error importing single discovery submission");
    res.status(500).json({ error: "Failed to import submission" });
  }
});

// ── Deals ─────────────────────────────────────────────────────────────────────
router.get("/crm/deals/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const deals = await db.select().from(crmDeals);
    const wonDeals = deals.filter(d => d.stage === "Won");
    const lostDeals = deals.filter(d => d.stage === "Lost");
    const openDeals = deals.filter(d => !["Won", "Lost"].includes(d.stage));
    const totalRevenue = wonDeals.reduce((s, d) => s + Number(d.value), 0);
    const winRate = (wonDeals.length + lostDeals.length) > 0
      ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
      : 0;

    const stageOrder = ["Lead", "Qualified", "Proposal", "Won", "Lost"];
    const pipeline = stageOrder.map(stage => {
      const stageDeals = deals.filter(d => d.stage === stage);
      const total = stageDeals.reduce((s, d) => s + Number(d.value), 0);
      return { stage, count: stageDeals.length, total };
    });

    const monthlyMap = new Map<string, number>();
    wonDeals.forEach(d => {
      const m = new Date(d.createdAt).toISOString().substring(0, 7);
      monthlyMap.set(m, (monthlyMap.get(m) || 0) + Number(d.value));
    });
    const now = new Date();
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = d.toISOString().substring(0, 7);
      return { month: d.toLocaleString("en-US", { month: "short" }), revenue: monthlyMap.get(key) || 0 };
    });

    const activeLeads = await db.select({ count: sql<number>`count(*)` }).from(crmLeads)
      .where(sql`status NOT IN ('Won', 'Lost')`).then(r => Number(r[0].count));

    res.json({
      totalRevenue, winRate, activeLeads,
      openDeals: openDeals.length, wonDeals: wonDeals.length, lostDeals: lostDeals.length,
      pipeline, monthly,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching deals stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/crm/deals", requireAdmin, async (req: Request, res: Response) => {
  try {
    const deals = await db.select().from(crmDeals).orderBy(desc(crmDeals.createdAt));
    const leadsMap = new Map<number, string>();
    const leads = await db.select({ id: crmLeads.id, name: crmLeads.name }).from(crmLeads);
    leads.forEach(l => leadsMap.set(l.id, l.name));
    const enriched = deals.map(d => ({
      ...d,
      leadName: d.leadId ? leadsMap.get(d.leadId) ?? null : null,
    }));
    res.json({ deals: enriched });
  } catch (err) {
    req.log.error({ err }, "Error fetching deals");
    res.status(500).json({ error: "Failed to fetch deals" });
  }
});

router.post("/crm/deals", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, value, stage, closeDate, notes, leadId } = req.body as Record<string, string | number>;
    if (!name) { res.status(400).json({ error: "Name is required" }); return; }
    const [deal] = await db.insert(crmDeals).values({
      name: String(name),
      value: value ? String(value) : "0",
      stage: String(stage || "Lead"),
      closeDate: closeDate ? String(closeDate) : null,
      notes: notes ? String(notes) : null,
      leadId: leadId ? Number(leadId) : null,
    }).returning();
    res.json({ deal });
  } catch (err) {
    req.log.error({ err }, "Error creating deal");
    res.status(500).json({ error: "Failed to create deal" });
  }
});

router.patch("/crm/deals/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, value, stage, closeDate, notes, leadId } = req.body as Record<string, string | number | null>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (value !== undefined) updates.value = String(value);
    if (stage !== undefined) updates.stage = stage;
    if (closeDate !== undefined) updates.closeDate = closeDate || null;
    if (notes !== undefined) updates.notes = notes;
    if (leadId !== undefined) updates.leadId = leadId ? Number(leadId) : null;
    const [deal] = await db.update(crmDeals).set(updates).where(eq(crmDeals.id, id)).returning();
    if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }
    res.json({ deal });
  } catch (err) {
    req.log.error({ err }, "Error updating deal");
    res.status(500).json({ error: "Failed to update deal" });
  }
});

router.delete("/crm/deals/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.delete(crmDeals).where(eq(crmDeals.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting deal");
    res.status(500).json({ error: "Failed to delete deal" });
  }
});

// ── Pipeline (same as leads but grouped by status) ────────────────────────────
router.get("/crm/pipeline", requireAdmin, async (req: Request, res: Response) => {
  try {
    const leads = await db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt));
    const stages = ["New", "Contacted", "Follow-up", "Proposal Sent", "Negotiating", "Won", "Lost", "Nurture"];
    const pipeline = Object.fromEntries(stages.map(s => [s, leads.filter(l => l.status === s)]));
    res.json({ pipeline });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pipeline" });
  }
});

// ── Sales Workspace: helpers ───────────────────────────────────────────────────

function crmLeadToSubmission(lead: CrmLead): DiscoverySubmission {
  const VALID_SERVICES = [
    "new-website", "redesign", "web-app", "crm", "seo",
    "blog", "maintenance", "automation", "consultation",
  ];
  const serviceKey = (lead.serviceInterest || "new-website")
    .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "");
  const services = VALID_SERVICES.includes(serviceKey) ? [serviceKey] : ["new-website"];

  return {
    id: 0,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    contactName: lead.name,
    companyName: lead.company || lead.name,
    email: lead.email,
    phone: lead.phone ?? null,
    industry: null,
    serviceInterest: lead.serviceInterest ?? null,
    budget: "5k-10k",
    timeline: "flexible",
    decisionMaker: "just-me",
    leadScore: 5,
    tags: lead.tags,
    status: "CRM Lead",
    recommendedPackage: lead.packageType ?? null,
    formData: {
      services,
      budget: "5k-10k",
      timeline: "flexible",
      decisionMaker: "just-me",
      projectGoals: ["grow-online-presence", "generate-leads"],
      marketingFeatures: [],
      salesFeatures: [],
      membershipFeatures: [],
      automationFeatures: [],
      otherFeatures: [],
      integrations: [],
      specificRequirements: lead.notes || "",
    },
    generatedProposal: null,
    generatedSow: null,
    internalNotes: lead.notes ?? null,
  } as unknown as DiscoverySubmission;
}

// ── Sales Workspace: Proposal ─────────────────────────────────────────────────

router.post("/crm/leads/:id/proposal/generate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    let html: string;
    if (lead.discoverySubmissionId) {
      const [sub] = await db.select().from(discoverySubmissions).where(eq(discoverySubmissions.id, lead.discoverySubmissionId));
      html = sub ? generateProposal(sub) : generateProposal(crmLeadToSubmission(lead));
    } else {
      html = generateProposal(crmLeadToSubmission(lead));
    }

    const newStatus = lead.proposalStatus === "Not Started" ? "Draft" : lead.proposalStatus;
    await db.update(crmLeads).set({ generatedProposal: html, proposalStatus: newStatus, updatedAt: new Date() }).where(eq(crmLeads.id, id));
    await logActivity(id, "proposal_generated", "Proposal generated", lead.discoverySubmissionId ? "Generated from discovery submission" : "Generated from CRM lead data");
    req.log.info({ id }, "Proposal generated for CRM lead");
    res.json({ proposal: html });
  } catch (err) {
    req.log.error({ err }, "Error generating proposal");
    res.status(500).json({ error: "Failed to generate proposal" });
  }
});

router.patch("/crm/leads/:id/proposal", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { html, status } = req.body as { html?: string; status?: string };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (html !== undefined) updates.generatedProposal = html;
    if (status !== undefined) updates.proposalStatus = status;
    await db.update(crmLeads).set(updates).where(eq(crmLeads.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error saving proposal");
    res.status(500).json({ error: "Failed to save proposal" });
  }
});

// ── Sales Workspace: Scope of Work ────────────────────────────────────────────

router.post("/crm/leads/:id/sow/generate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    let html: string;
    if (lead.discoverySubmissionId) {
      const [sub] = await db.select().from(discoverySubmissions).where(eq(discoverySubmissions.id, lead.discoverySubmissionId));
      html = sub ? generateSOW(sub) : generateSOW(crmLeadToSubmission(lead));
    } else {
      html = generateSOW(crmLeadToSubmission(lead));
    }

    const newStatus = lead.sowStatus === "Not Started" ? "Draft" : lead.sowStatus;
    await db.update(crmLeads).set({ generatedSow: html, sowStatus: newStatus, updatedAt: new Date() }).where(eq(crmLeads.id, id));
    await logActivity(id, "sow_generated", "Scope of Work generated", lead.discoverySubmissionId ? "Generated from discovery submission" : "Generated from CRM lead data");
    req.log.info({ id }, "SOW generated for CRM lead");
    res.json({ sow: html });
  } catch (err) {
    req.log.error({ err }, "Error generating SOW");
    res.status(500).json({ error: "Failed to generate SOW" });
  }
});

router.patch("/crm/leads/:id/sow", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { html, status } = req.body as { html?: string; status?: string };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (html !== undefined) updates.generatedSow = html;
    if (status !== undefined) updates.sowStatus = status;
    await db.update(crmLeads).set(updates).where(eq(crmLeads.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error saving SOW");
    res.status(500).json({ error: "Failed to save SOW" });
  }
});

// ── Behavioral Intelligence — Phase 24A ───────────────────────────────────────

// GET /crm/leads/:id/behavioral-events
// Returns all behavioral events for a lead, newest first.
router.get("/crm/leads/:id/behavioral-events", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    const events = await db
      .select()
      .from(crmBehavioralEvents)
      .where(eq(crmBehavioralEvents.leadId, id))
      .orderBy(desc(crmBehavioralEvents.occurredAt));
    res.json({ events });
  } catch (err) {
    req.log.error({ err }, "Error fetching behavioral events");
    res.status(500).json({ error: "Failed to fetch behavioral events" });
  }
});

// POST /crm/leads/:id/behavioral-events
// Records a new behavioral event for a lead.
// Body: { eventType, label?, dClientIntent?, dUrgency?, dTrust?,
//         dProjectReadiness?, dBudgetConfidence?, dCommunicationScore?,
//         dReferralProbability?, metadata?, occurredAt? }
router.post("/crm/leads/:id/behavioral-events", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    const {
      eventType, label, occurredAt,
      dClientIntent, dUrgency, dTrust,
      dProjectReadiness, dBudgetConfidence,
      dCommunicationScore, dReferralProbability,
      metadata,
    } = req.body as Partial<InsertCrmBehavioralEvent> & { occurredAt?: string };

    if (!eventType) { res.status(400).json({ error: "eventType is required" }); return; }

    const row: InsertCrmBehavioralEvent = {
      leadId: id,
      eventType,
      ...(label              !== undefined && { label }),
      ...(occurredAt         !== undefined && { occurredAt: new Date(occurredAt) }),
      ...(dClientIntent      !== undefined && { dClientIntent }),
      ...(dUrgency           !== undefined && { dUrgency }),
      ...(dTrust             !== undefined && { dTrust }),
      ...(dProjectReadiness  !== undefined && { dProjectReadiness }),
      ...(dBudgetConfidence  !== undefined && { dBudgetConfidence }),
      ...(dCommunicationScore!== undefined && { dCommunicationScore }),
      ...(dReferralProbability!==undefined && { dReferralProbability }),
      ...(metadata           !== undefined && { metadata }),
    };

    const [inserted] = await db.insert(crmBehavioralEvents).values(row).returning();
    req.log.info({ leadId: id, eventType }, "Behavioral event recorded");
    res.status(201).json({ event: inserted });
  } catch (err) {
    req.log.error({ err }, "Error recording behavioral event");
    res.status(500).json({ error: "Failed to record behavioral event" });
  }
});

// DELETE /crm/leads/:id/behavioral-events/:eventId
// Removes a single behavioral event (manual correction).
router.delete("/crm/leads/:id/behavioral-events/:eventId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const leadId  = Number(req.params.id);
    const eventId = Number(req.params.eventId);
    if (isNaN(leadId) || isNaN(eventId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db
      .delete(crmBehavioralEvents)
      .where(and(eq(crmBehavioralEvents.id, eventId), eq(crmBehavioralEvents.leadId, leadId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting behavioral event");
    res.status(500).json({ error: "Failed to delete behavioral event" });
  }
});

// ── Campaign Steps CRUD ───────────────────────────────────────────────────────

router.get("/crm/campaigns/:id/steps", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const steps = await db
      .select()
      .from(crmCampaignSteps)
      .where(eq(crmCampaignSteps.campaignId, id))
      .orderBy(crmCampaignSteps.stepNumber);
    res.json({ steps });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaign steps");
    res.status(500).json({ error: "Failed to fetch steps" });
  }
});

router.post("/crm/campaigns/:id/steps", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const { stepNumber, dayOffset, channel, subject, body, callPrompt, taskDescription, sendTime, businessDaysOnly } = req.body as Record<string, unknown>;
    const allowedChannels  = ["email","sms","call_prompt","task"];
    const allowedSendTimes = ["immediate","morning","afternoon","evening"];
    if (!channel || !allowedChannels.includes(String(channel))) {
      res.status(400).json({ error: "channel must be one of: email, sms, call_prompt, task" }); return;
    }

    const [step] = await db.insert(crmCampaignSteps).values({
      campaignId:      id,
      stepNumber:      stepNumber      !== undefined ? Number(stepNumber) : 1,
      dayOffset:       dayOffset       !== undefined ? Number(dayOffset)  : 0,
      channel:         String(channel),
      subject:         subject         ? String(subject)         : null,
      body:            body            ? String(body)            : null,
      callPrompt:      callPrompt      ? String(callPrompt)      : null,
      taskDescription: taskDescription ? String(taskDescription) : null,
      sendTime:        sendTime && allowedSendTimes.includes(String(sendTime)) ? String(sendTime) : "immediate",
      businessDaysOnly: businessDaysOnly !== undefined ? Boolean(businessDaysOnly) : true,
    }).returning();
    res.status(201).json({ step });
  } catch (err) {
    req.log.error({ err }, "Error creating campaign step");
    res.status(500).json({ error: "Failed to create step" });
  }
});

router.patch("/crm/campaigns/:id/steps/:stepId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id     = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    if (isNaN(id) || isNaN(stepId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { stepNumber, dayOffset, channel, subject, body, callPrompt, taskDescription, sendTime, businessDaysOnly } = req.body as Record<string, unknown>;
    const allowedChannels  = ["email","sms","call_prompt","task"];
    const allowedSendTimes = ["immediate","morning","afternoon","evening"];
    const updates: Record<string, unknown> = {};
    if (stepNumber      !== undefined) updates.stepNumber      = Number(stepNumber);
    if (dayOffset       !== undefined) updates.dayOffset       = Number(dayOffset);
    if (channel         !== undefined && allowedChannels.includes(String(channel)))   updates.channel  = String(channel);
    if (sendTime        !== undefined && allowedSendTimes.includes(String(sendTime))) updates.sendTime = String(sendTime);
    if (subject         !== undefined) updates.subject         = subject         ? String(subject)         : null;
    if (body            !== undefined) updates.body            = body            ? String(body)            : null;
    if (callPrompt      !== undefined) updates.callPrompt      = callPrompt      ? String(callPrompt)      : null;
    if (taskDescription !== undefined) updates.taskDescription = taskDescription ? String(taskDescription) : null;
    if (businessDaysOnly !== undefined) updates.businessDaysOnly = Boolean(businessDaysOnly);
    if (!Object.keys(updates).length) { res.status(400).json({ error: "No fields to update" }); return; }
    const [step] = await db.update(crmCampaignSteps)
      .set(updates)
      .where(and(eq(crmCampaignSteps.id, stepId), eq(crmCampaignSteps.campaignId, id)))
      .returning();
    if (!step) { res.status(404).json({ error: "Step not found" }); return; }
    res.json({ step });
  } catch (err) {
    req.log.error({ err }, "Error updating campaign step");
    res.status(500).json({ error: "Failed to update step" });
  }
});

router.delete("/crm/campaigns/:id/steps/:stepId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id     = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    if (isNaN(id) || isNaN(stepId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmCampaignSteps)
      .where(and(eq(crmCampaignSteps.id, stepId), eq(crmCampaignSteps.campaignId, id)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting campaign step");
    res.status(500).json({ error: "Failed to delete step" });
  }
});

// ── Campaign Sequence Enrollment ──────────────────────────────────────────────

router.post("/crm/campaigns/:id/enroll", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const steps = await db
      .select()
      .from(crmCampaignSteps)
      .where(eq(crmCampaignSteps.campaignId, id))
      .orderBy(crmCampaignSteps.stepNumber);
    if (!steps.length) {
      res.status(400).json({ error: "Campaign has no steps. Add steps before enrolling contacts." }); return;
    }

    const { leadIds } = req.body as { leadIds: number[] };
    if (!Array.isArray(leadIds) || !leadIds.length) {
      res.status(400).json({ error: "leadIds array is required" }); return;
    }

    const leads = await db.select().from(crmLeads).where(inArray(crmLeads.id, leadIds));
    const enrolledAt = new Date();
    let enrolledCount = 0;
    const scheduledMessages: { recipientId: number; stepId: number; leadId: number; subject: string | null; body: string | null; channel: string; scheduledAt: Date; campaignId: number }[] = [];

    for (const lead of leads) {
      // Upsert enrollment — update status if already enrolled
      const [existing] = await db
        .select()
        .from(crmCampaignRecipients)
        .where(and(eq(crmCampaignRecipients.campaignId, id), eq(crmCampaignRecipients.leadId, lead.id)));

      let recipientId: number;
      if (existing) {
        await db.update(crmCampaignRecipients)
          .set({ enrollmentStatus: "active", currentStep: 0, enrolledAt })
          .where(eq(crmCampaignRecipients.id, existing.id));
        recipientId = existing.id;
      } else {
        const [rec] = await db.insert(crmCampaignRecipients)
          .values({ campaignId: id, leadId: lead.id, status: "selected", enrollmentStatus: "active", enrolledAt, currentStep: 0 })
          .returning();
        recipientId = rec.id;
        enrolledCount++;
      }

      // Schedule one message per step
      for (const step of steps) {
        const scheduledAt = new Date(enrolledAt);
        scheduledAt.setDate(scheduledAt.getDate() + step.dayOffset);
        scheduledMessages.push({
          campaignId: id,
          recipientId,
          stepId: step.id,
          leadId: lead.id,
          channel: step.channel,
          subject: step.subject,
          body: step.body,
          scheduledAt,
        });
      }
    }

    if (scheduledMessages.length) {
      await db.insert(crmCampaignScheduledMessages).values(
        scheduledMessages.map(m => ({ ...m, status: "scheduled" }))
      );
    }

    res.json({ ok: true, enrolled: enrolledCount, scheduled: scheduledMessages.length });
  } catch (err) {
    req.log.error({ err }, "Error enrolling leads in campaign");
    res.status(500).json({ error: "Failed to enroll leads" });
  }
});

// ── Campaign Recipient Enrollment Status ──────────────────────────────────────

router.patch("/crm/campaigns/:id/recipients/:rid/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id  = Number(req.params.id);
    const rid = Number(req.params.rid);
    if (isNaN(id) || isNaN(rid)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { enrollmentStatus } = req.body as { enrollmentStatus: string };
    const allowed = ["active","paused","completed","stopped"];
    if (!allowed.includes(enrollmentStatus)) {
      res.status(400).json({ error: "enrollmentStatus must be one of: active, paused, completed, stopped" }); return;
    }
    const [updated] = await db.update(crmCampaignRecipients)
      .set({ enrollmentStatus })
      .where(and(eq(crmCampaignRecipients.id, rid), eq(crmCampaignRecipients.campaignId, id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Recipient not found" }); return; }

    // Cancel pending scheduled messages if stopped or paused
    if (enrollmentStatus === "stopped" || enrollmentStatus === "paused") {
      await db.update(crmCampaignScheduledMessages)
        .set({ status: enrollmentStatus === "stopped" ? "canceled" : "scheduled" })
        .where(and(
          eq(crmCampaignScheduledMessages.recipientId, rid),
          eq(crmCampaignScheduledMessages.status, "scheduled"),
        ));
    }
    res.json({ ok: true, recipient: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating recipient enrollment status");
    res.status(500).json({ error: "Failed to update enrollment status" });
  }
});

// ── Campaign Activity Feed ────────────────────────────────────────────────────

router.get("/crm/campaigns/:id/activity", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const messages = await db
      .select({
        id:          crmCampaignScheduledMessages.id,
        channel:     crmCampaignScheduledMessages.channel,
        subject:     crmCampaignScheduledMessages.subject,
        status:      crmCampaignScheduledMessages.status,
        scheduledAt: crmCampaignScheduledMessages.scheduledAt,
        sentAt:      crmCampaignScheduledMessages.sentAt,
        lastError:   crmCampaignScheduledMessages.lastError,
        stepId:      crmCampaignScheduledMessages.stepId,
        leadId:      crmCampaignScheduledMessages.leadId,
        leadName:    crmLeads.name,
        leadEmail:   crmLeads.email,
      })
      .from(crmCampaignScheduledMessages)
      .innerJoin(crmLeads, eq(crmCampaignScheduledMessages.leadId, crmLeads.id))
      .where(eq(crmCampaignScheduledMessages.campaignId, id))
      .orderBy(desc(crmCampaignScheduledMessages.scheduledAt));

    const events = await db
      .select()
      .from(crmCampaignEvents)
      .where(
        inArray(
          crmCampaignEvents.campaignRecipientId,
          db.select({ id: crmCampaignRecipients.id })
            .from(crmCampaignRecipients)
            .where(eq(crmCampaignRecipients.campaignId, id))
        )
      )
      .orderBy(desc(crmCampaignEvents.occurredAt));

    res.json({ messages, events });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaign activity");
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

export default router;
