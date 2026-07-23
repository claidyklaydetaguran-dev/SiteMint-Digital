// Phase 2C.2D — route-level tests for POST /api/v1/discovery-submissions,
// calling the exported `handleDiscoverySubmission` handler directly with
// fake Express req/res objects and injected deps (fake db, controlled
// fingerprint config) — mirrors this repo's established pattern (no
// supertest/live-server harness exists here; contactProtection.test.ts
// takes the same "test the extracted logic directly" approach). No real
// HTTP server, no real database, no real email, no real CRM record.
//
// Run via:
//   pnpm --filter @workspace/scripts exec tsx artifacts/api-server/test/discoveryV1.test.ts
import { discoverySubmissions } from "@workspace/db/schema";
import { discoveryDeliveryJobs } from "@workspace/db/schema/discovery";
import { handleDiscoverySubmission, type DiscoveryV1Deps } from "../src/routes/discoveryV1";
import type { DiscoveryFingerprintConfigResult } from "../src/lib/discoveryFingerprintConfig";
import { discoveryV1IpLimiter } from "../src/lib/discoveryV1Protection";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

// ── Fake req/res ─────────────────────────────────────────────────────────

function fakeReqRes(body: unknown, ip = "203.0.113.1") {
  const logs: { level: string; args: unknown[] }[] = [];
  const req = {
    body,
    headers: { "x-forwarded-for": ip },
    ip,
    socket: { remoteAddress: ip },
    log: {
      info: (...args: unknown[]) => logs.push({ level: "info", args }),
      warn: (...args: unknown[]) => logs.push({ level: "warn", args }),
      error: (...args: unknown[]) => logs.push({ level: "error", args }),
    },
  };
  let statusCode = 0;
  let jsonBody: unknown = undefined;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      jsonBody = body;
      return this;
    },
  };
  return {
    req: req as unknown as Parameters<typeof handleDiscoverySubmission>[0],
    res: res as unknown as Parameters<typeof handleDiscoverySubmission>[1],
    getStatus: () => statusCode,
    getBody: () => jsonBody,
    getLogs: () => logs,
  };
}

// ── Fake DB (same shape as discoveryV1Persistence.test.ts) ─────────────────

