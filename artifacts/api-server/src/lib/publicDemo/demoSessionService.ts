// V5 blueprint §10: the controlled live-demo request lifecycle — cookie
// identity, per-visitor rate limiting, concurrency cap, daily budget cap,
// and a metadata-only in-memory ledger (no persistence: a demo session
// carries no customer data and, on its own, no billing consequence beyond
// the in-process daily-cost counter). Deliberately provider-agnostic: this
// module depends only on the DemoSessionProvider interface
// (demoSessionProvider.ts), never on any concrete provider.

import crypto from "node:crypto";
import { isPublicDemoEnabled, loadDemoCapsFromEnv, DEMO_MAX_SESSION_SECONDS, DEMO_ONE_SESSION_WINDOW_MS } from "./demoConfig.js";
import { createProductionDemoSessionProvider, type DemoSessionProvider } from "./demoSessionProvider.js";

export const DEMO_VISITOR_COOKIE = "sitemint_demo_visitor";

// Process-lifetime signing key, exactly like admin-session.ts's SESSION_TOKEN
// pattern — sufficient here because the entire ledger below is also
// in-memory and process-lifetime; a restart resets both together, and
// nothing about this feature is meant to survive one (there is no live
// provider wired in production regardless — see demoSessionProvider.ts).
const COOKIE_SECRET = crypto.randomBytes(32).toString("hex");

function sign(visitorId: string): string {
  return crypto.createHmac("sha256", COOKIE_SECRET).update(visitorId).digest("hex");
}

/** Builds a fresh signed cookie value. */
function issueVisitorCookie(): { visitorId: string; cookieValue: string } {
  const visitorId = crypto.randomBytes(16).toString("hex");
  return { visitorId, cookieValue: `${visitorId}.${sign(visitorId)}` };
}

/** Verifies a cookie value presented by the client; undefined if missing, malformed, or tampered. */
function verifyVisitorCookie(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const dot = raw.indexOf(".");
  if (dot <= 0) return undefined;
  const visitorId = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const expected = sign(visitorId);
  if (signature.length !== expected.length) return undefined;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return undefined;
  } catch {
    return undefined;
  }
  return visitorId;
}

interface ActiveSession {
  providerSessionId: string;
  visitorId: string;
  startedAt: number;
}

// ── module-level, metadata-only, in-memory ledger ────────────────────────────
const activeSessions = new Map<string, ActiveSession>(); // keyed by providerSessionId
const visitorLastStart = new Map<string, number>(); // visitorId -> epoch ms of most recent start
let costDayKey = "";
let costCentsToday = 0;

function sweepExpired(nowMs: number): void {
  for (const [id, s] of activeSessions) {
    if (nowMs - s.startedAt > DEMO_MAX_SESSION_SECONDS * 1000) activeSessions.delete(id);
  }
}

function rollDailyCostIfNeeded(now: Date): void {
  const key = now.toISOString().slice(0, 10);
  if (key !== costDayKey) {
    costDayKey = key;
    costCentsToday = 0;
  }
}

/** Test-only: fully resets the module-level ledger between test cases. */
export function _resetDemoLedgerForTests(): void {
  activeSessions.clear();
  visitorLastStart.clear();
  costDayKey = "";
  costCentsToday = 0;
}

export interface DemoSessionRequestInput {
  ip: string;
  /** Raw cookie value from the incoming request, if any. */
  cookieHeaderValue: string | undefined;
}

export type DemoSessionResult =
  | { ok: true; providerSessionId: string; expiresInSeconds: number; setCookieValue: string }
  | { ok: false; reason: "disabled" | "not_configured" | "rate_limited" | "concurrency_cap" | "daily_cap" };

export interface DemoSessionServiceDeps {
  provider?: DemoSessionProvider;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

/**
 * Attempts to start one controlled demo session. Every refusal reason maps
 * to the SAME public 503 message (PUBLIC_DEMO_DISABLED_MESSAGE) at the
 * route layer — the reason string here is for logging/tests only, never
 * echoed to the caller.
 */
export async function requestDemoSession(
  input: DemoSessionRequestInput,
  deps: DemoSessionServiceDeps = {},
): Promise<DemoSessionResult> {
  const env = deps.env ?? process.env;
  const now = deps.now?.() ?? new Date();
  const nowMs = now.getTime();

  if (!isPublicDemoEnabled(env)) return { ok: false, reason: "disabled" };

  let caps;
  try {
    caps = loadDemoCapsFromEnv(env);
  } catch {
    return { ok: false, reason: "not_configured" };
  }

  const provider = deps.provider ?? createProductionDemoSessionProvider();

  sweepExpired(nowMs);
  rollDailyCostIfNeeded(now);

  const existingVisitorId = verifyVisitorCookie(input.cookieHeaderValue);
  const visitorId = existingVisitorId ?? issueVisitorCookie().visitorId;

  const lastStart = visitorLastStart.get(visitorId);
  if (lastStart !== undefined && nowMs - lastStart < DEMO_ONE_SESSION_WINDOW_MS) {
    return { ok: false, reason: "rate_limited" };
  }

  if (activeSessions.size >= caps.maxConcurrent) {
    return { ok: false, reason: "concurrency_cap" };
  }

  if (costCentsToday + provider.estimatedCostCentsPerSession > caps.dailyCapCents) {
    return { ok: false, reason: "daily_cap" };
  }

  // The provider call is LAST — every cap above is checked, and the ledger
  // is updated, only once we know a real session would be admitted; a
  // throwing (unconfigured) provider therefore never partially reserves
  // budget or a concurrency slot.
  let handle;
  try {
    handle = await provider.startDemoSession();
  } catch {
    return { ok: false, reason: "not_configured" };
  }

  activeSessions.set(handle.providerSessionId, { providerSessionId: handle.providerSessionId, visitorId, startedAt: nowMs });
  visitorLastStart.set(visitorId, nowMs);
  costCentsToday += provider.estimatedCostCentsPerSession;

  const cookieValue = `${visitorId}.${sign(visitorId)}`;
  return {
    ok: true,
    providerSessionId: handle.providerSessionId,
    expiresInSeconds: DEMO_MAX_SESSION_SECONDS,
    setCookieValue: cookieValue,
  };
}

/** Read-only snapshot for tests/diagnostics — never exposed over HTTP. */
export function _demoLedgerSnapshotForTests(): { activeCount: number; costCentsToday: number } {
  return { activeCount: activeSessions.size, costCentsToday };
}
