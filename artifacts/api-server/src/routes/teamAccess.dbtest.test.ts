// Team access end to end, over HTTP, against a real database.
//
// Two businesses. Business A invites a staff member, who accepts with their
// own password and is signed in. The staff member can do the day's work,
// cannot change settings, cannot see business B's contacts, and signs in with
// their own password. When A removes them, their session stops working on
// the very next request and their password stops working too.
//
// Only the invitation email is replaced (it is captured instead of sent).
// Gated on CRM_TEST_DATABASE_URL; every row created here is removed in afterAll.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";

const suite = TEST_DB ? describe : describe.skip;
const STAMP = Date.now();
const OWNER_A = `team-owner-a-${STAMP}@example.test`;
const OWNER_B = `team-owner-b-${STAMP}@example.test`;
const STAFF = `team-staff-${STAMP}@example.test`;
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-456";

interface Reply {
  status: number;
  body: Record<string, unknown>;
  cookie: string | null;
}

suite("team access (real DB, over HTTP)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let firmA = 0;
  let firmB = 0;
  let contactB = 0;

  async function call(method: string, path: string, body?: unknown, cookie?: string | null): Promise<Reply> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        // Distinct per call so the login limiter never interferes.
        "X-Forwarded-For": `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const setCookie = res.headers.get("set-cookie");
    return {
      status: res.status,
      body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
      cookie: setCookie ? setCookie.split(";")[0]! : null,
    };
  }

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    const voice = await import("@workspace/db/schema/voice");
    try {
      await db.select({ p: voice.voiceFirmMembers.passwordHash }).from(voice.voiceFirmMembers).limit(1);
    } catch {
      throw new Error(
        "voice_firm_members.password_hash is missing from CRM_TEST_DATABASE_URL. It comes from voice migration 0014. Build the database with migrate:fresh, or run the voice migrations, and re-run.",
      );
    }

    const bcrypt = (await import("bcryptjs")).default;
    const hash = await bcrypt.hash(OWNER_PASSWORD, 4);
    const firmRow = (suffix: "A" | "B", email: string) => ({
      name: `[TEST] Team ${suffix} ${STAMP}`,
      practiceAreas: [] as string[],
      statesServed: [] as string[],
      statuteOfLimitationsDays: 0,
      notifyEmail: email,
      twilioNumber: `+1555010${suffix === "A" ? "1" : "2"}${String(STAMP).slice(-4)}`,
      email,
      passwordHash: hash,
    });
    const [a] = await db.insert(schema.intakeFirms).values(firmRow("A", OWNER_A)).returning({ id: schema.intakeFirms.id });
    const [b] = await db.insert(schema.intakeFirms).values(firmRow("B", OWNER_B)).returning({ id: schema.intakeFirms.id });
    firmA = a!.id;
    firmB = b!.id;
    const [c] = await db
      .insert(voice.voiceContacts)
      .values({ firmId: firmB, phoneE164: "+15550109999", displayName: "[TEST] B's caller" })
      .returning({ id: voice.voiceContacts.id });
    contactB = c!.id;

    const express = (await import("express")).default;
    const cookieParser = (await import("cookie-parser")).default;
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => {
      const quiet = () => {};
      (req as unknown as { log: Record<string, () => void> }).log = { info: quiet, warn: quiet, error: quiet, debug: quiet };
      next();
    });
    app.use("/api", (await import("./receptionistAuth.js")).default);
    app.use("/api", (await import("./receptionistAccount.js")).default);
    app.use("/api", (await import("./receptionistContacts.js")).default);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    if (firmA || firmB) {
      const { inArray, sql } = await import("drizzle-orm");
      await db.execute(sql`DELETE FROM receptionist_sessions WHERE firm_id IN (${firmA}, ${firmB})`);
      await db.delete(schema.intakeFirms).where(inArray(schema.intakeFirms.id, [firmA, firmB].filter(Boolean)));
    }
  });

  let staffCookie: string | null = null;
  let staffId = 0;

  it("an owner's invitation is accepted with the member's own password, which signs them in", async () => {
    const { inviteMember } = await import("../lib/voiceAccounts/membership.js");
    const mail: string[] = [];
    const invited = await inviteMember(firmA, STAFF, "staff", {
      sendEmail: async (_to, _subject, text) => {
        mail.push(text);
        return { ok: true };
      },
      recordAudit: async () => {},
    });
    expect(invited.ok).toBe(true);
    staffId = invited.ok ? invited.member.id : 0;
    const code = /code \(valid 7 days\): (\S+)/.exec(mail[0] ?? "")?.[1];
    expect(code).toBeTruthy();

    // The code alone, with a different address, activates nobody.
    const wrong = await call("POST", "/api/receptionist/account/members/accept", { token: code, email: OWNER_B, password: STAFF_PASSWORD });
    expect(wrong.status).toBe(401);
    expect(wrong.cookie).toBeNull();

    // That attempt spent the code, so a fresh invitation is needed.
    const { revokeMemberById } = await import("../lib/voiceAccounts/membership.js");
    await revokeMemberById(firmA, staffId);
    const again = await inviteMember(firmA, STAFF, "staff", {
      sendEmail: async (_to, _subject, text) => {
        mail.push(text);
        return { ok: true };
      },
      recordAudit: async () => {},
    });
    expect(again.ok).toBe(true);
    const code2 = /code \(valid 7 days\): (\S+)/.exec(mail[1] ?? "")?.[1];

    const accepted = await call("POST", "/api/receptionist/account/members/accept", { token: code2, email: STAFF, password: STAFF_PASSWORD });
    expect(accepted.status).toBe(200);
    expect(accepted.cookie).toMatch(/^receptionist_session=/);
    staffCookie = accepted.cookie;

    const me = await call("GET", "/api/receptionist/auth/me", undefined, staffCookie);
    expect(me.status).toBe(200);
    expect((me.body.firm as { id: number }).id).toBe(firmA);
    expect(me.body.viewer).toEqual({ email: STAFF, role: "staff", accountHolder: false });
  });

  it("staff handle the day's work but cannot change settings or the team", async () => {
    expect((await call("GET", "/api/receptionist/contacts", undefined, staffCookie)).status).toBe(200);
    const added = await call("POST", "/api/receptionist/contacts", { phone: "+1 555 010 1234", name: "[TEST] Walk-in" }, staffCookie);
    expect(added.status).toBe(201);
    expect((added.body.contact as { source: string }).source).toBe("manual");

    const profile = await call("PATCH", "/api/receptionist/account/profile", { name: "Hijacked" }, staffCookie);
    expect(profile.status).toBe(403);
    expect(profile.body.code).toBe("owner_only");
    const invite = await call("POST", "/api/receptionist/account/members", { email: "x@example.test", role: "owner" }, staffCookie);
    expect(invite.status).toBe(403);
    const email = await call("PATCH", "/api/receptionist/account/email", { newEmail: "x@example.com", currentPassword: "nope" }, staffCookie);
    expect(email.status).toBe(403);
    expect(email.body.code).toBe("account_holder_only");

    const list = await call("GET", "/api/receptionist/account/members", undefined, staffCookie);
    expect(list.status).toBe(200);
    const mine = (list.body.items as Array<{ email: string; isYou: boolean }>).find((m) => m.email === STAFF);
    expect(mine?.isYou).toBe(true);
  });

  it("a member never sees another business's records", async () => {
    const other = await call("GET", `/api/receptionist/contacts/${contactB}`, undefined, staffCookie);
    expect(other.status).toBe(404);
    const edit = await call("PATCH", `/api/receptionist/contacts/${contactB}`, { name: "Changed by A" }, staffCookie);
    expect(edit.status).toBe(404);
    const list = await call("GET", "/api/receptionist/contacts", undefined, staffCookie);
    expect((list.body.items as Array<{ id: number }>).some((c) => c.id === contactB)).toBe(false);
  });

  it("a member signs in with their own password, and the business password is not theirs", async () => {
    const ok = await call("POST", "/api/receptionist/auth/login", { email: STAFF, password: STAFF_PASSWORD });
    expect(ok.status).toBe(200);
    expect((ok.body.firm as { id: number }).id).toBe(firmA);
    const wrong = await call("POST", "/api/receptionist/auth/login", { email: STAFF, password: OWNER_PASSWORD });
    expect(wrong.status).toBe(401);
    // The owner's own sign-in is unchanged.
    const owner = await call("POST", "/api/receptionist/auth/login", { email: OWNER_A, password: OWNER_PASSWORD });
    expect(owner.status).toBe(200);
    const ownerMe = await call("GET", "/api/receptionist/auth/me", undefined, owner.cookie);
    expect(ownerMe.body.viewer).toEqual({ email: OWNER_A, role: "owner", accountHolder: true });
  });

  it("removal signs the member out at once and their password stops working", async () => {
    const owner = await call("POST", "/api/receptionist/auth/login", { email: OWNER_A, password: OWNER_PASSWORD });
    const removed = await call("DELETE", `/api/receptionist/account/members/${staffId}`, undefined, owner.cookie);
    expect(removed.status).toBe(204);

    expect((await call("GET", "/api/receptionist/contacts", undefined, staffCookie)).status).toBe(401);
    expect((await call("POST", "/api/receptionist/auth/login", { email: STAFF, password: STAFF_PASSWORD })).status).toBe(401);

    // Business B's owner cannot remove anyone from business A.
    const ownerB = await call("POST", "/api/receptionist/auth/login", { email: OWNER_B, password: OWNER_PASSWORD });
    expect((await call("DELETE", `/api/receptionist/account/members/${staffId}`, undefined, ownerB.cookie)).status).toBe(404);
  });
});
