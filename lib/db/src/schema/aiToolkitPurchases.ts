import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiToolkitPurchases = pgTable("ai_toolkit_purchases", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  email: text("email").notNull(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  downloadToken: text("download_token").notNull().unique(),
  amountTotal: integer("amount_total"),
  currency: text("currency"),
  delivered: boolean("delivered").default(false).notNull(),
  deliveryError: text("delivery_error"),
});

export const insertAiToolkitPurchaseSchema = createInsertSchema(aiToolkitPurchases).omit({
  id: true, createdAt: true,
});

export type InsertAiToolkitPurchase = z.infer<typeof insertAiToolkitPurchaseSchema>;
export type AiToolkitPurchase = typeof aiToolkitPurchases.$inferSelect;
