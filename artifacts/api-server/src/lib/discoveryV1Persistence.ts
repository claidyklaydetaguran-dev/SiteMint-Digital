import { and, eq, gt } from "drizzle-orm";
import type { db as RealDb } from "@workspace/db";
// Value imports deliberately come from the schema-only subpaths (never the
// package root, "@workspace/db") so this module — and anything that only
// needs its pure orchestration logic, like its own tests — never triggers
// @workspace/db's root `index.ts`, which throws at import time if
// `DATABASE_URL` is unset. Only `type { db as RealDb }` above is imported
// from the root, and `import type` is fully erased at compile time, so it
// never executes that module's runtime code either.
import { discoverySubmissions, type DiscoverySubmission } from "@workspace/db/schema";
import {
  discoveryDeliveryJobs,
  DISCOVERY_DELIVERY_JOB_TYPES,
  type DiscoveryDeliveryJobType,
} from "@workspace/db/schema/discovery";
import {
  DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION,
  type DiscoverySubmissionContract,
  type DiscoveryTransportMeta,
} from "@workspace/discovery-contract";
import { safeDigestEquals } from "./discoveryHmac.js";

/**
 * Type-only import of the real Drizzle client — never a runtime import, so
 * this module (and anything that only imports it for types) never
 * triggers `@workspace/db`'s `DATABASE_URL` requirement. The route module
 * passes the real, live `db` singleton at call time; tests pass a narrow
 * fake cast to this type instead.
 */
export type DiscoveryDb = typeof RealDb;

/**
 * Likely-duplicate window (PRD §24 scenario 3): a *different* idempotency
 * key whose duplicate fingerprint matches a submission created within this
 * window is stored but flagged for operator review, and its delivery jobs
 * are withheld — never silently discarded, never auto-delivered.
 */
export const DUPLICATE_FINGERPRINT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export interface AcceptedSubmissionInput {
  answers: DiscoverySubmissionContract;
  meta: DiscoveryTransportMeta;
  /** HMAC of `canonicalizeDiscoveryPayload(answers)` — computed by the caller. */
  canonicalPayloadHash: string;
  /** HMAC of the normalized (lowercased/trimmed) contact email — computed by the caller. */
  duplicateFingerprint: string;
  /** Key version that produced both digests above (same root key, domain-separated). */
  keyVersion: string;
  privacyPolicyVersion?: string;
}

export interface AcceptedOutcome {
  kind: "accepted";
  submission: DiscoverySubmission;
  jobsCreated: DiscoveryDeliveryJobType[];
  /** true when this submission was flagged as a likely duplicate and its delivery jobs were withheld. */
  withheld: boolean;
}

export interface AlreadyReceivedOutcome {
  kind: "already_received";
  submission: DiscoverySubmission;
}

export interface IdempotencyConflictOutcome {
  kind: "idempotency_conflict";
}

export type InsertDiscoverySubmissionOutcome = AcceptedOutcome | AlreadyReceivedOutcome | IdempotencyConflictOutcome;

/**
 * Phase 2C.2D atomic submission-plus-delivery-job insert (PRD §24/§26).
 *
 * 1. Idempotency lookup (read-only, outside any transaction): same key +
 *    matching canonical-payload-hash returns the original row unchanged
 *    (no new row, no new jobs); same key + mismatched hash returns a
 *    conflict (no row, no jobs) — the caller maps this to 409.
 * 2. Duplicate-fingerprint lookup (read-only): a different key whose
 *    fingerprint matches a submission created within
 *    `DUPLICATE_FINGERPRINT_WINDOW_MS` marks the new row `pending` review.
 * 3. Single transaction: insert the submission row, then — unless flagged
 *    pending — insert exactly one `discovery_delivery_jobs` row per type in
 *    `DISCOVERY_DELIVERY_JOB_TYPES` (`client_acknowledgment_email`,
 *    `internal_notification_email`, `crm_lead_upsert`), each `status:
 *    "pending"`. `.onConflictDoNothing()` on the job insert relies on the
 *    existing `(submissionId, jobType)` unique constraint so a retried
 *    transaction can never create duplicate job rows (PRD §26). If the job
 *    insert throws, the whole transaction — including the submission
 *    insert — rolls back: no partial submission, no orphaned jobs.
 *
 * QUALIFICATION-DEFAULT HONESTY NOTE (verified against the live schema,
 * not assumed): `leadScore`, `tags`, and `recommendedPackage` are
 * deliberately omitted from the insert `.values()` below — no scoring
 * function runs against structured submissions in this module. What
 * Postgres actually stores when they're omitted (confirmed via
 * `getTableConfig(discoverySubmissions)`, asserted permanently by
 * `discoveryV1QualificationDefault.test.ts`):
 *   - `lead_score`  → NOT NULL, DEFAULT 1  → stores the integer `1`
 *   - `tags`        → NOT NULL, DEFAULT '{}' → stores an empty array
 *   - `recommended_package` → nullable, no default → stores `NULL`
 *
 * `leadScore = 1` is NOT NULL, so on its own it is indistinguishable from
 * a real, computed lowest-possible score. Module 1B correction: this insert
 * now also explicitly writes `isAutomaticallyScored: false` — a dedicated,
 * nullable, no-default marker column (legacy rows stay NULL, "scoring
 * state unknown"; a future approved scoring process may write `true`).
 * This lets any *future* reader honestly distinguish "never scored" from
 * "scored as low as possible" without touching `leadScore`'s own type,
 * nullability, or default.
 *
 * REQUIRED FOLLOW-UP (not done in this module — do not deploy/activate the
 * structured endpoint until this is addressed): the marker column alone
 * does not fix anything by itself. These already-live, untouched-by-this-
 * module surfaces read/display `leadScore` today and do NOT yet inspect
 * `isAutomaticallyScored`: `artifacts/web-agency/src/pages/crm/
 * {CrmLeads,CrmDiscovery,CrmLeadDetail,CrmPipeline}.tsx`,
 * `AdminDashboard.tsx`, `AdminSubmissionDetail.tsx`,
 * `artifacts/api-server/src/routes/{admin,crm,crmDiscovery}.ts`. Until
 * those screens are updated to check `isAutomaticallyScored` (and suppress
 * or relabel the raw `leadScore` value when it's `false`), a structured
 * submission created against a real database would still display "1" as
 * if it were a genuine score in every one of those surfaces. This module's
 * own route/response/logs never do this (the API response is
 * `{status, reference}` only), but that existing-surface risk remains real
 * and unmitigated until the CRM/admin UI work above is done.
 */
