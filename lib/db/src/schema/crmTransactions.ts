import { pgTable, serial, text, integer, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const TRANSACTION_METHODS = [
  "stripe",
  "manual_cash",
  "manual_check",
  "manual_transfer",
  "manual_other",
] as const;
export type TransactionMethod = typeof TRANSACTION_METHODS[number];

export const TRANSACTION_STATUSES = ["pending", "completed", "failed", "refunded"] as const;
export type TransactionStatus = typeof TRANSACTION_STATUSES[number];

export const crmTransactions = pgTable("crm_transactions", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  dealId: integer("deal_id").notNull(),
  leadId: integer("lead_id"),

  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: text("status").default("pending").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  notes: text("notes"),
});

export const insertCrmTransactionSchema = createInsertSchema(crmTransactions).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertCrmTransaction = z.infer<typeof insertCrmTransactionSchema>;
export type CrmTransaction = typeof crmTransactions.$inferSelect;
