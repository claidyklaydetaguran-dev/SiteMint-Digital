import { Router, type IRouter, type Request, type Response } from "express";
import { db, discoverySubmissions, formSubmissions } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { inviteDiscoverySubmitter } from "../lib/discoveryPortal.js";
import { calculateLeadScore, calculateTags, recommendPackage } from "../lib/generators.js";
import { sendFormEmails } from "../lib/email.js";
import { discoveryIpLimiter, getClientIp, publicFormLimit } from "../lib/contactProtection.js";
import {
  isPublicFormSubmissionsEnabled,
  PUBLIC_FORM_SUBMISSIONS_DISABLED_MESSAGE,
} from "../lib/publicWriteFlags.js";

const router: IRouter = Router();

router.post("/discovery/submit", async (req: Request, res: Response) => {
  // Fail-closed public-write gate — before validation, database access,
  // insertion, and notification email.
  if (!isPublicFormSubmissionsEnabled()) {
    res.status(503).json({ error: PUBLIC_FORM_SUBMISSIONS_DISABLED_MESSAGE });
    return;
  }
  // IP rate limit (5/hour), same pattern as /contact/submit — checked before
  // any database write or outbound email (launch security audit 2026-09-24).
  const ip = getClientIp(req);
  if (discoveryIpLimiter.isOverLimitFor(ip, publicFormLimit(ip))) {
    req.log.warn({ ip }, "[discovery] rate limit exceeded");
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  try {
    const data = req.body as Record<string, unknown>;

    if (!data.contactName || !data.companyName || !data.email) {
      res.status(400).json({ error: "Missing required fields: contactName, companyName, email" });
      return;
    }
    const name = String(data.contactName).trim();
    const email = String(data.email).trim().toLowerCase();
    if (!name || name.length > 200 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Enter your name and a valid email address." });
      return;
    }
    const phone = data.phone ? String(data.phone) : null;
    const company = String(data.companyName);
    const services = Array.isArray(data.services) ? (data.services as string[]) : [];
    discoveryIpLimiter.record(ip);

    const leadScore = calculateLeadScore(data);
    const tags = calculateTags(data, leadScore);
    const pkg = recommendPackage(data);

    const meta = data.plannerMeta as { idempotencyKey?: unknown } | undefined;
    const rawKey = typeof meta?.idempotencyKey === "string" ? meta.idempotencyKey : "";
    const intakeKey = /^[a-zA-Z0-9-]{16,100}$/.test(rawKey) ? `legacy:${rawKey}` : null;
    const saved = await db.transaction(async tx => {
    if (intakeKey) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${intakeKey}))`);
      const [existing] = await tx.select().from(discoverySubmissions).where(eq(discoverySubmissions.idempotencyKey,intakeKey)).limit(1);
      if (existing) return { submission: existing, formSub: null, duplicate: true, conflict: !isDeepStrictEqual(existing.formData,data) };
    }
    const [submission] = await tx
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
        idempotencyKey: intakeKey,
      })
      .returning();

    const [formSub] = await tx
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

    return { submission, formSub, duplicate: false, conflict: false };
    });
    const { submission, formSub } = saved;
    if (saved.conflict) {
      res.status(409).json({ message: "This submission key already belongs to a different brief. Please try again." });
      return;
    }
    if (saved.duplicate || !formSub) {
      try { await inviteDiscoverySubmitter(submission.id); } catch { req.log.warn({ id: submission.id }, "Discovery portal invitation needs staff review"); }
      res.status(200).json({ success: true, id: submission.id });
      return;
    }

    // The lead is persisted above; a mail-layer failure (missing provider
    // key, provider outage) must be recorded on the row, never turned into a
    // 500 that tells the visitor their inquiry was lost (launch audit
    // 2026-09-24: `getResend()` throws synchronously without RESEND_API_KEY).
    let emailResult: Awaited<ReturnType<typeof sendFormEmails>>;
    try {
      emailResult = await sendFormEmails({
        formName: "Discovery Questionnaire",
        name,
        email,
        phone: phone ?? undefined,
        company,
        service: services.join(", ") || undefined,
        pageUrl: req.headers.referer,
        ip: getClientIp(req),
        fields: data,
      });
    } catch (mailErr) {
      emailResult = {
        teamSent: false,
        clientSent: false,
        errors: [`Mail layer unavailable: ${mailErr instanceof Error ? mailErr.message : String(mailErr)}`],
      };
    }

    try { await db
      .update(formSubmissions)
      .set({
        emailTeamSent: emailResult.teamSent ? "sent" : "failed",
        emailClientSent: emailResult.clientSent ? "sent" : "failed",
      })
      .where(eq(formSubmissions.id, formSub.id)); }
    catch { req.log.warn({ id: submission.id }, "Saved discovery email status needs reconciliation"); }

    if (emailResult.errors.length > 0) {
      req.log.warn({ errors: emailResult.errors, id: submission.id }, "Some discovery emails failed");
    }

    // Portal setup is secondary to intake: a delivery/configuration failure
    // must not turn a saved inquiry into a reported submission failure.
    try { await inviteDiscoverySubmitter(submission.id); }
    catch { req.log.warn({ id: submission.id }, "Discovery portal invitation needs staff review"); }
    req.log.info({ id: submission.id, score: leadScore, pkg, teamSent: emailResult.teamSent, clientSent: emailResult.clientSent }, "Discovery form submitted");
    res.status(201).json({ success: true, id: submission.id });
  } catch (err) {
    req.log.error({ err }, "Error saving discovery submission");
    res.status(500).json({ error: "Failed to save submission" });
  }
});

export default router;
