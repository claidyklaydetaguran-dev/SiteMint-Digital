/**
 * Receptionist-ops authentication — the routes behind the staff pages
 * `/admin/crm/receptionist-accounts`, `/admin/ops/firms`, `/admin/ops/firms/:id`
 * and their three siblings in the same nav group (Issues, Usage, Numbers).
 *
 * Every one of them used to be guarded by a bearer-only (or bearer-or-admin-
 * cookie) `requireAdmin`, so a person signed in as themselves reached the page
 * and was then refused its data. They now run through `requireCrmAuth` with a
 * named permission:
 *
 *   settings.read   every read below (all three roles hold it)
 *   settings.write  POST /api/admin/voice/issues/:id/resolve (owner, technical admin)
 *   billing.manage  PUT  /api/admin/voice/firms/:id/subscription (OWNER_ONLY)
 *
 * What is worth proving, and is proven here by attempting to cross the line
 * rather than by reading the source:
 *
 *   - a real staff session is accepted on every read those pages perform,
 *     including the signup-job feed the accounts page shows beside its list;
 *   - a staff member without the named permission is refused 403, is TOLD
 *     which permission, and — for the two writers — nothing was written
 *     anyway. A 403 that still wrote is worse than no check at all;
 *   - the subscription/Stripe-mapping writer is owner-only: a technical admin,
 *     who may resolve issues, is refused it even when holding a per-person
 *     billing.manage grant, because OWNER_ONLY grants never apply to a
 *     non-owner;
 *   - an unauthenticated request is refused 401, and so is a receptionist
 *     CUSTOMER session — the two auth systems stay separate;
 *   - staff mutations need a valid CSRF header;
 *   - the legacy shared bearer still works, so the deployment does not need a
 *     flag day, and stops working the moment CRM_LEGACY_BEARER_ENABLED=false;
 *   - the `admin_session` cookie still reaches the four routes whose previous
 *     guard accepted it (a dead staff cookie beside it changes nothing), still
 *     does NOT reach the routes whose guard never did, and is retired by the
 *     same flag. No caller loses access, and none silently gains any;
 *   - holding a shared credential cannot be used to escape a permission a live
 *     staff session lacks.
 *
 * Gated on CRM_TEST_DATABASE_URL. Every row created here is removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { eq, inArray, like } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "ops-auth-admin-secret-value";
// Both of these are read at request time, so the suite states them rather than
// inheriting whatever the developer's shell happens to hold.
delete process.env.CRM_LEGACY_BEARER_ENABLED;   // legacy bearer accepted
delete process.env.VOICE_PLAN_CATALOG_JSON;     // subscription PUT 503s in the handler

const STAMP = Date.now();
const OWNER = { email: `ops-owner-${STAMP}@example.test`, name: "[CRM-TEST] Ops Owner", password: "harbour-trellis-5521" };
const TECH = { email: `ops-tech-${STAMP}@example.test`, name: "[CRM-TEST] Ops Technical Admin", password: "copper-willow-4418" };
const MANAGER = { email: `ops-manager-${STAMP}@example.test`, name: "[CRM-TEST] Ops Manager", password: "lantern-quartz-7734" };
const OUTSIDER = { email: `ops-outsider-${STAMP}@example.test`, name: "[CRM-TEST] Ops Outsider", password: "meridian-basalt-9911" };
const FIRM_EMAIL = `ops-firm-${STAMP}@example.test`;

const suite = TEST_DB ? describe : describe.skip;

interface Reply { status: number; json: Record<string, any> }

class Agent {
  cookie = ""; csrf = "";
  constructor(private baseUrl: () => string) {}
  async call(method: string, p: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h["Cookie"] = this.cookie;
    if (this.csrf && !("x-csrf-token" in h)) h["x-csrf-token"] = this.csrf;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(`${this.baseUrl()}${p}`, {
      method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
    return { status: res.status, json };
  }
  async login(who: { email: string; password: string }): Promise<number> {
    const res = await fetch(`${this.baseUrl()}/api/crm/staff/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: who.email, password: who.password }),
    });
    this.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const data = await res.json() as { csrfToken?: string };
    this.csrf = data.csrfToken ?? "";
    return res.status;
  }
}

/** The first row of an insert/select, or a loud failure instead of `undefined.id`. */
function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected a ${what} row`);
  return row;
}

const sha256 = (raw: string): string => crypto.createHash("sha256").update(raw, "utf8").digest("hex");

suite("receptionist-ops routes accept staff sessions (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let voice: typeof import("@workspace/db/schema/voice");

  const staffIds: number[] = [];
  const adminSessionTokens: string[] = [];
  let customerToken = "";
  let firmId = 0;
  /** Resolved by an owner's staff session. */
  let openIssueId = 0;
  /** Must still be open when the suite ends: every attempt on it is one that has to be refused. */
  let untouchedIssueId = 0;
  /** Resolved by a technical admin, who holds settings.write. */
  let techIssueId = 0;
  /** Resolved by the legacy shared bearer. */
  let bearerIssueId = 0;
  /** Resolved by the legacy admin_session cookie. */
  let cookieIssueId = 0;

  const owner = new Agent(() => base);
  const tech = new Agent(() => base);
  const manager = new Agent(() => base);
  const outsider = new Agent(() => base);
  const anon = new Agent(() => base);

  /** Every read the six affected pages perform. */
  const reads = (): string[] => [
    "/api/admin/receptionist-accounts",
    "/api/crm/receptionist-signup-jobs",
    `/api/admin/voice/firms/${firmId}/diagnostics`,
    "/api/admin/voice/issues",
    "/api/admin/voice/usage",
    "/api/admin/voice/numbers",
  ];

  /** The reads whose PREVIOUS guard also accepted the admin_session cookie. (Resolve is the fourth such route.) */
  const cookieEraReads = (): string[] => [
    "/api/admin/voice/issues",
    "/api/admin/voice/usage",
    "/api/admin/voice/numbers",
  ];

  /** The reads whose previous guard never accepted that cookie. */
  const bearerOnlyEraReads = (): string[] => [
    "/api/admin/receptionist-accounts",
    "/api/crm/receptionist-signup-jobs",
    `/api/admin/voice/firms/${firmId}/diagnostics`,
  ];

  const resolvePath = (issueId: number): string => `/api/admin/voice/issues/${issueId}/resolve`;
  const subscriptionPath = (): string => `/api/admin/voice/firms/${firmId}/subscription`;

  async function issue(id: number) {
    return one(await db.select().from(voice.voiceIssues).where(eq(voice.voiceIssues.id, id)), "voice issue");
  }

  async function subscriptionRows() {
    return db.select().from(voice.voiceSubscriptions).where(eq(voice.voiceSubscriptions.firmId, firmId));
  }

  /** A fresh, valid `admin_session` cookie pair — the shared credential in its persistent form. */
  async function adminCookie(): Promise<string> {
    const { createAdminSession, ADMIN_COOKIE_NAME } = await import("../lib/admin-session.js");
    const created = await createAdminSession("127.0.0.1", "vitest");
    expect(created, "crm_admin_sessions must exist in the scratch database").toBeDefined();
    adminSessionTokens.push(created!.token);
    return `${ADMIN_COOKIE_NAME}=${created!.token}`;
  }

  async function legacyBearer(): Promise<Record<string, string>> {
    const { getSessionToken } = await import("../lib/admin-session.js");
    return { Authorization: `Bearer ${getSessionToken()}` };
  }

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    voice = await import("@workspace/db/schema/voice");
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");

    const ownerRow = one(await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning(), "owner");
    staffIds.push(ownerRow.id);

    // A technical admin holds settings.write, so may resolve issues. The
    // per-person grant of billing.manage is here to be IGNORED: it is
    // OWNER_ONLY, so no grant can put the subscription writer in this
    // person's hands.
    const techRow = one(await db.insert(schema.crmStaff).values({
      email: TECH.email, displayName: TECH.name, role: "technical_admin", status: "active",
      passwordHash: await hashPassword(TECH.password), passwordUpdatedAt: new Date(),
      extraPermissions: ["billing.manage"],
    }).returning(), "technical admin");
    staffIds.push(techRow.id);

    // An operations manager: holds settings.read (so the console opens) but not
    // settings.write and not billing.manage.
    const managerRow = one(await db.insert(schema.crmStaff).values({
      email: MANAGER.email, displayName: MANAGER.name, role: "operations_manager", status: "active",
      passwordHash: await hashPassword(MANAGER.password), passwordUpdatedAt: new Date(),
    }).returning(), "operations manager");
    staffIds.push(managerRow.id);

    // Somebody who can reach the workspace but has had the operational read
    // taken away — the 403 case for the reads themselves.
    const outsiderRow = one(await db.insert(schema.crmStaff).values({
      email: OUTSIDER.email, displayName: OUTSIDER.name, role: "operations_manager", status: "active",
      passwordHash: await hashPassword(OUTSIDER.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["settings.read", "settings.write"],
    }).returning(), "outsider");
    staffIds.push(outsiderRow.id);

    expect(await owner.login(OWNER)).toBe(200);
    expect(await tech.login(TECH)).toBe(200);
    expect(await manager.login(MANAGER)).toBe(200);
    expect(await outsider.login(OUTSIDER)).toBe(200);

    const firm = one(await db.insert(schema.intakeFirms).values({
      name: `[CRM-TEST] Ops Firm ${STAMP}`,
      practiceAreas: ["general"],
      statesServed: ["CA"],
      statuteOfLimitationsDays: 730,
      notifyEmail: FIRM_EMAIL,
      twilioNumber: "+15005550006",
      email: FIRM_EMAIL,
    }).returning(), "firm");
    firmId = firm.id;

    const addIssue = async (code: string, message: string): Promise<number> =>
      one(await db.insert(voice.voiceIssues).values({ firmId, level: "warning", code, message }).returning(), "voice issue").id;
    openIssueId = await addIssue("test_owner_resolves", "[CRM-TEST] resolved by an owner");
    untouchedIssueId = await addIssue("test_untouched", "[CRM-TEST] must stay open");
    techIssueId = await addIssue("test_tech_resolves", "[CRM-TEST] resolved by a technical admin");
    bearerIssueId = await addIssue("test_bearer_resolves", "[CRM-TEST] resolved by the legacy bearer");
    cookieIssueId = await addIssue("test_cookie_resolves", "[CRM-TEST] resolved by the legacy admin cookie");

    // A genuine receptionist customer session for the same firm.
    const { createSession } = await import("../lib/receptionistAuth.js");
    customerToken = await createSession(firmId, FIRM_EMAIL);
  }, 120_000);

  afterAll(async () => {
    if (TEST_DB) {
      if (customerToken) {
        const { destroySession } = await import("../lib/receptionistAuth.js");
        await destroySession(customerToken);
      }
      if (adminSessionTokens.length) {
        await db.delete(schema.crmAdminSessions)
          .where(inArray(schema.crmAdminSessions.tokenHash, adminSessionTokens.map(sha256)));
      }
      const issueIds = [openIssueId, untouchedIssueId, techIssueId, bearerIssueId, cookieIssueId].filter(Boolean);
      if (issueIds.length) await db.delete(voice.voiceIssues).where(inArray(voice.voiceIssues.id, issueIds));
      if (firmId) {
        await db.delete(voice.voiceSubscriptions).where(eq(voice.voiceSubscriptions.firmId, firmId));
        await db.delete(schema.intakeFirms).where(eq(schema.intakeFirms.id, firmId));
      }
      // Sessions cascade with the person.
      if (staffIds.length) await db.delete(schema.crmStaff).where(inArray(schema.crmStaff.id, staffIds));
      // The trail rows this run's refusals and sign-outs wrote (never a credential).
      await db.delete(schema.crmAdminAuditLog).where(like(schema.crmAdminAuditLog.actor, `%-${STAMP}@example.test`));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── Unauthenticated, and the other auth system ────────────────────────────

  it("refuses every receptionist-ops route with no credential at all", async () => {
    for (const path of reads()) {
      expect((await anon.call("GET", path)).status, path).toBe(401);
    }
    expect((await anon.call("POST", resolvePath(untouchedIssueId))).status).toBe(401);
    expect((await anon.call("PUT", subscriptionPath(), { planCode: "starter" })).status).toBe(401);
  });

  it("refuses a forged staff cookie rather than falling back to anything", async () => {
    const forged = new Agent(() => base);
    forged.cookie = "crm_staff_session=not-a-real-session";
    for (const path of reads()) {
      expect((await forged.call("GET", path)).status, path).toBe(401);
    }
  });

  it("refuses a receptionist CUSTOMER session — the two auth systems stay separate", async () => {
    const { COOKIE_NAME } = await import("../lib/receptionistAuth.js");
    const customer = new Agent(() => base);
    customer.cookie = `${COOKIE_NAME}=${customerToken}`;

    // The session is real: it opens the customer's own account...
    expect((await customer.call("GET", "/api/receptionist/auth/me")).status).toBe(200);

    // ...and none of the staff console, read or write.
    for (const path of reads()) {
      expect((await customer.call("GET", path)).status, path).toBe(401);
    }
    const subscriptionsBefore = await subscriptionRows();
    expect((await customer.call("POST", resolvePath(untouchedIssueId))).status).toBe(401);
    expect((await customer.call("PUT", subscriptionPath(), { planCode: "starter" })).status).toBe(401);
    expect((await issue(untouchedIssueId)).resolvedAt).toBeNull();
    expect(await subscriptionRows()).toEqual(subscriptionsBefore);
  });

  // ── A signed-in person reaches the pages ──────────────────────────────────

  it("a staff session reaches every read the pages perform, with no bearer token", async () => {
    for (const path of reads()) {
      const r = await owner.call("GET", path);
      expect(r.status, path).toBe(200);
    }

    // Data, not merely a 200: the firms list contains the firm that exists.
    const accounts = await owner.call("GET", "/api/admin/receptionist-accounts");
    expect(Array.isArray(accounts.json["accounts"])).toBe(true);
    expect((accounts.json["accounts"] as { id: number }[]).some((a) => a.id === firmId)).toBe(true);

    // ...the per-firm page answers about that firm, with all five issues open...
    const diagnostics = await owner.call("GET", `/api/admin/voice/firms/${firmId}/diagnostics`);
    expect(diagnostics.json["firmId"]).toBe(firmId);
    expect(diagnostics.json["openIssues"]).toBe(5);

    // ...and the cross-firm queue lists them.
    const issues = await owner.call("GET", "/api/admin/voice/issues");
    expect((issues.json["items"] as { id: number }[]).some((i) => i.id === untouchedIssueId)).toBe(true);

    const jobs = await owner.call("GET", "/api/crm/receptionist-signup-jobs");
    expect(Array.isArray(jobs.json["jobs"])).toBe(true);
  });

  it("an operations manager and a technical admin can run the console — settings.read is a role grant", async () => {
    for (const agent of [manager, tech]) {
      for (const path of reads()) {
        expect((await agent.call("GET", path)).status, path).toBe(200);
      }
    }
  });

  // ── Permission enforcement ────────────────────────────────────────────────

  it("refuses a staff member without settings.read, and names the permission", async () => {
    for (const path of reads()) {
      const r = await outsider.call("GET", path);
      expect(r.status, path).toBe(403);
      expect(r.json["permission"], path).toBe("settings.read");
    }
  });

  it("refuses an operations manager resolving an issue, and nothing is written", async () => {
    const r = await manager.call("POST", resolvePath(untouchedIssueId));
    expect(r.status).toBe(403);
    expect(r.json["permission"]).toBe("settings.write");
    expect((await issue(untouchedIssueId)).resolvedAt, "a 403 that still resolved the issue").toBeNull();
  });

  it("refuses an operations manager setting a subscription, and nothing is written", async () => {
    const before = await subscriptionRows();
    const r = await manager.call("PUT", subscriptionPath(), {
      planCode: "starter", stripeCustomerId: "cus_TESTSHOULDNEVERLAND",
    });
    expect(r.status).toBe(403);
    expect(r.json["permission"]).toBe("billing.manage");
    expect(await subscriptionRows(), "a 403 that still wrote the Stripe mapping").toEqual(before);
  });

  it("a technical admin may resolve an issue but not set a subscription, even holding a billing.manage grant", async () => {
    const resolved = await tech.call("POST", resolvePath(techIssueId));
    expect(resolved.status).toBe(200);
    expect((await issue(techIssueId)).resolvedAt).not.toBeNull();

    // Money is owner-only. The per-person grant on this account is ignored
    // because billing.manage is OWNER_ONLY — a ceiling, not a default.
    const before = await subscriptionRows();
    const put = await tech.call("PUT", subscriptionPath(), {
      planCode: "starter", stripeCustomerId: "cus_TESTSHOULDNEVERLAND",
    });
    expect(put.status).toBe(403);
    expect(put.json["permission"]).toBe("billing.manage");
    expect(await subscriptionRows()).toEqual(before);
  });

  it("lets an owner through the billing gate to the handler's own answer", async () => {
    const r = await owner.call("PUT", subscriptionPath(), { planCode: "starter" });
    // The gate is passed; the handler then refuses honestly because no plan
    // catalog is configured in this run. What matters is that it is neither
    // 401 nor 403 — the permission decision is no longer the blocker.
    expect([400, 503]).toContain(r.status);
    expect(String(r.json["error"])).toMatch(/VOICE_PLAN_CATALOG_JSON|catalog/i);
  });

  it("lets an owner resolve an issue, and it is actually resolved", async () => {
    const r = await owner.call("POST", resolvePath(openIssueId));
    expect(r.status).toBe(200);
    expect((await issue(openIssueId)).resolvedAt).not.toBeNull();
  });

  // ── CSRF ──────────────────────────────────────────────────────────────────

  it("rejects a staff mutation without a valid CSRF header, and nothing is written", async () => {
    const missing = await owner.call("POST", resolvePath(untouchedIssueId), undefined, { "x-csrf-token": "" });
    expect(missing.status).toBe(403);
    expect(missing.json["permission"], "a CSRF refusal is not a permission refusal").toBeUndefined();

    const wrong = await owner.call("POST", resolvePath(untouchedIssueId), undefined, {
      "x-csrf-token": "not-the-token-this-session-was-issued",
    });
    expect(wrong.status).toBe(403);
    expect((await issue(untouchedIssueId)).resolvedAt).toBeNull();

    const before = await subscriptionRows();
    const put = await owner.call("PUT", subscriptionPath(), { planCode: "starter" }, {
      "x-csrf-token": "not-the-token-this-session-was-issued",
    });
    expect(put.status).toBe(403);
    expect(await subscriptionRows()).toEqual(before);
  });

  // ── The legacy callers keep working ───────────────────────────────────────

  it("the legacy shared bearer still reaches every one of these routes", async () => {
    const bearer = await legacyBearer();
    const legacy = new Agent(() => base);   // no cookies at all

    for (const path of reads()) {
      expect((await legacy.call("GET", path, undefined, bearer)).status, path).toBe(200);
    }
    // ...including the writers, with no CSRF header, exactly as before.
    const put = await legacy.call("PUT", subscriptionPath(), { planCode: "starter" }, bearer);
    expect([400, 503]).toContain(put.status);
    const post = await legacy.call("POST", resolvePath(bearerIssueId), undefined, bearer);
    expect(post.status).toBe(200);
    expect((await issue(bearerIssueId)).resolvedAt).not.toBeNull();
  });

  it("the admin_session cookie still reaches the routes whose guard accepted it — and no others", async () => {
    const cookieAdmin = new Agent(() => base);
    cookieAdmin.cookie = await adminCookie();

    // Preserved: these routes' previous guard accepted the cookie, so working
    // pages keep working — including Resolve, with no CSRF header, as before.
    for (const path of cookieEraReads()) {
      expect((await cookieAdmin.call("GET", path)).status, path).toBe(200);
    }
    const post = await cookieAdmin.call("POST", resolvePath(cookieIssueId));
    expect(post.status).toBe(200);
    expect((await issue(cookieIssueId)).resolvedAt).not.toBeNull();

    // Not widened: these were bearer-only (or staff-only) before and still are.
    for (const path of bearerOnlyEraReads()) {
      expect((await cookieAdmin.call("GET", path)).status, path).toBe(401);
    }
    const before = await subscriptionRows();
    expect((await cookieAdmin.call("PUT", subscriptionPath(), { planCode: "starter" })).status).toBe(401);
    expect(await subscriptionRows()).toEqual(before);
  });

  it("a dead staff cookie beside the admin_session cookie changes nothing", async () => {
    // A real session, signed out: its cookie now resolves to nobody. A
    // shared-password admin whose browser still holds one from an earlier
    // sign-in must not be locked out of pages that accepted their cookie.
    const stale = new Agent(() => base);
    expect(await stale.login(MANAGER)).toBe(200);
    const deadStaffCookie = stale.cookie;
    expect((await stale.call("POST", "/api/crm/staff/logout")).status).toBe(200);
    expect((await stale.call("GET", "/api/crm/staff/me")).status, "the session should be dead").toBe(401);

    const both = new Agent(() => base);
    both.cookie = `${deadStaffCookie}; ${await adminCookie()}`;
    for (const path of cookieEraReads()) {
      expect((await both.call("GET", path)).status, path).toBe(200);
    }
    for (const path of bearerOnlyEraReads()) {
      expect((await both.call("GET", path)).status, path).toBe(401);
    }
  });

  it("CRM_LEGACY_BEARER_ENABLED=false retires the shared credential on this surface, in both forms", async () => {
    const bearer = await legacyBearer();
    const legacy = new Agent(() => base);
    const cookieAdmin = new Agent(() => base);
    cookieAdmin.cookie = await adminCookie();
    const before = await subscriptionRows();

    process.env.CRM_LEGACY_BEARER_ENABLED = "false";
    try {
      for (const path of reads()) {
        expect((await legacy.call("GET", path, undefined, bearer)).status, `bearer ${path}`).toBe(401);
        expect((await cookieAdmin.call("GET", path)).status, `cookie ${path}`).toBe(401);
      }
      expect((await legacy.call("POST", resolvePath(untouchedIssueId), undefined, bearer)).status).toBe(401);
      expect((await cookieAdmin.call("POST", resolvePath(untouchedIssueId))).status).toBe(401);
      expect((await legacy.call("PUT", subscriptionPath(), { planCode: "starter" }, bearer)).status).toBe(401);
      expect((await issue(untouchedIssueId)).resolvedAt).toBeNull();
      expect(await subscriptionRows()).toEqual(before);

      // A real staff session is unaffected by the cutover flag.
      for (const path of reads()) {
        expect((await owner.call("GET", path)).status, `staff ${path}`).toBe(200);
      }
    } finally {
      delete process.env.CRM_LEGACY_BEARER_ENABLED;
    }
  });

  it("holding a shared credential cannot be used to escape a permission a live staff session lacks", async () => {
    // The real bypass risk in keeping a fallback: a signed-in person who also
    // holds the shared credential must still be judged as themselves.
    const bearer = await legacyBearer();
    const before = await subscriptionRows();

    const managerWithShared = new Agent(() => base);
    expect(await managerWithShared.login(MANAGER)).toBe(200);
    managerWithShared.cookie = `${managerWithShared.cookie}; ${await adminCookie()}`;

    const viaCookie = await managerWithShared.call("POST", resolvePath(untouchedIssueId));
    expect(viaCookie.status).toBe(403);
    expect(viaCookie.json["permission"]).toBe("settings.write");

    const viaBearer = await managerWithShared.call("POST", resolvePath(untouchedIssueId), undefined, bearer);
    expect(viaBearer.status).toBe(403);
    expect(viaBearer.json["permission"]).toBe("settings.write");

    const put = await managerWithShared.call("PUT", subscriptionPath(), { planCode: "starter" }, bearer);
    expect(put.status).toBe(403);
    expect(put.json["permission"]).toBe("billing.manage");

    // ...and a read the person has had taken away stays taken away.
    const outsiderWithShared = new Agent(() => base);
    expect(await outsiderWithShared.login(OUTSIDER)).toBe(200);
    outsiderWithShared.cookie = `${outsiderWithShared.cookie}; ${await adminCookie()}`;
    for (const path of reads()) {
      const r = await outsiderWithShared.call("GET", path, undefined, bearer);
      expect(r.status, path).toBe(403);
      expect(r.json["permission"], path).toBe("settings.read");
    }

    expect((await issue(untouchedIssueId)).resolvedAt, "the untouched issue was resolved by somebody").toBeNull();
    expect(await subscriptionRows()).toEqual(before);
  });
});
