// V5 PR-4: unauthenticated public beta-access request form, plus its admin
// list/update surface.

import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/admin-session.js";
import { isPublicBetaRequestsEnabled, PUBLIC_BETA_REQUESTS_DISABLED_MESSAGE } from "../lib/publicWriteFlags.js";
import { isHoneypotTripped, isImplausiblyFast, HONEYPOT_FIELD } from "../lib/scheduling/publicSchedulingProtection.js";
import { SlidingWindowLimiter, getClientIp } from "../lib/contactProtection.js";
import { createBetaRequest, listBetaRequests, updateBetaRequestStatus } from "../lib/voiceBetaRequests/betaRequestService.js";

const router = Router();

const betaRequestIpLimiter = new SlidingWindowLimiter(5, 60 * 60 * 1000);
setInterval(() => betaRequestIpLimiter.purgeStale(), 5 * 60 * 1000).unref();

const MAX_NAME_LEN = 200;
const MAX_PHONE_LEN = 40;
const MAX_EMAIL_LEN = 200;
const MAX_MESSAGE_LEN = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── POST /api/public/beta-requests ────────────────────────────────────────────

router.post("/public/beta-requests", async (req: Request, res: Response) => {
  // Fail-closed gate. FIRST statement in the handler — ahead of the rate
  // limiter, the honeypot/timing check, validation, and the insert.
  if (!isPublicBetaRequestsEnabled()) {
    res.status(503).json({ error: PUBLIC_BETA_REQUESTS_DISABLED_MESSAGE });
    return;
  }

  const ip = getClientIp(req);
  if (betaRequestIpLimiter.isOverLimit(ip)) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }
  betaRequestIpLimiter.record(ip);

  const body = (req.body ?? {}) as Record<string, unknown>;

  if (isHoneypotTripped(body[HONEYPOT_FIELD]) || isImplausiblyFast(body["formStartedAt"])) {
    // Same generic acknowledgment as a real submission — never a
    // distinguishable "we caught you" response.
    res.status(202).json({ received: true });
    return;
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LEN) : "";
  const businessName = typeof body.businessName === "string" ? body.businessName.trim().slice(0, MAX_NAME_LEN) : "";
  const workEmail = typeof body.workEmail === "string" ? body.workEmail.trim().slice(0, MAX_EMAIL_LEN) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, MAX_PHONE_LEN) || null : null;
  const message = typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LEN) || null : null;
  const source = typeof body.source === "string" && /^[a-z0-9_.-]{1,60}$/.test(body.source) ? body.source : "unspecified";

  if (!name || !businessName || !EMAIL_PATTERN.test(workEmail)) {
    res.status(400).json({ error: "name, businessName, and a valid workEmail are required." });
    return;
  }

  try {
    await createBetaRequest({ name, businessName, workEmail, phone, message, source });
    betaRequestIpLimiter.record(ip);
    res.status(202).json({ received: true });
  } catch (err) {
    req.log.error({ err }, "[public-beta-requests] insert failed");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── Admin: list / update ──────────────────────────────────────────────────────

router.get("/admin/voice/beta-requests", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await listBetaRequests();
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        businessName: r.businessName,
        workEmail: r.workEmail,
        phone: r.phone,
        message: r.message,
        source: r.source,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      count: rows.length,
    });
  } catch (err) {
    req.log.error({ err }, "[admin voice beta-requests] list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/admin/voice/beta-requests/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id." });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await updateBetaRequestStatus(id, body.status);
    if (!result.ok) {
      res.status(result.reason === "not_found" ? 404 : 400).json({
        error: result.reason === "not_found" ? "Not found." : "status must be new, contacted, invited, or declined.",
      });
      return;
    }
    res.json({ item: { id: result.row.id, status: result.row.status } });
  } catch (err) {
    req.log.error({ err }, "[admin voice beta-requests] update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
