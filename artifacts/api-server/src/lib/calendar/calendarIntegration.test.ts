// P4 — per-firm calendar truth: token crypto, PKCE/OAuth protocol logic,
// the per-firm free/busy provider, the narrow event writer, and the
// booked↔calendar sync — all against fakes; no socket, no database.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { randomBytes, createHash } from "node:crypto";
import {
  CALENDAR_TOKEN_KEY_ENV_VAR,
  decryptToken,
  encryptToken,
  isCalendarTokenKeyConfigured,
  loadCalendarTokenKey,
  TokenCryptoError,
} from "./tokenCrypto.js";
import {
  buildGoogleAuthUrl,
  challengeFromVerifier,
  exchangeAuthorizationCode,
  generatePkcePair,
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  hashOauthState,
  isCalendarConnectEnabled,
  loadGoogleOAuthConfig,
  refreshAccessToken,
  type GoogleOAuthConfig,
  type OAuthTransport,
} from "./googleOAuth.js";
import {
  GOOGLE_FREEBUSY_ENDPOINT,
  PerFirmGoogleFreeBusyProvider,
  type PerFirmProviderDeps,
} from "./PerFirmGoogleFreeBusyProvider.js";
import type { BusyRange, FreeBusyProvider } from "./FreeBusyProvider.js";
import { buildEventBody, GoogleCalendarEventWriter, type EventsTransport } from "./eventWriter.js";
import {
  approveRequestToBooked,
  isCalendarWriteEnabled,
  removeCalendarEventForRequest,
  type CalendarSyncDeps,
} from "./calendarEventSync.js";
import type { SchedulingAppointmentRequest, SchedulingCalendarConnection } from "@workspace/db/schema/scheduling";

const KEY = randomBytes(32);
const OAUTH: GoogleOAuthConfig = {
  clientId: "client-id-1",
  clientSecret: "client-secret-1",
  redirectUri: "https://app.example.com/api/receptionist/calendar/google/callback",
};
const NOW = new Date("2026-08-31T12:00:00.000Z");

