// P4: the multi-tenant FreeBusyProvider — per-firm stored connections first,
// falling through to whatever single-workspace provider the environment
// selected (connector / dev token / null). Read-only by the same interface
// contract as every other FreeBusyProvider: busy ranges only, never event
// bodies.
//
// Failure philosophy matches the interface's own doc line ("False is always
// a safe, honest fallback — never an error"): a fetch/refresh failure for a
// connected firm returns [] and records a firm-scoped issue rather than
// taking availability down. Booking still revalidates against internal
// bookings and blocked periods inside the advisory lock, so the worst case
// is offering a slot Google would have shown busy — flagged, never silent.

import type { BusyRange, FreeBusyProvider } from "./FreeBusyProvider.js";
import type { SchedulingCalendarConnection } from "@workspace/db/schema/scheduling";
import {
  loadGoogleOAuthConfig,
  refreshAccessToken,
  type GoogleOAuthConfig,
  type OAuthTransport,
} from "./googleOAuth.js";
import { decryptToken, encryptToken, loadCalendarTokenKey } from "./tokenCrypto.js";

export const GOOGLE_FREEBUSY_ENDPOINT = "https://www.googleapis.com/calendar/v3/freeBusy";

/** Refresh when fewer than this many ms of access-token life remain. */
const ACCESS_TOKEN_MIN_REMAINING_MS = 60_000;

export type FreeBusyTransport = (
  url: string,
  accessToken: string,
  body: Record<string, unknown>,
) => Promise<{ status: number; body: unknown }>;

export const defaultFreeBusyTransport: FreeBusyTransport = async (url, accessToken, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  return { status: response.status, body: parsed };
};

export interface PerFirmProviderDeps {
  getActiveConnection: (firmId: number) => Promise<SchedulingCalendarConnection | undefined>;
  updateAccessToken: (firmId: number, accessTokenEnc: string, expiresAt: Date) => Promise<void>;
  markConnectionRevoked: (firmId: number) => Promise<void>;
  touchFreebusy: (firmId: number) => Promise<void>;
  openIssue: (input: {
    firmId: number;
    level: "warning" | "error";
    code: "calendar_revoked" | "calendar_sync_failed";
    message: string;
    dedupeKey: string;
    context?: Record<string, unknown>;
  }) => Promise<unknown>;
  loadOAuthConfig: () => GoogleOAuthConfig;
  loadTokenKey: () => Buffer;
  oauthTransport?: OAuthTransport;
  freeBusyTransport?: FreeBusyTransport;
  now?: () => Date;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

async function productionDeps(): Promise<PerFirmProviderDeps> {
  const repo = await import("./calendarConnectionsRepository.js");
  const issues = await import("../voiceIssues/voiceIssueService.js");
  return {
    getActiveConnection: repo.getActiveConnection,
    updateAccessToken: repo.updateAccessToken,
    markConnectionRevoked: repo.markConnectionRevoked,
    touchFreebusy: repo.touchFreebusy,
    openIssue: (input) => issues.openVoiceIssue(input),
    loadOAuthConfig: () => loadGoogleOAuthConfig(),
    loadTokenKey: () => loadCalendarTokenKey(),
  };
}

function parseBusyRanges(body: unknown, calendarId: string): BusyRange[] {
  if (typeof body !== "object" || body === null) return [];
  const calendars = (body as Record<string, unknown>).calendars;
  if (typeof calendars !== "object" || calendars === null) return [];
  const calendar = (calendars as Record<string, unknown>)[calendarId];
  if (typeof calendar !== "object" || calendar === null) return [];
  const busy = (calendar as Record<string, unknown>).busy;
  if (!Array.isArray(busy)) return [];
  const ranges: BusyRange[] = [];
  for (const item of busy) {
    if (typeof item !== "object" || item === null) continue;
    const start = (item as Record<string, unknown>).start;
    const end = (item as Record<string, unknown>).end;
    if (typeof start !== "string" || typeof end !== "string") continue;
    const startUtc = new Date(start);
    const endUtc = new Date(end);
    if (Number.isNaN(startUtc.getTime()) || Number.isNaN(endUtc.getTime())) continue;
    ranges.push({ startUtc, endUtc });
  }
  return ranges;
}

export class PerFirmGoogleFreeBusyProvider implements FreeBusyProvider {
  private readonly fallback: FreeBusyProvider;
  private readonly deps?: PerFirmProviderDeps;

