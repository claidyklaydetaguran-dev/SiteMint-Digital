import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const helpdeskMessagesTable = pgTable("helpdesk_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  authorType: text("author_type").notNull(),
  authorName: text("author_name").notNull(),
  authorInitials: text("author_initials").notNull(),
  authorAvatarColor: text("author_avatar_color").notNull().default("#6366f1"),
  body: text("body").notNull(),
  isInternalNote: boolean("is_internal_note").notNull().default(false),
  attachmentName: text("attachment_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHelpdeskMessageSchema = createInsertSchema(helpdeskMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertHelpdeskMessage = z.infer<typeof insertHelpdeskMessageSchema>;
export type HelpdeskMessage = typeof helpdeskMessagesTable.$inferSelect;
