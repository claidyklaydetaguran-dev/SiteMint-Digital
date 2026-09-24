CREATE TABLE "scheduling_appointment_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" integer NOT NULL,
	"appointment_type_id" integer NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"requested_start_at" timestamp with time zone NOT NULL,
	"requested_end_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"notes" text,
	"phone_consent" boolean DEFAULT false NOT NULL,
	"sms_consent" boolean DEFAULT false NOT NULL,
	"email_consent" boolean DEFAULT false NOT NULL,
	"provider_event_id" text,
	"provider_calendar_id" text,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "ck_scheduling_appointment_requests_status" CHECK ("scheduling_appointment_requests"."status" IN ('requested', 'pending_review', 'held', 'booked', 'cancelled', 'rescheduled', 'failed', 'expired')),
	CONSTRAINT "ck_scheduling_appointment_requests_source" CHECK ("scheduling_appointment_requests"."source" IN ('website', 'ai_receptionist', 'manual')),
	CONSTRAINT "ck_scheduling_appointment_requests_range" CHECK ("scheduling_appointment_requests"."requested_end_at" > "scheduling_appointment_requests"."requested_start_at"),
	CONSTRAINT "ck_scheduling_appointment_requests_booked_requires_provider" CHECK ("scheduling_appointment_requests"."status" <> 'booked' OR ("scheduling_appointment_requests"."provider_event_id" IS NOT NULL AND "scheduling_appointment_requests"."provider_calendar_id" IS NOT NULL)),
	CONSTRAINT "ck_scheduling_appointment_requests_notes_length" CHECK ("scheduling_appointment_requests"."notes" IS NULL OR char_length("scheduling_appointment_requests"."notes") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "scheduling_appointment_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"buffer_before_minutes" integer,
	"buffer_after_minutes" integer,
	"active" boolean DEFAULT true NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"daily_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_scheduling_appointment_types_duration_positive" CHECK ("scheduling_appointment_types"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "scheduling_availability_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"timezone" text NOT NULL,
	"public_slug" text,
	"minimum_scheduling_notice_minutes" integer DEFAULT 0 NOT NULL,
	"maximum_advance_booking_days" integer DEFAULT 30 NOT NULL,
	"default_buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"default_buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"default_daily_appointment_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_scheduling_availability_settings_notice_nonneg" CHECK ("scheduling_availability_settings"."minimum_scheduling_notice_minutes" >= 0),
	CONSTRAINT "ck_scheduling_availability_settings_advance_positive" CHECK ("scheduling_availability_settings"."maximum_advance_booking_days" >= 1)
);
--> statement-breakpoint
CREATE TABLE "scheduling_blocked_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"internal_label" text,
	"all_day" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_scheduling_blocked_periods_range" CHECK ("scheduling_blocked_periods"."ends_at" > "scheduling_blocked_periods"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "scheduling_weekly_hours" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	CONSTRAINT "ck_scheduling_weekly_hours_weekday_range" CHECK ("scheduling_weekly_hours"."weekday" >= 0 AND "scheduling_weekly_hours"."weekday" <= 6)
);
--> statement-breakpoint
ALTER TABLE "scheduling_appointment_requests" ADD CONSTRAINT "scheduling_appointment_requests_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_appointment_requests" ADD CONSTRAINT "scheduling_appointment_requests_appointment_type_id_scheduling_appointment_types_id_fk" FOREIGN KEY ("appointment_type_id") REFERENCES "public"."scheduling_appointment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_appointment_types" ADD CONSTRAINT "scheduling_appointment_types_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_availability_settings" ADD CONSTRAINT "scheduling_availability_settings_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_blocked_periods" ADD CONSTRAINT "scheduling_blocked_periods_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_weekly_hours" ADD CONSTRAINT "scheduling_weekly_hours_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scheduling_appointment_requests_public_id" ON "scheduling_appointment_requests" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "ix_scheduling_appointment_requests_firm_id_status" ON "scheduling_appointment_requests" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "ix_scheduling_appointment_requests_firm_id_start" ON "scheduling_appointment_requests" USING btree ("firm_id","requested_start_at");--> statement-breakpoint
CREATE INDEX "ix_scheduling_appointment_types_firm_id_active" ON "scheduling_appointment_types" USING btree ("firm_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scheduling_availability_settings_firm_id" ON "scheduling_availability_settings" USING btree ("firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scheduling_availability_settings_public_slug" ON "scheduling_availability_settings" USING btree ("public_slug") WHERE "scheduling_availability_settings"."public_slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_scheduling_blocked_periods_firm_id_range" ON "scheduling_blocked_periods" USING btree ("firm_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "ix_scheduling_weekly_hours_firm_id_weekday" ON "scheduling_weekly_hours" USING btree ("firm_id","weekday");