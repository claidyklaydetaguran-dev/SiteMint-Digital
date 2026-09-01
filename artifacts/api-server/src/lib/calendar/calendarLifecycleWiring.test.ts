// M4: regression tests for the calendar event lifecycle now that it is
// reachable.
//
// The defect these guard against was not a logic bug — approveRequestToBooked,
// removeCalendarEventForRequest and reconcileCalendarForFirm were all correct
// and unit-tested. The defect was that NOTHING IMPORTED THEM, so no reachable
// code path could write a calendar event and CALENDAR_WRITE_ENABLED had no
// runtime effect at all. The first block below fails if that regresses.
//
// Everything else drives the lifecycle through fakes: no network, no database,
// no credential, no provider mutation.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  approveRequestToBooked,
  removeCalendarEventForRequest,
  reconcileCalendarForFirm,
  isCalendarWriteEnabled,
  type CalendarSyncDeps,
} from "./calendarEventSync.js";
import { buildEventBody } from "./eventWriter.js";
import type { SchedulingAppointmentRequest, SchedulingCalendarConnection } from "@workspace/db/schema/scheduling";

const ROUTES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../routes");

// ── the reachability contract ────────────────────────────────────────────────

describe("the calendar writer is reachable from a route", () => {
  const calendarRoutes = readFileSync(resolve(ROUTES_DIR, "receptionistCalendar.ts"), "utf8");
  const availabilityRoutes = readFileSync(resolve(ROUTES_DIR, "receptionistAvailability.ts"), "utf8");

  it("the calendar router imports the write lifecycle (the wiring the defect was missing)", () => {
    expect(calendarRoutes).toMatch(/from ["'][^"']*calendarEventSync\.js["']/);
    expect(calendarRoutes).toMatch(/approveRequestToBooked/);
    expect(calendarRoutes).toMatch(/reconcileCalendarForFirm/);
  });

  it("the cancel path removes the event, so a cancellation cannot leave one behind", () => {
    // Removal is wired where cancellation happens — the availability router —
    // while approve/reconcile live on the calendar router, because
    // appointmentsContract.test.ts pins the availability router to exactly the
    // ten endpoints its page calls and forbids an approve endpoint there.
    expect(availabilityRoutes).toMatch(/from ["'][^"']*calendarEventSync\.js["']/);
    expect(availabilityRoutes).toMatch(/removeCalendarEventForRequest/);
    const start = availabilityRoutes.indexOf('requests/:publicId/cancel"');
    expect(start).toBeGreaterThan(-1);
    const handler = availabilityRoutes.slice(start, start + 2000);
    expect(handler).toContain("removeCalendarEventForRequest");
  });

  it("exposes approve and reconcile actions, both behind receptionist auth", () => {
    const approve = calendarRoutes.match(/router\.post\(\s*["'][^"']*requests\/:publicId\/approve["'][^)]*/s);
    const reconcile = calendarRoutes.match(/router\.post\(\s*["'][^"']*calendar\/reconcile["'][^)]*/s);
    expect(approve).not.toBeNull();
    expect(reconcile).not.toBeNull();
    expect(approve![0]).toContain("requireReceptionistAuth");
    expect(reconcile![0]).toContain("requireReceptionistAuth");
  });

  it("never takes firmId from the request body, query, or params", () => {
    // Tenancy comes from the session on every calendar route.
    expect(calendarRoutes).not.toMatch(/req\.(body|query|params)\.firmId/);
    for (const m of calendarRoutes.matchAll(/calendarSyncDeps\(\)/g)) expect(m).toBeTruthy();
    expect(calendarRoutes).toMatch(/const firmId = req\.firmId!/);
  });

  it("returns no provider identifier, token, or caller detail in a response", () => {
    const bodies = [...calendarRoutes.matchAll(/res\.(?:status\(\d+\)\.)?json\(([^;]*)\);/g)].map((m) => m[1] as string);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toMatch(/providerEventId|providerCalendarId|calendarId|accessToken|refreshToken|customerName|customerPhone|customerEmail/);
    }
  });
});

// ── lifecycle behaviour ──────────────────────────────────────────────────────

const CONNECTION = {
  id: 1,
  firmId: 1,
  provider: "google",
  status: "active",
  calendarId: "primary",
  refreshTokenEnc: "enc-refresh",
  accessTokenEnc: "enc-access",
  accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
} as unknown as SchedulingCalendarConnection;

function request(overrides: Partial<SchedulingAppointmentRequest> = {}): SchedulingAppointmentRequest {
  return {
    id: 10,
    firmId: 1,
    publicId: "11111111-2222-4333-8444-555555555555",
    status: "pending_review",
    customerName: "AR002I Synthetic Caller",
    timezone: "America/Los_Angeles",
    requestedStartAt: new Date("2026-09-14T16:00:00.000Z"),
    requestedEndAt: new Date("2026-09-14T16:30:00.000Z"),
    providerEventId: null,
    providerCalendarId: null,
    ...overrides,
  } as unknown as SchedulingAppointmentRequest;
}

