ALTER TABLE "voice_assistants" ADD COLUMN "browser_token_id" text;--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD COLUMN "browser_token_value" text;--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD COLUMN "browser_token_issued_at" timestamp with time zone;