import { Router, type IRouter, type Request, type Response } from "express";
import { db, formSubmissions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendFormEmails } from "../lib/email.js";

const router: IRouter = Router();

router.post("/contact/submit", async (req: Request, res: Response) => {
  try {
    const data = req.body as Record<string, unknown>;

    const name = String(data.name || "");
    const email = String(data.email || "");
    const phone = data.phone ? String(data.phone) : null;
    const company = data.businessType ? String(data.businessType) : null;
    const service = data.serviceNeeded ? String(data.serviceNeeded) : null;

    if (!name || !email) {
      res.status(400).json({ error: "Name and email are required" });
      return;
    }

    const [submission] = await db
      .insert(formSubmissions)
      .values({
        formName: "Contact Form",
        name,
        email,
        phone,
        company,
        service,
        formData: data,
        status: "New",
        emailTeamSent: "pending",
        emailClientSent: "pending",
      })
      .returning();

    const emailResult = await sendFormEmails({
      formName: "Contact Form",
      name,
      email,
      phone: phone ?? undefined,
      company: company ?? undefined,
      service: service ?? undefined,
      pageUrl: req.headers.referer,
      ip: req.ip,
      fields: data,
    });

    await db
      .update(formSubmissions)
      .set({
        emailTeamSent: emailResult.teamSent ? "sent" : "failed",
        emailClientSent: emailResult.clientSent ? "sent" : "failed",
      })
      .where(eq(formSubmissions.id, submission.id));

    if (emailResult.errors.length > 0) {
      req.log.warn({ errors: emailResult.errors, id: submission.id }, "Some contact form emails failed");
    }

    req.log.info({ id: submission.id, teamSent: emailResult.teamSent, clientSent: emailResult.clientSent }, "Contact form submitted");
    res.status(201).json({ success: true, id: submission.id });
  } catch (err) {
    req.log.error({ err }, "Error processing contact form");
    res.status(500).json({ error: "Failed to process submission" });
  }
});

export default router;
