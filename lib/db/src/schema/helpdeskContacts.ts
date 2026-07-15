import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const helpdeskContactsTable = pgTable("helpdesk_contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  initials: text("initials").notNull(),
  avatarColor: text("avatar_color").notNull().default("#6366f1"),
  tier: text("tier").notNull().default("standard"),
  openTickets: integer("open_tickets").notNull().default(0),
  totalTickets: integer("total_tickets").notNull().default(0),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHelpdeskContactSchema = createInsertSchema(helpdeskContactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertHelpdeskContact = z.infer<typeof insertHelpdeskContactSchema>;
export type HelpdeskContact = typeof helpdeskContactsTable.$inferSelect;
