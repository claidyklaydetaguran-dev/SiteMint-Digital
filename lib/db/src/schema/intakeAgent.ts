import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── intake_firms ──────────────────────────────────────────────────────────────
// One row per business using the AI Receptionist product.
// NOTE: law-firm-specific fields (statuteOfLimitationsDays, practiceAreas,
// statesServed) are retained for backward compat with seeded test data.
// New firms use industry + businessDescription + qualifyingQuestions instead.

export const intakeFirms = pgTable("intake_firms", {
  id:                        serial("id").primaryKey(),
  createdAt:                 timestamp("created_at",   { withTimezone: true }).defaultNow().notNull(),
  name:                      text("name").notNull(),
  practiceAreas:             text("practice_areas").array().notNull(),
  statesServed:              text("states_served").array().notNull(),
  statuteOfLimitationsDays:  integer("statute_of_limitations_days").notNull(),
  notifyEmail:               text("notify_email").notNull(),
  twilioNumber:              text("twilio_number").notNull(),
  // ── Account auth columns (nullable so seeded test rows are unaffected) ──────
  email:                     text("email").unique(),
  passwordHash:              text("password_hash"),
  planTier:                  text("plan_tier").notNull().default("trial"),
  trialConversationsLimit:   integer("trial_conversations_limit").notNull().default(20),
  // ── Stripe billing (nullable until firm upgrades) ────────────────────────
  stripeCustomerId:          text("stripe_customer_id"),
  stripeSubscriptionId:      text("stripe_subscription_id"),
  // ── Agent configuration (Phase 4) ─────────────────────────────────────────
  // industry: determines conversation style + scoring rules
  // greetingMessage: literal first SMS the AI sends to a new caller
  // businessDescription: 1-2 sentence context the AI uses in its system prompt
  // qualifyingQuestions: ordered list of topics the AI should ask about (max 6)
  industry:                  text("industry"),
  greetingMessage:           text("greeting_message"),
  businessDescription:       text("business_description"),
  qualifyingQuestions:       jsonb("qualifying_questions").$type<string[]>(),
});

// ── intake_conversations ──────────────────────────────────────────────────────

export const intakeConversations = pgTable("intake_conversations", {
  id:            serial("id").primaryKey(),
  createdAt:     timestamp("created_at",     { withTimezone: true }).defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  firmId:        integer("firm_id").notNull(),
  callerPhone:   text("caller_phone").notNull(),
  status:        text("status").notNull().default("in_progress"),
});

// ── intake_messages ───────────────────────────────────────────────────────────

export const intakeMessages = pgTable("intake_messages", {
  id:             serial("id").primaryKey(),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  conversationId: integer("conversation_id").notNull(),
  direction:      text("direction").notNull(),
  body:           text("body").notNull(),
});

// ── intake_cases ──────────────────────────────────────────────────────────────
// Structured data extracted from a conversation (one per conversation).
// For law firms: law-specific fields are populated.
// For other industries: incidentType = topic, injurySeverity = engagement level,
// faultDescription = Q&A summary text, law-specific fields are null.

export const intakeCases = pgTable("intake_cases", {
  id:                      serial("id").primaryKey(),
  createdAt:               timestamp("created_at",  { withTimezone: true }).defaultNow().notNull(),
  updatedAt:               timestamp("updated_at",  { withTimezone: true }).defaultNow().notNull(),
  conversationId:          integer("conversation_id").notNull().unique(),
  firmId:                  integer("firm_id").notNull(),
  incidentType:            text("incident_type"),
  incidentDate:            text("incident_date"),
  incidentDateNormalized:  text("incident_date_normalized"),
  injurySeverity:          text("injury_severity"),
  faultDescription:        text("fault_description"),
  priorAttorney:           boolean("prior_attorney"),
  summary:                 text("summary"),
  tier:                    text("tier"),
  disqualifyReason:        text("disqualify_reason"),
});

// ── Insert schemas (drizzle-zod) ──────────────────────────────────────────────

export const insertIntakeFirmSchema = createInsertSchema(intakeFirms).omit({
  id: true, createdAt: true,
});

export const insertIntakeConversationSchema = createInsertSchema(intakeConversations).omit({
  id: true, createdAt: true,
});

export const insertIntakeMessageSchema = createInsertSchema(intakeMessages).omit({
  id: true, createdAt: true,
});

export const insertIntakeCaseSchema = createInsertSchema(intakeCases).omit({
  id: true, createdAt: true, updatedAt: true,
});

// ── receptionist_sessions ─────────────────────────────────────────────────────

export const receptionistSessions = pgTable("receptionist_sessions", {
  token:     text("token").primaryKey(),
  firmId:    integer("firm_id").notNull(),
  email:     text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntakeFirm         = typeof intakeFirms.$inferSelect;
export type IntakeConversation = typeof intakeConversations.$inferSelect;
export type IntakeMessage      = typeof intakeMessages.$inferSelect;
export type IntakeCase         = typeof intakeCases.$inferSelect;

export type InsertIntakeFirm         = z.infer<typeof insertIntakeFirmSchema>;
export type InsertIntakeConversation = z.infer<typeof insertIntakeConversationSchema>;
export type InsertIntakeMessage      = z.infer<typeof insertIntakeMessageSchema>;
export type InsertIntakeCase         = z.infer<typeof insertIntakeCaseSchema>;
