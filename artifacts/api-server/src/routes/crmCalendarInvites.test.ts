/**
 * Calendar attendee invitations — the properties that hurt when they are wrong.
 *
 * The four failures this suite exists to catch:
 *
 *   1. A DUPLICATE in somebody's calendar. Caused by a changed UID or a
 *      SEQUENCE that does not move, so both are asserted from the bytes of the
 *      attachment rather than from a field name.
 *   2. A GHOST meeting nobody can get rid of, because cancelling emitted
 *      another REQUEST instead of a CANCEL.
 *   3. SPAM. An edit that changes nothing an attendee can see must send
 *      nothing at all — proven by the mail seam not being called, not by a
 *      flag saying it was not.
 *   4. A SILENT LIE. With no RESEND_API_KEY nothing can be delivered, and the
 *      API must say `not_configured` with the reason instead of reporting a
 *      success it never observed. This is the live behaviour of this
 *      environment, so it is asserted first and in detail.
 *
 * Nothing here can reach a real mailbox. `../lib/staffMail.js` is mocked
 * wholesale, exactly as `crmSupport.test.ts` and `crmSupportDelivery.test.ts`
 * mock it: the seam is replaced, so a real send is impossible rather than
 * merely switched off by an environment variable somebody could set.
 *
 * The pure-function tests at the bottom of the file run everywhere. The
 * route tests are gated on CRM_TEST_DATABASE_URL and skip without it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";

// ── The mail seam, replaced ─────────────────────────────────────────────────
//
// `mode` lets one suite exercise both truths: the environment we actually
// have (no API key → `not_configured`), and the one we will have (a provider
// that accepts → `sent`). Every call is recorded, so "nothing was sent" can be
// proven by an empty array rather than by trusting a return value.

interface RecordedSend {
  to: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}

const sends: RecordedSend[] = [];
let mode: "not_configured" | "accept" | "refused" = "not_configured";

const NOT_CONFIGURED_REASON = "RESEND_API_KEY is not set on this server, so no mail can be sent.";

vi.mock("../lib/staffMail.js", () => ({
  RESEND_IDEMPOTENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
  staffMailConfigured: () => mode !== "not_configured",
  staffMailBlockedReason: () => (mode === "not_configured" ? NOT_CONFIGURED_REASON : null),
  trySendStaffMail: async (args: RecordedSend) => {
    sends.push(args);
    if (mode === "accept") return { sent: true as const, providerId: `test-${sends.length}` };
    if (mode === "refused") {
      return {
        sent: false as const, failure: "rejected" as const, configured: true,
        reason: "The sending domain is not verified.",
      };
    }
    return {
      sent: false as const, failure: "not_configured" as const, configured: false,
      reason: NOT_CONFIGURED_REASON,
    };
  },
  classifyProviderError: () => "rejected",
  classifyThrownMailError: () => "uncertain",
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
  activationUrl: () => null,
}));

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "calendar-invites-admin-secret";

const STAMP = Date.now();
const ORGANISER = {
  email: `invite-organiser-${STAMP}@example.test`,
  name: "[CRM-TEST] Shasta Organiser",
  password: "harbour-trellis-6612",
};
const COLLEAGUE = {
  email: `invite-colleague-${STAMP}@example.test`,
  name: "[CRM-TEST] Claidy Colleague",
  password: "lantern-quartz-8830",
};
const LATECOMER = {
  email: `invite-latecomer-${STAMP}@example.test`,
  name: "[CRM-TEST] Saisa Latecomer",
  password: "meridian-basalt-4417",
};
const RESTRICTED = {
  email: `invite-restricted-${STAMP}@example.test`,
  name: "[CRM-TEST] Booking Reader",
  password: "verdant-copper-2245",
};
const CLIENT_EMAIL = `invite-client-${STAMP}@example.test`;

const suite = TEST_DB ? describe : describe.skip;

class Agent {
  cookie = ""; csrf = "";
  constructor(private baseUrl: () => string) {}
  async call(method: string, p: string, body?: unknown) {
    const headers: Record<string, string> = {};
    if (this.cookie) headers["Cookie"] = this.cookie;
    if (this.csrf) headers["x-csrf-token"] = this.csrf;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${this.baseUrl()}${p}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON (a file download) */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  async raw(p: string) {
    return fetch(`${this.baseUrl()}${p}`, { headers: this.cookie ? { Cookie: this.cookie } : {} });
  }
  async login(who: { email: string; password: string }) {
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

// ── Reading the calendar payload back ───────────────────────────────────────

/** The decoded .ics that travelled with a recorded send. */
function icsOf(send: RecordedSend): string {
  const att = send.attachments?.find((a) => a.filename.endsWith(".ics"));
  if (!att) throw new Error(`send to ${send.to} carried no .ics attachment`);
  return Buffer.from(att.content, "base64").toString("utf8");
}

/**
 * One property's value, with RFC 5545 line folding undone first — a folded
 * line is a real line, and a test that reads the raw text would pass on a
 * payload no client can parse.
 */
function prop(ics: string, name: string): string | undefined {
  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  const line = unfolded.split("\r\n").find((l) => l === name || l.startsWith(`${name}:`) || l.startsWith(`${name};`));
  if (!line) return undefined;
  const colon = line.indexOf(":");
  return colon === -1 ? "" : line.slice(colon + 1);
}

function allProps(ics: string, name: string): string[] {
  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  return unfolded.split("\r\n")
    .filter((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`))
    .map((l) => l.slice(l.indexOf(":") + 1));
}

/** `20260916T013000Z` for a given instant — what an attendee's client reads. */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

suite("calendar invitations: request, update, cancel (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: Record<string, number> = {};
  const appointmentIds: number[] = [];
  let apptId = 0;
  let uid = "";

  const organiser = new Agent(() => base);
  const restricted = new Agent(() => base);

  /** Everything sent since the marker, so one test never reads another's mail. */
  function since(marker: number): RecordedSend[] {
    return sends.slice(marker);
  }
  const mark = () => sends.length;

  async function appointmentRow(id: number) {
    const [row] = await db.select().from(schema.crmAppointments)
      .where(eq(schema.crmAppointments.id, id)).limit(1);
    return row;
  }

  async function attendeeRows(id: number) {
    return db.select().from(schema.crmAppointmentAttendees)
      .where(eq(schema.crmAppointmentAttendees.appointmentId, id))
      .orderBy(schema.crmAppointmentAttendees.id);
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

    const { hashPassword } = await import("../lib/staffCredentials.js");
    for (const who of [ORGANISER, COLLEAGUE, LATECOMER]) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role: "owner", status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
        // Reminder mail is a separate opt-in from invitations, and this suite
        // asserts the two never stand in for one another.
        reminderEmailEnabled: true,
      }).returning();
      staffIds[who.email] = row.id;
    }

    // Somebody who can see the calendar but may not book on it. `tasks.write`
    // is the grant every write on this router asserts.
    const [reader] = await db.insert(schema.crmStaff).values({
      email: RESTRICTED.email, displayName: RESTRICTED.name,
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(RESTRICTED.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["tasks.write"],
    }).returning();
    staffIds[RESTRICTED.email] = reader.id;

    expect(await organiser.login(ORGANISER)).toBe(200);
    expect(await restricted.login(RESTRICTED)).toBe(200);
  }, 120_000);

  afterAll(async () => {
    if (appointmentIds.length) {
      await db.delete(schema.crmAppointmentAttendees)
        .where(inArray(schema.crmAppointmentAttendees.appointmentId, appointmentIds));
      await db.delete(schema.crmAppointments)
        .where(inArray(schema.crmAppointments.id, appointmentIds));
      for (const id of appointmentIds) {
        await db.delete(schema.crmScheduledJobs)
          .where(eq(schema.crmScheduledJobs.dedupeKey, `appointment_reminder:${id}`));
      }
    }
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmNotifications).where(eq(schema.crmNotifications.staffId, id));
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── The honest answer in THIS environment ─────────────────────────────────

  it("reports not_configured with the reason, and never claims an invitation was sent", async () => {
    mode = "not_configured";
    const m = mark();
    // 01:30 UTC on a fixed future day. Deliberately an instant that falls on
    // the NEXT calendar day in Asia/Manila (+08:00) — a payload that carried a
    // local wall-clock time instead of the instant would be a day out for the
    // attendee, and this is the appointment the timezone test reads back.
    const start = new Date("2026-11-18T01:30:00.000Z");
    const created = await organiser.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] Kickoff with the client",
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Manila",
      location: "Google Meet",
      reminderMinutesBefore: 30,
      attendeeStaffIds: [staffIds[COLLEAGUE.email]],
      externalAttendees: [{ email: CLIENT_EMAIL, name: "Acme Buyer" }],
    });
    expect(created.status).toBe(201);
    apptId = created.json["appointment"].id;
    appointmentIds.push(apptId);

    // The headline field keeps telling the truth.
    expect(created.json["invitationsSent"]).toBe(false);

    const report = created.json["invitations"];
    expect(report.status).toBe("not_configured");
    expect(report.accepted).toBe(0);
    // Organiser + colleague + client. Attempted, and each honestly unsent.
    expect(report.attempted).toBe(3);
    expect(report.results.every((r: any) => r.outcome === "not_configured")).toBe(true);
    // The REASON reaches the caller — an operator has to know it is a missing
    // key and not a bad address.
    expect(String(report.note)).toContain("RESEND_API_KEY");
    expect(String(created.json["invitationNote"])).toContain("RESEND_API_KEY");
    // ...and it is never dressed up as success.
    expect(String(report.note).toLowerCase()).not.toContain("invitation sent");

    // The database agrees with the response, per person.
    const rows = await attendeeRows(apptId);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.invitationOutcome === "not_configured")).toBe(true);
    expect(rows.every((r) => r.invitationMethod === "REQUEST")).toBe(true);
    expect(rows.every((r) => r.invitationSequence === 0)).toBe(true);
    expect(rows.every((r) => String(r.invitationReason).includes("RESEND_API_KEY"))).toBe(true);

    // Nothing was handed to a provider, but the message WAS composed — that is
    // what makes it re-sendable the moment a key exists.
    expect(since(m)).toHaveLength(3);
  }, 60_000);

  it("addresses the attendee's own mailbox, never a masked or invented one", async () => {
    const recipients = sends.map((s) => s.to).sort();
    expect(recipients).toContain(CLIENT_EMAIL);
    expect(recipients).toContain(COLLEAGUE.email);
    expect(recipients).toContain(ORGANISER.email);
    // The REPORT masks the address; the message does not.
    expect(sends.every((s) => !s.to.includes("•"))).toBe(true);
  });

  // ── The payload a calendar actually reads ────────────────────────────────

  it("carries a REQUEST with a stable UID, SEQUENCE 0, ORGANIZER and ATTENDEE", async () => {
    const ics = icsOf(sends[sends.length - 1]!);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(prop(ics, "METHOD")).toBe("REQUEST");
    expect(prop(ics, "SEQUENCE")).toBe("0");
    expect(prop(ics, "STATUS")).toBe("CONFIRMED");

    uid = prop(ics, "UID")!;
    expect(uid).toBe(`sitemint-crm-appointment-${apptId}@sitemintdigital.com`);

    expect(prop(ics, "ORGANIZER")).toMatch(/^mailto:/);
    const attendees = allProps(ics, "ATTENDEE");
    expect(attendees).toHaveLength(3);
    expect(attendees.some((a) => a.includes(CLIENT_EMAIL))).toBe(true);
    // The organiser attends as CHAIR and is not asked to RSVP to themselves.
    const unfolded = ics.replace(/\r\n[ \t]/g, "");
    expect(unfolded).toMatch(/ATTENDEE[^\r\n]*ROLE=CHAIR[^\r\n]*ACCEPTED/);
    expect(unfolded).toMatch(/ATTENDEE[^\r\n]*RSVP=TRUE/);

    // The attachment is what makes a mail client offer the Add button.
    const att = sends[sends.length - 1]!.attachments![0]!;
    expect(att.filename).toBe("invite.ics");
    expect(att.contentType).toContain("text/calendar");
    expect(att.contentType).toContain("method=REQUEST");
  });

  it("carries the right INSTANT for an attendee in another timezone", async () => {
    // The booking was made in Asia/Manila; the payload must not encode Manila
    // wall-clock time. 01:30 UTC is 09:30 the same day in Manila — a client in
    // London, Manila or Los Angeles all resolve the same moment only because
    // the value is absolute.
    const start = new Date("2026-11-18T01:30:00.000Z");
    const end = new Date("2026-11-18T02:30:00.000Z");

    for (const send of sends.slice(-3)) {
      const ics = icsOf(send);
      expect(prop(ics, "DTSTART")).toBe(utcStamp(start));   // 20261118T013000Z
      expect(prop(ics, "DTEND")).toBe(utcStamp(end));
      expect(prop(ics, "DTSTART")!.endsWith("Z")).toBe(true);
    }

    // Sanity: the instant really is a different calendar day in the two zones,
    // so this test would fail on a payload built from local wall-clock parts.
    const inManila = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(start);
    const inLosAngeles = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(start);
    expect(inManila).not.toBe(inLosAngeles);

    // The human-readable body spells the time out in the appointment's own
    // zone, so a reader never has to do the arithmetic themselves.
    expect(sends[sends.length - 1]!.text).toContain("Asia/Manila");
  });

  // ── Updates: same UID, higher SEQUENCE ───────────────────────────────────

  it("a reschedule keeps the UID and increments the SEQUENCE, so calendars replace", async () => {
    const m = mark();
    const moved = new Date("2026-11-19T06:00:00.000Z");
    const patched = await organiser.call("PATCH", `/api/crm/appointments/${apptId}`, {
      startAt: moved.toISOString(),
      endAt: new Date(moved.getTime() + 3600_000).toISOString(),
    });
    expect(patched.status).toBe(200);

    const batch = since(m);
    expect(batch).toHaveLength(3); // everybody still coming hears about it

    for (const send of batch) {
      const ics = icsOf(send);
      expect(prop(ics, "UID")).toBe(uid);          // SAME event…
      expect(prop(ics, "SEQUENCE")).toBe("1");     // …newer revision
      expect(prop(ics, "METHOD")).toBe("REQUEST");
      expect(prop(ics, "DTSTART")).toBe(utcStamp(moved));
      expect(send.subject).toContain("Updated:");
    }
    expect(batch[0]!.text).toContain("the start time moved");

    expect((await appointmentRow(apptId))!.icalSequence).toBe(1);
    // Two attendees must never share one idempotency key — same key with a
    // different payload is what a provider answers with `invalid_idempotent_request`.
    expect(new Set(batch.map((s) => s.idempotencyKey)).size).toBe(3);
  }, 60_000);

  it("a note tweak sends NOTHING and does not move the SEQUENCE", async () => {
    const m = mark();
    const before = (await appointmentRow(apptId))!.icalSequence;

    const patched = await organiser.call("PATCH", `/api/crm/appointments/${apptId}`, {
      description: "Bring the revised quote. (typo fixed)",
      reminderMinutesBefore: 60,
    });
    expect(patched.status).toBe(200);

    // Proven by the seam not being called, not by a flag claiming it was not.
    expect(since(m)).toHaveLength(0);
    expect(patched.json["invitations"].status).toBe("none_to_send");
    expect(patched.json["invitationsSent"]).toBe(false);
    expect(String(patched.json["invitationNote"])).toMatch(/does not change anybody's calendar/i);

    // A SEQUENCE that moved without a message going out would silently make
    // the NEXT real update look stale to a client that never saw this one.
    expect((await appointmentRow(apptId))!.icalSequence).toBe(before);
  }, 60_000);

  it("marking a meeting as held tells nobody — it already happened", async () => {
    const m = mark();
    const held = await organiser.call("PATCH", `/api/crm/appointments/${apptId}`, { status: "completed" });
    expect(held.status).toBe(200);
    expect(since(m)).toHaveLength(0);

    // Put it back for the tests below.
    await organiser.call("PATCH", `/api/crm/appointments/${apptId}`, { status: "scheduled" });
  }, 60_000);

  it("a location change is material; the notes beside it are not", async () => {
    const m = mark();
    const patched = await organiser.call("PATCH", `/api/crm/appointments/${apptId}`, {
      location: "Room 2, the Manila office",
      description: "And a note nobody needs to be emailed about.",
    });
    expect(patched.status).toBe(200);
    const batch = since(m);
    expect(batch).toHaveLength(3);
    expect(icsOf(batch[0]!)).toContain("Room 2");

    // "Not material" governs whether a message is SENT, not what a message
    // that is going anyway may contain: the notes belong in an invitation an
    // attendee is receiving. What must not happen is the note being announced
    // as a reason they were interrupted.
    const changed = batch[0]!.text.split("What changed:")[1] ?? "";
    expect(changed).toContain("the location changed");
    expect(changed).not.toContain("nobody needs to be emailed");
    expect(batch[0]!.text).toContain("And a note nobody needs to be emailed about.");
  }, 60_000);

  // ── The guest list ───────────────────────────────────────────────────────

  it("adding one person mails only them; the people already coming are not spammed", async () => {
    const m = mark();
    const sequenceBefore = (await appointmentRow(apptId))!.icalSequence;

    const patched = await organiser.call("PATCH", `/api/crm/appointments/${apptId}`, {
      attendeeStaffIds: [staffIds[COLLEAGUE.email], staffIds[LATECOMER.email]],
    });
    expect(patched.status).toBe(200);

    const batch = since(m);
    expect(batch.map((s) => s.to)).toEqual([LATECOMER.email]);
    expect(prop(icsOf(batch[0]!), "METHOD")).toBe("REQUEST");
    // A revision still happened, so the number still moves — a later update
    // must never carry a sequence a client has already seen.
    expect((await appointmentRow(apptId))!.icalSequence).toBe(sequenceBefore + 1);
    // The newcomer's payload lists everybody, so their client shows the room.
    expect(allProps(icsOf(batch[0]!), "ATTENDEE")).toHaveLength(4);

    // The people already on it keep the invitation record they already had.
    const rows = await attendeeRows(apptId);
    const colleague = rows.find((r) => r.staffId === staffIds[COLLEAGUE.email])!;
    expect(colleague.invitationSequence).toBe(sequenceBefore);
  }, 60_000);

  it("removing somebody sends THEM a CANCEL so it leaves their calendar", async () => {
    const m = mark();
    const patched = await organiser.call("PATCH", `/api/crm/appointments/${apptId}`, {
      attendeeStaffIds: [staffIds[COLLEAGUE.email]], // the latecomer is dropped
    });
    expect(patched.status).toBe(200);

    const batch = since(m);
    expect(batch.map((s) => s.to)).toEqual([LATECOMER.email]);
    const ics = icsOf(batch[0]!);
    expect(prop(ics, "METHOD")).toBe("CANCEL");
    expect(prop(ics, "UID")).toBe(uid);
    expect(prop(ics, "STATUS")).toBe("CANCELLED");
    expect(batch[0]!.subject).toContain("Cancelled:");
    expect(batch[0]!.attachments![0]!.contentType).toContain("method=CANCEL");

    // And they are actually off the appointment.
    const rows = await attendeeRows(apptId);
    expect(rows.some((r) => r.staffId === staffIds[LATECOMER.email])).toBe(false);
  }, 60_000);

  // ── Cancelling the meeting itself ────────────────────────────────────────

  it("cancelling emits METHOD:CANCEL to everyone with a bumped SEQUENCE", async () => {
    const m = mark();
    const sequenceBefore = (await appointmentRow(apptId))!.icalSequence;

    const cancelled = await organiser.call("DELETE", `/api/crm/appointments/${apptId}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.json["appointment"].status).toBe("cancelled");

    const batch = since(m);
    expect(batch).toHaveLength(3);
    const sequenceAfter = (await appointmentRow(apptId))!.icalSequence;
    expect(sequenceAfter).toBe(sequenceBefore + 1);

    for (const send of batch) {
      const ics = icsOf(send);
      expect(prop(ics, "METHOD")).toBe("CANCEL");
      expect(prop(ics, "UID")).toBe(uid);
      expect(prop(ics, "STATUS")).toBe("CANCELLED");
      // A CANCEL a client ignores is a meeting that never goes away, and it is
      // ignored when its sequence is not ahead of the one already held.
      expect(Number(prop(ics, "SEQUENCE"))).toBe(sequenceAfter);
    }

    const rows = await attendeeRows(apptId);
    expect(rows.every((r) => r.invitationMethod === "CANCEL")).toBe(true);
  }, 60_000);

  it("cancelling something already cancelled does not send a second CANCEL", async () => {
    const m = mark();
    const again = await organiser.call("DELETE", `/api/crm/appointments/${apptId}`);
    expect(again.status).toBe(200);
    expect(since(m)).toHaveLength(0);
    expect(again.json["invitations"].status).toBe("none_to_send");
  }, 60_000);

  // ── The reminder engine is a different message ───────────────────────────

  it("a fired reminder does not send an invitation, and an update does not fire a reminder", async () => {
    mode = "not_configured";
    const start = new Date(Date.now() + 10 * 60_000);
    const created = await organiser.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] imminent review",
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 1800_000).toISOString(),
      reminderMinutesBefore: 30, // already inside the window → due now
      attendeeStaffIds: [staffIds[COLLEAGUE.email]],
    });
    expect(created.status).toBe(201);
    const id = created.json["appointment"].id;
    appointmentIds.push(id);
    expect(created.json["invitations"].attempted).toBe(2);

    // Running the queue must not produce another invitation. The reminder is
    // its own message on its own clock; with mail blocked it records nothing
    // at all, which is the behaviour `maybeEmail` documents.
    const m = mark();
    const { processDueJobs } = await import("../lib/crmScheduler.js");
    const result = await processDueJobs();
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(since(m)).toHaveLength(0);

    // The reminder DID fire — it reached people in the app.
    const notifications = await db.select().from(schema.crmNotifications)
      .where(eq(schema.crmNotifications.entityId, id));
    expect(notifications.some((n) => n.kind === "appointment_reminder")).toBe(true);

    // And one material edit produces exactly ONE message per attendee, not two.
    const m2 = mark();
    const moved = new Date(Date.now() + 5 * 3600_000);
    await organiser.call("PATCH", `/api/crm/appointments/${id}`, {
      startAt: moved.toISOString(), endAt: new Date(moved.getTime() + 1800_000).toISOString(),
    });
    const batch = since(m2);
    expect(batch).toHaveLength(2);
    expect(new Set(batch.map((s) => s.to)).size).toBe(2);
  }, 120_000);

  // ── When a provider really does take it ──────────────────────────────────

  it("reports invitationsSent true ONLY when the provider accepted every message", async () => {
    mode = "accept";
    const start = new Date(Date.now() + 4 * 864e5);
    const created = await organiser.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] a meeting that can actually be sent",
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3600_000).toISOString(),
      externalAttendees: [{ email: CLIENT_EMAIL }],
    });
    expect(created.status).toBe(201);
    const id = created.json["appointment"].id;
    appointmentIds.push(id);

    expect(created.json["invitationsSent"]).toBe(true);
    expect(created.json["invitations"].status).toBe("sent");
    expect(created.json["invitations"].accepted).toBe(created.json["invitations"].attempted);
    const rows = await attendeeRows(id);
    expect(rows.every((r) => r.invitationOutcome === "sent")).toBe(true);
    expect(rows.every((r) => r.invitationProviderId)).toBeTruthy();

    // A refusal is reported in the provider's own class, and is NOT success.
    mode = "refused";
    const resent = await organiser.call("POST", `/api/crm/appointments/${id}/invitations`, {});
    expect(resent.status).toBe(200);
    expect(resent.json["invitationsSent"]).toBe(false);
    expect(resent.json["invitations"].status).toBe("rejected");
    expect(String(resent.json["invitationNote"])).toMatch(/refused/i);
    const afterRefusal = await attendeeRows(id);
    expect(afterRefusal.every((r) => r.invitationOutcome === "rejected")).toBe(true);

    mode = "not_configured";
  }, 60_000);

  it("a deliberate re-send is not collapsed into the original by the provider", async () => {
    mode = "accept";
    const start = new Date(Date.now() + 5 * 864e5);
    const created = await organiser.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] resend identity",
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3600_000).toISOString(),
      externalAttendees: [{ email: CLIENT_EMAIL }],
    });
    const id = created.json["appointment"].id;
    appointmentIds.push(id);
    const firstKey = sends[sends.length - 1]!.idempotencyKey;

    const m = mark();
    await organiser.call("POST", `/api/crm/appointments/${id}/invitations`, {});
    const resendKeys = since(m).map((s) => s.idempotencyKey);
    // Asking for a second copy must produce a DIFFERENT key, or the provider
    // collapses it into the first and the person is never told twice on purpose.
    expect(resendKeys).not.toContain(firstKey);
    expect(resendKeys.every((k) => k && k.includes("resend-"))).toBe(true);

    mode = "not_configured";
  }, 60_000);

  // ── Permissions ──────────────────────────────────────────────────────────

  it("refuses a user without tasks.write, and sends nothing on the way out", async () => {
    const m = mark();
    const start = new Date(Date.now() + 6 * 864e5);

    const create = await restricted.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] should never exist",
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3600_000).toISOString(),
      externalAttendees: [{ email: CLIENT_EMAIL }],
    });
    expect(create.status).toBe(403);

    const patch = await restricted.call("PATCH", `/api/crm/appointments/${apptId}`, {
      startAt: start.toISOString(),
    });
    expect(patch.status).toBe(403);

    const invite = await restricted.call("POST", `/api/crm/appointments/${apptId}/invitations`, {});
    expect(invite.status).toBe(403);

    const remove = await restricted.call("DELETE", `/api/crm/appointments/${apptId}`);
    expect(remove.status).toBe(403);

    // A 403 that still emailed somebody would be worse than no check at all.
    expect(since(m)).toHaveLength(0);
    // ...and nothing was written either.
    const rows = await db.select().from(schema.crmAppointments)
      .where(eq(schema.crmAppointments.title, "[CRM-TEST] should never exist"));
    expect(rows).toHaveLength(0);

    // Reading the calendar is still allowed — refusing the write is the point.
    expect((await restricted.call("GET", "/api/crm/appointments")).status).toBe(200);
  }, 60_000);

  // ── The download stays a download ────────────────────────────────────────

  it("the .ics export shares the generator but carries no METHOD", async () => {
    const res = await organiser.raw(`/api/crm/appointments/${apptId}/ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();

    // Same event, same identity, same revision as the messages above.
    expect(prop(body, "UID")).toBe(uid);
    expect(prop(body, "SEQUENCE")).toBe(String((await appointmentRow(apptId))!.icalSequence));
    expect(body).toContain("SUMMARY:[CRM-TEST] Kickoff with the client");
    // But it does NOT instruct a calendar to do anything on the organiser's
    // authority — it is a file somebody chose to import.
    expect(prop(body, "METHOD")).toBeUndefined();
  }, 30_000);

  it("refuses to invite an appointment that has nobody on it", async () => {
    mode = "not_configured";
    const start = new Date(Date.now() + 7 * 864e5);
    const created = await organiser.call("POST", "/api/crm/appointments", {
      title: "[CRM-TEST] nobody at all",
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3600_000).toISOString(),
    });
    expect(created.status).toBe(201);
    const id = created.json["appointment"].id;
    appointmentIds.push(id);
    // The organiser attends their own meeting, so a fresh booking is never
    // empty — emptying it is the condition this guard is for (an appointment
    // imported or edited down to nobody).
    await db.delete(schema.crmAppointmentAttendees)
      .where(eq(schema.crmAppointmentAttendees.appointmentId, id));

    const m = mark();
    const invite = await organiser.call("POST", `/api/crm/appointments/${id}/invitations`, {});
    expect(invite.status).toBe(400);
    expect(String(invite.json["error"])).toMatch(/no attendees/i);
    expect(since(m)).toHaveLength(0);
  }, 60_000);
});

// ── Pure rules, no database required ────────────────────────────────────────
//
// These run everywhere, including a checkout with no test database, because
// the material/not-material rule is the one thing in this feature that decides
// whether a person is interrupted.

describe("what counts as a material change", () => {
  const base = {
    startAt: new Date("2026-11-18T01:30:00.000Z"),
    endAt: new Date("2026-11-18T02:30:00.000Z"),
    allDay: false,
    title: "Kickoff",
    location: "Room 1",
    meetingUrl: null as string | null,
    organizerStaffId: 7 as number | null,
    status: "scheduled",
  };

  it("treats time, place, join link, title, organiser and cancellation as material", async () => {
    const { materialChange } = await import("../lib/crmAppointmentInvites.js");
    const cases: [string, Partial<typeof base>][] = [
      ["start", { startAt: new Date("2026-11-18T03:00:00.000Z") }],
      ["end", { endAt: new Date("2026-11-18T04:00:00.000Z") }],
      ["all-day", { allDay: true }],
      ["title", { title: "Kickoff (revised)" }],
      ["location", { location: "Room 2" }],
      ["join link", { meetingUrl: "https://meet.example.test/x" }],
      ["organiser", { organizerStaffId: 9 }],
      ["cancellation", { status: "cancelled" }],
    ];
    for (const [label, change] of cases) {
      const verdict = materialChange(base, { ...base, ...change });
      expect(verdict.material, `${label} should be material`).toBe(true);
      expect(verdict.reasons.length).toBeGreaterThan(0);
    }
  });

  it("does not interrupt anybody for a note, a reminder setting or a re-save", async () => {
    const { materialChange } = await import("../lib/crmAppointmentInvites.js");
    // An identical revision — the shape a save produces when only fields this
    // rule deliberately ignores (description, reminder lead, lead/project
    // links, the timezone LABEL) were touched.
    expect(materialChange(base, { ...base }).material).toBe(false);
    // Re-cancelling something already cancelled is not a new event either.
    const cancelled = { ...base, status: "cancelled" };
    expect(materialChange(cancelled, cancelled).material).toBe(false);
    // Marking a past meeting as held changes nothing an attendee must act on.
    expect(materialChange(base, { ...base, status: "completed" }).material).toBe(false);
  });

  it("separates a guest-list-only change, so the room is not mailed for it", async () => {
    const { materialChange } = await import("../lib/crmAppointmentInvites.js");
    const listOnly = materialChange(base, { ...base }, { added: ["12"], removed: [] });
    expect(listOnly.material).toBe(true);
    expect(listOnly.attendeesOnly).toBe(true);

    // Once anything else moves, everybody needs telling.
    const alsoMoved = materialChange(
      base, { ...base, startAt: new Date("2026-11-18T05:00:00.000Z") },
      { added: ["12"], removed: [] },
    );
    expect(alsoMoved.material).toBe(true);
    expect(alsoMoved.attendeesOnly).toBe(false);
  });
});

describe("the iCalendar payload", () => {
  const appointment = {
    id: 4242,
    title: "Quarterly review, with Acme; part 2",
    description: "Line one\nLine two",
    startAt: new Date("2026-11-18T01:30:00.000Z"),
    endAt: new Date("2026-11-18T02:30:00.000Z"),
    allDay: false,
    timezone: "Asia/Manila",
    location: "Room 1, Level 2",
    meetingUrl: null,
    status: "scheduled",
  };

  it("escapes, folds, and keeps the instant absolute", async () => {
    const { buildAppointmentIcs, appointmentUid } = await import("../lib/crmAppointmentInvites.js");
    const ics = buildAppointmentIcs({
      appointment, method: "REQUEST", sequence: 3,
      organizer: { email: "noreply@sitemintdigital.com", name: "Shasta" },
      attendees: [{ email: "someone@example.test", name: "Someone" }],
      now: new Date("2026-11-01T00:00:00.000Z"),
    });

    expect(ics).toContain(`UID:${appointmentUid(4242)}`);
    expect(ics).toContain("DTSTART:20261118T013000Z");
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("METHOD:REQUEST");
    // RFC 5545 §3.3.11: commas, semicolons and newlines are escaped.
    const unfolded = ics.replace(/\r\n[ \t]/g, "");
    expect(unfolded).toContain("SUMMARY:Quarterly review\\, with Acme\\; part 2");
    expect(unfolded).toContain("Line one\\nLine two");
    // Every physical line fits, or a strict parser rejects the whole calendar.
    for (const line of ics.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length, line).toBeLessThanOrEqual(76);
    }
  });

  it("writes an all-day event as a DATE, with an exclusive end", async () => {
    const { buildAppointmentIcs } = await import("../lib/crmAppointmentInvites.js");
    const ics = buildAppointmentIcs({
      appointment: { ...appointment, allDay: true },
      method: "REQUEST", sequence: 0,
      organizer: { email: "noreply@sitemintdigital.com" },
    });
    // 01:30 UTC is already 09:30 on the 18th in Manila, where it was booked.
    expect(ics).toContain("DTSTART;VALUE=DATE:20261118");
    expect(ics).toContain("DTEND;VALUE=DATE:20261119");
  });

  it("never splits a multi-byte character across a fold", async () => {
    const { foldIcsLine } = await import("../lib/crmAppointmentInvites.js");
    const folded = foldIcsLine(`SUMMARY:${"é".repeat(60)}`);
    for (const line of folded.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(76);
    }
    // Round-trips: unfolding restores the original text exactly.
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });
});
