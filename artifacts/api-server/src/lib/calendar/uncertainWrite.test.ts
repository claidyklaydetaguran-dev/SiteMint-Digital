// What happens when the calendar does not answer.
//
// A 400 means the write definitely did not happen. A timeout, a dropped
// connection or a 503 means we do not know — the event may well exist in the
// business's calendar with our response lost on the way back.
//
// Those two used to be one outcome, `provider_error`, and the approval was
// simply reported as failed. The business then approves again, the second
// insert lands, and one appointment appears twice in a customer's calendar.
//
// The rule here: never retry an ambiguous write. Ask.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { approveRequestToBooked, type CalendarSyncDeps } from "./calendarEventSync.js";
import { isUncertainStatus, iCalUidForRequest } from "./eventWriter.js";
import type { EventLookupResult, EventWriteResult } from "./eventWriter.js";

const FIRM = 4;
const PUBLIC_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const connection = {
  id: 1,
  firmId: FIRM,
  provider: "google",
  status: "active",
  accountLabel: "o…@business.co.uk",
  calendarId: "primary",
  refreshTokenEnc: "enc",
  accessTokenEnc: null,
  accessTokenExpiresAt: null,
  scope: "calendar",
  lastFreebusyAt: null,
  lastErrorAt: null,
  createdAt: new Date("2026-09-01T09:00:00.000Z"),
  updatedAt: new Date("2026-09-01T09:00:00.000Z"),
};

const request = {
  id: 7,
  publicId: PUBLIC_ID,
  firmId: FIRM,
  appointmentTypeId: 2,
  source: "ai_receptionist",
  status: "pending_review",
  requestedStartAt: new Date("2027-05-04T16:00:00.000Z"),
  requestedEndAt: new Date("2027-05-04T16:30:00.000Z"),
  timezone: "America/Los_Angeles",
  customerName: "Dana Rivera",
  customerEmail: null,
  customerPhone: null,
  notes: null,
  phoneConsent: false,
  smsConsent: false,
  emailConsent: false,
  providerEventId: null,
  providerCalendarId: null,
  toolCallId: null,
  holdExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  cancelledAt: null,
};

function deps(options: {
  write: EventWriteResult;
  lookup?: EventLookupResult;
  markBookedOk?: boolean;
}) {
  const inserts: number[] = [];
  const lookups: string[] = [];
  const deletes: string[] = [];
  const issues: Array<{ code: string; message: string; dedupeKey: string }> = [];
  let booked: { eventId: string } | null = null;

  const d: CalendarSyncDeps = {
    isEnabled: () => true,
    getActiveConnection: async () => connection as never,
    findRequest: async () => request as never,
    markBooked: async (_f, _id, eventId) => {
      if (options.markBookedOk === false) return false;
      booked = { eventId };
      return true;
    },
    clearProviderEvent: async () => undefined,
    openIssue: async (input) => {
      issues.push({ code: input.code, message: input.message, dedupeKey: input.dedupeKey });
      return undefined;
    },
    writer: {
      insertEvent: async () => {
        inserts.push(inserts.length + 1);
        return options.write;
      },
      findEventByRequest: async (_c, publicId) => {
        lookups.push(publicId);
        return options.lookup ?? { ok: true, eventId: null };
      },
      patchEventTimes: async () => ({ ok: false, reason: "provider_error" }),
      deleteEvent: async (_c, id) => {
        deletes.push(id);
        return { ok: true };
      },
    },
  };
  return { deps: d, inserts, lookups, deletes, issues, bookedRef: () => booked };
}

