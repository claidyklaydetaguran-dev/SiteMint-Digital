/**
 * Twilio webhook signature validation for the AI Intake Agent.
 *
 * Intentionally separate from lib/twilio.ts — the intake product uses its
 * own Twilio credentials (INTAKE_TWILIO_AUTH_TOKEN) and must never touch the
 * CRM's working phone system.
 *
 * Behaviour mirrors createWebhookValidator() in lib/twilio.ts exactly:
 * - NODE_ENV !== "production"         → bypass (dev/curl testing convenience)
 * - Production, token missing         → 403 + empty TwiML
 * - Production, CRM_BASE_URL missing  → 403 + empty TwiML
 * - Production, signature mismatch    → 403 + empty TwiML
 * - Production, signature valid       → next()
 */

import twilio from "twilio";
import type { Request, Response, NextFunction } from "express";

const TWIML_REJECT = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

export function validateIntakeTwilioSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Dev / test bypass — allows plain curl testing without a real signature
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  const authToken = process.env.INTAKE_TWILIO_AUTH_TOKEN;
  if (!authToken) {
    res.status(403).type("text/xml").send(TWIML_REJECT);
    return;
  }

  const baseUrl = process.env.CRM_BASE_URL ?? "";
  if (!baseUrl) {
    res.status(403).type("text/xml").send(TWIML_REJECT);
    return;
  }

  const signature = String(req.headers["x-twilio-signature"] ?? "");
  const url       = `${baseUrl}${req.originalUrl}`;
  const params    = (req.body ?? {}) as Record<string, string>;

  if (!twilio.validateRequest(authToken, signature, url, params)) {
    res.status(403).type("text/xml").send(TWIML_REJECT);
    return;
  }

  next();
}
