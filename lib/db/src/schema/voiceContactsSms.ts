import { pgTable, serial, integer, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "./intakeAgent";

// ── P5: vertical-neutral voice contacts + SMS ledgers ────────────────────────
// Versioned-migration-only (voice domain journal). Deliberately NOT built on
// intake_cases: that table is SMS-conversation-anchored (NOT NULL unique
// conversationId) and carries legal-vertical fields; the product direction
// is a neutral core, so voice callers get their own identity table and only
// a soft, read-only association to an intake conversation when one exists
// for the same normalized number. No FK into legacy push-managed tables —
// firm ownership is the only cross-domain reference, matching every other
// voice table.

export const voiceContacts = pgTable("voice_contacts", {
  id:                   serial("id").primaryKey(),
  firmId:               integer("firm_id")
                          .notNull()
                          .references(() => intakeFirms.id, { onDelete: "cascade" }),
  /** E.164 (+15551234567). The only identity key; normalization happens in application code. */
  phoneE164:            text("phone_e164").notNull(),
  /** Latest caller-stated display name; presentation only, never identity. */
  displayName:          text("display_name"),
  /** Soft link to intake_conversations.id (same firm, same number) — read-only association, no FK by design. */
  intakeConversationId: integer("intake_conversation_id"),
  firstSeenAt:          timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt:           timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastCallId:           text("last_call_id"),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_contacts_firm_phone").on(table.firmId, table.phoneE164),
  index("ix_voice_contacts_firm_last_seen").on(table.firmId, table.lastSeenAt),
  check("ck_voice_contacts_phone_shape", sql`${table.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`),
]);

export type VoiceContact = typeof voiceContacts.$inferSelect;

export const voiceCallLinks = pgTable("voice_call_links", {
  id:        serial("id").primaryKey(),
  firmId:    integer("firm_id")
               .notNull()
               .references(() => intakeFirms.id, { onDelete: "cascade" }),
  callId:    text("call_id").notNull(),
  contactId: integer("contact_id")
               .notNull()
               .references(() => voiceContacts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_call_links_firm_call").on(table.firmId, table.callId),
  index("ix_voice_call_links_contact").on(table.contactId),
]);

export type VoiceCallLink = typeof voiceCallLinks.$inferSelect;

// Channel-level SMS consent for the VOICE number (entirely separate from the
// intake pipeline's own consent handling — different number, different
// credentials, different ledger).
export const voiceSmsConsents = pgTable("voice_sms_consents", {
  id:        serial("id").primaryKey(),
  firmId:    integer("firm_id")
               .notNull()
               .references(() => intakeFirms.id, { onDelete: "cascade" }),
  phoneE164: text("phone_e164").notNull(),
  status:    text("status").notNull(),
  /** Where the current status came from: booking_consent | sms_start | sms_stop | operator. */
  source:    text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_sms_consents_firm_phone").on(table.firmId, table.phoneE164),
  check("ck_voice_sms_consents_status", sql`${table.status} IN ('granted', 'stopped')`),
  check("ck_voice_sms_consents_source", sql`${table.source} IN ('booking_consent', 'sms_start', 'sms_stop', 'operator')`),
]);

export type VoiceSmsConsent = typeof voiceSmsConsents.$inferSelect;

// Outbound SMS ledger: rows are the unit of idempotency (dedupe_key) and of
// delivery-state truth (status + provider sid). Nothing sends without a row;
// a row sends at most once.
export const voiceSmsOutbox = pgTable("voice_sms_outbox", {
  id:                 serial("id").primaryKey(),
  firmId:             integer("firm_id")
                        .notNull()
                        .references(() => intakeFirms.id, { onDelete: "cascade" }),
  toE164:             text("to_e164").notNull(),
  kind:               text("kind").notNull(),
  body:               text("body").notNull(),
  status:             text("status").notNull().default("queued"),
  /** Structural idempotency: e.g. "booking_confirmation:<requestPublicId>". */
  dedupeKey:          text("dedupe_key").notNull(),
  providerMessageSid: text("provider_message_sid"),
  deliveryStatus:     text("delivery_status"),
  errorCode:          text("error_code"),
  attempts:           integer("attempts").notNull().default(0),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  sentAt:             timestamp("sent_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("uq_voice_sms_outbox_dedupe").on(table.dedupeKey),
  index("ix_voice_sms_outbox_firm_status").on(table.firmId, table.status),
  index("ix_voice_sms_outbox_provider_sid").on(table.providerMessageSid),
  check("ck_voice_sms_outbox_kind", sql`${table.kind} IN ('booking_confirmation', 'missed_call_followup')`),
  check(
    "ck_voice_sms_outbox_status",
    sql`${table.status} IN ('queued', 'sending', 'sent', 'failed', 'blocked_no_consent')`,
  ),
  check("ck_voice_sms_outbox_body_length", sql`char_length(${table.body}) <= 640`),
]);

export type VoiceSmsOutboxRow = typeof voiceSmsOutbox.$inferSelect;
