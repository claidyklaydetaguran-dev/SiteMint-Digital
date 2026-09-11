// ── M1: durable, per-person CRM authentication ──────────────────────────────
//
// Replaces the process-lifetime shared bearer token for staff surfaces. Every
// property the old token lacked is here: the session belongs to a known
// person, survives a restart, expires on both idle and absolute clocks, can be
// revoked individually or all at once, and carries CSRF protection.
//
// Fail-closed on purpose. The older `admin-session.ts` cookie path deliberately
// degrades to "cookie mode unavailable" when its tables are missing, because a
// working bearer path sat behind it. Nothing sits behind THIS one, so a
// database failure must deny the request rather than wave it through.

import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import {
  db, crmStaff, crmStaffSessions, crmStaffLoginAttempts, crmAdminAuditLog,
  type CrmStaff,
} from "@workspace/db";
import { generateToken, hashToken } from "./staffCredentials.js";
import {
  effectivePermissions, hasPermission, type Permission,
} from "./staffPermissions.js";

export const STAFF_COOKIE_NAME = "crm_staff_session";
export const CSRF_HEADER = "x-csrf-token";

const IDLE_MS = 12 * 60 * 60 * 1000;      // 12h without activity ends a session
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7d maximum lifetime, no sliding

export function staffCookieOptions(maxAgeMs = ABSOLUTE_MS) {
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    // `lax` still sends the cookie on top-level navigation back into the CRM,
    // but not on cross-site subrequests; mutations additionally require the
    // CSRF header, which a cross-site caller cannot read.
    sameSite: "lax" as const,
    maxAge: maxAgeMs,
    path: "/",
  };
}

// ── Client address derivation ───────────────────────────────────────────────
//
// `X-Forwarded-For` is client-controllable unless you know exactly how many
// proxies you sit behind: the client can prepend arbitrary entries, so the
// leftmost value is attacker-chosen and even "rightmost" is only correct for a
// single known hop. `TRUSTED_PROXY_HOPS` states the real topology.
//
// Default 0 = trust nothing, use the socket address. That is the fail-closed
// choice: behind a proxy every request then shares one bucket, which throttles
// too aggressively rather than not at all.

export function trustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["TRUSTED_PROXY_HOPS"];
  if (raw === undefined) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 0;
}

export function deriveClientIp(req: Request, hops = trustedProxyHops()): string {
  if (hops === 0) return req.socket.remoteAddress ?? "unknown";
  const header = req.headers["x-forwarded-for"];
  const raw = Array.isArray(header) ? header.join(",") : header ?? "";
  const chain = raw.split(",").map((s) => s.trim()).filter(Boolean);
  // Each proxy APPENDS the address it received the connection from, so the
  // rightmost `hops` entries are the ones our own infrastructure wrote. The
  // leftmost of those is the address the outermost trusted proxy actually
  // observed — everything further left was supplied by the caller and is
  // therefore forgeable. A chain shorter than the configured topology means
  // the request did not traverse it, so fall back to the socket.
  const idx = chain.length - hops;
  if (idx < 0 || idx >= chain.length) return req.socket.remoteAddress ?? "unknown";
  return chain[idx] ?? req.socket.remoteAddress ?? "unknown";
}

// ── Attempt throttling (database-backed, multi-instance safe) ───────────────

export const LOGIN_IP_LIMIT = 20;
export const LOGIN_ACCOUNT_LIMIT = 8;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function recordLoginAttempt(scope: "ip" | "account", subject: string): Promise<void> {
  try {
    await db.insert(crmStaffLoginAttempts).values({ scope, subject: subject.slice(0, 200) });
  } catch { /* throttling must never be the reason a request 500s */ }
}

/** True when the caller has exceeded the window and must be refused. */
export async function isThrottled(scope: "ip" | "account", subject: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const limit = scope === "ip" ? LOGIN_IP_LIMIT : LOGIN_ACCOUNT_LIMIT;
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(crmStaffLoginAttempts)
      .where(and(
        eq(crmStaffLoginAttempts.scope, scope),
        eq(crmStaffLoginAttempts.subject, subject.slice(0, 200)),
        gte(crmStaffLoginAttempts.createdAt, since),
      ));
    return Number(row?.count ?? 0) >= limit;
  } catch {
    // Cannot read the ledger: refuse rather than allow unlimited attempts.
    return true;
  }
}

export async function clearLoginAttempts(scope: "ip" | "account", subject: string): Promise<void> {
  try {
    await db.delete(crmStaffLoginAttempts).where(and(
      eq(crmStaffLoginAttempts.scope, scope),
      eq(crmStaffLoginAttempts.subject, subject.slice(0, 200)),
    ));
  } catch { /* best effort */ }
}

