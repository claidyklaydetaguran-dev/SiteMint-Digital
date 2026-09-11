import {
  pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── M1: individual staff identities for the SiteMint internal CRM ────────────
//
// PUSH-MODE tables (shared barrel, `pnpm --filter @workspace/db run push`),
// like every other crm_* table, and additive only: three new tables, nothing
// altered. Per docs/ai-receptionist/INTEGRATION_OWNERSHIP.md the integration
// owner runs every push/migration — this file ships the SHAPE only.
//
// Why these exist: admin access was one shared password issuing a single
// process-lifetime bearer token, so every action was attributed to the literal
// string "admin", a restart signed everyone out, and a leaked token could not
// be revoked. These tables give SiteMint's three staff real identities,
// durable revocable sessions, and truthful attribution.
//
// SiteMint stays ONE company's internal CRM with several staff identities.
// This is deliberately not a multi-tenant model: there is no org/tenant column,
// and staff rows are global to the install.

/** Roles are coarse identities; `lib/staffPermissions.ts` maps them to granular grants. */
export const CRM_STAFF_ROLES = ["owner", "technical_admin", "operations_manager"] as const;
export type CrmStaffRole = (typeof CRM_STAFF_ROLES)[number];

/**
 * `invited` — row exists, no password set yet, cannot sign in.
 * `active`  — can sign in.
 * `disabled`— retained for attribution/history, cannot sign in, sessions revoked.
 * Rows are never deleted: deleting a person would orphan their historical work.
 */
export const CRM_STAFF_STATUSES = ["invited", "active", "disabled"] as const;
export type CrmStaffStatus = (typeof CRM_STAFF_STATUSES)[number];

export const crmStaff = pgTable("crm_staff", {
  id:              serial("id").primaryKey(),
  /** Lowercased at every write; the unique index is the identity boundary. */
  email:           text("email").notNull(),
  /** Editable free text — the brief requires editable display names. */
  displayName:     text("display_name").notNull(),
  role:            text("role").notNull(),
  status:          text("status").notNull().default("invited"),

  /**
   * scrypt (Node built-in, OWASP-acceptable memory-hard KDF) in the encoded
   * form produced by lib/staffPassword.ts. NULL while `invited`. No new
   * dependency is introduced for hashing.
   */
  passwordHash:    text("password_hash"),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),

  /** base32 TOTP secret, set at enrolment. NULL when MFA is not enrolled. */
  mfaSecret:       text("mfa_secret"),
  mfaEnrolledAt:   timestamp("mfa_enrolled_at", { withTimezone: true }),
  /** scrypt hashes of single-use recovery codes; a used code is removed. */
  mfaRecoveryHashes: text("mfa_recovery_hashes").array().notNull().default(sql`'{}'::text[]`),

  /**
   * Bumped on password change, MFA change, role change, and disable. A session
   * whose stored epoch differs from this value is dead — this is what makes
   * "revoke everything now" a single UPDATE instead of a session sweep.
   */
  sessionEpoch:    integer("session_epoch").notNull().default(0),

  /**
   * Set when a legacy free-text name (e.g. "Saisa Lorraigne") was confidently
   * mapped onto this person during attribution backfill. Ambiguous names are
   * NEVER auto-mapped — they are queued for human review instead.
   */
  legacyNames:     text("legacy_names").array().notNull().default(sql`'{}'::text[]`),

  /**
   * Per-person grant edits layered over the role defaults, so the owner can
   * tailor access without inventing new roles ("Saisa may send campaigns").
   * Revocations win over grants. Only `staff.role.assign` holders may edit
   * these, and no one may edit their own — see lib/staffPermissions.ts.
   */
  extraPermissions:   text("extra_permissions").array().notNull().default(sql`'{}'::text[]`),
  revokedPermissions: text("revoked_permissions").array().notNull().default(sql`'{}'::text[]`),

  /**
   * IANA zone, e.g. "Asia/Manila". Reminders are scheduled in absolute UTC but
   * COMPUTED from this, so "remind me at 9am" means 9am where the person is.
   */
  timezone:        text("timezone").notNull().default("UTC"),
  /** Per-person delivery preferences for the reminder engine. */
  reminderEmailEnabled: boolean("reminder_email_enabled").notNull().default(false),
  dailyDigestEnabled:   boolean("daily_digest_enabled").notNull().default(false),
  /** Local hour (0-23) the daily digest should arrive. */
  dailyDigestHour:      integer("daily_digest_hour").notNull().default(8),

  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt:     timestamp("last_login_at", { withTimezone: true }),
  disabledAt:      timestamp("disabled_at", { withTimezone: true }),
  createdByStaffId: integer("created_by_staff_id"),
}, (table) => [
  uniqueIndex("uq_crm_staff_email").on(table.email),
  index("ix_crm_staff_status").on(table.status),
  check("ck_crm_staff_role", sql`${table.role} IN ('owner', 'technical_admin', 'operations_manager')`),
  check("ck_crm_staff_status", sql`${table.status} IN ('invited', 'active', 'disabled')`),
  check("ck_crm_staff_email_lower", sql`${table.email} = lower(${table.email})`),
]);

