import { pgTable, serial, integer, timestamp, index, unique } from "drizzle-orm/pg-core";

/**
 * Per-person read state for a customer conversation.
 *
 * The inbox previously tracked "unread" in React state: a `Set<number>` of
 * threads you had clicked since the page loaded. Three consequences, all of
 * them wrong for a shared inbox:
 *
 *   - It reset on every refresh, so everything looked unread again.
 *   - It lived in one browser, so Shasta reading a thread did nothing for the
 *     badge Claidy saw.
 *   - The server's `unread` number was not read state at all — it was the
 *     count of every inbound message in the thread.
 *
 * One row per (staff member, conversation). "Unread" is then a real question
 * with a real answer: inbound messages on that lead newer than the last time
 * THIS person opened it.
 *
 * Read state is deliberately per-person rather than shared. Whether Claidy has
 * seen a message is a fact about Claidy; collapsing that into one team-wide
 * flag would mean the first person to glance at the inbox silently marks it
 * handled for everybody else.
 *
 * A conversation is identified by its lead, which is how the existing thread
 * grouping already works — there is no conversation table to point at.
 */
export const crmThreadReads = pgTable("crm_thread_reads", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  leadId: integer("lead_id").notNull(),
  /** When this person last opened this conversation. */
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Upserts target this, so reading a thread twice moves the timestamp rather
  // than accumulating rows.
  unique("uq_crm_thread_reads_staff_lead").on(table.staffId, table.leadId),
  index("ix_crm_thread_reads_staff").on(table.staffId),
]);

export type CrmThreadRead = typeof crmThreadReads.$inferSelect;
