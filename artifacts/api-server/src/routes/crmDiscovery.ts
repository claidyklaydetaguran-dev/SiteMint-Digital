import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  db, discoverySubmissions, crmLeads, crmActivities, crmTasks, crmProjects,
} from "@workspace/db";
import type { DiscoverySubmission } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { validateToken } from "../lib/admin-session.js";
import { generateProposal, generateSOW } from "../lib/generators.js";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.substring(7);
  if (!validateToken(token)) { res.status(401).json({ error: "Invalid token" }); return; }
  next();
}

// ── Task templates (mirrors crmProjects.ts) ───────────────────────────────────
const DISCOVERY_TASK_TEMPLATES: Record<string, string[]> = {
  "Website Design": [
    "Discovery call & requirements gathering", "Brand assets collection", "Sitemap creation",
    "Wireframes / low-fi mockups", "Design mockup (desktop)", "Design mockup (mobile)",
    "Client design approval", "Development setup", "Homepage build", "Inner pages build",
    "Contact forms & integrations", "SEO meta setup", "Mobile responsiveness QA",
    "Cross-browser testing", "Performance optimization", "Content review & proofing",
    "Client staging review", "Revisions", "DNS / launch prep", "Launch & post-launch check",
  ],
  "Web Application": [
    "Requirements & user story documentation", "Technical architecture planning",
    "Database schema design", "Backend API setup", "Auth & user management",
    "Core feature development", "UI component build", "Frontend integration",
    "Unit & integration tests", "QA testing", "Security review", "Performance optimization",
    "Staging deployment", "Client UAT", "Bug fixes & revisions", "Production deployment",
    "Monitoring setup", "Documentation", "Client training", "Launch",
  ],
};
const DEFAULT_TASK_LIST = DISCOVERY_TASK_TEMPLATES["Website Design"];
const DEFAULT_LAUNCH_CHECKLIST = [
  { label: "Domain pointed and SSL active", done: false },
  { label: "All pages reviewed and approved", done: false },
  { label: "Contact forms tested", done: false },
  { label: "Analytics configured", done: false },
  { label: "Mobile responsive check", done: false },
  { label: "Speed / performance test", done: false },
  { label: "SEO meta tags set", done: false },
  { label: "Backup configured", done: false },
  { label: "Client walkthrough complete", done: false },
];

// ── Deterministic classification ──────────────────────────────────────────────

// Narrowed to exactly the fields this function reads, so it stays valid
// regardless of future additive columns on discoverySubmissions — see
// docs/sitemint-platform/DISCOVERY_DOMAIN_CONTRACT.md, "crmDiscovery.ts
// compatibility exception." Compile-time only: the `partial` object below
// keeps its full original runtime construction and is passed here
// structurally (TypeScript accepts a wider-shaped variable wherever a
// narrower Pick<> is expected).
type DeterministicSummaryInput = Pick<
  DiscoverySubmission,
  "formData" | "budget" | "timeline" | "companyName" | "contactName" | "leadScore"
>;

function buildDeterministicSummary(sub: DeterministicSummaryInput): {
  aiSummary: string;
  estimatedComplexity: string;
  estimatedBudgetTier: string;
  suggestedScope: Record<string, unknown>;
} {
  const d = sub.formData as Record<string, unknown>;
  const services = (d.services as string[]) || [];
  const allFeatures = [
    ...((d.marketingFeatures as string[]) || []),
    ...((d.salesFeatures as string[]) || []),
    ...((d.membershipFeatures as string[]) || []),
    ...((d.automationFeatures as string[]) || []),
    ...((d.otherFeatures as string[]) || []),
  ];
  const budget = sub.budget || (d.budget as string) || "";
  const timeline = sub.timeline || (d.timeline as string) || "";

  let complexity = "Medium";
  const premiumServices = ["web-app", "crm", "automation"];
  const premiumFeatures = ["ai-chatbot", "workflow-automation", "user-login", "member-dashboard"];
  if (
    services.some(s => premiumServices.includes(s)) ||
    allFeatures.some(f => premiumFeatures.includes(f)) ||
    budget === "10k-plus"
  ) complexity = "Enterprise";
  else if (services.length >= 3 || allFeatures.length >= 5 || budget === "5k-10k") complexity = "High";
  else if (services.length <= 1 && allFeatures.length <= 2) complexity = "Low";

  let budgetTier = "Growth";
  if (["5k-10k", "10k-plus"].includes(budget) || complexity === "Enterprise") budgetTier = "Premium";
  else if (["under1k", "1k-2.5k"].includes(budget) && complexity === "Low") budgetTier = "Essential";

  const suggestedScope: Record<string, unknown> = {
    services, primaryService: services[0] || "website", features: allFeatures,
    pages: ["Home", "About", "Services", "Contact"],
    estimatedWeeks: complexity === "Enterprise" ? "8-14" : complexity === "High" ? "6-10" : "3-5",
    budgetRange: budget, timeline,
  };

  const serviceStr = services.map(s => s.replace(/-/g, " ")).join(", ") || "web development";
  const goalStr = (d.projectGoals as string[] || []).map(g => g.replace(/-/g, " ")).join(", ") || "grow their online presence";
  const aiSummary =
    `${sub.companyName} (${sub.contactName}) is seeking ${serviceStr} to help them ${goalStr}. ` +
    `Budget: ${budget || "unspecified"}. Timeline: ${timeline || "flexible"}. ` +
    `Estimated complexity: ${complexity}. Recommended package: ${budgetTier}. ` +
    `Lead score: ${sub.leadScore}/10.`;

  return { aiSummary, estimatedComplexity: complexity, estimatedBudgetTier: budgetTier, suggestedScope };
}

