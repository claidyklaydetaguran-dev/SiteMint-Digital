// P3 — tools & scheduling action loop: parser extraction, batch event keys,
// the constrained dispatcher (validation, redaction, compensation), the
// disabled-by-default tools attachment, and the provider-side validator.
// Everything runs against injected fakes; no database is ever touched.

import { describe, expect, it, vi } from "vitest";

// Hoisted: schema type imports are erased, but keep the guard in case a
// future edit adds a value import (repo pattern).
vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { parseVapiServerMessage } from "../webhooks/vapiServerMessage.js";
import { buildVapiEventKey } from "../webhooks/eventKey.js";
import {
  dispatchToolCalls,
  type ToolSchedulingDeps,
} from "./toolDispatcher.js";
import {
  buildVoiceToolDefinitions,
  isVoiceToolsAttachEnabled,
  loadVoiceToolsConfigFromEnv,
  VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR,
} from "../../voicePublishing/toolsConfig.js";
import { PublishFoundationError } from "../../voicePublishing/errors.js";
import { validateVapiRuntimeConfig } from "../providers/vapi/types.js";
import { buildVapiAssistantRequestBody } from "../providers/vapi/mapper.js";
import { TOOL_NAMES } from "./toolCatalog.js";
import type { SchedulingAppointmentRequest } from "@workspace/db/schema/scheduling";

const FIRM = 7;
const NOW = new Date("2026-08-31T15:00:00.000Z");
const SERVER = { url: "https://staging.example.com/api/voice/webhooks/vapi", secret: "webhook-secret-0123456789abcdef" };

