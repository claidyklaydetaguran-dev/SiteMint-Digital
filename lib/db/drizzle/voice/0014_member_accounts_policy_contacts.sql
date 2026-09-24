CREATE TABLE "voice_policy_acceptances" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"policy" text NOT NULL,
	"version" text NOT NULL,
	"accepted_by" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_policy_acceptances_policy" CHECK ("voice_policy_acceptances"."policy" IN ('terms', 'privacy')),
	CONSTRAINT "ck_voice_policy_acceptances_version" CHECK ("voice_policy_acceptances"."version" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "voice_contacts" ADD COLUMN "origin" text DEFAULT 'call' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_contacts" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "voice_contacts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "voice_firm_members" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "voice_firm_members" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "voice_policy_acceptances" ADD CONSTRAINT "voice_policy_acceptances_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_policy_acceptances_firm_policy_version" ON "voice_policy_acceptances" USING btree ("firm_id","policy","version");--> statement-breakpoint
CREATE INDEX "ix_voice_policy_acceptances_firm" ON "voice_policy_acceptances" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "ix_voice_firm_members_email_status" ON "voice_firm_members" USING btree ("email","status");--> statement-breakpoint
ALTER TABLE "voice_contacts" ADD CONSTRAINT "ck_voice_contacts_origin" CHECK ("voice_contacts"."origin" IN ('call', 'manual'));--> statement-breakpoint
ALTER TABLE "voice_contacts" ADD CONSTRAINT "ck_voice_contacts_email_length" CHECK ("voice_contacts"."email" IS NULL OR char_length("voice_contacts"."email") BETWEEN 3 AND 254);--> statement-breakpoint
ALTER TABLE "voice_contacts" ADD CONSTRAINT "ck_voice_contacts_notes_length" CHECK ("voice_contacts"."notes" IS NULL OR char_length("voice_contacts"."notes") <= 2000);--> statement-breakpoint
ALTER TABLE "voice_firm_members" ADD CONSTRAINT "ck_voice_firm_members_invite_hash_shape" CHECK ("voice_firm_members"."invite_token_hash" IS NULL OR "voice_firm_members"."invite_token_hash" ~ '^[0-9a-f]{64}$');