// P2: the environment-driven authentication POLICY for the Vapi webhook —
// which mechanisms are acceptable, with which secrets — layered over the
// mechanism functions in vapiWebhookAuth.ts.
//
// Production contract (backend program, mandatory safety rules):
//   - HMAC is the only mechanism accepted by default, with the ±300 s
//     timestamp bound of vapiWebhookAuth.ts.
//   - The Bearer fallback (x-vapi-secret, no freshness) is a staging bridge
//     only. It is consulted ONLY when `VAPI_WEBHOOK_ALLOW_BEARER` is the
//     exact string "true" AND the request carries no HMAC headers at all —
//     a request that attempts HMAC is always judged on HMAC alone.
//   - Secret rotation is overlap-based: set `VAPI_WEBHOOK_SECRET` to the new
//     value and `VAPI_WEBHOOK_SECRET_PREVIOUS` to the old one, update the
//     Vapi credential, then clear PREVIOUS once the tolerance window has
//     passed. Both secrets are tried for whichever mechanism applies; which
//     one matched is reported for logging/rotation-progress visibility.
//
// Nothing here reads the environment at import time; the route passes
// `process.env` per request, and tests pass plain objects.

import {
  verifyVapiWebhookSignature,
  verifyVapiWebhookBearerSecret,
  VAPI_SIGNATURE_HEADER,
  VAPI_TIMESTAMP_HEADER,
  VAPI_BEARER_HEADER,
  type VapiWebhookAuthFailureReason,
} from "./vapiWebhookAuth.js";

export const VAPI_WEBHOOK_SECRET_ENV_VAR = "VAPI_WEBHOOK_SECRET";
export const VAPI_WEBHOOK_SECRET_PREVIOUS_ENV_VAR = "VAPI_WEBHOOK_SECRET_PREVIOUS";
export const VAPI_WEBHOOK_ALLOW_BEARER_ENV_VAR = "VAPI_WEBHOOK_ALLOW_BEARER";

export type VapiWebhookAuthMode = "hmac" | "hmac_previous" | "bearer" | "bearer_previous";

export type WebhookPolicyResult =
  | { ok: true; mode: VapiWebhookAuthMode }
  | { ok: false; reason: VapiWebhookAuthFailureReason; mechanism: "hmac" | "bearer" | "none" };

export interface WebhookPolicyEnv {
  [VAPI_WEBHOOK_SECRET_ENV_VAR]?: string;
  [VAPI_WEBHOOK_SECRET_PREVIOUS_ENV_VAR]?: string;
  [VAPI_WEBHOOK_ALLOW_BEARER_ENV_VAR]?: string;
  [key: string]: string | undefined;
}

export interface AuthenticateVapiWebhookInput {
  rawBody: Buffer;
  /** Lower-cased header lookup, e.g. Express's req.headers. */
  header: (name: string) => string | undefined;
  env: WebhookPolicyEnv;
  now?: () => number;
}

/** Only the exact string "true" enables the staging Bearer bridge. */
export function isBearerFallbackAllowed(env: WebhookPolicyEnv): boolean {
  return env[VAPI_WEBHOOK_ALLOW_BEARER_ENV_VAR] === "true";
}

/**
 * Applies the policy to one request. Fails closed on every path: no secret
 * configured, no acceptable mechanism, or verification failure all reject.
 * The result's `reason`/`mechanism` are for the server's own logs only —
 * never echo them to the caller.
 */
export function authenticateVapiWebhook({
  rawBody,
  header,
  env,
  now,
}: AuthenticateVapiWebhookInput): WebhookPolicyResult {
  const current = env[VAPI_WEBHOOK_SECRET_ENV_VAR];
  const previous = env[VAPI_WEBHOOK_SECRET_PREVIOUS_ENV_VAR];

  const signatureHeader = header(VAPI_SIGNATURE_HEADER);
  const timestampHeader = header(VAPI_TIMESTAMP_HEADER);
  const attemptsHmac = signatureHeader !== undefined || timestampHeader !== undefined;

  if (attemptsHmac) {
    const withCurrent = verifyVapiWebhookSignature({
      rawBody,
      signatureHeader,
      timestampHeader,
      secret: current,
      ...(now ? { now } : {}),
    });
    if (withCurrent.ok) return { ok: true, mode: "hmac" };

    // Rotation overlap: only a pure signature mismatch is retried against the
    // previous secret. Missing/stale timestamps and unconfigured secrets are
    // final — retrying those against another secret can't change the outcome
    // and would blur the log signal during a rotation.
    if (withCurrent.reason === "signature_mismatch" && previous) {
      const withPrevious = verifyVapiWebhookSignature({
        rawBody,
        signatureHeader,
        timestampHeader,
        secret: previous,
        ...(now ? { now } : {}),
      });
      if (withPrevious.ok) return { ok: true, mode: "hmac_previous" };
    }
    return { ok: false, reason: withCurrent.reason, mechanism: "hmac" };
  }

  const bearerHeader = header(VAPI_BEARER_HEADER);
  if (bearerHeader !== undefined && isBearerFallbackAllowed(env)) {
    const withCurrent = verifyVapiWebhookBearerSecret({ bearerHeader, secret: current });
    if (withCurrent.ok) return { ok: true, mode: "bearer" };
    if (withCurrent.reason === "signature_mismatch" && previous) {
      const withPrevious = verifyVapiWebhookBearerSecret({ bearerHeader, secret: previous });
      if (withPrevious.ok) return { ok: true, mode: "bearer_previous" };
    }
    return { ok: false, reason: withCurrent.reason, mechanism: "bearer" };
  }

  // No mechanism presented (or bearer presented while disallowed — treated
  // identically so probing can't distinguish "bearer off" from "no auth").
  const reason: VapiWebhookAuthFailureReason = current ? "missing_signature" : "not_configured";
  return { ok: false, reason, mechanism: "none" };
}