function connection(overrides: Partial<SchedulingCalendarConnection> = {}): SchedulingCalendarConnection {
  return {
    id: 1,
    firmId: 7,
    provider: "google",
    status: "active",
    accountLabel: null,
    calendarId: "primary",
    refreshTokenEnc: encryptToken("refresh-token-plain", KEY),
    accessTokenEnc: encryptToken("access-token-plain", KEY),
    accessTokenExpiresAt: new Date(NOW.getTime() + 30 * 60_000),
    scope: "freebusy events",
    lastFreebusyAt: null,
    lastErrorAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as SchedulingCalendarConnection;
}

function request(overrides: Partial<SchedulingAppointmentRequest> = {}): SchedulingAppointmentRequest {
  return {
    id: 11,
    publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    firmId: 7,
    appointmentTypeId: 3,
    source: "ai_receptionist",
    status: "pending_review",
    requestedStartAt: new Date("2026-09-01T14:00:00.000Z"),
    requestedEndAt: new Date("2026-09-01T14:30:00.000Z"),
    timezone: "America/New_York",
    customerName: "Pat Caller",
    customerEmail: "pat@example.com",
    customerPhone: "+15550001111",
    notes: null,
    phoneConsent: true,
    smsConsent: true,
    emailConsent: false,
    providerEventId: null,
    providerCalendarId: null,
    holdExpiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    cancelledAt: null,
  } as SchedulingAppointmentRequest;
}

// ── token crypto ─────────────────────────────────────────────────────────────

describe("tokenCrypto", () => {
  it("round-trips and produces unique envelopes per encryption", () => {
    const a = encryptToken("secret-value", KEY);
    const b = encryptToken("secret-value", KEY);
    expect(a).not.toBe(b); // fresh IV every time
    expect(decryptToken(a, KEY)).toBe("secret-value");
    expect(decryptToken(b, KEY)).toBe("secret-value");
  });

  it("rejects tampered envelopes and wrong keys indistinguishably", () => {
    const envelope = encryptToken("secret-value", KEY);
    const bytes = Buffer.from(envelope, "base64url");
    bytes[bytes.length - 1] ^= 0xff;
    expect(() => decryptToken(bytes.toString("base64url"), KEY)).toThrow(TokenCryptoError);
    expect(() => decryptToken(envelope, randomBytes(32))).toThrow(TokenCryptoError);
  });

  it("fail-closed key loading: missing, non-base64, wrong length", () => {
    expect(() => loadCalendarTokenKey({})).toThrow(TokenCryptoError);
    expect(() => loadCalendarTokenKey({ [CALENDAR_TOKEN_KEY_ENV_VAR]: Buffer.from("short").toString("base64") })).toThrow(
      TokenCryptoError,
    );
    expect(isCalendarTokenKeyConfigured({ [CALENDAR_TOKEN_KEY_ENV_VAR]: KEY.toString("base64") })).toBe(true);
    expect(isCalendarTokenKeyConfigured({})).toBe(false);
  });
});

// ── OAuth protocol logic ─────────────────────────────────────────────────────

describe("googleOAuth", () => {
  it("PKCE challenge is the base64url SHA-256 of the verifier", () => {
    const { verifier, challenge } = generatePkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash("sha256").update(verifier, "ascii").digest("base64url"));
    expect(challengeFromVerifier("fixed-verifier")).toBe(
      createHash("sha256").update("fixed-verifier", "ascii").digest("base64url"),
    );
  });

  it("builds the authorization URL against the pinned host with S256 + offline + consent", () => {
    const url = new URL(buildGoogleAuthUrl(OAUTH, "state-123", "challenge-abc"));
    expect(url.origin + url.pathname).toBe(GOOGLE_AUTH_ENDPOINT);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toContain("calendar.freebusy");
    expect(url.searchParams.get("scope")).toContain("calendar.events");
  });

  it("exchanges a code with the verifier and parses success/invalid_grant/provider_error", async () => {
    const seen: Array<Record<string, string>> = [];
    const transport: OAuthTransport = async (url, form) => {
      expect(url).toBe(GOOGLE_TOKEN_ENDPOINT);
      seen.push(form);
      return { status: 200, body: { access_token: "at", expires_in: 3600, refresh_token: "rt", scope: "s" } };
    };
    const ok = await exchangeAuthorizationCode(OAUTH, "the-code", "the-verifier", transport);
    expect(ok).toEqual({ ok: true, accessToken: "at", expiresInSec: 3600, refreshToken: "rt", scope: "s" });
    expect(seen[0]).toMatchObject({ grant_type: "authorization_code", code: "the-code", code_verifier: "the-verifier" });

    const invalid = await refreshAccessToken(OAUTH, "rt", async () => ({ status: 400, body: { error: "invalid_grant" } }));
    expect(invalid).toEqual({ ok: false, reason: "invalid_grant" });
    const broken = await refreshAccessToken(OAUTH, "rt", async () => ({ status: 500, body: undefined }));
    expect(broken).toEqual({ ok: false, reason: "provider_error" });
  });

  it("flags and config are fail-closed and exact", () => {
    expect(isCalendarConnectEnabled({})).toBe(false);
    expect(isCalendarConnectEnabled({ CALENDAR_CONNECT_ENABLED: "TRUE" })).toBe(false);
    expect(isCalendarConnectEnabled({ CALENDAR_CONNECT_ENABLED: "true" })).toBe(true);
    expect(() => loadGoogleOAuthConfig({})).toThrow(/GOOGLE_OAUTH_CLIENT_ID/);
    expect(() =>
      loadGoogleOAuthConfig({
        GOOGLE_OAUTH_CLIENT_ID: "x",
        GOOGLE_OAUTH_CLIENT_SECRET: "y",
        GOOGLE_OAUTH_REDIRECT_URI: "http://insecure.example/cb",
      }),
    ).toThrow(/https/);
    expect(hashOauthState("abc")).toHaveLength(64);
  });
});

// ── per-firm free/busy provider ──────────────────────────────────────────────

class RecordingFallback implements FreeBusyProvider {
  isConnectedCalls = 0;
  busyCalls = 0;
  async isConnected(): Promise<boolean> {
    this.isConnectedCalls += 1;
    return false;
  }
  async getBusyRanges(): Promise<BusyRange[]> {
    this.busyCalls += 1;
    return [];
  }
}

