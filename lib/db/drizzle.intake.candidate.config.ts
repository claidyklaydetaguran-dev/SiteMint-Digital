import path from "path";

// Checkpoint A1: generation-only candidate config for the future versioned
// intake migration stream. Deliberately NOT wrapped in defineConfig(...) and
// deliberately has no `dbCredentials` field — drizzle-kit's own `migrate`
// and `push` commands both require dbCredentials to parse successfully
// before ever connecting to a database (verified against drizzle-kit
// 0.31.10's prepareMigrateConfig/preparePushConfig, both of which call
// postgresCredentials.safeParse and process.exit(1) on failure). A config
// shaped like this one therefore cannot be used to run `migrate` or `push`
// against any database, regardless of what DATABASE_URL happens to be set
// in the environment. `generate` never connects to a database at all, so
// it works fine against this config with no credentials present.
//
// out points at a directory distinct from any canonical migration
// directory — no canonical lib/db/drizzle/intake/ directory exists yet,
// and no migrate:intake/check:intake script exists anywhere in
// package.json (see lib/db/test/intakeOwnershipContract.test.ts).
export default {
  schema: path.join(__dirname, "./src/schema/intakeVersioned/index.ts"),
  out: "./drizzle-intake-candidate",
  dialect: "postgresql" as const,
};
