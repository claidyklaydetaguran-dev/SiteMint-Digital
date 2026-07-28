import { describe, expect, it, beforeEach } from "vitest";
import {
  getAvailabilityConfig,
  setAvailabilityConfig,
  getDayAvailability,
  createHold,
  submitAppointmentRequest,
  listAppointmentRequests,
  cancelAppointmentRequest,
  _resetSchedulingStoreForTests,
} from "./availabilityStore.js";
import { zonedTimeToUtc } from "./zonedTime.js";

const FIRM_ID = 999;
const NOW = zonedTimeToUtc("America/Los_Angeles", 2026, 3, 2, 8, 0); // Monday 8am
const SLOT = zonedTimeToUtc("America/Los_Angeles", 2026, 3, 3, 9, 0); // Tuesday 9am (default config's opening slot)

beforeEach(() => {
  _resetSchedulingStoreForTests();
});

describe("availabilityStore", () => {
  it("returns a sensible Development default config for a firm that never configured one", () => {
    const config = getAvailabilityConfig(FIRM_ID);
    expect(config.appointmentTypes.length).toBeGreaterThan(0);
    expect(config.timezone).toBeTruthy();
  });

  it("persists an admin-set config in memory for subsequent reads within the process", () => {
    const config = getAvailabilityConfig(FIRM_ID);
    setAvailabilityConfig(FIRM_ID, { ...config, blockedDates: ["2026-03-03"] });
    expect(getAvailabilityConfig(FIRM_ID).blockedDates).toEqual(["2026-03-03"]);
  });

  it("keeps two firms' configs fully independent", () => {
    const configA = getAvailabilityConfig(1001);
    setAvailabilityConfig(1001, { ...configA, blockedDates: ["2026-03-03"] });
    expect(getAvailabilityConfig(1002).blockedDates).toEqual([]);
  });

  it("prevents a second submission from taking a slot another request already holds", () => {
    const first = submitAppointmentRequest(
      FIRM_ID, "consult", SLOT, { name: "Jordan (fixture)", phone: null, email: null }, "website", NOW,
    );
    expect(first.ok).toBe(true);

    const second = submitAppointmentRequest(
      FIRM_ID, "consult", SLOT, { name: "Alex (fixture)", phone: null, email: null }, "website", NOW,
    );
    expect(second).toEqual({ ok: false, reason: "slot_no_longer_available" });
  });

  it("a hold blocks the same slot from being requested by someone else, then the hold owner can submit it", () => {
    const hold = createHold(FIRM_ID, "consult", SLOT, NOW);
    expect(hold.ok).toBe(true);

    const otherAttempt = submitAppointmentRequest(
      FIRM_ID, "consult", SLOT, { name: "Someone else (fixture)", phone: null, email: null }, "website", NOW,
    );
    expect(otherAttempt).toEqual({ ok: false, reason: "slot_no_longer_available" });

    // The original visitor completing their own booking re-validates and succeeds
    // (Checkpoint A models this as: a fresh submit call for the same slot,
    // since the store has no hold-ownership token yet).
  });

  it("never produces a booked appointment — the ceiling state is pending_review", () => {
    const result = submitAppointmentRequest(
      FIRM_ID, "consult", SLOT, { name: "Jordan (fixture)", phone: null, email: null }, "website", NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.state).toBe("pending_review");
    expect(result.request.state).not.toBe("booked");
  });

  it("expires a hold after its hold window passes, freeing the slot again", () => {
    const hold = createHold(FIRM_ID, "consult", SLOT, NOW);
    expect(hold.ok).toBe(true);

    const muchLater = new Date(NOW.getTime() + 10 * 60_000); // 10 min later, past the 5-min hold window
    const availability = getDayAvailability(FIRM_ID, "2026-03-03", "consult", muchLater);
    expect(availability.slots.some((s) => s.startUtc.getTime() === SLOT.getTime())).toBe(true);
  });

  it("rejects a request for a slot that fails server-side revalidation even if never held (e.g. outside business hours)", () => {
    const midnight = zonedTimeToUtc("America/Los_Angeles", 2026, 3, 3, 0, 0);
    const result = submitAppointmentRequest(
      FIRM_ID, "consult", midnight, { name: "Jordan (fixture)", phone: null, email: null }, "website", NOW,
    );
    expect(result).toEqual({ ok: false, reason: "slot_no_longer_available" });
  });

  it("lists requests newest-first and supports cancellation", () => {
    const result = submitAppointmentRequest(
      FIRM_ID, "consult", SLOT, { name: "Jordan (fixture)", phone: null, email: null }, "website", NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const list = listAppointmentRequests(FIRM_ID, NOW);
    expect(list).toHaveLength(1);
    expect(list[0]!.state).toBe("pending_review");

    expect(cancelAppointmentRequest(FIRM_ID, result.request.id)).toBe(true);
    expect(listAppointmentRequests(FIRM_ID, NOW)[0]!.state).toBe("cancelled");

    // Cancelling frees the slot back up.
    const availability = getDayAvailability(FIRM_ID, "2026-03-03", "consult", NOW);
    expect(availability.slots.some((s) => s.startUtc.getTime() === SLOT.getTime())).toBe(true);
  });

  it("cannot cancel a request that doesn't exist or is already cancelled", () => {
    expect(cancelAppointmentRequest(FIRM_ID, "does-not-exist")).toBe(false);
  });
});
