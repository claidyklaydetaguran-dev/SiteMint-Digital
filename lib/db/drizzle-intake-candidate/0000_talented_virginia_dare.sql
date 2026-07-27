CREATE TABLE "intake_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" integer NOT NULL,
	"caller_phone" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" integer NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL
);
