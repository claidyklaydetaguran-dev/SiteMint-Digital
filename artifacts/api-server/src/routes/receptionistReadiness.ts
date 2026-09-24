// GET /api/receptionist/readiness — the one answer to "is my receptionist
// ready, and what do I do next?", shared by Setup and the dashboard.
// Read-only and scoped to the signed-in business.

import { Router, type IRouter, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { deriveReadiness } from "../lib/readiness/receptionistReadiness.js";
import { loadReadinessFacts } from "../lib/readiness/readinessFacts.js";

const router: IRouter = Router();

router.get("/receptionist/readiness", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const facts = await loadReadinessFacts(req.firmId!);
    res.set("Cache-Control", "no-store");
    res.json(deriveReadiness(facts));
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[readiness] read failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
