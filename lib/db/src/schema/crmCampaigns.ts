import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { crmLeads } from "./crmLeads";

// ── crm_campaigns ─────────────────────────────────────────────────────────────

export const crmCampaigns = pgTable("crm_campaigns", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  // draft | ready | archived
  status: text("status").notNull().default("draft"),

  // Sequence fields (Phase 25A)
  // broadcast | nurture | drip
  type: text("type").notNull().default("broadcast"),
  objective: text("objective"),
  toneProfile: text("tone_profile"),
  description: text("description"),
  stopOnReply: boolean("stop_on_reply").notNull().default(true),
  autoSend: boolean("auto_send").notNull().default(false),
});

export const insertCrmCampaignSchema = createInsertSchema(crmCampaigns).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCrmCampaign = z.infer<typeof insertCrmCampaignSchema>;
export type CrmCampaign = typeof crmCampaigns.$inferSelect;

// ── crm_campaign_recipients ───────────────────────────────────────────────────

export const crmCampaignRecipients = pgTable("crm_campaign_recipients", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),

  campaignId: integer("campaign_id")
    .notNull()
    .references(() => crmCampaigns.id, { onDelete: "cascade" }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => crmLeads.id, { onDelete: "cascade" }),

  // selected | test_previewed | sent | skipped | failed
  status: text("status").notNull().default("selected"),

  discStyleUsed: text("disc_style_used"),
  personalizedSubject: text("personalized_subject"),
  personalizedBody: text("personalized_body"),
  lastError: text("last_error"),
  // Resend email id — stored after a live send so webhook events can be matched back
  resendEmailId: text("resend_email_id"),

  // Sequence enrollment fields (Phase 25A)
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }),
  // active | paused | completed | stopped
  enrollmentStatus: text("enrollment_status").notNull().default("active"),
  currentStep: integer("current_step").default(0),
});

export const insertCrmCampaignRecipientSchema = createInsertSchema(crmCampaignRecipients).omit({
  id: true, createdAt: true,
});
export type InsertCrmCampaignRecipient = z.infer<typeof insertCrmCampaignRecipientSchema>;
export type CrmCampaignRecipient = typeof crmCampaignRecipients.$inferSelect;

// ── crm_campaign_events ───────────────────────────────────────────────────────
// Event log per recipient. Populated by send execution and future webhook tracking.
// Allowed event_type values: sent | failed | skipped | opened | clicked | bounced | replied_estimated

export const crmCampaignEvents = pgTable("crm_campaign_events", {
  id: serial("id").primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),

  campaignRecipientId: integer("campaign_recipient_id")
    .notNull()
    .references(() => crmCampaignRecipients.id, { onDelete: "cascade" }),

  eventType: text("event_type").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export type CrmCampaignEvent = typeof crmCampaignEvents.$inferSelect;

// ── crm_campaign_steps ────────────────────────────────────────────────────────
// One row per step in a multi-step sequence campaign.
// channel: email | sms | call_prompt | task
// sendTime: immediate | morning | afternoon | evening

export const crmCampaignSteps = pgTable("crm_campaign_steps", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  campaignId: integer("campaign_id")
    .notNull()
    .references(() => crmCampaigns.id, { onDelete: "cascade" }),

  stepNumber: integer("step_number").notNull().default(1),
  dayOffset: integer("day_offset").notNull().default(0),
  channel: text("channel").notNull().default("email"),
  subject: text("subject"),
  body: text("body"),
  callPrompt: text("call_prompt"),
  taskDescription: text("task_description"),
  sendTime: text("send_time").notNull().default("immediate"),
  businessDaysOnly: boolean("business_days_only").notNull().default(true),
});

export const insertCrmCampaignStepSchema = createInsertSchema(crmCampaignSteps).omit({
  id: true, createdAt: true,
});
export type InsertCrmCampaignStep = z.infer<typeof insertCrmCampaignStepSchema>;
export type CrmCampaignStep = typeof crmCampaignSteps.$inferSelect;

// ── crm_campaign_scheduled_messages ──────────────────────────────────────────
// One row per per-recipient per-step outgoing message.
// Drives the Message Queue UI and per-step tracking.
// status: scheduled | queued | sent | failed | canceled | skipped

export const crmCampaignScheduledMessages = pgTable("crm_campaign_scheduled_messages", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),

  campaignId: integer("campaign_id")
    .notNull()
    .references(() => crmCampaigns.id, { onDelete: "cascade" }),

  recipientId: integer("recipient_id")
    .notNull()
    .references(() => crmCampaignRecipients.id, { onDelete: "cascade" }),

  stepId: integer("step_id")
    .references(() => crmCampaignSteps.id, { onDelete: "set null" }),

  leadId: integer("lead_id")
    .notNull()
    .references(() => crmLeads.id, { onDelete: "cascade" }),

  channel: text("channel").notNull().default("email"),
  subject: text("subject"),
  body: text("body"),
  status: text("status").notNull().default("scheduled"),
  resendEmailId: text("resend_email_id"),
  lastError: text("last_error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const insertCrmCampaignScheduledMessageSchema = createInsertSchema(crmCampaignScheduledMessages).omit({
  id: true, createdAt: true,
});
export type InsertCrmCampaignScheduledMessage = z.infer<typeof insertCrmCampaignScheduledMessageSchema>;
export type CrmCampaignScheduledMessage = typeof crmCampaignScheduledMessages.$inferSelect;