// ── GET /api/crm/discovery-submissions ───────────────────────────────────────

router.get("/crm/discovery-submissions", requireAdmin, async (req: Request, res: Response) => {
  const { status, budget, timeline, search, limit = "100", offset = "0" } =
    req.query as Record<string, string>;

  let rows = await db.select().from(discoverySubmissions).orderBy(desc(discoverySubmissions.createdAt));

  if (status)   rows = rows.filter(r => r.crmStatus === status);
  if (budget)   rows = rows.filter(r => r.budget === budget);
  if (timeline) rows = rows.filter(r => r.timeline === timeline);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      r.contactName.toLowerCase().includes(q) ||
      r.companyName.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q),
    );
  }

  const total = rows.length;
  const lim = Math.max(1, Number(limit));
  const off = Math.max(0, Number(offset));
  rows = rows.slice(off, off + lim);

  res.json({ submissions: rows, total });
});

// ── GET /api/crm/discovery-submissions/:id ────────────────────────────────────

router.get("/crm/discovery-submissions/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [sub] = await db.select().from(discoverySubmissions).where(eq(discoverySubmissions.id, id));
  if (!sub) { res.status(404).json({ error: "Not found" }); return; }

  let lead = null;
  if (sub.leadId) {
    const [l] = await db.select().from(crmLeads).where(eq(crmLeads.id, sub.leadId));
    lead = l || null;
  }

  res.json({ submission: sub, lead });
});

// ── POST /api/crm/discovery-submissions ───────────────────────────────────────

router.post("/crm/discovery-submissions", requireAdmin, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const contactName = String(body.contactName || "").trim();
  const companyName = String(body.companyName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!contactName || !companyName || !email) {
    res.status(400).json({ error: "contactName, companyName, email are required" }); return;
  }

  const formData = (body.formData as Record<string, unknown>) || {};

  const partial = {
    id: 0, createdAt: new Date(), updatedAt: new Date(),
    contactName, companyName, email,
    phone: String(body.phone || "") || null,
    industry: String(body.industry || "") || null,
    serviceInterest: String(body.serviceInterest || "") || null,
    budget: String(body.budget || "") || null,
    timeline: String(body.timeline || "") || null,
    decisionMaker: String(body.decisionMaker || "") || null,
    leadScore: 5, tags: [], status: "New", recommendedPackage: null,
    formData, generatedProposal: null, generatedSow: null, internalNotes: null,
    leadId: null, aiSummary: null, estimatedComplexity: null,
    estimatedBudgetTier: null, suggestedScope: null,
    crmStatus: "New", preferredContactMethod: null, convertedProjectId: null,
  };

  const { aiSummary, estimatedComplexity, estimatedBudgetTier, suggestedScope } =
    buildDeterministicSummary(partial);

  // Deduplicate or create CRM lead by email
  let leadId: number | null = null;
  const [existingLead] = await db.select().from(crmLeads).where(eq(crmLeads.email, email));
  if (existingLead) {
    leadId = existingLead.id;
  } else {
    const [newLead] = await db.insert(crmLeads).values({
      name: `${contactName} (${companyName})`,
      email,
      phone: String(body.phone || "") || null,
      company: companyName,
      serviceInterest: String(body.serviceInterest || "") || null,
      status: "New Inquiry",
      source: "Discovery Form",
    }).returning();
    leadId = newLead.id;
  }

  const [sub] = await db.insert(discoverySubmissions).values({
    contactName, companyName, email,
    phone: String(body.phone || "") || null,
    industry: String(body.industry || "") || null,
    serviceInterest: String(body.serviceInterest || "") || null,
    budget: String(body.budget || "") || null,
    timeline: String(body.timeline || "") || null,
    decisionMaker: String(body.decisionMaker || "") || null,
    leadScore: 5, tags: [], status: "New",
    formData, leadId, aiSummary, estimatedComplexity, estimatedBudgetTier, suggestedScope,
    crmStatus: "New",
    preferredContactMethod: String(body.preferredContactMethod || "") || null,
  }).returning();

  // Log activity (leadId required by schema)
  if (leadId) {
    await db.insert(crmActivities).values({
      leadId,
      type: "note",
      title: "Discovery Submission Received",
      description: `Discovery questionnaire submitted. Complexity: ${estimatedComplexity}. Package: ${estimatedBudgetTier}.`,
    });

    // Follow-up task — dueDate is a timestamp column
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 1);
    await db.insert(crmTasks).values({
      leadId,
      title: `Follow up with ${contactName} from ${companyName}`,
      type: "follow-up",
      status: "pending",
      dueDate: followUpDate,
      description: "Discovery submission received. Review answers and generate a proposal.",
    });
  }

  res.status(201).json({ submission: sub, leadId });
});

