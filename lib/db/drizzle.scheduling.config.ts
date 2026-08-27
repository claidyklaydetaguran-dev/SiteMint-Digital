import { defineConfig } from "drizzle-kit";
import path from "path";

// Checkpoint B — narrowly scoped Drizzle Kit configuration.
//
// Generates versioned migrations ONLY for the new durable scheduling tables
// (scheduling_availability_settings, scheduling_weekly_hours,
// scheduling_appointment_types, scheduling_blocked_periods,
// scheduling_appointment_requests). Deliberately points at the dedicated
// scheduling schema barrel (./src/schema/scheduling/index.ts) rather than the
// shared application schema barrel (./src/schema/index.ts). These tables are
// NOT exported from the shared barrel, so the legacy CRM/intake
// `drizzle-kit push` config (./drizzle.config.ts) cannot create,
// alter, or synchronize them (see docs/ai-receptionist/DATABASE_STRATEGY.md,
// ADR-05).
//
// Absence from the barrel does NOT protect them from deletion. push
// reconciles the whole managed schema: anything it introspects that the
// barrel does not export is a drop candidate, which is how a second
// `migrate:fresh` removed all ten domain-migration-owned tables on staging
// (AR-001O correction 4). Deletion protection comes from the
// `!scheduling_*` entry in ./drizzle.config.ts's `tablesFilter`. Do not
// remove it.
//
// Never run `drizzle-kit push` with this config — scheduling tables are
// versioned-migration-only.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/scheduling/index.ts"),
  out: "./drizzle/scheduling",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
