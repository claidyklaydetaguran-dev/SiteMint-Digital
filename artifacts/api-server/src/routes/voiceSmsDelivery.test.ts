import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { type Request } from "express";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({ resolve: vi.fn(), store: vi.fn(), contact: vi.fn(), consent: vi.fn() }));
vi.mock("../lib/voiceNumbers/numberService.js", () => ({ resolveFirmIdForInboundSmsNumber: h.resolve }));
vi.mock("../lib/voiceSms/outboxService.js", () => ({ recordConsent: h.consent, recordDeliveryStatus: vi.fn() }));
vi.mock("../lib/voiceSms/textThread.js", () => ({ storeInboundText: h.store, ensureTextContact: h.contact }));
import { computeTwilioSignature } from "../lib/voiceSms/smsCore.js";
import router from "./voiceSmsWebhook.js";
let server: http.Server, base: string;
const from = "+15550190101", to = "+15550190202", token = "test-only-voice-token";
beforeAll(async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => { req.log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Request["log"]; next(); });
  app.use("/api", router);
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/voice/sms/inbound`;
});
afterAll(async () => { vi.unstubAllEnvs(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VOICE_TWILIO_ACCOUNT_SID", "ACtestvoice");
  vi.stubEnv("VOICE_TWILIO_AUTH_TOKEN", token);
  vi.stubEnv("VOICE_TWILIO_FROM_NUMBER", to);
  vi.stubEnv("VOICE_SMS_PUBLIC_ORIGIN", "");
  vi.stubEnv("VOICE_SERVER_URL", "");
  vi.stubEnv("VOICE_SMS_ENABLED", "false");
  vi.stubEnv("INTAKE_TWILIO_ACCOUNT_SID", "");
  vi.stubEnv("INTAKE_TWILIO_AUTH_TOKEN", "");
  vi.stubEnv("INTAKE_TWILIO_FROM_NUMBER", "");
  vi.stubEnv("VOICE_SMS_OWNER_FIRM_ID", "7");
  h.resolve.mockResolvedValue(7); h.store.mockResolvedValue({ inserted: true });
});
async function send(destination = to, body = "Hello", signature = true) {
  const params = { From: from, To: destination, Body: body, MessageSid: "SMtestincoming000001" };
  return fetch(base, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature ? computeTwilioSignature(token, base, params) : "forged" }, body: new URLSearchParams(params) });
}
describe("inbound SMS persistence and tenant routing", () => {
  it("stores a signed inbound text for the assigned business", async () => {
    expect((await send()).status).toBe(200);
    expect(h.store).toHaveBeenCalledWith(expect.objectContaining({ firmId: 7, body: "Hello" }));
  });
  it("rejects unsigned traffic before tenant lookup", async () => {
    expect((await send(to, "Hello", false)).status).toBe(401);
    expect(h.resolve).not.toHaveBeenCalled();
  });
  it("does not acknowledge success when message persistence fails", async () => {
    h.store.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await send()).status).toBe(503);
    expect((await send()).status).toBe(200);
  });
  it("does not route an inventory outage into the legacy firm's inbox", async () => {
    h.resolve.mockRejectedValue(new Error("inventory unavailable"));
    expect((await send()).status).toBe(503);
    expect(h.store).not.toHaveBeenCalled();
  });
  it("never routes an unknown destination through the legacy firm pin", async () => {
    h.resolve.mockResolvedValue(undefined);
    expect((await send("+15550190303")).status).toBe(200);
    expect(h.store).not.toHaveBeenCalled();
    expect(h.consent).not.toHaveBeenCalled();
  });
  it("supports the exact configured legacy destination", async () => {
    h.resolve.mockResolvedValue(undefined);
    expect((await send()).status).toBe(200);
    expect(h.store).toHaveBeenCalledWith(expect.objectContaining({ firmId: 7 }));
  });
  it("persists STOP consent even when storing its text fails", async () => {
    h.store.mockRejectedValue(new Error("storage unavailable"));
    expect((await send(to, "STOP")).status).toBe(503);
    expect(h.consent).toHaveBeenCalledWith(7, from, "stopped", "sms_stop");
  });
});
