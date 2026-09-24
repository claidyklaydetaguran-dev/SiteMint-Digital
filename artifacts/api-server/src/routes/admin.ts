import { Router, type IRouter, type Request, type Response } from "express";
import { db, discoverySubmissions, formSubmissions } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  getSessionToken,
  requireAdmin,
  resolveAdminAuthMode,
  createAdminSession,
  revokeAdminSession,
  recordAdminAudit,
  adminLoginIpLimiter,
  getClientIp,
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_OPTIONS,
} from "../lib/admin-session.js";
import { verifyAdminPassword } from "../lib/adminPassword.js";
import { generateProposal, generateSOW } from "../lib/generators.js";
import { requireOperator } from "../lib/operatorGate.js";

const router: IRouter = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────
//
// Two gates, for two kinds of route.
//
// `requireAdmin` (lib/admin-session.ts) is the shared-password admin's own
// session — the in-memory bearer or the `admin_session` cookie — and guards
// only `/admin/logout`, which ends exactly that session. `/admin/login` issues
// it and `/admin/me` reports it.
//
// Every data route — the Discovery Portal's submissions and the form inbox — is
// behind `requireOperator(permission)` (lib/operatorGate.ts). A person signed in
// with their own `crm_staff_session` is judged as themselves: the CSRF check on
// writes, the MFA challenge and the named permission, with no fallback. The
// legacy shared admin, bearer or cookie, still passes while
// CRM_LEGACY_BEARER_ENABLED is not "false". These routes used to accept only the
// legacy credential, so a staff session was refused 401 and the portal showed
// zeros instead of the submissions it could not load.
//
//   leads.read   the submissions list, one submission, the form inbox
//   leads.write  status and notes, proposal and SOW generation, form triage
//   data.export  the CSV export — bulk egress, owner and technical admin only

// ── Login ─────────────────────────────────────────────────────────────────────

// AR-001G: fail-closed. There is no literal fallback password any more, in any
// environment. Without an explicitly configured ADMIN_PASSWORD this route
// reports that admin authentication is unavailable — a distinct outcome from a
// wrong password, so an operator can tell a misconfigured deployment apart from
// a failed sign-in, and a client is not invited to keep retrying against a
// server that can never accept any password. The submitted password is never
// logged and never echoed back.
//
// O-1: per-IP rate limiting (10/15min, ADMIN_LOGIN_IP_LIMIT in
// lib/admin-session.ts) precedes the password check, and a successful login
// ALSO issues a cookie session (best-effort — see admin-session.ts's
// degrade-gracefully contract) and writes an audit row, alongside the
// unchanged bearer token response.
router.post("/admin/login", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (adminLoginIpLimiter.isOverLimit(ip)) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  const { password } = req.body as { password?: unknown };

  switch (verifyAdminPassword(password, process.env)) {
    case "unconfigured":
      adminLoginIpLimiter.record(ip);
      req.log.error("Admin login attempted but ADMIN_PASSWORD is not configured");
      res.status(503).json({ error: "Admin authentication is not configured" });
      return;
    case "mismatch":
      adminLoginIpLimiter.record(ip);
      res.status(401).json({ error: "Invalid password" });
      return;
    case "match": {
      const uaHeader = req.headers["user-agent"];
      const userAgent = Array.isArray(uaHeader) ? uaHeader[0] : uaHeader;
      const session = await createAdminSession(ip, userAgent);
      if (session) {
        res.cookie(ADMIN_COOKIE_NAME, session.token, ADMIN_COOKIE_OPTIONS);
      }
      recordAdminAudit("admin", "admin.login", null, ip).catch(() => {});
      res.json({ token: getSessionToken() });
      return;
    }
  }
});

// ── Logout / whoami ───────────────────────────────────────────────────────────

router.post("/admin/logout", requireAdmin, async (req: Request, res: Response) => {
  const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[ADMIN_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    await revokeAdminSession(cookieToken);
  }
  res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
  recordAdminAudit("admin", "admin.logout", null, getClientIp(req)).catch(() => {});
  res.json({ ok: true });
});

router.get("/admin/me", async (req: Request, res: Response) => {
  const mode = await resolveAdminAuthMode(req);
  if (!mode) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ ok: true, mode });
});

// ── Submissions list ──────────────────────────────────────────────────────────

router.get("/admin/submissions", requireOperator("leads.read"), async (req: Request, res: Response) => {
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

// ── CSV Export ────────────────────────────────────────────────────────────────
// Registered before /admin/submissions/:id — Express matches top-to-bottom, so
// behind :id this path resolved to id="export" and 400'd (unreachable route).

router.get("/admin/submissions/export/csv", requireOperator("data.export"), async (req: Request, res: Response) => {
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

// ── Single submission ─────────────────────────────────────────────────────────

router.get("/admin/submissions/:id", requireOperator("leads.read"), async (req: Request, res: Response) => {
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

router.patch("/admin/submissions/:id", requireOperator("leads.write"), async (req: Request, res: Response) => {
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

router.post("/admin/submissions/:id/proposal", requireOperator("leads.write"), async (req: Request, res: Response) => {
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

router.post("/admin/submissions/:id/sow", requireOperator("leads.write"), async (req: Request, res: Response) => {
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

// ── All form submissions (cross-form) ─────────────────────────────────────────

router.get("/admin/form-submissions", requireOperator("leads.read"), async (req: Request, res: Response) => {
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

router.patch("/admin/form-submissions/:id", requireOperator("leads.write"), async (req: Request, res: Response) => {
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
