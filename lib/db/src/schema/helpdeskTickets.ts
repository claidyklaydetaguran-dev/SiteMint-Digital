import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const helpdeskTicketsTable = pgTable("helpdesk_tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  channel: text("channel").notNull().default("email"),
  contactId: integer("contact_id").notNull(),
  assigneeId: integer("assignee_id"),
  teamName: text("team_name"),
  tags: text("tags").array().notNull().default([]),
  firstReplySlaBreached: boolean("first_reply_sla_breached").notNull().default(false),
  resolutionSlaDeadline: timestamp("resolution_sla_deadline", { withTimezone: true }),
  snippetText: text("snippet_text"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHelpdeskTicketSchema = createInsertSchema(helpdeskTicketsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertHelpdeskTicket = z.infer<typeof insertHelpdeskTicketSchema>;
export type HelpdeskTicket = typeof helpdeskTicketsTable.$inferSelect;
