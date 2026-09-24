import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ read: vi.fn(), recording: vi.fn(), factory: vi.fn(), warn: vi.fn() }));
vi.mock("../lib/receptionistAuth.js", () => ({
  requireReceptionistAuth: (req: Request, res: Response, next: NextFunction) => {
    const firm = req.headers["x-test-session"];
    if (firm !== "7" && firm !== "8") { res.sendStatus(401); return; }
    req.firmId = Number(firm); next();
  },
}));
vi.mock("../lib/voice/webhooks/realCallsRepository.js", () => ({ getRealCallForFirm: h.read, listRealCallsForFirm: vi.fn() }));
vi.mock("../lib/voicePublishing/providerFactory.js", () => ({ createProductionVoiceProvider: h.factory }));
import router from "./receptionistVoiceCalls.js";

let server: http.Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => { req.log = { warn: h.warn } as unknown as Request["log"]; next(); });
  app.use("/api", router);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/receptionist/voice/calls/call-owned-by-7/recording`;
});
afterAll(async () => { vi.unstubAllEnvs(); await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VOICE_ARTIFACT_POLICY", "full");
  h.read.mockImplementation(async (firmId) => firmId === 7 ? { callId: "call-owned-by-7", isFinal: true, synthetic: false } : undefined);
  h.factory.mockReturnValue({ getCallRecording: h.recording });
  h.recording.mockResolvedValue({ url: "https://storage.googleapis.com/private/recording?signature=test" });
});
const get = (firm: string | null = "7") => fetch(base, { headers: firm ? { "x-test-session": firm } : {} });

describe("recording authorization over HTTP", () => {
  it("rejects an unauthenticated request without reading the provider", async () => {
    expect((await get(null)).status).toBe(401);
    expect(h.read).not.toHaveBeenCalled(); expect(h.factory).not.toHaveBeenCalled();
  });
  it("returns 404 for the exact call ID owned by another business before touching the provider", async () => {
    expect((await get("8")).status).toBe(404);
    expect(h.read).toHaveBeenCalledWith(8, "call-owned-by-7");
    expect(h.factory).not.toHaveBeenCalled();
  });
  it.each(["none", "transcript_only", "", "FULL"])("fails closed under policy %s", async (policy) => {
    vi.stubEnv("VOICE_ARTIFACT_POLICY", policy);
    expect(await (await get()).json()).toEqual({ status: "disabled" });
    expect(h.factory).not.toHaveBeenCalled();
  });
  it("does not request artifacts for unfinished calls", async () => {
    h.read.mockResolvedValue({ callId: "call-owned-by-7", isFinal: false });
    expect(await (await get()).json()).toEqual({ status: "pending" });
    expect(h.factory).not.toHaveBeenCalled();
  });
  it("does not claim synthetic events have audio", async () => {
    h.read.mockResolvedValue({ callId: "call-owned-by-7", isFinal: true, synthetic: true });
    expect(await (await get()).json()).toEqual({ status: "unavailable" });
    expect(h.factory).not.toHaveBeenCalled();
  });
  it("returns a fresh private link only for the owning business, with no-store headers", async () => {
    const response = await get();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toMatchObject({ status: "available" });
    expect(h.recording).toHaveBeenCalledWith("call-owned-by-7");
  });
  it("does not infer historical recording from today's full policy", async () => {
    h.recording.mockResolvedValue(undefined);
    expect(await (await get()).json()).toEqual({ status: "unavailable" });
  });
  it("keeps provider credentials and signed URLs out of errors and logs", async () => {
    h.recording.mockRejectedValue(new Error("secret-key signed-url-private"));
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/secret-key|signed-url/);
    expect(JSON.stringify(h.warn.mock.calls)).not.toMatch(/secret-key|signed-url/);
  });
});