export async function pruneLoginAttempts(): Promise<void> {
  try {
    await db.delete(crmStaffLoginAttempts)
      .where(sql`${crmStaffLoginAttempts.createdAt} < now() - interval '1 hour'`);
  } catch { /* best effort */ }
}

// ── Sessions ────────────────────────────────────────────────────────────────

export interface IssuedStaffSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
  sessionId: number;
}

export async function createStaffSession(args: {
  staff: Pick<CrmStaff, "id" | "sessionEpoch">;
  ip: string | undefined;
  userAgent: string | undefined;
  mfaSatisfied: boolean;
}): Promise<IssuedStaffSession> {
  const token = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(Date.now() + ABSOLUTE_MS);
  const [row] = await db.insert(crmStaffSessions).values({
    staffId: args.staff.id,
    tokenHash: hashToken(token),
    csrfHash: hashToken(csrfToken),
    epoch: args.staff.sessionEpoch,
    mfaSatisfied: args.mfaSatisfied,
    expiresAt,
    ip: args.ip ?? null,
    userAgent: args.userAgent?.slice(0, 500) ?? null,
  }).returning({ id: crmStaffSessions.id });
  return { token, csrfToken, expiresAt, sessionId: row.id };
}

export interface ResolvedStaff {
  staff: CrmStaff;
  sessionId: number;
  csrfHash: string;
  mfaSatisfied: boolean;
  permissions: Set<Permission>;
}

/**
 * Resolves the cookie to a live session and an active person, sliding the idle
 * window. Returns undefined for every failure mode — unknown token, revoked,
 * idle-expired, absolutely expired, stale epoch, or a non-active account — so
 * callers cannot accidentally distinguish them and leak account state.
 */
export async function resolveStaffSession(req: Request): Promise<ResolvedStaff | undefined> {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const raw = cookies?.[STAFF_COOKIE_NAME];
  if (typeof raw !== "string" || raw.length === 0) return undefined;

  const now = new Date();
  try {
    const [row] = await db
      .select({ session: crmStaffSessions, staff: crmStaff })
      .from(crmStaffSessions)
      .innerJoin(crmStaff, eq(crmStaffSessions.staffId, crmStaff.id))
      .where(and(
        eq(crmStaffSessions.tokenHash, hashToken(raw)),
        isNull(crmStaffSessions.revokedAt),
        gt(crmStaffSessions.expiresAt, now),
      ))
      .limit(1);

    if (!row) return undefined;
    if (row.staff.status !== "active") return undefined;
    // A password change, MFA change, role change or disable bumps the epoch,
    // which kills every session issued before it in one comparison.
    if (row.session.epoch !== row.staff.sessionEpoch) return undefined;
    if (now.getTime() - row.session.lastSeenAt.getTime() > IDLE_MS) return undefined;

    try {
      await db.update(crmStaffSessions)
        .set({ lastSeenAt: now })
        .where(eq(crmStaffSessions.id, row.session.id));
    } catch { /* the session is still valid for THIS request */ }

    return {
      staff: row.staff,
      sessionId: row.session.id,
      csrfHash: row.session.csrfHash,
      mfaSatisfied: row.session.mfaSatisfied,
      permissions: effectivePermissions(row.staff),
    };
  } catch {
    // Session storage unreachable: deny.
    return undefined;
  }
}

export async function revokeStaffSessionByToken(raw: string): Promise<void> {
  if (!raw) return;
  try {
    await db.update(crmStaffSessions)
      .set({ revokedAt: new Date() })
      .where(eq(crmStaffSessions.tokenHash, hashToken(raw)));
  } catch { /* best effort */ }
}

export async function revokeStaffSessionById(sessionId: number, staffId: number): Promise<boolean> {
  try {
    const rows = await db.update(crmStaffSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(crmStaffSessions.id, sessionId), eq(crmStaffSessions.staffId, staffId)))
      .returning({ id: crmStaffSessions.id });
    return rows.length > 0;
  } catch { return false; }
}

/**
 * Ends every session a person holds, by bumping their epoch. Used on password
 * change, MFA change, role change, disable, and "sign out everywhere".
 */
export async function revokeAllStaffSessions(staffId: number): Promise<void> {
  await db.update(crmStaff)
    .set({ sessionEpoch: sql`${crmStaff.sessionEpoch} + 1`, updatedAt: new Date() })
    .where(eq(crmStaff.id, staffId));
}

// ── Audit ───────────────────────────────────────────────────────────────────

/**
 * Append-only trail. Reuses `crm_admin_audit_log`; the actor is now a real
 * person ("staff:3 shasta@…") instead of the literal "admin". Never records
 * credentials, tokens, or message bodies.
 */
