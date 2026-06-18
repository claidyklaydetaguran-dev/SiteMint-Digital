import { Router, type IRouter, type Request, type Response } from "express";
import { db, discoverySubmissions } from "@workspace/db";
import { calculateLeadScore, calculateTags, recommendPackage } from "../lib/generators.js";

const router: IRouter = Router();

router.post("/discovery/submit", async (req: Request, res: Response) => {
  try {
    const data = req.body as Record<string, unknown>;

    if (!data.contactName || !data.companyName || !data.email) {
      res.status(400).json({ error: "Missing required fields: contactName, companyName, email" });
      return;
    }

    const leadScore = calculateLeadScore(data);
    const tags = calculateTags(data, leadScore);
    const pkg = recommendPackage(data);

    const [submission] = await db
      .insert(discoverySubmissions)
      .values({
        contactName: String(data.contactName),
        companyName: String(data.companyName),
        email: String(data.email),
        phone: data.phone ? String(data.phone) : null,
        industry: data.industry ? String(data.industry) : null,
        serviceInterest: Array.isArray(data.services) ? (data.services as string[])[0] || null : null,
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

    req.log.info({ id: submission.id, score: leadScore, pkg }, "Discovery form submitted");
    res.status(201).json({ success: true, id: submission.id });
  } catch (err) {
    req.log.error({ err }, "Error saving discovery submission");
    res.status(500).json({ error: "Failed to save submission" });
  }
});

export default router;
