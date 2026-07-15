import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const helpdeskAgentsTable = pgTable("helpdesk_agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  initials: text("initials").notNull(),
  avatarColor: text("avatar_color").notNull().default("#6366f1"),
  role: text("role").notNull().default("agent"),
  status: text("status").notNull().default("online"),
  teamName: text("team_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHelpdeskAgentSchema = createInsertSchema(helpdeskAgentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertHelpdeskAgent = z.infer<typeof insertHelpdeskAgentSchema>;
export type HelpdeskAgent = typeof helpdeskAgentsTable.$inferSelect;
