import twilio from "twilio";
import type { Request, Response, NextFunction } from "express";

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

let _client: twilio.Twilio | null = null;

export function getTwilio(): twilio.Twilio {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error("Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
    _client = twilio(sid, token);
  }
  return _client;
}

export function getTwilioPhone(): string {
  const n = process.env.TWILIO_PHONE_NUMBER;
  if (!n) throw new Error("TWILIO_PHONE_NUMBER not configured.");
  return n;
}

export function getForwardPhone(): string {
  return process.env.FORWARD_TO_PHONE_NUMBER ?? "";
}

export function getCrmBaseUrl(): string {
  return process.env.CRM_BASE_URL ?? "";
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+")) return raw;
  return `+${digits}`;
}

export const SMS_OPT_OUT_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];

export function isOptOutMessage(body: string): boolean {
  return SMS_OPT_OUT_KEYWORDS.includes(body.trim().toUpperCase());
}

export function isOptInMessage(body: string): boolean {
  return ["START", "YES", "UNSTOP"].includes(body.trim().toUpperCase());
}

// ── Webhook Security ──────────────────────────────────────────────────────────

export type WebhookSecurityMode =
  | "enabled"
  | "development-bypass"
  | "disabled-missing-secret";

export function getWebhookSecurityMode(): WebhookSecurityMode {
  if (!process.env.TWILIO_AUTH_TOKEN) return "disabled-missing-secret";
  if (process.env.NODE_ENV !== "production") return "development-bypass";
  return "enabled";
}

/**
 * Express middleware that validates Twilio's X-Twilio-Signature header.
 *
 * - NODE_ENV !== "production"  → always bypass (dev/test convenience)
 * - TWILIO_AUTH_TOKEN missing in production → reject 403
 * - Production + token present → validate; reject 403 on mismatch
 *
 * The full URL is reconstructed from CRM_BASE_URL + req.originalUrl so that
 * query-string params (e.g. /voice/bridge?leadPhone=…) are included correctly.
 */
export function createWebhookValidator() {
  return function validateTwilioSignature(req: Request, res: Response, next: NextFunction): void {
    const isDev = process.env.NODE_ENV !== "production";

    if (isDev) { next(); return; }

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      res.status(403).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      return;
    }

    const baseUrl = getCrmBaseUrl();
    if (!baseUrl) {
      res.status(403).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      return;
    }

    const signature = String(req.headers["x-twilio-signature"] ?? "");
    const url = `${baseUrl}${req.originalUrl}`;
    const params = (req.body ?? {}) as Record<string, string>;

    if (!twilio.validateRequest(authToken, signature, url, params)) {
      res.status(403).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      return;
    }

    next();
  };
}
