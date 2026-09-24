// V7: who a customer-facing notification is allowed to reach.
//
// This module exists to keep two things that look similar strictly apart:
//
//   PLATFORM ALERTS go to VOICE_ALERTS_TO — SiteMint's own operations inbox.
//     They carry issue codes and counts, never customer content.
//   BUSINESS NOTIFICATIONS go to the business's OWN verified address, resolved
//     here per firm. They carry that firm's own call and message facts.
//
// Routing a business's calls to the shared operator inbox would leak one
// customer's callers to whoever reads SiteMint's alerts, so the operator
// address is deliberately not reachable from this module at all.
//
// "Verified" means the account completed email verification
// (voice_account_states.email_verified_at). An unverified address is an
// unproven claim about who owns an inbox, and this product emails caller
// details — so it is refused, with a reason the dashboard can explain.

import { and, eq, isNotNull } from "drizzle-orm";

export type RecipientResolution =
  | { ok: true; email: string }
  | { ok: false; reason: "no_account_email" | "email_not_verified" };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RecipientDeps {
  loadFirmRecipient: (
    firmId: number,
  ) => Promise<{ email: string | null; verified: boolean } | undefined>;
}

async function productionDeps(): Promise<RecipientDeps> {
  const { db } = await import("@workspace/db");
  const { intakeFirms } = await import("@workspace/db/schema");
  const { voiceAccountStates } = await import("@workspace/db/schema/voice");
  return {
    loadFirmRecipient: async (firmId) => {
      const [firm] = await db
        .select({ email: intakeFirms.email })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, firmId))
        .limit(1);
      if (!firm) return undefined;
      const [verified] = await db
        .select({ id: voiceAccountStates.id })
        .from(voiceAccountStates)
        .where(
          and(eq(voiceAccountStates.firmId, firmId), isNotNull(voiceAccountStates.emailVerifiedAt)),
        )
        .limit(1);
      return { email: firm.email, verified: Boolean(verified) };
    },
  };
}

/**
 * The one address a business notification may be sent to for this firm.
 *
 * Never falls back to the operator inbox, to `notify_email`, to a member
 * address, or to anything a request supplied. A firm with no verified address
 * gets no email and a reason — which is the honest outcome, not a degraded one.
 */
export async function resolveVerifiedBusinessRecipient(
  firmId: number,
  deps?: RecipientDeps,
): Promise<RecipientResolution> {
  const resolved = deps ?? (await productionDeps());
  const row = await resolved.loadFirmRecipient(firmId);
  const email = typeof row?.email === "string" ? row.email.trim().toLowerCase() : "";
  if (email.length === 0 || !EMAIL_SHAPE.test(email)) return { ok: false, reason: "no_account_email" };
  if (!row?.verified) return { ok: false, reason: "email_not_verified" };
  return { ok: true, email };
}
