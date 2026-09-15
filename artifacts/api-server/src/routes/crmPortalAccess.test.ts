/**
 * The staff side of the customer portal: inviting somebody, and being told the
 * truth about what that did.
 *
 * `crmPortal.test.ts` next door proves the customer half — isolation, internal
 * notes, single-use tokens. This file proves the half an operator touches, and
 * it exists because the interesting failures there are not leaks but LIES:
 *
 *   - a green "invited" tick over an invitation nothing ever sent;
 *   - a raw token sitting in a browser tab after the link went to a mailbox;
 *   - an account whose address nobody has ever checked, shown exactly like one
 *     whose owner received our email and clicked it;
 *   - a "revoked" badge over a customer who is still signed in.
 *
 * Mail goes through the same mocked `staffMail` seam the other delivery suites
 * use, so no message can reach a real address from a test run. The mock records
 * the message BODY, which is how the emailed case gets its token: exactly where
 * a real customer would get it, and nowhere else.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "portal-access-admin-secret";
process.env.CRM_PUBLIC_BASE_URL = "https://portal.example.test";

type MockOutcome =
  | { sent: true; providerId: string | null }
  | {
      sent: false;
      failure: "not_configured" | "rejected" | "failed" | "uncertain";
      reason: string;
      configured: boolean;
    };

/** Every message the routes tried to send, body included. Never a network. */
const sends: { to: string; subject: string; text: string }[] = [];
let mailConfigured = false;
let mailBlocked: string | null = "Email test mode is on, so mail is simulated rather than sent.";
let outcome: MockOutcome = {
  sent: false, failure: "not_configured", configured: false,
  reason: "Email test mode is on, so mail is simulated rather than sent.",
};

vi.mock("../lib/staffMail.js", () => ({
  RESEND_IDEMPOTENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
  staffMailConfigured: () => mailConfigured,
  staffMailBlockedReason: () => mailBlocked,
  trySendStaffMail: async (args: { to: string; subject: string; text: string }) => {
    sends.push({ to: args.to, subject: args.subject, text: args.text });
    return outcome;
  },
  classifyProviderError: () => "rejected",
  classifyThrownMailError: () => "uncertain",
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
  activationUrl: () => null,
}));

/** The provider takes the message. */
function mailWorks(): void {
  mailConfigured = true;
  mailBlocked = null;
  outcome = { sent: true, providerId: `provider-${sends.length + 1}` };
}

/** There is no mail on this server at all — nothing is handed over. */
function mailOff(): void {
  mailConfigured = false;
  mailBlocked = "RESEND_API_KEY is not set on this server, so no mail can be sent.";
  outcome = { sent: false, failure: "not_configured", configured: false, reason: mailBlocked };
}

/** The provider looked at the message and said no. */
function mailRefuses(): void {
  mailConfigured = true;
  mailBlocked = null;
  outcome = {
    sent: false, failure: "rejected", configured: true,
    reason: "The sending domain is not verified.",
  };
}

const STAMP = Date.now();
const OWNER = {
  email: `portal-access-owner-${STAMP}@example.test`,
  name: "[CRM-TEST] Portal Access Owner",
  password: "harbour-kestrel-5518",
};
/** Reads contacts, may not change them. `leads.write` is revoked by name. */
const READER = {
  email: `portal-access-reader-${STAMP}@example.test`,
  name: "[CRM-TEST] Portal Access Reader",
  password: "meadow-thistle-9042",
};

const CUSTOMER_PASSWORD = "sandpiper-lantern-7731";

const suite = TEST_DB ? describe : describe.skip;

