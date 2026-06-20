import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const formSubmissions = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  formName: text("form_name").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  service: text("service"),
  formData: jsonb("form_data").$type<Record<string, unknown>>().notNull(),
  status: text("status").default("New").notNull(),
  notes: text("notes"),
  emailTeamSent: text("email_team_sent").default("pending").notNull(),
  emailClientSent: text("email_client_sent").default("pending").notNull(),
});

export type FormSubmission = typeof formSubmissions.$inferSelect;
export type InsertFormSubmission = typeof formSubmissions.$inferInsert;