export async function recordStaffAudit(args: {
  actorStaffId: number | null;
  actorLabel: string;
  action: string;
  target?: string | null;
  ip?: string | undefined;
}): Promise<void> {
  try {
    await db.insert(crmAdminAuditLog).values({
      actor: args.actorStaffId ? `staff:${args.actorStaffId} ${args.actorLabel}` : args.actorLabel,
      action: args.action,
      target: args.target ?? null,
      ip: args.ip ?? null,
    });
  } catch { /* an audit failure must never undo the audited action */ }
}

// ── Request guards ──────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staffAuth?: ResolvedStaff;
    }
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Double-submit CSRF check. The raw token is handed to the client at login and
 * echoed in a header; a cross-site attacker can drive the browser to send the
 * cookie but cannot read the token to set the header.
 */
function csrfRejected(req: Request, resolved: ResolvedStaff): boolean {
  if (!MUTATING.has(req.method)) return false;
  const header = req.headers[CSRF_HEADER];
  const provided = Array.isArray(header) ? header[0] : header;
  if (typeof provided !== "string" || provided.length === 0) return true;
  return hashToken(provided) !== resolved.csrfHash;
}

/**
 * The CRM gate. `requireStaff()` asserts a signed-in active person;
 * `requireStaff("projects.write")` additionally asserts the grant.
 *
 * Denials are audited (never the attempted credential) so an owner can see
 * attempted privilege boundaries being hit.
 */
export function requireStaff(permission?: Permission) {
  return async function staffGate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const resolved = await resolveStaffSession(req);
    if (!resolved) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    if (csrfRejected(req, resolved)) {
      res.status(403).json({ error: "Request could not be verified. Refresh the page and try again." });
      return;
    }
    // When MFA is enrolled, a session that has not satisfied it is only good
    // enough to complete the challenge — never to reach CRM data.
    if (resolved.staff.mfaEnrolledAt && !resolved.mfaSatisfied) {
      res.status(401).json({ error: "Multi-factor verification required.", mfaRequired: true });
      return;
    }
    if (permission && !resolved.permissions.has(permission)) {
      void recordStaffAudit({
        actorStaffId: resolved.staff.id,
        actorLabel: resolved.staff.email,
        action: "permission.denied",
        target: `${permission} ${req.method} ${req.path}`,
        ip: deriveClientIp(req),
      });
      res.status(403).json({ error: "You do not have permission to do that.", permission });
      return;
    }
    req.staffAuth = resolved;
    next();
  };
}

/** Convenience for route bodies that need a second, record-level check. */
export function staffCan(req: Request, permission: Permission): boolean {
  const resolved = req.staffAuth;
  return resolved ? hasPermission(resolved.staff, permission) : false;
}

// ── Transitional unified gate for the existing CRM routes ───────────────────
//
// The CRM's routes each carried their own bearer-only `requireAdmin`. Swapping
// them straight to `requireStaff` would lock everyone out the moment this
// deploys and before anybody has an account, so this gate accepts EITHER:
//
//   1. a real staff session (preferred — carries a person and their grants), or
//   2. the legacy shared bearer token, while `CRM_LEGACY_BEARER_ENABLED` is
//      not "false".
//
// The legacy holder is the shared-password admin, who already had unrestricted
// access, so no permission check applies on that path — that is the status quo
// being retired, not a new hole. Cutover is: create the staff accounts, sign
// in, set CRM_LEGACY_BEARER_ENABLED=false, and the bearer stops working
// everywhere at once. Only then are permissions actually enforced on these
// routes, which is why the flag — not this function — is the finish line.

export function legacyBearerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["CRM_LEGACY_BEARER_ENABLED"] !== "false";
}

/** True when the request carries the legacy process-lifetime shared bearer. */
function hasLegacyBearer(req: Request): boolean {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return token.length > 0 && validateLegacyToken(token);
}

// Imported lazily-by-reference to avoid a cycle with admin-session.ts, which
// imports nothing from here.
import { validateToken as validateLegacyToken } from "./admin-session.js";

export function requireCrmAuth(permission?: Permission) {
  return async function crmGate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const resolved = await resolveStaffSession(req);
    if (resolved) {
      if (csrfRejected(req, resolved)) {
        res.status(403).json({ error: "Request could not be verified. Refresh the page and try again." });
        return;
      }
      if (resolved.staff.mfaEnrolledAt && !resolved.mfaSatisfied) {
        res.status(401).json({ error: "Multi-factor verification required.", mfaRequired: true });
        return;
      }
      if (permission && !resolved.permissions.has(permission)) {
        void recordStaffAudit({
          actorStaffId: resolved.staff.id, actorLabel: resolved.staff.email,
          action: "permission.denied", target: `${permission} ${req.method} ${req.path}`,
          ip: deriveClientIp(req),
        });
        res.status(403).json({ error: "You do not have permission to do that.", permission });
        return;
      }
      req.staffAuth = resolved;
      next();
      return;
    }

    if (legacyBearerEnabled() && hasLegacyBearer(req)) {
      next();
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
  };
}
