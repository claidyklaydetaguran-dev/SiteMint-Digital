import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, crmProjects, crmTasks, crmLeads, crmActivities, PROJECT_STAGES } from "@workspace/db";
import type { ChecklistItem, ProjectLink } from "@workspace/db";
import { eq, desc, inArray, and } from "drizzle-orm";
import { validateToken } from "../lib/admin-session.js";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.substring(7);
  if (!validateToken(token)) { res.status(401).json({ error: "Invalid token" }); return; }
  next();
}

// ── Project delivery task templates by project type ───────────────────────────
const WEB_BUILD_TASKS = [
  "Review discovery form", "Prepare proposal", "Collect brand assets", "Collect website copy",
  "Create sitemap", "Design homepage", "Design inner pages", "Set up backend", "Set up database",
  "Set up forms", "Set up email notifications", "Connect domain", "Set up SEO basics",
  "QA test desktop", "QA test mobile", "Client review", "Final revisions", "Launch website",
  "Post-launch check", "Offer maintenance plan",
];

const TASK_TEMPLATES: Record<string, string[]> = {
  "Website Design": WEB_BUILD_TASKS,
  "Website Redesign": WEB_BUILD_TASKS,
  "Web Application": [
    "Review discovery form", "Prepare proposal", "Define feature scope", "Design data model",
    "Set up backend", "Set up database", "Build core features", "Build admin/dashboard",
    "Integrate third-party services", "QA test desktop", "QA test mobile", "Client review",
    "Final revisions", "Deploy application", "Post-launch check", "Offer maintenance plan",
  ],
  "CRM Development": [
    "Review discovery form", "Prepare proposal", "Map current workflow", "Design data model",
    "Set up backend", "Set up database", "Build pipeline & contacts", "Build automation",
    "Set up email/SMS", "QA test", "Client review", "Final revisions", "Deploy", "Offer maintenance plan",
  ],
  "E-commerce": [
    ...WEB_BUILD_TASKS.slice(0, 8), "Set up product catalog", "Set up payments", "Set up shipping & tax",
    ...WEB_BUILD_TASKS.slice(8),
  ],
  "Landing Page": [
    "Review discovery form", "Prepare proposal", "Collect brand assets", "Collect copy",
    "Design landing page", "Build landing page", "Set up lead form", "Connect domain",
    "QA test desktop", "QA test mobile", "Client review", "Launch", "Post-launch check",
  ],
  "SEO": [
    "Review discovery form", "Technical SEO audit", "Keyword research", "On-page optimization",
    "Content plan", "Backlink strategy", "Set up analytics & Search Console", "Monthly reporting setup",
    "Client review", "Offer maintenance plan",
  ],
  "Blog Content": [
    "Review discovery form", "Content strategy", "Topic & keyword research", "Editorial calendar",
    "Draft articles", "Client review", "Publish", "Offer maintenance plan",
  ],
  "Branding": [
    "Review discovery form", "Brand discovery workshop", "Moodboard", "Logo concepts",
    "Color & typography system", "Brand guidelines", "Client review", "Final delivery",
  ],
  "AI Automation": [
    "Review discovery form", "Map current workflow", "Define automation scope", "Build integration",
    "Test automation", "Client review", "Deploy", "Offer maintenance plan",
  ],
  "Maintenance & Support": [
    "Onboarding audit", "Set up monitoring", "Configure backups", "Schedule check-ins",
    "Monthly maintenance report",
  ],
  "Consultation": [
    "Review discovery form", "Prepare agenda", "Discovery call", "Deliver recommendations",
    "Follow-up proposal",
  ],
  "Website Audit": [
    "Review discovery form", "Performance audit", "SEO audit", "UX & accessibility audit",
    "Compile findings", "Deliver report", "Recommend next steps",
  ],
};

function tasksForProjectType(type?: string | null): string[] {
  if (type && TASK_TEMPLATES[type]) return TASK_TEMPLATES[type];
  return WEB_BUILD_TASKS;
}

