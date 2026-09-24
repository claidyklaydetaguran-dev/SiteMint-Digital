import { pgTable, serial, integer, text, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "../intakeAgent";

// ── V5 PR-5 / S-1: invite-only signup codes ─────────────────────────────────
// Versioned-migration-only (voice domain journal, 0007).
//
// Why a new table rather than voice_account_tokens: that table's purpose
// CHECK is ('email_verification','password_reset','member_invitation') and
// every row requires a firm_id — an invite exists before the firm does, so
// it cannot be a firm-scoped account token without a migration that alters
// a live CHECK constraint (blueprint §18 item 5). A platform-owned table
// avoids touching the existing constraint entirely.
//
// Deliberate divergence from the blanket "firm_id NOT NULL" voice rule: an
// invite is platform-owned until it is redeemed; `redeemed_firm_id` records
// which firm it produced (SET NULL if that firm is ever deleted, so the
// audit fact "this code was used" survives).
//
// Only the sha256 HEX of the code is stored. The raw code is returned
// exactly once, to the admin who created it, and never logged.

export const voiceInvites = pgTable("voice_invites", {
  id:             serial("id").primaryKey(),
  codeHash:       text("code_hash").notNull(),
  /** Optional: the address the owner intends to invite (lowercase). Not enforced at redemption. */
  email:          text("email"),
  note:           text("note"),
  /** Who minted it — 'admin' today; a real operator identity once roles exist. */
  createdBy:      text("created_by").notNull(),
  expiresAt:      timestamp("expires_at", { withTimezone: true }).notNull(),
  redeemedAt:     timestamp("redeemed_at", { withTimezone: true }),
  redeemedFirmId: integer("redeemed_firm_id").references(() => intakeFirms.id, { onDelete: "set null" }),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  /** Blanket voice-table rule; touched on redemption. */
  updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_invites_code_hash").on(table.codeHash),
  index("ix_voice_invites_redeemed_firm").on(table.redeemedFirmId),
  check("ck_voice_invites_hash_shape", sql`${table.codeHash} ~ '^[0-9a-f]{64}$'`),
  check("ck_voice_invites_email_lower", sql`${table.email} IS NULL OR ${table.email} = lower(${table.email})`),
  // No "redeemed_at implies redeemed_firm_id" CHECK on purpose: the FK is
  // ON DELETE SET NULL, and such a check would make deleting a firm fail.
]);

export type VoiceInvite = typeof voiceInvites.$inferSelect;
