import { defineConfig } from "drizzle-kit";
import path from "path";

// Phase 2C.2B — narrowly scoped Drizzle Kit configuration.
//
// Generates versioned migrations ONLY for the Project Discovery System
// tables (discovery_submissions' additive Phase 2C.2B columns,
// discovery_delivery_jobs, discovery_ai_briefs). Deliberately points at the
// dedicated discovery schema barrel (./src/schema/discovery/index.ts) rather
// than the shared application schema barrel (./src/schema/index.ts). The two
// new tables are NOT exported from the shared barrel, so the legacy CRM/
// intake `drizzle-kit push` config (./drizzle.config.ts) cannot discover,
// create, alter, or synchronize them — mirroring drizzle.voice.config.ts and
// ADR-05 (docs/ai-receptionist/DATABASE_STRATEGY.md).
//
// Never run `drizzle-kit push` with this config — discovery tables are
// versioned-migration-only, per docs/sitemint-platform/
// DISCOVERY_FORM_HARDENING_PRD.md §18/§36.
//
// `drizzle-kit generate` performs a filesystem diff against this config's
// own migration history (./drizzle/discovery) — it does not open a live
// database connection. `dbCredentials.url` is still required for the config
// module to load without throwing; no production (or any real) database
// connection is required or made to generate a migration with this config.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/discovery/index.ts"),
  out: "./drizzle/discovery",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