function requestRow(overrides: Partial<SchedulingAppointmentRequest> = {}): SchedulingAppointmentRequest {
  return {
    id: 1,
    publicId: "11111111-1111-4111-8111-111111111111",
    firmId: FIRM,
    appointmentTypeId: 3,
    source: "ai_receptionist",
    status: "pending_review",
    requestedStartAt: new Date("2026-09-01T14:00:00.000Z"),
    requestedEndAt: new Date("2026-09-01T14:30:00.000Z"),
    timezone: "America/New_York",
    customerName: "Pat Caller",
    customerEmail: "pat@example.com",
    customerPhone: "+15550001111",
    phoneConsent: true,
    smsConsent: true,
    emailConsent: false,
    holdExpiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as SchedulingAppointmentRequest;
}

interface CallLog {
  submits: Array<{ typeId: string; startIso: string; contact: { name: string; phone: string | null; email: string | null } }>;
  cancels: string[];
  issues: Array<{ code: string; level: string }>;
}

function makeDeps(overrides: Partial<ToolSchedulingDeps> = {}): { deps: ToolSchedulingDeps; log: CallLog } {
  const log: CallLog = { submits: [], cancels: [], issues: [] };
  const deps: ToolSchedulingDeps = {
    now: () => NOW,
    getSchedulingContext: async () => ({
      timezone: "America/New_York",
      types: [
        { id: "3", name: "Consultation", durationMin: 30 },
        { id: "4", name: "Follow-up", durationMin: 15 },
      ],
    }),
    getDayAvailability: async () => ({
      dateKey: "2026-09-01",
      reason: "open",
      slots: [
        { startUtc: new Date("2026-09-01T14:00:00.000Z"), endUtc: new Date("2026-09-01T14:30:00.000Z"), availability: "available" },
        { startUtc: new Date("2026-09-01T15:00:00.000Z"), endUtc: new Date("2026-09-01T15:30:00.000Z"), availability: "available" },
      ],
    }),
    findRequestByPublicId: async () => undefined,
    submitAppointmentRequest: async (_firmId, typeId, startUtc, contact) => {
      log.submits.push({ typeId, startIso: startUtc.toISOString(), contact });
      return { ok: true, request: requestRow() };
    },
    cancelAppointmentRequestByPublicId: async (_firmId, publicId) => {
      log.cancels.push(publicId);
      return true;
    },
    openIssue: async (input) => {
      log.issues.push({ code: input.code, level: input.level });
      return {};
    },
    ...overrides,
  };
  return { deps, log };
}

// ── parser + event key ───────────────────────────────────────────────────────

describe("tool-calls parsing", () => {
  it("extracts nested, flattened, and JSON-string-argument shapes; drops malformed entries", () => {
    const parsed = parseVapiServerMessage({
      message: {
        type: "tool-calls",
        call: { id: "call-1", assistantId: "asst-1" },
        toolCallList: [
          { id: "a", function: { name: "check_availability", arguments: { date: "2026-09-01" } } },
          { id: "b", name: "cancel_appointment", arguments: '{"requestId":"x"}' },
          { id: "c", function: { name: "book_appointment", arguments: "not json" } },
          { id: "", function: { name: "ghost", arguments: {} } },
          { id: "d" },
          "garbage",
        ],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.message.toolCallList).toEqual([
      { id: "a", name: "check_availability", arguments: { date: "2026-09-01" } },
      { id: "b", name: "cancel_appointment", arguments: { requestId: "x" } },
      { id: "c", name: "book_appointment", arguments: undefined },
    ]);
  });

  it("keys a batch by its sorted tool-call ids — redelivery collapses, distinct batches differ", () => {
    const base = { call: { id: "call-1" } };
    const p1 = parseVapiServerMessage({
      message: { type: "tool-calls", ...base, toolCallList: [{ id: "b", function: { name: "x" } }, { id: "a", function: { name: "x" } }] },
    });
    const p2 = parseVapiServerMessage({
      message: { type: "tool-calls", ...base, toolCallList: [{ id: "a", function: { name: "x" } }, { id: "b", function: { name: "x" } }] },
    });
    const p3 = parseVapiServerMessage({
      message: { type: "tool-calls", ...base, toolCallList: [{ id: "z", function: { name: "x" } }] },
    });
    if (!p1.ok || !p2.ok || !p3.ok) throw new Error("parse failed");
    expect(buildVapiEventKey(p1.message)).toBe(buildVapiEventKey(p2.message));
    expect(buildVapiEventKey(p1.message)).not.toBe(buildVapiEventKey(p3.message));
  });
});

// ── dispatcher ───────────────────────────────────────────────────────────────

describe("toolDispatcher", () => {
  it("refuses a name outside the closed catalog without touching any collaborator", async () => {
    const { deps, log } = makeDeps({
      getSchedulingContext: async () => {
        throw new Error("must not be called");
      },
    });
    const results = await dispatchToolCalls(FIRM, [{ toolCallId: "t1", name: "transfer_money", args: {} }], deps);
    expect(results).toHaveLength(1);
    expect(results[0]!.result).toContain("office");
    expect(log.submits).toHaveLength(0);
  });

  it("rejects invalid arguments, opens a diagnostic issue, and answers safely", async () => {
    const { deps, log } = makeDeps();
    const results = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "t1", name: "book_appointment", args: { appointmentTypeId: "3" } }],
      deps,
    );
    expect(results[0]!.result).toContain("office");
    expect(log.issues).toEqual([{ code: "tool_invalid_args", level: "info" }]);
    expect(log.submits).toHaveLength(0);
  });

  it("answers availability in the business timezone with bookable ISO slot values", async () => {
    const { deps } = makeDeps();
    const results = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "t1", name: "check_availability", args: { date: "2026-09-01" } }],
      deps,
    );
    const spoken = results[0]!.result;
    // 14:00Z on Sep 1 2026 is 10:00 AM in America/New_York (EDT).
    expect(spoken).toContain("10:00 AM");
    expect(spoken).toContain("2026-09-01T14:00:00.000Z");
    expect(spoken).toContain("Consultation");
  });

  it("books via the injected advisory-locked submit and never echoes contact details", async () => {
    const { deps, log } = makeDeps();
    const results = await dispatchToolCalls(
      FIRM,
      [
        {
          toolCallId: "t1",
          name: "book_appointment",
          args: {
            appointmentTypeId: "3",
            startIso: "2026-09-01T14:00:00.000Z",
            customerName: "Pat Caller",
            customerPhone: "+15550001111",
            customerEmail: "pat@example.com",
            smsConsent: true,
          },
        },
      ],
      deps,
    );
    const spoken = results[0]!.result;
    expect(log.submits).toEqual([
      {
        typeId: "3",
        startIso: "2026-09-01T14:00:00.000Z",
        contact: { name: "Pat Caller", phone: "+15550001111", email: "pat@example.com" },
      },
    ]);
    expect(spoken).toContain(requestRow().publicId);
    // Redaction: the provider-visible result must not echo PII.
    expect(spoken).not.toContain("Pat Caller");
    expect(spoken).not.toContain("+15550001111");
    expect(spoken).not.toContain("pat@example.com");
  });

  it("maps a lost race to a re-offer answer", async () => {
    const { deps } = makeDeps({
      submitAppointmentRequest: async () => ({ ok: false, reason: "slot_no_longer_available" }),
    });
    const results = await dispatchToolCalls(
      FIRM,
      [
        {
          toolCallId: "t1",
          name: "book_appointment",
          args: { appointmentTypeId: "3", startIso: "2026-09-01T14:00:00.000Z", customerName: "Pat" },
        },
      ],
      deps,
    );
    expect(results[0]!.result).toContain("just taken");
  });

  it("cancels by reference and reports an unknown reference honestly", async () => {
    const { deps } = makeDeps({
      cancelAppointmentRequestByPublicId: async (_f, publicId) =>
        publicId === "22222222-2222-4222-8222-222222222222",
    });
    const [ok, missing] = await dispatchToolCalls(
      FIRM,
      [
        { toolCallId: "t1", name: "cancel_appointment", args: { requestId: "22222222-2222-4222-8222-222222222222" } },
        { toolCallId: "t2", name: "cancel_appointment", args: { requestId: "33333333-3333-4333-8333-333333333333" } },
      ],
      deps,
    );
    expect(ok!.result).toContain("cancelled");
    expect(missing!.result).toContain("couldn't find");
  });

  it("reschedules preserving the original type and contact, then cancels the old reference", async () => {
    const OLD = requestRow({ publicId: "44444444-4444-4444-8444-444444444444", appointmentTypeId: 4, customerName: "Original Name" });
    const { deps, log } = makeDeps({
      findRequestByPublicId: async (_f, publicId) => (publicId === OLD.publicId ? OLD : undefined),
    });
    const results = await dispatchToolCalls(
      FIRM,
      [
        {
          toolCallId: "t1",
          name: "reschedule_appointment",
          args: { requestId: OLD.publicId, newStartIso: "2026-09-01T15:00:00.000Z" },
        },
      ],
      deps,
    );
    expect(log.submits).toEqual([
      {
        typeId: "4",
        startIso: "2026-09-01T15:00:00.000Z",
        contact: { name: "Original Name", phone: OLD.customerPhone, email: OLD.customerEmail },
      },
    ]);
    expect(log.cancels).toEqual([OLD.publicId]);
    expect(results[0]!.result).toContain("Rescheduled");
    expect(results[0]!.result).not.toContain("Original Name");
  });

  it("compensates when the old reference fails to cancel — the new hold is released", async () => {
    const OLD = requestRow({ publicId: "55555555-5555-4555-8555-555555555555" });
    const NEW_PUBLIC = requestRow().publicId;
    const { deps, log } = makeDeps({
      findRequestByPublicId: async () => OLD,
      cancelAppointmentRequestByPublicId: async (_f, publicId) => {
        log.cancels.push(publicId);
        return publicId !== OLD.publicId; // old fails, compensation succeeds
      },
    });
    // remove the default cancel logger duplication
    log.cancels.length = 0;
    const results = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "t1", name: "reschedule_appointment", args: { requestId: OLD.publicId, newStartIso: "2026-09-01T15:00:00.000Z" } }],
      deps,
    );
    expect(log.cancels).toEqual([OLD.publicId, NEW_PUBLIC]);
    expect(results[0]!.result).toContain("couldn't find the original");
  });

  it("turns an executor throw into the safe line plus an error-level issue", async () => {
    const { deps, log } = makeDeps({
      getDayAvailability: async () => {
        throw new Error("db exploded");
      },
    });
    const results = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "t1", name: "check_availability", args: { date: "2026-09-01" } }],
      deps,
    );
    expect(results[0]!.result).toContain("office will follow up");
    expect(log.issues).toEqual([{ code: "tool_execution_failed", level: "error" }]);
  });
});

