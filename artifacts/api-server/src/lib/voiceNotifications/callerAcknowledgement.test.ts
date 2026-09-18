// The email the CALLER gets after asking for an appointment on a call.
//
// Two things are being protected here. The first is that a request is never
// described to the caller as a booking — they heard "requested, not confirmed"
// on the phone, and an email that says otherwise is how someone turns up for an
// appointment nobody accepted. The second is that we only ever write to an
// address the caller gave AND confirmed: an address heard once over a phone
// line is easy to mishear, and a mis-heard address sends a stranger a real
// person's appointment.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { composeCallerAckEmail } from "./callerAckComposer.js";
import { callerAppointmentAckDedupeKey } from "./notificationOutbox.js";
import { dispatchToolCalls, type ToolSchedulingDeps } from "../voice/tools/toolDispatcher.js";
import type { SchedulingAppointmentRequest } from "@workspace/db/schema/scheduling";

const FIRM = 7;
const CTX = { provider: "vapi", providerCallId: "call_ack_1", assistantRowId: 11 } as const;
const NOW = new Date("2026-08-31T15:00:00.000Z");
const START = new Date("2026-09-01T14:00:00.000Z");

function requestRow(overrides: Partial<SchedulingAppointmentRequest> = {}): SchedulingAppointmentRequest {
  return {
    id: 1,
    publicId: "11111111-1111-4111-8111-111111111111",
    firmId: FIRM,
    appointmentTypeId: 3,
    source: "ai_receptionist",
    status: "pending_review",
    requestedStartAt: START,
    requestedEndAt: new Date("2026-09-01T14:30:00.000Z"),
    timezone: "America/New_York",
    customerName: "Pat Caller",
    customerEmail: "pat@example.com",
    customerPhone: "+15550001111",
    phoneConsent: true,
    smsConsent: false,
    emailConsent: false,
    holdExpiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as SchedulingAppointmentRequest;
}

interface AckLog {
  acks: Array<{ recipient: string; dedupeKey: string; subject: string; body: string }>;
  sms: Array<{ callerConsented: boolean }>;
}

/**
 * Mirrors production in the one respect these cases turn on: the repository
 * persists the consent it is handed, and the row is what the acknowledgement
 * path reads. A stub that ignored the consent argument would make every case
 * below pass for the wrong reason.
 */
function makeDeps(overrides: Partial<ToolSchedulingDeps> = {}): { deps: ToolSchedulingDeps; log: AckLog } {
  const log: AckLog = { acks: [], sms: [] };
  const deps: ToolSchedulingDeps = {
    now: () => NOW,
    authorizedCapabilities: () => ["messages", "scheduling"],
    getSchedulingContext: async () => ({
      timezone: "America/New_York",
      types: [{ id: "3", name: "Consultation", durationMin: 30 }],
    }),
    getDayAvailability: async () => ({ dateKey: "2026-09-01", reason: "open", slots: [] }),
    findRequestByPublicId: async () => undefined,
    submitAppointmentRequest: async (_firmId, _typeId, _startUtc, contact, consent) =>
      ({
        ok: true,
        request: requestRow({ customerEmail: contact.email, emailConsent: consent.emailConsent }),
      }) as Awaited<ReturnType<ToolSchedulingDeps["submitAppointmentRequest"]>>,
    cancelAppointmentRequestByPublicId: async () => true,
    openIssue: async () => ({}),
    loadBusinessName: async () => "Northgate Electrical",
    enqueueCallerAck: async (input) => {
      log.acks.push({
        recipient: input.recipient,
        dedupeKey: input.dedupeKey,
        subject: input.subject,
        body: input.body,
      });
    },
    enqueueBookingConfirmation: async (input) => {
      log.sms.push({ callerConsented: input.callerConsented });
      return { enqueued: false, reason: "duplicate" } as never;
    },
    ...overrides,
  };
  return { deps, log };
}

function book(args: Record<string, unknown>) {
  return [{ toolCallId: "t1", name: "book_appointment", args }];
}

const BASE_ARGS = {
  appointmentTypeId: "3",
  startIso: START.toISOString(),
  customerName: "Pat Caller",
  customerEmail: "pat@example.com",
  emailConfirmed: true,
};

// ── the words the caller reads ───────────────────────────────────────────────

describe("the caller's appointment email", () => {
  const facts = {
    businessName: "Northgate Electrical",
    serviceName: "Consultation",
    startAt: START,
    timeZone: "America/New_York",
    reference: "11111111-1111-4111-8111-111111111111",
  };

  it("tells a caller whose time is only requested that nothing is booked", () => {
    const { subject, body } = composeCallerAckEmail({ ...facts, status: "pending" });

    expect(subject).toBe("Appointment requested — Northgate Electrical, Tuesday, September 1 at 10:00 AM EDT");
    expect(body).toContain("REQUESTED — not booked");
    expect(body).toContain("Nothing is booked yet");
    expect(body).toContain("You will not receive a calendar invitation unless they confirm it.");
    // The failure this whole feature exists to avoid.
    expect(body).not.toMatch(/\bconfirmed\b/i);
    expect(subject).not.toMatch(/\bconfirmed\b/i);
  });

  it("says confirmed only for a booking, and points at the business to change it", () => {
    const { subject, body } = composeCallerAckEmail({ ...facts, status: "booked" });

    expect(subject).toBe("Appointment confirmed — Northgate Electrical, Tuesday, September 1 at 10:00 AM EDT");
    expect(body).toContain("CONFIRMED — booked");
    expect(body).toContain("is in Northgate Electrical's calendar");
    expect(body).not.toContain("REQUESTED — not booked");
    expect(body).not.toContain("Nothing is booked yet");
  });

  it("names the timezone in words as well as in the rendered time", () => {
    const { body } = composeCallerAckEmail({ ...facts, status: "pending" });

    expect(body).toContain("Timezone:  America/New_York");
    expect(body).toContain("10:00 AM EDT");
  });

  it("carries the business, the service, the reference and why they got it", () => {
    const { body } = composeCallerAckEmail({ ...facts, status: "pending" });

    expect(body).toContain("Northgate Electrical");
    expect(body).toContain("Service:   Consultation");
    expect(body).toContain("Reference: 11111111-1111-4111-8111-111111111111");
    expect(body).toContain("you gave this address on the call");
    // It is the caller's copy, not the business's: no dashboard, no call id.
    expect(body).not.toMatch(/dashboard|sign in|call_ack/i);
  });
});

// ── who is allowed to receive one ────────────────────────────────────────────

describe("consent decides whether a caller is emailed at all", () => {
  it("queues one email when the caller gave an address and confirmed it", async () => {
    const { deps, log } = makeDeps();

    await dispatchToolCalls(FIRM, book(BASE_ARGS), CTX, deps);

    expect(log.acks).toHaveLength(1);
    expect(log.acks[0]!.recipient).toBe("pat@example.com");
    expect(log.acks[0]!.subject.startsWith("Appointment requested")).toBe(true);
  });

  it("sends nothing when the caller gave no address", async () => {
    const { deps, log } = makeDeps();
    const { customerEmail, emailConfirmed, ...noEmail } = BASE_ARGS;

    const results = await dispatchToolCalls(FIRM, book(noEmail), CTX, deps);

    expect(log.acks).toHaveLength(0);
    // The booking itself still happened.
    expect(results[0]!.result).toContain("Requested, not yet confirmed");
  });

  it("sends nothing when an address was stated but never confirmed", async () => {
    const { deps, log } = makeDeps();
    const { emailConfirmed, ...unconfirmed } = BASE_ARGS;

    await dispatchToolCalls(FIRM, book(unconfirmed), CTX, deps);

    expect(log.acks).toHaveLength(0);
  });

  it("refuses the argument shape that claims consent without an address", async () => {
    const { deps, log } = makeDeps();
    const { customerEmail, ...consentNoAddress } = BASE_ARGS;

    const results = await dispatchToolCalls(FIRM, book(consentNoAddress), CTX, deps);

    expect(log.acks).toHaveLength(0);
    expect(results[0]!.result).toContain("couldn't use those details");
  });
});

// ── what the caller is told, from the dispatcher's own outcome ───────────────

describe("the caller's email matches what actually happened", () => {
  it("says confirmed only after the calendar write returned booked", async () => {
    const { deps, log } = makeDeps({ confirmRequest: async () => "booked" });

    const results = await dispatchToolCalls(FIRM, book(BASE_ARGS), CTX, deps);

    expect(results[0]!.result).toContain("Confirmed and in the calendar");
    expect(log.acks).toHaveLength(1);
    expect(log.acks[0]!.subject.startsWith("Appointment confirmed")).toBe(true);
    expect(log.acks[0]!.body).toContain("CONFIRMED — booked");
  });

  it("stays 'requested' when the calendar write was refused", async () => {
    const { deps, log } = makeDeps({ confirmRequest: async () => "no_connection" });

    await dispatchToolCalls(FIRM, book(BASE_ARGS), CTX, deps);

    expect(log.acks[0]!.body).toContain("REQUESTED — not booked");
  });

  it("stays 'requested' when the calendar write never answered", async () => {
    // The dangerous case: an unanswered write might yet have succeeded, so the
    // caller must not be told it did.
    const { deps, log } = makeDeps({
      confirmRequest: async () => {
        throw new Error("timeout");
      },
    });

    await dispatchToolCalls(FIRM, book(BASE_ARGS), CTX, deps);

    expect(log.acks[0]!.body).toContain("REQUESTED — not booked");
    expect(log.acks[0]!.body).not.toContain("CONFIRMED");
  });
});

// ── repeats ──────────────────────────────────────────────────────────────────

describe("a repeated provider event cannot email the caller twice", () => {
  it("keys the email on the appointment, so a redelivered call event reuses it", async () => {
    const { deps, log } = makeDeps();

    await dispatchToolCalls(FIRM, book(BASE_ARGS), CTX, deps);
    await dispatchToolCalls(FIRM, book(BASE_ARGS), CTX, deps);

    expect(log.acks).toHaveLength(2);
    // Two attempts, one key: the outbox inserts the second nowhere.
    expect(log.acks[0]!.dedupeKey).toBe(log.acks[1]!.dedupeKey);
    expect(log.acks[0]!.dedupeKey).toBe(
      callerAppointmentAckDedupeKey("11111111-1111-4111-8111-111111111111", "pending"),
    );
  });

  it("queues nothing more when the repository recognised the retry as the same request", async () => {
    const { deps, log } = makeDeps({
      submitAppointmentRequest: async () =>
        ({
          ok: true,
          duplicate: true,
          request: requestRow({ emailConsent: true }),
        }) as Awaited<ReturnType<ToolSchedulingDeps["submitAppointmentRequest"]>>,
    });

    const results = await dispatchToolCalls(FIRM, book(BASE_ARGS), CTX, deps);

    expect(log.acks).toHaveLength(0);
    expect(results[0]!.result).toContain("Already requested");
  });

  it("uses a different key once the time is actually booked, so confirmation is not swallowed", () => {
    const pending = callerAppointmentAckDedupeKey("abc", "pending");
    const booked = callerAppointmentAckDedupeKey("abc", "booked");

    expect(pending).not.toBe(booked);
  });
});

// ── failures must not damage the booking ─────────────────────────────────────

describe("a failing email never breaks the appointment", () => {
  it("keeps the booking and the spoken line when queuing throws", async () => {
    const { deps } = makeDeps({
      enqueueCallerAck: async () => {
        throw new Error("outbox unavailable");
      },
    });

    const results = await dispatchToolCalls(FIRM, book(BASE_ARGS), CTX, deps);

    expect(results[0]!.result).toContain("Requested, not yet confirmed");
  });

  it("sends no caller email at all when no transport is wired, rather than another recipient", async () => {
    const { deps, log } = makeDeps({ enqueueCallerAck: undefined });

    const results = await dispatchToolCalls(FIRM, book(BASE_ARGS), CTX, deps);

    expect(log.acks).toHaveLength(0);
    expect(results[0]!.result).toContain("Requested, not yet confirmed");
  });
});

// ── the deferred channel stays deferred ──────────────────────────────────────

describe("texting the caller stays switched off", () => {
  it("never records SMS consent from a call, even when email consent was given", async () => {
    const { deps, log } = makeDeps();

    await dispatchToolCalls(FIRM, book({ ...BASE_ARGS, smsConsent: true }), CTX, deps);

    expect(log.sms.every((s) => s.callerConsented === false)).toBe(true);
  });
});
