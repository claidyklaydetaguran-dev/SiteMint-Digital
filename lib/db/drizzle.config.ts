import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Checkpoint A1: scoped to the legacy-push barrel (excludes
// intake_conversations/intake_messages) and explicitly allowlisted via
// tablesFilter, so `push`/`push-force` can never discover, alter, or drop
// those two tables (owned by the new versioned intake migration stream —
// see src/schema/intakeVersioned/index.ts).
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/legacyPush/index.ts"),
  dialect: "postgresql",
  schemaFilter: ["public"],
  tablesFilter: [
    "discovery_submissions",
    "form_submissions",
    "crm_leads",
    "crm_activities",
    "crm_tasks",
    "crm_email_templates",
    "crm_messages",
    "crm_deals",
    "crm_transactions",
    "crm_projects",
    "crm_campaigns",
    "crm_campaign_recipients",
    "crm_campaign_events",
    "crm_campaign_steps",
    "crm_campaign_scheduled_messages",
    "crm_behavioral_events",
    "ai_toolkit_purchases",
    "landing_page_views",
    "helpdesk_contacts",
    "helpdesk_agents",
    "helpdesk_tickets",
    "helpdesk_messages",
    "intake_firms",
    "intake_cases",
    "receptionist_sessions",
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
