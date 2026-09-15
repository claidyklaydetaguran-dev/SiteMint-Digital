import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, index, unique, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── M3: durable conversations ───────────────────────────────────────────────
//
// Until now the CRM had no conversation table. `GET /crm/conversations` read
// the latest 200 messages in the whole database and grouped them in memory on
// `lead-{id}` or `unknown-{number}`. Three things follow from that, and all
// three are why this table exists:
//
//   - A conversation had no identity. It was recomputed per request, so
//     nothing could be attached to it — no owner, no status, no read position.
//   - Older conversations silently vanished. Once 200 newer messages existed
//     anywhere, a quiet thread dropped off the list entirely. Not paginated
//     away — gone, with no indication it was ever there.
//   - Handling state could not exist. "Somebody opened this" was the only
//     signal available, and that is not the same as "somebody replied" or
//     "this is dealt with", which is exactly the confusion a shared inbox
//     cannot afford.
//
// The backfill deliberately reuses that same grouping key, so migrated history
// is grouped the way the inbox already showed it. Where the old key cannot
// decide an owner, the row is flagged `needsReview` rather than being attached
// to a thread on a guess.

/**
 * One ongoing exchange with one customer on one medium.
 *
 * `channel` is coarse on purpose. SMS and calls with the same person are one
 * conversation, because that is how the team already works and how the inbox
 * already displays them; the fine-grained channel stays on each message.
 */