suite("staff-side portal access (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: number[] = [];
  const leadIds: number[] = [];
  const attachmentIds: number[] = [];

  /** Emailed path. */ let leadA = 0;
  /** Hand-delivered path. */ let leadB = 0;
  /** Revocation. */ let leadC = 0;
  /** No email address at all. */ let leadNoEmail = 0;

  interface Reply { status: number; json: Record<string, any>; text: string; headers: Headers }

  async function call(
    method: string, path: string,
    opts: { cookie?: string; csrfHeader?: string; csrf?: string; body?: unknown } = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (opts.cookie) headers["Cookie"] = opts.cookie;
    if (opts.csrf && opts.csrfHeader) headers[opts.csrfHeader] = opts.csrf;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, {
      method, headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  class StaffAgent {
    cookie = ""; csrf = "";
    call(method: string, path: string, body?: unknown) {
      return call(method, path, { cookie: this.cookie, csrfHeader: "x-csrf-token", csrf: this.csrf, body });
    }
    async login(who: { email: string; password: string }) {
      const res = await fetch(`${base}/api/crm/staff/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: who.email, password: who.password }),
      });
      this.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
      const data = await res.json() as { csrfToken?: string };
      this.csrf = data.csrfToken ?? "";
      return res.status;
    }
  }

  class PortalAgent {
    cookie = ""; csrf = "";
    call(method: string, path: string, body?: unknown) {
      return call(method, path, { cookie: this.cookie, csrfHeader: "x-portal-csrf", csrf: this.csrf, body });
    }
    take(headers: Headers, csrfToken?: string) {
      const set = headers.getSetCookie().map((c) => c.split(";")[0])
        .filter((c) => c.startsWith("crm_portal_session="));
      if (set.length) this.cookie = set.join("; ");
      if (csrfToken) this.csrf = csrfToken;
    }
  }

  const owner = new StaffAgent();
  const reader = new StaffAgent();

  /** The token as the CUSTOMER would receive it: out of the email body. */
  function tokenFromLastEmail(): string {
    const last = sends[sends.length - 1];
    expect(last, "nothing was handed to the mail provider").toBeDefined();
    const match = last.text.match(/[?&]token=([^\s&]+)/);
    expect(match, `no invitation link in the message body: ${last.text}`).toBeTruthy();
    return decodeURIComponent((match as RegExpMatchArray)[1]);
  }

  async function redeem(token: string): Promise<PortalAgent> {
    const res = await fetch(`${base}/api/portal/invitations/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: CUSTOMER_PASSWORD }),
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { csrfToken: string };
    const agent = new PortalAgent();
    agent.take(res.headers, data.csrfToken);
    return agent;
  }

  async function makeLead(tag: string, email: string): Promise<number> {
    const [lead] = await db.insert(schema.crmLeads).values({
      name: `[CRM-TEST] Access ${tag}`, email, status: "Client",
    }).returning();
    leadIds.push(lead.id);
    return lead.id;
  }

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    const [ownerRow] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    const [readerRow] = await db.insert(schema.crmStaff).values({
      email: READER.email, displayName: READER.name,
      role: "operations_manager", status: "active",
      // Keeps `leads.read`, loses the grant that governs changing a contact's
      // relationship with us — which is the one the portal routes assert.
      revokedPermissions: ["leads.write"],
      passwordHash: await hashPassword(READER.password), passwordUpdatedAt: new Date(),
    }).returning();
    staffIds.push(ownerRow.id, readerRow.id);

    expect(await owner.login(OWNER)).toBe(200);
    expect(await reader.login(READER)).toBe(200);

    leadA = await makeLead("A emailed", `access-a-${STAMP}@example.test`);
    leadB = await makeLead("B by hand", `access-b-${STAMP}@example.test`);
    leadC = await makeLead("C revoked", `access-c-${STAMP}@example.test`);
    // A contact imported without one. `crm_leads.email` is NOT NULL, so this is
    // what "no email" actually looks like in the table.
    leadNoEmail = await makeLead("D no email", "");

    // Two documents shared with A, one of which is later withdrawn — so the
    // count the panel shows is provably "what they can see now", not "what was
    // ever granted".
    for (const [name, revoked] of [["a-scope.txt", false], ["a-withdrawn.txt", true]] as const) {
      const bytes = Buffer.from(`${name}\n`);
      const [attachment] = await db.insert(schema.crmAttachments).values({
        entityType: "lead", entityId: leadA, filename: name, mimeType: "text/plain",
        sizeBytes: bytes.length, storageKey: "db:crm_attachment_blobs",
        uploadedByStaffId: ownerRow.id, uploadedByLabel: OWNER.name,
      }).returning();
      attachmentIds.push(attachment.id);
      await db.insert(schema.crmAttachmentBlobs).values({ attachmentId: attachment.id, bytes });
      await db.insert(schema.crmPortalDocumentGrants).values({
        leadId: leadA, attachmentId: attachment.id,
        grantedByStaffId: ownerRow.id, grantedByLabel: OWNER.name,
        revokedAt: revoked ? new Date() : null,
      });
    }
  }, 180_000);

  afterAll(async () => {
    if (leadIds.length) {
      const accounts = await db.select({ id: schema.crmPortalAccounts.id })
        .from(schema.crmPortalAccounts).where(inArray(schema.crmPortalAccounts.leadId, leadIds));
      if (accounts.length) {
        await db.delete(schema.crmPortalSessions)
          .where(inArray(schema.crmPortalSessions.portalAccountId, accounts.map((a) => a.id)));
      }
      await db.delete(schema.crmPortalDocumentGrants)
        .where(inArray(schema.crmPortalDocumentGrants.leadId, leadIds));
      await db.delete(schema.crmPortalInvitations)
        .where(inArray(schema.crmPortalInvitations.leadId, leadIds));
      await db.delete(schema.crmPortalAccounts)
        .where(inArray(schema.crmPortalAccounts.leadId, leadIds));
      if (attachmentIds.length) {
        await db.delete(schema.crmAttachmentBlobs)
          .where(inArray(schema.crmAttachmentBlobs.attachmentId, attachmentIds));
        await db.delete(schema.crmAttachments)
          .where(inArray(schema.crmAttachments.id, attachmentIds));
      }
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, leadIds));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, leadIds));
    }
    if (staffIds.length) {
      await db.delete(schema.crmStaff).where(inArray(schema.crmStaff.id, staffIds));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 180_000);

  // ── No address to send to ─────────────────────────────────────────────────

  it("tells an operator a contact with no email cannot be invited, and refuses the invitation itself", async () => {
    mailWorks();
    const view = await owner.call("GET", `/api/crm/portal/access/${leadNoEmail}`);
    expect(view.status, view.text).toBe(200);
    expect(view.json["canInvite"]).toBe(false);
    // A reason, not a disabled button with no explanation.
    expect(String(view.json["blockedReason"])).toMatch(/no email address/i);
    expect(view.json["account"]).toBeNull();
    expect(view.json["invitation"]).toBeNull();

    // And the refusal is enforced at the route, not only in the UI.
    const attempt = await owner.call("POST", "/api/crm/portal/invitations", { leadId: leadNoEmail });
    expect(attempt.status).toBe(400);
    expect(String(attempt.json["error"])).toMatch(/email/i);

    const rows = await db.select().from(schema.crmPortalInvitations)
      .where(eq(schema.crmPortalInvitations.leadId, leadNoEmail));
    expect(rows, "an invitation was written for a contact with no address").toHaveLength(0);

    // A contact that does not exist is a 404, not a 500 or an empty panel.
    expect((await owner.call("GET", "/api/crm/portal/access/99999999")).status).toBe(404);
  }, 120_000);

  // ── Where the token is allowed to exist ───────────────────────────────────

  it("keeps the token server-side when it emailed the link, and hands it over when it could not", async () => {
    mailWorks();
    const emailed = await owner.call("POST", "/api/crm/portal/invitations", { leadId: leadA });
    expect(emailed.status, emailed.text).toBe(201);
    expect(emailed.json["invitation"].delivery).toBe("sent");
    // The whole body, not one field: the token must not travel in any of them.
    expect(emailed.json["inviteToken"]).toBeUndefined();
    expect(emailed.json["invitePath"]).toBeUndefined();
    expect(emailed.json["handDelivered"]).toBe(false);
    expect(emailed.json["mailboxWillBeProven"]).toBe(true);
    const token = tokenFromLastEmail();
    expect(emailed.text, "the raw token appeared in the API response").not.toContain(token);
    expect(sends[sends.length - 1].to).toBe(`access-a-${STAMP}@example.test`);

    // Mail is off: the operator gets the link, because otherwise the customer
    // is simply stuck — and is told what that costs.
    mailOff();
    const byHand = await owner.call("POST", "/api/crm/portal/invitations", { leadId: leadB });
    expect(byHand.status, byHand.text).toBe(201);
    expect(byHand.json["invitation"].delivery).toBe("not_configured");
    expect(typeof byHand.json["inviteToken"]).toBe("string");
    expect(String(byHand.json["inviteToken"]).length).toBeGreaterThan(20);
    expect(byHand.json["handDelivered"]).toBe(true);
    expect(byHand.json["mailboxWillBeProven"]).toBe(false);
    expect(String(byHand.json["mailboxNote"])).toMatch(/handed over rather than emailed/i);

    // A refusal is reported as a refusal, with the provider's reason, and also
    // hands the link over — nothing was sent, so nothing is duplicated.
    mailRefuses();
    const refused = await owner.call("POST", "/api/crm/portal/invitations", { leadId: leadB });
    expect(refused.json["invitation"].delivery).toBe("rejected");
    expect(String(refused.json["invitation"].deliveryDetail)).toMatch(/domain is not verified/i);
    expect(typeof refused.json["inviteToken"]).toBe("string");

    // The delivery outcome is recorded against the invitation, not inferred
    // later from whether somebody used it.
    const [row] = await db.select().from(schema.crmPortalInvitations)
      .where(eq(schema.crmPortalInvitations.id, refused.json["invitation"].id));
    expect(row.deliveryState).toBe("rejected");
    expect(row.tokenHash).toHaveLength(64);
    expect(row.tokenHash).not.toBe(refused.json["inviteToken"]);
  }, 120_000);

  // ── What "invited" proves about the address ───────────────────────────────

  it("only an emailed invitation proves the mailbox; a link handed over never does", async () => {
    // A: emailed. The token is taken out of the message body — the same place
    // the customer would take it from, and the only place it exists.
    mailWorks();
    const emailed = await owner.call("POST", "/api/crm/portal/invitations", { leadId: leadA });
    expect(emailed.status).toBe(201);
    const a = await redeem(tokenFromLastEmail());
    expect((await a.call("GET", "/api/portal/me")).status).toBe(200);

    const provenView = await owner.call("GET", `/api/crm/portal/access/${leadA}`);
    expect(provenView.status).toBe(200);
    expect(provenView.json["account"].active).toBe(true);
    expect(provenView.json["account"].mailboxProven).toBe(true);
    expect(provenView.json["account"].mailboxNote).toBeNull();
    expect(provenView.json["account"].lastSignInAt).not.toBeNull();

    // B: handed over. The account works just as well, and the panel must not
    // present it as though somebody checked the address.
    mailOff();
    const byHand = await owner.call("POST", "/api/crm/portal/invitations", { leadId: leadB });
    const b = await redeem(byHand.json["inviteToken"] as string);
    expect((await b.call("GET", "/api/portal/me")).status).toBe(200);

    const unprovenView = await owner.call("GET", `/api/crm/portal/access/${leadB}`);
    expect(unprovenView.json["account"].active).toBe(true);
    expect(unprovenView.json["account"].mailboxProven).toBe(false);
    expect(String(unprovenView.json["account"].mailboxNote)).toMatch(/may go nowhere/i);

    // Two working logins, and the panel tells them apart.
    expect(provenView.json["account"].mailboxProven)
      .not.toBe(unprovenView.json["account"].mailboxProven);
  }, 180_000);

  // ── Revoking is not a UI state ────────────────────────────────────────────

  it("revoking access ends the session the customer is holding, not just the button", async () => {
    mailOff();
    const invited = await owner.call("POST", "/api/crm/portal/invitations", { leadId: leadC });
    const customer = await redeem(invited.json["inviteToken"] as string);
    expect((await customer.call("GET", "/api/portal/me")).status).toBe(200);
    expect((await customer.call("GET", "/api/portal/overview")).status).toBe(200);

    const revoked = await owner.call("POST", `/api/crm/portal/accounts/${leadC}/revoke`, {});
    expect(revoked.status, revoked.text).toBe(200);
    // It says how many live sessions it ended, which is the claim being made.
    expect(revoked.json["sessionsEnded"]).toBeGreaterThanOrEqual(1);

    // The cookie they already hold stops working — on the very next request.
    expect((await customer.call("GET", "/api/portal/me")).status).toBe(401);
    expect((await customer.call("GET", "/api/portal/overview")).status).toBe(401);
    // And the password they still know does not get them back in.
    const relogin = await call("POST", "/api/portal/login",
      { body: { email: `access-c-${STAMP}@example.test`, password: CUSTOMER_PASSWORD } });
    expect(relogin.status).toBe(401);

    const view = await owner.call("GET", `/api/crm/portal/access/${leadC}`);
    expect(view.json["account"].active).toBe(false);
    expect(view.json["account"].status).toBe("disabled");
    // An outstanding invitation cannot survive the revocation either.
    expect(view.json["invitation"]).toBeNull();

    // Revoking a contact that never had access is a 404, not a silent success.
    expect((await owner.call("POST", `/api/crm/portal/accounts/${leadNoEmail}/revoke`, {})).status).toBe(404);
  }, 180_000);

  // ── Permission ────────────────────────────────────────────────────────────

  it("refuses a staff member who may read a contact but not change what they can see", async () => {
    // They can look: `leads.read` is what the panel's read needs.
    const view = await reader.call("GET", `/api/crm/portal/access/${leadA}`);
    expect(view.status, view.text).toBe(200);
    expect(view.json["contact"].id).toBe(leadA);

    const before = await db.select().from(schema.crmPortalInvitations)
      .where(eq(schema.crmPortalInvitations.leadId, leadA));

    mailOff();
    const invite = await reader.call("POST", "/api/crm/portal/invitations", { leadId: leadA });
    expect(invite.status).toBe(403);
    expect(invite.json["permission"]).toBe("leads.write");
    // Nothing leaked on the way out.
    expect(invite.json["inviteToken"]).toBeUndefined();

    const revoke = await reader.call("POST", `/api/crm/portal/accounts/${leadA}/revoke`, {});
    expect(revoke.status).toBe(403);

    const after = await db.select().from(schema.crmPortalInvitations)
      .where(eq(schema.crmPortalInvitations.leadId, leadA));
    expect(after.length, "a refused invitation still wrote a row").toBe(before.length);

    // And the account they were not allowed to revoke is untouched.
    const [account] = await db.select().from(schema.crmPortalAccounts)
      .where(eq(schema.crmPortalAccounts.leadId, leadA));
    expect(account.status).toBe("active");
  }, 120_000);

  // ── What the customer can already see ─────────────────────────────────────

  it("reports what is exposed to the customer, counting only live grants", async () => {
    const view = await owner.call("GET", `/api/crm/portal/access/${leadA}`);
    expect(view.status).toBe(200);
    // Two grants were written; one was withdrawn. The panel must show one.
    expect(view.json["documents"].granted).toBe(1);
    expect(view.json["documents"].canList).toBe(true);
    expect((view.json["documents"].items as any[]).map((i) => i.filename)).toEqual(["a-scope.txt"]);

    // A contact nobody has shared anything with reads as zero, not as absent.
    const empty = await owner.call("GET", `/api/crm/portal/access/${leadB}`);
    expect(empty.json["documents"].granted).toBe(0);
    expect(empty.json["documents"].items).toEqual([]);

    // No token, hash or password material on this route, at any level.
    for (const body of [view.text, empty.text]) {
      expect(body).not.toMatch(/tokenHash|token_hash|passwordHash|password_hash/);
      expect(body).not.toMatch(/"inviteToken"/);
    }
  }, 120_000);

  // ── The two systems still never meet ──────────────────────────────────────

  it("keeps the new staff route away from customers, and one customer away from another", async () => {
    mailOff();
    const invitedA = await owner.call("POST", "/api/crm/portal/invitations", { leadId: leadA });
    const a = await redeem(invitedA.json["inviteToken"] as string);
    const invitedB = await owner.call("POST", "/api/crm/portal/invitations", { leadId: leadB });
    const b = await redeem(invitedB.json["inviteToken"] as string);

    // A portal session cannot read the staff panel's route — for its own
    // contact or anybody else's.
    for (const leadId of [leadA, leadB]) {
      const res = await a.call("GET", `/api/crm/portal/access/${leadId}`);
      expect([401, 403], `answered ${res.status}`).toContain(res.status);
      expect(res.text).not.toContain("a-scope.txt");
    }
    // Nor write through it.
    const write = await a.call("POST", `/api/crm/portal/accounts/${leadB}/revoke`, {});
    expect([401, 403]).toContain(write.status);

    // B is still signed in, which is what proves the refusal above was the
    // guard and not a broken route.
    expect((await b.call("GET", "/api/portal/me")).status).toBe(200);

    // And the customer-side isolation the portal rests on still holds: another
    // contact's record is 404, never 403.
    const [bProject] = await db.insert(schema.crmProjects).values({
      leadId: leadB, name: "[CRM-TEST] B only", stage: "Development",
    }).returning();
    try {
      const cross = await a.call("GET", `/api/portal/projects/${bProject.id}`);
      expect(cross.status).toBe(404);
      expect(cross.status).not.toBe(403);
      const mine = await a.call("GET", "/api/portal/projects");
      expect((mine.json["projects"] as any[]).map((p) => p.id)).not.toContain(bProject.id);
    } finally {
      await db.delete(schema.crmProjects).where(eq(schema.crmProjects.id, bProject.id));
    }
  }, 180_000);
});
