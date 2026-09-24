import { describe, it, expect, afterEach, vi } from "vitest";
import { NullFreeBusyProvider } from "./NullFreeBusyProvider.js";
import { GoogleFreeBusyProvider } from "./GoogleFreeBusyProvider.js";

describe("NullFreeBusyProvider", () => {
  it("is never connected", async () => {
    const provider = new NullFreeBusyProvider();
    expect(await provider.isConnected(1)).toBe(false);
  });

  it("returns no busy ranges (honest fallback, never fabricated)", async () => {
    const provider = new NullFreeBusyProvider();
    const ranges = await provider.getBusyRanges(1, new Date(), new Date());
    expect(ranges).toEqual([]);
  });
});

describe("GoogleFreeBusyProvider", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("reports not connected when no env vars are configured", async () => {
    delete process.env.GOOGLE_CALENDAR_DEV_ACCESS_TOKEN;
    delete process.env.GOOGLE_CALENDAR_DEV_CALENDAR_ID;
    delete process.env.GOOGLE_CALENDAR_DEV_FIRM_ID;
    const provider = new GoogleFreeBusyProvider();
    expect(await provider.isConnected(1)).toBe(false);
  });

  it("reports not connected for a different firm than the configured one", async () => {
    process.env.GOOGLE_CALENDAR_DEV_ACCESS_TOKEN = "test-token";
    process.env.GOOGLE_CALENDAR_DEV_CALENDAR_ID = "test@example.test";
    process.env.GOOGLE_CALENDAR_DEV_FIRM_ID = "1";
    const provider = new GoogleFreeBusyProvider();
    expect(await provider.isConnected(2)).toBe(false);
    expect(await provider.isConnected(1)).toBe(true);
  });

  it("returns no busy ranges (honest fallback) when not configured, without ever calling fetch", async () => {
    delete process.env.GOOGLE_CALENDAR_DEV_ACCESS_TOKEN;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const provider = new GoogleFreeBusyProvider();
    const ranges = await provider.getBusyRanges(1, new Date(), new Date());
    expect(ranges).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns no busy ranges when the network call fails, never throws", async () => {
    process.env.GOOGLE_CALENDAR_DEV_ACCESS_TOKEN = "test-token";
    process.env.GOOGLE_CALENDAR_DEV_CALENDAR_ID = "test@example.test";
    process.env.GOOGLE_CALENDAR_DEV_FIRM_ID = "1";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const provider = new GoogleFreeBusyProvider();
    const ranges = await provider.getBusyRanges(1, new Date(), new Date());
    expect(ranges).toEqual([]);
  });

  it("parses busy ranges from a successful FreeBusy response and exposes only start/end", async () => {
    process.env.GOOGLE_CALENDAR_DEV_ACCESS_TOKEN = "test-token";
    process.env.GOOGLE_CALENDAR_DEV_CALENDAR_ID = "test@example.test";
    process.env.GOOGLE_CALENDAR_DEV_FIRM_ID = "1";
    const busyResponse = {
      calendars: {
        "test@example.test": {
          busy: [{ start: "2026-08-01T15:00:00Z", end: "2026-08-01T16:00:00Z" }],
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => busyResponse }),
    );
    const provider = new GoogleFreeBusyProvider();
    const ranges = await provider.getBusyRanges(1, new Date(), new Date());
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.startUtc.toISOString()).toBe("2026-08-01T15:00:00.000Z");
    expect(ranges[0]!.endUtc.toISOString()).toBe("2026-08-01T16:00:00.000Z");
    // Only start/end are ever read from the response — no other field
    // (event titles, attendees, etc.) is part of the BusyRange shape at all.
    expect(Object.keys(ranges[0]!)).toEqual(["startUtc", "endUtc"]);
  });

  it("never sends a request when the firmId does not match the configured Development firm", async () => {
    process.env.GOOGLE_CALENDAR_DEV_ACCESS_TOKEN = "test-token";
    process.env.GOOGLE_CALENDAR_DEV_CALENDAR_ID = "test@example.test";
    process.env.GOOGLE_CALENDAR_DEV_FIRM_ID = "1";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const provider = new GoogleFreeBusyProvider();
    const ranges = await provider.getBusyRanges(999, new Date(), new Date());
    expect(ranges).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
