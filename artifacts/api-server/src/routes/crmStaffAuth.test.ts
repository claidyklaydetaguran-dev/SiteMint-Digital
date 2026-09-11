/**
 * M1 acceptance — individual staff accounts, secure sessions, permissions.
 *
 * Runs the real Express app against a real PostgreSQL, and proves the security
 * boundaries by attempting to cross them: a forbidden call must be refused by
 * the API itself, not merely hidden in the UI.
 *
 * Gated on CRM_TEST_DATABASE_URL (an isolated, disposable database with the
 * schema provisioned). Without it the suite skips, so CI without a database
 * stays green. Every row created here is removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type express from "express";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;

process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "m1-bootstrap-admin-secret";
delete process.env.TRUSTED_PROXY_HOPS; // default: trust no forwarded header

const STAMP = Date.now();
const OWNER = { email: `m1-owner-${STAMP}@example.test`, name: "[CRM-TEST] Owner", password: "owner-trellis-4417-kx" };
const TECH = { email: `m1-tech-${STAMP}@example.test`, name: "[CRM-TEST] Technical", password: "tech-lantern-9928-qz" };
const OPS = { email: `m1-ops-${STAMP}@example.test`, name: "[CRM-TEST] Operations", password: "ops-harbour-3361-vm" };

const suite = TEST_DB ? describe : describe.skip;

interface Reply { status: number; json: Record<string, any>; setCookie: string[] }

suite("M1 staff accounts, sessions and permissions (real DB)", () => {
  let server: http.Server;
  let base: string;

  /** One signed-in browser: cookie jar + CSRF token. */
  class Agent {
    cookie = "";
    csrf = "";
    async call(method: string, p: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Reply> {
      const headers: Record<string, string> = { ...extraHeaders };
      if (this.cookie) headers["Cookie"] = this.cookie;
      if (this.csrf && !("x-csrf-token" in extraHeaders)) headers["x-csrf-token"] = this.csrf;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(`${base}${p}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual",
      });
      const setCookie = res.headers.getSetCookie?.() ?? [];
      for (const c of setCookie) {
        const pair = c.split(";")[0];
        if (pair.startsWith("crm_staff_session=")) {
          this.cookie = pair.endsWith("=") ? "" : pair;
        }
      }
      const text = await res.text();
      let json: Record<string, any> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
      return { status: res.status, json, setCookie };
    }
    async login(who: { email: string; password: string }) {
      const r = await this.call("POST", "/api/crm/staff/login", { email: who.email, password: who.password });
      if (typeof r.json["csrfToken"] === "string") this.csrf = r.json["csrfToken"];
      return r;
    }
  }

  const owner = new Agent();
  const tech = new Agent();
  const ops = new Agent();
  const anon = new Agent();

  const ids: Record<string, number> = {};

  beforeAll(async () => {
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: express.Express };
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // A previous run's rows would make bootstrap refuse; start from empty.
    const { db, crmStaff, crmStaffLoginAttempts } = await import("@workspace/db");
    await db.delete(crmStaff);
    await db.delete(crmStaffLoginAttempts);
  }, 60_000);

  afterAll(async () => {
    if (TEST_DB) {
      const { db, crmStaff, crmStaffLoginAttempts } = await import("@workspace/db");
      await db.delete(crmStaff);              // cascades sessions + tokens
      await db.delete(crmStaffLoginAttempts);
    }
    await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  }, 60_000);

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  it("refuses to bootstrap without the server's admin password", async () => {
    const r = await anon.call("POST", "/api/crm/staff/bootstrap", {
      adminPassword: "wrong", email: OWNER.email, displayName: OWNER.name, password: OWNER.password,
    });
    expect(r.status).toBe(401);
  });

  it("refuses a weak first-owner password", async () => {
    const r = await anon.call("POST", "/api/crm/staff/bootstrap", {
      adminPassword: "m1-bootstrap-admin-secret", email: OWNER.email, displayName: OWNER.name, password: "short",
    });
    expect(r.status).toBe(400);
    expect(String(r.json["error"])).toContain("12 characters");
  });

  it("creates the first owner from the server's admin password", async () => {
    const r = await anon.call("POST", "/api/crm/staff/bootstrap", {
      adminPassword: "m1-bootstrap-admin-secret", email: OWNER.email, displayName: OWNER.name, password: OWNER.password,
    });
    expect(r.status).toBe(201);
    expect(r.json["staff"].role).toBe("owner");
    expect(r.json["staff"].status).toBe("active");
    // The response must never carry credential material.
    expect(JSON.stringify(r.json)).not.toContain(OWNER.password);
    expect(JSON.stringify(r.json)).not.toContain("passwordHash");
    ids["owner"] = r.json["staff"].id;
  });

  it("refuses a second bootstrap once any staff row exists", async () => {
    const r = await anon.call("POST", "/api/crm/staff/bootstrap", {
      adminPassword: "m1-bootstrap-admin-secret", email: `intruder-${STAMP}@example.test`,
      displayName: "Intruder", password: "intruder-marlin-7742",
    });
    expect(r.status).toBe(409);
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  it("rejects a wrong password without revealing which half was wrong", async () => {
    const r = await anon.call("POST", "/api/crm/staff/login", { email: OWNER.email, password: "not-the-password" });
    expect(r.status).toBe(401);
    const unknown = await anon.call("POST", "/api/crm/staff/login", {
      email: `nobody-${STAMP}@example.test`, password: "not-the-password",
    });
    expect(unknown.status).toBe(401);
    // Identical message for "wrong password" and "no such account".
    expect(r.json["error"]).toBe(unknown.json["error"]);
  });

  it("signs the owner in and issues an httpOnly session cookie plus a CSRF token", async () => {
    const r = await owner.login(OWNER);
    expect(r.status).toBe(200);
    expect(typeof r.json["csrfToken"]).toBe("string");
    const cookie = r.setCookie.find((c) => c.startsWith("crm_staff_session="));
    expect(cookie).toBeDefined();
    expect(cookie!.toLowerCase()).toContain("httponly");
    expect(cookie!.toLowerCase()).toContain("samesite=lax");
    // The session token must not be echoed in the body where JS could read it.
    expect(JSON.stringify(r.json)).not.toContain(cookie!.split("=")[1].split(";")[0]);
  });

  it("refuses CRM staff data with no session at all", async () => {
    const r = await anon.call("GET", "/api/crm/staff/me");
    expect(r.status).toBe(401);
  });

  // ── CSRF ──────────────────────────────────────────────────────────────────

  it("rejects a mutating request that carries the cookie but no CSRF header", async () => {
    const r = await owner.call("PATCH", "/api/crm/staff/me", { displayName: "Forged Name" }, { "x-csrf-token": "" });
    expect(r.status).toBe(403);
    const check = await owner.call("GET", "/api/crm/staff/me");
    expect(check.json["staff"].displayName).toBe(OWNER.name);
  });

  it("rejects a mutating request whose CSRF token belongs to another session", async () => {
    const r = await owner.call("PATCH", "/api/crm/staff/me", { displayName: "Forged" }, { "x-csrf-token": "not-the-token" });
    expect(r.status).toBe(403);
  });

  // ── Inviting the other two ────────────────────────────────────────────────

  it("invites the technical administrator and the operations manager", async () => {
    for (const [key, who, role] of [
      ["tech", TECH, "technical_admin"], ["ops", OPS, "operations_manager"],
    ] as const) {
      const r = await owner.call("POST", "/api/crm/staff", {
        email: who.email, displayName: who.name, role,
      });
      expect(r.status).toBe(201);
      expect(r.json["staff"].status).toBe("invited");
      expect(typeof r.json["activationToken"]).toBe("string");
      // Delivery is honest about not being email.
      expect(r.json["delivery"]).toBe("manual");
      ids[key] = r.json["staff"].id;
      ids[`${key}Token`] = r.json["activationToken"];
    }
  });

  it("an invited account cannot sign in before activation", async () => {
    const r = await anon.call("POST", "/api/crm/staff/login", { email: TECH.email, password: TECH.password });
    expect(r.status).toBe(401);
  });

  it("activation sets the password exactly once and the token cannot be replayed", async () => {
    const token = ids["techToken"] as unknown as string;
    const first = await anon.call("POST", "/api/crm/staff/activation", { token, password: TECH.password });
    expect(first.status).toBe(200);

    const replay = await anon.call("POST", "/api/crm/staff/activation", { token, password: "another-quartz-8830" });
    expect(replay.status).toBe(404);

    // And the password that was actually set is the first one.
    const login = await tech.login(TECH);
    expect(login.status).toBe(200);
  });

  it("rejects an unknown or tampered activation token", async () => {
    const r = await anon.call("POST", "/api/crm/staff/activation", {
      token: "not-a-real-token", password: "some-valid-quartz-81",
    });
    expect(r.status).toBe(404);
  });

  // ── Permission enforcement at the API, not the UI ─────────────────────────

  it("activates operations and confirms the role's own grants", async () => {
    const activated = await anon.call("POST", "/api/crm/staff/activation", {
      token: ids["opsToken"] as unknown as string, password: OPS.password,
    });
    expect(activated.status).toBe(200);
    const login = await ops.login(OPS);
    expect(login.status).toBe(200);
    const perms: string[] = login.json["staff"].permissions;
    expect(perms).toContain("projects.write");
    expect(perms).toContain("tasks.assign");
    // Not implied by having a workspace:
    expect(perms).not.toContain("data.export");
    expect(perms).not.toContain("staff.read");
    expect(perms).not.toContain("campaigns.send");
    expect(perms).not.toContain("leads.delete");
  });

  it("refuses operations direct API access to the staff directory", async () => {
    const r = await ops.call("GET", "/api/crm/staff");
    expect(r.status).toBe(403);
    expect(r.json["permission"]).toBe("staff.read");
  });

  it("refuses operations the ability to invite anyone", async () => {
    const r = await ops.call("POST", "/api/crm/staff", {
      email: `sneak-${STAMP}@example.test`, displayName: "Sneak", role: "owner",
    });
    expect(r.status).toBe(403);
  });

  it("lets the technical administrator read staff but not grant roles", async () => {
    const list = await tech.call("GET", "/api/crm/staff");
    expect(list.status).toBe(200);
    expect(list.json["staff"].length).toBe(3);

    const escalate = await tech.call("PATCH", `/api/crm/staff/${ids["ops"]}`, { role: "owner" });
    expect(escalate.status).toBe(403);
  });

  it("refuses a technical administrator inviting above operations", async () => {
    const r = await tech.call("POST", "/api/crm/staff", {
      email: `elevated-${STAMP}@example.test`, displayName: "Elevated", role: "technical_admin",
    });
    expect(r.status).toBe(403);
  });

  // ── Escalation guards ─────────────────────────────────────────────────────

  it("refuses self-promotion even by the owner", async () => {
    const r = await owner.call("PATCH", `/api/crm/staff/${ids["owner"]}`, { role: "operations_manager" });
    expect(r.status).toBe(403);
    expect(String(r.json["error"])).toContain("your own role");
  });

  it("refuses removing the last active owner", async () => {
    // Owner tries to demote themselves via status instead of role.
    const disable = await owner.call("PATCH", `/api/crm/staff/${ids["owner"]}`, { status: "disabled" });
    expect(disable.status).toBe(403);
  });

  it("refuses a non-owner editing permission grants", async () => {
    const r = await tech.call("PATCH", `/api/crm/staff/${ids["ops"]}`, { extraPermissions: ["data.export"] });
    expect(r.status).toBe(403);
  });

  it("lets the owner grant one extra permission, and it takes effect", async () => {
    const grant = await owner.call("PATCH", `/api/crm/staff/${ids["ops"]}`, { extraPermissions: ["campaigns.send"] });
    expect(grant.status).toBe(200);
    expect(grant.json["sessionsRevoked"]).toBe(true);

    // The grant change revoked the old session, so operations must sign in again.
    const stale = await ops.call("GET", "/api/crm/staff/me");
    expect(stale.status).toBe(401);

    await ops.login(OPS);
    const me = await ops.call("GET", "/api/crm/staff/me");
    expect(me.json["staff"].permissions).toContain("campaigns.send");
  });

  it("refuses to side-load an owner-only permission onto a non-owner", async () => {
    await owner.call("PATCH", `/api/crm/staff/${ids["ops"]}`, { extraPermissions: ["billing.manage", "leads.delete"] });
    await ops.login(OPS);
    const me = await ops.call("GET", "/api/crm/staff/me");
    expect(me.json["staff"].permissions).not.toContain("billing.manage");
    expect(me.json["staff"].permissions).not.toContain("leads.delete");
  });

  // ── Session lifecycle ─────────────────────────────────────────────────────

  it("lists the signed-in person's own sessions and revokes one", async () => {
    const list = await ops.call("GET", "/api/crm/staff/me/sessions");
    expect(list.status).toBe(200);
    expect(list.json["sessions"].length).toBeGreaterThan(0);
    // Session records must not leak token material.
    expect(JSON.stringify(list.json)).not.toContain("tokenHash");

    const second = new Agent();
    await second.login(OPS);
    const sessions = await ops.call("GET", "/api/crm/staff/me/sessions");
    const other = sessions.json["sessions"].find((s: any) => s.id !== sessions.json["currentSessionId"]);
    expect(other).toBeDefined();

    const revoked = await ops.call("DELETE", `/api/crm/staff/me/sessions/${other.id}`);
    expect(revoked.status).toBe(200);
    expect((await second.call("GET", "/api/crm/staff/me")).status).toBe(401);
  });

  it("changing a password ends every session that person holds", async () => {
    const agent = new Agent();
    await agent.login(TECH);
    const changed = await agent.call("POST", "/api/crm/staff/me/password", {
      currentPassword: TECH.password, newPassword: "tech-rotated-vellum-2",
    });
    expect(changed.status).toBe(200);
    expect(changed.json["signedOut"]).toBe(true);

    // The session that made the change is dead too.
    expect((await agent.call("GET", "/api/crm/staff/me")).status).toBe(401);
    // A session opened before the change is also dead.
    expect((await tech.call("GET", "/api/crm/staff/me")).status).toBe(401);

    TECH.password = "tech-rotated-vellum-2";
    expect((await tech.login(TECH)).status).toBe(200);
  });

  it("refuses a password change that cannot prove the current password", async () => {
    const r = await tech.call("POST", "/api/crm/staff/me/password", {
      currentPassword: "not-it", newPassword: "some-other-vellum-21",
    });
    expect(r.status).toBe(401);
  });

  it("disabling an account kills its live sessions immediately", async () => {
    const victim = new Agent();
    await victim.login(OPS);
    expect((await victim.call("GET", "/api/crm/staff/me")).status).toBe(200);

    const disabled = await owner.call("PATCH", `/api/crm/staff/${ids["ops"]}`, { status: "disabled" });
    expect(disabled.status).toBe(200);

    expect((await victim.call("GET", "/api/crm/staff/me")).status).toBe(401);
    expect((await anon.call("POST", "/api/crm/staff/login", { email: OPS.email, password: OPS.password })).status).toBe(401);

    const reactivated = await owner.call("PATCH", `/api/crm/staff/${ids["ops"]}`, { status: "active" });
    expect(reactivated.status).toBe(200);
    expect((await ops.login(OPS)).status).toBe(200);
  });

  it("logout revokes the session server-side, not just in the browser", async () => {
    const agent = new Agent();
    await agent.login(OPS);
    const cookie = agent.cookie;
    expect((await agent.call("POST", "/api/crm/staff/logout")).status).toBe(200);

    // Replay the exact cookie the browser had: the server must still refuse.
    const replay = await fetch(`${base}/api/crm/staff/me`, { headers: { Cookie: cookie } });
    expect(replay.status).toBe(401);
  });

  // ── MFA ───────────────────────────────────────────────────────────────────

  it("enrols MFA, requires it at the next sign-in, and consumes a recovery code once", async () => {
    const { verifyTotp } = await import("../lib/staffCredentials.js");
    const start = await owner.call("POST", "/api/crm/staff/me/mfa/start");
    expect(start.status).toBe(200);
    const secret: string = start.json["secret"];
    expect(start.json["otpauthUri"]).toContain("otpauth://totp/");

    // Derive a live code the same way an authenticator app would.
    const code = currentTotp(secret);
    expect(verifyTotp(secret, code)).toBe(true);

    const confirm = await owner.call("POST", "/api/crm/staff/me/mfa/confirm", { code });
    expect(confirm.status).toBe(200);
    const recoveryCodes: string[] = confirm.json["recoveryCodes"];
    expect(recoveryCodes.length).toBeGreaterThan(0);

    // A fresh sign-in now stops at the challenge.
    const challenged = new Agent();
    const login = await challenged.login(OWNER);
    expect(login.json["mfaRequired"]).toBe(true);
    challenged.csrf = login.json["csrfToken"];
    const blocked = await challenged.call("GET", "/api/crm/staff/me");
    expect(blocked.status).toBe(401);
    expect(blocked.json["mfaRequired"]).toBe(true);

    // A wrong code is refused.
    expect((await challenged.call("POST", "/api/crm/staff/login/mfa", { code: "000000" })).status).toBe(401);

    // A recovery code works, exactly once.
    const used = recoveryCodes[0];
    const ok = await challenged.call("POST", "/api/crm/staff/login/mfa", { code: used });
    expect(ok.status).toBe(200);
    expect((await challenged.call("GET", "/api/crm/staff/me")).status).toBe(200);

    const second = new Agent();
    const l2 = await second.login(OWNER);
    second.csrf = l2.json["csrfToken"];
    const replay = await second.call("POST", "/api/crm/staff/login/mfa", { code: used });
    expect(replay.status).toBe(401);

    // A real TOTP code still works.
    const totpOk = await second.call("POST", "/api/crm/staff/login/mfa", { code: currentTotp(secret) });
    expect(totpOk.status).toBe(200);

    // Disabling MFA requires the password, then clears the requirement.
    expect((await second.call("POST", "/api/crm/staff/me/mfa/disable", { password: "wrong" })).status).toBe(401);
    expect((await second.call("POST", "/api/crm/staff/me/mfa/disable", { password: OWNER.password })).status).toBe(200);
    const after = await owner.login(OWNER);
    expect(after.json["mfaRequired"]).toBe(false);
  }, 30_000);

  // ── Break-glass recovery ──────────────────────────────────────────────────

  it("issues a reset token only to a caller proving the server admin password", async () => {
    const bad = await anon.call("POST", "/api/crm/staff/recovery", { adminPassword: "nope", email: OWNER.email });
    expect(bad.status).toBe(401);

    const good = await anon.call("POST", "/api/crm/staff/recovery", {
      adminPassword: "m1-bootstrap-admin-secret", email: OWNER.email,
    });
    expect(good.status).toBe(200);
    const token: string = good.json["resetToken"];

    const reset = await anon.call("POST", "/api/crm/staff/password-reset", {
      token, password: "owner-recovered-cinder",
    });
    expect(reset.status).toBe(200);
    OWNER.password = "owner-recovered-cinder";
    expect((await owner.login(OWNER)).status).toBe(200);

    // Single use.
    expect((await anon.call("POST", "/api/crm/staff/password-reset", {
      token, password: "yet-another-cinder-22",
    })).status).toBe(404);
  }, 30_000);

  // ── Throttling and forged forwarding headers ──────────────────────────────

  it("throttles repeated failures for one account", async () => {
    const target = OPS.email;
    let sawThrottle = false;
    for (let i = 0; i < 12; i++) {
      const r = await anon.call("POST", "/api/crm/staff/login", { email: target, password: `wrong-${i}` });
      if (r.status === 429) { sawThrottle = true; break; }
    }
    expect(sawThrottle).toBe(true);
  }, 30_000);

  it("ignores a forged X-Forwarded-For when no proxy hops are configured", async () => {
    const { deriveClientIp } = await import("../lib/staffAuth.js");
    const fake = {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "10.0.0.9" },
    } as unknown as Parameters<typeof deriveClientIp>[0];

    // Default (0 hops): the header is untrusted, so the socket address wins —
    // an attacker cannot rotate throttling buckets by spoofing the header.
    expect(deriveClientIp(fake, 0)).toBe("10.0.0.9");

    // One real proxy hop: our proxy APPENDS the address it saw, so the
    // rightmost entry is the trustworthy one and "1.2.3.4" — which the client
    // supplied itself — is ignored. Getting this backwards (trusting the
    // leftmost entry, as many examples do) is exactly the spoofable bug.
    expect(deriveClientIp(fake, 1)).toBe("5.6.7.8");

    // Two hops: the outermost proxy appended the inner proxy's address, the
    // inner one appended the client, so the client sits one further left.
    const twoDeep = {
      headers: { "x-forwarded-for": "9.9.9.9, 1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "10.0.0.9" },
    } as unknown as Parameters<typeof deriveClientIp>[0];
    expect(deriveClientIp(twoDeep, 2)).toBe("1.2.3.4");

    // A header shorter than the configured topology cannot be trusted at all.
    expect(deriveClientIp(fake, 5)).toBe("10.0.0.9");
  });

  // ── Cutover: staff sessions reach the pre-existing CRM routes ────────────

  it("a staff session authenticates the existing CRM routes, with no bearer token", async () => {
    await ops.login(OPS);
    const leads = await ops.call("GET", "/api/crm/leads");
    expect(leads.status).toBe(200);
    expect(Array.isArray(leads.json["leads"])).toBe(true);

    const projects = await ops.call("GET", "/api/crm/projects");
    expect(projects.status).toBe(200);
  });

  it("permissions are enforced on the existing CRM routes, not just the staff ones", async () => {
    await ops.login(OPS);
    // Operations may work the pipeline but may not destroy client records.
    const forbidden = await ops.call("DELETE", "/api/crm/leads/999999");
    expect(forbidden.status).toBe(403);
    expect(forbidden.json["permission"]).toBe("leads.delete");

    // The owner clears the permission gate and reaches the handler, which then
    // answers honestly that there is no such lead — 404, not 403.
    await owner.login(OWNER);
    const allowed = await owner.call("DELETE", "/api/crm/leads/999999");
    expect(allowed.status).toBe(404);
  });

  it("refuses an unauthenticated call to an existing CRM route", async () => {
    expect((await anon.call("GET", "/api/crm/leads")).status).toBe(401);
  });

  // ── Source pin: the step-up routes keep their session guard ───────────────

  it("every mutating staff route except the credential exchanges carries requireStaff", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(here, "crmStaff.ts"), "utf8");
    // Routes that legitimately run before a session exists.
    const preSession = [
      "/crm/staff/bootstrap", "/crm/staff/recovery", "/crm/staff/login",
      "/crm/staff/login/mfa", "/crm/staff/activation", "/crm/staff/password-reset",
    ];
    const re = /router\.(post|patch|delete|put)\(\s*"([^"]+)"\s*,\s*([^)]*)/g;
    const unguarded: string[] = [];
    for (const m of src.matchAll(re)) {
      const [, , routePath, rest] = m;
      if (preSession.includes(routePath)) continue;
      if (!/requireStaff\s*\(/.test(rest)) unguarded.push(`${m[1].toUpperCase()} ${routePath}`);
    }
    expect(unguarded).toEqual([]);
  });
});

/** Same derivation an authenticator app performs, used to drive the MFA test. */
function currentTotp(secret: string): string {
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret) bits += ALPHABET.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const key = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}
