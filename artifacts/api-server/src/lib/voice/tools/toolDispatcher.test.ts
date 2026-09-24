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
import {
  CAPABILITY_BY_TOOL,
  TOOL_CAPABILITIES,
  VOICE_TOOLS_CAPABILITIES_ENV_VAR,
} from "./toolCapabilities.js";
import type { SchedulingAppointmentRequest } from "@workspace/db/schema/scheduling";

const FIRM = 7;

// The call context the WEBHOOK establishes. Present in every dispatch here
// because the dispatcher must never be able to obtain it from tool arguments.
const CTX = { provider: "vapi", providerCallId: "call_test_1", assistantRowId: 11 } as const;
const NOW = new Date("2026-08-31T15:00:00.000Z");
const SERVER = { url: "https://staging.example.com/api/voice/webhooks/vapi", credentialId: "cred-0123456789abcdef" };

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
    // These cases exercise DISPATCH, so both capabilities are authorized here.
    // The gate itself — including that an absent allowlist authorizes nothing —
    // has its own cases below.
    authorizedCapabilities: () => ["messages", "scheduling"],
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
    const results = await dispatchToolCalls(FIRM, [{ toolCallId: "t1", name: "transfer_money", args: {} }], CTX, deps);
    expect(results).toHaveLength(1);
    expect(results[0]!.result).toContain("office");
    expect(log.submits).toHaveLength(0);
  });

  it("rejects invalid arguments, opens a diagnostic issue, and answers safely", async () => {
    const { deps, log } = makeDeps();
    const results = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "t1", name: "book_appointment", args: { appointmentTypeId: "3" } }],
      CTX,
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
      CTX,
      deps,
    );
    const spoken = results[0]!.result;
    // 14:00Z on Sep 1 2026 is 10:00 AM in America/New_York (EDT).
    expect(spoken).toContain("10:00 AM");
    expect(spoken).toContain("2026-09-01T14:00:00.000Z");
    expect(spoken).toContain("Consultation");
  });

  // Staging, 17 Sept: the answer named the type but not its id, the model
  // invented "TEST" from "[TEST] Consultation", and every booking was refused.
  it("states the appointment type id to book with, and asks for the caller's confirmation first", async () => {
    const { deps } = makeDeps();
    const results = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "t1", name: "check_availability", args: { date: "2026-09-01" } }],
      CTX,
      deps,
    );
    expect(results[0]!.result).toContain("appointment type id 3");
    expect(results[0]!.result).toContain('appointmentTypeId "3"');
    expect(results[0]!.result).toMatch(/after the caller confirms/i);
  });

  // Staging, 17 Sept: the model asked for 2024-09-22 instead of 2026 and the
  // caller was told the office was closed.
  it("a date that has passed is refused with today's date, not reported as a closure", async () => {
    const lookups: string[] = [];
    const { deps } = makeDeps({
      getDayAvailability: async (_f, date) => {
        lookups.push(date);
        return { dateKey: date, reason: "outside_hours", slots: [] };
      },
    });
    const results = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "t1", name: "check_availability", args: { date: "2024-09-22" } }],
      CTX,
      deps,
    );
    // NOW is 2026-08-31 15:00Z, which is 11:00 on 31 August in New York.
    expect(results[0]!.result).toContain("2024-09-22 has already passed");
    expect(results[0]!.result).toContain("Monday, August 31, 2026 (2026-08-31)");
    expect(results[0]!.result).not.toMatch(/closed/i);
    expect(lookups).toEqual([]);
  });

  it("a refused type id is answered with the ids that do exist", async () => {
    const { deps, log } = makeDeps({
      submitAppointmentRequest: async () => ({ ok: false, reason: "unknown_appointment_type" }),
    });
    const results = await dispatchToolCalls(
      FIRM,
      [
        {
          toolCallId: "t1",
          name: "book_appointment",
          args: { appointmentTypeId: "TEST", startIso: "2026-09-01T14:00:00.000Z", customerName: "Pat Caller" },
        },
      ],
      CTX,
      deps,
    );
    expect(results[0]!.result).toContain("Consultation (30 minutes, id 3)");
    expect(results[0]!.result).not.toMatch(/booked|confirmed/i);
    expect(log.submits).toHaveLength(0);
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
      CTX,
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
      CTX,
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
      CTX,
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
      CTX,
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
    // V8: the property is that the caller is NOT told the change is done. These
    // rows are `pending_review` until a human accepts them, and a caller told
    // "rescheduled" turns up at a time nobody confirmed. The old assertion
    // pinned the word "Rescheduled", which asserted the defect.
    expect(results[0]!.result).toMatch(/requested/i);
    expect(results[0]!.result).toMatch(/not yet confirmed/i);
    expect(results[0]!.result).not.toMatch(/^Rescheduled/);
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
      CTX,
      deps,
    );
    expect(log.cancels).toEqual([OLD.publicId, NEW_PUBLIC]);
    expect(results[0]!.result).toContain("couldn't find the original");
  });

  // J3 / H-1: a confirmed appointment could not be cancelled or moved by the
  // caller — the pending-only cancel answered "couldn't find".
  it("cancels a BOOKED appointment through the calendar service, not the pending-only cancel", async () => {
    const BOOKED = requestRow({ publicId: "66666666-6666-4666-8666-666666666666", status: "booked" });
    const booked: string[] = [];
    const { deps, log } = makeDeps({
      findRequestByPublicId: async () => BOOKED,
      cancelBookedRequest: async (_f, publicId) => {
        booked.push(publicId);
        return "cancelled";
      },
    });
    const [r] = await dispatchToolCalls(FIRM, [{ toolCallId: "t1", name: "cancel_appointment", args: { requestId: BOOKED.publicId } }], CTX, deps);
    expect(booked).toEqual([BOOKED.publicId]);
    expect(log.cancels).toEqual([]);
    expect(r!.result).toMatch(/cancelled and taken out of the calendar/);
  });

  it("never tells the caller a booked appointment is cancelled when the cancel did not happen", async () => {
    const BOOKED = requestRow({ status: "booked" });
    const { deps } = makeDeps({ findRequestByPublicId: async () => BOOKED, cancelBookedRequest: async () => "conflict" });
    const [r] = await dispatchToolCalls(FIRM, [{ toolCallId: "t1", name: "cancel_appointment", args: { requestId: BOOKED.publicId } }], CTX, deps);
    expect(r!.result).toMatch(/do not tell the caller it is cancelled/);
  });

  it("a repeated cancel of an already-cancelled appointment says so, not 'couldn't find'", async () => {
    const GONE = requestRow({ status: "cancelled" });
    const { deps, log } = makeDeps({ findRequestByPublicId: async () => GONE });
    const [r] = await dispatchToolCalls(FIRM, [{ toolCallId: "t1", name: "cancel_appointment", args: { requestId: GONE.publicId } }], CTX, deps);
    expect(r!.result).toBe("That appointment is already cancelled.");
    expect(log.cancels).toEqual([]);
  });

  it("moves a BOOKED appointment only when the new time is confirmed, then releases the original", async () => {
    const OLD = requestRow({ publicId: "77777777-7777-4777-8777-777777777777", status: "booked" });
    const order: string[] = [];
    const { deps, log } = makeDeps({
      findRequestByPublicId: async () => OLD,
      confirmRequest: async (_f, id) => {
        order.push("confirm:" + id);
        return "booked";
      },
      cancelBookedRequest: async (_f, id) => {
        order.push("release:" + id);
        return "cancelled";
      },
    });
    const [r] = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "t1", name: "reschedule_appointment", args: { requestId: OLD.publicId, newStartIso: "2026-09-01T15:00:00.000Z" } }],
      CTX,
      deps,
    );
    expect(order).toEqual(["confirm:" + requestRow().publicId, "release:" + OLD.publicId]);
    expect(log.cancels).toEqual([]);
    expect(r!.result).toMatch(/Moved and confirmed/);
  });

  it("keeps the caller's confirmed appointment when the new time cannot be confirmed", async () => {
    const OLD = requestRow({ publicId: "88888888-8888-4888-8888-888888888888", status: "booked" });
    const released: string[] = [];
    const { deps, log } = makeDeps({
      findRequestByPublicId: async () => OLD,
      confirmRequest: async () => "no_connection",
      cancelBookedRequest: async (_f, id) => {
        released.push(id);
        return "cancelled";
      },
    });
    const [r] = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "t1", name: "reschedule_appointment", args: { requestId: OLD.publicId, newStartIso: "2026-09-01T15:00:00.000Z" } }],
      CTX,
      deps,
    );
    expect(released).toEqual([]);
    expect(log.cancels).toEqual([requestRow().publicId]); // the unconfirmed replacement is released
    expect(r!.result).toMatch(/keeps their current appointment/);
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
      CTX,
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

  it("emits exactly the named tools with per-tool server attachment", () => {
    const defs = buildVoiceToolDefinitions(SERVER, TOOL_NAMES);
    expect(defs).toHaveLength(TOOL_NAMES.length);
    for (const def of defs) {
      expect(def.type).toBe("function");
      const fn = def.function as Record<string, unknown>;
      expect(TOOL_NAMES).toContain(fn.name);
      expect(typeof fn.description).toBe("string");
      const params = fn.parameters as Record<string, unknown>;
      expect(params.type).toBe("object");
      expect(params.additionalProperties).toBe(false);
      expect(def.server).toEqual({ url: SERVER.url, credentialId: SERVER.credentialId });
    }
  });

  // V7. The hazard this guards: before capability gating, the single
  // VOICE_TOOLS_ATTACH_ENABLED flag attached the WHOLE catalog, so turning on
  // finished message-taking would also have published four scheduling actions.
  describe("capability gating", () => {
    const ON = { [VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR]: "true" };

    it("maps every catalog tool to exactly one capability", () => {
      for (const name of TOOL_NAMES) {
        expect(TOOL_CAPABILITIES).toContain(CAPABILITY_BY_TOOL[name]);
      }
    });

    it("attaches only the authorized capability, not the whole catalog", () => {
      const defs = loadVoiceToolsConfigFromEnv(SERVER, {
        ...ON,
        [VOICE_TOOLS_CAPABILITIES_ENV_VAR]: "messages",
      });
      const names = (defs ?? []).map((d) => (d.function as Record<string, unknown>).name);
      expect(names).toEqual(["save_message"]);
      expect(names).not.toContain("book_appointment");
    });

    it("orders and de-duplicates the allowlist so the payload hash is stable", () => {
      const a = loadVoiceToolsConfigFromEnv(SERVER, {
        ...ON,
        [VOICE_TOOLS_CAPABILITIES_ENV_VAR]: " Scheduling , messages ,scheduling",
      });
      const b = loadVoiceToolsConfigFromEnv(SERVER, {
        ...ON,
        [VOICE_TOOLS_CAPABILITIES_ENV_VAR]: "messages,scheduling",
      });
      expect(a).toEqual(b);
      expect(a).toHaveLength(TOOL_NAMES.length);
    });

    it("fails closed when the allowlist is absent, empty, or unknown", () => {
      for (const value of [undefined, "", "   ", ",,", "bookings", "messages,bookings"]) {
        const env = value === undefined ? { ...ON } : { ...ON, [VOICE_TOOLS_CAPABILITIES_ENV_VAR]: value };
        let thrown: unknown;
        try {
          loadVoiceToolsConfigFromEnv(SERVER, env);
        } catch (err) {
          thrown = err;
        }
        expect(thrown, `value ${JSON.stringify(value)} must fail closed`).toBeInstanceOf(PublishFoundationError);
        expect((thrown as PublishFoundationError).code).toBe("TOOLS_CONFIG_INVALID");
      }
    });

    it("still attaches nothing at all while the master switch is off", () => {
      expect(
        loadVoiceToolsConfigFromEnv(SERVER, { [VOICE_TOOLS_CAPABILITIES_ENV_VAR]: "messages,scheduling" }),
      ).toBeNull();
    });
  });

  it("passes the Vapi validator and reaches the request body verbatim", () => {
    const tools = buildVoiceToolDefinitions(SERVER, TOOL_NAMES);
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

    // Vapi puts function tools INSIDE the model. A top-level `tools` property
    // is refused with "property tools should not exist" — verified against the
    // live API on 2026-09-12. This assertion previously pinned the top-level
    // placement, which no live request had ever exercised because the tools
    // attachment had never been enabled.
    expect(body.tools).toBeUndefined();
    expect((body.model as Record<string, unknown>).tools).toEqual(tools);
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
    const goodTool = buildVoiceToolDefinitions(SERVER, TOOL_NAMES)[0]!;
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
