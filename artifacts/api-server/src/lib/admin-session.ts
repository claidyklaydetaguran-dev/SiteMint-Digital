import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, crmAdminSessions, crmAdminAuditLog } from "@workspace/db";
import { getClientIp } from "./authRateLimit.js";
import { SlidingWindowLimiter } from "./contactProtection.js";

// ── Bearer token (unchanged) ─────────────────────────────────────────────────
// Process-lifetime in-memory token, exactly as before. Every existing admin
// route file's local `requireAdmin` (crm.ts, receptionistAdmin.ts,
// adminVoiceDiagnostics.ts, etc.) keeps validating against this and keeps
// working unchanged — O-1 is additive, not a migration of those routes.

const SESSION_TOKEN = crypto.randomBytes(32).toString("hex");

export function getSessionToken(): string {
  return SESSION_TOKEN;
}

export function validateToken(token: string): boolean {
  return token === SESSION_TOKEN;
}

// ── V5 O-1: persistent, cookie-based admin sessions ──────────────────────────
//
// A SECOND, independent admin-auth mode backed by crm_admin_sessions
// (lib/db/src/schema/crmAdminSessions.ts, push-mode). Only the sha256 HEX of
// the raw token is ever stored or logged; the raw value lives only in the
// httpOnly cookie handed to the browser once, at login.
//
// 12h idle (lastSeenAt, refreshed on every successful validation) / 7d
// absolute (expiresAt, fixed at creation) — whichever triggers first ends
// the session. `revokedAt` ends it early (logout).
//
// Degrade-gracefully contract: crm_admin_sessions / crm_admin_audit_log are
// push-mode tables that may not exist yet in a given environment (this PR
// ships the schema FILES only — see MIGRATION-PACKET.md; nothing here runs
// `push`). Every function that touches them is wrapped so a missing table,
// or any other DB error, degrades to "cookie mode unavailable" rather than
// throwing — the bearer path (already the entire admin UI today) is
// completely unaffected, and the server keeps booting normally either way.

export const ADMIN_COOKIE_NAME = "admin_session";

const ADMIN_SESSION_IDLE_MS = 12 * 60 * 60 * 1000; // 12h
const ADMIN_SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7d

export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: ADMIN_SESSION_ABSOLUTE_MS,
  path: "/",
};

function hashAdminToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export interface CreatedAdminSession {
  token: string;
  expiresAt: Date;
}

/**
 * Issues a new cookie-backed admin session. Returns undefined (never throws)
 * when the session cannot be persisted — a not-yet-migrated table, or any
 * other DB error — so the caller can fall back to bearer-only.
 */
export async function createAdminSession(
  ip: string | undefined,
  userAgent: string | undefined,
): Promise<CreatedAdminSession | undefined> {
  const now = new Date();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_ABSOLUTE_MS);
  try {
    await db.insert(crmAdminSessions).values({
      tokenHash: hashAdminToken(token),
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });
    return { token, expiresAt };
  } catch {
    return undefined;
  }
}

/**
 * Validates a raw cookie token against crm_admin_sessions: unrevoked,
 * unexpired (absolute), and not idle for more than 12h. On success, slides
 * the idle window forward (best-effort — a failure to touch lastSeenAt does
 * not invalidate an otherwise-valid session for this request).
 */
async function validateAdminSessionCookie(rawToken: string): Promise<boolean> {
  const now = new Date();
  try {
    const tokenHash = hashAdminToken(rawToken);
    const [row] = await db
      .select()
      .from(crmAdminSessions)
      .where(
        and(
          eq(crmAdminSessions.tokenHash, tokenHash),
          isNull(crmAdminSessions.revokedAt),
          gt(crmAdminSessions.expiresAt, now),
        ),
      )
      .limit(1);
    if (!row) return false;
    if (now.getTime() - row.lastSeenAt.getTime() > ADMIN_SESSION_IDLE_MS) return false;
    try {
      await db.update(crmAdminSessions).set({ lastSeenAt: now }).where(eq(crmAdminSessions.id, row.id));
    } catch {
      // best-effort idle-window refresh; the session is still valid for THIS request
    }
    return true;
  } catch {
    return false;
  }
}

/** Revokes a session by its raw cookie token. Best-effort; never throws. */
export async function revokeAdminSession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  try {
    await db
      .update(crmAdminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(crmAdminSessions.tokenHash, hashAdminToken(rawToken)));
  } catch {
    // best-effort
  }
}

/** Append-only admin audit trail. Best-effort; an audit failure must never undo or block the audited action. */
export async function recordAdminAudit(
  actor: string,
  action: string,
  target: string | null,
  ip: string | undefined,
): Promise<void> {
  try {
    await db.insert(crmAdminAuditLog).values({ actor, action, target, ip: ip ?? null });
  } catch {
    // best-effort
  }
}

/** Which mode authenticated the current request, for GET /api/admin/me. */
export async function resolveAdminAuthMode(req: Request): Promise<"bearer" | "cookie" | undefined> {
  const auth = req.headers.authorization ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (bearer && validateToken(bearer)) return "bearer";
  const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[ADMIN_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.length > 0 && (await validateAdminSessionCookie(cookieToken))) {
    return "cookie";
  }
  return undefined;
}

/**
 * Shared admin gate for NEW routes: accepts EITHER the existing in-memory
 * bearer token OR a valid `admin_session` cookie. Existing admin route
 * files each define their OWN local, bearer-only `requireAdmin` — those are
 * intentionally left as-is (keeping the bearer path "working unchanged" per
 * the O-1 brief); new admin surfaces should import this one instead so both
 * modes work uniformly from day one.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const mode = await resolveAdminAuthMode(req);
  if (mode) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}

// ── Login rate limiting ──────────────────────────────────────────────────────
// Self-contained, like publicSchedulingProtection.ts / contactProtection.ts —
// authRateLimit.ts (protected) is never imported for its internals, only for
// the one helper it already exports (getClientIp). 10 attempts / 15 min per
// IP mirrors the receptionist login IP limiter's order of magnitude.

export const ADMIN_LOGIN_IP_LIMIT = 10;
export const ADMIN_LOGIN_IP_WINDOW = 15 * 60 * 1000;
const PURGE_INTERVAL = 5 * 60 * 1000;

export const adminLoginIpLimiter = new SlidingWindowLimiter(ADMIN_LOGIN_IP_LIMIT, ADMIN_LOGIN_IP_WINDOW);

setInterval(() => {
  adminLoginIpLimiter.purgeStale();
}, PURGE_INTERVAL).unref();

export { getClientIp };
