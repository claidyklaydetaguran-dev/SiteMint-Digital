// P4: firm-scoped persistence for calendar connections and one-time OAuth
// states. Every query is firm-scoped; state consumption is a single DELETE
// ... RETURNING so a state can never authorize two callbacks.

import { and, eq, lt } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  schedulingCalendarConnections,
  schedulingCalendarOauthStates,
  type SchedulingCalendarConnection,
} from "@workspace/db/schema/scheduling";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function getActiveConnection(firmId: number): Promise<SchedulingCalendarConnection | undefined> {
  const [row] = await db
    .select()
    .from(schedulingCalendarConnections)
    .where(and(eq(schedulingCalendarConnections.firmId, firmId), eq(schedulingCalendarConnections.status, "active")))
    .limit(1);
  return row;
}

export interface UpsertConnectionInput {
  firmId: number;
  refreshTokenEnc: string;
  accessTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  scope: string;
  accountLabel?: string | null;
}

/** One Google connection per firm: re-connecting replaces tokens and reactivates. */
export async function upsertConnection(input: UpsertConnectionInput): Promise<SchedulingCalendarConnection> {
  const now = new Date();
  const [row] = await db
    .insert(schedulingCalendarConnections)
    .values({
      firmId: input.firmId,
      provider: "google",
      status: "active",
      refreshTokenEnc: input.refreshTokenEnc,
      accessTokenEnc: input.accessTokenEnc,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      scope: input.scope,
      accountLabel: input.accountLabel ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schedulingCalendarConnections.firmId, schedulingCalendarConnections.provider],
      set: {
        status: "active",
        refreshTokenEnc: input.refreshTokenEnc,
        accessTokenEnc: input.accessTokenEnc,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        scope: input.scope,
        accountLabel: input.accountLabel ?? null,
        lastErrorAt: null,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) throw new Error("calendar connection upsert returned no row");
  return row;
}

export async function updateAccessToken(
  firmId: number,
  accessTokenEnc: string,
  accessTokenExpiresAt: Date,
): Promise<void> {
  await db
    .update(schedulingCalendarConnections)
    .set({ accessTokenEnc, accessTokenExpiresAt, updatedAt: new Date() })
    .where(and(eq(schedulingCalendarConnections.firmId, firmId), eq(schedulingCalendarConnections.provider, "google")));
}

export async function touchFreebusy(firmId: number): Promise<void> {
  await db
    .update(schedulingCalendarConnections)
    .set({ lastFreebusyAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schedulingCalendarConnections.firmId, firmId), eq(schedulingCalendarConnections.provider, "google")));
}

/** Marks the connection revoked (provider said invalid_grant, or the owner disconnected). Tokens are cleared. */
export async function markConnectionRevoked(firmId: number): Promise<void> {
  await db
    .update(schedulingCalendarConnections)
    .set({
      status: "revoked",
      accessTokenEnc: null,
      accessTokenExpiresAt: null,
      lastErrorAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(schedulingCalendarConnections.firmId, firmId), eq(schedulingCalendarConnections.provider, "google")));
}

// ── one-time OAuth states ────────────────────────────────────────────────────

export async function createOauthState(firmId: number, stateHash: string, codeVerifierEnc: string): Promise<void> {
  await db.insert(schedulingCalendarOauthStates).values({
    firmId,
    stateHash,
    codeVerifierEnc,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });
}

/**
 * Consumes a state exactly once (DELETE ... RETURNING), firm-scoped, and only
 * if unexpired. Also opportunistically sweeps this firm's expired states.
 */
export async function consumeOauthState(
  firmId: number,
  stateHash: string,
): Promise<{ codeVerifierEnc: string } | undefined> {
  await db
    .delete(schedulingCalendarOauthStates)
    .where(
      and(eq(schedulingCalendarOauthStates.firmId, firmId), lt(schedulingCalendarOauthStates.expiresAt, new Date())),
    );
  const [row] = await db
    .delete(schedulingCalendarOauthStates)
    .where(
      and(
        eq(schedulingCalendarOauthStates.firmId, firmId),
        eq(schedulingCalendarOauthStates.stateHash, stateHash),
      ),
    )
    .returning({ codeVerifierEnc: schedulingCalendarOauthStates.codeVerifierEnc });
  return row;
}
