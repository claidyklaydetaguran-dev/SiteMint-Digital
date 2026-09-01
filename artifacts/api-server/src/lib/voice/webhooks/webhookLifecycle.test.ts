// P2 — webhook & call-lifecycle completion: policy auth (HMAC-only default,
// rotation overlap, gated bearer bridge), parser extensions, fold additions,
// reconciliation classification and sweep (via injected fakes — no database),
// and the disabled-by-default server-URL attachment representation.

import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// Hoisted above every import: the real module must never evaluate (repo
// pattern — @workspace/db throws at import time without DATABASE_URL).
vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  authenticateVapiWebhook,
  VAPI_WEBHOOK_ALLOW_BEARER_ENV_VAR,
  VAPI_WEBHOOK_SECRET_ENV_VAR,
  VAPI_WEBHOOK_SECRET_PREVIOUS_ENV_VAR,
} from "./webhookAuthPolicy.js";
import {
  VAPI_BEARER_HEADER,
  VAPI_SIGNATURE_HEADER,
  VAPI_TIMESTAMP_HEADER,
} from "./vapiWebhookAuth.js";
import { parseVapiServerMessage, type ParsedVapiMessage } from "./vapiServerMessage.js";
import { buildVapiEventKey } from "./eventKey.js";
import { foldEventsIntoCallRecord, type StoredVapiEvent } from "./callStateModel.js";
import {
  classifyCallForReconciliation,
  runVoiceReconciliationOnce,
  isVoiceReconciliationEnabled,
  VOICE_RECONCILIATION_ENABLED_ENV_VAR,
  STALE_IN_PROGRESS_AFTER_MS,
  MISSING_REPORT_AFTER_MS,
} from "./reconciliation.js";
import {
  loadVoiceServerConfigFromEnv,
  isVoiceWebhookAttachEnabled,
  VOICE_WEBHOOK_ATTACH_ENABLED_ENV_VAR,
  VOICE_SERVER_URL_ENV_VAR,
  VOICE_SERVER_SECRET_ENV_VAR,
} from "../../voicePublishing/serverConfig.js";
import { PublishFoundationError } from "../../voicePublishing/errors.js";
import { buildSyncProviderInput } from "../../voicePublishing/syncService.js";
import { computeProviderPayloadHash } from "../../voicePublishing/providerPayloadHash.js";
import { validateVapiRuntimeConfig } from "../providers/vapi/types.js";
import { buildVapiAssistantRequestBody } from "../providers/vapi/mapper.js";
import type { RuntimeCatalog, RuntimeCatalogPreset } from "../../voicePublishing/types.js";
import type { VoiceAssistant } from "@workspace/db/schema/voice";
import type { RealCallRecord } from "./callStateModel.js";

// ── shared fixtures ──────────────────────────────────────────────────────────

const SECRET = "current-webhook-secret-0123456789";
const PREVIOUS = "previous-webhook-secret-987654321";
const NOW_MS = Date.parse("2026-08-30T12:00:00.000Z");

function sign(secret: string, timestamp: string, rawBody: Buffer): string {
  return createHmac("sha256", secret).update(timestamp).update(".").update(rawBody).digest("hex");
}

function hmacHeaders(secret: string, rawBody: Buffer, atMs = NOW_MS): Record<string, string> {
  const ts = String(Math.floor(atMs / 1000));
  return { [VAPI_TIMESTAMP_HEADER]: ts, [VAPI_SIGNATURE_HEADER]: sign(secret, ts, rawBody) };
}

function headerFn(headers: Record<string, string>): (name: string) => string | undefined {
  return (name) => headers[name];
}

const BODY = Buffer.from(JSON.stringify({ message: { type: "hang", call: { id: "call-1" } } }));

// ── 1. authentication policy ─────────────────────────────────────────────────

