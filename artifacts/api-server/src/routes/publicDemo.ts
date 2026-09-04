// V5 blueprint §10: the controlled live-demo seam. Fail-closed by
// construction — see lib/publicDemo/demoConfig.ts and demoSessionProvider.ts.
// This file imports ONLY the DemoSessionProvider abstraction; it must never
// import a Vapi type, URL, SDK, or credential, and must never import from
// lib/voice/ (CLAUDE.md reserves that to the real voice platform).

import { Router, type Request, type Response } from "express";
import { isPublicDemoEnabled, PUBLIC_DEMO_DISABLED_MESSAGE } from "../lib/publicDemo/demoConfig.js";
import { requestDemoSession, DEMO_VISITOR_COOKIE } from "../lib/publicDemo/demoSessionService.js";

const router = Router();

// ── POST /api/public/demo/session ─────────────────────────────────────────────

router.post("/public/demo/session", async (req: Request, res: Response) => {
  // Fail-closed gate. FIRST statement in the handler: no cookie parsing, no
  // rate-limit check, no concurrency/budget accounting, and no provider
  // call can happen while the demo is off.
  if (!isPublicDemoEnabled()) {
    res.status(503).json({ error: PUBLIC_DEMO_DISABLED_MESSAGE });
    return;
  }
  try {
    const cookieHeaderValue = (req.cookies as Record<string, string | undefined> | undefined)?.[DEMO_VISITOR_COOKIE];
    const ip = req.headers["x-forwarded-for"];
    const clientIp = typeof ip === "string" ? ip.split(",")[0]!.trim() : Array.isArray(ip) ? ip[0]! : (req.socket.remoteAddress ?? "unknown");

    const result = await requestDemoSession({ ip: clientIp, cookieHeaderValue });

    if (!result.ok) {
      // Every refusal reason (not configured, at concurrency cap, over daily
      // budget, one-per-24h already used) answers with the SAME generic
      // message — a caller cannot distinguish "off" from "temporarily full".
      res.status(503).json({ error: PUBLIC_DEMO_DISABLED_MESSAGE });
      return;
    }

    res.cookie(DEMO_VISITOR_COOKIE, result.setCookieValue, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.status(201).json({
      sessionId: result.providerSessionId,
      expiresInSeconds: result.expiresInSeconds,
    });
  } catch (err) {
    req.log.error({ err }, "[public-demo] session request failed");
    res.status(503).json({ error: PUBLIC_DEMO_DISABLED_MESSAGE });
  }
});

export default router;
