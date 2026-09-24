// Phase 2C.2B — static database-contract assertions. No live database
// connection is made anywhere in this file. Run via:
//   pnpm --filter @workspace/scripts exec tsx lib/db/test/discoveryDatabaseContract.test.ts
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  discoverySubmissions,
  DISCOVERY_DUPLICATE_REVIEW_STATUSES,
} from "../src/schema/submissions";
import {
  discoveryDeliveryJobs,
  DISCOVERY_DELIVERY_JOB_TYPES,
  DISCOVERY_DELIVERY_JOB_STATUSES,
} from "../src/schema/discoveryDeliveryJobs";
import {
  discoveryAiBriefs,
  DISCOVERY_AI_BRIEF_STATUSES,
  DISCOVERY_AI_BRIEF_HUMAN_REVIEW_STATUSES,
} from "../src/schema/discoveryAiBriefs";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

function setEquals(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

// Table exports exist.
check("discoverySubmissions table export exists", Boolean(discoverySubmissions));
check("discoveryDeliveryJobs table export exists", Boolean(discoveryDeliveryJobs));
check("discoveryAiBriefs table export exists", Boolean(discoveryAiBriefs));

// Status/enum literal sets match the PRD.
check(
  "duplicate review status has exactly the four PRD-specified states",
  setEquals(DISCOVERY_DUPLICATE_REVIEW_STATUSES, ["none", "pending", "cleared", "confirmed_duplicate"]),
);
check(
  "delivery job types match the PRD's three v1 job types",
  setEquals(DISCOVERY_DELIVERY_JOB_TYPES, ["client_acknowledgment_email", "internal_notification_email", "crm_lead_upsert"]),
);
check(
  "delivery job statuses match the PRD's six states",
  setEquals(DISCOVERY_DELIVERY_JOB_STATUSES, ["pending", "processing", "retry_scheduled", "completed", "permanently_failed", "cancelled"]),
);
check(
  "AI brief statuses match the PRD's six states",
  setEquals(DISCOVERY_AI_BRIEF_STATUSES, ["pending", "processing", "retry_scheduled", "generated", "permanently_failed", "cancelled"]),
);
check(
  "AI brief human-review statuses match the PRD's five states",
  setEquals(DISCOVERY_AI_BRIEF_HUMAN_REVIEW_STATUSES, ["pending_review", "approved", "changes_requested", "rejected", "superseded"]),
);

// Required columns present + legacy-compatible nullability.
const submissionsConfig = getTableConfig(discoverySubmissions);
const submissionsColumns = new Map(submissionsConfig.columns.map((c) => [c.name, c]));
for (const expected of [
  "schema_version",
  "form_version",
  "idempotency_key",
  "idempotency_payload_hash",
  "idempotency_payload_hash_key_version",
  "idempotency_canonicalization_version",
  "duplicate_fingerprint",
  "fingerprint_key_version",
  "duplicate_review_status",
  "duplicate_of_submission_id",
  "duplicate_resolved_at",
  "duplicate_resolved_by",
  "duplicate_resolution_reason_code",
  "privacy_policy_version",
]) {
  check(`discovery_submissions.${expected} column exists`, submissionsColumns.has(expected));
}
check(
  "duplicateReviewStatus is NOT NULL (defaulted, safe for legacy rows)",
  submissionsColumns.get("duplicate_review_status")?.notNull === true,
);
for (const nullableLegacyField of [
  "schema_version",
  "idempotency_key",
  "idempotency_payload_hash",
  "duplicate_fingerprint",
  "duplicate_of_submission_id",
  "duplicate_resolved_at",
  "privacy_policy_version",
]) {
  check(
    `${nullableLegacyField} is nullable (legacy-compatible, no fabricated backfill)`,
    submissionsColumns.get(nullableLegacyField)?.notNull === false,
  );
}
check(
  "existing primary key discovery_submissions.id is untouched (serial, still primary)",
  submissionsColumns.get("id")?.primary === true,
);

// Delivery jobs: required columns + (submissionId, jobType) uniqueness.
const deliveryJobsConfig = getTableConfig(discoveryDeliveryJobs);
const deliveryJobsColumns = new Map(deliveryJobsConfig.columns.map((c) => [c.name, c]));
for (const expected of [
  "id",
  "submission_id",
  "job_type",
  "status",
  "idempotency_key",
  "attempt_count",
  "max_attempts",
  "next_attempt_at",
  "locked_at",
  "locked_by",
  "provider_message_id",
  "last_error_code",
  "last_error_at",
  "created_at",
  "updated_at",
  "completed_at",
]) {
  check(`discovery_delivery_jobs.${expected} column exists`, deliveryJobsColumns.has(expected));
}
check(
  "discovery_delivery_jobs has a unique (submission_id, job_type) index",
  deliveryJobsConfig.indexes.some(
    (idx) => idx.config.unique && idx.config.columns.map((c) => ("name" in c ? c.name : "")).join(",") === "submission_id,job_type",
  ),
);

// AI briefs: required columns + (submissionId, briefVersion) uniqueness.
const aiBriefsConfig = getTableConfig(discoveryAiBriefs);
const aiBriefsColumns = new Map(aiBriefsConfig.columns.map((c) => [c.name, c]));
for (const expected of [
  "id",
  "submission_id",
  "brief_version",
  "prompt_version",
  "provider",
  "model",
  "status",
  "attempt_count",
  "max_attempts",
  "next_attempt_at",
  "locked_at",
  "locked_by",
  "last_error_code",
  "last_error_at",
  "structured_output",
  "human_review_status",
  "reviewed_by",
  "reviewed_at",
  "created_at",
  "updated_at",
  "completed_at",
]) {
  check(`discovery_ai_briefs.${expected} column exists`, aiBriefsColumns.has(expected));
}
check(
  "discovery_ai_briefs has a unique (submission_id, brief_version) index",
  aiBriefsConfig.indexes.some(
    (idx) => idx.config.unique && idx.config.columns.map((c) => ("name" in c ? c.name : "")).join(",") === "submission_id,brief_version",
  ),
);

// Indexes defined for future worker polling.
check(
  "discovery_delivery_jobs has a (status, next_attempt_at) index",
  deliveryJobsConfig.indexes.some((idx) => idx.config.columns.map((c) => ("name" in c ? c.name : "")).join(",") === "status,next_attempt_at"),
);
check(
  "discovery_ai_briefs has a (status, next_attempt_at) index",
  aiBriefsConfig.indexes.some((idx) => idx.config.columns.map((c) => ("name" in c ? c.name : "")).join(",") === "status,next_attempt_at"),
);

if (failures > 0) {
  console.error(`\n${failures} discoveryDatabaseContract test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll discoveryDatabaseContract tests passed.");
}
