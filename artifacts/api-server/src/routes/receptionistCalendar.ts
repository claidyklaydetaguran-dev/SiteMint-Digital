// P4: per-firm Google Calendar connect/disconnect. Authenticated,
// firm-scoped, and DISABLED by default — every route answers 503 until
// CALENDAR_CONNECT_ENABLED="true" AND the OAuth config + token key are
// valid, so no environment can half-offer the flow.
//
// The callback carries the user's session cookie (same-origin redirect), so
// firm identity comes from the session exactly like every other receptionist
// route; the state parameter is validated against a one-time, firm-scoped,
// hashed record created by /start. Raw tokens never touch a log, an error
// body, or the database (AES-256-GCM envelopes only).

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  buildGoogleAuthUrl,
  exchangeAuthorizationCode,
  generateOauthState,
  generatePkcePair,
  hashOauthState,
  isCalendarConnectEnabled,
  loadGoogleOAuthConfig,
} from "../lib/calendar/googleOAuth.js";
import { encryptToken, decryptToken, loadCalendarTokenKey } from "../lib/calendar/tokenCrypto.js";
import {
  createOauthState,
  consumeOauthState,
  upsertConnection,
  markConnectionRevoked,
  getActiveConnection,
} from "../lib/calendar/calendarConnectionsRepository.js";
import {
  approveRequestToBooked,
  cancelBookedRequest,
  rescheduleBookedRequest,
  reconcileCalendarForFirm,
  isCalendarWriteEnabled,
} from "../lib/calendar/calendarEventSync.js";
import { calendarSyncDeps } from "../lib/calendar/calendarSyncDeps.js";

const router = Router();

const DASHBOARD_SETTINGS_PATH = "/ai-receptionist/dashboard/settings";

function featureUnavailable(res: Response): void {
  res.status(503).json({ error: "Calendar connection is not currently available." });
}

function loadPrerequisites():
  | { ok: true; config: ReturnType<typeof loadGoogleOAuthConfig>; key: Buffer }
  | { ok: false } {
  if (!isCalendarConnectEnabled()) return { ok: false };
  try {
    return { ok: true, config: loadGoogleOAuthConfig(), key: loadCalendarTokenKey() };
  } catch {
    return { ok: false };
  }
}

// ── POST /api/receptionist/calendar/google/start ─────────────────────────────

