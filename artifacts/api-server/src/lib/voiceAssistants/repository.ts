// Milestone 1 / Checkpoint E1: firm-scoped persistence for voice_assistants.
// Every operation requires firmId explicitly and every SELECT/UPDATE/DELETE
// by id is scoped by both assistant id and firm id. No provider calls, no
// global mutable state, no logging of config/metadata.

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceAssistants, type VoiceAssistant } from "@workspace/db/schema/voice";
import type { JsonObject } from "../voice/types.js";

const LIST_LIMIT = 50;

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
};
