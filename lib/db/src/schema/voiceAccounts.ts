import { pgTable, serial, integer, text, jsonb, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "./intakeAgent";

// ── P8: billing subscription state, account security, membership, audit ─────
// Versioned-migration-only (voice domain journal).
//
// The receptionist identity IS an intake_firms row (frozen schema), so
// every account capability here rides ALONGSIDE that row in new tables —
// nothing below alters intake_*. Enforcement of billing states (actually
// pausing service) is owner-gated; these tables record truth and requests.

export const voiceSubscriptions = pgTable("voice_subscriptions", {
  id:                   serial("id").primaryKey(),
  firmId:               integer("firm_id")
                          .notNull()
                          .references(() => intakeFirms.id, { onDelete: "cascade" }),
  planCode:             text("plan_code").notNull(),
  state:                text("state").notNull().default("active"),
  /** Stripe identifiers are mapping data set by an audited admin action — never from a request body. */
  stripeCustomerId:     text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Only meaningful while state='grace'. */
  graceUntil:           timestamp("grace_until", { withTimezone: true }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_subscriptions_firm").on(table.firmId),
  uniqueIndex("uq_voice_subscriptions_stripe_customer").on(table.stripeCustomerId),
  check("ck_voice_subscriptions_state", sql`${table.state} IN ('active', 'grace', 'suspended', 'canceled')`),
  check("ck_voice_subscriptions_plan_shape", sql`${table.planCode} ~ '^[a-z0-9_-]{1,40}$'`),
  check("ck_voice_subscriptions_grace_shape", sql`${table.state} <> 'grace' OR ${table.graceUntil} IS NOT NULL`),
]);

export type VoiceSubscription = typeof voiceSubscriptions.$inferSelect;

export const voiceAccountTokens = pgTable("voice_account_tokens", {
  id:         serial("id").primaryKey(),
  firmId:     integer("firm_id")
                .notNull()
                .references(() => intakeFirms.id, { onDelete: "cascade" }),
  purpose:    text("purpose").notNull(),
  /** sha256 hex of the raw token. The raw value exists only in the delivery email. */
  tokenHash:  text("token_hash").notNull(),
  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_account_tokens_hash").on(table.tokenHash),
  index("ix_voice_account_tokens_firm_purpose").on(table.firmId, table.purpose),
  check("ck_voice_account_tokens_purpose", sql`${table.purpose} IN ('email_verification', 'password_reset', 'member_invitation')`),
  check("ck_voice_account_tokens_hash_shape", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
]);

export type VoiceAccountToken = typeof voiceAccountTokens.$inferSelect;

export const voiceAccountStates = pgTable("voice_account_states", {
  id:              serial("id").primaryKey(),
  firmId:          integer("firm_id")
                     .notNull()
                     .references(() => intakeFirms.id, { onDelete: "cascade" }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_account_states_firm").on(table.firmId),
]);

export type VoiceAccountState = typeof voiceAccountStates.$inferSelect;

export const voiceFirmMembers = pgTable("voice_firm_members", {
  id:         serial("id").primaryKey(),
  firmId:     integer("firm_id")
                .notNull()
                .references(() => intakeFirms.id, { onDelete: "cascade" }),
  /** Stored lowercase; identity for invitation + future login integration. */
  email:      text("email").notNull(),
  role:       text("role").notNull(),
  status:     text("status").notNull().default("invited"),
  invitedAt:  timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt:  timestamp("revoked_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_firm_members_firm_email").on(table.firmId, table.email),
  index("ix_voice_firm_members_firm_status").on(table.firmId, table.status),
  check("ck_voice_firm_members_role", sql`${table.role} IN ('owner', 'staff')`),
  check("ck_voice_firm_members_status", sql`${table.status} IN ('invited', 'active', 'revoked')`),
  check("ck_voice_firm_members_email_lower", sql`${table.email} = lower(${table.email})`),
]);

export type VoiceFirmMember = typeof voiceFirmMembers.$inferSelect;

export const voiceAuditLog = pgTable("voice_audit_log", {
  id:        serial("id").primaryKey(),
  firmId:    integer("firm_id")
               .notNull()
               .references(() => intakeFirms.id, { onDelete: "cascade" }),
  /** Who acted. 'system' = automated transition; 'owner' = the firm's session; 'admin' = internal operator. */
  actor:     text("actor").notNull(),
  action:    text("action").notNull(),
  subject:   text("subject"),
  context:   jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  /** Blanket voice-table rule; audit rows are append-only and never updated. */
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_voice_audit_log_firm_created").on(table.firmId, table.createdAt),
  index("ix_voice_audit_log_firm_action").on(table.firmId, table.action),
  check("ck_voice_audit_log_actor", sql`${table.actor} IN ('owner', 'system', 'admin')`),
  check("ck_voice_audit_log_action_shape", sql`${table.action} ~ '^[a-z0-9_.]{1,60}$'`),
]);

export type VoiceAuditRow = typeof voiceAuditLog.$inferSelect;
