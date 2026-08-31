import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// R5: the API root is what Replit's platform probe requests. Without a handler
// it fell through every mounted route to Express's default finalhandler, which
// answers 404 (an HTML error page) — read by the platform as an unhealthy
// deployment. This is an explicit route for exactly "/" under the "/api" mount,
// NOT a catch-all: unknown paths below /api still 404 as before.
//
// Deliberately side-effect-free — no database query, no session, no outbound
// request, and no environment, version or build detail in the body. Express
// answers HEAD from this GET handler, sending the headers with no body.
// Liveness only; readiness (which does ping the database) stays at
// /api/readyz in routes/monitoring.ts and is unchanged.
router.get("/", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
