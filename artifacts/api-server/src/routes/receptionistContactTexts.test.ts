// J4 over HTTP, against a real database: a business reads the text thread of
// its own contact, marks it read, and gets 404 for another business's contact.
//
// Gated on CRM_TEST_DATABASE_URL. The [TEST] firms are removed in afterAll.

import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
const suite = TEST_DB ? describe : describe.skip;
const STAMP = Date.now();

vi.mock("../lib/receptionistAuth.js", () => ({
  requireReceptionistAuth: (req: Request, res: Response, next: NextFunction) => {
    const firm = Number(req.headers["x-test-firm"]);
    if (!Number.isInteger(firm) || firm <= 0) {
      res.sendStatus(401);
      return;
    }
    req.firmId = firm;
    next();
  },
}));

suite("contact text thread over HTTP (real DB)", () => {
  let server: http.Server;
  let base = "";
  let firmA = 0;
  let firmB = 0;
  let contactA = 0;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  beforeAll(async () => {
    const { assertDisposableDatabase } = await import("../lib/disposableDatabase.js");
    await assertDisposableDatabase("contact texts setup");
    schema = await import("@workspace/db");
    db = schema.db;
    const voice = await import("@workspace/db/schema/voice");
    const row = (s: string) => ({
      name: `[TEST] Texts ${s} ${STAMP}`,
      practiceAreas: [] as string[],
      statesServed: [] as string[],
      statuteOfLimitationsDays: 0,
      notifyEmail: `texts-${s}-${STAMP}@example.test`,
      twilioNumber: `+1555030${s === "A" ? "1" : "2"}${String(STAMP).slice(-4)}`,
      email: `texts-${s}-${STAMP}@example.test`,
    });
    firmA = (await db.insert(schema.intakeFirms).values(row("A")).returning({ id: schema.intakeFirms.id }))[0]!.id;
    firmB = (await db.insert(schema.intakeFirms).values(row("B")).returning({ id: schema.intakeFirms.id }))[0]!.id;
    const texts = await import("../lib/voiceSms/textThread.js");
    await texts.ensureTextContact(firmA, "+15550199101");
    await texts.storeInboundText({ firmId: firmA, fromE164: "+15550199101", toE164: "+16093072692", body: "Running 10 minutes late", providerMessageSid: `SMhttp${STAMP}`, keyword: "other" });
    const { and, eq } = await import("drizzle-orm");
    contactA = (await db.select().from(voice.voiceContacts).where(and(eq(voice.voiceContacts.firmId, firmA), eq(voice.voiceContacts.phoneE164, "+15550199101"))))[0]!.id;

    const router = (await import("./receptionistContacts.js")).default;
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.log = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Request["log"];
      next();
    });
    app.use("/api", router);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/receptionist/contacts`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server?.close(() => r()));
    const { assertDisposableDatabase } = await import("../lib/disposableDatabase.js");
    await assertDisposableDatabase("contact texts cleanup");
    const { inArray } = await import("drizzle-orm");
    const ids = [firmA, firmB].filter(Boolean);
    if (ids.length) await db.delete(schema.intakeFirms).where(inArray(schema.intakeFirms.id, ids));
  });

  const as = (firm: number, path = "", init: RequestInit = {}) =>
    fetch(`${base}/${contactA}${path}`, { ...init, headers: { "x-test-firm": String(firm), "content-type": "application/json", ...(init.headers ?? {}) } });

  it("the owning business reads the thread, with the reply unread", async () => {
    const res = await as(firmA, "/texts");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ direction: string; body: string; unread: boolean }>; unread: number };
    expect(body.items).toEqual([expect.objectContaining({ direction: "in", body: "Running 10 minutes late", unread: true })]);
    expect(body.unread).toBe(1);
  });

  it("another business gets 404 for the same contact id, and cannot mark it read", async () => {
    expect((await as(firmB, "/texts")).status).toBe(404);
    expect((await as(firmB, "/texts/read", { method: "POST", body: "{}" })).status).toBe(404);
    const still = (await (await as(firmA, "/texts")).json()) as { unread: number };
    expect(still.unread).toBe(1);
  });

  it("marking read clears it, and the list's unread count follows", async () => {
    const res = await as(firmA, "/texts/read", { method: "POST", body: "{}" });
    expect(await res.json()).toEqual({ ok: true, marked: 1 });
    expect(((await (await as(firmA, "/texts")).json()) as { unread: number }).unread).toBe(0);
    const list = (await (await fetch(base, { headers: { "x-test-firm": String(firmA) } })).json()) as { items: Array<{ id: number; unreadTexts: number }> };
    expect(list.items.find((c) => c.id === contactA)!.unreadTexts).toBe(0);
  });

  it("no session is 401", async () => {
    expect((await fetch(`${base}/${contactA}/texts`)).status).toBe(401);
  });
});
