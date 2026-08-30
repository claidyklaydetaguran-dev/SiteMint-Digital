// Phase 2C.2D — unit tests for the atomic submission-plus-delivery-job
// insert used by POST /api/v1/discovery-submissions. Uses a small hand-
// built fake DB matching exactly the chainable calls
// discoveryV1Persistence.ts makes (select().from().where().limit(),
// transaction(tx => tx.insert().values().returning() /
// .onConflictDoNothing().returning())) — never a real Postgres connection,
// never requires DATABASE_URL. Table identity (`table === discoverySubmissions`)
// is used to route the fake's behavior, exactly like the real Drizzle table
// objects would be compared by reference.
//
// Run via:
//   pnpm --filter @workspace/scripts exec tsx artifacts/api-server/test/discoveryV1Persistence.test.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverySubmissions } from "@workspace/db/schema";
import { discoveryDeliveryJobs, DISCOVERY_DELIVERY_JOB_TYPES } from "@workspace/db/schema/discovery";
import { insertDiscoverySubmission, type DiscoveryDb } from "../src/lib/discoveryV1Persistence";
import { computeDuplicateFingerprint, computeIdempotencyPayloadHash } from "../src/lib/discoveryHmac";
import { canonicalizeDiscoveryPayload, type DiscoverySubmissionContract, type DiscoveryTransportMeta } from "@workspace/discovery-contract";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

// ── Minimal fake DB ──────────────────────────────────────────────────────

interface FakeJobRow {
  submissionId: number;
  jobType: string;
  status: string;
}

function createFakeDb(opts: { queuedSelectResults?: unknown[][]; throwOnJobInsert?: boolean } = {}) {
  const queuedSelectResults = opts.queuedSelectResults ?? [];
  let selectCallIndex = 0;
  const submissionsStore: Record<string, unknown>[] = [];
  const jobsStore: FakeJobRow[] = [];
  let nextId = 1;

  function selectChain() {
    return {
      from(_table: unknown) {
        return {
          where(_cond: unknown) {
            return {
              limit(_n: number) {
                const result = queuedSelectResults[selectCallIndex] ?? [];
                selectCallIndex++;
                return Promise.resolve(result);
              },
            };
          },
        };
      },
    };
  }

  function insertChain(table: unknown) {
    return {
      values(v: unknown) {
        const rows = Array.isArray(v) ? v : [v];
        return {
          async returning(projection?: Record<string, unknown>) {
            if (table === discoverySubmissions) {
              const inserted = rows.map((r) => ({
                id: nextId++,
                createdAt: new Date(),
                updatedAt: new Date(),
                leadScore: 1,
                tags: [],
                recommendedPackage: null,
                generatedProposal: null,
                generatedSow: null,
                internalNotes: null,
                leadId: null,
                aiSummary: null,
                estimatedComplexity: null,
                estimatedBudgetTier: null,
                suggestedScope: null,
                crmStatus: "New",
                preferredContactMethod: null,
                convertedProjectId: null,
                duplicateOfSubmissionId: null,
                duplicateResolvedAt: null,
                duplicateResolvedBy: null,
                duplicateResolutionReasonCode: null,
                ...(r as Record<string, unknown>),
              }));
              submissionsStore.push(...inserted);
              return inserted;
            }
            if (table === discoveryDeliveryJobs) {
              if (opts.throwOnJobInsert) {
                throw new Error("simulated job insert failure");
              }
              const inserted = (rows as FakeJobRow[]).map((r) => ({ ...r }));
              jobsStore.push(...inserted);
              if (projection) {
                return inserted.map((r) => {
                  const out: Record<string, unknown> = {};
                  for (const key of Object.keys(projection)) out[key] = (r as Record<string, unknown>)[key];
                  return out;
                });
              }
              return inserted;
            }
            throw new Error("unsupported table in fake insert");
          },
          onConflictDoNothing() {
            return {
              async returning(projection?: Record<string, unknown>) {
                if (table !== discoveryDeliveryJobs) throw new Error("onConflictDoNothing only modeled for jobs");
                if (opts.throwOnJobInsert) throw new Error("simulated job insert failure");
                const accepted: FakeJobRow[] = [];
                for (const r of rows as FakeJobRow[]) {
                  const exists = jobsStore.some((j) => j.submissionId === r.submissionId && j.jobType === r.jobType);
                  if (!exists) {
                    jobsStore.push({ ...r });
                    accepted.push({ ...r });
                  }
                }
                if (projection) {
                  return accepted.map((r) => {
                    const out: Record<string, unknown> = {};
                    for (const key of Object.keys(projection)) out[key] = (r as Record<string, unknown>)[key];
                    return out;
                  });
                }
                return accepted;
              },
            };
          },
        };
      },
    };
  }

  const tx = { insert: insertChain };

  const fakeDb = {
    select: selectChain,
    async transaction<T>(cb: (tx: { insert: typeof insertChain }) => Promise<T>): Promise<T> {
      const submissionsSnapshotLen = submissionsStore.length;
      const jobsSnapshotLen = jobsStore.length;
      try {
        return await cb(tx);
      } catch (err) {
        submissionsStore.length = submissionsSnapshotLen;
        jobsStore.length = jobsSnapshotLen;
        throw err;
      }
    },
  };

  return { fakeDb: fakeDb as unknown as DiscoveryDb, submissionsStore, jobsStore };
}

