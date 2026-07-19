// Milestone 1 / Checkpoint E1: firm-scoped persistence for voice_assistants.
// Every operation requires firmId explicitly and every SELECT/UPDATE/DELETE
// by id is scoped by both assistant id and firm id. No provider calls, no
// global mutable state, no logging of config/metadata.

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceAssistants, type VoiceAssistant } from "@workspace/db/schema/voice";
import type { JsonObject } from "../voice/types.js";
import { toSafeSyncErrorCode } from "../voicePublishing/errors.js";
import { STALE_PUBLISH_ATTEMPT_CODE, type PublishSyncErrorCode } from "../voicePublishing/types.js";

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

export type PublishState = "draft" | "publishing" | "published" | "error" | "publish_uncertain";

export interface ClaimForPublishResult {
  assistant: VoiceAssistant;
  publishAttemptId: string;
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
};
