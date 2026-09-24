// J3 (dashboard): a reschedule keeps the original appointment and its Google
// event until the new time is itself booked; approving an older pending
// request re-checks what now occupies its time.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import type { SchedulingAppointmentRequest, SchedulingCalendarConnection } from "@workspace/db/schema/scheduling";
import { approveRequestToBooked, rescheduleBookedRequest, type BookedLifecycleDeps } from "./calendarEventSync.js";

const CONNECTION = { id: 1, firmId: 1, provider: "google", status: "active", calendarId: "primary" } as unknown as SchedulingCalendarConnection;
const OLD_ID = "11111111-2222-4333-8444-555555555555";
const NEW_ID = "99999999-8888-4777-8666-555555555555";
const NEW_START = new Date("2026-09-14T19:00:00.000Z");

function row(overrides: Partial<SchedulingAppointmentRequest>): SchedulingAppointmentRequest {
  return {
    id: 10,
    firmId: 1,
    publicId: OLD_ID,
    status: "booked",
    customerName: "Synthetic Caller",
    timezone: "America/Los_Angeles",
    requestedStartAt: new Date("2026-09-14T16:00:00.000Z"),
    requestedEndAt: new Date("2026-09-14T16:30:00.000Z"),
    providerEventId: "evt-old",
    providerCalendarId: "primary",
    ...overrides,
  } as unknown as SchedulingAppointmentRequest;
}

function world(opts: {
  insert?: { ok: true; eventId: string } | { ok: false; reason: "revoked" | "provider_error" };
  conflicts?: number | "throw";
  oldRacesAway?: boolean;
  enabled?: boolean;
} = {}) {
  const rows = new Map<string, SchedulingAppointmentRequest>([[OLD_ID, row({})]]);
  const events = new Set<string>(["evt-old"]);
  const log: string[] = [];
  const guarded = (to: string) => async (_firm: number, id: number) => {
    const r = [...rows.values()].find((x) => x.id === id);
    if (!r || r.status !== "booked") return false;
    if (to === "rescheduled" && opts.oldRacesAway && r.publicId === OLD_ID) {
      rows.set(OLD_ID, { ...r, status: "cancelled" } as SchedulingAppointmentRequest);
      return false;
    }
    rows.set(r.publicId, { ...r, status: to } as SchedulingAppointmentRequest);
    log.push(`${to}:${r.publicId === OLD_ID ? "old" : "new"}`);
    return true;
  };
  const deps: BookedLifecycleDeps = {
    isEnabled: () => opts.enabled ?? true,
    getActiveConnection: async () => CONNECTION,
    findRequest: async (firmId, publicId) => (firmId === 1 ? rows.get(publicId) : undefined),
    countConflicts:
      opts.conflicts === undefined
        ? undefined
        : async () => {
            if (opts.conflicts === "throw") throw new Error("calendar unreadable");
            return opts.conflicts as number;
          },
    writer: {
      insertEvent: async () => {
        const result = opts.insert ?? { ok: true as const, eventId: "evt-new" };
        if (result.ok) events.add(result.eventId);
        log.push("insert");
        return result;
      },
      patchEventTimes: async () => ({ ok: true, eventId: "x" }),
      findEventByRequest: async () => ({ ok: true as const, eventId: null }),
      deleteEvent: async (_c, id) => {
        events.delete(id);
        log.push("delete:" + id);
        return { ok: true };
      },
    },
    markBooked: async (_f, id, eventId, calendarId) => {
      const r = [...rows.values()].find((x) => x.id === id);
      if (!r || (r.status !== "pending_review" && r.status !== "held")) return false;
      rows.set(r.publicId, { ...r, status: "booked", providerEventId: eventId, providerCalendarId: calendarId } as SchedulingAppointmentRequest);
      return true;
    },
    clearProviderEvent: async (_f, id) => {
      const r = [...rows.values()].find((x) => x.id === id);
      if (r) rows.set(r.publicId, { ...r, providerEventId: null, providerCalendarId: null } as SchedulingAppointmentRequest);
    },
    cancelBooked: guarded("cancelled"),
    markRescheduled: guarded("rescheduled"),
    submitReplacement: async (_f, before, startUtc) => {
      const endUtc = new Date(startUtc.getTime() + (before.requestedEndAt.getTime() - before.requestedStartAt.getTime()));
      rows.set(NEW_ID, row({ id: 11, publicId: NEW_ID, status: "pending_review", requestedStartAt: startUtc, requestedEndAt: endUtc, providerEventId: null, providerCalendarId: null }));
      log.push("replacement");
      return { ok: true, publicId: NEW_ID, startUtc, endUtc };
    },
    discardReplacement: async (_f, publicId) => {
      const r = rows.get(publicId);
      if (r && r.status === "pending_review") rows.set(publicId, { ...r, status: "cancelled" } as SchedulingAppointmentRequest);
      log.push("discard");
    },
    openIssue: async () => undefined,
  };
  return { rows, events, log, deps };
}

