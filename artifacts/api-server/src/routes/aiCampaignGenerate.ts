import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { validateToken } from "../lib/admin-session.js";
import { generateCampaignDraft, generateSequenceDraft } from "../lib/aiCampaign.js";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.substring(7);
  if (!validateToken(token)) { res.status(401).json({ error: "Invalid token" }); return; }
  next();
}

// ── POST /crm/campaigns/ai-generate ──────────────────────────────────────────
// Returns a structured JSON draft (single campaign OR multi-step sequence) for
// the UI to pre-fill form fields with. SAFETY: this route NEVER persists a
// campaign/step, NEVER enrolls a lead, and NEVER sends anything — it only
// returns draft data. A human must click the existing Save/Create button.

router.post("/crm/campaigns/ai-generate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      mode,
      personaId, personaLabel, personaDescription, personaPainPoint, personaBestCTA,
      topicId, topicTitle, topicDescription,
      objective, toneProfile, stepCount,
    } = req.body as Record<string, unknown>;

    const input = {
      personaId: personaId ? String(personaId) : undefined,
      personaLabel: personaLabel ? String(personaLabel) : undefined,
      personaDescription: personaDescription ? String(personaDescription) : undefined,
      personaPainPoint: personaPainPoint ? String(personaPainPoint) : undefined,
      personaBestCTA: personaBestCTA ? String(personaBestCTA) : undefined,
      topicId: topicId ? String(topicId) : undefined,
      topicTitle: topicTitle ? String(topicTitle) : undefined,
      topicDescription: topicDescription ? String(topicDescription) : undefined,
      objective: objective ? String(objective) : "",
      toneProfile: toneProfile ? String(toneProfile) : "",
    };

    if (mode === "sequence") {
      const draft = await generateSequenceDraft({ ...input, stepCount: Number(stepCount) || 4 });
      res.json({ mode: "sequence", draft });
      return;
    }

    const draft = await generateCampaignDraft(input);
    res.json({ mode: "single", draft });
  } catch (err) {
    req.log.error({ err }, "Error generating AI campaign draft");
    res.status(500).json({ error: "Failed to generate draft — please try again." });
  }
});

export default router;
