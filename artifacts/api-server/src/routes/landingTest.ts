import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, formSubmissions, landingPageViews } from "@workspace/db";
import { eq, sql, ilike } from "drizzle-orm";
import { sendFormEmails } from "../lib/email.js";
import { validateToken } from "../lib/admin-session.js";

const router: IRouter = Router();

const VERTICALS = ["lawyers", "realtors", "receptionist"] as const;
type Vertical = (typeof VERTICALS)[number];

const VERTICAL_LABEL: Record<Vertical, string> = {
  lawyers:      "Landing Test — Lawyers",
  realtors:     "Landing Test — Realtors",
  receptionist: "Landing Test — Receptionist",
};

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth  = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!validateToken(token)) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// ── POST /landing-test/submit ──────────────────────────────────────────────────

router.post("/landing-test/submit", async (req: Request, res: Response) => {
  try {
    const data = req.body as Record<string, unknown>;

    const vertical = String(data.vertical || "");
    if (!VERTICALS.includes(vertical as Vertical)) {
      res.status(400).json({ error: "vertical must be one of: lawyers, realtors, receptionist" });
      return;
    }

    const name         = String(data.name         || "").trim();
    const email        = String(data.email        || "").trim();
    const phone        = data.phone        ? String(data.phone).trim()        : null;
    const businessName = data.businessName ? String(data.businessName).trim() : null;
    const extra        = data.extra        ? String(data.extra).trim()        : null;
    // UTM fields land in formData automatically (data = full body); no new columns needed
    const _utmSource   = data.utmSource   ?? null;
    const _utmMedium   = data.utmMedium   ?? null;
    const _utmCampaign = data.utmCampaign ?? null;
    void _utmSource; void _utmMedium; void _utmCampaign;

    if (!name || !email) {
      res.status(400).json({ error: "Name and email are required" });
      return;
    }

    const formName = VERTICAL_LABEL[vertical as Vertical];

    const [submission] = await db
      .insert(formSubmissions)
      .values({
        formName,
        name,
        email,
        phone,
        company:         businessName,
        service:         extra,
        formData:        data,
        status:          "New",
        emailTeamSent:   "pending",
        emailClientSent: "pending",
      })
      .returning();

    const emailResult = await sendFormEmails({
      formName,
      name,
      email,
      phone:   phone   ?? undefined,
      company: businessName ?? undefined,
      service: extra   ?? undefined,
      pageUrl: req.headers.referer,
      ip:      req.ip,
      fields:  data,
    });

    await db
      .update(formSubmissions)
      .set({
        emailTeamSent:   emailResult.teamSent   ? "sent" : "failed",
        emailClientSent: emailResult.clientSent ? "sent" : "failed",
      })
      .where(eq(formSubmissions.id, submission.id));

    if (emailResult.errors.length > 0) {
      req.log.warn({ errors: emailResult.errors, id: submission.id }, "Some landing-test emails failed");
    }

    req.log.info({ id: submission.id, vertical, teamSent: emailResult.teamSent }, "Landing test form submitted");
    res.status(201).json({ success: true, id: submission.id });
  } catch (err) {
    req.log.error({ err }, "Error processing landing-test form");
    res.status(500).json({ error: "Failed to process submission" });
  }
});

// ── POST /landing-test/view  (public, no auth) ────────────────────────────────

router.post("/landing-test/view", async (req: Request, res: Response) => {
  try {
    const { page, utmSource, utmMedium, utmCampaign } = req.body as Record<string, unknown>;

    const pageStr = String(page || "");
    if (!VERTICALS.includes(pageStr as Vertical)) {
      res.status(400).json({ error: "page must be one of: lawyers, realtors, receptionist" });
      return;
    }

    await db.insert(landingPageViews).values({
      page:        pageStr,
      utmSource:   utmSource   ? String(utmSource)   : null,
      utmMedium:   utmMedium   ? String(utmMedium)   : null,
      utmCampaign: utmCampaign ? String(utmCampaign) : null,
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error recording landing page view");
    res.status(500).json({ error: "Failed to record view" });
  }
});

// ── GET /landing-test/stats  (admin only) ─────────────────────────────────────

router.get("/landing-test/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    // Per-page view totals
    const viewRows = await db
      .select({
        page:  landingPageViews.page,
        views: sql<number>`cast(count(*) as integer)`,
      })
      .from(landingPageViews)
      .groupBy(landingPageViews.page);

    // Per-page submit totals (from formSubmissions "Landing Test — X")
    const submitRows = await db
      .select({
        formName: formSubmissions.formName,
        submits:  sql<number>`cast(count(*) as integer)`,
      })
      .from(formSubmissions)
      .where(ilike(formSubmissions.formName, "Landing Test — %"))
      .groupBy(formSubmissions.formName);

    // Per-page, per-utmSource breakdown
    const sourceRows = await db
      .select({
        page:      landingPageViews.page,
        utmSource: landingPageViews.utmSource,
        views:     sql<number>`cast(count(*) as integer)`,
      })
      .from(landingPageViews)
      .groupBy(landingPageViews.page, landingPageViews.utmSource);

    // Build lookup maps
    const viewMap    = Object.fromEntries(viewRows.map(r => [r.page, r.views]));
    const submitMap  = Object.fromEntries(
      submitRows.map(r => {
        const page = r.formName.replace("Landing Test — ", "").toLowerCase();
        return [page, r.submits];
      }),
    );

    const bySource: Record<string, Record<string, number>> = {};
    for (const r of sourceRows) {
      if (!bySource[r.page]) bySource[r.page] = {};
      bySource[r.page][r.utmSource ?? "direct"] = r.views;
    }

    const stats = VERTICALS.map(v => {
      const views   = viewMap[v]   ?? 0;
      const submits = submitMap[v] ?? 0;
      return {
        page:           v,
        views,
        submits,
        conversionRate: views > 0 ? `${((submits / views) * 100).toFixed(1)}%` : "n/a",
        bySource:       bySource[v] ?? {},
      };
    });

    res.json({ stats });
  } catch (err) {
    req.log.error({ err }, "Error fetching landing-test stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