  constructor(fallback: FreeBusyProvider, deps?: PerFirmProviderDeps) {
    this.fallback = fallback;
    this.deps = deps;
  }

  private async resolvedDeps(): Promise<PerFirmProviderDeps> {
    return this.deps ?? (await productionDeps());
  }

  async isConnected(firmId: number): Promise<boolean> {
    try {
      const deps = await this.resolvedDeps();
      const connection = await deps.getActiveConnection(firmId);
      if (connection) return true;
    } catch {
      // fall through to the workspace-level provider's answer
    }
    return this.fallback.isConnected(firmId);
  }

  async getBusyRanges(firmId: number, rangeStartUtc: Date, rangeEndUtc: Date): Promise<BusyRange[]> {
    let deps: PerFirmProviderDeps;
    let connection: SchedulingCalendarConnection | undefined;
    try {
      deps = await this.resolvedDeps();
      connection = await deps.getActiveConnection(firmId);
    } catch {
      return this.fallback.getBusyRanges(firmId, rangeStartUtc, rangeEndUtc);
    }
    if (!connection) {
      return this.fallback.getBusyRanges(firmId, rangeStartUtc, rangeEndUtc);
    }

    try {
      const accessToken = await this.ensureAccessToken(firmId, connection, deps);
      if (accessToken === undefined) return []; // revoked mid-flight; issue already recorded

      const transport = deps.freeBusyTransport ?? defaultFreeBusyTransport;
      const { status, body } = await transport(GOOGLE_FREEBUSY_ENDPOINT, accessToken, {
        timeMin: rangeStartUtc.toISOString(),
        timeMax: rangeEndUtc.toISOString(),
        items: [{ id: connection.calendarId }],
      });
      if (status !== 200) {
        await deps.openIssue({
          firmId,
          level: "warning",
          code: "calendar_sync_failed",
          message: "Google free/busy returned a non-success status; availability fell back to internal bookings only.",
          dedupeKey: `freebusy:${firmId}`,
          context: { status },
        });
        return [];
      }
      await deps.touchFreebusy(firmId);
      return parseBusyRanges(body, connection.calendarId);
    } catch (err) {
      try {
        const d = await this.resolvedDeps();
        await d.openIssue({
          firmId,
          level: "warning",
          code: "calendar_sync_failed",
          message: "Reading Google free/busy failed; availability fell back to internal bookings only.",
          dedupeKey: `freebusy:${firmId}`,
          context: { errorClass: err instanceof Error ? err.name : "unknown" },
        });
      } catch { /* best-effort */ }
      return [];
    }
  }

  /** Returns a decrypted, non-stale access token — refreshing (and persisting) when needed. Undefined = revoked. */
  private async ensureAccessToken(
    firmId: number,
    connection: SchedulingCalendarConnection,
    deps: PerFirmProviderDeps,
  ): Promise<string | undefined> {
    const key = deps.loadTokenKey();
    const now = deps.now?.() ?? new Date();

    if (
      connection.accessTokenEnc &&
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() - now.getTime() > ACCESS_TOKEN_MIN_REMAINING_MS
    ) {
      return decryptToken(connection.accessTokenEnc, key);
    }

    const refreshToken = decryptToken(connection.refreshTokenEnc, key);
    const config = deps.loadOAuthConfig();
    const result = await refreshAccessToken(config, refreshToken, deps.oauthTransport);
    if (!result.ok) {
      if (result.reason === "invalid_grant") {
        await deps.markConnectionRevoked(firmId);
        await deps.openIssue({
          firmId,
          level: "error",
          code: "calendar_revoked",
          message: "Google reported the calendar connection's grant as invalid; the firm must reconnect.",
          dedupeKey: `revoked:${firmId}`,
        });
        return undefined;
      }
      throw new Error("token refresh failed");
    }
    const expiresAt = new Date(now.getTime() + result.expiresInSec * 1000);
    await deps.updateAccessToken(firmId, encryptToken(result.accessToken, key), expiresAt);
    return result.accessToken;
  }
}