function providerDeps(overrides: Partial<PerFirmProviderDeps> = {}): {
  deps: PerFirmProviderDeps;
  issues: Array<{ code: string }>;
  updates: Array<{ firmId: number; expiresAt: Date }>;
  revoked: number[];
} {
  const issues: Array<{ code: string }> = [];
  const updates: Array<{ firmId: number; expiresAt: Date }> = [];
  const revoked: number[] = [];
  const deps: PerFirmProviderDeps = {
    getActiveConnection: async () => connection(),
    updateAccessToken: async (firmId, _enc, expiresAt) => {
      updates.push({ firmId, expiresAt });
    },
    markConnectionRevoked: async (firmId) => {
      revoked.push(firmId);
    },
    touchFreebusy: async () => {},
    openIssue: async (input) => {
      issues.push({ code: input.code });
      return {};
    },
    loadOAuthConfig: () => OAUTH,
    loadTokenKey: () => KEY,
    now: () => NOW,
    ...overrides,
  };
  return { deps, issues, updates, revoked };
}

describe("PerFirmGoogleFreeBusyProvider", () => {
  it("falls through to the workspace-level provider when the firm has no connection", async () => {
    const fallback = new RecordingFallback();
    const { deps } = providerDeps({ getActiveConnection: async () => undefined });
    const provider = new PerFirmGoogleFreeBusyProvider(fallback, deps);
    expect(await provider.isConnected(7)).toBe(false);
    expect(await provider.getBusyRanges(7, NOW, new Date(NOW.getTime() + 3600_000))).toEqual([]);
    expect(fallback.isConnectedCalls).toBe(1);
    expect(fallback.busyCalls).toBe(1);
  });

  it("uses a fresh access token directly and parses busy ranges", async () => {
    const fallback = new RecordingFallback();
    const calls: Array<{ url: string; token: string; body: Record<string, unknown> }> = [];
    const { deps } = providerDeps({
      freeBusyTransport: async (url, token, body) => {
        calls.push({ url, token, body });
        return {
          status: 200,
          body: {
            calendars: {
              primary: { busy: [{ start: "2026-09-01T15:00:00Z", end: "2026-09-01T16:00:00Z" }, { start: "bad", end: "x" }] },
            },
          },
        };
      },
    });
    const provider = new PerFirmGoogleFreeBusyProvider(fallback, deps);
    const ranges = await provider.getBusyRanges(7, NOW, new Date(NOW.getTime() + 86_400_000));
    expect(calls[0]!.url).toBe(GOOGLE_FREEBUSY_ENDPOINT);
    expect(calls[0]!.token).toBe("access-token-plain");
    expect(calls[0]!.body.items).toEqual([{ id: "primary" }]);
    expect(ranges).toEqual([
      { startUtc: new Date("2026-09-01T15:00:00Z"), endUtc: new Date("2026-09-01T16:00:00Z") },
    ]);
    expect(fallback.busyCalls).toBe(0);
  });

  it("refreshes a stale token, persists the new envelope, then queries", async () => {
    const fallback = new RecordingFallback();
    const { deps, updates } = providerDeps({
      getActiveConnection: async () =>
        connection({ accessTokenExpiresAt: new Date(NOW.getTime() + 10_000) }), // < 60s remaining
      oauthTransport: async (_url, form) => {
        expect(form.grant_type).toBe("refresh_token");
        expect(form.refresh_token).toBe("refresh-token-plain");
        return { status: 200, body: { access_token: "fresh-token", expires_in: 3600 } };
      },
      freeBusyTransport: async (_url, token) => {
        expect(token).toBe("fresh-token");
        return { status: 200, body: { calendars: { primary: { busy: [] } } } };
      },
    });
    const provider = new PerFirmGoogleFreeBusyProvider(fallback, deps);
    await provider.getBusyRanges(7, NOW, new Date(NOW.getTime() + 3600_000));
    expect(updates).toHaveLength(1);
    expect(updates[0]!.expiresAt.getTime()).toBe(NOW.getTime() + 3600_000);
  });

  it("marks the connection revoked on invalid_grant and records the issue", async () => {
    const fallback = new RecordingFallback();
    const { deps, issues, revoked } = providerDeps({
      getActiveConnection: async () => connection({ accessTokenEnc: null, accessTokenExpiresAt: null }),
      oauthTransport: async () => ({ status: 400, body: { error: "invalid_grant" } }),
    });
    const provider = new PerFirmGoogleFreeBusyProvider(fallback, deps);
    const ranges = await provider.getBusyRanges(7, NOW, new Date(NOW.getTime() + 3600_000));
    expect(ranges).toEqual([]);
    expect(revoked).toEqual([7]);
    expect(issues).toEqual([{ code: "calendar_revoked" }]);
  });

  it("degrades to internal-only availability (with an issue) on a provider error", async () => {
    const fallback = new RecordingFallback();
    const { deps, issues } = providerDeps({
      freeBusyTransport: async () => ({ status: 403, body: undefined }),
    });
    const provider = new PerFirmGoogleFreeBusyProvider(fallback, deps);
    const ranges = await provider.getBusyRanges(7, NOW, new Date(NOW.getTime() + 3600_000));
    expect(ranges).toEqual([]);
    expect(issues).toEqual([{ code: "calendar_sync_failed" }]);
  });
});

