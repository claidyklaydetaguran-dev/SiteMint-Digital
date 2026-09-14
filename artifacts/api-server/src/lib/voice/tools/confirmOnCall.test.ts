// Confirming an appointment while the caller is still on the line.
//
// Before this, the spoken flow could only ever create a request: the caller
// was told "the office will confirm" and a human had to press Approve. That is
// still what happens when the business has no calendar — but when it does, the
// call should finish the job.
//
// The rule that shapes it: the caller is told "booked" only when the same
// service the dashboard uses says `booked`. Every other answer — write refused,
// no calendar, and above all an UNANSWERED write — keeps the old words.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { dispatchToolCalls, type ToolCallContext, type ToolSchedulingDeps } from "./toolDispatcher.js";

const CTX: ToolCallContext = { provider: "vapi", providerCallId: "call_live_1", assistantRowId: 1 };

const FIRM = 4;
const PUBLIC_ID = "3f7c1f1e-9a7a-4e2f-8a11-2c4a6d9b5e10";
const START = "2027-05-04T16:00:00.000Z";

function deps(options: { confirm?: string | "throws" | "absent" } = {}) {
  const confirmations: string[] = [];
  const smsBodies: string[] = [];

  const d: ToolSchedulingDeps = {
    now: () => new Date("2027-05-01T09:00:00.000Z"),
    // The documented unit-test seam. Without it the dispatcher resolves
    // capabilities from the database, which these tests do not have, and every
    // call is correctly refused before it reaches the booking path.
    authorizedCapabilities: () => ["scheduling"],
    getDayAvailability: async () => ({ ok: true, slots: [] }) as never,
    getSchedulingContext: async () => ({
      timezone: "America/Los_Angeles",
      types: [{ id: "1", name: "Check-up", durationMin: 30 }],
    }),
    findRequestByPublicId: async () => undefined,
    submitAppointmentRequest: async () =>
      ({ ok: true, request: { publicId: PUBLIC_ID }, duplicate: false }) as never,
    cancelAppointmentRequestByPublicId: async () => true,
    enqueueBookingConfirmation: async (input) => {
      smsBodies.push(input.spokenSummary);
      return { enqueued: true };
    },
    ...(options.confirm === "absent"
      ? {}
      : {
          confirmRequest: async (_f, publicId) => {
            confirmations.push(publicId);
            if (options.confirm === "throws") throw new Error("CalendarDown");
            return options.confirm ?? "booked";
          },
        }),
  };
  return { deps: d, confirmations, smsBodies };
}

let callSeq = 0;
async function book(d: ToolSchedulingDeps): Promise<string> {
  callSeq += 1;
  const results = await dispatchToolCalls(
    FIRM,
    [
      {
        toolCallId: "tc_" + String(callSeq),
        name: "book_appointment",
        args: {
          appointmentTypeId: "1",
          startIso: START,
          customerName: "Dana Rivera",
          customerPhone: "+15550102030",
          smsConsent: true,
        },
      },
    ],
    CTX,
    d,
  );
  return results[0]!.result;
}

describe("when the business has a working calendar", () => {
  it("confirms on the call and says booked", async () => {
    const h = deps({ confirm: "booked" });
    const spoken = await book(h.deps);
    expect(h.confirmations).toEqual([PUBLIC_ID]);
    expect(spoken).toMatch(/confirmed/i);
    expect(spoken).toMatch(/booked/i);
  });

  it("tells the caller's text message it is confirmed, not pending", async () => {
    const h = deps({ confirm: "booked" });
    await book(h.deps);
    expect(h.smsBodies[0]).toMatch(/confirmed/i);
    expect(h.smsBodies[0]).not.toMatch(/will confirm shortly/i);
  });
});

describe("when it cannot be confirmed", () => {
  it("keeps the request wording for every non-booked answer", async () => {
    for (const confirm of ["disabled", "no_connection", "event_write_failed", "throws", "absent"] as const) {
      const h = deps({ confirm });
      const spoken = await book(h.deps);
      expect(spoken, confirm).toMatch(/not yet confirmed/i);
      expect(spoken, confirm).toMatch(/do not tell them it is booked/i);
    }
  });

  it("never claims a booking when the calendar did not answer", async () => {
    // The one that matters most: `event_write_uncertain` means an event may or
    // may not exist. Saying "booked" there is the failure mode this whole
    // design exists to prevent — and it must not retry to find out, either.
    const h = deps({ confirm: "event_write_uncertain" });
    const spoken = await book(h.deps);
    expect(spoken).toMatch(/not yet confirmed/i);
    expect(h.confirmations).toHaveLength(1);
  });

  it("still sends the caller the request wording", async () => {
    const h = deps({ confirm: "no_connection" });
    await book(h.deps);
    expect(h.smsBodies[0]).toMatch(/will confirm shortly/i);
  });
});
