// AR-001O — the canonical fresh-database initialisation, in the one order that
// actually works.
//
// Every domain records into a single shared journal table
// (`drizzle.__drizzle_migrations`), and drizzle-kit decides what is pending by
// comparing each journal entry's `when` against the newest `created_at` already
// recorded — a global watermark, not a per-domain set difference. So applying a
// domain whose migration is *newer* first makes every older domain look
// already-applied. It then prints "migrations applied successfully!" and does
// nothing at all.
//
// Measured on a fresh database, ascending by `when`:
//
//     1784372011129  voice       0000_military_komodo
//     1784444570582  voice       0001_empty_sage
//     1784601043137  discovery   0000_discovery-domain-contract
//     1785251267367  scheduling  0000_superb_rhodey
//
// Running scheduling before discovery pushes the watermark past discovery, so
// `discovery_delivery_jobs` and `discovery_ai_briefs` are silently never
// created. Chronological order is therefore mandatory, and it is pinned by
// `migrationOrderContract.test.ts`.
//
// This file targets a database only when it is executed directly. Importing it
// — which the contract test does — runs nothing.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

/**
 * The canonical order. `push` creates the shared-barrel tables every domain
 * migration's foreign keys point at, so it must come first; the three domain
 * steps then ascend by journal timestamp.
 */
export const FRESH_DATABASE_MIGRATION_STEPS = [
  {
    script: "push",
    args: ["push", "--config", "./drizzle.config.ts"],
    description: "shared barrel: intake_*, crm_*, discovery_submissions, form_submissions",
  },
  {
    script: "migrate:voice",
    args: ["migrate", "--config", "./drizzle.voice.config.ts"],
    description: "voice_* (journal when 1784372011129, 1784444570582)",
  },
  {
    script: "migrate:discovery",
    args: ["migrate", "--config", "./drizzle.discovery.config.ts"],
    description: "discovery domain contract (journal when 1784601043137)",
  },
  {
    script: "migrate:scheduling",
    args: ["migrate", "--config", "./drizzle.scheduling.config.ts"],
    description: "scheduling_* (journal when 1785251267367)",
  },
];

export const SHARED_JOURNAL_SCHEMA = "drizzle";
export const SHARED_JOURNAL_TABLE = "__drizzle_migrations";

// drizzle-kit's "exports" map does not expose ./package.json, so it cannot be
// resolved through `require.resolve`. The package manager's own bin shim for
// this package's declared devDependency is the stable handle.
function resolveDrizzleKitBin() {
  const shim = resolve(packageRoot, "node_modules", ".bin", "drizzle-kit");
  if (!existsSync(shim)) {
    throw new Error(
      "Unable to locate the drizzle-kit executable for @workspace/db. " +
        "Run `pnpm install --frozen-lockfile` at the repository root first.",
    );
  }
  return shim;
}

function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Refusing to run migrations against an unidentified database.",
    );
    process.exit(1);
  }

  const drizzleKit = resolveDrizzleKitBin();

  console.log(
    `Applying ${FRESH_DATABASE_MIGRATION_STEPS.length} steps in the required order:\n` +
      FRESH_DATABASE_MIGRATION_STEPS.map((s, i) => `  ${i + 1}. ${s.script}`).join("\n"),
  );

  for (const step of FRESH_DATABASE_MIGRATION_STEPS) {
    console.log(`\n=== ${step.script} — ${step.description} ===`);
    const result = spawnSync(drizzleKit, step.args, {
      cwd: packageRoot,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(`\nmigrate:fresh stopped at ${step.script}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(
        `\nmigrate:fresh stopped at ${step.script} (exit ${result.status ?? "signal"}). ` +
          "No later step was run.",
      );
      process.exit(result.status ?? 1);
    }
  }

  console.log(
    "\nmigrate:fresh completed. Verify the shared journal holds one row per " +
      "committed migration before trusting the schema.",
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  main();
}
