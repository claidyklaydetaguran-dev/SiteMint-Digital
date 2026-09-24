import { pgTable, serial, integer, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "./intakeAgent";

// ── P4: per-firm calendar connections ────────────────────────────────────────
// Versioned-migration-only (scheduling domain journal). The `scheduling_`
// prefix is REQUIRED: drizzle.config.ts's tablesFilter excludes
// `!scheduling_*` from legacy push, which is what protects these rows from
// push-mode reconciliation drops (ADR-05 / AR-001O correction 4).
//
// Token columns hold AES-256-GCM envelopes (base64(iv|tag|ciphertext)),
// encrypted by the api-server with CALENDAR_TOKEN_KEY. The database never
// sees a plaintext OAuth token, and nothing here is readable without the
// server-held key.

export const schedulingCalendarConnections = pgTable("scheduling_calendar_connections", {
  id:                   serial("id").primaryKey(),
  firmId:               integer("firm_id")
                          .notNull()
                          .references(() => intakeFirms.id, { onDelete: "cascade" }),
  provider:             text("provider").notNull().default("google"),
  status:               text("status").notNull().default("active"),
  /** Display-only label chosen at connect time (e.g. a masked account email). Never used for auth. */
  accountLabel:         text("account_label"),
  calendarId:           text("calendar_id").notNull().default("primary"),
  refreshTokenEnc:      text("refresh_token_enc").notNull(),
  accessTokenEnc:       text("access_token_enc"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  scope:                text("scope").notNull(),
  lastFreebusyAt:       timestamp("last_freebusy_at", { withTimezone: true }),
  lastErrorAt:          timestamp("last_error_at", { withTimezone: true }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_scheduling_calendar_connections_firm_provider").on(table.firmId, table.provider),
  index("ix_scheduling_calendar_connections_firm_id").on(table.firmId),
  check("ck_scheduling_calendar_connections_provider", sql`${table.provider} IN ('google')`),
  check("ck_scheduling_calendar_connections_status", sql`${table.status} IN ('active', 'revoked')`),
]);

export type SchedulingCalendarConnection = typeof schedulingCalendarConnections.$inferSelect;

// ── P4: one-time OAuth states (CSRF + PKCE) ──────────────────────────────────
// A row is written when the connect flow starts and consumed (deleted) by the
// callback exactly once. Only a hash of the state is stored; the PKCE code
// verifier is encrypted like the tokens above. Expired rows are inert and
// swept opportunistically on consume.

export const schedulingCalendarOauthStates = pgTable("scheduling_calendar_oauth_states", {
  id:              serial("id").primaryKey(),
  firmId:          integer("firm_id")
                     .notNull()
                     .references(() => intakeFirms.id, { onDelete: "cascade" }),
  stateHash:       text("state_hash").notNull(),
  codeVerifierEnc: text("code_verifier_enc").notNull(),
  expiresAt:       timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_scheduling_calendar_oauth_states_state_hash").on(table.stateHash),
  index("ix_scheduling_calendar_oauth_states_firm_id").on(table.firmId),
  index("ix_scheduling_calendar_oauth_states_expires_at").on(table.expiresAt),
]);

export type SchedulingCalendarOauthState = typeof schedulingCalendarOauthStates.$inferSelect;
