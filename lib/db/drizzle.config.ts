import { defineConfig } from "drizzle-kit";
import path from "path";

// Base (shared-barrel) push configuration — the only config `drizzle-kit push`
// may ever be run with.
//
// AR-001O correction 4. `push` is a whole-schema reconciler, not a
// barrel-scoped one. It introspects every table in the managed schema and
// treats anything the TypeScript barrel does not export as a deletion
// candidate. Absence from `src/schema/index.ts` therefore stops push from
// *creating* or *altering* a domain table — and is precisely what makes push
// *drop* it. Measured on an isolated staging database: a second
// `migrate:fresh` removed all ten domain-migration-owned tables (public base
// tables 37 -> 27) while the shared journal still reported their migrations as
// applied, so re-running the migrations recreated nothing. push printed only
// its success line and exited 0.
//
// `tablesFilter` closes that hole. Each entry is a minimatch glob matched
// against the bare table name, and a leading `!` negates it. Under the
// installed drizzle-kit the filter is applied while introspecting the database
// (`pgPushIntrospect` -> `fromDatabase`), so an excluded table never enters the
// "current database" snapshot at all: it cannot be created, altered, renamed or
// dropped, and it is never a deletion candidate, because there is nothing on
// either side of the diff to compare. drizzle-kit uses this same `!`-prefixed
// form itself for its PostGIS exclusions.
//
// Only a family whose entire namespace is domain-migration-owned may use a
// wildcard. `discovery_*` may NOT: `discovery_submissions` IS barrel-owned and
// has to stay managed by push (the discovery migration only adds columns to
// it), so the two discovery domain tables are excluded by exact name.
//
// `schemaFilter` is pinned to `public` explicitly. That is already drizzle-kit's
// default, but it is also the boundary that keeps the Stripe connector's
// `stripe` schema outside the managed set entirely. Never widen it, and never
// set it to `[]` — an empty list removes the WHERE clause from the
// introspection queries and pulls in every schema in the database.
//
// Both lists are pinned by `migrationOrderContract.test.ts` section 11.
// MIGRATIONS.md section 1 carries the operator-facing description, including
// the harmless trailing `DROP SEQUENCE` error these exclusions provoke.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  schemaFilter: ["public"],
  tablesFilter: [
    "!voice_*",
    "!provider_webhook_events",
    "!discovery_ai_briefs",
    "!discovery_delivery_jobs",
    "!scheduling_*",
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
