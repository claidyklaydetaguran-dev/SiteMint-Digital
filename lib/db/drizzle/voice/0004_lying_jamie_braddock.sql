CREATE TABLE "voice_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer,
	"phone_e164" text NOT NULL,
	"acquisition" text NOT NULL,
	"provider_number_id" text,
	"state" text DEFAULT 'inventory' NOT NULL,
	"assigned_assistant_id" integer,
	"paused_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "ck_voice_numbers_phone_shape" CHECK ("voice_numbers"."phone_e164" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "ck_voice_numbers_acquisition" CHECK ("voice_numbers"."acquisition" IN ('twilio_byo', 'vapi_native')),
	CONSTRAINT "ck_voice_numbers_state" CHECK ("voice_numbers"."state" IN ('inventory', 'assigned', 'paused', 'released')),
	CONSTRAINT "ck_voice_numbers_inventory_unowned" CHECK (("voice_numbers"."state" = 'inventory') = ("voice_numbers"."firm_id" IS NULL)),
	CONSTRAINT "ck_voice_numbers_assigned_has_assistant" CHECK ("voice_numbers"."state" <> 'assigned' OR "voice_numbers"."assigned_assistant_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "voice_transfer_destinations" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"label" text NOT NULL,
	"phone_e164" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"business_hours_only" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_transfer_destinations_phone_shape" CHECK ("voice_transfer_destinations"."phone_e164" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "ck_voice_transfer_destinations_label_length" CHECK (char_length("voice_transfer_destinations"."label") BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "voice_numbers" ADD CONSTRAINT "voice_numbers_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_numbers" ADD CONSTRAINT "voice_numbers_assigned_assistant_id_voice_assistants_id_fk" FOREIGN KEY ("assigned_assistant_id") REFERENCES "public"."voice_assistants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD CONSTRAINT "voice_transfer_destinations_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_numbers_phone" ON "voice_numbers" USING btree ("phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_numbers_provider_number_id" ON "voice_numbers" USING btree ("provider_number_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_numbers_one_assigned_per_firm" ON "voice_numbers" USING btree ("firm_id") WHERE "voice_numbers"."state" = 'assigned';--> statement-breakpoint
CREATE INDEX "ix_voice_numbers_firm_state" ON "voice_numbers" USING btree ("firm_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_transfer_destinations_firm_phone" ON "voice_transfer_destinations" USING btree ("firm_id","phone_e164");--> statement-breakpoint
CREATE INDEX "ix_voice_transfer_destinations_firm_active" ON "voice_transfer_destinations" USING btree ("firm_id","active");