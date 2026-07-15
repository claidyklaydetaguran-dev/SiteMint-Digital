import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

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

// ── In-memory session store ────────────────────────────────────────────────────
// Maps session token → { firmId, email }
// Token is set as an HTTP-only cookie named "receptionist_session".
// This is completely separate from the CRM admin auth, which uses an
// Authorization: Bearer <token> header stored in localStorage (no cookies).

interface SessionEntry {
  firmId: number;
  email: string;
}

const sessions = new Map<string, SessionEntry>();

export function createSession(firmId: number, email: string): string {
  const token = crypto.randomBytes(40).toString("hex");
  sessions.set(token, { firmId, email });
  return token;
}

export function getSession(token: string): SessionEntry | null {
  return sessions.get(token) ?? null;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

// ── Cookie helpers ─────────────────────────────────────────────────────────────

export const COOKIE_NAME = "receptionist_session";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: "/",
};

// ── Middleware ─────────────────────────────────────────────────────────────────

export function requireReceptionistAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }

  req.firmId = session.firmId;
  req.firmEmail = session.email;
  next();
}