// ── event writer ─────────────────────────────────────────────────────────────

describe("event writer", () => {
  beforeEach(() => {
    vi.stubEnv(CALENDAR_TOKEN_KEY_ENV_VAR, KEY.toString("base64"));
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", OAUTH.clientId);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", OAUTH.clientSecret);
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", OAUTH.redirectUri);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds an event body with the dedupe iCalUID and no contact fields", () => {
    const body = buildEventBody({
      requestPublicId: "pub-1",
      summary: "Appointment — Pat",
      startUtc: new Date("2026-09-01T14:00:00Z"),
      endUtc: new Date("2026-09-01T14:30:00Z"),
      timezone: "America/New_York",
    });
    expect(body.iCalUID).toBe("pub-1@sitemint.digital");
    expect(body.start).toEqual({ dateTime: "2026-09-01T14:00:00.000Z", timeZone: "America/New_York" });
    expect(JSON.stringify(body)).not.toContain("pat@example.com");
    expect(JSON.stringify(body)).not.toContain("+1555");
  });

  it("inserts against the connection's calendar and tolerates 404 on delete", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const transport: EventsTransport = async (method, url) => {
      calls.push({ method, url });
      if (method === "POST") return { status: 200, body: { id: "evt-1" } };
      return { status: 404, body: undefined };
    };
    const writer = new GoogleCalendarEventWriter({ transport, now: () => NOW });
    const conn = connection();
    const inserted = await writer.insertEvent(conn, {
      requestPublicId: "pub-1",
      summary: "Appointment — Pat",
      startUtc: new Date("2026-09-01T14:00:00Z"),
      endUtc: new Date("2026-09-01T14:30:00Z"),
      timezone: "UTC",
    });
    expect(inserted).toEqual({ ok: true, eventId: "evt-1" });
    expect(calls[0]!.url).toContain("/calendars/primary/events");

    const deleted = await writer.deleteEvent(conn, "evt-1");
    expect(deleted).toEqual({ ok: true }); // 404 = already gone = success
  });
});

// ── booked ↔ calendar sync ───────────────────────────────────────────────────

function syncDeps(overrides: Partial<CalendarSyncDeps> = {}): {
  deps: CalendarSyncDeps;
  inserted: string[];
  deletedEvents: string[];
  booked: Array<{ eventId: string; calendarId: string }>;
  cleared: number[];
  issues: string[];
} {
  const inserted: string[] = [];
  const deletedEvents: string[] = [];
  const booked: Array<{ eventId: string; calendarId: string }> = [];
  const cleared: number[] = [];
  const issues: string[] = [];
  const deps: CalendarSyncDeps = {
    isEnabled: () => true,
    getActiveConnection: async () => connection(),
    writer: {
      insertEvent: async (_c, input) => {
        inserted.push(input.requestPublicId);
        return { ok: true, eventId: "evt-9" };
      },
      patchEventTimes: async () => ({ ok: true, eventId: "evt-9" }),
      deleteEvent: async (_c, eventId) => {
        deletedEvents.push(eventId);
        return { ok: true };
      },
    },
    findRequest: async () => request(),
    markBooked: async (_f, _id, eventId, calendarId) => {
      booked.push({ eventId, calendarId });
      return true;
    },
    clearProviderEvent: async (_f, id) => {
      cleared.push(id);
    },
    openIssue: async (input) => {
      issues.push(input.code);
      return {};
    },
    ...overrides,
  };
  return { deps, inserted, deletedEvents, booked, cleared, issues };
}

