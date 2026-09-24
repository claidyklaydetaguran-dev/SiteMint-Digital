-- AR-001V: provider-synchronization state for an already-published assistant.
--
-- NOT APPLIED. This file was authored under AR-001V, which explicitly forbids
-- running it against Replit, staging, development, or production. It exists
-- as source only until a separate authorization names the target database.
--
-- Purely additive: four nullable columns, three CHECK constraints that
-- reference only those new columns, and one index. Nothing here alters or
-- drops an existing column, constraint, or index, so
-- ck_voice_assistants_status and ck_voice_assistants_publish_invariants keep
-- their exact current definitions and every existing row remains valid with
-- no backfill and no rewrite.
--
-- Why not reuse sync_error: ck_voice_assistants_publish_invariants requires
-- sync_error IS NULL for a 'published' row. A failed *update* of an already
-- published assistant must therefore be recorded somewhere else, or the
-- invariant would have to be relaxed — which would weaken the publish
-- lifecycle to serve the update lifecycle. provider_sync_error is that
-- separate place.
--
-- Why a hash and not updated_at: updated_at moves whenever any local field
-- changes, including Setup/Analysis/Advanced fields that are never sent to
-- the provider. provider_config_hash covers only the provider-relevant
-- payload, so a purely local edit does not make the row look out of sync.
ALTER TABLE "voice_assistants" ADD COLUMN "provider_config_hash" text;--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD COLUMN "provider_sync_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD COLUMN "provider_sync_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD COLUMN "provider_sync_error" text;--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "ck_voice_assistants_provider_sync_error_length" CHECK ("voice_assistants"."provider_sync_error" IS NULL OR char_length("voice_assistants"."provider_sync_error") <= 100);--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "ck_voice_assistants_provider_config_hash_shape" CHECK ("voice_assistants"."provider_config_hash" IS NULL OR "voice_assistants"."provider_config_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "ck_voice_assistants_provider_sync_attempt" CHECK (
      ("voice_assistants"."provider_sync_attempt_id" IS NULL AND "voice_assistants"."provider_sync_started_at" IS NULL)
      OR ("voice_assistants"."provider_sync_attempt_id" IS NOT NULL AND "voice_assistants"."provider_sync_started_at" IS NOT NULL)
    );--> statement-breakpoint
CREATE INDEX "ix_voice_assistants_provider_sync_started_at" ON "voice_assistants" USING btree ("provider_sync_started_at");
--> statement-breakpoint
-- BACKFILL: deliberately none.
--
-- provider_config_hash stays NULL for every existing row, and NULL is read as
-- "never proven synchronized". That is the honest default: the hash is
-- computed in application code from the runtime catalog and the server
-- artifact policy, neither of which SQL can reproduce, so any value written
-- here would be an assertion this migration cannot verify.
--
-- Recommended backfill for the existing staging assistant (id 1, firm-scoped),
-- whose provider-relevant configuration was verified against Vapi during
-- AR-001T: run one authorized synchronization from the dashboard. The sync
-- service computes the current payload hash, finds NULL (not equal), sends
-- the byte-identical payload the assistant is already running, and stamps the
-- hash on success. The row self-heals with one provider PATCH that changes
-- nothing, and the stamped hash is then proven rather than asserted.
--
-- A direct UPDATE ... SET provider_config_hash = '<digest>' is possible but is
-- NOT recommended: it records agreement with the provider that no one
-- observed, and a mistyped digest would silently mark a divergent assistant
-- as synchronized. If it is ever used, the digest must be produced by
-- computeProviderPayloadHash() against the exact same catalog and artifact
-- policy the server will use, and the row must be re-verified afterwards.
