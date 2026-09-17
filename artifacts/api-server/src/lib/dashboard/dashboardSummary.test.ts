/**
 * Dashboard figures come from records only. An unreadable source is "not
 * available" — never a zero — and "today" is the business's own day.
 */

import { describe, expect, it } from "vitest";
import { buildDashboardSummary, dateKey, type DashboardInputs } from "./dashboardSummary.js";

// 01:30 on 18 Sept in UTC is still 17 Sept in Los Angeles.
const NOW = new Date("2026-09-18T01:30:00.000Z");
const at = (iso: string) => new Date(iso);

const base: DashboardInputs = {
  now: NOW,
  timezone: "America/Los_Angeles",
  calls: [
    { callId: "c1", channel: "telephone", state: "completed", startedAt: at("2026-09-17T20:00:00Z"), durationSec: 61.4, callerNumberDisplay: "+1 555 010 0001" },
    { callId: "c2", channel: "browser", state: "completed", startedAt: at("2026-09-17T21:00:00Z"), durationSec: 30, callerNumberDisplay: "Unknown" },
    { callId: "c3", channel: "telephone", state: "no_answer", startedAt: at("2026-09-16T18:00:00Z"), durationSec: undefined, callerNumberDisplay: "+1 555 010 0002" },
  ],
  messages: [
    { id: 1, topic: "Leaking tap", urgency: "urgent", followUpStatus: "new", callerName: "Dana", createdAt: at("2026-09-17T20:02:00Z") },
    { id: 2, topic: "Quote", urgency: "normal", followUpStatus: "resolved", callerName: "Lee", createdAt: at("2026-09-15T20:02:00Z") },
  ],
  bookings: [
    { publicId: "b1", status: "booked", startAt: at("2026-09-20T17:00:00Z"), customerName: "Dana", createdAt: at("2026-09-17T20:03:00Z") },
    { publicId: "b2", status: "pending_review", startAt: at("2026-09-21T17:00:00Z"), customerName: "Sam", createdAt: at("2026-09-17T19:00:00Z") },
    { publicId: "b3", status: "booked", startAt: at("2026-10-20T17:00:00Z"), customerName: "Far", createdAt: at("2026-09-10T19:00:00Z") },
  ],
  contacts: [{ id: 9, name: null, createdAt: at("2026-09-17T20:01:00Z") }],
  contactsTotal: 12,
};

const card = (s: ReturnType<typeof buildDashboardSummary>, key: string) => s.cards.find((c) => c.key === key)!;

describe("summary cards", () => {
  it("counts only real records, in the business's own day", () => {
    const s = buildDashboardSummary(base);
    expect(dateKey(NOW, base.timezone)).toBe("2026-09-17");
    expect(card(s, "calls_today").value).toBe(2);
    expect(card(s, "calls_today").detail).toBe("2 answered · 1 test call");
    expect(card(s, "messages_open")).toMatchObject({ value: 1, detail: "1 marked urgent" });
    expect(card(s, "bookings_upcoming").value).toBe(1);
    expect(card(s, "bookings_waiting").value).toBe(1);
    expect(card(s, "contacts_new")).toMatchObject({ value: 1, detail: "12 contacts in total" });
    expect(s.unavailable).toEqual([]);
  });

  it("an unreadable source is not available, never zero", () => {
    const s = buildDashboardSummary({ ...base, calls: null, messages: null, bookings: null, contacts: null, contactsTotal: null });
    for (const c of s.cards) {
      expect(c.value, c.key).toBeNull();
    }
    expect(s.trend).toBeNull();
    expect(s.unavailable).toEqual(["calls", "messages", "bookings", "contacts"]);
    expect(s.activity).toEqual([]);
  });

  it("a business with nothing yet gets counted zeros", () => {
    const s = buildDashboardSummary({ ...base, calls: [], messages: [], bookings: [], contacts: [], contactsTotal: 0 });
    expect(s.cards.map((c) => c.value)).toEqual([0, 0, 0, 0, 0]);
    expect(card(s, "bookings_upcoming").detail).toBe("Nothing booked yet");
  });
});

describe("trend and activity", () => {
  it("has fourteen days ending today, with phone and browser calls apart", () => {
    const s = buildDashboardSummary(base);
    expect(s.trend).toHaveLength(14);
    expect(s.trend!.at(-1)).toEqual({ date: "2026-09-17", telephone: 1, browser: 1 });
    expect(s.trend!.at(-2)).toEqual({ date: "2026-09-16", telephone: 1, browser: 0 });
  });

  it("merges calls, messages, bookings and new contacts, newest first, with drilldown links", () => {
    const s = buildDashboardSummary(base);
    expect(s.activity[0]).toMatchObject({ kind: "call", id: "c2" });
    expect(s.activity.find((a) => a.kind === "booking" && a.id === "b1")).toMatchObject({ title: "Appointment booked", href: "/scheduling/appointments" });
    expect(s.activity.map((a) => a.at)).toEqual([...s.activity.map((a) => a.at)].sort().reverse());
    const urgent = s.activity.find((a) => a.kind === "message" && a.id === "1")!;
    expect(urgent.urgent).toBe(true);
    expect(s.activity.find((a) => a.id === "c1")).toMatchObject({ detail: "Answered · 61s", href: "/activity/calls/c1" });
    expect(s.activity.find((a) => a.id === "c2")?.title).toBe("Browser test call");
    expect(s.activity.find((a) => a.kind === "contact")?.detail).toBe("Unnamed contact");
  });
});
