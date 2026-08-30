// P5 — contacts, consent, and voice-side SMS: normalization, the contact
// linker via injected collaborators, the fail-closed + anti-credential-reuse
// config loader, Twilio signature verification, keyword compliance, the
// pinned outbound transport (stubbed fetch), and the source-level isolation
// guard proving voice SMS code never references the intake pipeline.

import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { normalizePhoneE164, linkCallToContact, type ContactLinkerDeps } from "../voiceContacts/contactLinker.js";
import {
  classifyInboundKeyword,
  computeTwilioSignature,
  defaultSmsTransport,
  isVoiceSmsEnabled,
  loadVoiceSmsConfig,
  TWILIO_API_HOST,
  verifyTwilioSignature,
  VoiceSmsConfigError,
} from "./smsCore.js";

const GOOD_ENV = {
  VOICE_TWILIO_ACCOUNT_SID: "ACvoicevoicevoicevoicevoicevoice01",
  VOICE_TWILIO_AUTH_TOKEN: "voice-auth-token-value",
  VOICE_TWILIO_FROM_NUMBER: "+15550009999",
};

// ── phone normalization ──────────────────────────────────────────────────────

describe("normalizePhoneE164", () => {
  it("accepts E.164, bare NANP-10, and 1-prefixed NANP-11", () => {
    expect(normalizePhoneE164("+15551234567")).toEqual({ e164: "+15551234567" });
    expect(normalizePhoneE164("(555) 123-4567")).toEqual({ e164: "+15551234567" });
    expect(normalizePhoneE164("1 555 123 4567")).toEqual({ e164: "+15551234567" });
    expect(normalizePhoneE164("+442071234567")).toEqual({ e164: "+442071234567" });
  });
  it("rejects rather than guesses", () => {
    for (const bad of [undefined, null, "", "12345", "+0123456789", "0555123456", "555-123", "notaphone"]) {
      expect(normalizePhoneE164(bad as string)).toBeUndefined();
    }
  });
});

// ── contact linker ───────────────────────────────────────────────────────────

describe("linkCallToContact", () => {
  function deps(overrides: Partial<ContactLinkerDeps> = {}) {
    const calls: Record<string, unknown[]> = { upsert: [], link: [], find: [], assoc: [] };
    const base: ContactLinkerDeps = {
      now: () => new Date("2026-08-31T12:00:00Z"),
      upsertContact: async (input) => {
        calls.upsert.push(input);
        return { contactId: 41 };
      },
      linkCall: async (...args) => {
        calls.link.push(args);
      },
      findIntakeConversationId: async (...args) => {
        calls.find.push(args);
        return 77;
      },
      setIntakeAssociation: async (...args) => {
        calls.assoc.push(args);
      },
      ...overrides,
    };
    return { base, calls };
  }

  it("normalizes, upserts, links, and associates the intake conversation read-only", async () => {
    const { base, calls } = deps();
    const result = await linkCallToContact(7, "call-1", "(555) 123-4567", "Pat", base);
    expect(result).toEqual({ linked: true, contactId: 41 });
    expect(calls.upsert[0]).toMatchObject({ firmId: 7, phoneE164: "+15551234567", displayName: "Pat", callId: "call-1" });
    expect(calls.link[0]).toEqual([7, "call-1", 41]);
    expect(calls.assoc[0]).toEqual([7, 41, 77]);
  });

  it("declines unusable numbers without touching any collaborator", async () => {
    const { base, calls } = deps();
    const result = await linkCallToContact(7, "call-1", "anonymous", undefined, base);
    expect(result).toEqual({ linked: false, reason: "unusable_number" });
    expect(calls.upsert).toHaveLength(0);
  });

  it("still links when the intake association lookup fails — identity stands alone", async () => {
    const { base } = deps({
      findIntakeConversationId: async () => {
        throw new Error("intake unavailable");
      },
    });
    const result = await linkCallToContact(7, "call-1", "+15551234567", undefined, base);
    expect(result.linked).toBe(true);
  });
});

// ── config loader: fail-closed + structural anti-reuse ───────────────────────

describe("loadVoiceSmsConfig", () => {
  it("flag is exact; loader requires all three values and E.164 from-number", () => {
    expect(isVoiceSmsEnabled({})).toBe(false);
    expect(isVoiceSmsEnabled({ VOICE_SMS_ENABLED: "TRUE" })).toBe(false);
    expect(isVoiceSmsEnabled({ VOICE_SMS_ENABLED: "true" })).toBe(true);
    expect(() => loadVoiceSmsConfig({})).toThrow(VoiceSmsConfigError);
    expect(() => loadVoiceSmsConfig({ ...GOOD_ENV, VOICE_TWILIO_FROM_NUMBER: "5550009999" })).toThrow(/E\.164/);
    expect(loadVoiceSmsConfig(GOOD_ENV)).toEqual({
      accountSid: GOOD_ENV.VOICE_TWILIO_ACCOUNT_SID,
      authToken: GOOD_ENV.VOICE_TWILIO_AUTH_TOKEN,
      fromNumber: GOOD_ENV.VOICE_TWILIO_FROM_NUMBER,
    });
  });

  it("structurally refuses to reuse ANY intake credential or the intake number", () => {
    expect(() =>
      loadVoiceSmsConfig({ ...GOOD_ENV, INTAKE_TWILIO_ACCOUNT_SID: GOOD_ENV.VOICE_TWILIO_ACCOUNT_SID }),
    ).toThrow(/intake Twilio account/);
    expect(() =>
      loadVoiceSmsConfig({ ...GOOD_ENV, INTAKE_TWILIO_AUTH_TOKEN: GOOD_ENV.VOICE_TWILIO_AUTH_TOKEN }),
    ).toThrow(/intake Twilio auth token/);
    expect(() =>
      loadVoiceSmsConfig({ ...GOOD_ENV, INTAKE_TWILIO_FROM_NUMBER: GOOD_ENV.VOICE_TWILIO_FROM_NUMBER }),
    ).toThrow(/intake SMS number/);
    // Distinct intake values present → loads fine.
    expect(
      loadVoiceSmsConfig({
        ...GOOD_ENV,
        INTAKE_TWILIO_ACCOUNT_SID: "ACintakeintakeintakeintakeintake01",
        INTAKE_TWILIO_AUTH_TOKEN: "intake-token",
        INTAKE_TWILIO_FROM_NUMBER: "+15550001111",
      }).fromNumber,
    ).toBe("+15550009999");
  });
});