interface Harness {
  deps: CalendarSyncDeps;
  inserts: number;
  deletes: string[];
  issues: string[];
  row: SchedulingAppointmentRequest;
}

function harness(opts: {
  enabled?: boolean;
  row?: SchedulingAppointmentRequest;
  connection?: SchedulingCalendarConnection | undefined;
  insertResult?: { ok: true; eventId: string } | { ok: false; reason: "revoked" | "provider_error" };
  deleteResult?: { ok: true } | { ok: false; reason: "revoked" | "provider_error" };
  markBookedReturns?: boolean;
} = {}): Harness {
  const state: Harness = {
    inserts: 0,
    deletes: [],
    issues: [],
    row: opts.row ?? request(),
    deps: null as unknown as CalendarSyncDeps,
  };
  state.deps = {
    isEnabled: () => opts.enabled ?? true,
    getActiveConnection: async () => ("connection" in opts ? opts.connection : CONNECTION),
    findRequest: async (firmId, publicId) =>
      firmId === state.row.firmId && publicId === state.row.publicId ? state.row : undefined,
    writer: {
      insertEvent: async () => {
        state.inserts += 1;
        // Structural duplicate prevention: the same request always converges
        // on one Google event because iCalUID is derived from its public id.
        return opts.insertResult ?? { ok: true, eventId: "evt-" + state.row.publicId };
      },
      patchEventTimes: async () => ({ ok: true, eventId: "evt" }),
      deleteEvent: async (_c, id) => {
        state.deletes.push(id);
        return opts.deleteResult ?? { ok: true };
      },
    },
    markBooked: async (_f, _id, eventId, calendarId) => {
      if (opts.markBookedReturns === false) return false;
      state.row = { ...state.row, status: "booked", providerEventId: eventId, providerCalendarId: calendarId } as SchedulingAppointmentRequest;
      return true;
    },
    clearProviderEvent: async () => {
      state.row = { ...state.row, providerEventId: null, providerCalendarId: null } as SchedulingAppointmentRequest;
    },
    openIssue: async (i) => {
      state.issues.push(i.code);
      return undefined;
    },
  };
  return state;
}

describe("approval", () => {
  it("with the flag off: no Google call and no booking transition", async () => {
    const h = harness({ enabled: false });
    expect(await approveRequestToBooked(1, h.row.publicId, h.deps)).toBe("disabled");
    expect(h.inserts).toBe(0);
    expect(h.row.status).toBe("pending_review");
  });

  it("the flag is exact-'true' and defaults off", () => {
    expect(isCalendarWriteEnabled({})).toBe(false);
    expect(isCalendarWriteEnabled({ CALENDAR_WRITE_ENABLED: "TRUE" })).toBe(false);
    expect(isCalendarWriteEnabled({ CALENDAR_WRITE_ENABLED: "1" })).toBe(false);
    expect(isCalendarWriteEnabled({ CALENDAR_WRITE_ENABLED: "true" })).toBe(true);
  });

  it("same-firm approval creates exactly one event and books the row", async () => {
    const h = harness();
    expect(await approveRequestToBooked(1, h.row.publicId, h.deps)).toBe("booked");
    expect(h.inserts).toBe(1);
    expect(h.row.status).toBe("booked");
    expect(h.row.providerEventId).toBeTruthy();
    expect(h.row.providerCalendarId).toBe("primary");
  });

  it("a repeated approval is idempotent — never a second event", async () => {
    const h = harness();
    await approveRequestToBooked(1, h.row.publicId, h.deps);
    expect(await approveRequestToBooked(1, h.row.publicId, h.deps)).toBe("booked");
    expect(await approveRequestToBooked(1, h.row.publicId, h.deps)).toBe("booked");
    expect(h.inserts).toBe(1);
  });

  it("a concurrent approval that loses the stamp deletes its own event", async () => {
    // The status-guarded UPDATE is the atomic claim: the loser gets false and
    // must undo, so a lost race never leaves an orphan blocking the calendar.
    const h = harness({ markBookedReturns: false });
    expect(await approveRequestToBooked(1, h.row.publicId, h.deps)).toBe("conflict_after_write");
    expect(h.inserts).toBe(1);
    expect(h.deletes).toHaveLength(1);
    expect(h.row.status).toBe("pending_review");
  });

  it("refuses a cross-firm request with zero side effects", async () => {
    const h = harness();
    expect(await approveRequestToBooked(2, h.row.publicId, h.deps)).toBe("not_found");
    expect(h.inserts).toBe(0);
    expect(h.deletes).toHaveLength(0);
    expect(h.issues).toHaveLength(0);
  });

  it("refuses unknown, cancelled and already-terminal requests", async () => {
    const unknown = harness();
    expect(await approveRequestToBooked(1, "00000000-0000-4000-8000-000000000000", unknown.deps)).toBe("not_found");

    for (const status of ["cancelled", "rescheduled", "failed", "expired", "requested"]) {
      const h = harness({ row: request({ status } as Partial<SchedulingAppointmentRequest>) });
      expect(await approveRequestToBooked(1, h.row.publicId, h.deps)).toBe("not_approvable");
      expect(h.inserts).toBe(0);
    }
  });

  it("reports no_connection without calling the writer", async () => {
    const h = harness({ connection: undefined });
    expect(await approveRequestToBooked(1, h.row.publicId, h.deps)).toBe("no_connection");
    expect(h.inserts).toBe(0);
  });

  it("on a Google create failure the request stays pending and an issue opens", async () => {
    const h = harness({ insertResult: { ok: false, reason: "provider_error" } });
    expect(await approveRequestToBooked(1, h.row.publicId, h.deps)).toBe("event_write_failed");
    expect(h.row.status).toBe("pending_review");
    expect(h.issues).toEqual(["calendar_sync_failed"]);
  });

  it("distinguishes a revoked grant from a transient provider error", async () => {
    const h = harness({ insertResult: { ok: false, reason: "revoked" } });
    expect(await approveRequestToBooked(1, h.row.publicId, h.deps)).toBe("event_write_failed");
    expect(h.issues).toEqual(["calendar_revoked"]);
  });
});

