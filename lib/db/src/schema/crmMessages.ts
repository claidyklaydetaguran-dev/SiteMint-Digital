import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

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
});

export type CrmMessage = typeof crmMessages.$inferSelect;
