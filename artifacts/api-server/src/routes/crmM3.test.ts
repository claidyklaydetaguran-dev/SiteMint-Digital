/**
 * M3 acceptance — documents, the internal calendar, mailbox verification, and
 * the connected operating journey the brief asks to be proven end to end.
 *
 * Gated on CRM_TEST_DATABASE_URL; skips without it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type express from "express";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "m3-admin-secret-value";
delete process.env.CRM_EMAIL_TEST_MODE; // test mode ON — nothing can reach a real inbox

const STAMP = Date.now();
const OWNER = { email: `m3-owner-${STAMP}@example.test`, name: "[CRM-TEST] M3 Owner", password: "harbour-trellis-4417" };
const HIRE = { email: `m3-hire-${STAMP}@example.test`, name: "[CRM-TEST] M3 Hire", password: "lantern-quartz-9928" };

const suite = TEST_DB ? describe : describe.skip;

suite("M3 documents, calendar and the connected journey (real DB)", () => {
  let server: http.Server;
  let base: string;

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
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const pair = c.split(";")[0];
        if (pair.startsWith("crm_staff_session=")) this.cookie = pair.endsWith("=") ? "" : pair;
      }
      const text = await res.text();
      let json: Record<string, any> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON (file download) */ }
      return { status: res.status, json, text, headers: res.headers };
    }
    async raw(p: string) { return fetch(`${base}${p}`, { headers: this.cookie ? { Cookie: this.cookie } : {} }); }
    async login(who: { email: string; password: string }) {
      const r = await this.call("POST", "/api/crm/staff/login", { email: who.email, password: who.password });
      if (typeof r.json["csrfToken"] === "string") this.csrf = r.json["csrfToken"];
      return r;
    }
  }

  const owner = new Agent();
  const hire = new Agent();
  const anon = new Agent();
  const ids: Record<string, any> = {};

  async function wipe() {
    const m = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const { db } = m;
    await db.delete(m.crmDocumentShares);
    await db.delete(m.crmAttachmentBlobs);
    await db.delete(m.crmDocumentRequests);
    await db.delete(m.crmAttachments);
    await db.delete(m.crmAppointmentAttendees);
    await db.delete(m.crmAppointments);
    await db.delete(m.crmScheduledJobs);
    await db.delete(m.crmNotifications);
    await db.execute(sql`DELETE FROM crm_tasks WHERE title LIKE '%CRM-TEST%'`);
    await db.execute(sql`DELETE FROM crm_projects WHERE name LIKE '%CRM-TEST%'`);
    await db.execute(sql`DELETE FROM crm_leads WHERE name LIKE '%CRM-TEST%'`);
    await db.delete(m.crmStaff);
    await db.delete(m.crmStaffLoginAttempts);
  }

  async function resetThrottle() {
    const { db, crmStaffLoginAttempts } = await import("@workspace/db");
    await db.delete(crmStaffLoginAttempts);
  }

  beforeAll(async () => {
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: express.Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await wipe();
    await owner.call("POST", "/api/crm/staff/bootstrap", {
      adminPassword: "m3-admin-secret-value", email: OWNER.email,
      displayName: OWNER.name, password: OWNER.password,
    });
    await owner.login(OWNER);
    ids["owner"] = (await owner.call("GET", "/api/crm/staff/me")).json["staff"].id;
  }, 120_000);

  afterAll(async () => {
    if (TEST_DB) await wipe();
    await new Promise<void>((res, rej) => server.close((e) => e ? rej(e) : res()));
  }, 60_000);

  // ── Mailbox verification is earned, never assumed ─────────────────────────

  it("an invitation delivered by hand does NOT verify the mailbox", async () => {
    // Mail is unconfigured in this environment, so delivery falls back to
    // manual and the response says so instead of implying an email went out.
    const invited = await owner.call("POST", "/api/crm/staff", {
      email: HIRE.email, displayName: HIRE.name, role: "operations_manager",
    });
    expect(invited.status).toBe(201);
    expect(invited.json["delivery"]).toBe("manual");
    expect(typeof invited.json["deliveryReason"]).toBe("string");
    expect(invited.json["staff"].emailVerified).toBe(false);
    ids["hire"] = invited.json["staff"].id;
    ids["hireToken"] = invited.json["activationToken"];

    const activated = await anon.call("POST", "/api/crm/staff/activation", {
      token: ids["hireToken"], password: HIRE.password,
    });
    expect(activated.status).toBe(200);
    // The critical assertion: setting a password via a hand-delivered link
    // proves somebody had the link, NOT that they own the address.
    expect(activated.json["emailVerified"]).toBe(false);

    await resetThrottle();
    await hire.login(HIRE);
    const me = await hire.call("GET", "/api/crm/staff/me");
    expect(me.json["staff"].emailVerified).toBe(false);
    expect(me.json["staff"].emailVerifiedAt).toBeNull();
  }, 60_000);

  it("marks the token's delivery channel, which is what decides verification", async () => {
    const { db, crmStaffTokens } = await import("@workspace/db");
    const { eq, desc } = await import("drizzle-orm");
    const [token] = await db.select().from(crmStaffTokens)
      .where(eq(crmStaffTokens.staffId, ids["hire"]))
      .orderBy(desc(crmStaffTokens.id)).limit(1);
    expect(token.delivery).toBe("manual");
  });

  // ── Documents ─────────────────────────────────────────────────────────────

  it("uploads a private document against a real record, with validation", async () => {
    await resetThrottle();
    await owner.login(OWNER);
    const lead = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] Docs Client", email: `docs-${STAMP}@example.test`, company: "[CRM-TEST] Docs Ltd",
    });
    ids["lead"] = lead.json["lead"].id;

    // Refuses a type it will not serve back safely.
    const svg = await owner.call("POST", "/api/crm/documents", {
      entityType: "lead", entityId: ids["lead"], filename: "logo.svg",
      mimeType: "image/svg+xml", contentBase64: Buffer.from("<svg/>").toString("base64"),
    });
    expect(svg.status).toBe(415);

    // Refuses an unknown parent record rather than orphaning the file.
    const orphan = await owner.call("POST", "/api/crm/documents", {
      entityType: "lead", entityId: 999999, filename: "a.pdf",
      mimeType: "application/pdf", contentBase64: Buffer.from("%PDF-1.4").toString("base64"),
    });
    expect(orphan.status).toBe(404);

    // Refuses an empty file.
    const empty = await owner.call("POST", "/api/crm/documents", {
      entityType: "lead", entityId: ids["lead"], filename: "a.pdf",
      mimeType: "application/pdf", contentBase64: "",
    });
    expect(empty.status).toBe(400);

    const bytes = Buffer.from("%PDF-1.4 [CRM-TEST] contract v1");
    const up = await owner.call("POST", "/api/crm/documents", {
      entityType: "lead", entityId: ids["lead"], filename: "contract.pdf",
      mimeType: "application/pdf", contentBase64: bytes.toString("base64"),
    });
    expect(up.status).toBe(201);
    expect(up.json["attachment"].version).toBe(1);
    // Nothing here may be described as signed.
    expect(up.json["attachment"].signatureStatus).toBe("not_a_signature");
    ids["doc"] = up.json["attachment"].id;
  }, 60_000);

  it("versions a re-upload instead of shadowing the previous file", async () => {
    const v2 = await owner.call("POST", "/api/crm/documents", {
      entityType: "lead", entityId: ids["lead"], filename: "contract.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("%PDF-1.4 [CRM-TEST] contract v2").toString("base64"),
    });
    expect(v2.status).toBe(201);
    expect(v2.json["attachment"].version).toBe(2);
    expect(v2.json["attachment"].supersedesId).toBe(ids["doc"]);
    ids["docV2"] = v2.json["attachment"].id;

    const listed = await owner.call("GET", `/api/crm/documents?entityType=lead&entityId=${ids["lead"]}`);
    // Only the current version by default; the older one is still there.
    expect((listed.json["documents"] as { id: number }[]).map((d) => d.id)).toEqual([ids["docV2"]]);
    expect(listed.json["supersededCount"]).toBe(1);

    const all = await owner.call("GET", `/api/crm/documents?entityType=lead&entityId=${ids["lead"]}&includeSuperseded=true`);
    expect((all.json["documents"] as unknown[]).length).toBe(2);
  }, 30_000);

  it("downloads as an attachment with sniffing disabled, and never inline", async () => {
    const res = await owner.raw(`/api/crm/documents/${ids["docV2"]}/download`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment;");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString()).toContain("contract v2");
  });

  it("refuses document access without permission and without a session", async () => {
    await owner.call("PATCH", `/api/crm/staff/${ids["hire"]}`, { revokedPermissions: ["documents.read"] });
    await resetThrottle();
    await hire.login(HIRE);
    const denied = await hire.call("GET", `/api/crm/documents?entityType=lead&entityId=${ids["lead"]}`);
    expect(denied.status).toBe(403);
    expect(denied.json["permission"]).toBe("documents.read");

    const anonRes = await anon.raw(`/api/crm/documents/${ids["docV2"]}/download`);
    expect(anonRes.status).toBe(401);

    await resetThrottle();
    await owner.login(OWNER);
    await owner.call("PATCH", `/api/crm/staff/${ids["hire"]}`, { revokedPermissions: [] });
  }, 60_000);

  // ── Document requests feed the Command Center ─────────────────────────────

  it("a document request is what 'Waiting for documents' actually counts", async () => {
    await resetThrottle();
    await owner.login(OWNER);
    const before = await owner.call("GET", "/api/crm/command-center/panel/waiting_documents");
    const beforeCount = before.json["panel"].count as number;

    const req1 = await owner.call("POST", "/api/crm/document-requests", {
      entityType: "lead", entityId: ids["lead"], title: "[CRM-TEST] Signed engagement letter",
      dueDate: new Date(Date.now() + 3 * 864e5).toISOString(),
    });
    expect(req1.status).toBe(201);
    ids["request"] = req1.json["request"].id;

    const after = await owner.call("GET", "/api/crm/command-center/panel/waiting_documents");
    expect(after.json["panel"].available).toBe(true);
    expect(after.json["panel"].count).toBe(beforeCount + 1);
    expect(after.json["panel"].definition).toContain("asked for and not yet received");
    // The count and its list agree.
    expect((after.json["panel"].items as unknown[]).length).toBe(after.json["panel"].count);
  }, 60_000);

  it("uploading against a request marks it received and clears it from the panel", async () => {
    const up = await owner.call("POST", "/api/crm/documents", {
      entityType: "lead", entityId: ids["lead"], filename: "engagement-letter.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("%PDF-1.4 [CRM-TEST] engagement").toString("base64"),
      documentRequestId: ids["request"],
    });
    expect(up.status).toBe(201);
    expect(up.json["satisfiedRequestId"]).toBe(ids["request"]);

    const requests = await owner.call("GET", `/api/crm/document-requests?entityType=lead&entityId=${ids["lead"]}`);
    const mine = (requests.json["requests"] as any[]).find((r) => r.id === ids["request"]);
    expect(mine.status).toBe("received");
    expect(mine.receivedAttachmentId).toBe(up.json["attachment"].id);

    const panel = await owner.call("GET", "/api/crm/command-center/panel/waiting_documents");
    expect((panel.json["panel"].items as any[]).some((i) => i.id === ids["request"])).toBe(false);
  }, 60_000);

  // ── Sharing ───────────────────────────────────────────────────────────────

  it("shares a document by expiring, countable, revocable link", async () => {
    const share = await owner.call("POST", `/api/crm/documents/${ids["docV2"]}/share`, {
      expiresInHours: 24, maxDownloads: 1, sharedWithLabel: "[CRM-TEST] client",
    });
    expect(share.status).toBe(201);
    const token = share.json["shareToken"] as string;

    // Anonymous download works — the token IS the credential.
    const first = await anon.raw(`/api/crm/documents/shared/${token}`);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-disposition")).toContain("attachment;");

    // ...but only up to maxDownloads.
    const second = await anon.raw(`/api/crm/documents/shared/${token}`);
    expect(second.status).toBe(404);

    const listed = await owner.call("GET", `/api/crm/documents/${ids["docV2"]}/shares`);
    expect(listed.json["shares"][0].downloadCount).toBe(1);
    // The raw token is never returned again.
    expect(JSON.stringify(listed.json)).not.toContain(token);
  }, 60_000);

  it("a revoked share stops working immediately", async () => {
    const share = await owner.call("POST", `/api/crm/documents/${ids["docV2"]}/share`, { expiresInHours: 24 });
    const token = share.json["shareToken"] as string;
    expect((await anon.raw(`/api/crm/documents/shared/${token}`)).status).toBe(200);

    await owner.call("POST", `/api/crm/documents/shares/${share.json["share"].id}/revoke`);
    expect((await anon.raw(`/api/crm/documents/shared/${token}`)).status).toBe(404);
  }, 30_000);

  it("an unknown share token answers exactly like a revoked one", async () => {
    const bogus = await anon.raw("/api/crm/documents/shared/not-a-real-token-but-long-enough-to-try");
    expect(bogus.status).toBe(404);
  });

  it("never reports an uploaded file as a signature", async () => {
    const panel = await owner.call("GET", "/api/crm/command-center/panel/documents_signed");
    expect(panel.json["panel"].available).toBe(false);
    expect(panel.json["panel"].count).toBeNull();
    expect(String(panel.json["panel"].reason)).toContain("No e-signature provider");
  });

  // ── Calendar ──────────────────────────────────────────────────────────────

  it("creates an appointment linked to a client, and says invitations were not sent", async () => {
    const start = new Date(Date.now() + 2 * 3600_000);
    const created = await owner.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] Kickoff call",
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3600_000).toISOString(),
      leadId: ids["lead"], location: "Google Meet",
      reminderMinutesBefore: 30,
      timezone: "Asia/Manila",
    });
    expect(created.status).toBe(201);
    // No attendee mail exists, so it says so rather than implying invites.
    expect(created.json["invitationsSent"]).toBe(false);
    ids["appt"] = created.json["appointment"].id;

    const listed = await owner.call("GET", "/api/crm/appointments");
    const mine = (listed.json["appointments"] as any[]).find((a) => a.id === ids["appt"]);
    expect(mine).toBeDefined();
    expect(mine.lead.name).toBe("[CRM-TEST] Docs Client");
    // The organiser is an attendee of their own meeting.
    expect((mine.attendees as any[]).some((x) => x.staffId === ids["owner"])).toBe(true);
  }, 60_000);

  it("refuses an appointment that ends before it starts", async () => {
    const start = new Date(Date.now() + 86_400_000);
    const bad = await owner.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] backwards",
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() - 3600_000).toISOString(),
    });
    expect(bad.status).toBe(400);
    // ...and on a partial reschedule too.
    const bad2 = await owner.call("PATCH", `/api/crm/appointments/${ids["appt"]}`, {
      endAt: new Date(Date.now() - 864e5).toISOString(),
    });
    expect(bad2.status).toBe(400);
  }, 30_000);

  it("schedules, moves and cancels the appointment reminder in step with the booking", async () => {
    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const key = `appointment_reminder:${ids["appt"]}`;

    let [job] = await db.select().from(crmScheduledJobs).where(eq(crmScheduledJobs.dedupeKey, key));
    expect(job.status).toBe("pending");
    const originalRun = job.runAt.getTime();

    // Rescheduling the meeting moves the reminder, never duplicates it.
    const moved = new Date(Date.now() + 6 * 3600_000);
    await owner.call("PATCH", `/api/crm/appointments/${ids["appt"]}`, {
      startAt: moved.toISOString(), endAt: new Date(moved.getTime() + 3600_000).toISOString(),
    });
    const rows = await db.select().from(crmScheduledJobs).where(eq(crmScheduledJobs.dedupeKey, key));
    expect(rows.length).toBe(1);
    expect(rows[0].runAt.getTime()).not.toBe(originalRun);

    // Cancelling kills it.
    await owner.call("DELETE", `/api/crm/appointments/${ids["appt"]}`);
    [job] = await db.select().from(crmScheduledJobs).where(eq(crmScheduledJobs.dedupeKey, key));
    expect(job.status).toBe("cancelled");
  }, 60_000);

  it("a fired appointment reminder notifies its attendees", async () => {
    const { processDueJobs } = await import("../lib/crmScheduler.js");
    const start = new Date(Date.now() + 10 * 60_000);
    const created = await owner.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] imminent review",
      startAt: start.toISOString(), endAt: new Date(start.getTime() + 1800_000).toISOString(),
      reminderMinutesBefore: 30, // already inside the window → due now
    });
    expect(created.status).toBe(201);

    const result = await processDueJobs();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const inbox = await owner.call("GET", "/api/crm/notifications");
    expect((inbox.json["notifications"] as any[]).some(
      (n) => n.kind === "appointment_reminder" && n.entityId === created.json["appointment"].id,
    )).toBe(true);
  }, 60_000);

  it("feeds the Command Center's appointments panel with real bookings", async () => {
    const panel = await owner.call("GET", "/api/crm/command-center/panel/appointments");
    expect(panel.json["panel"].available).toBe(true);
    expect(panel.json["panel"].count).toBeGreaterThanOrEqual(1);
    expect((panel.json["panel"].items as unknown[]).length).toBe(panel.json["panel"].count);
    // Cancelled meetings are excluded.
    expect((panel.json["panel"].items as any[]).some((a) => a.id === ids["appt"])).toBe(false);
  }, 30_000);

  it("exports an .ics and calls it an export, not synchronisation", async () => {
    const start = new Date(Date.now() + 3 * 864e5);
    const created = await owner.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] export me",
      startAt: start.toISOString(), endAt: new Date(start.getTime() + 3600_000).toISOString(),
    });
    const res = await owner.raw(`/api/crm/appointments/${created.json["appointment"].id}/ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:[CRM-TEST] export me");
  }, 30_000);

  // ── The connected operating journey ───────────────────────────────────────

  it("runs contact → deal → project → task → My Day → document → completion", async () => {
    await resetThrottle();
    await owner.login(OWNER);

    // A deal on the existing contact.
    const deal = await owner.call("POST", "/api/crm/deals", {
      leadId: ids["lead"], name: "[CRM-TEST] Website build", value: "8400", stage: "Proposal",
    });
    expect([200, 201]).toContain(deal.status);

    // Convert to delivery work.
    const project = await owner.call("POST", "/api/crm/projects", {
      name: "[CRM-TEST] Docs Ltd website", leadId: ids["lead"], stage: "Design",
    });
    const projectId = project.json["project"].id;
    await owner.call("PATCH", `/api/crm/operations/projects/${projectId}`, {
      ownerStaffId: ids["owner"], nextAction: "Draft the homepage",
    });

    // Assign work; it must land in the assignee's My Day.
    const task = await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] Draft homepage", projectId, assignedToStaffId: ids["owner"],
      dueDate: new Date(Date.now() - 2 * 864e5).toISOString(),
    });
    expect(task.status).toBe(201);

    const day = await owner.call("GET", "/api/crm/my-day");
    expect((day.json["overdue"] as any[]).map((t) => t.title)).toContain("[CRM-TEST] Draft homepage");

    // Record an interaction and its follow-up.
    const note = await owner.call("POST", `/api/crm/leads/${ids["lead"]}/notes`, {
      note: "[CRM-TEST] Client approved the direction on a call.",
    });
    expect([200, 201]).toContain(note.status);

    // Creating a project seeds its task template, so this one already carries
    // delivery work — progress is measured against all of it, not just the
    // task added here.
    const before = (await owner.call("GET", "/api/crm/operations/projects"))
      .json["projects"].find((p: any) => p.id === projectId);
    expect(before.progressPercent).not.toBeNull();

    // Complete the work; attribution must name the person.
    const done = await owner.call("PATCH", `/api/crm/operations/tasks/${task.json["task"].id}`,
      { status: "completed" });
    expect(done.status).toBe(200);
    expect(done.json["task"].completedByStaffId).toBe(ids["owner"]);

    // Project progress derives from real task state, so it moved.
    const after = (await owner.call("GET", "/api/crm/operations/projects"))
      .json["projects"].find((p: any) => p.id === projectId);
    expect(after.openTasks).toBe(before.openTasks - 1);
    expect(after.progressPercent).toBeGreaterThan(before.progressPercent);

    // And the whole thing survives a re-read.
    const reread = await owner.call("GET", `/api/crm/operations/projects/${projectId}`);
    expect(reread.json["project"].nextAction).toBe("Draft the homepage");
    const mine = (reread.json["tasks"] as any[]).find((t) => t.title === "[CRM-TEST] Draft homepage");
    expect(mine.status).toBe("completed");
    expect(mine.completedByStaffId).toBe(ids["owner"]);
  }, 120_000);

  it("a restricted user is refused the same journey's privileged steps", async () => {
    await resetThrottle();
    await hire.login(HIRE);
    expect((await hire.call("GET", "/api/crm/staff")).status).toBe(403);
    expect((await hire.call("DELETE", `/api/crm/leads/${ids["lead"]}`)).status).toBe(403);
    // ...but can do their actual job.
    expect((await hire.call("GET", "/api/crm/my-day")).status).toBe(200);
    expect((await hire.call("GET", "/api/crm/appointments")).status).toBe(200);
  }, 60_000);

  it("an operations manager files documents but cannot delete one", async () => {
    await resetThrottle();
    await hire.login(HIRE);

    // The everyday half of the job is unobstructed.
    const uploaded = await hire.call("POST", "/api/crm/documents", {
      entityType: "lead", entityId: ids["lead"],
      filename: "ops-manager-upload.txt", mimeType: "text/plain",
      contentBase64: Buffer.from("scope notes").toString("base64"),
    });
    expect(uploaded.status).toBe(201);
    expect((await hire.call("GET", `/api/crm/documents?entityType=lead&entityId=${ids["lead"]}`)).status).toBe(200);

    // Removing a client's file is a different act from adding one. The role
    // grants documents.write, not documents.delete, so this is refused — and
    // the refusal names the permission rather than being an opaque 403.
    const refused = await hire.call("DELETE", `/api/crm/documents/${uploaded.json["attachment"].id}`);
    expect(refused.status).toBe(403);
    expect(String(refused.json["permission"] ?? "")).toBe("documents.delete");

    // The file is still there afterwards — the refusal was not a partial delete.
    const still = await owner.call("GET", `/api/crm/documents?entityType=lead&entityId=${ids["lead"]}`);
    expect((still.json["documents"] as any[]).some((d) => d.filename === "ops-manager-upload.txt")).toBe(true);

    // An owner can delete it, which is what makes the refusal a permission
    // boundary rather than a broken route.
    const byOwner = await owner.call("DELETE", `/api/crm/documents/${uploaded.json["attachment"].id}`);
    expect(byOwner.status).toBe(200);
  }, 60_000);
});
