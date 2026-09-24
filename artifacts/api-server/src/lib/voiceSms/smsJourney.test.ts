// J4: what it takes for a caller to get a text — their explicit yes on the
// call, the number read back to them — and the limits around every send:
// daily caps, delivery status that never goes backwards, and signatures
// checked against the URL Twilio actually signed.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { readFileSync } from "node:fs";
import {
  defaultSmsTransport,
  loadVoiceSmsCaps,
  loadVoiceSmsConfig,
  resolveVoiceSmsPublicOrigin,
} from "./smsCore.js";
import { shouldReplaceDeliveryStatus } from "./outboxService.js";
import { dispatchToolCalls, type ToolSchedulingDeps } from "../voice/tools/toolDispatcher.js";
import { bookAppointmentArgs } from "../voice/tools/toolCatalog.js";
import { describeEnvContract } from "../envContract.js";

const CONFIG_ENV = {
  VOICE_TWILIO_ACCOUNT_SID: "ACvoicevoicevoicevoicevoicevoice01",
  VOICE_TWILIO_AUTH_TOKEN: "voice-auth-token-value",
  VOICE_TWILIO_FROM_NUMBER: "+15550009999",
};

describe("public origin for signatures and status callbacks", () => {
  it("prefers the explicit origin, falls back to the webhook URL's origin, and accepts https only", () => {
    expect(resolveVoiceSmsPublicOrigin({ VOICE_SMS_PUBLIC_ORIGIN: "https://api.example.com/x" })).toBe("https://api.example.com");
    expect(resolveVoiceSmsPublicOrigin({ VOICE_SERVER_URL: "https://app.example.com/api/voice/webhooks/vapi" })).toBe("https://app.example.com");
    expect(resolveVoiceSmsPublicOrigin({ VOICE_SMS_PUBLIC_ORIGIN: "http://insecure.example.com" })).toBeNull();
    expect(resolveVoiceSmsPublicOrigin({})).toBeNull();
  });

  it("the webhook verifies against that origin, not the request's own protocol", () => {
    const route = readFileSync(new URL("../../routes/voiceSmsWebhook.ts", import.meta.url), "utf8");
    expect(route).toMatch(/const origin = resolveVoiceSmsPublicOrigin\(\);\s*const url = origin \? `\$\{origin\}\$\{req\.originalUrl\}`/);
  });
});

describe("daily spending caps", () => {
  it("default to 20 per business and 100 in total, bounded, and fail closed on nonsense", () => {
    expect(loadVoiceSmsCaps({})).toEqual({ perFirmPerDay: 20, totalPerDay: 100 });
    expect(loadVoiceSmsCaps({ VOICE_SMS_DAILY_CAP_PER_FIRM: "5", VOICE_SMS_DAILY_CAP_TOTAL: "10" })).toEqual({ perFirmPerDay: 5, totalPerDay: 10 });
    for (const bad of ["0", "-1", "abc", "2.5", "100000"]) {
      expect(() => loadVoiceSmsCaps({ VOICE_SMS_DAILY_CAP_PER_FIRM: bad }), bad).toThrow();
    }
  });

  it("are documented in the environment contract", () => {
    const names = describeEnvContract().map((e) => e.name);
    for (const n of ["VOICE_SMS_PUBLIC_ORIGIN", "VOICE_SMS_DAILY_CAP_PER_FIRM", "VOICE_SMS_DAILY_CAP_TOTAL"]) expect(names).toContain(n);
  });

  it("a capped text is closed, never held for tomorrow, and checked before any send", () => {
    const src = readFileSync(new URL("./outboxService.ts", import.meta.url), "utf8");
    const loop = src.slice(src.indexOf("for (const row of claimed"), src.indexOf("for (const row of claimed") + 1800);
    expect(loop.indexOf("daily_cap_reached")).toBeGreaterThan(-1);
    expect(loop.indexOf("daily_cap_reached")).toBeLessThan(loop.indexOf("await transport("));
    expect(loop).toContain('status: "failed", errorCode: "daily_cap_reached"');
  });
});

describe("delivery status", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never goes backwards and never leaves a terminal state", () => {
    expect(shouldReplaceDeliveryStatus(null, "sent")).toBe(true);
    expect(shouldReplaceDeliveryStatus("sent", "delivered")).toBe(true);
    expect(shouldReplaceDeliveryStatus("delivered", "sent")).toBe(false);
    expect(shouldReplaceDeliveryStatus("undelivered", "delivered")).toBe(false);
    expect(shouldReplaceDeliveryStatus("failed", "queued")).toBe(false);
    expect(shouldReplaceDeliveryStatus("sent", "made-up")).toBe(false);
  });

  it("each send asks Twilio for a status callback", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
    });
    await defaultSmsTransport(loadVoiceSmsConfig(CONFIG_ENV), "+15551234567", "x", {
      statusCallbackUrl: "https://app.example.com/api/voice/sms/status",
    });
    expect(bodies[0]).toContain("StatusCallback=https%3A%2F%2Fapp.example.com%2Fapi%2Fvoice%2Fsms%2Fstatus");
  });
});

