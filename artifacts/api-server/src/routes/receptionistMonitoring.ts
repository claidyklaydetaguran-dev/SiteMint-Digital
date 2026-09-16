// P7: firm-facing operations surface — open issues (list/resolve), staff
// call reviews (set/clear/list), and the usage picture for a period.
// Authenticated, firm-scoped; nothing here reaches a provider.

import { Router, type IRouter, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  customerResolveDecision,
  findOpenVoiceIssue,
  isCustomerResolvableIssueCode,
  listOpenVoiceIssues,
  OPERATOR_ONLY_ISSUE_MESSAGE,
  resolveVoiceIssue,
} from "../lib/voiceIssues/voiceIssueService.js";
import { setCallReview, clearCallReview, listCallReviews } from "../lib/voiceReviews/reviewService.js";
import {
  aggregateUsageByChannelForPeriod,
  aggregateUsageForPeriod,
  computePeriodYm,
  resolveIncludedMinutesForFirmOrEnv,
  type UsageChannelBreakdown,
} from "../lib/voiceUsage/usageService.js";

const router: IRouter = Router();

const VAPI_PROVIDER = "vapi";
const PERIOD_SHAPE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

// ── issues ───────────────────────────────────────────────────────────────────

router.get("/receptionist/voice/issues", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const issues = await listOpenVoiceIssues(req.firmId!);
    res.json({
      items: issues.map((issue) => ({
        id: issue.id,
        level: issue.level,
        code: issue.code,
        message: issue.message,
        occurrences: typeof issue.context["occurrences"] === "number" ? issue.context["occurrences"] : 1,
        // Whether the resolve route below will accept this one. The dashboard
        // reads this rather than keeping its own copy of the allowlist.
        customerResolvable: isCustomerResolvableIssueCode(issue.code),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      })),
      count: issues.length,
    });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[monitoring] issue list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/receptionist/voice/issues/:id/resolve", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid issue id." });
    return;
  }
  try {
    // Firm-scoped lookup first: another firm's issue is a 404, exactly like a
    // missing one, and is never classified. Only then is the code checked —
    // operator-level issues (billing suspension, usage pause, platform faults)
    // are not the customer's to clear. See CUSTOMER_RESOLVABLE_ISSUE_CODES.
    const decision = customerResolveDecision(await findOpenVoiceIssue(req.firmId!, id));
    if (decision === "not_found") {
      res.status(404).json({ error: "Issue not found or already resolved." });
      return;
    }
    if (decision === "operator_only") {
      res.status(403).json({ error: OPERATOR_ONLY_ISSUE_MESSAGE });
      return;
    }
    const resolved = await resolveVoiceIssue(req.firmId!, id);
    if (!resolved) {
      res.status(404).json({ error: "Issue not found or already resolved." });
      return;
    }
    res.json({ issue: { id: resolved.id, resolvedAt: resolved.resolvedAt } });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[monitoring] issue resolve failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── call reviews ─────────────────────────────────────────────────────────────

router.get("/receptionist/voice/call-reviews", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const reviews = await listCallReviews(req.firmId!);
    res.json({ items: reviews, count: reviews.length });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[monitoring] review list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.put("/receptionist/voice/calls/:callId/review", requireReceptionistAuth, async (req: Request, res: Response) => {
  const callId = typeof req.params.callId === "string" ? req.params.callId : "";
  if (callId.length === 0 || callId.length > 200) {
    res.status(400).json({ error: "Invalid call id." });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await setCallReview(req.firmId!, VAPI_PROVIDER, callId, body.state, body.note);
    if (!result.ok) {
      if (result.reason === "call_not_found") {
        res.status(404).json({ error: "Call not found." });
      } else {
        res.status(400).json({ error: result.reason === "invalid_state" ? "state must be 'reviewed' or 'flagged'." : "note must be a string of at most 500 characters." });
      }
      return;
    }
    res.json({ review: result.review });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[monitoring] review set failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/receptionist/voice/calls/:callId/review", requireReceptionistAuth, async (req: Request, res: Response) => {
  const callId = typeof req.params.callId === "string" ? req.params.callId : "";
  if (callId.length === 0 || callId.length > 200) {
    res.status(400).json({ error: "Invalid call id." });
    return;
  }
  try {
    const removed = await clearCallReview(req.firmId!, VAPI_PROVIDER, callId);
    if (!removed) {
      res.status(404).json({ error: "No review to clear." });
      return;
    }
    res.status(204).end();
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[monitoring] review clear failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── usage ────────────────────────────────────────────────────────────────────

router.get("/receptionist/voice/usage", requireReceptionistAuth, async (req: Request, res: Response) => {
  const raw = typeof req.query.period === "string" ? req.query.period : undefined;
  const period = raw ?? computePeriodYm(new Date());
  if (!PERIOD_SHAPE.test(period)) {
    res.status(400).json({ error: "period must look like YYYY-MM." });
    return;
  }
  try {
    const usage = await aggregateUsageForPeriod(req.firmId!, period);
    let capMinutes: number | null = null;
    try {
      // Plan-resolved minutes when a plan catalog is configured; otherwise the
      // flat VOICE_USAGE_INCLUDED_MINUTES value, exactly as before.
      capMinutes = await resolveIncludedMinutesForFirmOrEnv(req.firmId!);
    } catch {
      capMinutes = null; // malformed cap config is an ops problem, not a customer-visible error
    }
    let channels: UsageChannelBreakdown | null = null;
    try {
      channels = await aggregateUsageByChannelForPeriod(req.firmId!, period);
    } catch {
      // The breakdown is additive. A firm must still get its usage total even
      // if the per-channel read fails, so this never fails the request.
      channels = null;
    }
    res.json({
      period,
      callCount: usage.callCount,
      totalSeconds: usage.totalSeconds,
      includedMinutes: capMinutes,
      channels,
    });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[monitoring] usage read failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
