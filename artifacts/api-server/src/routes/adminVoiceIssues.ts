// V5 O-6: cross-firm operator visibility — open issues, usage, and number
// inventory. Reuses the existing per-firm services (voiceIssueService,
// usageService) and voiceNumbers; every route here reads/acts ACROSS firms,
// unlike the firm-scoped receptionist routes.
//
// Auth: a per-person `crm_staff_session` with its CSRF check, MFA challenge and
// named permission, OR — unchanged from before — the legacy shared bearer and
// the `admin_session` cookie (lib/admin-session.ts). See `orLegacyAdminSession`
// below for why both halves are kept.

import { Router, type Request, type RequestHandler, type Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms } from "@workspace/db/schema";
import { voiceIssues, voiceNumbers, voiceUsageLedger } from "@workspace/db/schema/voice";
import { resolveAdminAuthMode } from "../lib/admin-session.js";
import { legacyBearerEnabled, requireCrmAuth, resolveStaffSession } from "../lib/staffAuth.js";
import { resolveVoiceIssue } from "../lib/voiceIssues/voiceIssueService.js";
import { computePeriodYm, loadUsageCapMinutesFromEnv } from "../lib/voiceUsage/usageService.js";

const router = Router();

/**
 * Keeps this file's pre-existing admin modes while putting the CRM staff gate
 * in front of them.
 *
 * Unlike its sibling operator files, the guard here was never bearer-only: it
 * also accepted the persistent `admin_session` cookie, which is what keeps the
 * Issues / Usage / Numbers pages (and Resolve) working for a shared-password
 * admin after a server restart has discarded the in-memory bearer. Swapping
 * straight to `requireCrmAuth` would have signed that caller out of pages that
 * work today, so the fallback stays exactly as wide as it already was — and no
 * wider.
 *
 * Order matters and is the security-relevant part: a request that resolves to
 * a LIVE `crm_staff_session` is judged by the CRM gate as that person, with NO
 * fallback. Otherwise a staff member who lacks the named permission could be
 * waved through on a shared credential their browser also happens to hold,
 * which would make the permission decorative. (`requireCrmAuth` already applies
 * the same rule to the shared bearer.)
 *
 * A staff cookie that resolves to nobody — idle-expired, revoked, from before a
 * sign-out-everywhere, or forged — carries no identity to judge, so it neither
 * grants nor blocks anything: the request is treated exactly like one without
 * it. Keying the decision on the cookie's mere presence would sign a
 * shared-password admin out of these pages for having once signed in as
 * themselves in the same browser.
 *
 * The fallback also honours `CRM_LEGACY_BEARER_ENABLED`, which the older guard
 * did not: flipping it retires the shared credential, in both its bearer and
 * its cookie form, on this surface together with every `requireCrmAuth` route.
 * Routes that still use lib/admin-session.ts's own `requireAdmin` (the invite
 * and beta-request queues, the discovery submissions) do not read the flag.
 */
function orLegacyAdminSession(gate: RequestHandler): RequestHandler {
  return async function adminOpsGate(req, res, next) {
    // A live session is resolved a second time inside `gate`. That is the price
    // of reusing the gate unmodified, which keeps its CSRF, MFA and permission
    // rules in exactly one place; these are low-traffic operator routes.
    const staff = await resolveStaffSession(req);
    if (!staff && legacyBearerEnabled() && (await resolveAdminAuthMode(req))) {
      next();
      return;
    }
    await gate(req, res, next);
  };
}

// ── GET /api/admin/voice/issues ────────────────────────────────────────────────
//
// Permission: `settings.read` — the same class as every other operational
// queue read in this CRM (`/crm/operations/jobs`, `/crm/automation/failures`).
// Every staff role holds it.

router.get("/admin/voice/issues", orLegacyAdminSession(requireCrmAuth("settings.read")), async (req: Request, res: Response) => {
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

router.post("/admin/voice/issues/:id/resolve", orLegacyAdminSession(requireCrmAuth("settings.write")), async (req: Request, res: Response) => {
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
router.get("/admin/voice/usage", orLegacyAdminSession(requireCrmAuth("settings.read")), async (req: Request, res: Response) => {
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
router.get("/admin/voice/numbers", orLegacyAdminSession(requireCrmAuth("settings.read")), async (req: Request, res: Response) => {
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
