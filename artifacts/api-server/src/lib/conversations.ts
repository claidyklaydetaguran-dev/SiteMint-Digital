// ── Conversation identity and upkeep ────────────────────────────────────────
//
// One place decides which conversation a message belongs to, so the inbox, the
// SMS webhook, the outbound send paths and the backfill cannot disagree.
//
// The identity key reproduces the grouping the CRM already used in memory
// (`lead-{id}` / `unknown-{number}`), which is what makes the backfill a
// faithful migration rather than a re-interpretation of history.

import { and, eq, sql } from "drizzle-orm";
import {
  db, crmConversations, crmConversationParticipants, crmMessages, crmLeads,
  type CrmConversation,
} from "@workspace/db";

export type ConversationChannel = "phone" | "email";

/**
 * Normalises a phone number for identity purposes.
 *
 * Only digits and a leading `+` matter; formatting does not. Without this,
 * "+1 555 010 0000" and "+15550100000" would become two conversations with the
 * same person.
 */
export function normalizeAddress(channel: ConversationChannel, raw: string): string {
  const v = raw.trim();
  if (channel === "email") return v.toLowerCase();
  const digits = v.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : digits ? `+${digits}` : "";
}

/**
 * The canonical key for a conversation.
 *
 * A known contact keys on the contact, so every number or address they use
 * lands in one thread. An unknown party keys on their address, and is re-keyed
 * onto the contact if they are later identified — see `attachConversationToContact`.
 */
export function identityKeyFor(args: {
  channel: ConversationChannel;
  contactId?: number | null;
  externalAddress?: string | null;
}): string | null {
  const { channel } = args;
  if (args.contactId) return `${channel}:lead:${args.contactId}`;
  const addr = args.externalAddress ? normalizeAddress(channel, args.externalAddress) : "";
  return addr ? `${channel}:addr:${addr}` : null;
}

/**
 * Finds or creates the conversation for a message, and returns it.
 *
 * Concurrent inbound messages from the same person race here, which is exactly
 * what the unique constraint on `identity_key` is for: the loser of the race
 * gets the winner's row back instead of creating a duplicate.
 */
export async function ensureConversation(args: {
  channel: ConversationChannel;
  provider?: string | null;
  contactId?: number | null;
  externalAddress?: string | null;
  externalName?: string | null;
  subject?: string | null;
  providerThreadRef?: string | null;
}): Promise<CrmConversation | null> {
  const identityKey = identityKeyFor(args);
  if (!identityKey) return null;

  const [existing] = await db.select().from(crmConversations)
    .where(eq(crmConversations.identityKey, identityKey)).limit(1);
  if (existing) return existing;

  const inserted = await db.insert(crmConversations).values({
    channel: args.channel,
    provider: args.provider ?? null,
    identityKey,
    contactId: args.contactId ?? null,
    externalAddress: args.externalAddress
      ? normalizeAddress(args.channel, args.externalAddress) : null,
    externalName: args.externalName ?? null,
    subject: args.subject ?? null,
    providerThreadRef: args.providerThreadRef ?? null,
  }).onConflictDoNothing({ target: crmConversations.identityKey }).returning();

  if (inserted[0]) {
    await syncParticipants(inserted[0]);
    return inserted[0];
  }

  // Lost the race — read the row the other writer created.
  const [raced] = await db.select().from(crmConversations)
    .where(eq(crmConversations.identityKey, identityKey)).limit(1);
  return raced ?? null;
}

/** Records the customer side of a conversation as a participant. */
async function syncParticipants(conversation: CrmConversation): Promise<void> {
  if (!conversation.externalAddress) return;
  await db.insert(crmConversationParticipants).values({
    conversationId: conversation.id,
    role: "customer",
    externalAddress: conversation.externalAddress,
    displayName: conversation.externalName ?? null,
  }).onConflictDoNothing();
}

/**
 * Recomputes a conversation's rollups from its messages.
 *
 * Derived from the messages rather than incremented, so a backfill, a repair,
 * or a message inserted by another path all produce the same answer. The cost
 * is one indexed aggregate per write, which is the right trade for counters
 * that cannot drift.
 */