export async function insertDiscoverySubmission(
  db: DiscoveryDb,
  input: AcceptedSubmissionInput,
): Promise<InsertDiscoverySubmissionOutcome> {
  const [existing] = await db
    .select()
    .from(discoverySubmissions)
    .where(eq(discoverySubmissions.idempotencyKey, input.meta.idempotencyKey))
    .limit(1);

  if (existing) {
    if (existing.idempotencyPayloadHash && safeDigestEquals(existing.idempotencyPayloadHash, input.canonicalPayloadHash)) {
      return { kind: "already_received", submission: existing };
    }
    return { kind: "idempotency_conflict" };
  }

  const windowStart = new Date(Date.now() - DUPLICATE_FINGERPRINT_WINDOW_MS);
  const [fingerprintMatch] = await db
    .select()
    .from(discoverySubmissions)
    .where(
      and(
        eq(discoverySubmissions.duplicateFingerprint, input.duplicateFingerprint),
        gt(discoverySubmissions.createdAt, windowStart),
      ),
    )
    .limit(1);
  const isLikelyDuplicate = Boolean(fingerprintMatch);

  return db.transaction(async (tx) => {
    const [submission] = await tx
      .insert(discoverySubmissions)
      .values({
        contactName: input.answers.contact.name,
        companyName: input.answers.business.organizationName,
        email: input.answers.contact.email,
        phone: input.answers.contact.phone ?? null,
        industry: input.answers.business.industry,
        formData: input.answers,
        status: "New",
        schemaVersion: input.meta.schemaVersion,
        formVersion: input.meta.formVersion,
        idempotencyKey: input.meta.idempotencyKey,
        idempotencyPayloadHash: input.canonicalPayloadHash,
        idempotencyPayloadHashKeyVersion: input.keyVersion,
        idempotencyCanonicalizationVersion: DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION,
        duplicateFingerprint: input.duplicateFingerprint,
        fingerprintKeyVersion: input.keyVersion,
        duplicateReviewStatus: isLikelyDuplicate ? "pending" : "none",
        privacyPolicyVersion: input.privacyPolicyVersion ?? null,
        // Explicit, not omitted: "accepted, not yet scored" — never NULL
        // ("unknown", the legacy-row meaning) and never true (that would
        // claim a real scoring pass ran, which it did not).
        isAutomaticallyScored: false,
      })
      .returning();

    let jobsCreated: DiscoveryDeliveryJobType[] = [];
    if (!isLikelyDuplicate) {
      const jobRows = DISCOVERY_DELIVERY_JOB_TYPES.map((jobType) => ({
        submissionId: submission.id,
        jobType,
        status: "pending" as const,
      }));
      const inserted = await tx
        .insert(discoveryDeliveryJobs)
        .values(jobRows)
        .onConflictDoNothing()
        .returning({ jobType: discoveryDeliveryJobs.jobType });
      jobsCreated = inserted.map((row) => row.jobType as DiscoveryDeliveryJobType);
    }

    return { kind: "accepted", submission, jobsCreated, withheld: isLikelyDuplicate };
  });
}
