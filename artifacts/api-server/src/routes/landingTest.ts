import { Router, type IRouter, type Request, type Response } from "express";
import { db, formSubmissions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendFormEmails } from "../lib/email.js";

const router: IRouter = Router();

const VERTICALS = ["lawyers", "realtors", "receptionist"] as const;
type Vertical = (typeof VERTICALS)[number];

const VERTICAL_LABEL: Record<Vertical, string> = {
  lawyers:      "Landing Test — Lawyers",
  realtors:     "Landing Test — Realtors",
  receptionist: "Landing Test — Receptionist",
};

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
    // Destructure here so they're explicit for readers of this route
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

export default router;
