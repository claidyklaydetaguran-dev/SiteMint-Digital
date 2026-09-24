-- Push packet 0001: the two push-managed tables behind restart-safe operator
-- sign-in (lib/db/src/schema/crmAdminSessions.ts).
--
-- These are `crm_*` tables, so their normal mechanism is `drizzle-kit push`.
-- Push is a whole-schema reconciler, and aiming it at an initialised deployment
-- database is exactly what lib/db/MIGRATIONS.md §1 warns against. This packet
-- is the reviewed, additive equivalent of what push would create for these two
-- tables and nothing else: it mirrors the schema file column for column and
-- index for index, so a later push sees no difference.
--
-- Idempotent (IF NOT EXISTS throughout) and additive: it creates two tables and
-- four indexes, and alters or drops nothing. Applied in one transaction by
-- lib/db/src/apply-push-packet.mjs, which verifies the target's identity first.
--
-- Why it matters: lib/admin-session.ts degrades to bearer-only when these
-- tables are absent, and the bearer token is minted per process — so without
-- them an operator is signed out by every restart and refused by a second
-- instance. Verified missing on both staging databases on 2026-09-15 by
-- db-schema-check.mjs.
--
-- Rollback: DROP TABLE IF EXISTS "crm_admin_audit_log"; DROP TABLE IF EXISTS
-- "crm_admin_sessions"; — which signs every operator out of cookie sessions and
-- discards the audit trail.

CREATE TABLE IF NOT EXISTS "crm_admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"revoked_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_admin_sessions_token_hash" ON "crm_admin_sessions" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "ix_crm_admin_sessions_expires_at" ON "crm_admin_sessions" USING btree ("expires_at");

CREATE TABLE IF NOT EXISTS "crm_admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_crm_admin_audit_log_created_at" ON "crm_admin_audit_log" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "ix_crm_admin_audit_log_action" ON "crm_admin_audit_log" USING btree ("action");
