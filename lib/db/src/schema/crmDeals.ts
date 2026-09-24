import { pgTable, serial, text, integer, timestamp, decimal, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const DEAL_STAGES = ["Lead", "Qualified", "Proposal", "Won", "Lost"] as const;
export type DealStage = typeof DEAL_STAGES[number];

export const crmDeals = pgTable("crm_deals", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  leadId: integer("lead_id"),

  name: text("name").notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).default("0").notNull(),
  stage: text("stage").default("Lead").notNull(),
  closeDate: date("close_date", { mode: "string" }),
  notes: text("notes"),

  // ── M3 additions (all additive, all nullable) ─────────────────────────────

  /**
   * Whose deal this is.
   *
   * A deal had no owner, so "what is Claidy working on?" had no answer and a
   * forecast could not be split by person. Null means genuinely unassigned —
   * it is not back-filled to whoever happened to create the row.
   */
  ownerStaffId: integer("owner_staff_id"),

  /**
   * Per-deal likelihood, 0–100.
   *
   * The forecast previously weighted by STAGE, which assumes every deal at a
   * given stage is equally likely — an assumption the Command Center had to
   * state out loud because it could not do better. With a real number on the
   * deal, the forecast can use it and fall back to the stage default only
   * where nobody has judged it. Null is meaningful: nobody has said.
   */
  probability: integer("probability"),

  /** When it was actually decided, as distinct from the expected close date. */
  wonAt: timestamp("won_at", { withTimezone: true }),
  lostAt: timestamp("lost_at", { withTimezone: true }),
  closedByStaffId: integer("closed_by_staff_id"),

  /**
   * Why it was lost.
   *
   * Without this, a lost deal teaches nothing. Recorded as a short reason code
   * plus free text, so the reasons can be counted AND read.
   */
  lostReason: text("lost_reason"),
  lostReasonDetail: text("lost_reason_detail"),

  /**
   * The project this deal became, set by conversion.
   *
   * This is the idempotency key for converting a won deal: a second attempt
   * finds the existing project and returns it instead of creating a duplicate
   * piece of work with duplicate tasks.
   */
  convertedProjectId: integer("converted_project_id"),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
}, (table) => [
  // Push packet 0003 (2026-09-24 performance audit): "this lead's deals".
  index("ix_crm_deals_lead_id").on(table.leadId),
]);

/**
 * Why a deal was lost. A closed vocabulary, so the answers can be counted;
 * `lostReasonDetail` carries whatever else needs saying.
 */
export const DEAL_LOST_REASONS = [
  "price",
  "timing",
  "went_with_competitor",
  "no_response",
  "not_a_fit",
  "no_budget",
  "other",
] as const;
export type DealLostReason = typeof DEAL_LOST_REASONS[number];

export const insertCrmDealSchema = createInsertSchema(crmDeals).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertCrmDeal = z.infer<typeof insertCrmDealSchema>;
export type CrmDeal = typeof crmDeals.$inferSelect;
