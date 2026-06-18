import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const discoverySubmissions = pgTable("discovery_submissions", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  // Key fields extracted for filtering/display
  contactName: text("contact_name").notNull(),
  companyName: text("company_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  industry: text("industry"),
  serviceInterest: text("service_interest"),
  budget: text("budget"),
  timeline: text("timeline"),
  decisionMaker: text("decision_maker"),

  // Scoring & classification
  leadScore: integer("lead_score").default(1).notNull(),
  tags: text("tags").array().default([]).notNull(),
  status: text("status").default("New").notNull(),
  recommendedPackage: text("recommended_package"),

  // Full form data (all sections)
  formData: jsonb("form_data").$type<Record<string, unknown>>().notNull(),

  // Generated documents (stored after generation)
  generatedProposal: text("generated_proposal"),
  generatedSow: text("generated_sow"),

  // Internal
  internalNotes: text("internal_notes"),
});

export const insertDiscoverySubmissionSchema = createInsertSchema(discoverySubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiscoverySubmission = z.infer<typeof insertDiscoverySubmissionSchema>;
export type DiscoverySubmission = typeof discoverySubmissions.$inferSelect;
