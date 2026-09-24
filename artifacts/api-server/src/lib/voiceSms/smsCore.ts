// P5: the voice channel's SMS core — configuration (with a structural
// guarantee that the intake pipeline's credentials can never be reused),
// Twilio webhook signature verification, and the outbound transport. All
// DISABLED by default; no code path can send without VOICE_SMS_ENABLED and
// a complete, distinct credential set.

import { createHmac, timingSafeEqual } from "node:crypto";

export const VOICE_SMS_ENABLED_ENV_VAR = "VOICE_SMS_ENABLED";
export const VOICE_TWILIO_ACCOUNT_SID_ENV_VAR = "VOICE_TWILIO_ACCOUNT_SID";
export const VOICE_TWILIO_AUTH_TOKEN_ENV_VAR = "VOICE_TWILIO_AUTH_TOKEN";
export const VOICE_TWILIO_FROM_NUMBER_ENV_VAR = "VOICE_TWILIO_FROM_NUMBER";

export function isVoiceSmsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[VOICE_SMS_ENABLED_ENV_VAR] === "true";
}

export class VoiceSmsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceSmsConfigError";
  }
}

export interface VoiceSmsConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

/**
 * Fail-closed loader. Beyond presence checks, it enforces the binding
 * Twilio/SMS safety rule STRUCTURALLY: if any voice credential value equals
 * the corresponding intake credential value, or the from-number equals the
 * intake number, loading fails — the intake pipeline's number and
 * credentials can never be driven by voice code even by misconfiguration.
 */
export function loadVoiceSmsConfig(env: Record<string, string | undefined> = process.env): VoiceSmsConfig {
  const accountSid = env[VOICE_TWILIO_ACCOUNT_SID_ENV_VAR];
  const authToken = env[VOICE_TWILIO_AUTH_TOKEN_ENV_VAR];
  const fromNumber = env[VOICE_TWILIO_FROM_NUMBER_ENV_VAR];
  if (!accountSid) throw new VoiceSmsConfigError(`${VOICE_TWILIO_ACCOUNT_SID_ENV_VAR} is not set.`);
  if (!authToken) throw new VoiceSmsConfigError(`${VOICE_TWILIO_AUTH_TOKEN_ENV_VAR} is not set.`);
  if (!fromNumber || !fromNumber.startsWith("+")) {
    throw new VoiceSmsConfigError(`${VOICE_TWILIO_FROM_NUMBER_ENV_VAR} must be set in E.164 form.`);
  }
  if (env["INTAKE_TWILIO_ACCOUNT_SID"] && env["INTAKE_TWILIO_ACCOUNT_SID"] === accountSid) {
    throw new VoiceSmsConfigError("Voice SMS must not reuse the intake Twilio account.");
  }
  if (env["INTAKE_TWILIO_AUTH_TOKEN"] && env["INTAKE_TWILIO_AUTH_TOKEN"] === authToken) {
    throw new VoiceSmsConfigError("Voice SMS must not reuse the intake Twilio auth token.");
  }
  if (env["INTAKE_TWILIO_FROM_NUMBER"] && env["INTAKE_TWILIO_FROM_NUMBER"] === fromNumber) {
    throw new VoiceSmsConfigError("Voice SMS must not use the intake SMS number.");
  }
  return { accountSid, authToken, fromNumber };
}

// ── Twilio webhook signature (X-Twilio-Signature) ────────────────────────────
// Algorithm per Twilio's documented scheme: HMAC-SHA1 over the full URL with
// the POST parameters appended in lexicographic key order, base64-encoded.

export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params), "utf8");
  const provided = Buffer.from(signatureHeader, "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// ── outbound transport ───────────────────────────────────────────────────────

export const TWILIO_API_HOST = "https://api.twilio.com";

export type SmsSendResult =
  | { ok: true; providerMessageSid: string }
  | { ok: false; retryable: boolean; errorCode: string };

export type SmsTransport = (config: VoiceSmsConfig, to: string, body: string) => Promise<SmsSendResult>;

/** Production transport: pinned Twilio host, basic auth, one message per call. */
export const defaultSmsTransport: SmsTransport = async (config, to, body) => {
  const url = `${TWILIO_API_HOST}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`, "utf8").toString("base64");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: config.fromNumber, Body: body }).toString(),
    });
  } catch {
    return { ok: false, retryable: true, errorCode: "network_error" };
  }
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    parsed = undefined;
  }
  if (response.status === 201 && parsed && typeof parsed.sid === "string") {
    return { ok: true, providerMessageSid: parsed.sid };
  }
  const retryable = response.status >= 500 || response.status === 429;
  const code = parsed && (typeof parsed.code === "number" || typeof parsed.code === "string") ? String(parsed.code) : String(response.status);
  return { ok: false, retryable, errorCode: code };
};

// ── inbound keyword classification (STOP/START compliance) ───────────────────

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_WORDS = new Set(["start", "unstop", "yes"]);

export type InboundKeyword = "stop" | "start" | "other";

/** Carrier-compliant single-word matching on the trimmed, lowercased body. */
export function classifyInboundKeyword(body: string | undefined): InboundKeyword {
  const word = (body ?? "").trim().toLowerCase();
  if (STOP_WORDS.has(word)) return "stop";
  if (START_WORDS.has(word)) return "start";
  return "other";
}