const DEFAULT_LAUNCH_CHECKLIST: ChecklistItem[] = [
  "Domain connected", "SSL active", "Analytics installed", "SEO meta tags set",
  "Forms tested", "Mobile responsive verified", "Cross-browser tested",
  "Backup configured", "Client sign-off",
].map((label) => ({ label, done: false }));

// ── List projects (enriched with lead name + task counts) ─────────────────────
router.get("/crm/projects", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const projects = await db.select().from(crmProjects).orderBy(desc(crmProjects.createdAt));
    const leadIds = [...new Set(projects.map((p) => p.leadId).filter((x): x is number => x != null))];
    const leads = leadIds.length
      ? await db.select({ id: crmLeads.id, name: crmLeads.name }).from(crmLeads).where(inArray(crmLeads.id, leadIds))
      : [];
    const leadName = new Map(leads.map((l) => [l.id, l.name]));

    const projectIds = projects.map((p) => p.id);
    const tasks = projectIds.length
      ? await db.select({ id: crmTasks.id, projectId: crmTasks.projectId, status: crmTasks.status })
          .from(crmTasks).where(inArray(crmTasks.projectId, projectIds))
      : [];
    const counts = new Map<number, { total: number; done: number }>();
    for (const t of tasks) {
      if (t.projectId == null) continue;
      const c = counts.get(t.projectId) ?? { total: 0, done: 0 };
      c.total += 1;
      if (t.status === "completed") c.done += 1;
      counts.set(t.projectId, c);
    }

    res.json({
      projects: projects.map((p) => ({
        ...p,
        leadName: p.leadId != null ? leadName.get(p.leadId) ?? null : null,
        taskTotal: counts.get(p.id)?.total ?? 0,
        taskDone: counts.get(p.id)?.done ?? 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load projects" });
  }
});

// ── Single project with its tasks ─────────────────────────────────────────────
router.get("/crm/projects/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, id));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const tasks = await db.select().from(crmTasks).where(eq(crmTasks.projectId, id)).orderBy(crmTasks.id);
    let leadName: string | null = null;
    if (project.leadId != null) {
      const [lead] = await db.select({ name: crmLeads.name }).from(crmLeads).where(eq(crmLeads.id, project.leadId));
      leadName = lead?.name ?? null;
    }
    res.json({ project: { ...project, leadName }, tasks });
  } catch (err) {
    res.status(500).json({ error: "Failed to load project" });
  }
});

// ── Create project (auto-generates delivery tasks + launch checklist) ─────────
router.post("/crm/projects", requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = req.body as Record<string, unknown>;
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) { res.status(400).json({ error: "Project name is required" }); return; }

    const stage = typeof b.stage === "string" && (PROJECT_STAGES as readonly string[]).includes(b.stage)
      ? b.stage : "New Lead";
    const projectType = typeof b.projectType === "string" ? b.projectType : null;
    const generateTasks = b.generateTasks !== false; // default true

    const [project] = await db.insert(crmProjects).values({
      name,
      stage,
      projectType,
      leadId: typeof b.leadId === "number" ? b.leadId : b.leadId ? Number(b.leadId) : null,
      dealId: typeof b.dealId === "number" ? b.dealId : b.dealId ? Number(b.dealId) : null,
      budget: b.budget != null && b.budget !== "" ? String(b.budget) : null,
      startDate: typeof b.startDate === "string" && b.startDate ? b.startDate : null,
      targetLaunchDate: typeof b.targetLaunchDate === "string" && b.targetLaunchDate ? b.targetLaunchDate : null,
      assignedTo: typeof b.assignedTo === "string" ? b.assignedTo : null,
      notes: typeof b.notes === "string" ? b.notes : null,
      proposalLink: typeof b.proposalLink === "string" ? b.proposalLink : null,
      discoveryFormLink: typeof b.discoveryFormLink === "string" ? b.discoveryFormLink : null,
      maintenancePlan: typeof b.maintenancePlan === "string" ? b.maintenancePlan : null,
      launchChecklist: DEFAULT_LAUNCH_CHECKLIST,
      links: [],
    }).returning();

    if (generateTasks) {
      const titles = tasksForProjectType(projectType);
      await db.insert(crmTasks).values(titles.map((title) => ({
        projectId: project.id,
        leadId: project.leadId,
        type: "Project Task",
        title,
        status: "pending",
      })));
    }

    if (project.leadId != null) {
      await db.insert(crmActivities).values({
        leadId: project.leadId,
        type: "project_created",
        title: "Project created",
        description: `${project.name} (${projectType ?? "project"}) started in delivery pipeline`,
      });
    }

    req.log.info({ projectId: project.id }, "CRM project created");
    res.json({ project });
  } catch (err) {
    req.log.error({ err }, "Error creating project");
    res.status(500).json({ error: "Failed to create project" });
  }
});

