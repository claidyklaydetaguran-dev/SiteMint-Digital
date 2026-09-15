// V5 O-6: cross-firm operator visibility — open issues, usage, and number
// inventory. Reuses the existing per-firm services (voiceIssueService,
// usageService) and voiceNumbers; every route here reads/acts ACROSS firms,
// unlike the firm-scoped receptionist routes.
//
// Auth: `requireOperator` (lib/operatorGate.ts) — a per-person
// `crm_staff_session` with its CSRF check, MFA challenge and named permission,
// OR the legacy shared bearer and the persistent `admin_session` cookie. That
// module explains why both halves are kept and why a live staff session is
// judged with no fallback. It is the same gate every other operator voice
// route uses.

import { Router, type Request, type Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms } from "@workspace/db/schema";
import { voiceIssues, voiceNumbers, voiceUsageLedger } from "@workspace/db/schema/voice";
import { requireOperator } from "../lib/operatorGate.js";
import { resolveVoiceIssue } from "../lib/voiceIssues/voiceIssueService.js";
import { computePeriodYm, loadUsageCapMinutesFromEnv } from "../lib/voiceUsage/usageService.js";

const router = Router();

// ── GET /api/admin/voice/issues ────────────────────────────────────────────────
//
// Permission: `settings.read` — the same class as every other operational
// queue read in this CRM (`/crm/operations/jobs`, `/crm/automation/failures`).
// Every staff role holds it.

router.get("/admin/voice/issues", requireOperator("settings.read"), async (req: Request, res: Response) => {
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

// Permission: `settings.write` — clearing an item off an operational queue,
// the same act as `/crm/operations/deliveries/:id/acknowledge` and
// `/crm/automation/failures/:kind/:id/retry`. Deliberately a step above the
// read: an operations manager can see what is wrong without being able to
// declare it handled.

router.post("/admin/voice/issues/:id/resolve", requireOperator("settings.write"), async (req: Request, res: Response) => {
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

// Permission: `settings.read`. Minutes against each firm's cap are watched in
// order to act (pause, upgrade, stop a runaway assistant) — operational
// monitoring. `reports.read` is this CRM's business-analytics grant.
router.get("/admin/voice/usage", requireOperator("settings.read"), async (req: Request, res: Response) => {
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

// Permission: `settings.read` — number inventory and assignment state, the same
// class of read as `/crm/phone/status`.
router.get("/admin/voice/numbers", requireOperator("settings.read"), async (req: Request, res: Response) => {
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
