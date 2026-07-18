import { defineConfig } from "drizzle-kit";
import path from "path";

// Milestone 1 / Checkpoint C — narrowly scoped Drizzle Kit configuration.
//
// Generates versioned migrations ONLY for the new voice-platform tables
// (voice_assistants, provider_webhook_events, voice_issues). Deliberately
// points at the dedicated voice schema barrel (./src/schema/voice/index.ts)
// rather than the shared application schema barrel (./src/schema/index.ts).
// The three voice tables are NOT exported from the shared barrel, so the
// legacy CRM/intake `drizzle-kit push` config (./drizzle.config.ts) cannot
// discover, create, alter, or synchronize them (see
// docs/ai-receptionist/DATABASE_STRATEGY.md, ADR-05).
//
// Never run `drizzle-kit push` with this config — voice tables are
// versioned-migration-only.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/voice/index.ts"),
  out: "./drizzle/voice",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
