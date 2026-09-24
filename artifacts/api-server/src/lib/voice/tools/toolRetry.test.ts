// What happens when the provider sends the SAME tool call twice.
//
// It does: a network hiccup, a timeout on their side, a model that repeats
// itself. Before this, a repeated book_appointment reached the availability
// recheck, found the slot occupied by the caller's OWN first request, and the
// caller was told "that time was just taken" about a booking that had in fact
// succeeded. A repeated reschedule was worse — the first attempt had already
// cancelled the original, so the caller was told their new time was gone and
// their old one no longer existed either.
//
// The provider's tool-call id is the idempotency key. Everything below is
// about one rule: a repeat is the same request, and the caller hears the same
// answer.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { dispatchToolCalls, type ToolCallContext, type ToolSchedulingDeps } from "./toolDispatcher.js";

const FIRM = 11;
const CTX: ToolCallContext = { provider: "vapi", providerCallId: "call_retry_1", assistantRowId: 9 };
const NOW = new Date("2027-05-03T16:00:00.000Z");

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    publicId: "11111111-2222-3333-4444-555555555555",
    firmId: FIRM,
    appointmentTypeId: 3,
    source: "ai_receptionist",
    status: "pending_review",
    requestedStartAt: new Date("2027-05-04T16:00:00.000Z"),
    requestedEndAt: new Date("2027-05-04T16:30:00.000Z"),
    timezone: "America/Los_Angeles",
    customerName: "Dana Rivera",
    customerEmail: null,
    customerPhone: "+14155550123",
    notes: null,
    phoneConsent: true,
    smsConsent: false,
    emailConsent: false,
    providerEventId: null,
    providerCalendarId: null,
    toolCallId: null,
    holdExpiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    cancelledAt: null,
    ...overrides,
  };
}

/**
 * A store keyed the way the real table is: one row per (firm, tool call), with
 * the slot occupied once something holds it. This is the behaviour the partial
 * unique index and the in-transaction lookup produce together.
 */
function schedulingDeps(options: { rescheduleCancelsFail?: boolean } = {}) {
  const byToolCall = new Map<string, ReturnType<typeof request>>();
  const occupiedSlots = new Set<number>();
  const confirmations: string[] = [];
  const cancelled: string[] = [];
  let nextId = 1;

  const deps: ToolSchedulingDeps = {
    authorizedCapabilities: () => ["scheduling"],
    now: () => NOW,
    getDayAvailability: async () => ({ dateKey: "2027-05-04", reason: "open", slots: [] }),
    getSchedulingContext: async () => ({ timezone: "America/Los_Angeles", types: [{ id: "3", name: "Consultation", durationMin: 30 }] }),
    findRequestByPublicId: async (_firmId, publicId) =>
      [...byToolCall.values()].find((r) => r.publicId === publicId) as never,
    submitAppointmentRequest: async (_firmId, _typeId, startUtc, contact, consent, _now, toolCallId) => {
      if (toolCallId !== undefined && byToolCall.has(toolCallId)) {
        return { ok: true, request: byToolCall.get(toolCallId) as never, duplicate: true };
      }
      if (occupiedSlots.has(startUtc.getTime())) return { ok: false, reason: "slot_no_longer_available" };
      occupiedSlots.add(startUtc.getTime());
      nextId += 1;
      const row = request({
        id: nextId,
        // A real UUID: the tool schema requires one, so a fixture that fakes
        // the shape would be rejected by validation before reaching the code
        // under test.
        publicId: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
        requestedStartAt: startUtc,
        customerName: contact.name,
        customerPhone: contact.phone,
        smsConsent: consent.smsConsent,
        toolCallId: toolCallId ?? null,
      });
      if (toolCallId !== undefined) byToolCall.set(toolCallId, row);
      return { ok: true, request: row as never };
    },
    cancelAppointmentRequestByPublicId: async (_firmId, publicId) => {
      if (options.rescheduleCancelsFail === true) return false;
      cancelled.push(publicId);
      const row = [...byToolCall.values()].find((r) => r.publicId === publicId);
      if (row) {
        row.status = "cancelled";
        occupiedSlots.delete(row.requestedStartAt.getTime());
      }
      return row !== undefined;
    },
    enqueueBookingConfirmation: async (input) => {
      confirmations.push(input.requestPublicId);
      return undefined;
    },
  };
  return { deps, confirmations, cancelled, byToolCall, occupiedSlots };
}

const BOOK_ARGS = {
  appointmentTypeId: "3",
  startIso: "2027-05-04T16:00:00.000Z",
  customerName: "Dana Rivera",
  customerPhone: "+14155550123",
  smsConsent: true,
};

