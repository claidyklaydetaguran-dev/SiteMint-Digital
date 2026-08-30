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

export default router;
