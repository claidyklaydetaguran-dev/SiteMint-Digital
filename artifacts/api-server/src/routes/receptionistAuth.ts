import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms, intakeConversations } from "@workspace/db/schema";
import {
  createSession,
  destroySession,
  requireReceptionistAuth,
  purgeExpiredSessions,
  COOKIE_NAME,
  COOKIE_OPTIONS,
} from "../lib/receptionistAuth.js";
import {
  loginEmailLimiter,
  loginIpLimiter,
  signupIpLimiter,
  getClientIp,
  maskEmail,
} from "../lib/authRateLimit.js";

const router = Router();

// ── POST /api/receptionist/auth/signup ────────────────────────────────────────

router.post("/receptionist/auth/signup", async (req: Request, res: Response) => {
  try {
    const { fullName, businessName, email, phone, industry, password } = req.body as {
      fullName?: string;
      businessName?: string;
      email?: string;
      phone?: string;
      industry?: string;
      password?: string;
    };

    // ── Signup IP rate limit (5/hour) — check before recording ────────────────
    // 5 signups allowed; 6th attempt from the same IP within the window → 429.
    const signupIp = getClientIp(req);
    if (signupIpLimiter.isOverLimit(signupIp)) {
      req.log.warn({ ip: signupIp }, "[receptionist] signup rate limit exceeded");
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }
    signupIpLimiter.record(signupIp);

    if (!fullName?.trim() || !email?.trim() || !password?.trim()) {
      res.status(400).json({ error: "Full name, email, and password are required." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    // Check for duplicate email (application-layer fast path before DB insert)
    const [existing] = await db
      .select({ id: intakeFirms.id })
      .from(intakeFirms)
      .where(eq(intakeFirms.email, email.toLowerCase().trim()));

    if (existing) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let firm: { id: number; name: string; email: string | null; planTier: string; trialConversationsLimit: number; createdAt: Date };
    try {
      const [inserted] = await db
        .insert(intakeFirms)
        .values({
          name:                    businessName?.trim() || fullName.trim(),
          email:                   email.toLowerCase().trim(),
          passwordHash,
          practiceAreas:           industry ? [industry] : [],
          statesServed:            [],
          statuteOfLimitationsDays: 0,
          notifyEmail:             email.toLowerCase().trim(),
          twilioNumber:            phone?.trim() || "",
          planTier:                "trial",
          trialConversationsLimit: 20,
          industry:                industry?.trim() || null,
          qualifyingQuestions:     [],
        })
        .returning({
          id:         intakeFirms.id,
          name:       intakeFirms.name,
          email:      intakeFirms.email,
          planTier:   intakeFirms.planTier,
          trialConversationsLimit: intakeFirms.trialConversationsLimit,
          createdAt:  intakeFirms.createdAt,
        });
      firm = inserted;
    } catch (dbErr: unknown) {
      // DB-level unique constraint violation (race condition between check and insert)
      if ((dbErr as { code?: string }).code === "23505") {
        res.status(409).json({ error: "An account with that email already exists." });
        return;
      }
      throw dbErr;
    }

    // Opportunistically clear expired sessions on signup (lightweight housekeeping)
    purgeExpiredSessions().catch(() => {});

    const token = await createSession(firm.id, firm.email!);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.status(201).json({ firm });
  } catch (err) {
    req.log.error({ err }, "[receptionist] signup error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/receptionist/auth/login ─────────────────────────────────────────

router.post("/receptionist/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !password?.trim()) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    const emailNorm = email.toLowerCase().trim();
    const ip        = getClientIp(req);

    // ── Pre-check both limiters — no recording, no DB query if limited ────────
    // IP limiter tracks only FAILED attempts (successful logins never record),
    // which avoids penalising shared-IP offices for normal login activity.
    // Semantics: 10 failures all return 401; the 11th ATTEMPT returns 429.
    if (loginIpLimiter.isOverLimit(ip) || loginEmailLimiter.isOverLimit(emailNorm)) {
      req.log.warn(
        { ip, masked: maskEmail(emailNorm) },
        "[receptionist] login rate limit exceeded",
      );
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }

    const [firm] = await db
      .select()
      .from(intakeFirms)
      .where(eq(intakeFirms.email, emailNorm));

    // ── Failure: unknown account ───────────────────────────────────────────────
    if (!firm || !firm.passwordHash) {
      loginIpLimiter.record(ip);
      loginEmailLimiter.record(emailNorm);
      req.log.warn(
        { ip, masked: maskEmail(emailNorm), failCount: loginEmailLimiter.count(emailNorm) },
        "[receptionist] login failed — unknown account",
      );
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const valid = await bcrypt.compare(password, firm.passwordHash);

    // ── Failure: wrong password ────────────────────────────────────────────────
    if (!valid) {
      loginIpLimiter.record(ip);
      loginEmailLimiter.record(emailNorm);
      req.log.warn(
        { ip, masked: maskEmail(emailNorm), failCount: loginEmailLimiter.count(emailNorm) },
        "[receptionist] login failed — wrong password",
      );
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    // ── Success: reset email counter, issue new session ────────────────────────
    loginEmailLimiter.reset(emailNorm);

    const token = await createSession(firm.id, firm.email!);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.json({
      firm: {
        id:                      firm.id,
        name:                    firm.name,
        email:                   firm.email,
        planTier:                firm.planTier,
        trialConversationsLimit: firm.trialConversationsLimit,
        createdAt:               firm.createdAt,
      },
    });
  } catch (err) {
    req.log.error({ err }, "[receptionist] login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/receptionist/auth/logout ────────────────────────────────────────

router.post("/receptionist/auth/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (token) await destroySession(token);
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

// ── GET /api/receptionist/auth/me ─────────────────────────────────────────────

router.get("/receptionist/auth/me", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const [firm] = await db
      .select({
        id:                      intakeFirms.id,
        name:                    intakeFirms.name,
        email:                   intakeFirms.email,
        planTier:                intakeFirms.planTier,
        trialConversationsLimit: intakeFirms.trialConversationsLimit,
        createdAt:               intakeFirms.createdAt,
      })
      .from(intakeFirms)
      .where(eq(intakeFirms.id, req.firmId!));

    if (!firm) {
      res.status(404).json({ error: "Account not found." });
      return;
    }

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(intakeConversations)
      .where(eq(intakeConversations.firmId, req.firmId!));

    res.json({ firm, conversationCount: Number(countRow?.count ?? 0) });
  } catch (err) {
    req.log.error({ err }, "[receptionist] /me error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
