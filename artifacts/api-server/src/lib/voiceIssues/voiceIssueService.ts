// P2: first writers for the voice_issues table (schema existed since
// Milestone 1 Checkpoint C with zero readers/writers — the Backend Master
// Audit's "dormant" finding).
//
// Design:
//   - Firm-scoped like every tenant-owned row; an event that cannot be
//     attributed to a firm (e.g. a webhook auth failure) is logged by the
//     caller and never becomes a row here.
//   - Deduplicated on (firmId, code, dedupeKey) over UNRESOLVED issues only:
//     a repeating condition increments `context.occurrences` and touches
//     updatedAt instead of flooding the table. A new occurrence after the
//     issue was resolved opens a fresh row — recurrence is signal.
//   - `context` is operator-diagnostic JSON. Callers must never place
//     prompts, transcripts, credentials, provider secrets, or raw caller
//     numbers in it; call ids and masked numbers are fine.

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceIssues, type VoiceIssue } from "@workspace/db/schema/voice";

export const VOICE_ISSUE_CODES = [
  "webhook_malformed_event",
  "webhook_store_failed",
  "call_stale_in_progress",
  "call_missing_report",
  "tool_invalid_args",
  "calendar_revoked",
  "calendar_sync_failed",
  "emergency_language_detected",
  "tool_execution_failed",
  "usage_pause_requested",
  "billing_suspended",
] as const;
export type VoiceIssueCode = (typeof VOICE_ISSUE_CODES)[number];

export type VoiceIssueLevel = "info" | "warning" | "error" | "critical";

export interface OpenVoiceIssueInput {
  firmId: number;
  level: VoiceIssueLevel;
  code: VoiceIssueCode;
  /** Short, operator-safe sentence. No customer content, no secrets. */
  message: string;
  /**
   * Stable identity of the underlying condition (e.g. a call id). Two opens
   * with the same (firmId, code, dedupeKey) while unresolved collapse into
   * one row with an incremented occurrence count.
   */
  dedupeKey: string;
  /** Extra operator-safe fields; stored under context alongside the dedupe key. */
  context?: Record<string, unknown>;
}

export interface OpenVoiceIssueResult {
  issue: VoiceIssue;
  /** False when an unresolved issue with the same identity absorbed this occurrence. */
  created: boolean;
}

export interface VoiceIssueServiceDeps {
  clock?: { now(): Date };
}

/** Opens (or re-notes) a voice issue. Never throws payload contents into the error path. */
export async function openVoiceIssue(
  input: OpenVoiceIssueInput,
  deps: VoiceIssueServiceDeps = {},
): Promise<OpenVoiceIssueResult> {
  const now = deps.clock?.now() ?? new Date();

  const [existing] = await db
    .select()
    .from(voiceIssues)
    .where(
      and(
        eq(voiceIssues.firmId, input.firmId),
        eq(voiceIssues.code, input.code),
        isNull(voiceIssues.resolvedAt),
        sql`${voiceIssues.context} ->> 'dedupeKey' = ${input.dedupeKey}`,
      ),
    )
    .limit(1);

  if (existing) {
    const occurrences =
      typeof existing.context["occurrences"] === "number" ? (existing.context["occurrences"] as number) : 1;
    const [updated] = await db
      .update(voiceIssues)
      .set({
        context: { ...existing.context, occurrences: occurrences + 1, lastSeenAt: now.toISOString() },
        updatedAt: now,
      })
      .where(and(eq(voiceIssues.id, existing.id), eq(voiceIssues.firmId, input.firmId)))
      .returning();
    return { issue: updated ?? existing, created: false };
  }

  const [created] = await db
    .insert(voiceIssues)
    .values({
      firmId: input.firmId,
      level: input.level,
      code: input.code,
      message: input.message,
      context: {
        ...(input.context ?? {}),
        dedupeKey: input.dedupeKey,
        occurrences: 1,
        firstSeenAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!created) {
    throw new Error("voice issue insert returned no row");
  }
  // P7: a critical issue also notifies the operator — fire-and-forget so
  // provider latency never blocks the caller's response path, and inert
  // while VOICE_ALERTS_ENABLED is off (the transport refuses locally).
  if (created.level === "critical") {
    void import("../voiceAlerts/alertTransport.js")
      .then(({ notifyCriticalIssue }) =>
        notifyCriticalIssue({ firmId: created.firmId, code: created.code, message: created.message }),
      )
      .catch(() => {});
  }
  return { issue: created, created: true };
}

/** Marks one firm-scoped issue resolved. Returns undefined when it doesn't exist or belongs to another firm. */
export async function resolveVoiceIssue(
  firmId: number,
  issueId: number,
  deps: VoiceIssueServiceDeps = {},
): Promise<VoiceIssue | undefined> {
  const now = deps.clock?.now() ?? new Date();
  const [updated] = await db
    .update(voiceIssues)
    .set({ resolvedAt: now, updatedAt: now })
    .where(and(eq(voiceIssues.id, issueId), eq(voiceIssues.firmId, firmId), isNull(voiceIssues.resolvedAt)))
    .returning();
  return updated;
}

/** Unresolved issues for one firm, newest first. */
export async function listOpenVoiceIssues(firmId: number): Promise<VoiceIssue[]> {
  return db
    .select()
    .from(voiceIssues)
    .where(and(eq(voiceIssues.firmId, firmId), isNull(voiceIssues.resolvedAt)))
    .orderBy(sql`${voiceIssues.createdAt} DESC`);
}
