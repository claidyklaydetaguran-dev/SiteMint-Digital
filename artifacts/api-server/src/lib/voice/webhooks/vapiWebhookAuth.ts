// Milestone 2 foundation: Vapi server-URL webhook authentication.
//
// Per docs/ai-receptionist/DECISION_LOG.md (2026-07-17, "Vapi webhook
// authentication mechanism selected") and verified against current Vapi
// documentation (docs.vapi.ai/server-url/server-authentication, 2026-07):
// server-URL requests are authenticated via a Custom Credential. We use the
// HMAC credential type — Vapi signs the raw request body with a shared
// secret and sends the signature and a Unix timestamp (in MILLISECONDS; see
// the tolerance note below) in headers we choose when configuring the
// credential in the Vapi dashboard (see
// docs/ai-receptionist/VOICE_PLATFORM.md for the exact header names to enter
// there). There is deliberately no NODE_ENV development bypass here (unlike
// lib/intakeTwilio.ts) — an unsigned or wrongly-signed request is always
// rejected, in every environment.

import { createHmac, timingSafeEqual } from "node:crypto";

export const VAPI_SIGNATURE_HEADER = "x-vapi-signature";
export const VAPI_TIMESTAMP_HEADER = "x-vapi-timestamp";

/**
 * Header Vapi uses when the assistant or phone number has a `serverUrlSecret`
 * set (the documented Bearer fallback — see DECISION_LOG.md 2026-07-17).
 * The raw secret value is sent as-is; verified in constant time.
 */
export const VAPI_BEARER_HEADER = "x-vapi-secret";

/** Matches the 300-second skew tolerance recorded in DECISION_LOG.md. */
export const VAPI_WEBHOOK_TIMESTAMP_TOLERANCE_SEC = 300;

/**
 * Vapi sends `x-vapi-timestamp` in Unix MILLISECONDS, not seconds — verified
 * 2026-09-01 against the provider-side webhook log of a live staging call,
 * which recorded a 13-digit header value (e.g. `1788247410457`) alongside the
 * matching `x-vapi-signature`. Reading that as seconds put every real delivery
 * ~1.8e12 seconds from now, so the freshness check rejected it and the whole
 * webhook path failed closed with `timestamp_out_of_range`.
 *
 * Rather than infer the unit from magnitude, a request is fresh when EITHER
 * reading falls inside the tolerance. The two accepted windows are disjoint by
 * three orders of magnitude — a seconds value read as milliseconds lands in
 * 1970, a milliseconds value read as seconds lands around 58 000 AD — so
 * accepting both does not widen the replay window in either unit: it stays
 * exactly ±toleranceSec around now.
 *
 * The signature is unaffected: both sides sign the raw header string, so the
 * HMAC always matched even while the freshness check was rejecting.
 */

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
 * `${timestamp}.${rawBody}` — the raw header string exactly as sent, so the
 * signature is independent of whether that value is seconds or milliseconds
 * (the timestamp is bound into the signature so a captured request can't be
 * replayed outside the tolerance window), hashed with HMAC-SHA256 and
 * hex-encoded, compared in constant time.
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

  const timestampValue = Number(timestampHeader);
  if (!Number.isFinite(timestampValue) || timestampValue <= 0) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const nowSec = now() / 1000;
  const freshAsSeconds = Math.abs(nowSec - timestampValue) <= toleranceSec;
  const freshAsMilliseconds = Math.abs(nowSec - timestampValue / 1000) <= toleranceSec;
  if (!freshAsSeconds && !freshAsMilliseconds) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  const expected = computeSignature(secret, timestampHeader, rawBody);
  if (!constantTimeHexEqual(expected, signatureHeader.trim().toLowerCase())) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}

/**
 * Verifies the Vapi Bearer secret fallback (DECISION_LOG.md 2026-07-17).
 * Used when the assistant uses `serverUrlSecret` rather than an HMAC Custom
 * Credential — Vapi sends the raw secret value in the `x-vapi-secret` header.
 * Compared in constant time; no replay protection (no timestamp).
 */
export function verifyVapiWebhookBearerSecret({
  bearerHeader,
  secret,
}: {
  bearerHeader: string | undefined;
  secret: string | undefined;
}): VapiWebhookAuthResult {
  if (!secret) return { ok: false, reason: "not_configured" };
  if (!bearerHeader) return { ok: false, reason: "missing_signature" };
  const bufA = Buffer.from(secret, "utf8");
  const bufB = Buffer.from(bearerHeader, "utf8");
  if (bufA.length === 0 || bufA.length !== bufB.length) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return timingSafeEqual(bufA, bufB)
    ? { ok: true }
    : { ok: false, reason: "signature_mismatch" };
}
