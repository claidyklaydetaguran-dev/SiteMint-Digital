import { pgTable, serial, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

// ── V5 PR-9 / O-1: persistent admin sessions + admin audit trail ────────────
// PUSH-MODE tables (shared barrel, `pnpm --filter @workspace/db run push`),
// like every other crm_* table. Additive: two new tables, nothing altered.
//
// The CRM admin login previously issued only a process-lifetime in-memory
// bearer token (lib/admin-session.ts). That path is kept unchanged; these
// tables back the SECOND, cookie-based mode:
//   crm_admin_sessions   — one row per issued `admin_session` cookie. Only
//                          the sha256 HEX of the raw token is stored; the
//                          raw value lives only in the httpOnly cookie.
//                          12 h idle (last_seen_at) / 7 d absolute
//                          (expires_at); revoked_at ends it early.
//   crm_admin_audit_log  — append-only trail of admin auth events
//                          (login, logout, session revocation) and, later,
//                          sensitive admin actions. Never updated or deleted
//                          by application code.
// No roles yet (workbook O-1): actor is the literal "admin".

export const crmAdminSessions = pgTable("crm_admin_sessions", {
  id:         serial("id").primaryKey(),
  tokenHash:  text("token_hash").notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  ip:         text("ip"),
  userAgent:  text("user_agent"),
  revokedAt:  timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("uq_crm_admin_sessions_token_hash").on(table.tokenHash),
  index("ix_crm_admin_sessions_expires_at").on(table.expiresAt),
]);

export type CrmAdminSession = typeof crmAdminSessions.$inferSelect;

export const crmAdminAuditLog = pgTable("crm_admin_audit_log", {
  id:        serial("id").primaryKey(),
  /** Who acted. "admin" until roles exist. */
  actor:     text("actor").notNull(),
  /** Machine-readable, e.g. "admin.login", "admin.logout", "invite.created". */
  action:    text("action").notNull(),
  /** What it acted on (a session id, an invite id, a beta-request id). Never secrets. */
  target:    text("target"),
  ip:        text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_admin_audit_log_created_at").on(table.createdAt),
  index("ix_crm_admin_audit_log_action").on(table.action),
]);

export type CrmAdminAuditRow = typeof crmAdminAuditLog.$inferSelect;
