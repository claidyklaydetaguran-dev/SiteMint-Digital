// P9 — the disposable restore drill: proves a backup file actually
// restores, into a database that CANNOT be a real environment.
//
//   DRILL_DATABASE_URL=postgres://.../sitemint_restore_drill \
//     pnpm --filter @workspace/db run restore:drill -- --from backups/x.dump
//
// Guards (restore-guards.mjs): the target database NAME must declare
// itself disposable (drill/disposable/scratch/throwaway) and must not
// look like a real environment; the connection string never touches a
// command line. After pg_restore, the drill verifies the restored shape:
// the public table count and the three domain journal tables, and prints
// PASS or FAIL. Run it after every backup you intend to trust.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expectedRestoreShape, pgEnvFromUrl, validateDrillTargetUrl } from "./restore-guards.mjs";

function runChild(bin, args, env) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: "inherit", env, shell: process.platform === "win32" });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(2));
  });
}

async function main() {
  const fromFlag = process.argv.indexOf("--from");
  const fromPath = fromFlag !== -1 ? process.argv[fromFlag + 1] : undefined;
  if (!fromPath || !existsSync(fromPath)) {
    console.error("restore drill — --from <backup file> is required and must exist.");
    process.exit(2);
  }
  const targetUrl = process.env.DRILL_DATABASE_URL;
  if (!targetUrl) {
    console.error("restore drill — DRILL_DATABASE_URL is required (never printed). It must NOT be DATABASE_URL.");
    process.exit(2);
  }
  const guard = validateDrillTargetUrl(targetUrl);
  if (!guard.ok) {
    console.error(`restore drill — ${guard.reason}`);
    process.exit(2);
  }
  const envResult = pgEnvFromUrl(targetUrl);
  if (!envResult.ok) {
    console.error(`restore drill — ${envResult.reason}`);
    process.exit(2);
  }
  const childEnv = { ...process.env, ...envResult.env };

  console.log(`restore drill — restoring ${fromPath} into disposable database "${guard.dbName}"`);
  const restoreCode = await runChild("pg_restore", ["--no-owner", "--no-privileges", "--clean", "--if-exists", `--dbname=${guard.dbName}`, fromPath], childEnv);
  if (restoreCode !== 0) {
    console.error(`restore drill — pg_restore exited ${restoreCode}. FAIL.`);
    process.exit(1);
  }

  // Shape verification through the pg client (no shell, no secrets on argv).
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: targetUrl });
  await client.connect();
  try {
    const shape = await expectedRestoreShape();
    const tables = await client.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    const tableCount = tables.rows[0]?.count ?? 0;
    let journalsOk = true;
    for (const journal of shape.journalTables) {
      const probe = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [`"drizzle"."${journal}"`]);
      if (probe.rows[0]?.present !== true) {
        journalsOk = false;
        console.error(`restore drill — missing journal table drizzle.${journal}`);
      }
    }
    const countOk = tableCount === shape.publicTableCount;
    if (!countOk) {
      console.error(`restore drill — expected ${shape.publicTableCount} public tables, found ${tableCount}`);
    }
    if (countOk && journalsOk) {
      console.log(`restore drill — PASS (${tableCount} tables, all domain journals present).`);
      console.log("Drop the drill database when you are done with it.");
      process.exit(0);
    }
    console.error("restore drill — FAIL. Do not trust this backup until explained.");
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
