CREATE TABLE "voice_business_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"primary_contact_name" text,
	"primary_contact_email" text,
	"default_location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_business_profiles_contact_name" CHECK ("voice_business_profiles"."primary_contact_name" IS NULL OR char_length("voice_business_profiles"."primary_contact_name") BETWEEN 1 AND 120),
	CONSTRAINT "ck_voice_business_profiles_contact_email" CHECK ("voice_business_profiles"."primary_contact_email" IS NULL OR (char_length("voice_business_profiles"."primary_contact_email") BETWEEN 3 AND 254 AND "voice_business_profiles"."primary_contact_email" LIKE '%_@_%')),
	CONSTRAINT "ck_voice_business_profiles_location" CHECK ("voice_business_profiles"."default_location" IS NULL OR char_length("voice_business_profiles"."default_location") BETWEEN 1 AND 300)
);
--> statement-breakpoint
ALTER TABLE "voice_business_profiles" ADD CONSTRAINT "voice_business_profiles_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_business_profiles_firm_id" ON "voice_business_profiles" USING btree ("firm_id");