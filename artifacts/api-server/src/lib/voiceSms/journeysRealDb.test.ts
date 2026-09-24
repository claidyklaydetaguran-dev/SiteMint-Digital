// J3/J4 against a real database: the properties that only a database can
// prove — two overlapping bookings racing, the approval conflict count, text
// storage idempotency and tenant isolation, the new outbox kind, and STOP
// winning over an appointment update.
//
// Gated on CRM_TEST_DATABASE_URL. Needs voice migration 0015 (voice_sms_inbound,
// the appointment_update kind, the 'text' contact origin). Every row created
// here belongs to two [TEST] firms and is removed with them in afterAll.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";

const suite = TEST_DB ? describe : describe.skip;
const STAMP = Date.now();

suite("journeys 3 and 4 on a real database", () => {
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let voice: typeof import("@workspace/db/schema/voice");
  let repo: typeof import("../scheduling/schedulingRepository.js");
  let texts: typeof import("./textThread.js");
  let outbox: typeof import("./outboxService.js");
  let firmA = 0;
  let firmB = 0;
  let typeId = "";

  beforeAll(async () => {
    const { assertDisposableDatabase } = await import("../disposableDatabase.js");
    await assertDisposableDatabase("journeys real-db setup");
    schema = await import("@workspace/db");
    db = schema.db;
    voice = await import("@workspace/db/schema/voice");
    repo = await import("../scheduling/schedulingRepository.js");
    texts = await import("./textThread.js");
    outbox = await import("./outboxService.js");
    try {
      await db.select().from(voice.voiceSmsInbound).limit(1);
    } catch {
      throw new Error("voice_sms_inbound is missing: apply voice migration 0015 to CRM_TEST_DATABASE_URL and re-run.");
    }
    const firmRow = (suffix: string) => ({
      name: `[TEST] Journeys ${suffix} ${STAMP}`,
      practiceAreas: [] as string[],
      statesServed: [] as string[],
      statuteOfLimitationsDays: 0,
      notifyEmail: `journeys-${suffix}-${STAMP}@example.test`,
      twilioNumber: `+1555010${suffix === "A" ? "1" : "2"}${String(STAMP).slice(-4)}`,
      email: `journeys-${suffix}-${STAMP}@example.test`,
    });
    const [a] = await db.insert(schema.intakeFirms).values(firmRow("A")).returning({ id: schema.intakeFirms.id });
    const [b] = await db.insert(schema.intakeFirms).values(firmRow("B")).returning({ id: schema.intakeFirms.id });
    firmA = a!.id;
    firmB = b!.id;
    const open = { start: "09:00", end: "17:00" };
    await repo.saveAvailabilitySettings(firmA, {
      timezone: "America/Los_Angeles",
      weeklyHours: { 0: null, 1: open, 2: open, 3: open, 4: open, 5: open, 6: null },
      appointmentTypes: [{ name: "[TEST] Hour consult", durationMin: 60, active: true }],
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      minNoticeHours: 0,
      maxAdvanceDays: 365,
      blockedDates: [],
    });
    typeId = (await repo.buildAvailabilityConfig(firmA)).appointmentTypes[0]!.id;
  });

  afterAll(async () => {
    const { assertDisposableDatabase } = await import("../disposableDatabase.js");
    await assertDisposableDatabase("journeys real-db cleanup");
    const { inArray } = await import("drizzle-orm");
    const scheduling = await import("@workspace/db/schema/scheduling");
    const ids = [firmA, firmB].filter(Boolean);
    if (ids.length === 0) return;
    // Scheduling rows reference the firm without a cascade in every table; clear them first.
    await db.delete(scheduling.schedulingAppointmentRequests).where(inArray(scheduling.schedulingAppointmentRequests.firmId, ids));
    await db.delete(schema.intakeFirms).where(inArray(schema.intakeFirms.id, ids));
  });

  const contact = { name: "[TEST] Racer", phone: "+15550199001", email: null };
  const consent = { phoneConsent: true, smsConsent: false, emailConsent: false };
  // Wednesday 4 November 2026, 10:00 and 10:30 Pacific (UTC-8).
  const TEN = new Date("2026-11-04T18:00:00.000Z");
  const TEN_THIRTY = new Date("2026-11-04T18:30:00.000Z");
  const NOW = new Date("2026-10-01T12:00:00.000Z");

  it("two overlapping requests with different starts, submitted together: exactly one is accepted", async () => {
    const [x, y] = await Promise.all([
      repo.submitAppointmentRequest(firmA, typeId, TEN, contact, consent, "manual", NOW),
      repo.submitAppointmentRequest(firmA, typeId, TEN_THIRTY, contact, consent, "manual", NOW),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect([x, y].find((r) => !r.ok)).toMatchObject({ ok: false, reason: "slot_no_longer_available" });
  });

  it("the approval conflict count sees another live request and never counts the request itself", async () => {
    const rows = await repo.listAppointmentRequests(firmA);
    const live = rows.find((r) => r.status === "pending_review")!;
    expect(await repo.countConflictsForRequest(firmA, live, NOW)).toBe(0);
    // A blocked period added over it afterwards is a conflict at approval time.
    const scheduling = await import("@workspace/db/schema/scheduling");
    await db.insert(scheduling.schedulingBlockedPeriods).values({
      firmId: firmA,
      startsAt: live.requestedStartAt,
      endsAt: live.requestedEndAt,
      internalLabel: "[TEST] blocked after request",
    } as never);
    expect(await repo.countConflictsForRequest(firmA, live, NOW)).toBe(1);
  });

  it("finds a request by its public id, firm-scoped", async () => {
    const [row] = await repo.listAppointmentRequests(firmA);
    expect((await repo.findAppointmentRequestByPublicId(firmA, row!.publicId))?.id).toBe(row!.id);
    expect(await repo.findAppointmentRequestByPublicId(firmB, row!.publicId)).toBeUndefined();
  });

  it("stores an inbound text once per provider message, creating a 'text' contact", async () => {
    const sid = `SMtest${STAMP}a`;
    await texts.ensureTextContact(firmA, "+15550199002");
    const first = await texts.storeInboundText({ firmId: firmA, fromE164: "+15550199002", toE164: "+16093072692", body: "Can I come at 11 instead?", providerMessageSid: sid, keyword: "other" });
    const again = await texts.storeInboundText({ firmId: firmA, fromE164: "+15550199002", toE164: "+16093072692", body: "Can I come at 11 instead?", providerMessageSid: sid, keyword: "other" });
    expect([first.inserted, again.inserted]).toEqual([true, false]);
    const { and, eq } = await import("drizzle-orm");
    const [c] = await db.select().from(voice.voiceContacts).where(and(eq(voice.voiceContacts.firmId, firmA), eq(voice.voiceContacts.phoneE164, "+15550199002")));
    expect(c!.origin).toBe("text");
  });

  it("a thread is firm-scoped: the same caller texting another business is invisible here", async () => {
    await texts.storeInboundText({ firmId: firmB, fromE164: "+15550199002", toE164: "+18604839097", body: "Other business", providerMessageSid: `SMtest${STAMP}b`, keyword: "other" });
    const threadA = await texts.listTextThread(firmA, "+15550199002");
    expect(threadA.map((m) => m.body)).toEqual(["Can I come at 11 instead?"]);
    expect(threadA[0]).toMatchObject({ direction: "in", unread: true });
    expect(await texts.markTextThreadRead(firmA, "+15550199002")).toBe(1);
    expect((await texts.listTextThread(firmA, "+15550199002"))[0]!.unread).toBe(false);
    // Marking A's thread read changed nothing for B.
    expect((await texts.listTextThread(firmB, "+15550199002"))[0]!.unread).toBe(true);
  });

  it("an appointment update is queued with the new kind, and a STOP always wins over it", async () => {
    const queued = await outbox.enqueueAppointmentUpdate({
      firmId: firmA, rawPhone: "+15550199003", requestConsented: true, dedupeKey: `appointment_update:test-${STAMP}:booked`, body: "[TEST] SiteMint Digital: Your appointment is confirmed. Reply STOP to opt out.",
    });
    expect(queued.enqueued).toBe(true);
    expect(await outbox.getConsent(firmA, "+15550199003")).toBe("granted");

    await outbox.recordConsent(firmA, "+15550199004", "stopped", "sms_stop");
    const stopped = await outbox.enqueueAppointmentUpdate({
      firmId: firmA, rawPhone: "+15550199004", requestConsented: true, dedupeKey: `appointment_update:test-${STAMP}:cancelled`, body: "[TEST] cancelled",
    });
    expect(stopped).toMatchObject({ enqueued: false, skipped: "stopped" });
    expect(await outbox.getConsent(firmA, "+15550199004")).toBe("stopped");

    const thread = await texts.listTextThread(firmA, "+15550199003");
    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({ direction: "out", status: "queued" });
  });

  it("the database refuses a text kind or contact origin the migration did not add", async () => {
    await expect(
      db.insert(voice.voiceSmsOutbox).values({ firmId: firmA, toE164: "+15550199005", kind: "marketing", body: "x", dedupeKey: `bad-${STAMP}` }),
    ).rejects.toThrow();
    await expect(db.insert(voice.voiceContacts).values({ firmId: firmA, phoneE164: "+15550199006", origin: "import" })).rejects.toThrow();
  });
});
