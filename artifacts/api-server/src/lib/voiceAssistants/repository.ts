// Milestone 1 / Checkpoint E1: firm-scoped persistence for voice_assistants.
// Every operation requires firmId explicitly and every SELECT/UPDATE/DELETE
// by id is scoped by both assistant id and firm id. No provider calls, no
// global mutable state, no logging of config/metadata.

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceAssistants, type VoiceAssistant } from "@workspace/db/schema/voice";
import type { JsonObject } from "../voice/types.js";
import { toSafeSyncErrorCode } from "../voicePublishing/errors.js";
import { STALE_PUBLISH_ATTEMPT_CODE, type PublishSyncErrorCode } from "../voicePublishing/types.js";
import {
  SYNC_INTERRUPTED_CODE,
  toSafeProviderSyncErrorCode,
  type ProviderSyncErrorCode,
} from "../voicePublishing/syncErrors.js";

const LIST_LIMIT = 50;

/**
 * Checkpoint E3B1: conservative stale-publishing-attempt threshold. A
 * "publishing" row older than this is treated as publish_uncertain, never
 * silently reset to draft/error — the provider call may have completed
 * before the process stopped watching it. Explicit server constant, not
 * environment-configurable, so it cannot be tuned away by misconfiguration.
 */
export const STALE_PUBLISHING_THRESHOLD_MS = 5 * 60 * 1000;

const RETRYABLE_CLAIM_STATUSES = ["draft", "error"] as const;

/**
 * AR-001V: conservative stale-provider-sync threshold, matching the publish
 * one. A claim older than this is cleared with the fixed stale code; the
 * confirmed-configuration digest is never touched by that sweep.
 */
export const STALE_PROVIDER_SYNC_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * The only provider key an update may be claimed for. A bare provider-neutral
 * string, exactly as `RuntimeCatalogPreset.provider` already carries — not a
 * Vapi type, URL, SDK symbol, or credential, so this module stays free of any
 * provider import.
 */
const VAPI_PROVIDER_NAME = "vapi";

export type PublishState = "draft" | "publishing" | "published" | "error" | "publish_uncertain";

export interface ClaimForPublishResult {
  assistant: VoiceAssistant;
  publishAttemptId: string;
}

export interface ClaimForProviderSyncResult {
  assistant: VoiceAssistant;
  providerSyncAttemptId: string;
}

export interface CreateAssistantRecord {
  name: string;
  templateKey: string;
  config: JsonObject;
}

export interface UpdateAssistantRecord {
  name?: string;
  templateKey?: string;
  config?: JsonObject;
}

export type DeleteOutcome = "deleted" | "not_found" | "conflict";