describe("calendarEventSync", () => {
  it("write flag is exact and off by default", () => {
    expect(isCalendarWriteEnabled({})).toBe(false);
    expect(isCalendarWriteEnabled({ CALENDAR_WRITE_ENABLED: "TRUE" })).toBe(false);
    expect(isCalendarWriteEnabled({ CALENDAR_WRITE_ENABLED: "true" })).toBe(true);
  });

  it("approve: disabled → nothing runs; unknown → not_found; wrong status → not_approvable; booked → idempotent", async () => {
    const disabled = syncDeps({ isEnabled: () => false });
    expect(await approveRequestToBooked(7, "pub", disabled.deps)).toBe("disabled");
    expect(disabled.inserted).toHaveLength(0);

    const missing = syncDeps({ findRequest: async () => undefined });
    expect(await approveRequestToBooked(7, "pub", missing.deps)).toBe("not_found");

    const cancelled = syncDeps({ findRequest: async () => request({ status: "cancelled" }) });
    expect(await approveRequestToBooked(7, "pub", cancelled.deps)).toBe("not_approvable");

    const already = syncDeps({ findRequest: async () => request({ status: "booked", providerEventId: "evt-1", providerCalendarId: "primary" }) });
    expect(await approveRequestToBooked(7, "pub", already.deps)).toBe("booked");
    expect(already.inserted).toHaveLength(0);
  });

  it("approve happy path: event first, then the guarded booked-stamp with both ids", async () => {
    const { deps, inserted, booked } = syncDeps();
    expect(await approveRequestToBooked(7, "pub", deps)).toBe("booked");
    expect(inserted).toEqual([request().publicId]);
    expect(booked).toEqual([{ eventId: "evt-9", calendarId: "primary" }]);
  });

  it("approve write-failure: issue recorded, no stamp; revoked maps to calendar_revoked", async () => {
    const failed = syncDeps({
      writer: {
        insertEvent: async () => ({ ok: false, reason: "revoked" }),
        patchEventTimes: async () => ({ ok: false, reason: "provider_error" }),
        deleteEvent: async () => ({ ok: true }),
      },
    });
    expect(await approveRequestToBooked(7, "pub", failed.deps)).toBe("event_write_failed");
    expect(failed.booked).toHaveLength(0);
    expect(failed.issues).toEqual(["calendar_revoked"]);
  });

  it("approve race: stamp fails → the just-written event is deleted (no orphan)", async () => {
    const raced = syncDeps({ markBooked: async () => false });
    expect(await approveRequestToBooked(7, "pub", raced.deps)).toBe("conflict_after_write");
    expect(raced.deletedEvents).toEqual(["evt-9"]);
  });

  it("removal: skips when no event id; deletes and clears when present; failure records an issue", async () => {
    const skip = syncDeps();
    expect(await removeCalendarEventForRequest(request(), skip.deps)).toBe("skipped");

    const withEvent = request({ status: "cancelled", providerEventId: "evt-5", providerCalendarId: "primary" });
    const del = syncDeps();
    expect(await removeCalendarEventForRequest(withEvent, del.deps)).toBe("deleted");
    expect(del.deletedEvents).toEqual(["evt-5"]);
    expect(del.cleared).toEqual([request().id]);

    const failing = syncDeps({
      writer: {
        insertEvent: async () => ({ ok: true, eventId: "x" }),
        patchEventTimes: async () => ({ ok: true, eventId: "x" }),
        deleteEvent: async () => ({ ok: false, reason: "provider_error" }),
      },
    });
    expect(await removeCalendarEventForRequest(withEvent, failing.deps)).toBe("failed");
    expect(failing.issues).toEqual(["calendar_sync_failed"]);
  });
});