describe("a repeated booking tool call", () => {
  it("returns the same reference instead of reporting a conflict", async () => {
    const h = schedulingDeps();
    const call = { toolCallId: "tc_book_1", name: "book_appointment", args: BOOK_ARGS };

    const first = await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    const second = await dispatchToolCalls(FIRM, [call], CTX, h.deps);

    const reference = /Reference id (\S+?)\./.exec(first[0]!.result)?.[1];
    expect(reference).toBeDefined();
    // The defect: the repeat used to hit the availability recheck and be told
    // the slot was gone — taken by the caller's own first request.
    expect(second[0]!.result).not.toMatch(/just taken/i);
    expect(second[0]!.result).toContain(reference!);
  });

  it("says it is the same request, not a second one", async () => {
    const h = schedulingDeps();
    const call = { toolCallId: "tc_book_2", name: "book_appointment", args: BOOK_ARGS };
    await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    const [again] = await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    expect(again!.result).toMatch(/already requested/i);
    expect(again!.result).toMatch(/same request/i);
  });

  it("still never claims the appointment is booked", async () => {
    const h = schedulingDeps();
    const call = { toolCallId: "tc_book_3", name: "book_appointment", args: BOOK_ARGS };
    await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    const [again] = await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    expect(again!.result).toMatch(/do not say it is booked/i);
  });

  it("does not send the caller a second confirmation", async () => {
    const h = schedulingDeps();
    const call = { toolCallId: "tc_book_4", name: "book_appointment", args: BOOK_ARGS };
    await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    // Two texts about one appointment reads as two appointments.
    expect(h.confirmations).toHaveLength(1);
  });

  it("still refuses a genuinely taken slot from a different tool call", async () => {
    const h = schedulingDeps();
    await dispatchToolCalls(FIRM, [{ toolCallId: "tc_a", name: "book_appointment", args: BOOK_ARGS }], CTX, h.deps);
    const [other] = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "tc_b", name: "book_appointment", args: { ...BOOK_ARGS, customerName: "Someone Else" } }],
      CTX,
      h.deps,
    );
    // Idempotency must not become "every booking succeeds".
    expect(other!.result).toMatch(/just taken/i);
  });
});

describe("a repeated reschedule tool call", () => {
  const RESCHEDULE = {
    toolCallId: "tc_move_1",
    name: "reschedule_appointment",
    args: { requestId: "", newStartIso: "2027-05-05T17:00:00.000Z" },
  };

  async function bookThen(h: ReturnType<typeof schedulingDeps>) {
    const [booked] = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "tc_seed", name: "book_appointment", args: BOOK_ARGS }],
      CTX,
      h.deps,
    );
    return /Reference id (\S+?)\./.exec(booked!.result)![1]!;
  }

  it("does not tell the caller their new time was taken by their own move", async () => {
    const h = schedulingDeps();
    const requestId = await bookThen(h);
    const call = { ...RESCHEDULE, args: { ...RESCHEDULE.args, requestId } };

    const first = await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    const second = await dispatchToolCalls(FIRM, [call], CTX, h.deps);

    expect(first[0]!.result).toMatch(/requested, not yet confirmed/i);
    expect(second[0]!.result).not.toMatch(/just taken/i);
    expect(second[0]!.result).toMatch(/already moved/i);
  });

  it("repeats the same new reference", async () => {
    const h = schedulingDeps();
    const requestId = await bookThen(h);
    const call = { ...RESCHEDULE, args: { ...RESCHEDULE.args, requestId } };
    const first = await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    const second = await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    const newRef = /New reference id (\S+?)\./.exec(first[0]!.result)?.[1];
    expect(newRef).toBeDefined();
    expect(second[0]!.result).toContain(newRef!);
  });

  it("does not cancel anything a second time", async () => {
    const h = schedulingDeps();
    const requestId = await bookThen(h);
    const call = { ...RESCHEDULE, args: { ...RESCHEDULE.args, requestId } };
    await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    const cancelledAfterFirst = [...h.cancelled];
    await dispatchToolCalls(FIRM, [call], CTX, h.deps);
    expect(h.cancelled).toEqual(cancelledAfterFirst);
  });

  it("preserves the original when the replacement cannot be created", async () => {
    // The property that matters most: a failed move must never leave the
    // caller with nothing. The original is only released after the replacement
    // exists.
    const h = schedulingDeps();
    const requestId = await bookThen(h);
    const [result] = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "tc_move_conflict", name: "reschedule_appointment", args: { requestId, newStartIso: "2027-05-04T16:00:00.000Z" } }],
      CTX,
      h.deps,
    );
    expect(result!.result).toMatch(/just taken/i);
    // Nothing was cancelled, so the caller still holds the appointment they had.
    expect(h.cancelled).toEqual([]);
    const original = [...h.byToolCall.values()].find((r) => r.publicId === requestId);
    expect(original?.status).toBe("pending_review");
  });

  it("releases the replacement and keeps the original when the old one cannot be cancelled", async () => {
    const h = schedulingDeps({ rescheduleCancelsFail: true });
    const seeded = schedulingDeps();
    const requestId = await bookThen(seeded);
    // Reuse the seeded store so the original exists, but with a failing cancel.
    h.byToolCall.set("tc_seed", seeded.byToolCall.get("tc_seed")!);
    const [result] = await dispatchToolCalls(
      FIRM,
      [{ toolCallId: "tc_move_2", name: "reschedule_appointment", args: { requestId, newStartIso: "2027-05-06T17:00:00.000Z" } }],
      CTX,
      h.deps,
    );
    expect(result!.result).toMatch(/couldn't find the original/i);
    expect(result!.result).not.toMatch(/rescheduled|confirmed/i);
  });
});
