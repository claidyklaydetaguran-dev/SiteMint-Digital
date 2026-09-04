import { pgTable, serial, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── V5 PR-4: public beta-access requests ────────────────────────────────────
// Versioned-migration-only (voice domain journal, 0007).
//
// Deliberate divergence from the blanket "firm_id NOT NULL" voice rule: a
// beta request arrives BEFORE any firm exists — it is a platform-owned lead
// row, not customer-owned data, exactly like an inventory voice_number. It
// therefore carries no firm_id at all. When the owner invites the requester,
// the resulting voice_invites row and then the intake_firms row are the
// customer-owned objects.
//
// Written only by POST /api/public/beta-requests (behind
// PUBLIC_BETA_REQUESTS_ENABLED) and read/updated only by admin routes.

export const BETA_REQUEST_STATUSES = ["new", "contacted", "invited", "declined"] as const;
export type BetaRequestStatus = (typeof BETA_REQUEST_STATUSES)[number];

export const voiceBetaRequests = pgTable("voice_beta_requests", {
  id:           serial("id").primaryKey(),
  name:         text("name").notNull(),
  businessName: text("business_name").notNull(),
  /** Stored lowercase (CHECK) so duplicates fold on case. */
  workEmail:    text("work_email").notNull(),
  phone:        text("phone"),
  message:      text("message"),
  /** Where the request came from, e.g. "ai_receptionist_page". */
  source:       text("source").notNull(),
  status:       text("status").notNull().default("new"),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_voice_beta_requests_status_created").on(table.status, table.createdAt),
  check("ck_voice_beta_requests_email_lower", sql`${table.workEmail} = lower(${table.workEmail})`),
  check("ck_voice_beta_requests_status", sql`${table.status} IN ('new', 'contacted', 'invited', 'declined')`),
  check("ck_voice_beta_requests_source_shape", sql`${table.source} ~ '^[a-z0-9_.-]{1,60}$'`),
]);

export type VoiceBetaRequest = typeof voiceBetaRequests.$inferSelect;
