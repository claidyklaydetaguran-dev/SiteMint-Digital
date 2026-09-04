// V5 O-6: cross-firm operator visibility — open issues, usage, and number
// inventory. Reuses the existing per-firm services (voiceIssueService,
// usageService) and voiceNumbers; every route here is admin-authenticated
// (cookie-or-bearer, lib/admin-session.ts) and reads/acts ACROSS firms,
// unlike the firm-scoped receptionist routes.

import { Router, type Request, type Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms } from "@workspace/db/schema";
import { voiceIssues, voiceNumbers, voiceUsageLedger } from "@workspace/db/schema/voice";
import { requireAdmin } from "../lib/admin-session.js";
import { resolveVoiceIssue } from "../lib/voiceIssues/voiceIssueService.js";
import { computePeriodYm, loadUsageCapMinutesFromEnv } from "../lib/voiceUsage/usageService.js";

const router = Router();

// ── GET /api/admin/voice/issues ────────────────────────────────────────────────

router.get("/admin/voice/issues", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: voiceIssues.id,
        firmId: voiceIssues.firmId,
        firmName: intakeFirms.name,
        level: voiceIssues.level,
        code: voiceIssues.code,
        message: voiceIssues.message,
        createdAt: voiceIssues.createdAt,
        updatedAt: voiceIssues.updatedAt,
      })
      .from(voiceIssues)
      .innerJoin(intakeFirms, eq(intakeFirms.id, voiceIssues.firmId))
      .where(isNull(voiceIssues.resolvedAt))
      .orderBy(desc(voiceIssues.createdAt))
      .limit(500);
    res.json({
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
      count: rows.length,
    });
  } catch (err) {
    req.log.error({ err }, "[admin voice issues] list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/voice/issues/:id/resolve", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid issue id." });
    return;
  }
  try {
    const [row] = await db.select({ firmId: voiceIssues.firmId }).from(voiceIssues).where(eq(voiceIssues.id, id)).limit(1);
    if (!row) {
      res.status(404).json({ error: "Issue not found." });
      return;
    }
    const resolved = await resolveVoiceIssue(row.firmId, id);
    if (!resolved) {
      res.status(404).json({ error: "Issue not found or already resolved." });
      return;
    }
    res.json({ issue: { id: resolved.id, resolvedAt: resolved.resolvedAt?.toISOString() ?? null } });
  } catch (err) {
    req.log.error({ err, issueId: id }, "[admin voice issues] resolve failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/admin/voice/usage ────────────────────────────────────────────────

router.get("/admin/voice/usage", requireAdmin, async (req: Request, res: Response) => {
  try {
    const periodParam = typeof req.query["period"] === "string" ? (req.query["period"] as string) : undefined;
    const period = periodParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam) ? periodParam : computePeriodYm(new Date());

    let includedMinutes: number | null = null;
    try {
      includedMinutes = loadUsageCapMinutesFromEnv();
    } catch {
      includedMinutes = null; // malformed cap config is an ops problem surfaced by envContract, not a reason to 500 here
    }

    const rows = await db
      .select({
        firmId: intakeFirms.id,
        firmName: intakeFirms.name,
        callCount: sql<number>`coalesce(count(${voiceUsageLedger.id}), 0)::int`,
        totalSeconds: sql<number>`coalesce(sum(${voiceUsageLedger.durationSec}), 0)::int`,
      })
      .from(intakeFirms)
      .innerJoin(
        voiceUsageLedger,
        and(eq(voiceUsageLedger.firmId, intakeFirms.id), eq(voiceUsageLedger.periodYm, period)),
      )
      .groupBy(intakeFirms.id, intakeFirms.name)
      .orderBy(desc(sql`coalesce(sum(${voiceUsageLedger.durationSec}), 0)`));

    res.json({
      period,
      items: rows.map((r) => ({
        firmId: r.firmId,
        firmName: r.firmName,
        callCount: r.callCount,
        totalSeconds: r.totalSeconds,
        includedMinutes,
        capState: includedMinutes !== null && r.totalSeconds > includedMinutes * 60 ? "over_cap" : "within_cap",
      })),
    });
  } catch (err) {
    req.log.error({ err }, "[admin voice usage] failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/admin/voice/numbers ──────────────────────────────────────────────

router.get("/admin/voice/numbers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: voiceNumbers.id,
        firmId: voiceNumbers.firmId,
        firmName: intakeFirms.name,
        phoneE164: voiceNumbers.phoneE164,
        state: voiceNumbers.state,
        assignedAssistantId: voiceNumbers.assignedAssistantId,
      })
      .from(voiceNumbers)
      .leftJoin(intakeFirms, eq(intakeFirms.id, voiceNumbers.firmId))
      .orderBy(desc(voiceNumbers.updatedAt))
      .limit(500);
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        firmId: r.firmId,
        firmName: r.firmName,
        // phoneNumberDisplay: presentation-only masking is intentionally NOT
        // applied here — this is an internal operator surface, not a browser
        // DTO subject to the provider-id confinement rule (which governs
        // providerNumberId, never the E.164 number itself).
        phoneNumberDisplay: r.phoneE164,
        state: r.state,
        assistantId: r.assignedAssistantId,
      })),
      count: rows.length,
    });
  } catch (err) {
    req.log.error({ err }, "[admin voice numbers] failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
