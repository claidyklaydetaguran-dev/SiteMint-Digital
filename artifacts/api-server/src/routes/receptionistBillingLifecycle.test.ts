// J7 against a real database: a signed Stripe checkout activates the voice
// plan; duplicates change nothing; a failed payment starts grace, a recovery
// ends it, cancellation cancels and a resume reactivates — and the plan gate
// follows each state. Signatures are generated locally with a test secret;
// nothing here reaches Stripe.
//
// Gated on CRM_TEST_DATABASE_URL. The [TEST] firm is removed in afterAll.

import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import Stripe from "stripe";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
const suite = TEST_DB ? describe : describe.skip;

const SECRET = "whsec_" + "lifecycle_test_only_" + "0123456789abcdef";
const STAMP = Date.now();
const CUSTOMER = `cus_TEST${STAMP}`;

vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
vi.stubEnv("VOICE_PLAN_CATALOG_JSON", JSON.stringify([{ planCode: "starter", includedMinutes: 300, smsIncluded: true }]));
vi.stubEnv("VOICE_CHECKOUT_PLAN_CODE", "starter");
vi.stubEnv("VOICE_SERVICE_ACCESS_REQUIRED", "true");

suite("receptionist billing lifecycle (real DB, signed events)", () => {
  let server: http.Server;
  let base = "";
  let firmId = 0;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  const signer = new Stripe("sk_test_placeholder_for_signing_only");

  const send = async (type: string, object: Record<string, unknown>, id = `evt_${type.replace(/\W/g, "_")}_${STAMP}`) => {
    const payload = JSON.stringify({ id, object: "event", type, data: { object } });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    return fetch(`${base}/api/receptionist/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
  };
  const state = async () => {
    const voice = await import("@workspace/db/schema/voice");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(voice.voiceSubscriptions).where(eq(voice.voiceSubscriptions.firmId, firmId));
    return row;
  };
  const access = async () => (await import("../lib/voiceBilling/serviceAccess.js")).resolveServiceAccess(firmId);

  beforeAll(async () => {
    const { assertDisposableDatabase } = await import("../lib/disposableDatabase.js");
    await assertDisposableDatabase("billing lifecycle setup");
    schema = await import("@workspace/db");
    db = schema.db;
    const [firm] = await db
      .insert(schema.intakeFirms)
      .values({
        name: `[TEST] Billing ${STAMP}`,
        practiceAreas: [],
        statesServed: [],
        statuteOfLimitationsDays: 0,
        notifyEmail: `billing-${STAMP}@example.test`,
        twilioNumber: `+1555020${String(STAMP).slice(-4)}`,
        email: `billing-${STAMP}@example.test`,
        stripeCustomerId: CUSTOMER,
      } as never)
      .returning({ id: schema.intakeFirms.id });
    firmId = firm!.id;

    const router = (await import("./receptionistBilling.js")).default;
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.log = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Request["log"];
      next();
    });
    app.use("/api/receptionist/billing/webhook", express.raw({ type: "application/json" }));
    app.use("/api", router);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server?.close(() => r()));
    const { assertDisposableDatabase } = await import("../lib/disposableDatabase.js");
    await assertDisposableDatabase("billing lifecycle cleanup");
    const { eq, and, like } = await import("drizzle-orm");
    const voice = await import("@workspace/db/schema/voice");
    await db.delete(voice.providerWebhookEvents).where(and(eq(voice.providerWebhookEvents.provider, "stripe_receptionist"), like(voice.providerWebhookEvents.eventKey, `%${STAMP}%`)));
    if (firmId) await db.delete(schema.intakeFirms).where(eq(schema.intakeFirms.id, firmId));
  });

  it("refuses an event with a forged signature and changes nothing", async () => {
    const payload = JSON.stringify({ id: `evt_forged_${STAMP}`, type: "checkout.session.completed", data: { object: { customer: CUSTOMER, mode: "subscription" } } });
    const res = await fetch(`${base}/api/receptionist/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
      body: payload,
    });
    expect(res.status).toBe(400);
    expect(await state()).toBeUndefined();
  });

  it("before checkout the receptionist is not activated", async () => {
    expect(await access()).toEqual({ allowed: false, reason: "not_activated" });
  });

  it("a completed checkout activates the configured voice plan", async () => {
    const res = await send("checkout.session.completed", { customer: CUSTOMER, mode: "subscription", subscription: `sub_TEST${STAMP}` });
    expect(res.status).toBe(200);
    expect(await state()).toMatchObject({ planCode: "starter", state: "active", stripeCustomerId: CUSTOMER });
    expect(await access()).toMatchObject({ allowed: true, state: "active" });
  });

  it("a redelivered checkout event changes nothing", async () => {
    const before = await state();
    expect((await send("checkout.session.completed", { customer: CUSTOMER, mode: "subscription" })).status).toBe(200);
    expect((await state())!.updatedAt).toEqual(before!.updatedAt);
  });

  it("a failed payment starts the grace period; the receptionist keeps working", async () => {
    expect((await send("invoice.payment_failed", { customer: CUSTOMER })).status).toBe(200);
    const row = await state();
    expect(row!.state).toBe("grace");
    expect(row!.graceUntil).toBeInstanceOf(Date);
    expect(await access()).toMatchObject({ allowed: true, state: "grace" });
  });

  it("the same failure delivered again does not extend the grace period", async () => {
    const before = await state();
    await send("invoice.payment_failed", { customer: CUSTOMER });
    expect((await state())!.graceUntil).toEqual(before!.graceUntil);
  });

  it("a later successful payment ends grace", async () => {
    await send("invoice.payment_succeeded", { customer: CUSTOMER }, `evt_paid_${STAMP}`);
    expect(await state()).toMatchObject({ state: "active", graceUntil: null });
  });

  it("cancellation switches the receptionist off, and a resume switches it back on", async () => {
    await send("customer.subscription.deleted", { id: `sub_TEST${STAMP}`, customer: CUSTOMER });
    expect((await state())!.state).toBe("canceled");
    expect(await access()).toEqual({ allowed: false, reason: "canceled" });

    await send("customer.subscription.resumed", { id: `sub_TEST${STAMP}`, customer: CUSTOMER });
    expect((await state())!.state).toBe("active");
  });

  it("an event for an unknown customer is acknowledged and changes nothing", async () => {
    const before = await state();
    expect((await send("invoice.payment_failed", { customer: "cus_nobody" }, `evt_unknown_${STAMP}`)).status).toBe(200);
    expect((await state())!.state).toBe(before!.state);
  });
});