// ── Fixture ──────────────────────────────────────────────────────────────

const ANSWERS: DiscoverySubmissionContract = {
  projectDirection: { primaryType: "new_website" },
  business: {
    organizationName: "Acme Co",
    industry: "Retail",
    description: "A test business description that is long enough.",
    primaryAudience: "Local shoppers looking for goods and services nearby.",
    businessStage: "established",
    teamSizeRange: "2_10",
  },
  decisionContext: {
    currentSituation: "No website today, losing walk-in and online interest.",
    primaryProblem: "No online presence at all for the business.",
    whyNow: "Ready to invest in growth this quarter.",
    desiredOutcome: "A credible site that converts visitors into customers.",
    successDefinition: "More inbound inquiries each month.",
    primaryGoal: "increase_leads",
  },
  projectScope: { features: [] },
  readiness: {
    logoStatus: "have_it",
    brandStatus: "have_it",
    contentStatus: "in_progress",
    photoVideoStatus: "need_help",
    domainStatus: "have_it",
    hostingStatus: "need_recommendation",
  },
  commercial: {
    launchWindow: "within_1_3_months",
    investmentRange: "growth",
    investmentApproved: true,
    decisionMakers: "Just me, the owner.",
    vendorProcurementInvolved: false,
  },
  contact: {
    name: "Jane Doe",
    email: "jane@example.com",
    preferredContactMethod: "email",
    consent: { privacyPolicyAcknowledged: true, operationalContactConsent: true, marketingConsent: false, smsConsent: false },
  },
};

