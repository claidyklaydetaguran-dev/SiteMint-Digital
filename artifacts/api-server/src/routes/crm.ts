import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, crmLeads, crmActivities, crmTasks, crmEmailTemplates, discoverySubmissions, crmDeals } from "@workspace/db";
import { eq, desc, and, gte, lte, lt, or, ilike, sql } from "drizzle-orm";
import { validateToken } from "../lib/admin-session.js";
import { getResend } from "../lib/email.js";

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

// ── CSV Import ────────────────────────────────────────────────────────────────
router.post("/crm/import", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "No rows provided" }); return; }

    let imported = 0, skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const email = row.email?.trim().toLowerCase();
      const phone = row.phone?.trim();
      if (!email && !phone) { skipped++; errors.push(`Row missing email and phone: ${JSON.stringify(row)}`); continue; }

      // Duplicate check
      if (email) {
        const [existing] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.email, email)).limit(1);
        if (existing) { skipped++; continue; }
      }

      try {
        const [lead] = await db.insert(crmLeads).values({
          name: row.name || row.Name || "Unknown",
          email: email || `${phone?.replace(/\D/g, "")}@imported.local`,
          company: row.company || row.Company,
          phone: phone || row.Phone,
          website: row.website || row.Website,
          source: "CSV Import",
          serviceInterest: row.service_interest || row["Service Interest"],
          status: "New",
          priority: "Medium",
          notes: row.notes || row.Notes,
        }).returning();
        await logActivity(lead.id, "lead_imported", `Lead imported from CSV: ${lead.name}`);
        imported++;
      } catch (e) {
        skipped++;
        errors.push(`Failed to import row: ${String(e)}`);
      }
    }

    res.json({ imported, skipped, errors: errors.slice(0, 10) });
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

export default router;