describe("an uncertain calendar write", () => {
  it("asks whether the event exists instead of trying again", async () => {
    const h = deps({ write: { ok: false, reason: "uncertain" }, lookup: { ok: true, eventId: "evt_123" } });
    await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
    // Exactly one insert. A second would be the duplicate-event defect.
    expect(h.inserts).toHaveLength(1);
    expect(h.lookups).toEqual([PUBLIC_ID]);
  });

  it("completes the approval when the write turns out to have landed", async () => {
    const h = deps({ write: { ok: false, reason: "uncertain" }, lookup: { ok: true, eventId: "evt_123" } });
    const outcome = await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
    expect(outcome).toBe("booked");
    // Stamped with the event the provider actually holds, not one we invented.
    expect(h.bookedRef()).toEqual({ eventId: "evt_123" });
    expect(h.issues).toEqual([]);
  });

  it("reports an ordinary failure when the provider says no event exists", async () => {
    const h = deps({ write: { ok: false, reason: "uncertain" }, lookup: { ok: true, eventId: null } });
    const outcome = await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
    // A definite answer, so this IS a failure and approving again is safe.
    expect(outcome).toBe("event_write_failed");
    expect(h.issues[0]?.message).toMatch(/no event was created/i);
    expect(h.bookedRef()).toBeNull();
  });

  it("reports unresolved — not failed — when it cannot find out", async () => {
    const h = deps({ write: { ok: false, reason: "uncertain" }, lookup: { ok: false, reason: "uncertain" } });
    const outcome = await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
    // The distinction that matters: "failed" invites another approval, which
    // could duplicate an event that already exists.
    expect(outcome).toBe("event_write_uncertain");
    expect(h.bookedRef()).toBeNull();
  });

  it("tells the business it was not retried, and what settles it", async () => {
    const h = deps({ write: { ok: false, reason: "uncertain" }, lookup: { ok: false, reason: "uncertain" } });
    await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
    expect(h.issues[0]?.message).toMatch(/nothing was retried/i);
    expect(h.issues[0]?.message).toMatch(/reconcile/i);
    // Its own dedupe key: an unresolved outcome is a different problem from a
    // clean failure and must not be collapsed into it.
    expect(h.issues[0]?.dedupeKey).toMatch(/unresolved/);
  });

  it("leaves the appointment pending in every unresolved case", async () => {
    for (const lookup of [{ ok: true, eventId: null }, { ok: false, reason: "uncertain" }, { ok: false, reason: "revoked" }] as EventLookupResult[]) {
      const h = deps({ write: { ok: false, reason: "uncertain" }, lookup });
      await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
      expect(h.bookedRef(), JSON.stringify(lookup)).toBeNull();
    }
  });

  it("does not ask when the write was a definite refusal", async () => {
    const h = deps({ write: { ok: false, reason: "provider_error" } });
    const outcome = await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
    expect(outcome).toBe("event_write_failed");
    // Nothing to resolve: the provider already said it did not happen.
    expect(h.lookups).toEqual([]);
  });

  it("does not ask when access was revoked, and says so", async () => {
    const h = deps({ write: { ok: false, reason: "revoked" } });
    const outcome = await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
    expect(outcome).toBe("event_write_failed");
    expect(h.lookups).toEqual([]);
    expect(h.issues[0]?.code).toBe("calendar_revoked");
  });

  it("still removes a recovered event if the row raced away underneath it", async () => {
    const h = deps({
      write: { ok: false, reason: "uncertain" },
      lookup: { ok: true, eventId: "evt_recovered" },
      markBookedOk: false,
    });
    const outcome = await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
    expect(outcome).toBe("conflict_after_write");
    // The event found by the lookup is the one deleted — never an orphan left
    // on the business's calendar for an appointment that is not booked.
    expect(h.deletes).toEqual(["evt_recovered"]);
  });
});

describe("two approvals of the same request", () => {
  it("the loser keeps the event the winner stamped, and reports booked", async () => {
    const h = deps({ write: { ok: false, reason: "uncertain" }, lookup: { ok: true, eventId: "evt_shared" }, markBookedOk: false });
    let reads = 0;
    const original = h.deps.findRequest;
    h.deps.findRequest = async (firmId: number, publicId: string) => {
      reads += 1;
      const row = await original(firmId, publicId);
      // First read: still pending. After the lost stamp: the other approval
      // booked it with the same event.
      return reads === 1 ? row : ({ ...(row as object), status: "booked", providerEventId: "evt_shared" } as never);
    };
    const outcome = await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps);
    expect(outcome).toBe("booked");
    expect(h.deletes).toEqual([]);
  });

  it("an event stamped to a different id is still removed", async () => {
    const h = deps({ write: { ok: true, eventId: "evt_mine" }, markBookedOk: false });
    let reads = 0;
    const original = h.deps.findRequest;
    h.deps.findRequest = async (firmId: number, publicId: string) => {
      reads += 1;
      const row = await original(firmId, publicId);
      return reads === 1 ? row : ({ ...(row as object), status: "booked", providerEventId: "evt_other" } as never);
    };
    expect(await approveRequestToBooked(FIRM, PUBLIC_ID, h.deps)).toBe("conflict_after_write");
    expect(h.deletes).toEqual(["evt_mine"]);
  });
});

describe("which provider answers count as unresolved", () => {
  it("treats a thrown transport, a timeout, rate limiting and 5xx as unknown", () => {
    for (const status of [0, 408, 429, 500, 502, 503, 504]) {
      expect(isUncertainStatus(status), String(status)).toBe(true);
    }
  });

  it("treats a definite refusal as known", () => {
    for (const status of [400, 401, 403, 404, 409, 410, 422]) {
      expect(isUncertainStatus(status), String(status)).toBe(false);
    }
  });
});

describe("the key the lookup asks by", () => {
  it("is derived from the request, so the question has one answer", () => {
    expect(iCalUidForRequest(PUBLIC_ID)).toBe(`${PUBLIC_ID}@sitemint.digital`);
    // Two different requests can never collide on it.
    expect(iCalUidForRequest("other")).not.toBe(iCalUidForRequest(PUBLIC_ID));
  });
});
