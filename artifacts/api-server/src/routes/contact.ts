import { Router, type IRouter, type Request, type Response } from "express";
import { db, formSubmissions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendFormEmails } from "../lib/email.js";
import { contactIpLimiter, getClientIp, isHoneypotTripped, stripHoneypot } from "../lib/contactProtection.js";
import { validateContactSubmission } from "../lib/contactValidation.js";

const router: IRouter = Router();

router.post("/contact/submit", async (req: Request, res: Response) => {
  try {
    const data = req.body as Record<string, unknown>;

    // ── IP rate limit (5/hour) — check before recording, same pattern as
    // receptionist signup's signupIpLimiter. ─────────────────────────────
    const ip = getClientIp(req);
    if (contactIpLimiter.isOverLimit(ip)) {
      req.log.warn({ ip }, "[contact] rate limit exceeded");
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }
    contactIpLimiter.record(ip);

    // ── Honeypot — silently-populated field means a bot, not a human. ────
    if (isHoneypotTripped(data)) {
      req.log.warn({ ip }, "[contact] honeypot tripped");
      res.status(400).json({ error: "Unable to process this submission." });
      return;
    }

    // ── Field validation (contactValidation.ts) — required name/email/
    // message, optional businessType, whitespace-only rejected, repository-
    // consistent max lengths, no silent truncation. Returns a field-keyed
    // map (never a stack trace or internal detail) so the frontend can show
    // exactly what to fix. ────────────────────────────────────────────────
    const validation = validateContactSubmission(data);
    if (!validation.ok) {
      res.status(400).json({ error: "Please fix the following before sending.", fields: validation.fields });
      return;
    }
    const { name, email, businessType, message } = validation.data;
    const phone = data.phone ? String(data.phone) : null;
    const service = data.serviceNeeded ? String(data.serviceNeeded) : null;

    // formData/fields: normalized values for name/email/message/
    // businessType, everything else the client sent preserved as-is,
    // honeypot key always stripped — never persisted, never forwarded to
    // the email templates.
    const restData = stripHoneypot(data);
    const normalizedFields = { ...restData, name, email, message, ...(businessType ? { businessType } : {}) };

    const [submission] = await db
      .insert(formSubmissions)
      .values({
        formName: "Contact Form",
        name,
        email,
        phone,
        company: businessType,
        service,
        formData: normalizedFields,
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
      company: businessType ?? undefined,
      service: service ?? undefined,
      pageUrl: req.headers.referer,
      ip: req.ip,
      fields: normalizedFields,
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
