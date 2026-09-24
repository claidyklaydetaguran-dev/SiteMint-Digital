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
// create, alter, or synchronize them (see
// docs/ai-receptionist/DATABASE_STRATEGY.md, ADR-05).
//
// Absence from the barrel does NOT protect them from deletion. push
// reconciles the whole managed schema: anything it introspects that the
// barrel does not export is a drop candidate, which is how a second
// `migrate:fresh` removed all ten domain-migration-owned tables on staging
// (AR-001O correction 4). Deletion protection comes from the `!voice_*`
// entry in ./drizzle.config.ts's `tablesFilter`. Do not remove it.
//
// Never run `drizzle-kit push` with this config — voice tables are
// versioned-migration-only.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/voice/index.ts").split(path.sep).join("/"),
  out: "./drizzle/voice",
  dialect: "postgresql",
  // AR-001Z. Its own journal, so this domain's watermark is its own. Sharing
  // drizzle's default table let one domain's newest migration mask every other
  // domain's older ones, silently, with exit 0.
  migrations: {
    table: "__drizzle_migrations_voice",
    schema: "drizzle",
  },
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
