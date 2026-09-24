import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const crmMessages = pgTable("crm_messages", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  leadId: integer("lead_id"),
  direction: text("direction").notNull(),
  channel: text("channel").notNull(),

  body: text("body"),

  twilioSid: text("twilio_sid"),
  fromNumber: text("from_number"),
  toNumber: text("to_number"),
  status: text("status"),
  errorCode: text("error_code"),

  duration: integer("duration"),
  callStatus: text("call_status"),

  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  // ── M3 additions (all additive, all nullable) ─────────────────────────────

  /** The durable conversation this belongs to. Null only for unmigrated rows. */
  conversationId: integer("conversation_id"),

  /**
   * The authenticated staff member who initiated this, when a person did.
   *
   * Nothing recorded a sender before, so with three owners sharing the CRM you
   * could not tell who had texted a client. Null is meaningful here and is not
   * a gap to be filled in later: an inbound message has no sender of ours, an
   * automated send has no person behind it, and historical rows genuinely do
   * not record who sent them. `origin` says which of those it is.
   */
  sentByStaffId: integer("sent_by_staff_id"),
  /** Display label captured at send time, so it survives a rename or removal. */
  sentByLabel: text("sent_by_label"),

  /**
   * How this message came to exist:
   *   'staff'     a signed-in person sent it
   *   'automated' a campaign, sequence or reminder sent it
   *   'inbound'   the customer sent it
   *   'legacy'    it predates attribution and the sender is genuinely unknown
   *
   * 'legacy' is never guessed into 'staff'. An unknown sender stays unknown.
   */
  origin: text("origin"),

  /** Email subject. Phone messages have none. */
  subject: text("subject"),

  /**
   * The provider's own id, generalised beyond Twilio so email can use it too.
   * `twilio_sid` is kept as-is because the status webhook looks messages up by
   * it, and rewriting a registered webhook's lookup key is not worth the risk.
   */
  providerMessageId: text("provider_message_id"),
}, (table) => [
  index("ix_crm_messages_conversation").on(table.conversationId, table.createdAt),
  index("ix_crm_messages_sent_by").on(table.sentByStaffId),
  // Push packet 0003 (2026-09-24 performance audit): the per-lead message
  // history, which unmigrated rows (null conversation_id) can only reach by lead.
  index("ix_crm_messages_lead_id").on(table.leadId),
]);

export type CrmMessage = typeof crmMessages.$inferSelect;
