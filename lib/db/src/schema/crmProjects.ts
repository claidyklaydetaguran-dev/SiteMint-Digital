import { pgTable, serial, text, integer, timestamp, decimal, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Agency delivery pipeline — distinct from the financial DEAL_STAGES.
export const PROJECT_STAGES = [
  "New Lead", "Discovery", "Proposal", "Contract / Deposit", "Strategy",
  "Design", "Development", "Content", "Review", "Revision",
  "Launch Prep", "Launched", "Maintenance", "Completed",
] as const;
export type ProjectStage = typeof PROJECT_STAGES[number];

export interface ChecklistItem { label: string; done: boolean; }
export interface ProjectLink { label: string; url: string; }

export const crmProjects = pgTable("crm_projects", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  // Relationships (a project usually originates from a lead and/or a won deal)
  leadId: integer("lead_id"),
  dealId: integer("deal_id"),

  // Core
  name: text("name").notNull(),
  projectType: text("project_type"),
  stage: text("stage").default("New Lead").notNull(),
  budget: decimal("budget", { precision: 10, scale: 2 }),

  // Schedule
  startDate: date("start_date", { mode: "string" }),
  targetLaunchDate: date("target_launch_date", { mode: "string" }),

  // Ownership
  assignedTo: text("assigned_to"),

  // Notes & references
  notes: text("notes"),
  proposalLink: text("proposal_link"),
  discoveryFormLink: text("discovery_form_link"),
  maintenancePlan: text("maintenance_plan"),

  // Structured data
  launchChecklist: jsonb("launch_checklist").$type<ChecklistItem[]>().default([]).notNull(),
  links: jsonb("links").$type<ProjectLink[]>().default([]).notNull(),
});

export const insertCrmProjectSchema = createInsertSchema(crmProjects).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertCrmProject = z.infer<typeof insertCrmProjectSchema>;
export type CrmProject = typeof crmProjects.$inferSelect;