// ── Update project ────────────────────────────────────────────────────────────
router.patch("/crm/projects/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const b = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof b.name === "string") updates.name = b.name.trim();
    if (typeof b.stage === "string") {
      if (!(PROJECT_STAGES as readonly string[]).includes(b.stage)) {
        res.status(400).json({ error: "Invalid stage" }); return;
      }
      updates.stage = b.stage;
    }
    if ("projectType" in b) updates.projectType = b.projectType ?? null;
    if ("leadId" in b) updates.leadId = b.leadId ? Number(b.leadId) : null;
    if ("budget" in b) updates.budget = b.budget != null && b.budget !== "" ? String(b.budget) : null;
    if ("startDate" in b) updates.startDate = b.startDate || null;
    if ("targetLaunchDate" in b) updates.targetLaunchDate = b.targetLaunchDate || null;
    if ("assignedTo" in b) updates.assignedTo = b.assignedTo ?? null;
    if ("notes" in b) updates.notes = b.notes ?? null;
    if ("proposalLink" in b) updates.proposalLink = b.proposalLink ?? null;
    if ("discoveryFormLink" in b) updates.discoveryFormLink = b.discoveryFormLink ?? null;
    if ("maintenancePlan" in b) updates.maintenancePlan = b.maintenancePlan ?? null;
    if ("launchChecklist" in b) updates.launchChecklist = b.launchChecklist as ChecklistItem[];
    if ("links" in b) updates.links = b.links as ProjectLink[];

    const [project] = await db.update(crmProjects).set(updates).where(eq(crmProjects.id, id)).returning();
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({ project });
  } catch (err) {
    req.log.error({ err }, "Error updating project");
    res.status(500).json({ error: "Failed to update project" });
  }
});

// ── Delete project (and its tasks) ────────────────────────────────────────────
router.delete("/crm/projects/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmTasks).where(eq(crmTasks.projectId, id));
    await db.delete(crmProjects).where(eq(crmProjects.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// ── Add a task to a project ───────────────────────────────────────────────────
router.post("/crm/projects/:id/tasks", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const b = req.body as Record<string, unknown>;
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title) { res.status(400).json({ error: "Task title is required" }); return; }
    const [project] = await db.select({ leadId: crmProjects.leadId }).from(crmProjects).where(eq(crmProjects.id, id));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const [task] = await db.insert(crmTasks).values({
      projectId: id,
      leadId: project.leadId,
      type: "Project Task",
      title,
      description: typeof b.description === "string" ? b.description : null,
      status: "pending",
    }).returning();
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: "Failed to add task" });
  }
});

// ── Toggle / update a project task ────────────────────────────────────────────
router.patch("/crm/projects/:id/tasks/:taskId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const taskId = Number(req.params.taskId);
    if (isNaN(id) || isNaN(taskId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const b = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof b.status === "string") {
      updates.status = b.status;
      updates.completedAt = b.status === "completed" ? new Date() : null;
    }
    if (typeof b.title === "string") updates.title = b.title.trim();
    const [task] = await db.update(crmTasks).set(updates)
      .where(and(eq(crmTasks.id, taskId), eq(crmTasks.projectId, id))).returning();
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ── Delete a project task ─────────────────────────────────────────────────────
router.delete("/crm/projects/:id/tasks/:taskId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const taskId = Number(req.params.taskId);
    if (isNaN(id) || isNaN(taskId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmTasks).where(and(eq(crmTasks.id, taskId), eq(crmTasks.projectId, id)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
