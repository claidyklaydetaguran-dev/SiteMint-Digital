/**
 * Getting a new security token for a session that is still alive — for CRM
 * staff, and for a customer in the portal.
 *
 * The problem both endpoints exist for: the CSRF token is handed to the browser
 * once and only its hash is kept, so a browser that lost it (storage cleared, a
 * second tab, or simply a NEW tab in the portal, which keeps its token per tab)
 * held a perfectly valid session that could not write anything, and the refusal
 * told people to refresh, which cannot put a token back.
 *
 * What has to be true, and is attempted here rather than read from the source:
 *
 *   - a live session with no token is refused with a machine-readable code, can
 *     ask for a new token, and the same write then succeeds;
 *   - issuing rotates: the previous token stops working immediately;
 *   - no live session gets nothing (401), whatever it presents;
 *   - a request that did not come from our own pages gets nothing: no custom
 *     header, or an Origin the CORS policy and this host both reject;
 *   - a token is not authority. An MFA-pending session may hold a freshly issued
 *     token and still cannot reach a protected route;
 *   - the two systems stay separate: a staff cookie cannot mint a portal token,
 *     and a portal cookie cannot mint a staff one;
 *   - the endpoint is rate limited per session, and never cached.
 *
 * Gated on CRM_TEST_DATABASE_URL. Every row created here is removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray, like } from "drizzle-orm";

import { CSRF_REISSUE_LIMIT, REISSUE_REQUEST_HEADER } from "../lib/csrfRecovery.js";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
// Stated rather than inherited: the Origin assertions below are about exactly
// this allowlist. Every suite in this package uses the same value.
process.env.CORS_ALLOWED_ORIGINS = "https://example.test";
process.env.ADMIN_PASSWORD = "csrf-recovery-admin-secret";
process.env.CRM_EMAIL_TEST_MODE = "true";

const STAMP = Date.now();
const OWNER = { email: `csrf-owner-${STAMP}@example.test`, name: "[CRM-TEST] Token Owner", password: "willow-cinder-4419" };
const GUARDED = { email: `csrf-mfa-${STAMP}@example.test`, name: "[CRM-TEST] Token MFA", password: "basalt-harbour-8832" };
const CUSTOMER_PASSWORD = "riverbank-thimble-2244";

const STAFF_REISSUE = "/api/crm/staff/session/csrf";
const PORTAL_REISSUE = "/api/portal/session/csrf";

const suite = TEST_DB ? describe : describe.skip;

interface Reply { status: number; json: Record<string, any>; text: string; headers: Headers }

class Agent {
  cookie = ""; csrf = "";
  constructor(private baseUrl: () => string, private csrfHeader = "x-csrf-token") {}
  async call(method: string, p: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h["Cookie"] = this.cookie;
    if (this.csrf && !(this.csrfHeader in h)) h[this.csrfHeader] = this.csrf;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(`${this.baseUrl()}${p}`, {
      method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  /** The browser's own ask: the custom header, and nothing else by default. */
  reissue(path: string, headers: Record<string, string> = {}): Promise<Reply> {
    return this.call("POST", path, undefined, { [REISSUE_REQUEST_HEADER]: "1", ...headers });
  }
  async login(who: { email: string; password: string }): Promise<Reply> {
    const res = await fetch(`${this.baseUrl()}/api/crm/staff/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: who.email, password: who.password }),
    });
    this.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    const json = text ? JSON.parse(text) as Record<string, any> : {};
    this.csrf = typeof json["csrfToken"] === "string" ? json["csrfToken"] : "";
    return { status: res.status, json, text, headers: res.headers };
  }
}

suite("a live session can be given a new security token (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: number[] = [];
  let leadId = 0;
  let ownerStaffId = 0;

  const owner = new Agent(() => base);
  const guarded = new Agent(() => base);
  const anon = new Agent(() => base);
  /** The same browser session as `owner`, with the token lost. */
  const lostToken = new Agent(() => base);
  /** The customer, and a second tab of the same session with no token. */
  const customer = new Agent(() => base, "x-portal-csrf");
  const newTab = new Agent(() => base, "x-portal-csrf");

  const ownName = () => `[CRM-TEST] Token Owner ${STAMP}`;

  async function displayName(email: string): Promise<string> {
    const [row] = await db.select().from(schema.crmStaff).where(eq(schema.crmStaff.email, email));
    return row?.displayName ?? "";
  }

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword, generateTotpSecret } = await import("../lib/staffCredentials.js");

    const [ownerRow] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    ownerStaffId = ownerRow.id;
    staffIds.push(ownerRow.id);

    // Enrolled in MFA, so a sign-in stops at the challenge.
    const [guardedRow] = await db.insert(schema.crmStaff).values({
      email: GUARDED.email, displayName: GUARDED.name, role: "owner", status: "active",
      passwordHash: await hashPassword(GUARDED.password), passwordUpdatedAt: new Date(),
      mfaSecret: generateTotpSecret(), mfaEnrolledAt: new Date(),
    }).returning();
    staffIds.push(guardedRow.id);

    expect((await owner.login(OWNER)).status).toBe(200);
    lostToken.cookie = owner.cookie; // same session, no token

    const [lead] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Token Customer",
      email: `csrf-customer-${STAMP}@example.test`,
      status: "Client",
    }).returning();
    leadId = lead.id;

    const invited = await owner.call("POST", "/api/crm/portal/invitations", { leadId });
    expect(invited.status, invited.text.slice(0, 200)).toBe(201);
    const accepted = await fetch(`${base}/api/portal/invitations/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: invited.json["inviteToken"], password: CUSTOMER_PASSWORD }),
    });
    expect(accepted.status).toBe(201);
    customer.cookie = accepted.headers.getSetCookie()
      .map((c) => c.split(";")[0]).filter((c) => c.startsWith("crm_portal_session=")).join("; ");
    customer.csrf = (await accepted.json() as { csrfToken: string }).csrfToken;
    newTab.cookie = customer.cookie; // same session, a tab with no token
  }, 120_000);

  afterAll(async () => {
    if (TEST_DB) {
      if (leadId) {
        const accounts = await db.select({ id: schema.crmPortalAccounts.id })
          .from(schema.crmPortalAccounts).where(eq(schema.crmPortalAccounts.leadId, leadId));
        if (accounts.length) {
          await db.delete(schema.crmPortalSessions)
            .where(inArray(schema.crmPortalSessions.portalAccountId, accounts.map((a) => a.id)));
        }
        await db.delete(schema.crmPortalInvitations).where(eq(schema.crmPortalInvitations.leadId, leadId));
        await db.delete(schema.crmPortalAccounts).where(eq(schema.crmPortalAccounts.leadId, leadId));
        await db.delete(schema.crmActivities).where(eq(schema.crmActivities.leadId, leadId));
        await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
      }
      if (staffIds.length) await db.delete(schema.crmStaff).where(inArray(schema.crmStaff.id, staffIds));
      await db.delete(schema.crmAdminAuditLog).where(like(schema.crmAdminAuditLog.actor, `%-${STAMP}@example.test`));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── The staff session ─────────────────────────────────────────────────────

  it("refuses a write whose token is missing, in a way a client can act on", async () => {
    const refused = await lostToken.call("PATCH", "/api/crm/staff/me", { displayName: ownName() });
    expect(refused.status).toBe(403);
    expect(refused.json["code"]).toBe("csrf_token_invalid");
    expect(String(refused.json["error"])).not.toMatch(/refresh/i);
    expect(refused.json["permission"], "a token refusal is not a permission refusal").toBeUndefined();
    expect(await displayName(OWNER.email), "a refused write landed anyway").toBe(OWNER.name);
  });

  it("issues a new token to that session, and the same write then succeeds", async () => {
    const issued = await lostToken.reissue(STAFF_REISSUE);
    expect(issued.status).toBe(200);
    const token = issued.json["csrfToken"] as string;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    // A credential for this session: never cached, and never a second cookie.
    expect(issued.headers.get("cache-control")).toBe("no-store");
    expect(issued.headers.getSetCookie().length).toBe(0);
    // The session token itself must not be echoed where script could read it.
    expect(issued.text).not.toContain(owner.cookie.split("=")[1] ?? "never");

    lostToken.csrf = token;
    const saved = await lostToken.call("PATCH", "/api/crm/staff/me", { displayName: ownName() });
    expect(saved.status).toBe(200);
    expect(await displayName(OWNER.email)).toBe(ownName());
  });

  it("rotates: the token the session held before stops working", async () => {
    expect(owner.csrf.length).toBeGreaterThan(0);
    const stale = await owner.call("PATCH", "/api/crm/staff/me", { displayName: "[CRM-TEST] stale token" });
    expect(stale.status).toBe(403);
    expect(stale.json["code"]).toBe("csrf_token_invalid");
    expect(await displayName(OWNER.email)).toBe(ownName());
    owner.csrf = lostToken.csrf; // keep the agent usable for later tests
  });

  it("records the re-issue against the person, without recording the token", async () => {
    const audit = await owner.call("GET", "/api/crm/staff/audit?limit=100");
    expect(audit.status).toBe(200);
    const entries = audit.json["entries"] as { actor: string; action: string; target: string | null }[];
    const mine = entries.filter((e) => e.action === "staff.csrf.reissued" && e.actor.includes(OWNER.email));
    expect(mine.length).toBeGreaterThan(0);
    expect(JSON.stringify(entries)).not.toContain(lostToken.csrf);
  });

  // ── Who may ask ───────────────────────────────────────────────────────────

  it("gives nothing to a caller with no live session", async () => {
    expect((await anon.reissue(STAFF_REISSUE)).status).toBe(401);

    const forged = new Agent(() => base);
    forged.cookie = "crm_staff_session=not-a-real-session";
    expect((await forged.reissue(STAFF_REISSUE)).status).toBe(401);
  });

  it("refuses a request that did not come from our own pages", async () => {
    // No custom header: this is what an HTML form from another site could send.
    const bare = await lostToken.call("POST", STAFF_REISSUE);
    expect(bare.status).toBe(403);
    expect(bare.json["code"]).toBe("reissue_request_refused");

    for (const origin of ["https://attacker.test", "https://example.test.attacker.test", "null"]) {
      const foreign = await lostToken.reissue(STAFF_REISSUE, { Origin: origin });
      expect(foreign.status, origin).toBe(403);
      expect(foreign.json["code"], origin).toBe("reissue_request_refused");
    }
  });

  it("accepts the allowlisted origin, and this server's own", async () => {
    const allowed = await lostToken.reissue(STAFF_REISSUE, { Origin: "https://example.test" });
    expect(allowed.status).toBe(200);
    lostToken.csrf = allowed.json["csrfToken"] as string;

    const ownOrigin = await lostToken.reissue(STAFF_REISSUE, { Origin: base });
    expect(ownOrigin.status).toBe(200);
    lostToken.csrf = ownOrigin.json["csrfToken"] as string;
    owner.csrf = lostToken.csrf;
  });

  // ── A token is not authority ──────────────────────────────────────────────

  it("cannot be used to skip multi-factor verification", async () => {
    const login = await guarded.login(GUARDED);
    expect(login.status).toBe(200);
    expect(login.json["mfaRequired"]).toBe(true);

    // The session exists but has not satisfied the challenge.
    const blocked = await guarded.call("PATCH", "/api/crm/staff/me", { displayName: "[CRM-TEST] before mfa" });
    expect(blocked.status).toBe(401);
    expect(blocked.json["mfaRequired"]).toBe(true);

    // It may hold a freshly issued token — sign-in already gives it one — and
    // that changes nothing: the gate refuses after the token check.
    const issued = await guarded.reissue(STAFF_REISSUE);
    expect(issued.status).toBe(200);
    guarded.csrf = issued.json["csrfToken"] as string;

    const still = await guarded.call("PATCH", "/api/crm/staff/me", { displayName: "[CRM-TEST] after a fresh token" });
    expect(still.status, "a fresh token satisfied the MFA challenge").toBe(401);
    expect(still.json["mfaRequired"]).toBe(true);
    expect(await displayName(GUARDED.email)).toBe(GUARDED.name);
  });

  it("is limited per session", async () => {
    const busy = new Agent(() => base);
    expect((await busy.login(OWNER)).status).toBe(200);

    let refusedAt = -1;
    for (let i = 0; i <= CSRF_REISSUE_LIMIT; i++) {
      const r = await busy.reissue(STAFF_REISSUE);
      if (r.status === 429) { refusedAt = i; break; }
      expect(r.status, `re-issue ${i}`).toBe(200);
    }
    expect(refusedAt, "the endpoint can be asked without limit").toBe(CSRF_REISSUE_LIMIT);
    // Another session is unaffected: the limit is per session, not per person.
    expect((await lostToken.reissue(STAFF_REISSUE)).status).toBe(200);
    lostToken.csrf = ""; // whatever it now holds is stale for this agent
  }, 60_000);

  // ── The two systems stay separate ─────────────────────────────────────────

  it("will not mint a portal token for a staff cookie, or a staff token for a customer", async () => {
    const staffAskingForPortal = new Agent(() => base, "x-portal-csrf");
    staffAskingForPortal.cookie = owner.cookie;
    expect((await staffAskingForPortal.reissue(PORTAL_REISSUE)).status).toBe(401);

    const customerAskingForStaff = new Agent(() => base);
    customerAskingForStaff.cookie = customer.cookie;
    expect((await customerAskingForStaff.reissue(STAFF_REISSUE)).status).toBe(401);
  });

  // ── The customer portal ───────────────────────────────────────────────────

  it("a portal tab with no token is refused, gets one, and can then write", async () => {
    // A new tab: `sessionStorage` is per tab, so this is the ordinary case, not
    // an edge one. The cookie is live; the token was never in this tab.
    const refused = await newTab.call("POST", "/api/portal/logout");
    expect(refused.status).toBe(403);
    expect(refused.json["code"]).toBe("csrf_token_invalid");
    expect(String(refused.json["error"])).not.toMatch(/refresh/i);

    const issued = await newTab.reissue(PORTAL_REISSUE);
    expect(issued.status).toBe(200);
    expect(issued.headers.get("cache-control")).toBe("no-store");
    const token = issued.json["csrfToken"] as string;
    expect(typeof token).toBe("string");
    expect(token).not.toBe(customer.csrf);
    newTab.csrf = token;

    // The other tab's token was rotated away, exactly as for staff.
    const stale = await customer.call("POST", "/api/portal/logout");
    expect(stale.status).toBe(403);
    expect(stale.json["code"]).toBe("csrf_token_invalid");

    // ...and the write the new tab was refused now goes through.
    const out = await newTab.call("POST", "/api/portal/logout");
    expect(out.status).toBe(200);
  });

  it("gives a portal token to nobody without a live portal session", async () => {
    // The session above was just ended, so the same cookie now resolves to nobody.
    expect((await newTab.reissue(PORTAL_REISSUE)).status).toBe(401);
    expect((await anon.reissue(PORTAL_REISSUE)).status).toBe(401);
  });

  it("refuses a portal request that did not come from our own pages", async () => {
    const tab = new Agent(() => base, "x-portal-csrf");
    tab.cookie = customer.cookie;
    // Refused before the session is even looked at, so a foreign page cannot
    // use the answer to learn whether somebody is signed in.
    expect((await tab.call("POST", PORTAL_REISSUE)).status).toBe(403);
    const foreign = await tab.reissue(PORTAL_REISSUE, { Origin: "https://attacker.test" });
    expect(foreign.status).toBe(403);
    expect(foreign.json["code"]).toBe("reissue_request_refused");
  });

  it("keeps the owner's own session working throughout", async () => {
    // Nothing above should have cost the signed-in person their session.
    expect((await owner.call("GET", "/api/crm/staff/me")).status).toBe(200);
    expect(ownerStaffId).toBeGreaterThan(0);
  });
});