export const crmConversations = pgTable("crm_conversations", {
  id: serial("id").primaryKey(),

  /** 'phone' covers SMS and calls together; 'email' is its own. */
  channel: text("channel").notNull(),
  /** 'twilio' | 'resend' | null when the history predates provider tracking. */
  provider: text("provider"),

  /**
   * The canonical grouping key, and the reason a conversation has a stable
   * identity at all. Unique, so an inbound message either finds its
   * conversation or creates exactly one.
   *
   *   phone:lead:{leadId}      a known contact's SMS/call thread
   *   phone:addr:{e164}        a number not yet matched to a contact
   *   email:lead:{leadId}      a known contact's mail thread
   *   email:addr:{address}     mail from an address we do not know
   */
  identityKey: text("identity_key").notNull(),

  /** The contact this belongs to, when we know who it is. */
  contactId: integer("contact_id"),
  /**
   * The customer's own address — phone number or email. Kept even when
   * `contactId` is set, because it is how an inbound message is matched.
   */
  externalAddress: text("external_address"),
  externalName: text("external_name"),

  /** Email only. */
  subject: text("subject"),
  /** The root provider thread reference (an email Message-ID), when there is one. */
  providerThreadRef: text("provider_thread_ref"),

  /**
   * The unguessable token that makes a reply findable.
   *
   * Outbound mail for this conversation carries
   * `Reply-To: c-<token>@<inbound domain>`, so a reply comes back addressed to
   * a mailbox that identifies the conversation exactly. This is the primary
   * correlation key rather than a fallback, for two reasons:
   *
   *   - Resend's inbound API exposes no SPF/DKIM/spam verdict, so the `from`
   *     address is an unauthenticated claim. Matching on it alone would let
   *     anyone inject a message into a client's thread by spoofing a header.
   *   - Resend generates the outbound Message-ID itself and it cannot be set,
   *     so we cannot pre-compute our own thread anchor from the send side;
   *     `In-Reply-To` correlation only works once the customer quotes it back,
   *     which not every client does.
   */
  replyToken: text("reply_token"),

  /**
   * The `References` chain for this thread, oldest first.
   *
   * Resend does not thread automatically — its own documentation shows the
   * application maintaining this array and passing it back on every send. Kept
   * here so replies sit in the customer's mail client the way they expect.
   */
  referenceChain: text("reference_chain").array(),

  /**
   * How the TEAM is handling this — deliberately separate from who has read
   * it. Opening a conversation says nothing about whether it was answered.
   *   unassigned | assigned | awaiting_customer | resolved
   */
  status: text("status").notNull().default("unassigned"),
  assignedToStaffId: integer("assigned_to_staff_id"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByStaffId: integer("resolved_by_staff_id"),

  firstMessageAt: timestamp("first_message_at", { withTimezone: true }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  /** When the customer last said something — what "waiting on us" is measured from. */
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
  messageCount: integer("message_count").notNull().default(0),

  /**
   * Set when migrated history could not be attributed confidently — for
   * example a message with no contact and no usable address. Such rows are
   * preserved and surfaced for a person to decide, never silently merged into
   * somebody else's thread.
   */
  needsReview: boolean("needs_review").notNull().default(false),
  reviewReason: text("review_reason"),

  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("uq_crm_conversations_identity").on(table.identityKey),
  unique("uq_crm_conversations_reply_token").on(table.replyToken),
  // The inbox's default ordering, and the one that has to stay fast as history
  // grows — the whole point of replacing a 200-row scan.
  index("ix_crm_conversations_last_message").on(table.lastMessageAt),
  index("ix_crm_conversations_status").on(table.status, table.lastMessageAt),
  index("ix_crm_conversations_contact").on(table.contactId),
  index("ix_crm_conversations_assignee").on(table.assignedToStaffId),
  index("ix_crm_conversations_external").on(table.externalAddress),
  check("ck_crm_conversations_channel", sql`${table.channel} IN ('phone', 'email')`),
  check(
    "ck_crm_conversations_status",
    sql`${table.status} IN ('unassigned', 'assigned', 'awaiting_customer', 'resolved')`,
  ),
]);

/**
 * Who is on a conversation. For phone there is one customer; for email there
 * can be several, and cc/bcc need to be distinguishable from the main
 * recipient.
 */
export const crmConversationParticipants = pgTable("crm_conversation_participants", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  /** 'customer' | 'staff' | 'cc' | 'bcc' */
  role: text("role").notNull().default("customer"),
  staffId: integer("staff_id"),
  externalAddress: text("external_address"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_conv_participants_conversation").on(table.conversationId),
  // A participant is one of ours or one of theirs. Both or neither is a bug,
  // so the database refuses it rather than leaving it to every caller.
  check(
    "ck_crm_conv_participants_identity",
    sql`(${table.staffId} IS NOT NULL AND ${table.externalAddress} IS NULL)
      OR (${table.staffId} IS NULL AND ${table.externalAddress} IS NOT NULL)`,
  ),
]);

/**
 * One unsent reply per person per conversation.
 *
 * The composer used to live in React state and was explicitly cleared when you
 * switched threads, so a half-written reply was lost by clicking away. Drafts
 * are per person: two people can be drafting different replies to the same
 * customer without overwriting each other.
 */
export const crmMessageDrafts = pgTable("crm_message_drafts", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  staffId: integer("staff_id").notNull(),
  body: text("body"),
  subject: text("subject"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("uq_crm_message_drafts_conv_staff").on(table.conversationId, table.staffId),
  index("ix_crm_message_drafts_staff").on(table.staffId),
]);

/**
 * Where each person has read up to in each conversation.
 *
 * This supersedes `crm_thread_reads`, which was added earlier on this same
 * unpushed branch and keyed read state on the lead — workable only while a
 * conversation had no identity of its own. It has never existed in a deployed
 * environment, so it is replaced rather than migrated.
 *
 * Read position is per person and is NOT handling state. Somebody reading a
 * message does not mean they answered it or took it on; that is what
 * `crm_conversations.status` and `assigned_to_staff_id` are for.
 */
export const crmConversationReads = pgTable("crm_conversation_reads", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  conversationId: integer("conversation_id").notNull(),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
  /** The newest message this person had seen, so the count is exact. */
  lastReadMessageId: integer("last_read_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("uq_crm_conversation_reads_staff_conv").on(table.staffId, table.conversationId),
  index("ix_crm_conversation_reads_staff").on(table.staffId),
]);

export type CrmConversation = typeof crmConversations.$inferSelect;
export type CrmConversationParticipant = typeof crmConversationParticipants.$inferSelect;
export type CrmMessageDraft = typeof crmMessageDrafts.$inferSelect;
export type CrmConversationRead = typeof crmConversationReads.$inferSelect;