function makeMeta(overrides: Partial<DiscoveryTransportMeta> = {}): DiscoveryTransportMeta {
  return {
    idempotencyKey: overrides.idempotencyKey ?? "11111111-1111-1111-1111-111111111111",
    formVersion: "1.0.0",
    schemaVersion: "1.0.0",
    formStartedAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

const TEST_KEY = "test-only-fingerprint-key";
const TEST_KEY_VERSION = "v1";

function buildInput(meta: DiscoveryTransportMeta, answers: DiscoverySubmissionContract = ANSWERS) {
  const canonical = canonicalizeDiscoveryPayload(answers);
  const payloadHash = computeIdempotencyPayloadHash(canonical, TEST_KEY, TEST_KEY_VERSION);
  const fingerprint = computeDuplicateFingerprint(answers.contact.email.trim().toLowerCase(), TEST_KEY, TEST_KEY_VERSION);
  return {
    answers,
    meta,
    canonicalPayloadHash: payloadHash.digest,
    duplicateFingerprint: fingerprint.digest,
    keyVersion: TEST_KEY_VERSION,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

async function run() {
  // 1. Fresh submission — no idempotency match, no fingerprint match.
  {
    const { fakeDb, submissionsStore, jobsStore } = createFakeDb({ queuedSelectResults: [[], []] });
    const outcome = await insertDiscoverySubmission(fakeDb, buildInput(makeMeta()));
    check("fresh submission is accepted", outcome.kind === "accepted");
    if (outcome.kind === "accepted") {
      check("submission row was persisted", submissionsStore.length === 1);
      check("all 3 delivery job types are created", outcome.jobsCreated.length === DISCOVERY_DELIVERY_JOB_TYPES.length);
      check(
        "job rows exist for client_acknowledgment_email, internal_notification_email, crm_lead_upsert",
        DISCOVERY_DELIVERY_JOB_TYPES.every((t) => jobsStore.some((j) => j.jobType === t)),
      );
      check("submission is not withheld", outcome.withheld === false);
      check("duplicateReviewStatus is 'none'", submissionsStore[0]?.duplicateReviewStatus === "none");
      check("returned leadScore is the schema default (1)", outcome.submission.leadScore === 1);
      check("tags stays empty (no scoring)", Array.isArray(outcome.submission.tags) && outcome.submission.tags.length === 0);
      check("recommendedPackage stays null (no scoring)", outcome.submission.recommendedPackage === null);
    }
  }

  // 1b. Source-level proof that leadScore/tags/recommendedPackage are never
  // explicitly assigned in the insert — the schema DEFAULT is what produces
  // them, not application "scoring" logic. Complements test 1's behavioral
  // check (same style as contactProtection.test.ts's source-text checks).
  {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, "../src/lib/discoveryV1Persistence.ts"), "utf8");
    const valuesBlockMatch = source.match(/\.values\(\{([\s\S]*?)\n {6}\}\)/);
    const valuesBlock = valuesBlockMatch ? valuesBlockMatch[1] : "";
    check("valuesBlock was found (test is actually checking something)", valuesBlock.length > 0);
    check("leadScore is never set in the submission insert", !/\bleadScore\s*:/.test(valuesBlock));
    check("tags is never set in the submission insert", !/\btags\s*:/.test(valuesBlock));
    check("recommendedPackage is never set in the submission insert", !/\brecommendedPackage\s*:/.test(valuesBlock));
    check(
      "no calculateLeadScore/calculateTags/recommendPackage import (legacy scoring functions never run here)",
      !/calculateLeadScore|calculateTags|recommendPackage/.test(source),
    );
  }

  // 2. Idempotency replay — same key, same payload.
  {
    const meta = makeMeta({ idempotencyKey: "22222222-2222-2222-2222-222222222222" });
    const input = buildInput(meta);
    const existingRow = { id: 42, idempotencyPayloadHash: input.canonicalPayloadHash };
    const { fakeDb } = createFakeDb({ queuedSelectResults: [[existingRow]] });
    const outcome = await insertDiscoverySubmission(fakeDb, input);
    check("same key + same payload returns the original row", outcome.kind === "already_received");
    if (outcome.kind === "already_received") {
      check("original submission id is returned, not a new one", outcome.submission.id === 42);
    }
  }

  // 3. Idempotency conflict — same key, different payload.
  {
    const meta = makeMeta({ idempotencyKey: "33333333-3333-3333-3333-333333333333" });
    const input = buildInput(meta);
    const existingRow = { id: 43, idempotencyPayloadHash: "a-completely-different-hash-0000000000000000000000000000" };
    const { fakeDb, submissionsStore, jobsStore } = createFakeDb({ queuedSelectResults: [[existingRow]] });
    const outcome = await insertDiscoverySubmission(fakeDb, input);
    check("same key + different payload is a conflict", outcome.kind === "idempotency_conflict");
    check("no new submission row created on conflict", submissionsStore.length === 0);
    check("no job rows created on conflict", jobsStore.length === 0);
  }

  // 4. Duplicate-fingerprint match within window — submission stored, jobs withheld.
  {
    const meta = makeMeta({ idempotencyKey: "44444444-4444-4444-4444-444444444444" });
    const input = buildInput(meta);
    const recentMatch = { id: 99, createdAt: new Date(), duplicateFingerprint: input.duplicateFingerprint };
    const { fakeDb, submissionsStore, jobsStore } = createFakeDb({ queuedSelectResults: [[], [recentMatch]] });
    const outcome = await insertDiscoverySubmission(fakeDb, input);
    check("likely-duplicate submission is still accepted (stored, never discarded)", outcome.kind === "accepted");
    if (outcome.kind === "accepted") {
      check("likely-duplicate submission is flagged withheld", outcome.withheld === true);
      check("no delivery jobs are created for a withheld submission", outcome.jobsCreated.length === 0);
      check("duplicateReviewStatus is 'pending'", submissionsStore[0]?.duplicateReviewStatus === "pending");
    }
    check("jobsStore has zero rows (withheld)", jobsStore.length === 0);
  }

  // 5. No duplicate jobs on a retried job-creation attempt (unique-constraint idempotency).
  {
    const { fakeDb, jobsStore } = createFakeDb({ queuedSelectResults: [[], []] });
    const outcome1 = await insertDiscoverySubmission(fakeDb, buildInput(makeMeta({ idempotencyKey: "55555555-5555-5555-5555-555555555555" })));
    check("first insert accepted", outcome1.kind === "accepted");
    const jobCountAfterFirst = jobsStore.length;

    if (outcome1.kind === "accepted") {
      // Simulate a retried job-creation attempt for the SAME submission id —
      // exercises the onConflictDoNothing() path directly, mirroring what a
      // retried transaction would attempt.
      const retryChain = (fakeDb as unknown as { transaction: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown> });
      await retryChain.transaction(async (tx: any) => {
        const rows = DISCOVERY_DELIVERY_JOB_TYPES.map((jobType) => ({
          submissionId: outcome1.submission.id,
          jobType,
          status: "pending",
        }));
        return tx.insert(discoveryDeliveryJobs).values(rows).onConflictDoNothing().returning({ jobType: discoveryDeliveryJobs.jobType });
      });
      check("retried job insert creates no new rows (unique constraint honored)", jobsStore.length === jobCountAfterFirst);
    }
  }

  // 6. Transaction rollback leaves no partial rows.
  {
    const { fakeDb, submissionsStore, jobsStore } = createFakeDb({ queuedSelectResults: [[], []], throwOnJobInsert: true });
    let threw = false;
    try {
      await insertDiscoverySubmission(fakeDb, buildInput(makeMeta({ idempotencyKey: "66666666-6666-6666-6666-666666666666" })));
    } catch {
      threw = true;
    }
    check("a failed job insert propagates as a rejected transaction", threw);
    check("no submission row survives the rolled-back transaction", submissionsStore.length === 0);
    check("no job row survives the rolled-back transaction", jobsStore.length === 0);
  }

  if (failures > 0) {
    console.error(`\n${failures} discoveryV1Persistence test(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll discoveryV1Persistence tests passed.");
  }
}

run();