describe("consent is the caller's explicit yes on the call", () => {
  const FIRM = 7;
  const CTX = { provider: "vapi", providerCallId: "call_sms_1", assistantRowId: 11 } as const;
  const NOW = new Date("2026-09-30T15:00:00.000Z");

  function deps(): { deps: ToolSchedulingDeps; texts: Array<{ rawPhone: string | null | undefined; callerConsented: boolean; spokenSummary: string }>; consents: boolean[] } {
    const texts: Array<{ rawPhone: string | null | undefined; callerConsented: boolean; spokenSummary: string }> = [];
    const consents: boolean[] = [];
    return {
      texts,
      consents,
      deps: {
        now: () => NOW,
        authorizedCapabilities: () => ["scheduling"],
        getSchedulingContext: async () => ({ timezone: "America/Los_Angeles", types: [{ id: "2", name: "Discovery consultation", durationMin: 30 }] }),
        getDayAvailability: async () => ({ dateKey: "2026-10-01", reason: "open", slots: [] }),
        findRequestByPublicId: async () => undefined,
        submitAppointmentRequest: async (_f, _t, startUtc, contact, consent) => {
          consents.push(consent.smsConsent);
          return {
            ok: true,
            request: {
              id: 1, publicId: "11111111-1111-4111-8111-111111111111", firmId: FIRM, appointmentTypeId: 2, source: "ai_receptionist",
              status: "pending_review", requestedStartAt: startUtc, requestedEndAt: new Date(startUtc.getTime() + 1_800_000),
              timezone: "America/Los_Angeles", customerName: contact.name, customerEmail: null, customerPhone: contact.phone,
              phoneConsent: true, smsConsent: consent.smsConsent, emailConsent: false, holdExpiresAt: null, createdAt: NOW, updatedAt: NOW,
            } as never,
          };
        },
        cancelAppointmentRequestByPublicId: async () => true,
        loadBusinessName: async () => "SiteMint Digital",
        enqueueBookingConfirmation: async (input) => {
          texts.push({ rawPhone: input.rawPhone, callerConsented: input.callerConsented, spokenSummary: input.spokenSummary });
          return { enqueued: true };
        },
      },
    };
  }

  const book = (extra: Record<string, unknown>) => ({
    toolCallId: "t-" + JSON.stringify(extra).length,
    name: "book_appointment" as const,
    args: { appointmentTypeId: "2", startIso: "2026-10-01T16:00:00.000Z", customerName: "Pat Caller", ...extra },
  });

  it("queues a text, with the business named, only on smsConsent with a read-back number", async () => {
    const h = deps();
    await dispatchToolCalls(FIRM, [book({ customerPhone: "+15551234567", smsConsent: true })], CTX, h.deps);
    expect(h.consents).toEqual([true]);
    expect(h.texts).toHaveLength(1);
    expect(h.texts[0]!.callerConsented).toBe(true);
    expect(h.texts[0]!.spokenSummary).toMatch(/^SiteMint Digital: /);
    expect(h.texts[0]!.spokenSummary).toMatch(/Reply STOP to opt out\.$/);
  });

  it("sends nothing and records no consent without that yes", async () => {
    const h = deps();
    await dispatchToolCalls(FIRM, [book({ customerPhone: "+15551234567" })], CTX, h.deps);
    await dispatchToolCalls(FIRM, [book({ customerPhone: "+15551234567", smsConsent: false })], CTX, h.deps);
    expect(h.texts).toEqual([]);
    expect(h.consents).toEqual([false, false]);
  });

  it("the argument schema refuses consent without a phone number", () => {
    expect(bookAppointmentArgs.safeParse({ appointmentTypeId: "2", startIso: "2026-10-01T16:00:00.000Z", customerName: "Pat", smsConsent: true }).success).toBe(false);
    expect(
      bookAppointmentArgs.safeParse({ appointmentTypeId: "2", startIso: "2026-10-01T16:00:00.000Z", customerName: "Pat", customerPhone: "+15551234567", smsConsent: true }).success,
    ).toBe(true);
  });
});