// ── tools attachment (disabled by default) ───────────────────────────────────

describe("toolsConfig", () => {
  it("is off unless the flag is exactly 'true', and then requires the server attachment", () => {
    expect(isVoiceToolsAttachEnabled({})).toBe(false);
    expect(loadVoiceToolsConfigFromEnv(SERVER, {})).toBeNull();
    expect(loadVoiceToolsConfigFromEnv(SERVER, { [VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR]: "TRUE" })).toBeNull();

    let thrown: unknown;
    try {
      loadVoiceToolsConfigFromEnv(null, { [VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR]: "true" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PublishFoundationError);
    expect((thrown as PublishFoundationError).code).toBe("TOOLS_CONFIG_INVALID");
  });

  it("emits the whole closed catalog with per-tool server attachment", () => {
    const defs = buildVoiceToolDefinitions(SERVER);
    expect(defs).toHaveLength(TOOL_NAMES.length);
    for (const def of defs) {
      expect(def.type).toBe("function");
      const fn = def.function as Record<string, unknown>;
      expect(TOOL_NAMES).toContain(fn.name);
      expect(typeof fn.description).toBe("string");
      const params = fn.parameters as Record<string, unknown>;
      expect(params.type).toBe("object");
      expect(params.additionalProperties).toBe(false);
      expect(def.server).toEqual({ url: SERVER.url, secret: SERVER.secret });
    }
  });

  it("passes the Vapi validator and reaches the request body verbatim", () => {
    const tools = buildVoiceToolDefinitions(SERVER);
    const validated = validateVapiRuntimeConfig({
      model: { provider: "p", model: "m" },
      voice: { provider: "vp", voiceId: "vid" },
      transcriber: { provider: "tp" },
      firstMessageMode: "assistant-speaks-first",
      systemInstructions: "Hello.",
      server: SERVER,
      tools,
    });
    expect(validated.tools).toHaveLength(TOOL_NAMES.length);
    const body = buildVapiAssistantRequestBody("Front Desk", validated, { recordingEnabled: false });
    expect(body.tools).toEqual(tools);
  });

  it("rejects foreign names, missing server, extra keys, and oversized catalogs", () => {
    const base = {
      model: { provider: "p", model: "m" },
      voice: { provider: "vp", voiceId: "vid" },
      transcriber: { provider: "tp" },
      firstMessageMode: "assistant-speaks-first",
      systemInstructions: "Hello.",
      server: SERVER,
    };
    const goodTool = buildVoiceToolDefinitions(SERVER)[0]!;
    const foreign = { ...goodTool, function: { ...(goodTool.function as object), name: "wire_money" } };
    const extraKey = { ...goodTool, dangerous: true };
    const many = Array.from({ length: 9 }, () => goodTool);

    expect(() => validateVapiRuntimeConfig({ ...base, tools: [foreign] })).toThrow(/closed tool catalog/);
    expect(() => validateVapiRuntimeConfig({ ...base, tools: [extraKey] })).toThrow(/unsupported field/);
    expect(() => validateVapiRuntimeConfig({ ...base, tools: many })).toThrow(/1\.\.8/);
    const { server: _omit, ...noServer } = base;
    expect(() => validateVapiRuntimeConfig({ ...noServer, tools: [goodTool] })).toThrow(/requires "server"/);
  });
});
