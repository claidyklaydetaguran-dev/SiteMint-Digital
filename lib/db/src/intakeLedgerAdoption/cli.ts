// Checkpoint A3 — CLI entry point for the guarded intake ledger adoption
// utility.
//
// Deliberately NOT wired into any package.json script (no migrate:intake /
// check:intake command exists anywhere — see
// lib/db/test/intakeOwnershipContract.test.ts). Must be invoked directly,
// e.g.:
//
//   INTAKE_LEDGER_ADOPTION_DATABASE_URL=<url> \
//     scripts/node_modules/.bin/tsx lib/db/src/intakeLedgerAdoption/cli.ts
//
// Defaults to dry-run (no flags needed). Apply mode requires BOTH --apply
// and the exact --confirm=<token> value the dry-run run printed.
import pg from "pg";
import { runIntakeLedgerAdoption } from "./adopt";
import { CONNECTION_ENV_VAR } from "./constants";
import { redactConnectionTarget } from "./redact";
import { AdoptionDbClient, AdoptionMode, IntakeAdoptionError } from "./types";

export function parseArgs(argv: string[]): { mode: AdoptionMode; confirmation?: string } {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirmation = confirmArg?.slice("--confirm=".length);
  return { mode: apply ? "apply" : "dry-run", confirmation };
}

async function main(): Promise<void> {
  const connectionString = process.env[CONNECTION_ENV_VAR];
  if (!connectionString) {
    console.error(
      `FATAL: ${CONNECTION_ENV_VAR} is not set. This utility requires an explicitly named connection ` +
        `environment variable and never falls back to DATABASE_URL.`,
    );
    process.exit(1);
    return;
  }

  const redactedTarget = redactConnectionTarget(connectionString);
  const { mode, confirmation } = parseArgs(process.argv.slice(2));

  console.log(`Intake ledger adoption — mode: ${mode}`);
  console.log(`Target host: ${redactedTarget.hostForDisplay} (fingerprint ${redactedTarget.fingerprint})`);

  const pgClient = new pg.Client({ connectionString });
  await pgClient.connect();
  const client: AdoptionDbClient = pgClient;

  try {
    const outcome = await runIntakeLedgerAdoption(client, redactedTarget, { mode, confirmation });
    switch (outcome.status) {
      case "dry-run-ok":
        console.log("Dry run OK — no writes made.");
        console.log(`To apply, re-run with: --apply --confirm=${outcome.confirmationToken}`);
        break;
      case "already-adopted":
        console.log("Already adopted — ledger already contains the exact pinned baseline record. No writes made.");
        break;
      case "adopted":
        console.log("Adopted — wrote exactly one baseline ledger record.");
        break;
    }
  } catch (err) {
    if (err instanceof IntakeAdoptionError) {
      console.error(`REJECTED [${err.reason}]: ${err.message}`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  } finally {
    await pgClient.end();
  }
}

// Only run when executed directly (tsx lib/db/src/intakeLedgerAdoption/cli.ts),
// never as a side effect of importing this module (e.g. from a test that
// imports parseArgs) — this is the module's only entry point, and importing
// it must never open a database connection.
const isDirectlyExecuted = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectlyExecuted) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
