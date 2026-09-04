// V5 S-1: the firm-creation half of invite-only signup.
//
// DUPLICATION NOTICE: `routes/receptionistAuth.ts` (protected — never
// edited) implements the standard signup flow (POST /receptionist/auth/signup)
// entirely inline inside its route handler; it exports nothing reusable for
// "create a firm row". Session issuance IS reusable (createSession,
// COOKIE_NAME, COOKIE_OPTIONS from lib/receptionistAuth.ts, which is
// imported here, unmodified) — only the firm-row-creation logic below is a
// deliberate, minimal duplicate of what routes/receptionistAuth.ts's
// handler does inline: same duplicate-email check shape, same bcrypt cost
// (12), same intake_firms column set with the same defaults (trial plan,
// 20 trial conversations, empty practice areas / states served / qualifying
// questions). If the protected signup flow's firm-creation shape ever
// changes, this module will silently drift from it — that risk is accepted
// here because the alternative (editing the protected file) is prohibited.

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms } from "@workspace/db/schema";

export interface InviteSignupInput {
  ownerName: string;
  businessName: string;
  email: string;
  password: string;
}

export type CreateFirmResult =
  | { ok: true; firm: { id: number; name: string; email: string; planTier: string; trialConversationsLimit: number; createdAt: Date } }
  | { ok: false; reason: "duplicate_email" };

export async function createFirmForInviteSignup(input: InviteSignupInput): Promise<CreateFirmResult> {
  const emailNorm = input.email.toLowerCase().trim();

  const [existing] = await db.select({ id: intakeFirms.id }).from(intakeFirms).where(eq(intakeFirms.email, emailNorm));
  if (existing) return { ok: false, reason: "duplicate_email" };

  const passwordHash = await bcrypt.hash(input.password, 12); // same cost as the protected signup route

  try {
    const [inserted] = await db
      .insert(intakeFirms)
      .values({
        name: input.businessName.trim() || input.ownerName.trim(),
        email: emailNorm,
        passwordHash,
        practiceAreas: [],
        statesServed: [],
        statuteOfLimitationsDays: 0,
        notifyEmail: emailNorm,
        twilioNumber: "",
        planTier: "trial",
        trialConversationsLimit: 20,
        qualifyingQuestions: [],
      })
      .returning({
        id: intakeFirms.id,
        name: intakeFirms.name,
        email: intakeFirms.email,
        planTier: intakeFirms.planTier,
        trialConversationsLimit: intakeFirms.trialConversationsLimit,
        createdAt: intakeFirms.createdAt,
      });
    if (!inserted || !inserted.email) throw new Error("firm insert returned no row");
    return { ok: true, firm: { ...inserted, email: inserted.email } };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") return { ok: false, reason: "duplicate_email" };
    throw err;
  }
}