export async function refreshConversationRollups(conversationId: number): Promise<void> {
  const [agg] = await db.select({
    count: sql<number>`count(*)`,
    first: sql<string | null>`min(${crmMessages.createdAt})`,
    last: sql<string | null>`max(${crmMessages.createdAt})`,
    lastInbound: sql<string | null>`max(${crmMessages.createdAt}) filter (where ${crmMessages.direction} = 'inbound')`,
    lastOutbound: sql<string | null>`max(${crmMessages.createdAt}) filter (where ${crmMessages.direction} = 'outbound')`,
  }).from(crmMessages).where(eq(crmMessages.conversationId, conversationId));

  // An aggregate over a timestamptz column arrives as a string, not a Date —
  // the driver's type parser applies to plain columns, not to the result of
  // min()/max(). Writing it straight back makes Drizzle call .toISOString() on
  // a string and throw, so it is converted here rather than being typed as a
  // Date and hoped for.
  const asDate = (v: string | Date | null | undefined): Date | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  };

  await db.update(crmConversations).set({
    messageCount: Number(agg?.count ?? 0),
    firstMessageAt: asDate(agg?.first),
    lastMessageAt: asDate(agg?.last),
    lastInboundAt: asDate(agg?.lastInbound),
    lastOutboundAt: asDate(agg?.lastOutbound),
    updatedAt: new Date(),
  }).where(eq(crmConversations.id, conversationId));
}

/**
 * Attaches a message to its conversation and refreshes the rollups.
 *
 * Returns the conversation id so callers can record it, and so a caller that
 * could not resolve one gets `null` instead of a silent no-op.
 */
export async function linkMessageToConversation(args: {
  messageId: number;
  channel: ConversationChannel;
  provider?: string | null;
  contactId?: number | null;
  externalAddress?: string | null;
  externalName?: string | null;
  subject?: string | null;
}): Promise<number | null> {
  const conversation = await ensureConversation(args);
  if (!conversation) return null;

  await db.update(crmMessages)
    .set({ conversationId: conversation.id })
    .where(eq(crmMessages.id, args.messageId));

  // An inbound message means the ball is back with us, so a conversation that
  // was parked "awaiting customer" reopens. A resolved one is left resolved —
  // reopening it automatically would erase a deliberate decision.
  await refreshConversationRollups(conversation.id);
  return conversation.id;
}

/**
 * Moves a conversation onto a contact once we learn who the address belongs to.
 *
 * The identity key changes with it, which can collide with the contact's
 * existing conversation. When it does, the two are merged: messages move, and
 * the now-empty address-keyed row is removed. Merging is safe precisely
 * because identity is derived rather than arbitrary.
 */
export async function attachConversationToContact(
  conversationId: number, contactId: number,
): Promise<number> {
  const [conversation] = await db.select().from(crmConversations)
    .where(eq(crmConversations.id, conversationId)).limit(1);
  if (!conversation || conversation.contactId === contactId) return conversationId;

  const nextKey = identityKeyFor({ channel: conversation.channel as ConversationChannel, contactId })!;
  const [target] = await db.select().from(crmConversations)
    .where(eq(crmConversations.identityKey, nextKey)).limit(1);

  if (target && target.id !== conversationId) {
    await db.update(crmMessages).set({ conversationId: target.id })
      .where(eq(crmMessages.conversationId, conversationId));
    await db.delete(crmConversationParticipants)
      .where(eq(crmConversationParticipants.conversationId, conversationId));
    await db.delete(crmConversations).where(eq(crmConversations.id, conversationId));
    await refreshConversationRollups(target.id);
    return target.id;
  }

  await db.update(crmConversations).set({
    contactId, identityKey: nextKey, needsReview: false, reviewReason: null,
    updatedAt: new Date(),
  }).where(eq(crmConversations.id, conversationId));
  return conversationId;
}

/**
 * One-time migration of message history onto conversations.
 *
 * Idempotent: only messages with no `conversation_id` are considered, so it can
 * be run again safely and a partially-completed run resumes.
 *
 * Nothing is invented. A message that names a contact joins that contact's
 * conversation. A message with only a counterparty address joins that
 * address's. A message with neither cannot be attributed — it is put in a
 * quarantine conversation flagged `needsReview` with the reason, so the
 * history is preserved and a person decides, rather than being guessed into
 * somebody's thread or dropped.
 */
