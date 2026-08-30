// P7: operational monitoring surface.
//
//   GET /api/readyz  — readiness: can this process serve traffic (db ping)?
//                      Public-safe: status only, no data.
//   GET /api/metricz — operator metrics: aggregate counters only, and only
//                      with the VOICE_METRICS_TOKEN bearer. Fail-closed:
//                      no token configured means the endpoint does not
//                      exist (404), never an open endpoint.
//
// /api/healthz (liveness) already exists in health.ts and stays untouched.

import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";

export const VOICE_METRICS_TOKEN_ENV_VAR = "VOICE_METRICS_TOKEN";

const STARTED_AT = Date.now();

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time bearer check over fixed-width digests (adminPassword pattern). */
export function metricsTokenMatches(header: unknown, configured: string): boolean {
  if (typeof header !== "string") return false;
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match || typeof match[1] !== "string") return false;
  return crypto.timingSafeEqual(digest(match[1]), digest(configured));
}

/**
 * The complete /metricz admission decision, pure for tests. Fail-closed:
 * no token configured (or a trivially short one) means the endpoint does
 * not exist — never an open metrics surface.
 */
export function metricsGateDecision(
  authHeader: unknown,
  env: Record<string, string | undefined>,
): "not_found" | "unauthorized" | "ok" {
  const configured = env[VOICE_METRICS_TOKEN_ENV_VAR];
  if (typeof configured !== "string" || configured.trim().length < 16) return "not_found";
  return metricsTokenMatches(authHeader, configured) ? "ok" : "unauthorized";
}

export interface MonitoringDeps {
  /** Round-trips the database; throws (or rejects) when it cannot. */
  pingDatabase: () => Promise<void>;
  countEventsSince: (since: Date) => Promise<number>;
  countLedgerRowsSince: (since: Date) => Promise<number>;
  countUnresolvedIssues: () => Promise<number>;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

async function productionMonitoringDeps(): Promise<MonitoringDeps> {
  const { db, pool } = await import("@workspace/db");
  const { providerWebhookEvents, voiceIssues, voiceUsageLedger } = await import("@workspace/db/schema/voice");
  const { gte, isNull, sql } = await import("drizzle-orm");
  return {
    pingDatabase: async () => {
      await pool.query("SELECT 1");
    },
    countEventsSince: async (since) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(providerWebhookEvents)
        .where(gte(providerWebhookEvents.createdAt, since));
      return row?.count ?? 0;
    },
    countLedgerRowsSince: async (since) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(voiceUsageLedger)
        .where(gte(voiceUsageLedger.createdAt, since));
      return row?.count ?? 0;
    },
    countUnresolvedIssues: async () => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(voiceIssues)
        .where(isNull(voiceIssues.resolvedAt));
      return row?.count ?? 0;
    },
  };
}

export function createMonitoringRouter(depsOverride?: MonitoringDeps): IRouter {
  const router: IRouter = Router();

  async function deps(): Promise<MonitoringDeps> {
    return depsOverride ?? (await productionMonitoringDeps());
  }

  router.get("/readyz", async (_req: Request, res: Response) => {
    try {
      const resolved = await deps();
      await resolved.pingDatabase();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });

  router.get("/metricz", async (req: Request, res: Response) => {
    const resolved = await deps().catch(() => undefined);
    const env = resolved?.env ?? process.env;
    const decision = metricsGateDecision(req.headers.authorization, env);
    if (decision === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (decision === "unauthorized") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!resolved) {
      res.status(503).json({ error: "Metrics unavailable" });
      return;
    }
    try {
      const now = resolved.now?.() ?? new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      let databaseOk = true;
      try {
        await resolved.pingDatabase();
      } catch {
        databaseOk = false;
      }
      // Aggregate, whole-platform counters only — never per-firm or
      // per-caller data on this surface.
      res.json({
        uptimeSec: Math.round((now.getTime() - STARTED_AT) / 1000),
        databaseOk,
        webhookEvents24h: databaseOk ? await resolved.countEventsSince(dayAgo) : null,
        usageLedgerRows24h: databaseOk ? await resolved.countLedgerRowsSince(dayAgo) : null,
        unresolvedIssues: databaseOk ? await resolved.countUnresolvedIssues() : null,
      });
    } catch {
      res.status(503).json({ error: "Metrics unavailable" });
    }
  });

  return router;
}

export default createMonitoringRouter();