export const voiceAssistantRepository = {
  async listByFirm(firmId: number): Promise<VoiceAssistant[]> {
    return db
      .select()
      .from(voiceAssistants)
      .where(eq(voiceAssistants.firmId, firmId))
      .orderBy(desc(voiceAssistants.updatedAt))
      .limit(LIST_LIMIT);
  },

  async createForFirm(firmId: number, input: CreateAssistantRecord): Promise<VoiceAssistant> {
    const [row] = await db
      .insert(voiceAssistants)
      .values({
        firmId,
        name: input.name,
        templateKey: input.templateKey,
        config: input.config,
        status: "draft",
        provider: null,
        providerAssistantId: null,
        lastSyncedAt: null,
        syncError: null,
      })
      .returning();

    if (!row) throw new Error("voice_assistants insert did not return a row");
    return row;
  },

  async findByIdForFirm(firmId: number, id: number): Promise<VoiceAssistant | null> {
    const [row] = await db
      .select()
      .from(voiceAssistants)
      .where(and(eq(voiceAssistants.id, id), eq(voiceAssistants.firmId, firmId)))
      .limit(1);

    return row ?? null;
  },

  async updateByIdForFirm(
    firmId: number,
    id: number,
    patch: UpdateAssistantRecord,
  ): Promise<VoiceAssistant | null> {
    const [row] = await db
      .update(voiceAssistants)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(voiceAssistants.id, id), eq(voiceAssistants.firmId, firmId)))
      .returning();

    return row ?? null;
  },

  /** Duplicate source and destination are both scoped to firmId inside one transaction. */
  async duplicateByIdForFirm(
    firmId: number,
    id: number,
    buildName: (originalName: string) => string,
  ): Promise<VoiceAssistant | null> {
    return db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(voiceAssistants)
        .where(and(eq(voiceAssistants.id, id), eq(voiceAssistants.firmId, firmId)))
        .limit(1);

      if (!source) return null;

      const [copy] = await tx
        .insert(voiceAssistants)
        .values({
          firmId,
          name: buildName(source.name),
          templateKey: source.templateKey,
          config: source.config,
          status: "draft",
          provider: null,
          providerAssistantId: null,
          lastSyncedAt: null,
          syncError: null,
        })
        .returning();

      if (!copy) throw new Error("voice_assistants duplicate insert did not return a row");
      return copy;
    });
  },

  /**
   * Draft-only deletion is enforced by the DELETE statement's own WHERE
   * clause (id + firmId + status='draft' + provider IS NULL +
   * providerAssistantId IS NULL) — not by a prior SELECT — so there is no
   * check-then-delete race with a concurrent writer. When the guarded DELETE
   * matches zero rows, a second firm-scoped SELECT classifies why (absent vs.
   * cross-tenant vs. conflict) purely for a safe error response; it never
   * performs the deletion itself.
   */
  async deleteByIdForFirm(firmId: number, id: number): Promise<DeleteOutcome> {
    const deleted = await db
      .delete(voiceAssistants)
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          eq(voiceAssistants.status, "draft"),
          isNull(voiceAssistants.provider),
          isNull(voiceAssistants.providerAssistantId),
        ),
      )
      .returning({ id: voiceAssistants.id });

    if (deleted.length > 0) return "deleted";

    const [row] = await db
      .select({ id: voiceAssistants.id })
      .from(voiceAssistants)
      .where(and(eq(voiceAssistants.id, id), eq(voiceAssistants.firmId, firmId)))
      .limit(1);

    return row ? "conflict" : "not_found";
  },

  /**
   * Checkpoint E3B1: atomically claims a draft or safely-retryable-error
   * assistant for publishing. This is a single UPDATE statement whose WHERE
   * clause is the entire eligibility predicate (status in draft/error,
   * provider/providerAssistantId/publishAttemptId/publishStartedAt all
   * null) — there is no prior SELECT, so two concurrent callers racing this
   * same row can never both succeed: Postgres serializes the two UPDATEs,
   * and the second one re-evaluates the WHERE clause against the first
   * winner's already-committed row, which no longer satisfies
   * isNull(publishAttemptId). Exactly one caller receives a non-null result.
   */
  async claimForPublish(firmId: number, id: number): Promise<ClaimForPublishResult | null> {
    const publishAttemptId = randomUUID();
    const publishStartedAt = new Date();

    const [row] = await db
      .update(voiceAssistants)
      .set({
        status: "publishing",
        publishAttemptId,
        publishStartedAt,
        syncError: null,
        updatedAt: publishStartedAt,
      })
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          inArray(voiceAssistants.status, RETRYABLE_CLAIM_STATUSES),
          isNull(voiceAssistants.provider),
          isNull(voiceAssistants.providerAssistantId),
          isNull(voiceAssistants.publishAttemptId),
          isNull(voiceAssistants.publishStartedAt),
        ),
      )
      .returning();

    if (!row) return null;
    return { assistant: row, publishAttemptId };
  },

  /**
   * Finalizes a successful publish for the active attempt only. Requires
   * status='publishing' AND a matching publishAttemptId AND provider fields
   * still null, so a stale or wrong attempt id, a wrong firm, or a
   * second finalize call for the same attempt all update zero rows.
   */
  async finalizePublished(
    firmId: number,
    id: number,
    publishAttemptId: string,
    provider: string,
    providerAssistantId: string,
  ): Promise<VoiceAssistant | null> {
    const now = new Date();
    const [row] = await db
      .update(voiceAssistants)
      .set({
        status: "published",
        provider,
        providerAssistantId,
        lastSyncedAt: now,
        syncError: null,
        publishAttemptId: null,
        publishStartedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          eq(voiceAssistants.status, "publishing"),
          eq(voiceAssistants.publishAttemptId, publishAttemptId),
          isNull(voiceAssistants.provider),
          isNull(voiceAssistants.providerAssistantId),
        ),
      )
      .returning();

    return row ?? null;
  },

  /**
   * Records a definitive, safely-retryable publish failure for the active
   * attempt only. No provider assistant is believed to exist afterward, so
   * `claimForPublish` can immediately reclaim this row (status='error' is a
   * retryable claim status).
   */
  async recordPublishError(
    firmId: number,
    id: number,
    publishAttemptId: string,
    syncErrorCode: PublishSyncErrorCode,
  ): Promise<VoiceAssistant | null> {
    const now = new Date();
    const [row] = await db
      .update(voiceAssistants)
      .set({
        status: "error",
        provider: null,
        providerAssistantId: null,
        syncError: toSafeSyncErrorCode(syncErrorCode),
        publishAttemptId: null,
        publishStartedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          eq(voiceAssistants.status, "publishing"),
          eq(voiceAssistants.publishAttemptId, publishAttemptId),
        ),
      )
      .returning();

    return row ?? null;
  },

  /**
   * Records an uncertain publish outcome for the active attempt only —
   * either the provider result is unknown, or it succeeded but local
   * finalization became uncertain (in which case `providerIdentity` carries
   * the known provider/providerAssistantId). Clears attempt fields so
   * `claimForPublish` can never automatically reclaim this row afterward;
   * `status='publish_uncertain'` is deliberately not a retryable claim
   * status.
   */
  async recordPublishUncertain(
    firmId: number,
    id: number,
    publishAttemptId: string,
    syncErrorCode: PublishSyncErrorCode,
    providerIdentity?: { provider: string; providerAssistantId: string },
  ): Promise<VoiceAssistant | null> {
    const now = new Date();
    const [row] = await db
      .update(voiceAssistants)
      .set({
        status: "publish_uncertain",
        provider: providerIdentity?.provider ?? null,
        providerAssistantId: providerIdentity?.providerAssistantId ?? null,
        syncError: toSafeSyncErrorCode(syncErrorCode),
        publishAttemptId: null,
        publishStartedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          eq(voiceAssistants.status, "publishing"),
          eq(voiceAssistants.publishAttemptId, publishAttemptId),
        ),
      )
      .returning();

    return row ?? null;
  },

  /**
   * Firm-scoped stale-attempt transition: a "publishing" row whose
   * publishStartedAt is older than `olderThanMs` is moved to
   * publish_uncertain rather than reset to draft/error, because the
   * provider may have completed the request after this process stopped
   * watching it. When `publishAttemptId` is supplied, the predicate also
   * requires it to still match — so a row that already progressed past
   * this attempt (finalized, errored, or reclaimed) is left untouched.
   * Always writes the fixed STALE_PUBLISH_ATTEMPT_CODE — the caller cannot
   * supply an arbitrary syncError value for this transition.
   */
  async markStalePublishingUncertain(
    firmId: number,
    id: number,
    params: { olderThanMs: number; publishAttemptId?: string },
  ): Promise<VoiceAssistant | null> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - params.olderThanMs);

    const conditions = [
      eq(voiceAssistants.id, id),
      eq(voiceAssistants.firmId, firmId),
      eq(voiceAssistants.status, "publishing"),
      lt(voiceAssistants.publishStartedAt, cutoff),
    ];
    if (params.publishAttemptId !== undefined) {
      conditions.push(eq(voiceAssistants.publishAttemptId, params.publishAttemptId));
    }

    const [row] = await db
      .update(voiceAssistants)
      .set({
        status: "publish_uncertain",
        syncError: STALE_PUBLISH_ATTEMPT_CODE,
        publishAttemptId: null,
        publishStartedAt: null,
        updatedAt: now,
      })
      .where(and(...conditions))
      .returning();

    return row ?? null;
  },

  /** Firm-scoped read of only the publish-relevant fields. Returns null for any id not owned by this firm — never another firm's row. */
  async getPublishState(firmId: number, id: number): Promise<VoiceAssistant | null> {
    const [row] = await db
      .select()
      .from(voiceAssistants)
      .where(and(eq(voiceAssistants.id, id), eq(voiceAssistants.firmId, firmId)))
      .limit(1);

    return row ?? null;
  },

  /**
   * AR-001C: returns a provider-linked assistant to a clean editable draft
   * after its remote resource has been *definitively* removed. Called only by
   * the operator cleanup command (lib/voiceCleanup), never by a route.
   *
   * The predicate is the safety property. It matches on firm id, assistant id
   * AND the exact provider assistant id the caller just deleted, so a row that
   * changed underneath the caller — republished, reclaimed, or already
   * reconciled by a concurrent run — matches zero rows and returns null rather
   * than clearing an identity the caller never verified. A single conditional
   * UPDATE means there is no check-then-write window at all.
   *
   * The user's configuration and firm ownership are preserved; only provider
   * identity, attempt ownership, and sync bookkeeping are cleared. The
   * resulting row satisfies the 'draft' branch of
   * ck_voice_assistants_publish_invariants (provider, provider_assistant_id,
   * publish_attempt_id and publish_started_at all NULL), so no migration and
   * no invariant relaxation is required — and the existing draft-delete
   * contract in deleteByIdForFirm applies to it afterward.
   */
  /**
   * AR-001V: atomically claims an ALREADY-PUBLISHED assistant for a provider
   * update. Same shape as claimForPublish and for the same reason — the WHERE
   * clause is the entire eligibility predicate, evaluated by one UPDATE, so
   * two concurrent callers can never both win: the second re-evaluates
   * against the first winner's committed row, which no longer satisfies
   * isNull(providerSyncAttemptId).
   *
   * Eligibility is deliberately narrow and fails closed: the row must be this
   * firm's, already 'published', linked to the 'vapi' provider, carry a
   * nonblank provider assistant id, and have no publish attempt and no sync
   * attempt in flight. A draft/error/publishing/publish_uncertain row can
   * never be claimed here, so this path can never be reached for an assistant
   * that has no provider resource to update.
   */
  async claimForProviderSync(firmId: number, id: number): Promise<ClaimForProviderSyncResult | null> {
    const providerSyncAttemptId = randomUUID();
    const providerSyncStartedAt = new Date();
    const staleCutoff = new Date(providerSyncStartedAt.getTime() - STALE_PROVIDER_SYNC_THRESHOLD_MS);

    const [row] = await db
      .update(voiceAssistants)
      .set({ providerSyncAttemptId, providerSyncStartedAt, updatedAt: providerSyncStartedAt })
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          eq(voiceAssistants.status, "published"),
          eq(voiceAssistants.provider, VAPI_PROVIDER_NAME),
          isNotNull(voiceAssistants.providerAssistantId),
          ne(voiceAssistants.providerAssistantId, ""),
          isNull(voiceAssistants.publishAttemptId),
          // AR-001V.1: a free row, OR one whose claim is older than the stale
          // threshold. Folding the reclaim into this same predicate keeps it
          // atomic — a fresh claim is still exclusive, because a claim younger
          // than the cutoff satisfies neither branch, and two callers racing a
          // stale row still serialize: the loser re-evaluates against the
          // winner's committed row, whose new started_at is not stale.
          or(
            isNull(voiceAssistants.providerSyncAttemptId),
            lt(voiceAssistants.providerSyncStartedAt, staleCutoff),
          ),
        ),
      )
      .returning();

    return row ? { assistant: row, providerSyncAttemptId } : null;
  },

  /**
   * Records a confirmed provider update for the active attempt only: stamps
   * the digest of the payload the provider accepted, clears the attempt and
   * any previous sync error, and moves last_synced_at. status, provider and
   * provider_assistant_id are deliberately never written here — this
   * transition cannot change the publish lifecycle or the provider identity.
   */
  async finalizeProviderSynced(
    firmId: number,
    id: number,
    providerSyncAttemptId: string,
    providerConfigHash: string,
  ): Promise<VoiceAssistant | null> {
    const now = new Date();
    const [row] = await db
      .update(voiceAssistants)
      .set({
        providerConfigHash,
        providerSyncError: null,
        providerSyncAttemptId: null,
        providerSyncStartedAt: null,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          eq(voiceAssistants.providerSyncAttemptId, providerSyncAttemptId),
        ),
      )
      .returning();

    return row ?? null;
  },

  /**
   * Records a failed or unconfirmed provider update for the active attempt
   * only. providerConfigHash is deliberately NOT written: the last value that
   * was actually confirmed with the provider survives the failure, so a failed
   * update can never make a divergent assistant look synchronized, and can
   * never erase the record of a previously proven agreement.
   */
  async recordProviderSyncError(
    firmId: number,
    id: number,
    providerSyncAttemptId: string,
    syncErrorCode: ProviderSyncErrorCode,
  ): Promise<VoiceAssistant | null> {
    const now = new Date();
    const [row] = await db
      .update(voiceAssistants)
      .set({
        providerSyncError: toSafeProviderSyncErrorCode(syncErrorCode),
        providerSyncAttemptId: null,
        providerSyncStartedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          eq(voiceAssistants.providerSyncAttemptId, providerSyncAttemptId),
        ),
      )
      .returning();

    return row ?? null;
  },

  /**
   * Releases a claim without contacting the provider and without changing any
   * synchronization fact — used only on the idempotent no-op path, where the
   * payload already matches providerConfigHash. Clears any stale error, since
   * the row is demonstrably in agreement with the provider.
   */
  async releaseProviderSyncClaim(
    firmId: number,
    id: number,
    providerSyncAttemptId: string,
  ): Promise<VoiceAssistant | null> {
    const now = new Date();
    const [row] = await db
      .update(voiceAssistants)
      .set({
        providerSyncError: null,
        providerSyncAttemptId: null,
        providerSyncStartedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          eq(voiceAssistants.providerSyncAttemptId, providerSyncAttemptId),
        ),
      )
      .returning();

    return row ?? null;
  },

  /**
   * Firm-scoped stale-sync-attempt transition. Unlike a stale publish, a
   * stale update is not existentially uncertain about identity — the provider
   * resource exists either way — so this only clears the claim and records the
   * fixed stale code. providerConfigHash is left alone, which correctly leaves
   * the row reading as "unsynchronized local changes" until a confirmed update
   * happens.
   */
  async markStaleProviderSyncFailed(
    firmId: number,
    id: number,
    params: { olderThanMs: number; providerSyncAttemptId?: string },
  ): Promise<VoiceAssistant | null> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - params.olderThanMs);

    const conditions = [
      eq(voiceAssistants.id, id),
      eq(voiceAssistants.firmId, firmId),
      isNotNull(voiceAssistants.providerSyncAttemptId),
      lt(voiceAssistants.providerSyncStartedAt, cutoff),
    ];
    if (params.providerSyncAttemptId !== undefined) {
      conditions.push(eq(voiceAssistants.providerSyncAttemptId, params.providerSyncAttemptId));
    }

    const [row] = await db
      .update(voiceAssistants)
      .set({
        providerSyncError: SYNC_INTERRUPTED_CODE,
        providerSyncAttemptId: null,
        providerSyncStartedAt: null,
        updatedAt: now,
      })
      .where(and(...conditions))
      .returning();

    return row ?? null;
  },

  async clearProviderLinkForFirm(
    firmId: number,
    id: number,
    expectedProviderAssistantId: string,
  ): Promise<VoiceAssistant | null> {
    const now = new Date();
    const [row] = await db
      .update(voiceAssistants)
      .set({
        status: "draft",
        provider: null,
        providerAssistantId: null,
        publishAttemptId: null,
        publishStartedAt: null,
        syncError: null,
        lastSyncedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(voiceAssistants.id, id),
          eq(voiceAssistants.firmId, firmId),
          eq(voiceAssistants.providerAssistantId, expectedProviderAssistantId),
        ),
      )
      .returning();

    return row ?? null;
  },
};