// ── PATCH /api/crm/discovery-submissions/:id ─────────────────────────────────

router.patch("/crm/discovery-submissions/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const allowed = [
    "crmStatus", "internalNotes", "leadId", "aiSummary",
    "estimatedComplexity", "estimatedBudgetTier", "suggestedScope",
    "preferredContactMethod", "convertedProjectId",
  ] as const;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of allowed) {
    if (k in (req.body as object)) updates[k] = (req.body as Record<string, unknown>)[k];
  }

  const [updated] = await db.update(discoverySubmissions)
    .set(updates)
    .where(eq(discoverySubmissions.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ submission: updated });
});

// ── DELETE /api/crm/discovery-submissions/:id ─────────────────────────────────

router.delete("/crm/discovery-submissions/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(discoverySubmissions)
    .where(eq(discoverySubmissions.id, id))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

// ── POST /api/crm/discovery-submissions/:id/generate-proposal ─────────────────

router.post(
  "/crm/discovery-submissions/:id/generate-proposal",
  requireAdmin,
  async (req: Request, res: Response) => {
    const id = Number(req.params["id"]);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const [sub] = await db.select().from(discoverySubmissions).where(eq(discoverySubmissions.id, id));
    if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }

    const proposalHtml = generateProposal(sub);
    const sowHtml = generateSOW(sub);

    const [updatedSub] = await db.update(discoverySubmissions)
      .set({ generatedProposal: proposalHtml, generatedSow: sowHtml, crmStatus: "Proposal Generated", updatedAt: new Date() })
      .where(eq(discoverySubmissions.id, id))
      .returning();

    if (sub.leadId) {
      await db.update(crmLeads)
        .set({ generatedProposal: proposalHtml, proposalStatus: "Draft" })
        .where(eq(crmLeads.id, sub.leadId));

      await db.insert(crmActivities).values({
        leadId: sub.leadId,
        type: "note",
        title: "Proposal Generated from Discovery",
        description: `Proposal and SOW generated from discovery submission #${id}.`,
      });
    }

    res.json({ submission: updatedSub, proposalHtml, sowHtml, leadId: sub.leadId });
  },
);

// ── POST /api/crm/discovery-submissions/:id/convert-to-project ───────────────

router.post(
  "/crm/discovery-submissions/:id/convert-to-project",
  requireAdmin,
  async (req: Request, res: Response) => {
    const id = Number(req.params["id"]);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const [sub] = await db.select().from(discoverySubmissions).where(eq(discoverySubmissions.id, id));
    if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }

    const force = (req.body as Record<string, unknown>).force === true;
    if (sub.convertedProjectId && !force) {
      res.status(409).json({
        error: "Already converted",
        projectId: sub.convertedProjectId,
        message: "This submission has already been converted to a project. Pass force: true to create another.",
      });
      return;
    }

    const initialStage = sub.crmStatus === "Proposal Generated" ? "Strategy" : "Proposal";
    const leadId = sub.leadId ?? null;

    const serviceToType: Record<string, string> = {
      "new-website": "Website Design", "redesign": "Website Redesign",
      "web-app": "Web Application", "crm": "CRM Build", "seo": "SEO Campaign",
      "automation": "AI Automation", "maintenance": "Maintenance Plan",
      "blog": "Blog / Content", "consultation": "Strategy Consultation",
    };
    const projectType = serviceToType[sub.serviceInterest || ""] || "Website Design";
    const projectName = `${sub.companyName} — ${(sub.serviceInterest || "Website").replace(/-/g, " ")}`;

    const [project] = await db.insert(crmProjects).values({
      leadId,
      name: projectName,
      projectType,
      stage: initialStage,
      notes: sub.aiSummary || null,
      launchChecklist: DEFAULT_LAUNCH_CHECKLIST,
    }).returning();

    const tasks = DISCOVERY_TASK_TEMPLATES[projectType] || DEFAULT_TASK_LIST;
    if (tasks.length > 0) {
      await db.insert(crmTasks).values(
        tasks.map(title => ({
          leadId,
          projectId: project.id,
          title,
          type: "project-task",
          status: "pending" as const,
        })),
      );
    }

    await db.update(discoverySubmissions)
      .set({ convertedProjectId: project.id, updatedAt: new Date() })
      .where(eq(discoverySubmissions.id, id));

    if (leadId) {
      await db.insert(crmActivities).values({
        leadId,
        type: "note",
        title: "Project Created from Discovery",
        description: `Project "${projectName}" created from discovery submission #${id}. Stage: ${initialStage}.`,
      });
    }

    res.status(201).json({ project, leadId });
  },
);

export default router;
