/**
 * The shared readiness answer: four steps, one overall state, one next action.
 * Unknown facts must read "Not checked", never done.
 */

import { describe, expect, it } from "vitest";
import { deriveReadiness, type ReadinessFacts } from "./receptionistReadiness.js";

const NOW = new Date("2026-09-17T12:00:00.000Z");

const blank: ReadinessFacts = {
  businessNamed: false,
  businessTradeSet: false,
  timezoneSet: false,
  emailVerified: false,
  assistantExists: false,
  greetingSet: false,
  voiceAvailable: false,
  assistantErrored: false,
  booking: "off",
  bookingGap: null,
  calendarState: "not_connected",
  transfer: "off",
  published: false,
  inSync: false,
  browserTestCompleted: false,
  phoneState: "none",
  liveCallCompleted: false,
};

const configured: ReadinessFacts = {
  ...blank,
  businessNamed: true,
  businessTradeSet: true,
  timezoneSet: true,
  emailVerified: true,
  assistantExists: true,
  greetingSet: true,
  voiceAvailable: true,
};

const unknown: ReadinessFacts = {
  businessNamed: null,
  businessTradeSet: null,
  timezoneSet: null,
  emailVerified: null,
  assistantExists: null,
  greetingSet: null,
  voiceAvailable: null,
  assistantErrored: null,
  booking: null,
  bookingGap: null,
  calendarState: null,
  transfer: null,
  published: null,
  inSync: null,
  browserTestCompleted: null,
  phoneState: null,
  liveCallCompleted: null,
};

const derive = (f: ReadinessFacts) => deriveReadiness(f, NOW);
const checkOf = (f: ReadinessFacts, key: string) => derive(f).steps.flatMap((s) => s.checks).find((c) => c.key === key)!;

describe("four steps", () => {
  it("are always the same four, in order", () => {
    expect(derive(blank).steps.map((s) => [s.number, s.title])).toEqual([
      [1, "Business information"],
      [2, "Greeting and voice"],
      [3, "What it can do"],
      [4, "Test and activate"],
    ]);
  });

  it("a new business is setting up, on step 1, with one next action", () => {
    const r = derive(blank);
    expect(r.state).toBe("setting_up");
    expect(r.steps.map((s) => s.state)).toEqual(["current", "upcoming", "done", "upcoming"]);
    expect(r.next).toEqual({ label: "Business name", path: "/account/settings" });
  });

  it("messages are always on; booking and transfer being off never block setup", () => {
    const r = derive(configured);
    const step3 = r.steps[2]!;
    expect(step3.state).toBe("done");
    expect(step3.checks.map((c) => [c.key, c.state])).toEqual([
      ["messages", "done"],
      ["booking", "off"],
      ["transfer", "off"],
    ]);
  });

  it("a capability SiteMint has not switched on says so, instead of asking the owner to set up what is already set up", () => {
    const blocked = { ...configured, booking: "off" as const, transfer: "off" as const, platformDisabled: ["scheduling", "transfer", "messages"] as Array<"scheduling" | "transfer" | "messages"> };
    const booking = checkOf(blocked, "booking");
    expect(booking.state).toBe("off");
    expect(booking.detail).toMatch(/isn’t switched on for your workspace yet/);
    expect(booking.detail).not.toMatch(/Add an appointment type/);
    expect(booking.fixPath).toBeNull();
    expect(checkOf(blocked, "transfer").detail).toMatch(/isn’t switched on for your workspace yet/);
    const messages = checkOf(blocked, "messages");
    expect(messages.state).toBe("done");
    expect(messages.detail).toMatch(/Saving them to Inquiries isn’t switched on/);
    // Without the platform reason the original guidance is unchanged.
    expect(checkOf({ ...configured, booking: "off" }, "booking").detail).toMatch(/Add an appointment type and opening hours/);
    expect(derive(blocked).steps.find((s) => s.key === "capabilities")?.state).toBe("done");
  });

  it("booking started but unfinished needs attention and says what is missing", () => {
    const r = derive({ ...configured, booking: "partial", bookingGap: "opening_hours" });
    expect(r.state).toBe("needs_attention");
    expect(checkOf({ ...configured, booking: "partial", bookingGap: "opening_hours" }, "booking")).toMatchObject({
      state: "attention",
      fixPath: "/scheduling/availability",
    });
    expect(r.next?.label).toBe("Fix: Book appointments");
  });

  it("booking with a broken calendar needs attention; without a calendar it is on, and honest about it", () => {
    expect(checkOf({ ...configured, booking: "on", calendarState: "revoked" }, "booking").state).toBe("attention");
    const noCalendar = checkOf({ ...configured, booking: "on", calendarState: "not_connected" }, "booking");
    expect(noCalendar.state).toBe("done");
    expect(noCalendar.detail).toMatch(/wait for you to confirm/);
    expect(checkOf({ ...configured, booking: "on", calendarState: "healthy" }, "booking").detail).toMatch(/straight into your calendar/);
  });

  it("an unavailable voice is flagged, not treated as merely unfinished", () => {
    const r = derive({ ...configured, voiceAvailable: false });
    expect(r.state).toBe("needs_attention");
    expect(r.steps[1]!.state).toBe("attention");
  });
});

