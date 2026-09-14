// Letting a business choose where its appointments land.
//
// Before this, everything went to whatever Google calls `primary` — not a
// preference anyone expressed, just the only calendar the granted scopes
// could name. The two risks in fixing it are picking a calendar we cannot
// write to, and treating a missing permission as a broken calendar.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { listCalendars, validateSelection, type ListTransport } from "./calendarList.js";
import type { SchedulingCalendarConnection } from "@workspace/db/schema/scheduling";

const CONNECTION = { firmId: 4, calendarId: "primary" } as unknown as SchedulingCalendarConnection;

function transportReturning(status: number, body: unknown): ListTransport {
  return async () => ({ status, body });
}

const ITEMS = [
  { id: "shared@group.calendar.google.com", summary: "Shared clinic", accessRole: "writer" },
  { id: "me@example.com", summary: "Me", accessRole: "owner", primary: true },
  { id: "readonly@group.calendar.google.com", summary: "Holidays", accessRole: "reader" },
];

// `token` takes an explicit object rather than a defaulted parameter: a
// default swallows an explicit `undefined`, which is exactly the value that
// means "the grant is gone" and exactly the case being tested.
const deps = (transport: ListTransport, token: { value: string | undefined } = { value: "tok" }) => ({
  accessTokenFor: async () => token.value,
  transport,
});

describe("reading the account's calendars", () => {
  it("returns each calendar with whether we could write to it", async () => {
    const result = await listCalendars(CONNECTION, deps(transportReturning(200, { items: ITEMS })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calendars.map((c) => [c.name, c.writable])).toEqual([
      ["Me", true],
      ["Holidays", false],
      ["Shared clinic", true],
    ]);
  });

  it("puts the account's own calendar first", async () => {
    const result = await listCalendars(CONNECTION, deps(transportReturning(200, { items: ITEMS })));
    if (!result.ok) return;
    expect(result.calendars[0]?.primary).toBe(true);
  });

  it("prefers the name this account gave a shared calendar", async () => {
    const items = [{ id: "x", summary: "Team calendar", summaryOverride: "Front desk", accessRole: "writer" }];
    const result = await listCalendars(CONNECTION, deps(transportReturning(200, { items })));
    if (!result.ok) return;
    expect(result.calendars[0]?.name).toBe("Front desk");
  });

  it("treats a 403 as a missing permission, not a broken calendar", async () => {
    // An account connected before this scope existed still books perfectly
    // well. Telling it to reconnect is right; telling it the calendar is
    // broken is not.
    const result = await listCalendars(CONNECTION, deps(transportReturning(403, {})));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("needs_permission");
    expect(result.detail).toMatch(/permission/i);
  });

  it("reports a withdrawn grant as revoked", async () => {
    const gone = await listCalendars(CONNECTION, deps(transportReturning(200, { items: ITEMS }), { value: undefined }));
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.reason).toBe("revoked");

    const unauthorized = await listCalendars(CONNECTION, deps(transportReturning(401, {})));
    if (!unauthorized.ok) expect(unauthorized.reason).toBe("revoked");
  });

  it("reports an unreadable list rather than an empty one", async () => {
    for (const [status, body] of [[500, {}], [0, null], [200, { items: "nope" }]] as const) {
      const result = await listCalendars(CONNECTION, deps(transportReturning(status, body)));
      expect(result.ok, String(status)).toBe(false);
      if (!result.ok) expect(result.reason).toBe("unavailable");
    }
  });

  it("skips entries with no usable id rather than inventing one", async () => {
    const items = [{ summary: "No id", accessRole: "owner" }, ITEMS[1]];
    const result = await listCalendars(CONNECTION, deps(transportReturning(200, { items })));
    if (!result.ok) return;
    expect(result.calendars).toHaveLength(1);
  });
});

describe("choosing one", () => {
  const listing = { ok: true as const, calendars: [
    { id: "me@example.com", name: "Me", primary: true, writable: true, accessRole: "owner" },
    { id: "readonly@x", name: "Holidays", primary: false, writable: false, accessRole: "reader" },
  ] };

  it("accepts a calendar this account can write to", () => {
    expect(validateSelection("me@example.com", listing)).toEqual({ ok: true, calendarId: "me@example.com" });
  });

  it("refuses a read-only calendar, because the booking would fail later", () => {
    const result = validateSelection("readonly@x", listing);
    expect(result).toMatchObject({ ok: false, reason: "not_writable" });
  });

  it("refuses an id that is not on this account", () => {
    // Well-formed is not the same as usable. This value becomes the address
    // every future appointment is written to.
    expect(validateSelection("someone-elses@x", listing)).toMatchObject({ ok: false, reason: "unknown_calendar" });
  });

  it("refuses everything when the list could not be read", () => {
    const unreadable = { ok: false as const, reason: "unavailable" as const, detail: "x" };
    expect(validateSelection("me@example.com", unreadable)).toMatchObject({ ok: false, reason: "unreadable" });
  });

  it("refuses a non-string", () => {
    for (const bad of [undefined, null, 42, {}]) {
      expect(validateSelection(bad, listing), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
  });
});
