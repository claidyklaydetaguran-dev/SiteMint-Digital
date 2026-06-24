import twilio from "twilio";

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