// ── Twilio signature + keywords ──────────────────────────────────────────────

describe("twilio signature + inbound keywords", () => {
  const URL_UNDER_TEST = "https://app.example.com/api/voice/sms/inbound";
  const PARAMS = { Body: "STOP", From: "+15551234567", To: "+15550009999" };

  it("verifies its own signature and rejects wrong tokens or missing headers", () => {
    const signature = computeTwilioSignature("token-a", URL_UNDER_TEST, PARAMS);
    expect(verifyTwilioSignature("token-a", URL_UNDER_TEST, PARAMS, signature)).toBe(true);
    expect(verifyTwilioSignature("token-b", URL_UNDER_TEST, PARAMS, signature)).toBe(false);
    expect(verifyTwilioSignature("token-a", URL_UNDER_TEST, PARAMS, undefined)).toBe(false);
    // Parameter order must not matter (lexicographic canonicalization).
    const reordered = { To: PARAMS.To, From: PARAMS.From, Body: PARAMS.Body };
    expect(verifyTwilioSignature("token-a", URL_UNDER_TEST, reordered, signature)).toBe(true);
  });

  it("classifies carrier keywords on the whole trimmed word only", () => {
    expect(classifyInboundKeyword(" STOP ")).toBe("stop");
    expect(classifyInboundKeyword("unsubscribe")).toBe("stop");
    expect(classifyInboundKeyword("Start")).toBe("start");
    expect(classifyInboundKeyword("yes")).toBe("start");
    expect(classifyInboundKeyword("please stop calling")).toBe("other");
    expect(classifyInboundKeyword(undefined)).toBe("other");
  });
});

// ── outbound transport (stubbed fetch; pinned host) ──────────────────────────

describe("defaultSmsTransport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to the pinned Twilio host with basic auth and parses the sid", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 });
    });
    const config = loadVoiceSmsConfig(GOOD_ENV);
    const result = await defaultSmsTransport(config, "+15551234567", "Your appointment is confirmed.");
    expect(result).toEqual({ ok: true, providerMessageSid: "SM123" });
    expect(seen[0]!.url.startsWith(`${TWILIO_API_HOST}/2010-04-01/Accounts/`)).toBe(true);
    const headers = seen[0]!.init.headers as Record<string, string>;
    expect(headers.authorization.startsWith("Basic ")).toBe(true);
    const body = String(seen[0]!.init.body);
    expect(body).toContain("To=%2B15551234567");
    expect(body).toContain("From=%2B15550009999");
  });

  it("maps 429/5xx to retryable and 4xx to fatal with the provider code", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ code: 21610 }), { status: 400 }));
    const config = loadVoiceSmsConfig(GOOD_ENV);
    const fatal = await defaultSmsTransport(config, "+15551234567", "x");
    expect(fatal).toEqual({ ok: false, retryable: false, errorCode: "21610" });

    vi.stubGlobal("fetch", async () => new Response("busy", { status: 429 }));
    const retry = await defaultSmsTransport(config, "+15551234567", "x");
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.retryable).toBe(true);
  });
});

// ── source-level isolation guard ─────────────────────────────────────────────

describe("intake isolation", () => {
  it("no voice SMS/contact source file references the intake pipeline except smsCore's inequality guard", () => {
    const roots = [
      path.join(__dirname), // lib/voiceSms
      path.join(__dirname, "..", "voiceContacts"),
      path.join(__dirname, "..", "..", "routes"),
    ];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const name of readdirSync(root)) {
        if (!/^voiceSms|contactLinker|voiceSmsWebhook/.test(name) && root.endsWith("routes")) continue;
        if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
        const full = path.join(root, name);
        const source = readFileSync(full, "utf8");
        if (name === "smsCore.ts") {
          // The ONLY permitted references are the three inequality guards.
          const stripped = source.replace(/env\["INTAKE_TWILIO_[A-Z_]+"\]/g, "");
          expect(stripped.includes("INTAKE_TWILIO")).toBe(false);
          expect(source.includes("intakeTwilio")).toBe(false);
          continue;
        }
        if (source.includes("INTAKE_TWILIO") || source.includes("intakeTwilio") || source.includes("intakeOptOut")) {
          offenders.push(name);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