export type CrmStaff = typeof crmStaff.$inferSelect;
export type NewCrmStaff = typeof crmStaff.$inferInsert;

/**
 * One row per issued `crm_staff_session` cookie. Only the sha256 hex of the
 * raw token is stored; the raw value lives only in the httpOnly cookie.
 * 12h idle (last_seen_at) / 7d absolute (expires_at); `revoked_at` or an
 * `epoch` mismatch against crm_staff.session_epoch ends it early.
 */
export const crmStaffSessions = pgTable("crm_staff_sessions", {
  id:          serial("id").primaryKey(),
  staffId:     integer("staff_id").notNull().references(() => crmStaff.id, { onDelete: "cascade" }),
  tokenHash:   text("token_hash").notNull(),
  /**
   * sha256 of the CSRF token. The raw CSRF token is returned to the client
   * once and echoed in an X-CSRF-Token header on every mutating request —
   * double-submit, so a cross-site form post cannot forge it.
   */
  csrfHash:    text("csrf_hash").notNull(),
  epoch:       integer("epoch").notNull().default(0),
  /** False until a TOTP code is accepted for this session, when MFA is enrolled. */
  mfaSatisfied: boolean("mfa_satisfied").notNull().default(false),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt:  timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt:   timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt:   timestamp("revoked_at", { withTimezone: true }),
  ip:          text("ip"),
  userAgent:   text("user_agent"),
}, (table) => [
  uniqueIndex("uq_crm_staff_sessions_token_hash").on(table.tokenHash),
  index("ix_crm_staff_sessions_staff_id").on(table.staffId),
  index("ix_crm_staff_sessions_expires_at").on(table.expiresAt),
]);

export type CrmStaffSession = typeof crmStaffSessions.$inferSelect;

/**
 * Single-use, expiring tokens for onboarding and recovery. Only the sha256 hex
 * is stored. `consumed_at` makes replay impossible; issuing a new token of the
 * same kind revokes the outstanding one.
 */
export const CRM_STAFF_TOKEN_KINDS = ["invite", "password_reset"] as const;
export type CrmStaffTokenKind = (typeof CRM_STAFF_TOKEN_KINDS)[number];

export const crmStaffTokens = pgTable("crm_staff_tokens", {
  id:               serial("id").primaryKey(),
  staffId:          integer("staff_id").notNull().references(() => crmStaff.id, { onDelete: "cascade" }),
  kind:             text("kind").notNull(),
  tokenHash:        text("token_hash").notNull(),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt:        timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt:       timestamp("consumed_at", { withTimezone: true }),
  revokedAt:        timestamp("revoked_at", { withTimezone: true }),
  createdByStaffId: integer("created_by_staff_id"),
}, (table) => [
  uniqueIndex("uq_crm_staff_tokens_token_hash").on(table.tokenHash),
  index("ix_crm_staff_tokens_staff_kind").on(table.staffId, table.kind),
  check("ck_crm_staff_tokens_kind", sql`${table.kind} IN ('invite', 'password_reset')`),
]);

export type CrmStaffToken = typeof crmStaffTokens.$inferSelect;

/**
 * Durable authentication-attempt ledger backing login/reset throttling.
 *
 * A process-memory limiter only throttles the instance that happened to
 * receive the request, so on a horizontally scaled deployment an attacker
 * simply spreads attempts across instances. Recording attempts in the database
 * makes the limit hold across every instance and across restarts.
 *
 * `scope` is "ip" or "account"; `subject` is the derived client address or the
 * lowercased email. Rows are pruned once outside the window — nothing here is
 * long-term data, and no credential material is ever written.
 */
export const crmStaffLoginAttempts = pgTable("crm_staff_login_attempts", {
  id:        serial("id").primaryKey(),
  scope:     text("scope").notNull(),
  subject:   text("subject").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_staff_login_attempts_lookup").on(table.scope, table.subject, table.createdAt),
  check("ck_crm_staff_login_attempts_scope", sql`${table.scope} IN ('ip', 'account')`),
]);

export type CrmStaffLoginAttempt = typeof crmStaffLoginAttempts.$inferSelect;
