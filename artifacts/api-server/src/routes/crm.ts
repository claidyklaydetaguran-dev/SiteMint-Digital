import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, crmLeads, crmActivities, crmTasks, crmEmailTemplates, discoverySubmissions, crmDeals, crmCampaigns, crmCampaignRecipients, crmMessages } from "@workspace/db";
import type { CrmLead, DiscoverySubmission } from "@workspace/db";
import { eq, desc, and, gte, lte, lt, or, ilike, sql, inArray } from "drizzle-orm";
import { validateToken } from "../lib/admin-session.js";
import { getResend } from "../lib/email.js";
import { generateProposal, generateSOW } from "../lib/generators.js";

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

    const [total, newLeads, hotLeads, won, lost, followUpToday, overdue] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.status, "New")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.priority, "High")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.status, "Won")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.status, "Lost")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(and(gte(crmLeads.nextFollowUpAt, todayStart), lt(crmLeads.nextFollowUpAt, todayEnd))).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(lt(crmLeads.nextFollowUpAt, todayStart)).then(r => Number(r[0].count)),
    ]);

    const recentActivity = await db.select({
      id: crmActivities.id,
      type: crmActivities.type,
      title: crmActivities.title,
      description: crmActivities.description,
      createdAt: crmActivities.createdAt,
      leadId: crmActivities.leadId,
    }).from(crmActivities).orderBy(desc(crmActivities.createdAt)).limit(15);

    res.json({ stats: { total, newLeads, hotLeads, won, lost, followUpToday, overdue }, recentActivity });
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
    const fields = ["name","company","phone","email","website","source","serviceInterest",
      "priority","assignedTo","notes","estimatedValue","packageType",
      "discoveryFormStatus","proposalStatus","sowStatus"];
    for (const f of fields) {
      if (data[f] !== undefined) updates[f] = data[f];
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
    const { name, subject, body, status } = req.body as Record<string, string>;
    if (!name || !subject || !body) {
      res.status(400).json({ error: "name, subject, and body are required" }); return;
    }
    const allowed = ["draft","ready","archived"];
    const safeStatus = allowed.includes(status) ? status : "draft";
    const [campaign] = await db.insert(crmCampaigns)
      .values({ name, subject, body, status: safeStatus })
      .returning();
    res.status(201).json({ campaign });
  } catch (err) {
    req.log.error({ err }, "Error creating campaign");
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

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
    const { name, subject, body, status } = req.body as Record<string, string>;
    const allowed = ["draft","ready","archived"];
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name)   updates.name    = name;
    if (subject) updates.subject = subject;
    if (body)   updates.body    = body;
    if (status && allowed.includes(status)) updates.status = status;
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

      try {
        if (!isTestMode) {
          const resend = getResend();
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>",
            to: [r.leadEmail],
            subject,
            html: body.replace(/\n/g, "<br>"),
          });
          // 200 ms rate-limit guard between live sends
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        await db.update(crmCampaignRecipients)
          .set({ status: "sent", sentAt: new Date(), lastError: null })
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

    try {
      if (!isTestMode) {
        const resend = getResend();
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>",
          to: [r.leadEmail],
          subject,
          html: body.replace(/\n/g, "<br>"),
        });
      }
      await db.update(crmCampaignRecipients)
        .set({ status: "sent", sentAt: new Date(), lastError: null })
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

export default router;
