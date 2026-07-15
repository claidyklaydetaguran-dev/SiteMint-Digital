import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { receptionistSessions } from "@workspace/db/schema";

// ── Type augmentation ──────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      firmId?: number;
      firmEmail?: string;
    }
  }
}

// ── Session TTL ────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Cookie helpers ─────────────────────────────────────────────────────────────

export const COOKIE_NAME = "receptionist_session";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: SESSION_TTL_MS,
  path: "/",
};

// ── Session CRUD (DB-backed) ───────────────────────────────────────────────────
// Separate from CRM admin auth, which uses an Authorization: Bearer token in
// localStorage (no cookies). Zero collision by design.

export async function createSession(firmId: number, email: string): Promise<string> {
  const token     = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(receptionistSessions).values({ token, firmId, email, expiresAt });
  return token;
}

export async function getSession(token: string): Promise<{ firmId: number; email: string } | null> {
  const [row] = await db
    .select()
    .from(receptionistSessions)
    .where(eq(receptionistSessions.token, token));

  if (!row) return null;

  // Delete expired session and treat as invalid
  if (row.expiresAt < new Date()) {
    await db.delete(receptionistSessions).where(eq(receptionistSessions.token, token));
    return null;
  }

  return { firmId: row.firmId, email: row.email };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(receptionistSessions).where(eq(receptionistSessions.token, token));
}

// Purge all expired sessions (called opportunistically — no cron needed)
export async function purgeExpiredSessions(): Promise<void> {
  await db
    .delete(receptionistSessions)
    .where(sql`expires_at < now()`);
}

// ── Middleware ─────────────────────────────────────────────────────────────────

export async function requireReceptionistAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const session = await getSession(token);
  if (!session) {
    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }

  req.firmId    = session.firmId;
  req.firmEmail = session.email;
  next();
}