describe("cancellation and removal", () => {
  const booked = () => request({ status: "cancelled", providerEventId: "evt-1", providerCalendarId: "primary" });

  it("removes the event and clears the linkage", async () => {
    const h = harness({ row: booked() });
    expect(await removeCalendarEventForRequest(h.row, h.deps)).toBe("deleted");
    expect(h.deletes).toEqual(["evt-1"]);
    expect(h.row.providerEventId).toBeNull();
  });

  it("is a no-op when there was never an event", async () => {
    const h = harness({ row: request({ status: "cancelled" }) });
    expect(await removeCalendarEventForRequest(h.row, h.deps)).toBe("skipped");
    expect(h.deletes).toHaveLength(0);
  });

  it("does nothing with the flag off", async () => {
    const h = harness({ enabled: false, row: booked() });
    expect(await removeCalendarEventForRequest(h.row, h.deps)).toBe("disabled");
    expect(h.deletes).toHaveLength(0);
  });

  it("keeps the linkage and opens an issue when the delete fails, so retry can find it", async () => {
    const h = harness({ row: booked(), deleteResult: { ok: false, reason: "provider_error" } });
    expect(await removeCalendarEventForRequest(h.row, h.deps)).toBe("failed");
    expect(h.row.providerEventId).toBe("evt-1");
    expect(h.issues).toEqual(["calendar_sync_failed"]);
  });

  it("treats an already-deleted event as success (writer maps 404/410 to ok)", async () => {
    const h = harness({ row: booked(), deleteResult: { ok: true } });
    expect(await removeCalendarEventForRequest(h.row, h.deps)).toBe("deleted");
    expect(await removeCalendarEventForRequest(h.row, h.deps)).toBe("skipped");
    expect(h.deletes).toEqual(["evt-1"]);
  });
});

describe("reconciliation", () => {
  it("does nothing with the flag off", async () => {
    const h = harness({ enabled: false });
    expect(await reconcileCalendarForFirm(1, h.deps)).toEqual({ events_removed: 0, failures: 0 });
  });
});

describe("event body carries nothing it should not", () => {
  const body = buildEventBody({
    requestPublicId: "11111111-2222-4333-8444-555555555555",
    summary: "Appointment — AR002I Synthetic Caller",
    startUtc: new Date("2026-09-14T16:00:00.000Z"),
    endUtc: new Date("2026-09-14T16:30:00.000Z"),
    timezone: "America/Los_Angeles",
  });

  it("has no attendees, conferencing, reminders, notifications or attachments", () => {
    for (const forbidden of [
      "attendees", "conferenceData", "reminders", "attachments", "location",
      "guestsCanInviteOthers", "guestsCanSeeOtherGuests", "sendUpdates", "sendNotifications", "description",
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
    // "source" was here until Google rejected every insert over it (400
    // "Invalid source url: ."). See buildEventBody and the events.insert
    // field test in calendarIntegration.test.ts.
    expect(Object.keys(body).sort()).toEqual(["end", "iCalUID", "start", "summary"]);
  });

  it("derives iCalUID from the request public id, which is what prevents a duplicate event", () => {
    expect(body.iCalUID).toBe("11111111-2222-4333-8444-555555555555@sitemint.digital");
  });

  it("carries no phone number, email address or note text", () => {
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/@(?!sitemint\.digital)/);
    expect(serialized).not.toMatch(/\+\d{7,}/);
  });
});
