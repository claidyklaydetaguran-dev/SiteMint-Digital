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

/**
 * The business's own list of people a call may be handed to.
 *
 * This table IS the allowlist. A caller — or a model reading a caller's words —
 * can ask for "the manager", never for a number: the webhook resolves the
 * request against these rows server-side, so no digits from a conversation can
 * ever become a dialled destination. `contact_role` is a routing label for that
 * resolution and carries no application permission of any kind; "CEO" here
 * grants nothing in the product.
 *
 * V7 (0010) extends the P6 row with the contact detail a business actually
 * manages: who the person is, their own hours, and a recorded assertion that
 * the business may route calls to them and that they agreed to receive them.
 */
export const voiceTransferDestinations = pgTable("voice_transfer_destinations", {
  id:        serial("id").primaryKey(),
  firmId:    integer("firm_id")
               .notNull()
               .references(() => intakeFirms.id, { onDelete: "cascade" }),
  /** Contact name, as the business wrote it. Spoken to the caller on transfer. */
  label:     text("label").notNull(),
  phoneE164: text("phone_e164").notNull(),
  /** Lower = tried first. */
  priority:  integer("priority").notNull().default(100),
  active:    boolean("active").notNull().default(true),
  /** When false, this destination also answers after-hours calls. */
  businessHoursOnly: boolean("business_hours_only").notNull().default(true),
  /** Routing label only — see the table comment. 'custom' defers to role_label. */
  contactRole: text("contact_role").notNull().default("other"),
  /** Free-text title, used only when contact_role = 'custom'. */
  roleLabel:   text("role_label"),
  /**
   * This contact's own availability. NULL timezone means "use the business
   * hours already configured for the firm", which is the default and keeps one
   * source of truth for the common case.
   */
  timezone:          text("timezone"),
  hoursStartMinute:  integer("hours_start_minute"),
  hoursEndMinute:    integer("hours_end_minute"),
  /** At most one per firm; tried first regardless of priority. */
  isDefault:         boolean("is_default").notNull().default(false),
  /**
   * The business asserting, in its own dashboard, that it is authorized to
   * route calls here and that this person agreed to receive them. Nothing
   * dials a destination without this stamp.
   */
  consentConfirmedAt: timestamp("consent_confirmed_at", { withTimezone: true }),
  /** The authenticated account email that made the assertion above. */
  consentConfirmedBy: text("consent_confirmed_by"),
  /** Result of the last owner-initiated test transfer, for the settings screen. */
  lastTestAt:        timestamp("last_test_at", { withTimezone: true }),
  lastTestOutcome:   text("last_test_outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_transfer_destinations_firm_phone").on(table.firmId, table.phoneE164),
  index("ix_voice_transfer_destinations_firm_active").on(table.firmId, table.active),
  // One default per firm, enforced by the database rather than by whichever
  // code path happened to write last.
  uniqueIndex("uq_voice_transfer_destinations_one_default")
    .on(table.firmId)
    .where(sql`${table.isDefault}`),
  check("ck_voice_transfer_destinations_phone_shape", sql`${table.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`),
  check("ck_voice_transfer_destinations_label_length", sql`char_length(${table.label}) BETWEEN 1 AND 80`),
  check(
    "ck_voice_transfer_destinations_role",
    sql`${table.contactRole} IN ('owner', 'manager', 'receptionist', 'support', 'sales', 'other', 'custom')`,
  ),
  // A custom role must actually say what it is; a listed role must not carry a
  // second, conflicting title.
  check(
    "ck_voice_transfer_destinations_role_label",
    sql`(${table.contactRole} = 'custom') = (${table.roleLabel} IS NOT NULL)`,
  ),
  check(
    "ck_voice_transfer_destinations_role_label_length",
    sql`${table.roleLabel} IS NULL OR char_length(${table.roleLabel}) BETWEEN 1 AND 60`,
  ),
  // Own-hours are all-or-nothing: a start without an end, or hours without a
  // timezone, would silently resolve against the wrong clock.
  check(
    "ck_voice_transfer_destinations_hours_complete",
    sql`(${table.hoursStartMinute} IS NULL) = (${table.hoursEndMinute} IS NULL)`,
  ),
  check(
    "ck_voice_transfer_destinations_hours_need_zone",
    sql`${table.hoursStartMinute} IS NULL OR ${table.timezone} IS NOT NULL`,
  ),
  check(
    "ck_voice_transfer_destinations_hours_range",
    sql`(${table.hoursStartMinute} IS NULL OR ${table.hoursStartMinute} BETWEEN 0 AND 1439)
        AND (${table.hoursEndMinute} IS NULL OR ${table.hoursEndMinute} BETWEEN 0 AND 1440)`,
  ),
  check(
    "ck_voice_transfer_destinations_consent_pair",
    sql`(${table.consentConfirmedAt} IS NULL) = (${table.consentConfirmedBy} IS NULL)`,
  ),
  check(
    "ck_voice_transfer_destinations_test_outcome",
    sql`${table.lastTestOutcome} IS NULL OR ${table.lastTestOutcome} IN ('connected', 'no_answer', 'busy', 'failed', 'declined')`,
  ),
]);

export type VoiceTransferDestination = typeof voiceTransferDestinations.$inferSelect;
