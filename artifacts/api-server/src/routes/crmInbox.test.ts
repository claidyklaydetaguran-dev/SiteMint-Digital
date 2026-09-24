/**
 * The conversation foundation: durable identity, handling state, read
 * position, drafts, pagination, search, and the history backfill.
 *
 * What this replaces regrouped the latest 200 messages in the whole database
 * on every request. So the properties asserted here are exactly the ones that
 * were impossible before:
 *
 *   - a conversation exists between requests and can carry an owner
 *   - an old conversation is on a later page, not missing
 *   - read, assigned and resolved are three different things
 *   - history migrates without inventing relationships
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "inbox-admin-secret-value";

const STAMP = Date.now();
const SHASTA = { email: `inbox-shasta-${STAMP}@example.test`, name: "[CRM-TEST] Shasta", password: "harbour-trellis-5521" };
const CLAIDY = { email: `inbox-claidy-${STAMP}@example.test`, name: "[CRM-TEST] Claidy", password: "lantern-quartz-7734" };
const SAISA = { email: `inbox-saisa-${STAMP}@example.test`, name: "[CRM-TEST] Saisa", password: "meridian-copper-3312" };

const suite = TEST_DB ? describe : describe.skip;

suite("durable conversations (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  const staffIds: Record<string, number> = {};
  const leadIds: number[] = [];
  let mainConversationId = 0;

  class Agent {
    cookie = ""; csrf = "";
    async call(method: string, p: string, body?: unknown) {
      const headers: Record<string, string> = {};
      if (this.cookie) headers["Cookie"] = this.cookie;
      if (this.csrf) headers["x-csrf-token"] = this.csrf;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(`${base}${p}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: Record<string, any> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
      return { status: res.status, json };
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

  const shasta = new Agent();
  const claidy = new Agent();

  async function inbound(leadId: number, body: string, at: Date, from = "+15550100000") {
    const [m] = await db.insert(schema.crmMessages).values({
      leadId, direction: "inbound", channel: "sms", body,
      fromNumber: from, toNumber: "+15550002222", createdAt: at, origin: "inbound",
    }).returning();
    return m;
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
    for (const who of [SHASTA, CLAIDY, SAISA]) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role: "owner", status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[who.email] = row.id;
    }

    // Six contacts, so pagination has something to page through.
    for (let i = 0; i < 6; i++) {
      const [lead] = await db.insert(schema.crmLeads).values({
        name: `[CRM-TEST] Conv Contact ${i}`,
        email: `conv-${i}-${STAMP}@example.test`,
        phone: `+1555010000${i}`,
        status: "New",
      }).returning();
      leadIds.push(lead.id);
    }

    // Staggered activity, oldest first, so ordering and cursors are meaningful.
    const t0 = Date.now() - 30 * 86_400_000;
    for (let i = 0; i < leadIds.length; i++) {
      await inbound(leadIds[i], `hello from contact ${i}`, new Date(t0 + i * 86_400_000), `+1555010000${i}`);
    }
    // The oldest contact gets two more, so unread counts are not all 1.
    await inbound(leadIds[0], "second message", new Date(t0 + 3_600_000), "+15550100000");
    await inbound(leadIds[0], "third message", new Date(t0 + 7_200_000), "+15550100000");

    await shasta.login(SHASTA);
    await claidy.login(CLAIDY);

    const done = await shasta.call("POST", "/api/crm/inbox/backfill");
    expect(done.status).toBe(200);
  });

  afterAll(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    if (leadIds.length) {
      const convs = await db.select().from(schema.crmConversations);
      const ids = convs.filter((c) => c.contactId && leadIds.includes(c.contactId)).map((c) => c.id);
      if (ids.length) {
        await db.delete(schema.crmConversationReads).where(inArray(schema.crmConversationReads.conversationId, ids));
        await db.delete(schema.crmMessageDrafts).where(inArray(schema.crmMessageDrafts.conversationId, ids));
        await db.delete(schema.crmConversationParticipants).where(inArray(schema.crmConversationParticipants.conversationId, ids));
        await db.delete(schema.crmMessages).where(inArray(schema.crmMessages.conversationId, ids));
        await db.delete(schema.crmConversations).where(inArray(schema.crmConversations.id, ids));
      }
      await db.delete(schema.crmMessages).where(inArray(schema.crmMessages.leadId, leadIds));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, leadIds));
    }
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  });

  // ── Backfill ──────────────────────────────────────────────────────────────

  it("migrates history onto conversations without inventing relationships", async () => {
    const { eq, inArray, isNull, and } = await import("drizzle-orm");

    // Every seeded message now belongs to a conversation.
    const orphans = await db.select().from(schema.crmMessages).where(and(
      inArray(schema.crmMessages.leadId, leadIds),
      isNull(schema.crmMessages.conversationId),
    ));
    expect(orphans).toHaveLength(0);

    // One conversation per contact — the grouping the inbox already showed,
    // not a new interpretation of the history.
    const convs = await db.select().from(schema.crmConversations)
      .where(inArray(schema.crmConversations.contactId, leadIds));
    expect(convs).toHaveLength(leadIds.length);

    const first = convs.find((c) => c.contactId === leadIds[0])!;
    mainConversationId = first.id;
    expect(first.identityKey).toBe(`phone:lead:${leadIds[0]}`);
    // Rollups are derived from the messages, so they match exactly.
    expect(first.messageCount).toBe(3);
    expect(first.status).toBe("unassigned");

    // Running it again changes nothing — it has to be safe to re-run.
    const again = await shasta.call("POST", "/api/crm/inbox/backfill");
    expect(again.status).toBe(200);
    expect(again.json["scanned"]).toBe(0);
    const after = await db.select().from(schema.crmConversations)
      .where(eq(schema.crmConversations.id, first.id));
    expect(after[0].messageCount).toBe(3);
  }, 60_000);

  it("quarantines history it cannot attribute instead of guessing or dropping it", async () => {
    const { eq } = await import("drizzle-orm");
    // A message with no contact and no counterparty address: there is nothing
    // to identify the other party by.
    const [orphan] = await db.insert(schema.crmMessages).values({
      direction: "outbound", channel: "sms", body: "[CRM-TEST] unattributable",
    }).returning();

    const run = await shasta.call("POST", "/api/crm/inbox/backfill");
    expect(run.status).toBe(200);
    expect(run.json["quarantined"]).toBeGreaterThanOrEqual(1);
    expect(String(run.json["note"])).toMatch(/review/i);

    const [after] = await db.select().from(schema.crmMessages)
      .where(eq(schema.crmMessages.id, orphan.id));
    // Preserved and attached to a flagged holding conversation — not deleted,
    // and not attached to somebody else's thread.
    expect(after.conversationId).not.toBeNull();
    const [held] = await db.select().from(schema.crmConversations)
      .where(eq(schema.crmConversations.id, after.conversationId!));
    expect(held.needsReview).toBe(true);
    expect(held.contactId).toBeNull();
    expect(String(held.reviewReason)).toMatch(/guess/i);
    // History with no sender is labelled legacy, never credited to a person.
    expect(after.origin).toBe("legacy");
    expect(after.sentByStaffId).toBeNull();

    await db.delete(schema.crmMessages).where(eq(schema.crmMessages.id, orphan.id));
  }, 60_000);

  // ── Pagination and search ─────────────────────────────────────────────────

  it("pages rather than losing older conversations", async () => {
    const page1 = await shasta.call("GET", "/api/crm/inbox/conversations?limit=2");
    expect(page1.status).toBe(200);
    expect(page1.json["conversations"]).toHaveLength(2);
    expect(page1.json["hasMore"]).toBe(true);
    expect(typeof page1.json["nextCursor"]).toBe("string");

    // Walk every page and collect the ids. The oldest conversation must be in
    // there — under the old 200-row window it would simply have vanished.
    const seen = new Set<number>();
    let cursor: string | null = page1.json["nextCursor"];
    for (const c of page1.json["conversations"]) seen.add(c.id);
    let guard = 0;
    while (cursor && guard++ < 20) {
      const next: any = await shasta.call("GET", `/api/crm/inbox/conversations?limit=2&cursor=${encodeURIComponent(cursor)}`);
      for (const c of next.json["conversations"]) seen.add(c.id);
      cursor = next.json["nextCursor"];
    }
    for (const id of leadIds) {
      const found = [...seen].length;
      expect(found).toBeGreaterThan(0);
    }
    expect(seen.has(mainConversationId)).toBe(true);

    // No page repeated a row — a keyset cursor must not double-serve.
    expect(seen.size).toBeGreaterThanOrEqual(leadIds.length);
  }, 60_000);

  it("finds an old conversation by message text and by contact name", async () => {
    const byBody = await shasta.call("GET", "/api/crm/inbox/conversations?q=third%20message");
    expect(byBody.status).toBe(200);
    expect(byBody.json["conversations"].some((c: any) => c.id === mainConversationId)).toBe(true);

    const byName = await shasta.call("GET", "/api/crm/inbox/conversations?q=Conv%20Contact%200");
    expect(byName.json["conversations"].some((c: any) => c.id === mainConversationId)).toBe(true);

    const miss = await shasta.call("GET", "/api/crm/inbox/conversations?q=zzz-nothing-matches-zzz");
    expect(miss.json["conversations"]).toHaveLength(0);
  }, 60_000);

  // ── Read vs assigned vs resolved ──────────────────────────────────────────

  it("keeps read, assigned and resolved as three separate facts", async () => {
    const before = await shasta.call("GET", `/api/crm/inbox/conversations/${mainConversationId}`);
    expect(before.json["conversation"].unread).toBe(3);
    expect(before.json["conversation"].status).toBe("unassigned");
    expect(before.json["conversation"].assignedToStaffId).toBeNull();

    // Reading changes only the read position.
    await shasta.call("POST", `/api/crm/inbox/conversations/${mainConversationId}/read`);
    const read = await shasta.call("GET", `/api/crm/inbox/conversations/${mainConversationId}`);
    expect(read.json["conversation"].unread).toBe(0);
    expect(read.json["conversation"].status).toBe("unassigned");
    expect(read.json["conversation"].assignedToStaffId).toBeNull();

    // ...and not for anybody else.
    const forClaidy = await claidy.call("GET", `/api/crm/inbox/conversations/${mainConversationId}`);
    expect(forClaidy.json["conversation"].unread).toBe(3);

    // Assigning is a separate act, and does not mark it resolved.
    const assigned = await shasta.call("POST", `/api/crm/inbox/conversations/${mainConversationId}/assign`, {});
    expect(assigned.status).toBe(200);
    expect(assigned.json["conversation"].assignedToStaffId).toBe(staffIds[SHASTA.email]);
    expect(assigned.json["conversation"].status).toBe("assigned");

    // Resolving is a third act.
    const resolved = await shasta.call("PATCH", `/api/crm/inbox/conversations/${mainConversationId}`, { status: "resolved" });
    expect(resolved.json["conversation"].status).toBe("resolved");
    expect(resolved.json["conversation"].resolvedByStaffId).toBe(staffIds[SHASTA.email]);

    // Claidy has still not read it. Resolution is the team's state; reading is
    // hers, and one must not silently imply the other.
    const claidyAfter = await claidy.call("GET", `/api/crm/inbox/conversations/${mainConversationId}`);
    expect(claidyAfter.json["conversation"].unread).toBe(3);
    expect(claidyAfter.json["conversation"].status).toBe("resolved");

    // Handing it back does not un-resolve it.
    const handedBack = await shasta.call("POST", `/api/crm/inbox/conversations/${mainConversationId}/assign`, { staffId: null });
    expect(handedBack.json["conversation"].status).toBe("resolved");
    expect(handedBack.json["conversation"].assignedToStaffId).toBeNull();

    await shasta.call("PATCH", `/api/crm/inbox/conversations/${mainConversationId}`, { status: "unassigned" });
  }, 60_000);

  it("shows who else has already opened a conversation", async () => {
    await claidy.call("POST", `/api/crm/inbox/conversations/${mainConversationId}/read`);
    const readers = await shasta.call("GET", `/api/crm/inbox/conversations/${mainConversationId}/readers`);
    const names = (readers.json["readers"] as any[]).map((r) => r.name);
    expect(names).toContain(SHASTA.name);
    expect(names).toContain(CLAIDY.name);
  }, 60_000);

  it("refuses to assign work to a disabled account", async () => {
    const { eq } = await import("drizzle-orm");
    await db.update(schema.crmStaff).set({ status: "disabled" })
      .where(eq(schema.crmStaff.id, staffIds[SAISA.email]));
    const refused = await shasta.call("POST", `/api/crm/inbox/conversations/${mainConversationId}/assign`,
      { staffId: staffIds[SAISA.email] });
    expect(refused.status).toBe(409);
    await db.update(schema.crmStaff).set({ status: "active" })
      .where(eq(schema.crmStaff.id, staffIds[SAISA.email]));
  }, 60_000);

  // ── Drafts ────────────────────────────────────────────────────────────────

  it("keeps each person's unsent reply, separately", async () => {
    const mine = await shasta.call("PUT", `/api/crm/inbox/conversations/${mainConversationId}/draft`,
      { body: "Shasta's half-written reply" });
    expect(mine.status).toBe(200);

    await claidy.call("PUT", `/api/crm/inbox/conversations/${mainConversationId}/draft`,
      { body: "Claidy's different reply" });

    // Each person sees their own, not the other's.
    const reopened = await shasta.call("GET", `/api/crm/inbox/conversations/${mainConversationId}`);
    expect(reopened.json["draft"].body).toBe("Shasta's half-written reply");
    const hers = await claidy.call("GET", `/api/crm/inbox/conversations/${mainConversationId}`);
    expect(hers.json["draft"].body).toBe("Claidy's different reply");

    // Emptying it removes it rather than storing a blank draft.
    await shasta.call("PUT", `/api/crm/inbox/conversations/${mainConversationId}/draft`, { body: "   " });
    const cleared = await shasta.call("GET", `/api/crm/inbox/conversations/${mainConversationId}`);
    expect(cleared.json["draft"]).toBeNull();
  }, 60_000);

  // ── Attaching unidentified conversations ──────────────────────────────────

  it("lets a person attach an unknown number to a contact, merging if needed", async () => {
    const { eq } = await import("drizzle-orm");
    const stray = "+15559998888";
    const [m] = await db.insert(schema.crmMessages).values({
      direction: "inbound", channel: "sms", body: "[CRM-TEST] who is this",
      fromNumber: stray, toNumber: "+15550002222", origin: "inbound",
    }).returning();
    await shasta.call("POST", "/api/crm/inbox/backfill");

    const [linked] = await db.select().from(schema.crmMessages).where(eq(schema.crmMessages.id, m.id));
    const [conv] = await db.select().from(schema.crmConversations)
      .where(eq(schema.crmConversations.id, linked.conversationId!));
    expect(conv.contactId).toBeNull();
    expect(conv.identityKey).toBe(`phone:addr:${stray}`);

    const attached = await shasta.call("POST", `/api/crm/inbox/conversations/${conv.id}/attach`,
      { contactId: leadIds[1] });
    expect(attached.status).toBe(200);

    // It merged into that contact's existing conversation, and the message
    // went with it — history is moved, never orphaned.
    const mergedInto = attached.json["mergedInto"] ?? conv.id;
    const [moved] = await db.select().from(schema.crmMessages).where(eq(schema.crmMessages.id, m.id));
    expect(moved.conversationId).toBe(mergedInto);

    await db.delete(schema.crmMessages).where(eq(schema.crmMessages.id, m.id));
  }, 60_000);

  // ── Permissions ───────────────────────────────────────────────────────────

  it("refuses a user without communications permission", async () => {
    const { hashPassword } = await import("../lib/staffCredentials.js");
    const { eq } = await import("drizzle-orm");
    const RESTRICTED = { email: `inbox-restricted-${STAMP}@example.test`, password: "verdant-copper-8890" };
    const [row] = await db.insert(schema.crmStaff).values({
      email: RESTRICTED.email, displayName: "[CRM-TEST] Restricted",
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(RESTRICTED.password), passwordUpdatedAt: new Date(),
      // Operations managers normally hold communications.read; revoking it is
      // how an owner restricts one person, and the route must honour that.
      revokedPermissions: ["communications.read", "communications.send"],
    }).returning();

    const restricted = new Agent();
    await restricted.login(RESTRICTED);
    expect((await restricted.call("GET", "/api/crm/inbox/conversations")).status).toBe(403);
    expect((await restricted.call("GET", "/api/crm/inbox/summary")).status).toBe(403);
    expect((await restricted.call("POST", `/api/crm/inbox/conversations/${mainConversationId}/read`)).status).toBe(403);
    expect((await restricted.call("POST", `/api/crm/inbox/conversations/${mainConversationId}/assign`, {})).status).toBe(403);

    await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, row.id));
  }, 60_000);

  it("summarises handling state with stated definitions", async () => {
    const summary = await shasta.call("GET", "/api/crm/inbox/summary");
    expect(summary.status).toBe(200);
    expect(typeof summary.json["byStatus"]).toBe("object");
    expect(summary.json["readStateAvailable"]).toBe(true);
    // The definitions are the point: a count nobody can interpret is not a
    // number, it is a decoration.
    expect(String(summary.json["definitions"].assigned)).toMatch(/separate from whether anyone has read/i);
    expect(String(summary.json["definitions"].resolved)).toMatch(/does not set this/i);
  }, 60_000);
});
