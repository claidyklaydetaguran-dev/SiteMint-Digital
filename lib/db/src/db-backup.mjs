// P9 — guarded pg_dump wrapper. Usage:
//   DATABASE_URL=... pnpm --filter @workspace/db run backup -- --out backups/staging-2026-08-30.dump
//
// Guards: refuses without --out, refuses to overwrite, and NEVER places
// the connection string on a command line — it is decomposed into PG*
// environment variables for the child (see restore-guards.mjs).
// The dump format is custom (-Fc), suitable for pg_restore.
//
// This tool READS the source database and writes a local file. It never
// modifies anything. Which environment it reads is decided by whoever
// exports DATABASE_URL — identify the environment first
// (docs/backend-program/runbooks/ROLLBACK.md step 0).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { pgEnvFromUrl, validateBackupOutPath } from "./restore-guards.mjs";

async function main() {
  const outFlag = process.argv.indexOf("--out");
  const outPath = outFlag !== -1 ? process.argv[outFlag + 1] : undefined;
  const outCheck = validateBackupOutPath(outPath ?? "", existsSync);
  if (!outCheck.ok) {
    console.error(`db backup — ${outCheck.reason}`);
    process.exit(2);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("db backup — DATABASE_URL is required (never printed).");
    process.exit(2);
  }
  const envResult = pgEnvFromUrl(databaseUrl);
  if (!envResult.ok) {
    console.error(`db backup — ${envResult.reason}`);
    process.exit(2);
  }

  const args = ["--format=custom", "--no-owner", "--no-privileges", `--file=${outPath}`];
  console.log(`db backup — running pg_dump of "${envResult.env.PGDATABASE}" to ${outPath}`);
  const child = spawn("pg_dump", args, {
    stdio: "inherit",
    env: { ...process.env, ...envResult.env },
    shell: process.platform === "win32",
  });
  child.on("close", (code) => {
    if (code === 0) console.log("db backup — complete. Verify the file size before relying on it.");
    else console.error(`db backup — pg_dump exited ${code ?? 1}`);
    process.exit(code ?? 1);
  });
  child.on("error", (err) => {
    console.error(`db backup — could not run pg_dump (${err.message}). Is the postgres client installed?`);
    process.exit(2);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
