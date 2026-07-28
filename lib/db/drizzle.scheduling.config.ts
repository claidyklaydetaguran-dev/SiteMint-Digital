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
// `drizzle-kit push` config (./drizzle.config.ts) cannot discover, create,
// alter, or synchronize them (see docs/ai-receptionist/DATABASE_STRATEGY.md,
// ADR-05).
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
