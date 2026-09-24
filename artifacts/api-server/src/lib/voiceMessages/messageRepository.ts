// V7: persistence for messages an assistant takes during a call.
//
// Firm scoping: every function here takes firmId as its first argument and
// filters on it. firmId always originates from either the authenticated
// receptionist session or the webhook's assistant linkage — never from a tool
// argument, never from a request body, never from anything a caller said.
//
// Retry safety: (firm_id, tool_call_id) is UNIQUE, so a redelivered tool call
// resolves to the row it already created. `save` reports whether it inserted,
// which is what lets the dispatcher speak "saved" for a genuine save and for a
// duplicate alike — both are true statements about the same one message — while
// downstream effects can still distinguish the two.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceMessages, type VoiceMessage } from "@workspace/db/schema/voice";

export const MESSAGE_FOLLOW_UP_STATUSES = ["new", "in_progress", "resolved"] as const;
export type MessageFollowUpStatus = (typeof MESSAGE_FOLLOW_UP_STATUSES)[number];

export function isMessageFollowUpStatus(value: unknown): value is MessageFollowUpStatus {
  return typeof value === "string" && (MESSAGE_FOLLOW_UP_STATUSES as readonly string[]).includes(value);
}

export interface SaveVoiceMessageInput {
  firmId: number;
  provider: string;
  providerCallId: string;
  assistantId: number | null;
  toolCallId: string;
  callerName: string;
  callbackPhone: string | null;
  callbackEmail: string | null;
  topic: string;
  details: string;
  urgency: "normal" | "urgent";
  emailAckRequested: boolean;
}

export interface SaveVoiceMessageResult {
  message: VoiceMessage;
  /** False when this exact tool call had already been saved. */
  inserted: boolean;
}

/**
 * Saves one message, idempotently.
 *
 * Returns the persisted row in BOTH cases, because the caller's next action is
 * to confirm the save out loud and it must never do that without a row to point
 * at. A conflict path that returned nothing would force the caller to choose
 * between lying and refusing.
 */
export async function saveVoiceMessage(input: SaveVoiceMessageInput): Promise<SaveVoiceMessageResult> {
  const inserted = await db
    .insert(voiceMessages)
    .values({
      firmId: input.firmId,
      provider: input.provider,
      providerCallId: input.providerCallId,
      assistantId: input.assistantId,
      toolCallId: input.toolCallId,
      callerName: input.callerName,
      callbackPhone: input.callbackPhone,
      callbackEmail: input.callbackEmail,
      topic: input.topic,
      details: input.details,
      urgency: input.urgency,
      emailAckRequested: input.emailAckRequested,
    })
    .onConflictDoNothing({ target: [voiceMessages.firmId, voiceMessages.toolCallId] })
    .returning();

  if (inserted.length > 0) return { message: inserted[0]!, inserted: true };

  const [existing] = await db
    .select()
    .from(voiceMessages)
    .where(and(eq(voiceMessages.firmId, input.firmId), eq(voiceMessages.toolCallId, input.toolCallId)))
    .limit(1);
  if (!existing) {
    // Neither inserted nor found: the only way here is a conflict on a row
    // belonging to another firm, which the unique index makes impossible, or a
    // concurrent delete. Surfacing it is correct — silently claiming a save
    // would be the one unacceptable outcome.
    throw new Error("voice message could not be persisted or re-read");
  }
  return { message: existing, inserted: false };
}

export async function listVoiceMessagesForFirm(
  firmId: number,
  options: { statuses?: readonly MessageFollowUpStatus[]; limit?: number } = {},
): Promise<VoiceMessage[]> {
  const statuses = options.statuses;
  const where =
    statuses && statuses.length > 0
      ? and(eq(voiceMessages.firmId, firmId), inArray(voiceMessages.followUpStatus, [...statuses]))
      : eq(voiceMessages.firmId, firmId);
  return db
    .select()
    .from(voiceMessages)
    .where(where)
    .orderBy(desc(voiceMessages.createdAt), desc(voiceMessages.id))
    .limit(Math.min(Math.max(options.limit ?? 200, 1), 500));
}

export async function getVoiceMessageForFirm(firmId: number, id: number): Promise<VoiceMessage | undefined> {
  const [row] = await db
    .select()
    .from(voiceMessages)
    .where(and(eq(voiceMessages.firmId, firmId), eq(voiceMessages.id, id)))
    .limit(1);
  return row;
}

/** Every message saved during one call. Used by the post-call notification. */
export async function listVoiceMessagesForCall(firmId: number, providerCallId: string): Promise<VoiceMessage[]> {
  return db
    .select()
    .from(voiceMessages)
    .where(and(eq(voiceMessages.firmId, firmId), eq(voiceMessages.providerCallId, providerCallId)))
    .orderBy(voiceMessages.id);
}

/**
 * Moves one message through the follow-up workflow. Firm-scoped, so another
 * business's id is indistinguishable from a nonexistent one.
 */
export async function setVoiceMessageFollowUpStatus(
  firmId: number,
  id: number,
  status: MessageFollowUpStatus,
): Promise<VoiceMessage | undefined> {
  const now = new Date();
  const [row] = await db
    .update(voiceMessages)
    .set({ followUpStatus: status, statusChangedAt: now, updatedAt: now })
    .where(and(eq(voiceMessages.firmId, firmId), eq(voiceMessages.id, id)))
    .returning();
  return row;
}
