// The calendar connection report.
//
// The case that motivates all of this: an owner removes SiteMint's access from
// their Google account. Nothing works from that moment — but the connection row
// stays `active` until something tries to use it and marks it revoked, and the
// only signal the dashboard had was "a row exists". So it showed a healthy
// connection while every approval silently failed.

import { describe, expect, it } from "vitest";
import { assessConnectionHealth, type ConnectionSnapshot } from "./connectionHealth.js";

const CONNECTED_AT = new Date("2026-09-01T09:00:00.000Z");

function snapshot(overrides: Partial<ConnectionSnapshot> = {}): ConnectionSnapshot {
  return {
    status: "active",
    provider: "google",
    accountLabel: "o…@business.co.uk",
    calendarId: "primary",
    lastFreebusyAt: null,
    lastErrorAt: null,
    createdAt: CONNECTED_AT,
    ...overrides,
  };
}

describe("calendar connection health", () => {
  it("reports nothing connected when there is no row", () => {
    const health = assessConnectionHealth(undefined);
    expect(health.state).toBe("not_connected");
    expect(health.usable).toBe(false);
    expect(health.accountLabel).toBeNull();
  });

  it("reports a revoked connection as unusable", () => {
    const health = assessConnectionHealth(snapshot({ status: "revoked", lastFreebusyAt: new Date("2026-09-10T09:00:00.000Z") }));
    expect(health.state).toBe("revoked");
    // The key assertion: a successful read BEFORE access was withdrawn must not
    // make it look like it still works.
    expect(health.usable).toBe(false);
  });

  it("treats an unrecognised status as unusable rather than healthy", () => {
    // A status added later must not start life being reported as working.
    const health = assessConnectionHealth(snapshot({ status: "suspended_for_billing" }));
    expect(health.usable).toBe(false);
  });

  it("distinguishes set up from working", () => {
    // Connected but never used: honest, and not the same as "healthy".
    expect(assessConnectionHealth(snapshot()).state).toBe("untested");
    expect(assessConnectionHealth(snapshot()).usable).toBe(true);

    const worked = assessConnectionHealth(snapshot({ lastFreebusyAt: new Date("2026-09-11T09:00:00.000Z") }));
    expect(worked.state).toBe("healthy");
  });

  it("reports failing when the most recent attempt failed", () => {
    const health = assessConnectionHealth(
      snapshot({
        lastFreebusyAt: new Date("2026-09-11T09:00:00.000Z"),
        lastErrorAt: new Date("2026-09-11T10:00:00.000Z"),
      }),
    );
    expect(health.state).toBe("failing");
    // Credentials have not been withdrawn — a provider outage looks like this —
    // so it stays usable, but the business is not shown a healthy tick.
    expect(health.usable).toBe(true);
  });

  it("reports healthy again once a later attempt succeeds", () => {
    const health = assessConnectionHealth(
      snapshot({
        lastErrorAt: new Date("2026-09-11T09:00:00.000Z"),
        lastFreebusyAt: new Date("2026-09-11T10:00:00.000Z"),
      }),
    );
    expect(health.state).toBe("healthy");
  });

  it("treats an error with no prior success as failing, not untested", () => {
    const health = assessConnectionHealth(snapshot({ lastErrorAt: new Date("2026-09-11T09:00:00.000Z") }));
    expect(health.state).toBe("failing");
  });

  it("carries the details a business needs to recognise the connection", () => {
    const health = assessConnectionHealth(snapshot({ calendarId: "team@group.calendar.google.com" }));
    expect(health.provider).toBe("google");
    expect(health.accountLabel).toBe("o…@business.co.uk");
    expect(health.calendarId).toBe("team@group.calendar.google.com");
    expect(health.connectedAt).toBe(CONNECTED_AT.toISOString());
  });

  it("carries no token material", () => {
    const health = assessConnectionHealth(snapshot());
    const serialized = JSON.stringify(health);
    for (const forbidden of ["refresh", "access_token", "accessToken", "refreshTokenEnc", "scope"]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });
});
