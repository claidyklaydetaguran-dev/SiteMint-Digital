CREATE TABLE "scheduling_date_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"date_key" text NOT NULL,
	"closed" boolean DEFAULT true NOT NULL,
	"start_time" text,
	"end_time" text,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_scheduling_date_exceptions_date_key" CHECK ("scheduling_date_exceptions"."date_key" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "ck_scheduling_date_exceptions_hours_match_closed" CHECK (("scheduling_date_exceptions"."closed" = true  AND "scheduling_date_exceptions"."start_time" IS NULL AND "scheduling_date_exceptions"."end_time" IS NULL)
     OR ("scheduling_date_exceptions"."closed" = false AND "scheduling_date_exceptions"."start_time" IS NOT NULL AND "scheduling_date_exceptions"."end_time" IS NOT NULL)),
	CONSTRAINT "ck_scheduling_date_exceptions_time_format" CHECK (("scheduling_date_exceptions"."start_time" IS NULL OR "scheduling_date_exceptions"."start_time" ~ '^[0-9]{2}:[0-9]{2}$')
    AND ("scheduling_date_exceptions"."end_time"   IS NULL OR "scheduling_date_exceptions"."end_time"   ~ '^[0-9]{2}:[0-9]{2}$')),
	CONSTRAINT "ck_scheduling_date_exceptions_range" CHECK ("scheduling_date_exceptions"."start_time" IS NULL OR "scheduling_date_exceptions"."end_time" > "scheduling_date_exceptions"."start_time")
);
--> statement-breakpoint
ALTER TABLE "scheduling_appointment_types" ADD COLUMN "min_notice_minutes" integer;--> statement-breakpoint
ALTER TABLE "scheduling_appointment_types" ADD COLUMN "max_advance_days" integer;--> statement-breakpoint
ALTER TABLE "scheduling_appointment_types" ADD COLUMN "slot_interval_minutes" integer;--> statement-breakpoint
ALTER TABLE "scheduling_appointment_types" ADD COLUMN "calendar_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_date_exceptions" ADD CONSTRAINT "scheduling_date_exceptions_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scheduling_date_exceptions_firm_id_date" ON "scheduling_date_exceptions" USING btree ("firm_id","date_key");--> statement-breakpoint
ALTER TABLE "scheduling_appointment_types" ADD CONSTRAINT "ck_scheduling_appointment_types_overrides_sane" CHECK (("scheduling_appointment_types"."buffer_before_minutes" IS NULL OR "scheduling_appointment_types"."buffer_before_minutes" >= 0)
    AND ("scheduling_appointment_types"."buffer_after_minutes"  IS NULL OR "scheduling_appointment_types"."buffer_after_minutes"  >= 0)
    AND ("scheduling_appointment_types"."min_notice_minutes"    IS NULL OR "scheduling_appointment_types"."min_notice_minutes"    >= 0)
    AND ("scheduling_appointment_types"."max_advance_days"      IS NULL OR "scheduling_appointment_types"."max_advance_days"      >= 1)
    AND ("scheduling_appointment_types"."slot_interval_minutes" IS NULL OR "scheduling_appointment_types"."slot_interval_minutes" >= 5)
    AND ("scheduling_appointment_types"."daily_limit"          IS NULL OR "scheduling_appointment_types"."daily_limit"          >= 1));