function createFakeDb(queuedSelectResults: unknown[][] = []) {
  let selectCallIndex = 0;
  const submissionsStore: Record<string, unknown>[] = [];
  const jobsStore: Record<string, unknown>[] = [];
  let nextId = 1;

  function selectChain() {
    return {
      from(_t: unknown) {
        return {
          where(_c: unknown) {
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
        const doReturning = async (projection?: Record<string, unknown>) => {
          if (table === discoverySubmissions) {
            const inserted = rows.map((r) => ({
              id: nextId++,
              createdAt: new Date(),
              updatedAt: new Date(),
              leadScore: 1,
              tags: [],
              recommendedPackage: null,
              leadId: null,
              ...(r as Record<string, unknown>),
            }));
            submissionsStore.push(...inserted);
            return inserted;
          }
          if (table === discoveryDeliveryJobs) {
            const inserted = rows.map((r) => ({ ...(r as Record<string, unknown>) }));
            jobsStore.push(...inserted);
            if (projection) {
              return inserted.map((r) => {
                const out: Record<string, unknown> = {};
                for (const key of Object.keys(projection)) out[key] = r[key];
                return out;
              });
            }
            return inserted;
          }
          throw new Error("unsupported table");
        };
        return {
          returning: doReturning,
          onConflictDoNothing: () => ({ returning: doReturning }),
        };
      },
    };
  }
  const tx = { insert: insertChain };
  const fakeDb = {
    select: selectChain,
    async transaction<T>(cb: (tx: typeof tx) => Promise<T>): Promise<T> {
      return cb(tx);
    },
  };

  return { fakeDb, submissionsStore, jobsStore };
}

const OK_FINGERPRINT_CONFIG: DiscoveryFingerprintConfigResult = {
  ok: true,
  config: { key: "test-only-key", keyVersion: "v1" },
};

const ANSWERS = {
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

function makeBody(overrides: { meta?: Record<string, unknown>; answers?: unknown } = {}) {
  return {
    meta: {
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      formVersion: "1.0.0",
      schemaVersion: "1.0.0",
      formStartedAt: new Date(Date.now() - 60_000).toISOString(),
      ...overrides.meta,
    },
    answers: overrides.answers ?? ANSWERS,
  };
}

async function run() {
  // 1. HMAC config missing → fail closed, 503, no secret name/value leaked.
  {
    const { fakeDb } = createFakeDb();
    const deps: DiscoveryV1Deps = { db: fakeDb as never, loadFingerprintConfig: () => ({ ok: false, reason: "DISCOVERY_FINGERPRINT_HMAC_KEY is not set" }) };
    const { req, res, getStatus, getBody } = fakeReqRes(makeBody());
    await handleDiscoverySubmission(req, res, deps);
    check("missing HMAC config returns 503", getStatus() === 503);
    const body = getBody() as Record<string, unknown>;
    check("503 body uses the safe temporarily_unavailable code", body?.code === "temporarily_unavailable");
    check("503 body never mentions the env var name", !JSON.stringify(body).includes("DISCOVERY_FINGERPRINT_HMAC_KEY"));
    check("503 body never mentions a key value", !JSON.stringify(body).includes("test-only-key"));
  }

  // 2. Valid submission → 201, accepted, jobs created.
  {
    const { fakeDb, submissionsStore, jobsStore } = createFakeDb([[], []]);
    const deps: DiscoveryV1Deps = { db: fakeDb as never, loadFingerprintConfig: () => OK_FINGERPRINT_CONFIG };
    const { req, res, getStatus, getBody } = fakeReqRes(makeBody({ meta: { idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }));
    await handleDiscoverySubmission(req, res, deps);
    check("valid submission returns 201", getStatus() === 201);
    const body = getBody() as Record<string, unknown>;
    check("201 body has status 'received'", body?.status === "received");
    check("201 body has a string reference", typeof body?.reference === "string" && (body.reference as string).length > 0);
    check("submission row was persisted", submissionsStore.length === 1);
    check("3 delivery job rows were created", jobsStore.length === 3);
  }

  // 3. Unknown/invalid fields → 400 validation_error with field errors.
  {
    const { fakeDb } = createFakeDb();
    const deps: DiscoveryV1Deps = { db: fakeDb as never, loadFingerprintConfig: () => OK_FINGERPRINT_CONFIG };
    const badBody = makeBody({ answers: { ...ANSWERS, extraUnknownField: "nope" } });
    const { req, res, getStatus, getBody } = fakeReqRes(badBody);
    await handleDiscoverySubmission(req, res, deps);
    check("unknown top-level field is rejected with 400", getStatus() === 400);
    const body = getBody() as Record<string, unknown>;
    check("400 body uses validation_error code", body?.code === "validation_error");
    check("400 body carries fieldErrors array", Array.isArray(body?.fieldErrors));
  }

  // 4. Missing required field → 400 validation_error.
  {
    const { fakeDb } = createFakeDb();
    const deps: DiscoveryV1Deps = { db: fakeDb as never, loadFingerprintConfig: () => OK_FINGERPRINT_CONFIG };
    const { contact: _contact, ...answersWithoutContact } = ANSWERS;
    void _contact;
    const badBody = makeBody({ answers: answersWithoutContact });
    const { req, res, getStatus, getBody } = fakeReqRes(badBody);
    await handleDiscoverySubmission(req, res, deps);
    check("missing required top-level section is rejected with 400", getStatus() === 400);
    check("validation_error code on missing field", (getBody() as Record<string, unknown>)?.code === "validation_error");
  }

  // 5. Honeypot tripped → neutral 400.
  {
    const { fakeDb } = createFakeDb();
    const deps: DiscoveryV1Deps = { db: fakeDb as never, loadFingerprintConfig: () => OK_FINGERPRINT_CONFIG };
    const body = makeBody({ meta: { honeypot: "i-am-a-bot" } });
    const { req, res, getStatus, getBody } = fakeReqRes(body);
    await handleDiscoverySubmission(req, res, deps);
    check("honeypot trip returns 400", getStatus() === 400);
    check("honeypot response uses submission_review code", (getBody() as Record<string, unknown>)?.code === "submission_review");
  }

  // 6. Implausibly fast completion → same neutral 400 shape as honeypot.
  {
    const { fakeDb } = createFakeDb();
    const deps: DiscoveryV1Deps = { db: fakeDb as never, loadFingerprintConfig: () => OK_FINGERPRINT_CONFIG };
    const body = makeBody({ meta: { formStartedAt: new Date().toISOString() } });
    const { req, res, getStatus, getBody } = fakeReqRes(body);
    await handleDiscoverySubmission(req, res, deps);
    check("implausibly fast submission returns 400", getStatus() === 400);
    check(
      "fast-submission response is indistinguishable from honeypot (same code)",
      (getBody() as Record<string, unknown>)?.code === "submission_review",
    );
  }

  // 7. Idempotency conflict → 409.
  {
    const existingRow = { id: 7, idempotencyPayloadHash: "a-totally-different-hash" };
    const { fakeDb } = createFakeDb([[existingRow]]);
    const deps: DiscoveryV1Deps = { db: fakeDb as never, loadFingerprintConfig: () => OK_FINGERPRINT_CONFIG };
    const { req, res, getStatus, getBody } = fakeReqRes(makeBody({ meta: { idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } }));
    await handleDiscoverySubmission(req, res, deps);
    check("idempotency conflict returns 409", getStatus() === 409);
    check("409 body uses idempotency_conflict code", (getBody() as Record<string, unknown>)?.code === "idempotency_conflict");
  }

  // 8. Rate limiting — the (limit+1)th request from the same IP is blocked.
  // Uses a working fingerprint config: the rate-limit check runs before
  // validation/persistence, so an OK config that never reaches persistence
  // (queuedSelectResults left empty — irrelevant, since these calls never
  // get that far once the limiter trips) is fine; a fail-closed config
  // would return 503 for every request before ever reaching the limiter.
  {
    const { fakeDb } = createFakeDb();
    const deps: DiscoveryV1Deps = { db: fakeDb as never, loadFingerprintConfig: () => OK_FINGERPRINT_CONFIG };
    const rateLimitIp = "198.51.100.77";
    for (let i = 0; i < 10; i++) {
      const { req, res } = fakeReqRes(makeBody(), rateLimitIp);
      await handleDiscoverySubmission(req, res, deps);
    }
    const { req, res, getStatus, getBody } = fakeReqRes(makeBody(), rateLimitIp);
    await handleDiscoverySubmission(req, res, deps);
    check("11th request from the same IP is rate-limited (429)", getStatus() === 429);
    check("429 body uses rate_limited code", (getBody() as Record<string, unknown>)?.code === "rate_limited");
  }

  // 9. No PII in logs — verify no log call anywhere included the raw answers object or email.
  {
    const { fakeDb } = createFakeDb([[], []]);
    const deps: DiscoveryV1Deps = { db: fakeDb as never, loadFingerprintConfig: () => OK_FINGERPRINT_CONFIG };
    const { req, res, getLogs } = fakeReqRes(makeBody({ meta: { idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" } }));
    await handleDiscoverySubmission(req, res, deps);
    const serializedLogs = JSON.stringify(getLogs());
    check("no log call contains the contact email", !serializedLogs.includes("jane@example.com"));
    check("no log call contains the free-text business description", !serializedLogs.includes("losing walk-in"));
  }

  if (failures > 0) {
    console.error(`\n${failures} discoveryV1 route test(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll discoveryV1 route tests passed.");
  }
}

// Reset the shared rate limiter's module-level state isn't possible between
// runs of this file (it's a singleton), but each `run()` invocation here
// only executes once per process, and test 8 uses a dedicated IP no other
// test in this file reuses, so cross-test interference is not a concern.
void discoveryV1IpLimiter;
run();
