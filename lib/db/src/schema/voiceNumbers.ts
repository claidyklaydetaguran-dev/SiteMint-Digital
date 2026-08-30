import { pgTable, serial, integer, text, timestamp, index, uniqueIndex, check, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "./intakeAgent";
import { voiceAssistants } from "./voiceAssistants";

// ── P6: phone-number inventory + approved transfer destinations ─────────────
// Versioned-migration-only (voice domain journal).
//
// Number lifecycle: inventory → assigned → paused ⇄ assigned → released.
// One deliberate divergence from the blanket "firm_id NOT NULL" voice rule:
// an INVENTORY number is platform stock, not a customer-owned row, so
// firm_id is NULL exactly then — enforced by CHECK, so a row can never be
// simultaneously unowned and live. Every other state requires a firm.

export const voiceNumbers = pgTable("voice_numbers", {
  id:                  serial("id").primaryKey(),
  /** NULL only while state='inventory' (platform stock awaiting assignment). */
  firmId:              integer("firm_id").references(() => intakeFirms.id, { onDelete: "restrict" }),
  phoneE164:           text("phone_e164").notNull(),
  /** How the number reached the provider: BYO Twilio import or Vapi-native purchase. */
  acquisition:         text("acquisition").notNull(),
  /** Vapi phoneNumberId once imported/created there; the inbound-routing key. */
  providerNumberId:    text("provider_number_id"),
  state:               text("state").notNull().default("inventory"),
  assignedAssistantId: integer("assigned_assistant_id").references(() => voiceAssistants.id, { onDelete: "set null" }),
  pausedReason:        text("paused_reason"),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  releasedAt:          timestamp("released_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("uq_voice_numbers_phone").on(table.phoneE164),
  uniqueIndex("uq_voice_numbers_provider_number_id").on(table.providerNumberId),
  // One live (assigned) number per firm in the pilot architecture.
  uniqueIndex("uq_voice_numbers_one_assigned_per_firm")
    .on(table.firmId)
    .where(sql`${table.state} = 'assigned'`),
  index("ix_voice_numbers_firm_state").on(table.firmId, table.state),
  check("ck_voice_numbers_phone_shape", sql`${table.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`),
  check("ck_voice_numbers_acquisition", sql`${table.acquisition} IN ('twilio_byo', 'vapi_native')`),
  check("ck_voice_numbers_state", sql`${table.state} IN ('inventory', 'assigned', 'paused', 'released')`),
  check(
    "ck_voice_numbers_inventory_unowned",
    sql`(${table.state} = 'inventory') = (${table.firmId} IS NULL)`,
  ),
  check(
    "ck_voice_numbers_assigned_has_assistant",
    sql`${table.state} <> 'assigned' OR ${table.assignedAssistantId} IS NOT NULL`,
  ),
]);

export type VoiceNumber = typeof voiceNumbers.$inferSelect;

export const voiceTransferDestinations = pgTable("voice_transfer_destinations", {
  id:        serial("id").primaryKey(),
  firmId:    integer("firm_id")
               .notNull()
               .references(() => intakeFirms.id, { onDelete: "cascade" }),
  label:     text("label").notNull(),
  phoneE164: text("phone_e164").notNull(),
  /** Lower = tried first. */
  priority:  integer("priority").notNull().default(100),
  active:    boolean("active").notNull().default(true),
  /** When false, this destination also answers after-hours calls. */
  businessHoursOnly: boolean("business_hours_only").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_transfer_destinations_firm_phone").on(table.firmId, table.phoneE164),
  index("ix_voice_transfer_destinations_firm_active").on(table.firmId, table.active),
  check("ck_voice_transfer_destinations_phone_shape", sql`${table.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`),
  check("ck_voice_transfer_destinations_label_length", sql`char_length(${table.label}) BETWEEN 1 AND 80`),
]);

export type VoiceTransferDestination = typeof voiceTransferDestinations.$inferSelect;
