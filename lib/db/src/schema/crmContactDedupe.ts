// ── Contact de-duplication: merges and dismissals ───────────────────────────
//
// Two additive tables. Neither changes an existing column, and neither is read
// by anything outside the contact-dedupe surfaces.
//
// Why a merge is RECORDED rather than performed destructively:
//
//   `leads.delete` is OWNER_ONLY (see lib/staffPermissions.ts). If merging
//   deleted the losing contact, anybody holding `leads.write` would have a
//   delete button wearing a different label, and the owner-only boundary would
//   be decorative. So a merge repoints every related row onto the surviving
//   contact and then RETAINS the merged-away lead row, recording the whole
//   thing here. The contact list hides a merged-away lead by joining against
//   this table; nothing is destroyed, and an owner who disagrees with a merge
//   can still see exactly what it did and to which records.
//
//   `mergedSnapshot` / `primarySnapshot` are the two lead rows exactly as they
//   stood before the merge, so a field the operator chose not to keep is
//   preserved verbatim rather than lost. `conflicts` names every field where
//   the two sides disagreed and which value won.

import { pgTable, serial, integer, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * The duplicate signals this system is willing to act on, strongest first.
 *
 * `email` is the only one treated as strong evidence. `name_phone` requires
 * BOTH a normalised-name match and a normalised-phone match, and is still only
 * a suggestion — two people at one company legitimately share a switchboard
 * number, and families share surnames.
 */
export const DUPLICATE_SIGNALS = ["email", "name_phone"] as const;
export type DuplicateSignal = (typeof DUPLICATE_SIGNALS)[number];

// ── crm_contact_merges ──────────────────────────────────────────────────────

export const crmContactMerges = pgTable("crm_contact_merges", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  /** The contact that survives and now carries both histories. */
  primaryLeadId: integer("primary_lead_id").notNull(),
  /** The contact that was merged away. Its row is retained, not deleted. */
  mergedLeadId: integer("merged_lead_id").notNull(),

  /** Which signal the operator was shown when they merged. */
  signal: text("signal").notNull(),

  /** Both lead rows exactly as they stood immediately before the merge. */
  primarySnapshot: jsonb("primary_snapshot").$type<Record<string, unknown>>().notNull(),
  mergedSnapshot: jsonb("merged_snapshot").$type<Record<string, unknown>>().notNull(),

  /** Fields that were empty on the survivor and were filled from the duplicate. */
  fieldsFilled: jsonb("fields_filled").$type<Record<string, unknown>>().notNull(),
  /** Fields where both sides held a different non-empty value, and which won. */
  conflicts: jsonb("conflicts").$type<Array<Record<string, unknown>>>().notNull(),
  /** Per-table counts of rows repointed, and rows that could not move and why. */
  moved: jsonb("moved").$type<Array<Record<string, unknown>>>().notNull(),

  mergedByStaffId: integer("merged_by_staff_id"),
  mergedByLabel: text("merged_by_label").notNull(),
}, (table) => [
  // A contact can only be merged away once. This is also what makes the
  // contact-list exclusion a simple NOT EXISTS rather than a ranked lookup.
  uniqueIndex("uq_crm_contact_merges_merged").on(table.mergedLeadId),
  index("ix_crm_contact_merges_primary").on(table.primaryLeadId, table.id),
]);

export const insertCrmContactMergeSchema = createInsertSchema(crmContactMerges).omit({
  id: true, createdAt: true,
});
export type InsertCrmContactMerge = z.infer<typeof insertCrmContactMergeSchema>;
export type CrmContactMerge = typeof crmContactMerges.$inferSelect;

// ── crm_duplicate_dismissals ────────────────────────────────────────────────

/**
 * "These two are not the same person." Durable, so review does not re-offer a
 * pair somebody has already judged.
 *
 * The pair is stored canonically — `leadIdLow` is always the smaller id — so
 * (7, 12) and (12, 7) are one row and one unique key, and a dismissal cannot be
 * defeated by presenting the pair the other way round.
 */
export const crmDuplicateDismissals = pgTable("crm_duplicate_dismissals", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  leadIdLow: integer("lead_id_low").notNull(),
  leadIdHigh: integer("lead_id_high").notNull(),

  /** The signal that was showing when it was dismissed. Informational. */
  signal: text("signal").notNull(),
  reason: text("reason"),

  dismissedByStaffId: integer("dismissed_by_staff_id"),
  dismissedByLabel: text("dismissed_by_label").notNull(),
}, (table) => [
  uniqueIndex("uq_crm_duplicate_dismissals_pair").on(table.leadIdLow, table.leadIdHigh),
  index("ix_crm_duplicate_dismissals_low").on(table.leadIdLow),
  index("ix_crm_duplicate_dismissals_high").on(table.leadIdHigh),
]);

export const insertCrmDuplicateDismissalSchema = createInsertSchema(crmDuplicateDismissals).omit({
  id: true, createdAt: true,
});
export type InsertCrmDuplicateDismissal = z.infer<typeof insertCrmDuplicateDismissalSchema>;
export type CrmDuplicateDismissal = typeof crmDuplicateDismissals.$inferSelect;
