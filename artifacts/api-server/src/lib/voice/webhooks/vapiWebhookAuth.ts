// Milestone 2 foundation: Vapi server-URL webhook authentication.
//
// Per docs/ai-receptionist/DECISION_LOG.md (2026-07-17, "Vapi webhook
// authentication mechanism selected") and verified against current Vapi
// documentation (docs.vapi.ai/server-url/server-authentication, 2026-07):
// server-URL requests are authenticated via a Custom Credential. We use the
// HMAC credential type — Vapi signs the raw request body with a shared
// secret and sends the signature and a Unix-seconds timestamp in headers we
// choose when configuring the credential in the Vapi dashboard (see
// docs/ai-receptionist/VOICE_PLATFORM.md for the exact header names to enter
// there). There is deliberately no NODE_ENV development bypass here (unlike
// lib/intakeTwilio.ts) — an unsigned or wrongly-signed request is always
// rejected, in every environment.

import { createHmac, timingSafeEqual } from "node:crypto";

export const VAPI_SIGNATURE_HEADER = "x-vapi-signature";
export const VAPI_TIMESTAMP_HEADER = "x-vapi-timestamp";

/** Matches the 300-second skew tolerance recorded in DECISION_LOG.md. */
export const VAPI_WEBHOOK_TIMESTAMP_TOLERANCE_SEC = 300;

export type VapiWebhookAuthFailureReason =
  | "not_configured"
  | "missing_signature"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "timestamp_out_of_range"
  | "signature_mismatch";

export type VapiWebhookAuthResult =
  | { ok: true }
  | { ok: false; reason: VapiWebhookAuthFailureReason };

interface VerifyVapiWebhookSignatureInput {
  /** Exact raw request bytes — never a re-serialized/parsed body. */
  rawBody: Buffer;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  /** VAPI_WEBHOOK_SECRET. Never logged, never echoed in a response. */
  secret: string | undefined;
  toleranceSec?: number;
  /** Injectable for tests; defaults to the real clock. */
  now?: () => number;
}

function computeSignature(secret: string, timestamp: string, rawBody: Buffer): string {
  return createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(rawBody)
    .digest("hex");
}

function constantTimeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a Vapi server-URL webhook request. The signed payload is
 * `${timestamp}.${rawBody}` (the timestamp is bound into the signature so a
 * captured request can't be replayed outside the tolerance window), hashed
 * with HMAC-SHA256 and hex-encoded, compared in constant time.
 *
 * Fails closed: a missing secret, missing/invalid headers, an out-of-range
 * timestamp, or a signature mismatch are all rejected identically from the
 * caller's perspective (distinct `reason` values exist for our own logging
 * only — never echo `reason` in the HTTP response body).
 */
export function verifyVapiWebhookSignature({
  rawBody,
  signatureHeader,
  timestampHeader,
  secret,
  toleranceSec = VAPI_WEBHOOK_TIMESTAMP_TOLERANCE_SEC,
  now = Date.now,
}: VerifyVapiWebhookSignatureInput): VapiWebhookAuthResult {
  if (!secret) return { ok: false, reason: "not_configured" };
  if (!signatureHeader) return { ok: false, reason: "missing_signature" };
  if (!timestampHeader) return { ok: false, reason: "missing_timestamp" };

  const timestampSec = Number(timestampHeader);
  if (!Number.isFinite(timestampSec) || timestampSec <= 0) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const nowSec = now() / 1000;
  if (Math.abs(nowSec - timestampSec) > toleranceSec) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  const expected = computeSignature(secret, timestampHeader, rawBody);
  if (!constantTimeHexEqual(expected, signatureHeader.trim().toLowerCase())) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}
