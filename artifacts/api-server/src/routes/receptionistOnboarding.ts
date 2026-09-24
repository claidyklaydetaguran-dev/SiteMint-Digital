// V5 PR-5: persistent onboarding-hub progress. Authenticated, firm-scoped —
// firmId always comes from req.firmId (the session), never a request
// parameter, so cross-firm access is structurally impossible.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { getOnboardingState, setOnboardingStep } from "../lib/voiceOnboarding/onboardingService.js";

const router = Router();

function logger(req: Request) {
  return (event: string, fields: Record<string, unknown>) => req.log.warn(fields, `[onboarding] ${event}`);
}

// ── GET /api/receptionist/onboarding ──────────────────────────────────────────

router.get("/receptionist/onboarding", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const state = await getOnboardingState(req.firmId!, { logger: logger(req) });
    res.json({ state });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[onboarding] read failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PUT /api/receptionist/onboarding ──────────────────────────────────────────

router.put("/receptionist/onboarding", requireReceptionistAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await setOnboardingStep(req.firmId!, body.step, body.status, { logger: logger(req) });
    if (!result.ok) {
      res.status(400).json({
        error: result.reason === "invalid_step" ? "step is not a recognized onboarding step." : "status must be pending, done, or blocked.",
      });
      return;
    }
    res.json({ state: result.state });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[onboarding] update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
