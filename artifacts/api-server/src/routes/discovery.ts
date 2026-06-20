import { Router, type IRouter, type Request, type Response } from "express";
import { db, discoverySubmissions, formSubmissions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { calculateLeadScore, calculateTags, recommendPackage } from "../lib/generators.js";
import { sendFormEmails } from "../lib/email.js";

const router: IRouter = Router();

router.post("/discovery/submit", async (req: Request, res: Response) => {
  try {
    const data = req.body as Record<string, unknown>;

    if (!data.contactName || !data.companyName || !data.email) {
      res.status(400).json({ error: "Missing required fields: contactName, companyName, email" });
      return;
    }

    const name = String(data.contactName);
    const email = String(data.email);
    const phone = data.phone ? String(data.phone) : null;
    const company = String(data.companyName);
    const services = Array.isArray(data.services) ? (data.services as string[]) : [];

    const leadScore = calculateLeadScore(data);
    const tags = calculateTags(data, leadScore);
    const pkg = recommendPackage(data);

    const [submission] = await db
      .insert(discoverySubmissions)
      .values({
        contactName: name,
        companyName: company,
        email,
        phone,
        industry: data.industry ? String(data.industry) : null,
        serviceInterest: services[0] || null,
        budget: data.budget ? String(data.budget) : null,
        timeline: data.timeline ? String(data.timeline) : null,
        decisionMaker: data.decisionMaker ? String(data.decisionMaker) : null,
        leadScore,
        tags,
        status: "New",
        recommendedPackage: pkg,
        formData: data,
      })
      .returning();

    const [formSub] = await db
      .insert(formSubmissions)
      .values({
        formName: "Discovery Form",
        name,
        email,
        phone,
        company,
        service: services.join(", ") || null,
        formData: data,
        status: "New",
        emailTeamSent: "pending",
        emailClientSent: "pending",
      })
      .returning();

    const emailResult = await sendFormEmails({
      formName: "Discovery Questionnaire",
      name,
      email,
      phone: phone ?? undefined,
      company,
      service: services.join(", ") || undefined,
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
      .where(eq(formSubmissions.id, formSub.id));

    if (emailResult.errors.length > 0) {
      req.log.warn({ errors: emailResult.errors, id: submission.id }, "Some discovery emails failed");
    }

    req.log.info({ id: submission.id, score: leadScore, pkg, teamSent: emailResult.teamSent, clientSent: emailResult.clientSent }, "Discovery form submitted");
    res.status(201).json({ success: true, id: submission.id });
  } catch (err) {
    req.log.error({ err }, "Error saving discovery submission");
    res.status(500).json({ error: "Failed to save submission" });
  }
});

export default router;
