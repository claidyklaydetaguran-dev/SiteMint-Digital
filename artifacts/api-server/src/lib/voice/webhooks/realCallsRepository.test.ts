// A real call saves information, against a real database.
//
// "A real call saves what happened" is a condition of publishing, and until now
// nothing exercised it: all seven exports of realCallsRepository.ts appeared in
// zero test files, as did every one of its five importers. The pure logic it
// delegates to IS covered — callStateModel.test.ts pins the fold, eventKey.test.ts
// pins the dedupe key — so this suite deliberately asserts only what those cannot:
// that a webhook's facts survive the round trip through PostgreSQL, that a
// redelivery collapses, and that one business can never read another's calls.
//
// What it therefore does NOT test: event ordering. The fold orders on
// created_at, which is DEFAULT now() — controlling it would mean bypassing
// storeVapiWebhookEvent, i.e. not testing the write path at all. Ordering is
// callStateModel.test.ts's job and it does it without a database.
//
// Gated on CRM_TEST_DATABASE_URL. Every row created here is removed in afterAll.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ParsedVapiMessage } from "./vapiServerMessage.js";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";

const suite = TEST_DB ? describe : describe.skip;
const STAMP = Date.now();

suite("a real call saves information (real DB)", () => {
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let voice: typeof import("@workspace/db/schema/voice");
  let repo: typeof import("./realCallsRepository.js");
  let firmA = 0;
  let firmB = 0;
  let assistantA = 0;
  const providerAssistantA = `asst-a-${STAMP}`;
  const providerAssistantB = `asst-b-${STAMP}`;

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    voice = await import("@workspace/db/schema/voice");
    repo = await import("./realCallsRepository.js");

    // provider_webhook_events and voice_assistants come from voice migration
    // 0000. Two different faults land here and they have different fixes: the
    // table is absent (a push-built database — drizzle-kit push does not apply
    // versioned migrations), or the table is present but lacks a column a later
    // migration added, since drizzle selects every column the schema declares.
    //
    // Probing `id` — present since 0000 — before the full select is what tells
    // those apart. The first version of this guard caught both, and everything
    // else, and reported "missing" for all of them while discarding the real
    // error unbound, so it confidently named the wrong cause on a database whose
    // tables were in fact present. A true observation with an assumed cause
    // attached to it is worse than no guard: it sends the reader somewhere else.
    //
    // It still throws rather than skipping, deliberately: a skip would also
    // swallow a genuinely missing table, and a suite that ran nothing is not a
    // pass.
    const requireTable = async (
      name: string,
      probeId: () => Promise<unknown>,
      probeAllColumns: () => Promise<unknown>,
    ) => {
      try {
        await probeId();
      } catch (error) {
        throw new Error(
          `${name} could not be read from CRM_TEST_DATABASE_URL at all, so it is most likely absent. It comes from voice migration 0000, which drizzle-kit push does not apply — a push-built database will not have it. Rebuild with migrate:fresh, or apply the voice migrations, and re-run. The database's own error was: ${String(error)}`,
        );
      }
      try {
        await probeAllColumns();
      } catch (error) {
        throw new Error(
          `${name} EXISTS in CRM_TEST_DATABASE_URL but is missing at least one column this code declares — that database is behind the schema, not lacking the table. Apply the outstanding voice migrations to it, or rebuild it with migrate:fresh, and re-run. The database's own error was: ${String(error)}`,
        );
      }
    };

    await requireTable(
      "provider_webhook_events",
      () => db.select({ id: voice.providerWebhookEvents.id }).from(voice.providerWebhookEvents).limit(1),
      () => db.select().from(voice.providerWebhookEvents).limit(1),
    );
    await requireTable(
      "voice_assistants",
      () => db.select({ id: voice.voiceAssistants.id }).from(voice.voiceAssistants).limit(1),
      () => db.select().from(voice.voiceAssistants).limit(1),
    );

    // intake_firms still carries the original law-firm columns as NOT NULL, so
    // a test row has to fill them even though the receptionist never reads them.
    const firmRow = (suffix: string) => ({
      name: `[TEST] Calls ${suffix} ${STAMP}`,
      practiceAreas: [] as string[],
      statesServed: [] as string[],
      statuteOfLimitationsDays: 0,
      notifyEmail: `calls-${suffix}-${STAMP}@example.test`,
      twilioNumber: `+1555100${suffix === "A" ? "1" : "2"}${String(STAMP).slice(-4)}`,
      email: `calls-${suffix}-${STAMP}@example.test`,
    });
    const [rowA] = await db.insert(schema.intakeFirms).values(firmRow("A")).returning({ id: schema.intakeFirms.id });
    const [rowB] = await db.insert(schema.intakeFirms).values(firmRow("B")).returning({ id: schema.intakeFirms.id });
    firmA = rowA!.id;
    firmB = rowB!.id;

    // ck_voice_assistants_publish_invariants: a row may only carry a provider
    // and a provider assistant id at status 'published', with the publish-attempt
    // columns and sync_error all null. Anything else is rejected by the database.
    const assistantRow = (firmId: number, providerAssistantId: string) => ({
      firmId,
      name: `[TEST] Assistant ${providerAssistantId}`,
      templateKey: "receptionist",
      status: "published" as const,
      provider: "vapi",
      providerAssistantId,
    });
    const [asstA] = await db
      .insert(voice.voiceAssistants)
      .values(assistantRow(firmA, providerAssistantA))
      .returning({ id: voice.voiceAssistants.id });
    await db.insert(voice.voiceAssistants).values(assistantRow(firmB, providerAssistantB));
    assistantA = asstA!.id;
  });

  afterAll(async () => {
    const ids = [firmA, firmB].filter(Boolean);
    if (ids.length) {
      const { inArray } = await import("drizzle-orm");
      // Assistants and webhook events cascade with the firm.
      await db.delete(schema.intakeFirms).where(inArray(schema.intakeFirms.id, ids));
    }
  });

  const statusUpdate = (callId: string, extra: Partial<ParsedVapiMessage["call"]> = {}): ParsedVapiMessage => ({
    type: "status-update",
    status: "in-progress",
    call: { id: callId, assistantId: providerAssistantA, ...extra },
  });

  const endOfCall = (callId: string, extra: Partial<ParsedVapiMessage> = {}): ParsedVapiMessage => ({
    type: "end-of-call-report",
    call: { id: callId, assistantId: providerAssistantA, callType: "inboundPhoneCall", customerNumber: "+15551234321" },
    endedReason: "customer-ended-call",
    transcript: "Caller asked about opening hours.",
    summary: "Asked opening hours; told 9 to 5.",
    durationSeconds: 42,
    ...extra,
  });

  it("resolves the owning business from the provider's assistant id alone", async () => {
    const owner = await repo.findVapiAssistantOwner(providerAssistantA);
    expect(owner?.firmId).toBe(firmA);
    expect(owner?.assistantRowId).toBe(assistantA);
    expect(await repo.findFirmIdForVapiAssistant(providerAssistantA)).toBe(firmA);

    // An assistant this application does not know resolves to nothing. The
    // caller must never fall back to a firm id from the payload, so the only
    // safe answer here is undefined — not a default, not the first firm.
    expect(await repo.findVapiAssistantOwner(`unknown-${STAMP}`)).toBeUndefined();
    expect(await repo.findFirmIdForVapiAssistant(`unknown-${STAMP}`)).toBeUndefined();
  });

  it("stores a real call's facts and reads them back", async () => {
    const callId = `vapi-${STAMP}-kept`;
    expect((await repo.storeVapiWebhookEvent(firmA, statusUpdate(callId))).inserted).toBe(true);
    expect((await repo.storeVapiWebhookEvent(firmA, endOfCall(callId))).inserted).toBe(true);

    const record = await repo.getRealCallForFirm(firmA, callId);
    expect(record).toBeDefined();
    expect(record!.state).toBe("completed");
    expect(record!.isFinal).toBe(true);
    expect(record!.hasEndOfCallReport).toBe(true);
    expect(record!.endedReason).toBe("customer-ended-call");
    expect(record!.transcript).toBe("Caller asked about opening hours.");
    expect(record!.summary).toBe("Asked opening hours; told 9 to 5.");
    expect(record!.providerDurationSec).toBe(42);
    expect(record!.source).toBe("vapi_twilio");
    expect(record!.synthetic).toBe(false);

    // The caller's number is stored but never read back in full.
    expect(record!.callerNumberKnown).toBe(true);
    expect(record!.callerNumberDisplay).toBe("•••• 4321");
    expect(record!.callerNumberDisplay).not.toContain("5551234");

    expect((await repo.listRealCallsForFirm(firmA)).some((c) => c.callId === callId)).toBe(true);
  });

  it("collapses a redelivery of the identical event instead of duplicating the call", async () => {
    const callId = `vapi-${STAMP}-retry`;
    const message = endOfCall(callId);

    expect((await repo.storeVapiWebhookEvent(firmA, message)).inserted).toBe(true);
    // Vapi redelivers on transport failure. The second delivery must be a
    // no-op: not a second row, and not a thrown unique-violation either.
    expect((await repo.storeVapiWebhookEvent(firmA, message)).inserted).toBe(false);
    expect((await repo.storeVapiWebhookEvent(firmA, message)).inserted).toBe(false);

    const matching = (await repo.listRealCallsForFirm(firmA)).filter((c) => c.callId === callId);
    expect(matching).toHaveLength(1);
    expect(matching[0]!.transcript).toBe("Caller asked about opening hours.");
  });

  it("keeps an unknown caller and an unknown channel honest through storage", async () => {
    // A telephone caller who withholds their number arrives on a phone number
    // with no customerNumber. That must not read as a browser test, and the
    // display must not invent a number. Asserted after a jsonb round trip
    // because a dropped field here would silently reclassify a real call.
    const withheld = `vapi-${STAMP}-withheld`;
    await repo.storeVapiWebhookEvent(firmA, statusUpdate(withheld, { phoneNumberId: `pn-${STAMP}` }));
    const withheldRecord = await repo.getRealCallForFirm(firmA, withheld);
    expect(withheldRecord!.reachedViaNumber).toBe(true);
    expect(withheldRecord!.channel).toBe("telephone");
    expect(withheldRecord!.callerNumberKnown).toBe(false);
    expect(withheldRecord!.callerNumberDisplay).toBe("Unknown");

    // With no evidence at all the answer is "unknown" — never "browser".
    const bare = `vapi-${STAMP}-bare`;
    await repo.storeVapiWebhookEvent(firmA, statusUpdate(bare));
    const bareRecord = await repo.getRealCallForFirm(firmA, bare);
    expect(bareRecord!.channel).toBe("unknown");
    expect(bareRecord!.reachedViaNumber).toBe(false);

    // A call still in progress has no invented duration.
    expect(bareRecord!.isFinal).toBe(false);
    expect(bareRecord!.providerDurationSec).toBeUndefined();
  });

  it("never shows one business another's calls", async () => {
    const callId = `vapi-${STAMP}-private`;
    await repo.storeVapiWebhookEvent(firmA, endOfCall(callId));

    // Firm B asks for firm A's call by its exact id and gets the same answer
    // as for a call that does not exist.
    expect(await repo.getRealCallForFirm(firmB, callId)).toBeUndefined();
    expect(await repo.getRealCallForFirm(firmB, `vapi-${STAMP}-never-existed`)).toBeUndefined();
    expect((await repo.listRealCallsForFirm(firmB)).some((c) => c.callId === callId)).toBe(false);

    // ...and firm A still has it.
    expect(await repo.getRealCallForFirm(firmA, callId)).toBeDefined();
  });

  it("replays stored tool results rather than running a mutating tool twice", async () => {
    const callId = `vapi-${STAMP}-tools`;
    const message: ParsedVapiMessage = {
      type: "tool-calls",
      call: { id: callId, assistantId: providerAssistantA },
      toolCallList: [{ id: `tc-${STAMP}`, name: "bookAppointment", arguments: {} }],
    };
    const { buildVapiEventKey } = await import("./eventKey.js");
    const eventKey = buildVapiEventKey(message);

    await repo.storeVapiWebhookEvent(firmA, message);
    expect(await repo.readStoredToolCallResults(eventKey)).toBeUndefined();

    const results = [{ toolCallId: `tc-${STAMP}`, result: "Booked for Tuesday at 10." }];
    await repo.storeToolCallResults(firmA, eventKey, results);

    // A redelivery of the same batch is answered from storage, so the booking
    // is never made a second time.
    expect(await repo.readStoredToolCallResults(eventKey)).toEqual({ results });

    // Writing results is firm-scoped: another business cannot overwrite them.
    await repo.storeToolCallResults(firmB, eventKey, [{ toolCallId: `tc-${STAMP}`, result: "overwritten" }]);
    expect(await repo.readStoredToolCallResults(eventKey)).toEqual({ results });

    // The stored event itself survives having results merged onto it.
    const record = await repo.getRealCallForFirm(firmA, callId);
    expect(record?.callId).toBe(callId);
  });

  it("scopes the ledger's uniqueness to the provider, not to the business", async () => {
    // Recorded, not endorsed. uq_provider_webhook_events_provider_event_key is
    // ("provider","event_key") with no firm column, and event keys derive from
    // the provider's call id — so two businesses can only collide here if they
    // are handed the same call id, which Vapi's UUIDs do not do. This pins the
    // current shape so that firm-scoping the index later is a deliberate change
    // rather than an accident, and documents why it is presently harmless.
    const shared = `vapi-${STAMP}-shared-id`;
    expect((await repo.storeVapiWebhookEvent(firmA, statusUpdate(shared))).inserted).toBe(true);
    expect((await repo.storeVapiWebhookEvent(firmB, statusUpdate(shared))).inserted).toBe(false);

    expect(await repo.getRealCallForFirm(firmA, shared)).toBeDefined();
    expect(await repo.getRealCallForFirm(firmB, shared)).toBeUndefined();
  });
});
