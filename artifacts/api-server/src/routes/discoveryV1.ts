import { Router, type IRouter, type Request, type Response } from "express";
import {
  DiscoverySubmissionRequest,
  canonicalizeDiscoveryPayload,
  DISCOVERY_IDEMPOTENCY_CONFLICT_MESSAGE,
} from "@workspace/discovery-contract";
import { computeDuplicateFingerprint, computeIdempotencyPayloadHash } from "../lib/discoveryHmac.js";
import { loadDiscoveryFingerprintConfig, type DiscoveryFingerprintConfigResult } from "../lib/discoveryFingerprintConfig.js";
import { discoveryV1IpLimiter, getClientIp, isHoneypotTripped, isImplausiblyFast } from "../lib/discoveryV1Protection.js";
import { insertDiscoverySubmission, type DiscoveryDb } from "../lib/discoveryV1Persistence.js";

const router: IRouter = Router();

/**
 * Injectable dependencies for POST /api/v1/discovery-submissions — enables
 * `handleDiscoverySubmission` to be unit-tested with a fake `db` and a
 * controlled fingerprint-config result, never opening a real database
 * connection or requiring `DATABASE_URL` in the test process.
 */
export interface DiscoveryV1Deps {
  db: DiscoveryDb;
  loadFingerprintConfig: () => DiscoveryFingerprintConfigResult;
}

/**
 * The real `db` singleton is imported lazily (dynamic `import()`, only ever
 * invoked from here) rather than at module scope — `@workspace/db`'s root
 * export throws at import time if `DATABASE_URL` is unset. Every test in
 * this module always passes explicit `deps`, so this function is never
 * called during tests: importing `discoveryV1.ts` itself never requires a
 * database, real or otherwise.
 */
let cachedDefaultDeps: DiscoveryV1Deps | null = null;
async function getDefaultDeps(): Promise<DiscoveryV1Deps> {
  if (!cachedDefaultDeps) {
    const { db } = await import("@workspace/db");
    cachedDefaultDeps = { db, loadFingerprintConfig: loadDiscoveryFingerprintConfig };
  }
  return cachedDefaultDeps;
}

/**
 * Phase 2C.2D — the structured Discovery submission endpoint. Request
 * lifecycle (each step short-circuits to a safe response on failure):
 *
 * 1. Fail-closed fingerprint-HMAC configuration check (PRD §22 Correction
 *    7) — no submission is accepted while `DISCOVERY_FINGERPRINT_HMAC_KEY`
 *    is missing or the rotation-window env vars are inconsistent.
 * 2. Endpoint-scoped IP rate limit (discoveryV1IpLimiter).
 * 3. Shared-contract validation (`DiscoverySubmissionRequest.safeParse`) —
 *    rejects unknown/malformed/missing fields; body size itself is capped
 *    upstream by a route-scoped `express.json({ limit: "64kb" })` in
 *    app.ts, before this handler ever runs.
 * 4. Honeypot / implausible completion-time — neutral response,
 *    indistinguishable from each other (PRD §30 "Suspected bot" row).
 * 5. Canonicalization + HMAC (idempotency-payload hash, duplicate
 *    fingerprint of the normalized contact email) — both derived from the
 *    same configured key material via domain-separated HMAC.
 * 6. Atomic persistence (`insertDiscoverySubmission`) — idempotency replay
 *    / conflict / accepted-with-jobs-or-withheld, see discoveryV1Persistence.ts.
 *
 * No email is sent, no CRM record is created, and no delivery job is
 * processed by this route — job rows are created `pending` only; a
 * separate Phase 2C.2E worker (not built in this module) claims and
 * executes them.
 */
export async function handleDiscoverySubmission(
  req: Request,
  res: Response,
  deps?: DiscoveryV1Deps,
): Promise<void> {
  try {
    const resolvedDeps = deps ?? (await getDefaultDeps());
    const fingerprintConfigResult = resolvedDeps.loadFingerprintConfig();
    if (!fingerprintConfigResult.ok) {
      req.log.error(
        { reason: fingerprintConfigResult.reason },
        "[discoveryV1] fingerprint configuration invalid — endpoint disabled",
      );
      res.status(503).json({
        code: "temporarily_unavailable",
        message: "This service is temporarily unavailable. Please try again later.",
        retryable: true,
      });
      return;
    }
    const fingerprintConfig = fingerprintConfigResult.config;

    const ip = getClientIp(req);
    if (discoveryV1IpLimiter.isOverLimit(ip)) {
      req.log.warn({ ip }, "[discoveryV1] rate limit exceeded");
      res.status(429).json({ code: "rate_limited", message: "Too many attempts. Please try again later." });
      return;
    }
    discoveryV1IpLimiter.record(ip);

    const parsed = DiscoverySubmissionRequest.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.issues.slice(0, 50).map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      res.status(400).json({ code: "validation_error", fieldErrors });
      return;
    }
    const { meta, answers } = parsed.data;

    if (isHoneypotTripped(meta.honeypot) || isImplausiblyFast(meta.formStartedAt)) {
      req.log.warn({ ip }, "[discoveryV1] suspected bot submission");
      res.status(400).json({ code: "submission_review", message: "Unable to process this submission." });
      return;
    }

    const canonicalPayload = canonicalizeDiscoveryPayload(answers);
    const payloadHash = computeIdempotencyPayloadHash(canonicalPayload, fingerprintConfig.key, fingerprintConfig.keyVersion);
    const normalizedEmail = answers.contact.email.trim().toLowerCase();
    const fingerprint = computeDuplicateFingerprint(normalizedEmail, fingerprintConfig.key, fingerprintConfig.keyVersion);

    const outcome = await insertDiscoverySubmission(resolvedDeps.db, {
      answers,
      meta,
      canonicalPayloadHash: payloadHash.digest,
      duplicateFingerprint: fingerprint.digest,
      keyVersion: fingerprintConfig.keyVersion,
    });

    if (outcome.kind === "idempotency_conflict") {
      req.log.warn({ ip }, "[discoveryV1] idempotency key reuse with payload mismatch");
      res.status(409).json({ code: "idempotency_conflict", message: DISCOVERY_IDEMPOTENCY_CONFLICT_MESSAGE });
      return;
    }

    if (outcome.kind === "already_received") {
      res.status(200).json({ status: "received", reference: String(outcome.submission.id) });
      return;
    }

    req.log.info(
      { id: outcome.submission.id, jobsCreated: outcome.jobsCreated.length, withheld: outcome.withheld },
      "[discoveryV1] submission accepted",
    );
    res.status(201).json({ status: "received", reference: String(outcome.submission.id) });
  } catch (err) {
    req.log.error({ err }, "[discoveryV1] unexpected error");
    res.status(500).json({ code: "server_error", message: "Something went wrong. Please try again.", retryable: true });
  }
}

router.post("/v1/discovery-submissions", (req: Request, res: Response) => {
  void handleDiscoverySubmission(req, res);
});

export default router;