describe("overall state", () => {
  it("walks the release path in order", () => {
    expect(derive({ ...configured, published: true, inSync: true }).state).toBe("ready_to_test");
    expect(derive({ ...configured, published: true, inSync: true }).next).toEqual({ label: "Browser test call", path: "/assistants" });
    expect(derive({ ...configured, published: true, inSync: true, browserTestCompleted: true }).state).toBe("ready_to_activate_phone");
    expect(derive({ ...configured, published: true, inSync: true, browserTestCompleted: true, phoneState: "assigned" }).state).toBe("phone_connected");
    const live = derive({ ...configured, published: true, inSync: true, browserTestCompleted: true, phoneState: "assigned", liveCallCompleted: true });
    expect(live.state).toBe("live_call_verified");
    expect(live.steps.every((s) => s.state === "done")).toBe(true);
    expect(live.next).toBeNull();
  });

  it("a paused number is paused, whatever else is true", () => {
    expect(derive({ ...configured, published: true, inSync: true, phoneState: "paused", liveCallCompleted: true }).state).toBe("paused");
  });

  it("a failed publish, or unpublished changes, need attention", () => {
    expect(derive({ ...configured, assistantErrored: true }).state).toBe("needs_attention");
    expect(derive({ ...configured, published: true, inSync: false }).state).toBe("needs_attention");
  });

  it("nothing readable reads as not checked, never as done", () => {
    const r = derive(unknown);
    expect(r.state).toBe("not_checked");
    const checks = r.steps.flatMap((s) => s.checks).filter((c) => c.key !== "messages");
    expect(checks.every((c) => c.state === "not_checked")).toBe(true);
    expect(r.steps.some((s) => s.state === "done" && s.key !== "capabilities")).toBe(false);
  });

  it("a live call without a connected number is not claimed as live", () => {
    expect(derive({ ...configured, published: true, inSync: true, liveCallCompleted: true, phoneState: "none" }).state).not.toBe(
      "live_call_verified",
    );
  });

  it("stamps when it was checked", () => {
    expect(derive(blank).checkedAt).toBe(NOW.toISOString());
  });
});

describe("publishing that would be refused", () => {
  it("a business without an active plan is told to activate, not to publish", () => {
    const r = derive({ ...configured, serviceAccess: "not_activated" });
    expect(r.state).toBe("not_activated");
    const published = checkOf({ ...configured, serviceAccess: "not_activated" }, "published");
    expect(published.state).toBe("attention");
    expect(published.detail).toMatch(/Not activated yet/);
    expect(published.fixPath).toBe("/account/billing");
    expect(r.next).toEqual({ label: "Fix: Published", path: "/account/billing" });
  });

  it("a suspended or cancelled plan says why, even when already published", () => {
    const suspended = checkOf({ ...configured, published: true, inSync: true, serviceAccess: "suspended" }, "published");
    expect(suspended.detail).toMatch(/payment/);
    expect(derive({ ...configured, published: true, inSync: true, serviceAccess: "canceled" }).state).toBe("not_activated");
  });

  it("publishing switched off for the platform names SiteMint, not the receptionist setup", () => {
    const c = checkOf({ ...configured, publishAvailable: false }, "published");
    expect(c.state).toBe("attention");
    expect(c.detail).toMatch(/contact SiteMint/);
    expect(c.detail).not.toBe("Publish your receptionist.");
  });

  it("an active plan with publishing available changes nothing", () => {
    const before = derive(configured);
    const after = derive({ ...configured, serviceAccess: "active", publishAvailable: true });
    expect(after.state).toBe(before.state);
    expect(checkOf({ ...configured, serviceAccess: "active", publishAvailable: true }, "published").detail).toBe("Publish your receptionist.");
  });

  it("an unreadable plan or configuration is not treated as a refusal", () => {
    expect(derive({ ...configured, serviceAccess: null, publishAvailable: null }).state).toBe(derive(configured).state);
  });
});
