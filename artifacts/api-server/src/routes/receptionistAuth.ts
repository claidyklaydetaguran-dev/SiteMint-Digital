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

    const [firm] = await db
      .select()
      .from(intakeFirms)
      .where(eq(intakeFirms.email, email.toLowerCase().trim()));

    if (!firm || !firm.passwordHash) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const valid = await bcrypt.compare(password, firm.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

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
