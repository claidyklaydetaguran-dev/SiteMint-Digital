import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, discoverySubmissions, formSubmissions } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getSessionToken, validateToken } from "../lib/admin-session.js";
import { generateProposal, generateSOW } from "../lib/generators.js";

const router: IRouter = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.substring(7);
  if (!validateToken(token)) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  next();
}

// ── Login ─────────────────────────────────────────────────────────────────────

router.post("/admin/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const adminPassword = process.env.ADMIN_PASSWORD || "sitemint2024";

  if (!password || password !== adminPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  res.json({ token: getSessionToken() });
});

// ── Submissions list ──────────────────────────────────────────────────────────

router.get("/admin/submissions", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: discoverySubmissions.id,
        createdAt: discoverySubmissions.createdAt,
        contactName: discoverySubmissions.contactName,
        companyName: discoverySubmissions.companyName,
        email: discoverySubmissions.email,
        industry: discoverySubmissions.industry,
        serviceInterest: discoverySubmissions.serviceInterest,
        budget: discoverySubmissions.budget,
        timeline: discoverySubmissions.timeline,
        leadScore: discoverySubmissions.leadScore,
        tags: discoverySubmissions.tags,
        status: discoverySubmissions.status,
        recommendedPackage: discoverySubmissions.recommendedPackage,
        hasProposal: discoverySubmissions.generatedProposal,
      })
      .from(discoverySubmissions)
      .orderBy(desc(discoverySubmissions.createdAt));

    const submissions = rows.map(r => ({
      ...r,
      hasProposal: !!r.hasProposal,
    }));

    res.json({ submissions });
  } catch (err) {
    req.log.error({ err }, "Error fetching submissions");
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

// ── Single submission ─────────────────────────────────────────────────────────

router.get("/admin/submissions/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [submission] = await db
      .select()
      .from(discoverySubmissions)
      .where(eq(discoverySubmissions.id, id));

    if (!submission) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ submission });
  } catch (err) {
    req.log.error({ err }, "Error fetching submission");
    res.status(500).json({ error: "Failed to fetch submission" });
  }
});

// ── Update submission ─────────────────────────────────────────────────────────

router.patch("/admin/submissions/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const { status, internalNotes } = req.body as { status?: string; internalNotes?: string };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (internalNotes !== undefined) updates.internalNotes = internalNotes;

    const [updated] = await db
      .update(discoverySubmissions)
      .set(updates)
      .where(eq(discoverySubmissions.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ submission: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating submission");
    res.status(500).json({ error: "Failed to update" });
  }
});

// ── Generate proposal ─────────────────────────────────────────────────────────

router.post("/admin/submissions/:id/proposal", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [submission] = await db
      .select()
      .from(discoverySubmissions)
      .where(eq(discoverySubmissions.id, id));

    if (!submission) { res.status(404).json({ error: "Not found" }); return; }

    const proposal = generateProposal(submission);

    await db
      .update(discoverySubmissions)
      .set({ generatedProposal: proposal, updatedAt: new Date(), status: "Proposal Generated" })
      .where(eq(discoverySubmissions.id, id));

    req.log.info({ id }, "Proposal generated");
    res.json({ proposal });
  } catch (err) {
    req.log.error({ err }, "Error generating proposal");
    res.status(500).json({ error: "Failed to generate proposal" });
  }
});

// ── Generate SOW ──────────────────────────────────────────────────────────────

router.post("/admin/submissions/:id/sow", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [submission] = await db
      .select()
      .from(discoverySubmissions)
      .where(eq(discoverySubmissions.id, id));

    if (!submission) { res.status(404).json({ error: "Not found" }); return; }

    const sow = generateSOW(submission);

    await db
      .update(discoverySubmissions)
      .set({ generatedSow: sow, updatedAt: new Date() })
      .where(eq(discoverySubmissions.id, id));

    req.log.info({ id }, "SOW generated");
    res.json({ sow });
  } catch (err) {
    req.log.error({ err }, "Error generating SOW");
    res.status(500).json({ error: "Failed to generate SOW" });
  }
});

// ── CSV Export ────────────────────────────────────────────────────────────────

router.get("/admin/submissions/export/csv", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(discoverySubmissions)
      .orderBy(desc(discoverySubmissions.createdAt));

    const headers = [
      "ID", "Submitted At", "Contact Name", "Company", "Email", "Phone",
      "Industry", "Service Interest", "Budget", "Timeline", "Lead Score",
      "Recommended Package", "Status", "Tags",
    ];

    const escape = (v: unknown): string => {
      const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };

    const csvRows = rows.map(r => [
      r.id, r.createdAt.toISOString(), r.contactName, r.companyName, r.email,
      r.phone, r.industry, r.serviceInterest, r.budget, r.timeline,
      r.leadScore, r.recommendedPackage, r.status, r.tags,
    ].map(escape).join(","));

    const csv = [headers.map(escape).join(","), ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="sitemint-submissions-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    req.log.error({ err }, "Error exporting CSV");
    res.status(500).json({ error: "Failed to export" });
  }
});

// ── All form submissions (cross-form) ─────────────────────────────────────────

router.get("/admin/form-submissions", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(formSubmissions)
      .orderBy(desc(formSubmissions.submittedAt));
    res.json({ submissions: rows });
  } catch (err) {
    req.log.error({ err }, "Error fetching form submissions");
    res.status(500).json({ error: "Failed to fetch" });
  }
});

router.patch("/admin/form-submissions/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { status, notes } = req.body as { status?: string; notes?: string };
    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    const [updated] = await db.update(formSubmissions).set(updates).where(eq(formSubmissions.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ submission: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating form submission");
    res.status(500).json({ error: "Failed to update" });
  }
});

export default router;
