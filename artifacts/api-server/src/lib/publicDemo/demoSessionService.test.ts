// V5 blueprint §10 — the controlled live-demo request lifecycle: flag gate,
// missing-caps fail-closed, concurrency cap, daily budget cap, one-per-24h
// via the signed visitor cookie, and cookie tamper-resistance. Every case
// injects a FakeDemoSessionProvider — no real provider, no network, no Vapi
// import anywhere in this module (see the source-scan test in
// publicDemo.test.ts for the "no provider import" proof at the route level).

import { describe, expect, it, beforeEach } from "vitest";
import { requestDemoSession, _resetDemoLedgerForTests, _demoLedgerSnapshotForTests } from "./demoSessionService.js";
import { FakeDemoSessionProvider } from "./demoSessionProvider.js";

const ENABLED_ENV = { PUBLIC_DEMO_ENABLED: "true", PUBLIC_DEMO_MAX_CONCURRENT: "2", PUBLIC_DEMO_DAILY_CAP_CENTS: "1000" };

beforeEach(() => {
  _resetDemoLedgerForTests();
});

describe("requestDemoSession — gating", () => {
  it("refuses when PUBLIC_DEMO_ENABLED is not exactly \"true\"", async () => {
    for (const v of [undefined, "", "TRUE", "1", "yes"]) {
      const env = v === undefined ? {} : { PUBLIC_DEMO_ENABLED: v };
      const result = await requestDemoSession(
        { ip: "1.2.3.4", cookieHeaderValue: undefined },
        { env, provider: new FakeDemoSessionProvider() },
      );
      expect(result).toEqual({ ok: false, reason: "disabled" });
    }
  });

  it("refuses when the caps are not configured, even with the flag on", async () => {
    const result = await requestDemoSession(
      { ip: "1.2.3.4", cookieHeaderValue: undefined },
      { env: { PUBLIC_DEMO_ENABLED: "true" }, provider: new FakeDemoSessionProvider() },
    );
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("refuses when the default (unconfigured) provider throws", async () => {
    const result = await requestDemoSession({ ip: "1.2.3.4", cookieHeaderValue: undefined }, { env: ENABLED_ENV });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("starts a session when enabled, configured, and a working provider is injected", async () => {
    const provider = new FakeDemoSessionProvider();
    const result = await requestDemoSession({ ip: "1.2.3.4", cookieHeaderValue: undefined }, { env: ENABLED_ENV, provider });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.expiresInSeconds).toBe(90);
    expect(provider.started).toHaveLength(1);
    expect(_demoLedgerSnapshotForTests().activeCount).toBe(1);
  });
});

describe("requestDemoSession — caps", () => {
  it("refuses once the concurrency cap is reached", async () => {
    const provider = new FakeDemoSessionProvider();
    const env = { ...ENABLED_ENV, PUBLIC_DEMO_MAX_CONCURRENT: "1" };
    const first = await requestDemoSession({ ip: "1.1.1.1", cookieHeaderValue: undefined }, { env, provider });
    expect(first.ok).toBe(true);
    const second = await requestDemoSession({ ip: "2.2.2.2", cookieHeaderValue: undefined }, { env, provider });
    expect(second).toEqual({ ok: false, reason: "concurrency_cap" });
    expect(provider.started).toHaveLength(1);
  });

  it("frees a concurrency slot once a session ages past the 90s max", async () => {
    const provider = new FakeDemoSessionProvider();
    const env = { ...ENABLED_ENV, PUBLIC_DEMO_MAX_CONCURRENT: "1" };
    let clockMs = 0;
    const now = () => new Date(clockMs);
    const first = await requestDemoSession({ ip: "1.1.1.1", cookieHeaderValue: undefined }, { env, provider, now });
    expect(first.ok).toBe(true);
    clockMs += 91_000;
    const second = await requestDemoSession({ ip: "2.2.2.2", cookieHeaderValue: undefined }, { env, provider, now });
    expect(second.ok).toBe(true);
  });

  it("refuses once the daily budget would be exceeded", async () => {
    const provider = new FakeDemoSessionProvider(600); // 6.00 per session
    const env = { ...ENABLED_ENV, PUBLIC_DEMO_MAX_CONCURRENT: "10", PUBLIC_DEMO_DAILY_CAP_CENTS: "1000" };
    const first = await requestDemoSession({ ip: "1.1.1.1", cookieHeaderValue: undefined }, { env, provider });
    expect(first.ok).toBe(true); // 600 <= 1000
    const second = await requestDemoSession({ ip: "2.2.2.2", cookieHeaderValue: undefined }, { env, provider });
    // 600 + 600 = 1200 > 1000
    expect(second).toEqual({ ok: false, reason: "daily_cap" });
    expect(provider.started).toHaveLength(1);
  });
});

describe("requestDemoSession — one-per-visitor-per-24h", () => {
  it("refuses a second request from the same signed visitor cookie within 24h", async () => {
    const provider = new FakeDemoSessionProvider();
    let clockMs = 0;
    const now = () => new Date(clockMs);
    const first = await requestDemoSession({ ip: "1.1.1.1", cookieHeaderValue: undefined }, { env: ENABLED_ENV, provider, now });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");

    clockMs += 60_000; // one minute later, same visitor cookie presented
    const second = await requestDemoSession({ ip: "1.1.1.1", cookieHeaderValue: first.setCookieValue }, { env: ENABLED_ENV, provider, now });
    expect(second).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("allows a new session once the 24h window has fully elapsed", async () => {
    const provider = new FakeDemoSessionProvider();
    const env = { ...ENABLED_ENV, PUBLIC_DEMO_MAX_CONCURRENT: "10" };
    let clockMs = 0;
    const now = () => new Date(clockMs);
    const first = await requestDemoSession({ ip: "1.1.1.1", cookieHeaderValue: undefined }, { env, provider, now });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");

    clockMs += 24 * 60 * 60 * 1000 + 1000;
    const second = await requestDemoSession({ ip: "1.1.1.1", cookieHeaderValue: first.setCookieValue }, { env, provider, now });
    expect(second.ok).toBe(true);
  });

  it("a tampered cookie is treated as a fresh visitor, not rejected outright", async () => {
    const provider = new FakeDemoSessionProvider();
    const tampered = "attacker-chosen-visitor-id.0000000000000000000000000000000000000000000000000000000000000000";
    const result = await requestDemoSession({ ip: "1.1.1.1", cookieHeaderValue: tampered }, { env: ENABLED_ENV, provider });
    expect(result.ok).toBe(true);
  });
});
