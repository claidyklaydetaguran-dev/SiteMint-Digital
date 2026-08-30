// P7: staff review state for calls. Calls stay derived from the event
// ledger (no calls table); a review row is a human's disposition riding
// alongside that fold by (firm, provider, callId). No row = pending.

import type { VoiceCallReview } from "@workspace/db/schema/voice";

export const REVIEW_STATES = ["reviewed", "flagged"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export function isReviewState(value: unknown): value is ReviewState {
  return typeof value === "string" && (REVIEW_STATES as readonly string[]).includes(value);
}

export interface ReviewDeps {
  /** True when this firm has at least one stored event for the call. */
  callExists: (firmId: number, provider: string, callId: string) => Promise<boolean>;
  upsertReview: (row: {
    firmId: number;
    provider: string;
    callId: string;
    reviewState: ReviewState;
    note: string | null;
  }) => Promise<VoiceCallReview>;
  deleteReview: (firmId: number, provider: string, callId: string) => Promise<boolean>;
  listReviews: (firmId: number) => Promise<VoiceCallReview[]>;
}

async function productionReviewDeps(): Promise<ReviewDeps> {
  const { db } = await import("@workspace/db");
  const { providerWebhookEvents, voiceCallReviews } = await import("@workspace/db/schema/voice");
  const { and, eq, sql, desc } = await import("drizzle-orm");
  return {
    callExists: async (firmId, provider, callId) => {
      const [row] = await db
        .select({ id: providerWebhookEvents.id })
        .from(providerWebhookEvents)
        .where(
          and(
            eq(providerWebhookEvents.firmId, firmId),
            eq(providerWebhookEvents.provider, provider),
            // eventKey is `${callId}:${type}`; parameterized prefix match.
            sql`${providerWebhookEvents.eventKey} LIKE ${callId} || ':%'`,
          ),
        )
        .limit(1);
      return row !== undefined;
    },
    upsertReview: async (row) => {
      const [saved] = await db
        .insert(voiceCallReviews)
        .values(row)
        .onConflictDoUpdate({
          target: [voiceCallReviews.firmId, voiceCallReviews.provider, voiceCallReviews.callId],
          set: { reviewState: row.reviewState, note: row.note, updatedAt: new Date() },
        })
        .returning();
      if (!saved) throw new Error("review upsert returned no row");
      return saved;
    },
    deleteReview: async (firmId, provider, callId) => {
      const rows = await db
        .delete(voiceCallReviews)
        .where(
          and(
            eq(voiceCallReviews.firmId, firmId),
            eq(voiceCallReviews.provider, provider),
            eq(voiceCallReviews.callId, callId),
          ),
        )
        .returning({ id: voiceCallReviews.id });
      return rows.length > 0;
    },
    listReviews: async (firmId) =>
      db.select().from(voiceCallReviews).where(eq(voiceCallReviews.firmId, firmId)).orderBy(desc(voiceCallReviews.updatedAt)),
  };
}

export type SetReviewResult =
  | { ok: true; review: VoiceCallReview }
  | { ok: false; reason: "invalid_state" | "invalid_note" | "call_not_found" };

/**
 * Sets (or replaces) the review disposition of one of the firm's own
 * calls. Refuses unknown calls — a review of a call this firm never had
 * would be dashboard noise at best and cross-tenant probing at worst.
 */
export async function setCallReview(
  firmId: number,
  provider: string,
  callId: string,
  state: unknown,
  note: unknown,
  deps?: ReviewDeps,
): Promise<SetReviewResult> {
  if (!isReviewState(state)) return { ok: false, reason: "invalid_state" };
  let normalizedNote: string | null = null;
  if (note !== undefined && note !== null) {
    if (typeof note !== "string" || note.length > 500) return { ok: false, reason: "invalid_note" };
    normalizedNote = note.trim().length > 0 ? note.trim() : null;
  }
  const resolved = deps ?? (await productionReviewDeps());
  if (!(await resolved.callExists(firmId, provider, callId))) {
    return { ok: false, reason: "call_not_found" };
  }
  const review = await resolved.upsertReview({ firmId, provider, callId, reviewState: state, note: normalizedNote });
  return { ok: true, review };
}

/** Returns the call to pending (deletes the row). False when nothing existed. */
export async function clearCallReview(
  firmId: number,
  provider: string,
  callId: string,
  deps?: ReviewDeps,
): Promise<boolean> {
  const resolved = deps ?? (await productionReviewDeps());
  return resolved.deleteReview(firmId, provider, callId);
}

export async function listCallReviews(firmId: number, deps?: ReviewDeps): Promise<VoiceCallReview[]> {
  const resolved = deps ?? (await productionReviewDeps());
  return resolved.listReviews(firmId);
}