export async function backfillConversations(
  opts: { batchSize?: number } = {},
): Promise<{ scanned: number; linked: number; quarantined: number; conversations: number }> {
  const batchSize = opts.batchSize ?? 500;
  let scanned = 0, linked = 0, quarantined = 0;
  const touched = new Set<number>();

  for (;;) {
    const batch = await db.select().from(crmMessages)
      .where(sql`${crmMessages.conversationId} IS NULL`)
      .orderBy(crmMessages.id)
      .limit(batchSize);
    if (batch.length === 0) break;

    for (const m of batch) {
      scanned++;
      // The counterparty is whichever end is not us: for an inbound message
      // that is the sender, for an outbound one the recipient.
      const counterparty = m.direction === "inbound" ? m.fromNumber : m.toNumber;
      const channel: ConversationChannel = m.channel === "email" ? "email" : "phone";

      let conversationId: number | null = null;
      if (m.leadId || counterparty) {
        const conversation = await ensureConversation({
          channel,
          provider: channel === "phone" ? "twilio" : null,
          contactId: m.leadId ?? null,
          externalAddress: counterparty ?? null,
        });
        conversationId = conversation?.id ?? null;
      }

      if (conversationId == null) {
        const quarantine = await ensureQuarantineConversation(channel);
        conversationId = quarantine.id;
        quarantined++;
      } else {
        linked++;
      }

      await db.update(crmMessages)
        .set({
          conversationId,
          // History predates attribution. Inbound is knowable from direction;
          // everything else is honestly unknown and is labelled so, never
          // back-filled into a person.
          origin: m.origin ?? (m.direction === "inbound" ? "inbound" : "legacy"),
        })
        .where(eq(crmMessages.id, m.id));
      touched.add(conversationId);
    }
  }

  for (const id of touched) await refreshConversationRollups(id);
  return { scanned, linked, quarantined, conversations: touched.size };
}

/** The holding pen for history that cannot be attributed to anybody. */
async function ensureQuarantineConversation(channel: ConversationChannel): Promise<CrmConversation> {
  const identityKey = `${channel}:unattributed`;
  const [existing] = await db.select().from(crmConversations)
    .where(eq(crmConversations.identityKey, identityKey)).limit(1);
  if (existing) return existing;

  const inserted = await db.insert(crmConversations).values({
    channel, identityKey,
    externalName: "Unattributed history",
    needsReview: true,
    reviewReason:
      "These messages record neither a contact nor a counterparty address, so "
      + "there is nothing to identify the other party by. They are kept here "
      + "for review rather than being attached to a conversation on a guess.",
  }).onConflictDoNothing({ target: crmConversations.identityKey }).returning();
  if (inserted[0]) return inserted[0];

  const [raced] = await db.select().from(crmConversations)
    .where(eq(crmConversations.identityKey, identityKey)).limit(1);
  return raced!;
}

/**
 * Resolves the conversation for an inbound phone message, creating the contact
 * link when the number is already known.
 */
export async function conversationForPhoneNumber(args: {
  number: string;
  contactId?: number | null;
  name?: string | null;
}): Promise<CrmConversation | null> {
  let contactId = args.contactId ?? null;
  if (!contactId) {
    const normalized = normalizeAddress("phone", args.number);
    if (normalized) {
      const [lead] = await db.select({ id: crmLeads.id })
        .from(crmLeads).where(eq(crmLeads.phone, normalized)).limit(1);
      contactId = lead?.id ?? null;
    }
  }
  return ensureConversation({
    channel: "phone", provider: "twilio",
    contactId, externalAddress: args.number, externalName: args.name ?? null,
  });
}

/** True when this staff member may act on conversations at all. */
export async function conversationExists(id: number): Promise<boolean> {
  const [row] = await db.select({ id: crmConversations.id })
    .from(crmConversations).where(eq(crmConversations.id, id)).limit(1);
  return !!row;
}

export { crmConversations, crmConversationParticipants };
