import { pgTable, serial, integer, text, timestamp, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "./intakeAgent";
import { voiceAssistants } from "./voiceAssistants";

// ── V7 (migration 0010): saved caller requests + durable business notification
// delivery. Versioned-migration-only (voice domain journal).
//
// Two tables, one workflow: the assistant saves what a caller asked for
// (voice_messages), and the business is told about it afterwards
// (voice_notifications). They are deliberately separate because they fail
// independently — a message that is saved must stay saved even when email
// delivery is broken, and a retried email must never duplicate a message.

export const voiceMessages = pgTable("voice_messages", {
  id:               serial("id").primaryKey(),
  firmId:           integer("firm_id")
                      .notNull()
                      .references(() => intakeFirms.id, { onDelete: "cascade" }),
  /** Provider that carried the call this message was taken on. */
  provider:         text("provider").notNull().default("vapi"),
  /** The provider's call id — the join key to the webhook event ledger. */
  providerCallId:   text("provider_call_id").notNull(),
  /**
   * The assistant that took it, when we can still resolve the row. Nullable
   * and ON DELETE SET NULL so deleting an assistant never destroys a
   * customer's saved request.
   */
  assistantId:      integer("assistant_id").references(() => voiceAssistants.id, { onDelete: "set null" }),
  /**
   * The provider's tool-call id. This is the retry-safety key: a redelivered
   * or duplicated tool call resolves to the same row instead of a second
   * message, which is why it is UNIQUE per firm rather than merely indexed.
   */
  toolCallId:       text("tool_call_id").notNull(),
  /** Confirmed caller details, exactly as the assistant read them back. */
  callerName:       text("caller_name").notNull(),
  callbackPhone:    text("callback_phone"),
  callbackEmail:    text("callback_email"),
  topic:            text("topic").notNull(),
  details:          text("details").notNull(),
  urgency:          text("urgency").notNull().default("normal"),
  /**
   * True only when the caller explicitly asked for an email copy AND gave an
   * address. Nothing may email a caller who did not request it, so the
   * acknowledgement path reads this column and never infers from
   * callback_email merely being present.
   */
  emailAckRequested: boolean("email_ack_requested").notNull().default(false),
  /** Follow-up workflow the business drives from the dashboard. */
  followUpStatus:   text("follow_up_status").notNull().default("new"),
  statusChangedAt:  timestamp("status_changed_at", { withTimezone: true }),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_messages_firm_tool_call").on(table.firmId, table.toolCallId),
  index("ix_voice_messages_firm_created").on(table.firmId, table.createdAt),
  index("ix_voice_messages_firm_call").on(table.firmId, table.providerCallId),
  index("ix_voice_messages_firm_status").on(table.firmId, table.followUpStatus),
  check("ck_voice_messages_urgency", sql`${table.urgency} IN ('normal', 'urgent')`),
  check("ck_voice_messages_status", sql`${table.followUpStatus} IN ('new', 'in_progress', 'resolved')`),
  check("ck_voice_messages_caller_name_length", sql`char_length(${table.callerName}) BETWEEN 1 AND 120`),
  check("ck_voice_messages_topic_length", sql`char_length(${table.topic}) BETWEEN 1 AND 120`),
  check("ck_voice_messages_details_length", sql`char_length(${table.details}) BETWEEN 1 AND 2000`),
  // An acknowledgement can only be owed when there is somewhere to send it.
  check(
    "ck_voice_messages_ack_needs_email",
    sql`${table.emailAckRequested} = false OR ${table.callbackEmail} IS NOT NULL`,
  ),
]);

export type VoiceMessage = typeof voiceMessages.$inferSelect;

// ── voice_notifications ──────────────────────────────────────────────────────
//
// Durable outbox for customer-facing notification email. Design rules that the
// column set exists to enforce:
//
//   - NO DUPLICATES: (firm_id, dedupe_key) is unique, so "the call ended"
//     arriving twice — or arriving both before and after a message is saved —
//     produces one row, and a second attempt updates it rather than sending
//     again.
//   - OBSERVABLE AND HONEST: state distinguishes queued / sending / accepted /
//     failed / abandoned. `accepted` means the provider accepted the message
//     and returned an id. We cannot observe inbox delivery, so no state here
//     claims it.
//   - RETRYABLE: attempts + next_attempt_at + lease_expires_at give the same
//     claim-and-lease semantics as the signup job pipeline, so a crashed
//     worker's row is reclaimed rather than stuck forever in 'sending'.
//   - SANITIZED DIAGNOSTICS: last_error_code holds one of OUR short codes
//     (e.g. 'provider_status_422'), never a provider body, recipient address,
//     or credential.

export const voiceNotifications = pgTable("voice_notifications", {
  id:                serial("id").primaryKey(),
  firmId:            integer("firm_id")
                       .notNull()
                       .references(() => intakeFirms.id, { onDelete: "cascade" }),
  kind:              text("kind").notNull(),
  /** Stable identity of the thing being announced, e.g. 'post_call:<callId>'. */
  dedupeKey:         text("dedupe_key").notNull(),
  recipient:         text("recipient").notNull(),
  subject:           text("subject").notNull(),
  body:              text("body").notNull(),
  state:             text("state").notNull().default("queued"),
  /** Provider's id for the accepted message — the only receipt we actually have. */
  providerMessageId: text("provider_message_id"),
  attempts:          integer("attempts").notNull().default(0),
  /** One of our own short codes. Never provider text. */
  lastErrorCode:     text("last_error_code"),
  nextAttemptAt:     timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  leaseExpiresAt:    timestamp("lease_expires_at", { withTimezone: true }),
  acceptedAt:        timestamp("accepted_at", { withTimezone: true }),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_notifications_firm_dedupe").on(table.firmId, table.dedupeKey),
  index("ix_voice_notifications_due").on(table.state, table.nextAttemptAt),
  index("ix_voice_notifications_firm_created").on(table.firmId, table.createdAt),
  check(
    "ck_voice_notifications_state",
    sql`${table.state} IN ('queued', 'sending', 'accepted', 'failed', 'abandoned')`,
  ),
  check(
    "ck_voice_notifications_kind",
    sql`${table.kind} IN ('post_call_summary', 'caller_acknowledgement')`,
  ),
  // 'accepted' must be timestamped, and only 'accepted' may be: the state and
  // the evidence for it cannot drift apart.
  check(
    "ck_voice_notifications_accepted_is_stamped",
    sql`(${table.state} = 'accepted') = (${table.acceptedAt} IS NOT NULL)`,
  ),
  // The provider's own id is stronger evidence but not every provider returns
  // one, so it is optional — and meaningless on any other state, which this
  // forbids rather than merely discourages.
  check(
    "ck_voice_notifications_receipt_only_when_accepted",
    sql`${table.providerMessageId} IS NULL OR ${table.state} = 'accepted'`,
  ),
]);

export type VoiceNotification = typeof voiceNotifications.$inferSelect;