describe("reschedule keeps the original until the new time is booked", () => {
  it("books the new time first, then releases the original and removes its event", async () => {
    const w = world();
    const result = await rescheduleBookedRequest(1, OLD_ID, NEW_START, w.deps);
    expect(result.outcome).toBe("rescheduled");
    expect(w.rows.get(NEW_ID)!.status).toBe("booked");
    expect(w.rows.get(OLD_ID)!.status).toBe("rescheduled");
    expect(w.events).toEqual(new Set(["evt-new"]));
    expect(w.log).toEqual(["replacement", "insert", "rescheduled:old", "delete:evt-old"]);
  });

  it("when the new time cannot be written, the original and its event are untouched", async () => {
    const w = world({ insert: { ok: false, reason: "provider_error" } });
    const result = await rescheduleBookedRequest(1, OLD_ID, NEW_START, w.deps);
    expect(result).toMatchObject({ outcome: "not_confirmed", reason: "event_write_failed" });
    expect(w.rows.get(OLD_ID)!.status).toBe("booked");
    expect(w.rows.get(NEW_ID)!.status).toBe("cancelled");
    expect(w.events).toEqual(new Set(["evt-old"]));
  });

  it("with calendar writing off nothing moves", async () => {
    const w = world({ enabled: false });
    expect((await rescheduleBookedRequest(1, OLD_ID, NEW_START, w.deps)).outcome).toBe("not_confirmed");
    expect(w.rows.get(OLD_ID)!.status).toBe("booked");
    expect(w.events).toEqual(new Set(["evt-old"]));
  });

  it("if the original was cancelled meanwhile, the new booking is cancelled again — one intent, never two appointments", async () => {
    const w = world({ oldRacesAway: true });
    const result = await rescheduleBookedRequest(1, OLD_ID, NEW_START, w.deps);
    expect(result.outcome).toBe("conflict");
    expect(w.rows.get(NEW_ID)!.status).toBe("cancelled");
    expect(w.events.has("evt-new")).toBe(false);
  });
});

describe("approving an older pending request re-checks its time", () => {
  const pending = (w: ReturnType<typeof world>) =>
    w.rows.set(NEW_ID, row({ id: 11, publicId: NEW_ID, status: "pending_review", providerEventId: null, providerCalendarId: null }));

  it("something now in that time: nothing is written, the request stays pending", async () => {
    const w = world({ conflicts: 1 });
    pending(w);
    expect(await approveRequestToBooked(1, NEW_ID, w.deps)).toBe("slot_conflict");
    expect(w.log).not.toContain("insert");
    expect(w.rows.get(NEW_ID)!.status).toBe("pending_review");
  });

  it("a calendar that cannot be read is never taken as free", async () => {
    const w = world({ conflicts: "throw" });
    pending(w);
    expect(await approveRequestToBooked(1, NEW_ID, w.deps)).toBe("conflict_check_failed");
    expect(w.log).not.toContain("insert");
  });

  it("a clear time books normally", async () => {
    const w = world({ conflicts: 0 });
    pending(w);
    expect(await approveRequestToBooked(1, NEW_ID, w.deps)).toBe("booked");
  });
});
