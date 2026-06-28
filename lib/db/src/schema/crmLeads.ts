import { pgTable, serial, text, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Canonical SiteMint Digital agency lead lifecycle statuses.
export const CRM_STATUSES = [
  "New Inquiry", "Discovery Sent", "Discovery Completed", "Qualified",
  "Proposal Needed", "Proposal Sent", "Follow-Up Needed", "Won",
  "Lost", "On Hold", "Client", "Maintenance Client",
] as const;
export type CrmStatus = typeof CRM_STATUSES[number];

// Canonical agency project / service types.
export const PROJECT_TYPES = [
  "Website Design", "Website Redesign", "Web Application", "CRM Development",
  "SEO", "Blog Content", "Maintenance & Support", "AI Automation",
  "Consultation", "E-commerce", "Landing Page", "Branding", "Website Audit",
] as const;
export type ProjectType = typeof PROJECT_TYPES[number];

export const CRM_SOURCES = [
  "Website Form", "Discovery Form", "Referral", "Cold Outreach",
  "Social Media", "CSV Import", "Manual Entry", "Other",
] as const;

export const CRM_PRIORITIES = ["Low", "Medium", "High"] as const;

export const crmLeads = pgTable("crm_leads", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  // Contact info
  name: text("name").notNull(),
  company: text("company"),
  phone: text("phone"),
  email: text("email").notNull(),
  website: text("website"),

  // Classification
  source: text("source").default("Manual Entry").notNull(),
  serviceInterest: text("service_interest"),
  status: text("status").default("New Inquiry").notNull(),
  priority: text("priority").default("Medium").notNull(),
  assignedTo: text("assigned_to"),
  tags: text("tags").array().default([]).notNull(),

  // Follow-up tracking
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),

  // Notes
  notes: text("notes"),

  // Deal info
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),
  packageType: text("package_type"),

  // Pipeline doc statuses
  discoveryFormStatus: text("discovery_form_status").default("Not Started"),
  proposalStatus: text("proposal_status").default("Not Started"),
  sowStatus: text("sow_status").default("Not Started"),

  // Link to discovery submission if converted
  discoverySubmissionId: integer("discovery_submission_id"),

  // SMS / Phone
  smsConsent: boolean("sms_consent").default(false).notNull(),
  smsOptOut: boolean("sms_opt_out").default(false).notNull(),

  // Generated sales documents (stored as full HTML)
  generatedProposal: text("generated_proposal"),
  generatedSow: text("generated_sow"),
});

export const insertCrmLeadSchema = createInsertSchema(crmLeads).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertCrmLead = z.infer<typeof insertCrmLeadSchema>;
export type CrmLead = typeof crmLeads.$inferSelect;
