// ── Svix webhook signatures ─────────────────────────────────────────────────
//
// Resend signs its webhooks with Svix, and the signature IS the authentication
// for the two webhook routes: no session, no key, nothing else stands between
// an HTTP request and a write. So this file is deliberately explicit rather
// than a call into a library, and it is pure: the clock is a parameter, which
// is what makes "a signature from six minutes ago is refused" a test rather
// than a claim.
//
// The scheme (https://docs.svix.com/receiving/verifying-payloads/how-manual):
//
//   signed content = `${svix-id}.${svix-timestamp}.${body}`
//   key            = base64-decode(secret without its `whsec_` prefix)
//   signature      = base64(HMAC-SHA256(key, signed content))
//   header         = space-separated `v1,<signature>` entries; ANY may match
//
// Four things here are load-bearing and each prevents a real class of bug:
//
//  1. The body is hashed as RAW BYTES. A signature covers the exact bytes that
//     arrived, so re-serialising the parsed JSON — pretty much the first thing
//     anyone tries — changes them and every verification fails, or worse,
//     succeeds against a body that is not the one signed.
//  2. The comparison is constant-time over the DECODED signature bytes.
//  3. The timestamp is bounded (±5 minutes). Without it a captured request can
//     be replayed forever, and the signature stays valid the whole time.
//  4. EVERY `v1,` entry is tried. Svix sends more than one during a secret
//     rotation, and a verifier that reads only the first refuses live traffic
//     for the length of the overlap.

import crypto from "node:crypto";

/** Svix's own tolerance, and the one Resend's documentation assumes. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaderValue = string | string[] | undefined;

export interface SvixHeaders {
  id?: SvixHeaderValue;
  timestamp?: SvixHeaderValue;
  signature?: SvixHeaderValue;
}

/** Why a request was not accepted. Every one of these is a 4xx, not a retry. */
export type SvixFailure =
  | "no_secret"
  | "unusable_secret"
  | "missing_headers"
  | "bad_timestamp"
  | "stale"
  | "future"
  | "no_signature"
  | "mismatch";

export type SvixVerification =
  | { ok: true; id: string; timestamp: Date }
  | { ok: false; failure: SvixFailure; message: string };

/** First value of a header that may arrive repeated. */
function headerValue(value: SvixHeaderValue): string | null {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : null;
  if (typeof value === "string") return value;
  return null;
}

/**
 * The signing key.
 *
 * A Svix secret is `whsec_` + base64. The prefix is a label, not part of the
 * key, and including it produces a key that verifies nothing — a failure that
 * looks exactly like a wrong secret, which is why it is stripped here rather
 * than left to whoever pastes the value into an environment.
 */
export function svixSigningKey(secret: string): Buffer | null {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  if (raw.trim().length === 0) return null;
  const key = Buffer.from(raw, "base64");
  return key.length > 0 ? key : null;
}

/** `v1,<base64>` for this id, timestamp and body — the header Svix would send. */
export function svixSignature(args: {
  secret: string;
  id: string;
  /** Seconds since the epoch, as it appears in the `svix-timestamp` header. */
  timestamp: number;
  body: Buffer | string;
}): string | null {
  const key = svixSigningKey(args.secret);
  if (!key) return null;
  return `v1,${signedDigest(key, args.id, String(args.timestamp), args.body).toString("base64")}`;
}

function signedDigest(key: Buffer, id: string, timestamp: string, body: Buffer | string): Buffer {
  const mac = crypto.createHmac("sha256", key);
  // Prefix and body are updated separately so the body's bytes are hashed as
  // they arrived, without a round trip through a string.
  mac.update(`${id}.${timestamp}.`, "utf8");
  mac.update(typeof body === "string" ? Buffer.from(body, "utf8") : body);
  return mac.digest();
}

function timingSafeMatch(expected: Buffer, candidate: Buffer): boolean {
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/**
 * Verifies one webhook request.
 *
 * Returns a verdict rather than throwing: the caller has to distinguish "this
 * server is not configured" (which must NOT tell the provider to stop retrying)
 * from "this request is not authentic" (which must).
 */
export function verifySvixSignature(args: {
  secret: string | null | undefined;
  headers: SvixHeaders;
  body: Buffer | string;
  /** Milliseconds since the epoch. A parameter so staleness is testable. */
  now?: number;
  toleranceSeconds?: number;
}): SvixVerification {
  if (!args.secret) {
    return { ok: false, failure: "no_secret", message: "No signing secret is configured on this server." };
  }
  const key = svixSigningKey(args.secret);
  if (!key) {
    return {
      ok: false, failure: "unusable_secret",
      message: "The configured signing secret is not usable: it must be the `whsec_`-prefixed base64 value the provider issued for this endpoint.",
    };
  }

  const id = headerValue(args.headers.id);
  const timestamp = headerValue(args.headers.timestamp);
  const signature = headerValue(args.headers.signature);
  if (!id || !timestamp || !signature) {
    return {
      ok: false, failure: "missing_headers",
      message: "svix-id, svix-timestamp and svix-signature are all required.",
    };
  }

  // Strict: Svix's own libraries use parseInt, which accepts "123abc" and
  // silently signs a different string than the one it verifies against.
  if (!/^\d{1,15}$/.test(timestamp)) {
    return { ok: false, failure: "bad_timestamp", message: "svix-timestamp is not a whole number of seconds." };
  }
  const sentAtSeconds = Number(timestamp);
  const nowSeconds = Math.floor((args.now ?? Date.now()) / 1000);
  const tolerance = args.toleranceSeconds ?? SVIX_TOLERANCE_SECONDS;
  if (nowSeconds - sentAtSeconds > tolerance) {
    return {
      ok: false, failure: "stale",
      message: `This request was signed more than ${Math.round(tolerance / 60)} minutes ago, so it is refused as a replay.`,
    };
  }
  if (sentAtSeconds - nowSeconds > tolerance) {
    return {
      ok: false, failure: "future",
      message: "This request is signed with a timestamp in the future; the clocks disagree by more than the tolerance.",
    };
  }

  const expected = signedDigest(key, id, timestamp, args.body);
  const candidates = signature.split(/\s+/).filter(Boolean);
  let sawVersionOne = false;
  for (const entry of candidates) {
    const comma = entry.indexOf(",");
    if (comma < 0) continue;
    if (entry.slice(0, comma) !== "v1") continue;
    sawVersionOne = true;
    if (timingSafeMatch(expected, Buffer.from(entry.slice(comma + 1), "base64"))) {
      return { ok: true, id, timestamp: new Date(sentAtSeconds * 1000) };
    }
  }

  return sawVersionOne
    ? { ok: false, failure: "mismatch", message: "The signature does not match this body and secret." }
    : { ok: false, failure: "no_signature", message: "svix-signature carries no v1 signature." };
}