router.post("/receptionist/calendar/google/start", requireReceptionistAuth, async (req: Request, res: Response) => {
  const prerequisites = loadPrerequisites();
  if (!prerequisites.ok) {
    featureUnavailable(res);
    return;
  }
  try {
    const state = generateOauthState();
    const pkce = generatePkcePair();
    await createOauthState(req.firmId!, hashOauthState(state), encryptToken(pkce.verifier, prerequisites.key));
    const authorizeUrl = buildGoogleAuthUrl(prerequisites.config, state, pkce.challenge);
    res.json({ authorizeUrl });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[calendar] start failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/receptionist/calendar/google/callback ───────────────────────────

router.get("/receptionist/calendar/google/callback", requireReceptionistAuth, async (req: Request, res: Response) => {
  const prerequisites = loadPrerequisites();
  if (!prerequisites.ok) {
    featureUnavailable(res);
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  if (!code || !state) {
    res.redirect(`${DASHBOARD_SETTINGS_PATH}?calendar=error`);
    return;
  }
  try {
    const stored = await consumeOauthState(req.firmId!, hashOauthState(state));
    if (!stored) {
      req.log.warn({ firmId: req.firmId }, "[calendar] callback with unknown or reused state");
      res.redirect(`${DASHBOARD_SETTINGS_PATH}?calendar=error`);
      return;
    }
    const verifier = decryptToken(stored.codeVerifierEnc, prerequisites.key);
    const exchanged = await exchangeAuthorizationCode(prerequisites.config, code, verifier);
    if (!exchanged.ok || !exchanged.refreshToken) {
      req.log.warn({ firmId: req.firmId, ok: exchanged.ok }, "[calendar] code exchange failed or returned no refresh token");
      res.redirect(`${DASHBOARD_SETTINGS_PATH}?calendar=error`);
      return;
    }
    await upsertConnection({
      firmId: req.firmId!,
      refreshTokenEnc: encryptToken(exchanged.refreshToken, prerequisites.key),
      accessTokenEnc: encryptToken(exchanged.accessToken, prerequisites.key),
      accessTokenExpiresAt: new Date(Date.now() + exchanged.expiresInSec * 1000),
      scope: exchanged.scope ?? "",
    });
    res.redirect(`${DASHBOARD_SETTINGS_PATH}?calendar=connected`);
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[calendar] callback failed");
    res.redirect(`${DASHBOARD_SETTINGS_PATH}?calendar=error`);
  }
});

// ── DELETE /api/receptionist/calendar/connection ─────────────────────────────

router.delete("/receptionist/calendar/connection", requireReceptionistAuth, async (req: Request, res: Response) => {
  // Disconnect works even when connect is disabled — an owner must always be
  // able to sever a stored connection.
  try {
    const existing = await getActiveConnection(req.firmId!);
    if (!existing) {
      res.status(404).json({ error: "No calendar connection." });
      return;
    }
    await markConnectionRevoked(req.firmId!);
    res.json({ disconnected: true });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[calendar] disconnect failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/receptionist/calendar/requests/:publicId/approve ───────────────
//
// The approval action — the only reachable path that writes a calendar event.
// It lives on the CALENDAR router rather than the availability router on
// purpose: appointmentsContract.test.ts pins that router to exactly the ten
// endpoints the appointments page calls and explicitly forbids an approve
// endpoint there, and this is calendar-domain work regardless.
//
// Authenticated and firm-scoped like every sibling: the firm comes from the
// session, never from the request. All the hard parts — the
// CALENDAR_WRITE_ENABLED gate, the single event write, the status-guarded
// atomic stamp, and the delete-on-lost-race compensation — already live in
// approveRequestToBooked; this only maps an outcome to a status code.
//
// The response body is deliberately coarse: an operator learns what to do
// next without it ever carrying a provider event id, calendar id, token, or
// caller detail.

const APPROVE_STATUS: Record<string, number> = {
  booked: 200,
  disabled: 503,
  no_connection: 409,
  not_found: 404,
  not_approvable: 409,
  event_write_failed: 502,
  conflict_after_write: 409,
};

router.post("/receptionist/calendar/requests/:publicId/approve", requireReceptionistAuth, async (req: Request, res: Response) => {
  const firmId = req.firmId!;
  try {
    const outcome = await approveRequestToBooked(firmId, req.params.publicId as string, calendarSyncDeps());
    req.log.info({ firmId, outcome }, "[calendar] appointment approval");
    res
      .status(APPROVE_STATUS[outcome] ?? 500)
      .json(outcome === "booked" ? { ok: true, status: "booked" } : { ok: false, reason: outcome });
  } catch (err) {
    req.log.error(
      { firmId, errorClass: err instanceof Error ? err.name : "unknown" },
      "[calendar] appointment approval failed",
    );
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/receptionist/calendar/requests/:publicId/cancel ────────────────
//
// The booked-row cancel. The availability router's cancel is deliberately
// pending/held-only (its repository function is shared with the voice tool
// dispatcher), so until this route existed nothing in the application could
// cancel a booked appointment at all. Firm-scoped like approve; the DB
// cancellation always proceeds, event removal is best-effort with an issue +
// reconciliation as the backstop. A repeat cancel finds the row no longer
// booked and changes nothing (409 not_booked).

const CANCEL_BOOKED_STATUS: Record<string, number> = {
  cancelled: 200,
  not_found: 404,
  not_booked: 409,
  conflict: 409,
};

router.post("/receptionist/calendar/requests/:publicId/cancel", requireReceptionistAuth, async (req: Request, res: Response) => {
  const firmId = req.firmId!;
  try {
    const result = await cancelBookedRequest(firmId, req.params.publicId as string, calendarSyncDeps());
    req.log.info({ firmId, ...result }, "[calendar] booked cancel");
    res
      .status(CANCEL_BOOKED_STATUS[result.outcome] ?? 500)
      .json(
        result.outcome === "cancelled"
          ? { ok: true, status: "cancelled", calendar: result.calendar }
          : { ok: false, reason: result.outcome },
      );
  } catch (err) {
    req.log.error(
      { firmId, errorClass: err instanceof Error ? err.name : "unknown" },
      "[calendar] booked cancel failed",
    );
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/receptionist/calendar/requests/:publicId/reschedule ────────────
//
// The booked-row reschedule, replacement-request model: a new fully-validated
// pending_review request at the new time (approved separately through the
// normal approve path), the old row moved booked→rescheduled by a guarded
// UPDATE, and the old event removed best-effort. An unavailable slot or a
// lost race changes nothing durable.

const RESCHEDULE_STATUS: Record<string, number> = {
  rescheduled: 200,
  not_found: 404,
  not_booked: 409,
  slot_unavailable: 409,
  conflict: 409,
};

router.post("/receptionist/calendar/requests/:publicId/reschedule", requireReceptionistAuth, async (req: Request, res: Response) => {
  const firmId = req.firmId!;
  const { startUtc } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof startUtc !== "string" || Number.isNaN(new Date(startUtc).getTime())) {
    res.status(400).json({ error: "startUtc must be a valid ISO datetime" });
    return;
  }
  try {
    const result = await rescheduleBookedRequest(firmId, req.params.publicId as string, new Date(startUtc), calendarSyncDeps());
    req.log.info({ firmId, outcome: result.outcome, calendar: result.calendar }, "[calendar] booked reschedule");
    res
      .status(RESCHEDULE_STATUS[result.outcome] ?? 500)
      .json(
        result.outcome === "rescheduled" && result.replacement
          ? {
              ok: true,
              status: "rescheduled",
              calendar: result.calendar,
              replacement: {
                id: result.replacement.publicId,
                startUtc: result.replacement.startUtc.toISOString(),
                endUtc: result.replacement.endUtc.toISOString(),
              },
            }
          : { ok: false, reason: result.outcome },
      );
  } catch (err) {
    req.log.error(
      { firmId, errorClass: err instanceof Error ? err.name : "unknown" },
      "[calendar] booked reschedule failed",
    );
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/receptionist/calendar/reconcile ────────────────────────────────
//
// Recovery for the one gap the happy paths cannot close: a request that left
// the calendar-worthy world without its event being removed — a voice-tool
// reschedule or cancel that goes through the repository rather than a route,
// or a delete that failed once. Deleting an event twice is safe (the writer
// treats 404/410 as success), so this is repeatable by design.

router.post("/receptionist/calendar/reconcile", requireReceptionistAuth, async (req: Request, res: Response) => {
  const firmId = req.firmId!;
  try {
    if (!isCalendarWriteEnabled()) {
      res.status(503).json({ ok: false, reason: "disabled" });
      return;
    }
    const summary = await reconcileCalendarForFirm(firmId, calendarSyncDeps());
    req.log.info({ firmId, ...summary }, "[calendar] reconcile");
    res.json({ ok: true, ...summary });
  } catch (err) {
    req.log.error(
      { firmId, errorClass: err instanceof Error ? err.name : "unknown" },
      "[calendar] reconcile failed",
    );
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