describe("webhookAuthPolicy", () => {
  const baseEnv = { [VAPI_WEBHOOK_SECRET_ENV_VAR]: SECRET };

  it("accepts a valid HMAC signature with the current secret", () => {
    const result = authenticateVapiWebhook({
      rawBody: BODY,
      header: headerFn(hmacHeaders(SECRET, BODY)),
      env: baseEnv,
      now: () => NOW_MS,
    });
    expect(result).toEqual({ ok: true, mode: "hmac" });
  });

  it("accepts the previous secret during a rotation overlap and reports the mode", () => {
    const result = authenticateVapiWebhook({
      rawBody: BODY,
      header: headerFn(hmacHeaders(PREVIOUS, BODY)),
      env: { ...baseEnv, [VAPI_WEBHOOK_SECRET_PREVIOUS_ENV_VAR]: PREVIOUS },
      now: () => NOW_MS,
    });
    expect(result).toEqual({ ok: true, mode: "hmac_previous" });
  });

  it("rejects a signature that matches neither secret", () => {
    const result = authenticateVapiWebhook({
      rawBody: BODY,
      header: headerFn(hmacHeaders("some-entirely-different-secret", BODY)),
      env: { ...baseEnv, [VAPI_WEBHOOK_SECRET_PREVIOUS_ENV_VAR]: PREVIOUS },
      now: () => NOW_MS,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch", mechanism: "hmac" });
  });

  it("rejects a stale timestamp without consulting the previous secret", () => {
    const staleAt = NOW_MS - 10 * 60 * 1000; // 10 minutes old, tolerance is 5
    const result = authenticateVapiWebhook({
      rawBody: BODY,
      header: headerFn(hmacHeaders(SECRET, BODY, staleAt)),
      env: { ...baseEnv, [VAPI_WEBHOOK_SECRET_PREVIOUS_ENV_VAR]: PREVIOUS },
      now: () => NOW_MS,
    });
    expect(result).toEqual({ ok: false, reason: "timestamp_out_of_range", mechanism: "hmac" });
  });

  it("ignores a bearer header entirely when the bridge flag is off (HMAC-only default)", () => {
    const result = authenticateVapiWebhook({
      rawBody: BODY,
      header: headerFn({ [VAPI_BEARER_HEADER]: SECRET }),
      env: baseEnv,
      now: () => NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.mechanism).toBe("none");
  });

  it("accepts bearer (current and previous) only when the bridge flag is exactly 'true'", () => {
    const env = {
      ...baseEnv,
      [VAPI_WEBHOOK_SECRET_PREVIOUS_ENV_VAR]: PREVIOUS,
      [VAPI_WEBHOOK_ALLOW_BEARER_ENV_VAR]: "true",
    };
    expect(
      authenticateVapiWebhook({ rawBody: BODY, header: headerFn({ [VAPI_BEARER_HEADER]: SECRET }), env, now: () => NOW_MS }),
    ).toEqual({ ok: true, mode: "bearer" });
    expect(
      authenticateVapiWebhook({ rawBody: BODY, header: headerFn({ [VAPI_BEARER_HEADER]: PREVIOUS }), env, now: () => NOW_MS }),
    ).toEqual({ ok: true, mode: "bearer_previous" });
    // "TRUE" is not "true" — fail-closed exactness, like every other flag here.
    expect(
      authenticateVapiWebhook({
        rawBody: BODY,
        header: headerFn({ [VAPI_BEARER_HEADER]: SECRET }),
        env: { ...env, [VAPI_WEBHOOK_ALLOW_BEARER_ENV_VAR]: "TRUE" },
        now: () => NOW_MS,
      }).ok,
    ).toBe(false);
  });

  it("judges a request that attempts HMAC on HMAC alone, even when a valid bearer rides along", () => {
    const headers = {
      ...hmacHeaders("wrong-secret-value-entirely", BODY),
      [VAPI_BEARER_HEADER]: SECRET,
    };
    const result = authenticateVapiWebhook({
      rawBody: BODY,
      header: headerFn(headers),
      env: { ...baseEnv, [VAPI_WEBHOOK_ALLOW_BEARER_ENV_VAR]: "true" },
      now: () => NOW_MS,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch", mechanism: "hmac" });
  });

  it("reports not_configured when no secret is set", () => {
    const result = authenticateVapiWebhook({ rawBody: BODY, header: headerFn({}), env: {}, now: () => NOW_MS });
    expect(result).toEqual({ ok: false, reason: "not_configured", mechanism: "none" });
  });
});

// ── 2. parser extensions ─────────────────────────────────────────────────────

describe("vapiServerMessage boundary extraction", () => {
  it("extracts call.startedAt/endedAt and durationSeconds when valid", () => {
    const parsed = parseVapiServerMessage({
      message: {
        type: "end-of-call-report",
        durationSeconds: 61.4,
        call: {
          id: "call-9",
          assistantId: "asst-1",
          startedAt: "2026-08-30T11:00:00.000Z",
          endedAt: "2026-08-30T11:01:01.000Z",
        },
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.message.startedAtIso).toBe("2026-08-30T11:00:00.000Z");
      expect(parsed.message.endedAtIso).toBe("2026-08-30T11:01:01.000Z");
      expect(parsed.message.durationSeconds).toBeCloseTo(61.4);
    }
  });

  it("silently ignores unparseable boundaries and negative/NaN durations", () => {
    const parsed = parseVapiServerMessage({
      message: {
        type: "end-of-call-report",
        durationSeconds: -5,
        call: { id: "call-9", startedAt: "not-a-date", endedAt: 12345 },
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.message.startedAtIso).toBeUndefined();
      expect(parsed.message.endedAtIso).toBeUndefined();
      expect(parsed.message.durationSeconds).toBeUndefined();
    }
  });
});

// ── 3. event-key + fold ──────────────────────────────────────────────────────

function msg(partial: Partial<ParsedVapiMessage> & { type: ParsedVapiMessage["type"] }): ParsedVapiMessage {
  return { call: { id: "call-1", assistantId: "asst-1" }, ...partial } as ParsedVapiMessage;
}

function stored(message: ParsedVapiMessage, atIso: string): StoredVapiEvent {
  return { type: message.type, message, createdAt: new Date(atIso) };
}

describe("event key + call-state fold", () => {
  it("collapses identical redeliveries but distinguishes content-updated reports", () => {
    const first = msg({ type: "end-of-call-report", transcript: "hello" });
    const retry = msg({ type: "end-of-call-report", transcript: "hello" });
    const updated = msg({ type: "end-of-call-report", transcript: "hello", summary: "analysis arrived" });
    expect(buildVapiEventKey(first)).toBe(buildVapiEventKey(retry));
    expect(buildVapiEventKey(first)).not.toBe(buildVapiEventKey(updated));
  });

  it("folds a full lifecycle, marks hasEndOfCallReport, and prefers provider duration", () => {
    const record = foldEventsIntoCallRecord("call-1", [
      stored(msg({ type: "status-update", status: "ringing" }), "2026-08-30T11:00:00Z"),
      stored(msg({ type: "status-update", status: "in-progress" }), "2026-08-30T11:00:05Z"),
      stored(
        msg({
          type: "end-of-call-report",
          endedReason: "customer-ended-call",
          transcript: "t",
          startedAtIso: "2026-08-30T11:00:03.000Z",
          endedAtIso: "2026-08-30T11:01:33.000Z",
        }),
        "2026-08-30T11:02:00Z",
      ),
    ]);
    expect(record).not.toBeNull();
    expect(record!.state).toBe("completed");
    expect(record!.isFinal).toBe(true);
    expect(record!.hasEndOfCallReport).toBe(true);
    expect(record!.providerDurationSec).toBe(90);
  });

  it("leaves hasEndOfCallReport false when only a terminal status-update arrived", () => {
    const record = foldEventsIntoCallRecord("call-1", [
      stored(msg({ type: "status-update", status: "in-progress" }), "2026-08-30T11:00:00Z"),
      stored(msg({ type: "status-update", status: "ended", endedReason: "customer-ended-call" }), "2026-08-30T11:01:00Z"),
    ]);
    expect(record!.isFinal).toBe(true);
    expect(record!.hasEndOfCallReport).toBe(false);
    expect(record!.providerDurationSec).toBeUndefined();
  });

  it("never regresses a final state on a late out-of-order status-update", () => {
    const record = foldEventsIntoCallRecord("call-1", [
      stored(msg({ type: "end-of-call-report", endedReason: "customer-ended-call" }), "2026-08-30T11:01:00Z"),
      stored(msg({ type: "status-update", status: "in-progress" }), "2026-08-30T11:01:30Z"),
    ]);
    expect(record!.state).toBe("completed");
    expect(record!.isFinal).toBe(true);
  });
});

// ── 4. reconciliation ────────────────────────────────────────────────────────

function callRecord(overrides: Partial<RealCallRecord>): RealCallRecord {
  const base: RealCallRecord = {
    callId: "call-1",
    assistantId: "asst-1",
    provider: "vapi",
    source: "vapi_twilio",
    state: "in_progress",
    isFinal: false,
    callerNumberDisplay: "•••• 1234",
    firstEventAt: new Date("2026-08-30T10:00:00Z"),
    lastEventAt: new Date("2026-08-30T10:00:00Z"),
    endedAt: undefined,
    durationSec: undefined,
    endedReason: undefined,
    transcript: undefined,
    summary: undefined,
    analysisAvailability: "unavailable",
    structuredOutcome: undefined,
    hasEndOfCallReport: false,
    providerDurationSec: undefined,
  };
  return { ...base, ...overrides };
}

describe("reconciliation", () => {
  const now = new Date("2026-08-30T12:00:00Z");

  it("is disabled unless the flag is exactly 'true'", () => {
    expect(isVoiceReconciliationEnabled({})).toBe(false);
    expect(isVoiceReconciliationEnabled({ [VOICE_RECONCILIATION_ENABLED_ENV_VAR]: "TRUE" })).toBe(false);
    expect(isVoiceReconciliationEnabled({ [VOICE_RECONCILIATION_ENABLED_ENV_VAR]: "true" })).toBe(true);
  });

  it("classifies a long-quiet non-final call as stale_in_progress", () => {
    const record = callRecord({ lastEventAt: new Date(now.getTime() - STALE_IN_PROGRESS_AFTER_MS - 1) });
    expect(classifyCallForReconciliation(record, now)).toMatchObject({ kind: "stale_in_progress" });
  });

  it("leaves a recently active non-final call alone", () => {
    const record = callRecord({ lastEventAt: new Date(now.getTime() - 60_000) });
    expect(classifyCallForReconciliation(record, now)).toBeUndefined();
  });

  it("flags a final call whose report never arrived after the grace period", () => {
    const endedAt = new Date(now.getTime() - MISSING_REPORT_AFTER_MS - 1);
    const record = callRecord({ isFinal: true, state: "completed", endedAt, hasEndOfCallReport: false });
    expect(classifyCallForReconciliation(record, now)).toMatchObject({ kind: "missing_report" });
  });

  it("does not flag a final call with a report, or one still inside the grace period", () => {
    const withReport = callRecord({
      isFinal: true,
      state: "completed",
      endedAt: new Date(now.getTime() - MISSING_REPORT_AFTER_MS * 2),
      hasEndOfCallReport: true,
    });
    expect(classifyCallForReconciliation(withReport, now)).toBeUndefined();
    const inGrace = callRecord({
      isFinal: true,
      state: "completed",
      endedAt: new Date(now.getTime() - 1000),
      hasEndOfCallReport: false,
    });
    expect(classifyCallForReconciliation(inGrace, now)).toBeUndefined();
  });

  it("sweeps with injected fakes: per-firm scoping, issue creation, and dedupe counting", async () => {
    const opened: Array<{ firmId: number; code: string; dedupeKey: string }> = [];
    let repeatMode = false;
    const summary1 = await runVoiceReconciliationOnce({
      now: () => now,
      listActiveFirmIds: async () => [1, 2],
      listCallsForFirm: async (firmId) =>
        firmId === 1
          ? [
              callRecord({ callId: "stale-1", lastEventAt: new Date(now.getTime() - STALE_IN_PROGRESS_AFTER_MS - 1) }),
              callRecord({ callId: "healthy", lastEventAt: new Date(now.getTime() - 1000) }),
            ]
          : [
              callRecord({
                callId: "no-report",
                isFinal: true,
                state: "completed",
                endedAt: new Date(now.getTime() - MISSING_REPORT_AFTER_MS - 1),
                hasEndOfCallReport: false,
              }),
            ],
      openIssue: async (input) => {
        opened.push({ firmId: input.firmId, code: input.code, dedupeKey: input.dedupeKey });
        return { issue: { id: opened.length } as never, created: !repeatMode };
      },
    });
    expect(summary1).toMatchObject({
      firmsExamined: 2,
      callsExamined: 3,
      staleInProgress: 1,
      missingReport: 1,
      issuesCreated: 2,
      issuesRepeated: 0,
    });
    expect(opened).toEqual([
      { firmId: 1, code: "call_stale_in_progress", dedupeKey: "stale-1" },
      { firmId: 2, code: "call_missing_report", dedupeKey: "no-report" },
    ]);

    repeatMode = true; // second sweep: the issue sink reports dedupe hits
    const summary2 = await runVoiceReconciliationOnce({
      now: () => now,
      listActiveFirmIds: async () => [1],
      listCallsForFirm: async () => [
        callRecord({ callId: "stale-1", lastEventAt: new Date(now.getTime() - STALE_IN_PROGRESS_AFTER_MS - 1) }),
      ],
      openIssue: async (input) => {
        opened.push({ firmId: input.firmId, code: input.code, dedupeKey: input.dedupeKey });
        return { issue: { id: 99 } as never, created: false };
      },
    });
    expect(summary2.issuesCreated).toBe(0);
    expect(summary2.issuesRepeated).toBe(1);
  });
});

// ── 5. server-URL attachment (disabled-by-default representation) ────────────

function catalogPreset(): RuntimeCatalogPreset {
  return {
    provider: "vapi",
    model: { provider: "test-model-provider", model: "test-model" },
    voice: { provider: "test-voice-provider", voiceId: "test-voice" },
    transcriber: { provider: "test-transcriber-provider", model: "test-transcriber", language: "en" },
  } as RuntimeCatalogPreset;
}

function catalog(): RuntimeCatalog {
  return { version: 1, presets: { "natural-balanced": catalogPreset() } } as RuntimeCatalog;
}

function assistantRow(): VoiceAssistant {
  return {
    id: 42,
    firmId: 7,
    name: "Front Desk",
    templateKey: "blank",
    status: "published",
    provider: "vapi",
    providerAssistantId: "prov-abc-123",
    config: {
      schemaVersion: 1,
      prompt: {
        firstMessageMode: "assistant-speaks-first",
        firstMessage: "Thanks for calling.",
        systemInstructions: "Answer politely and take a message.",
      },
      voiceModel: { preset: "natural-balanced" },
    },
    syncError: null,
    publishAttemptId: null,
    publishStartedAt: null,
    lastSyncedAt: null,
    providerConfigHash: null,
    providerSyncAttemptId: null,
    providerSyncStartedAt: null,
    providerSyncError: null,
    createdAt: new Date("2026-08-29T00:00:00Z"),
    updatedAt: new Date("2026-08-29T00:00:00Z"),
  } as VoiceAssistant;
}

const GOOD_URL = "https://staging.example.com/api/voice/webhooks/vapi";
const GOOD_SECRET = "webhook-secret-0123456789abcdef";
/** Invented fixture id — never a real provider credential. */
const GOOD_CREDENTIAL_ID = "11111111-2222-4333-8444-555555555555";
const CREDENTIAL_ID_ENV_VAR = "VAPI_WEBHOOK_CREDENTIAL_ID";

describe("serverConfig", () => {
  it("returns null when the attach flag is off (the default)", () => {
    expect(loadVoiceServerConfigFromEnv({})).toBeNull();
    expect(isVoiceWebhookAttachEnabled({})).toBe(false);
    expect(loadVoiceServerConfigFromEnv({ [VOICE_WEBHOOK_ATTACH_ENABLED_ENV_VAR]: "TRUE" })).toBeNull();
  });

  it("returns the validated url+credentialId when enabled and configured", () => {
    const config = loadVoiceServerConfigFromEnv({
      [VOICE_WEBHOOK_ATTACH_ENABLED_ENV_VAR]: "true",
      [VOICE_SERVER_URL_ENV_VAR]: GOOD_URL,
      [VOICE_SERVER_SECRET_ENV_VAR]: GOOD_SECRET,
      [CREDENTIAL_ID_ENV_VAR]: GOOD_CREDENTIAL_ID,
    });
    expect(config).toEqual({ url: GOOD_URL, credentialId: GOOD_CREDENTIAL_ID });
    // H1: the webhook secret is a precondition, never part of the config.
    expect(JSON.stringify(config)).not.toContain(GOOD_SECRET);
  });

  it("fails closed on every invalid enabled configuration", () => {
    const base = {
      [VOICE_WEBHOOK_ATTACH_ENABLED_ENV_VAR]: "true",
      [VOICE_SERVER_URL_ENV_VAR]: GOOD_URL,
      [VOICE_SERVER_SECRET_ENV_VAR]: GOOD_SECRET,
      [CREDENTIAL_ID_ENV_VAR]: GOOD_CREDENTIAL_ID,
    };
    const bad = [
      { ...base, [VOICE_SERVER_URL_ENV_VAR]: undefined },
      { ...base, [VOICE_SERVER_URL_ENV_VAR]: "not a url" },
      { ...base, [VOICE_SERVER_URL_ENV_VAR]: "http://staging.example.com/hook" },
      { ...base, [VOICE_SERVER_URL_ENV_VAR]: "https://staging.example.com/hook?x=1" },
      { ...base, [VOICE_SERVER_URL_ENV_VAR]: "https://user:pw@staging.example.com/hook" },
      { ...base, [VOICE_SERVER_SECRET_ENV_VAR]: "short" },
      { ...base, [VOICE_SERVER_SECRET_ENV_VAR]: undefined },
      // H1: missing, ambiguous, and malformed credential references.
      { ...base, [CREDENTIAL_ID_ENV_VAR]: undefined },
      { ...base, [CREDENTIAL_ID_ENV_VAR]: "   " },
      { ...base, [CREDENTIAL_ID_ENV_VAR]: `${GOOD_CREDENTIAL_ID},${GOOD_CREDENTIAL_ID}` },
      { ...base, [CREDENTIAL_ID_ENV_VAR]: `${GOOD_CREDENTIAL_ID} ${GOOD_CREDENTIAL_ID}` },
      { ...base, [CREDENTIAL_ID_ENV_VAR]: "short" },
      { ...base, [CREDENTIAL_ID_ENV_VAR]: "has/slash/and:colon" },
    ];
    for (const env of bad) {
      let thrown: unknown;
      try {
        loadVoiceServerConfigFromEnv(env as Record<string, string | undefined>);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(PublishFoundationError);
      expect((thrown as PublishFoundationError).code).toBe("SERVER_CONFIG_INVALID");
      // Never echo the configured value back.
      expect((thrown as PublishFoundationError).message).not.toContain("staging.example.com");
      expect((thrown as PublishFoundationError).message).not.toContain(GOOD_SECRET);
    }
  });

  it("threads into the sync provider input only when supplied, and shifts the payload hash", () => {
    const without = buildSyncProviderInput(assistantRow(), catalog());
    expect((without.config as Record<string, unknown>).server).toBeUndefined();

    const withServer = buildSyncProviderInput(assistantRow(), catalog(), {
      url: GOOD_URL,
      credentialId: GOOD_CREDENTIAL_ID,
    });
    expect((withServer.config as Record<string, unknown>).server).toEqual({
      url: GOOD_URL,
      credentialId: GOOD_CREDENTIAL_ID,
    });

    const hashWithout = computeProviderPayloadHash(without, "none");
    const hashWith = computeProviderPayloadHash(withServer, "none");
    expect(hashWithout).not.toBe(hashWith);
  });

  it("is accepted by the Vapi runtime-config validator and emitted in the request body", () => {
    const validated = validateVapiRuntimeConfig({
      model: { provider: "p", model: "m" },
      voice: { provider: "vp", voiceId: "vid" },
      transcriber: { provider: "tp" },
      firstMessageMode: "assistant-speaks-first",
      systemInstructions: "Hello.",
      server: { url: GOOD_URL, credentialId: GOOD_CREDENTIAL_ID },
    });
    expect(validated.server).toEqual({ url: GOOD_URL, credentialId: GOOD_CREDENTIAL_ID });

    const body = buildVapiAssistantRequestBody("Front Desk", validated, { recordingEnabled: false });
    expect(body.server).toEqual({ url: GOOD_URL, credentialId: GOOD_CREDENTIAL_ID });
    expect(JSON.stringify(body)).not.toContain(GOOD_SECRET);
  });

  it("rejects a legacy bearer server block instead of silently ignoring it", () => {
    expect(() =>
      validateVapiRuntimeConfig({
        model: { provider: "p", model: "m" },
        voice: { provider: "vp", voiceId: "vid" },
        transcriber: { provider: "tp" },
        firstMessageMode: "assistant-speaks-first",
        systemInstructions: "Hello.",
        server: { url: GOOD_URL, secret: GOOD_SECRET },
      }),
    ).toThrow();
  });

  it("rejects malformed server blocks in the Vapi validator", () => {
    const base = {
      model: { provider: "p", model: "m" },
      voice: { provider: "vp", voiceId: "vid" },
      transcriber: { provider: "tp" },
      firstMessageMode: "assistant-speaks-first",
      systemInstructions: "Hello.",
    };
    const bad = [
      { ...base, server: { url: "http://x.example/hook", secret: GOOD_SECRET } },
      { ...base, server: { url: GOOD_URL, secret: "short" } },
      { ...base, server: { url: GOOD_URL, secret: GOOD_SECRET, extra: true } },
      { ...base, server: "not-an-object" },
    ];
    for (const config of bad) {
      expect(() => validateVapiRuntimeConfig(config)).toThrow();
    }
  });
});
