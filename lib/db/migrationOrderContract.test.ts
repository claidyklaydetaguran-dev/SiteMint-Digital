/**
 * AR-001O — committed contract test for fresh-database migration ordering.
 *
 * Run via: tsx lib/db/migrationOrderContract.test.ts
 * (registered in the aggregate chain in `scripts/package.json`)
 *
 * It lives beside `lib/db` rather than inside `lib/db/src` so that `tsc
 * --build` does not compile it into the package's emitted declarations — the
 * same arrangement the helpdesk contract tests use.
 *
 * What it protects. All four migration domains record into ONE shared journal
 * table, and drizzle-kit treats the newest recorded `created_at` as a global
 * watermark. A domain whose migration timestamp is older than the newest
 * already-applied one is skipped — while still reporting success. That is not
 * hypothetical: running `migrate:scheduling` before `migrate:discovery` on a
 * fresh database silently leaves `discovery_delivery_jobs` and
 * `discovery_ai_briefs` uncreated.
 *
 * So the canonical order is chronological, and these assertions fail if the
 * runner, the package scripts, the journals, or the documentation drift from
 * it. Nothing here opens a database connection.
 *
 * AR-001O correction 2 added sections 6-10: the discovery migration must stay
 * idempotent (`push` creates discovery_submissions and all 15 of its
 * Phase-2C.2B columns, both constraints and all four indexes before
 * `migrate:discovery` runs, so bare `ADD COLUMN` aborted the migration), it
 * must stay additive, the installed migrator must keep deciding pending work
 * from the journal timestamp alone without ever comparing the stored hash,
 * importing the runner must still target no database, and a second complete
 * run must remain a safe no-op.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readJson(...segments: string[]): any {
  return JSON.parse(readFileSync(join(here, ...segments), "utf8"));
}

function journalWhens(domain: string): number[] {
  const journal = readJson("drizzle", domain, "meta", "_journal.json");
  return (journal.entries as Array<{ when: number }>).map((e) => e.when);
}

console.log("--- migrationOrderContract.test.ts ---");

// ── 1. The runner's canonical order ──────────────────────────────────────────

const runner = await import("./src/migrate-fresh.mjs");
const steps = runner.FRESH_DATABASE_MIGRATION_STEPS as Array<{
  script: string;
  args: string[];
}>;
const scriptOrder = steps.map((s) => s.script);

check(
  "the runner declares exactly the four canonical steps, in order",
  JSON.stringify(scriptOrder) ===
    JSON.stringify(["push", "migrate:voice", "migrate:discovery", "migrate:scheduling"]),
  scriptOrder.join(" -> "),
);

check(
  "push runs first — every domain foreign key points at shared-barrel tables",
  scriptOrder[0] === "push",
);

check(
  "discovery is ordered before scheduling",
  scriptOrder.indexOf("migrate:discovery") < scriptOrder.indexOf("migrate:scheduling"),
);

check(
  "importing the runner does not execute it",
  typeof runner.FRESH_DATABASE_MIGRATION_STEPS !== "undefined",
);

// ── 2. Chronological journal timestamps ──────────────────────────────────────

const voiceWhens = journalWhens("voice");
const discoveryWhens = journalWhens("discovery");
const schedulingWhens = journalWhens("scheduling");

check("voice has at least one committed migration", voiceWhens.length > 0);
check("discovery has at least one committed migration", discoveryWhens.length > 0);
check("scheduling has at least one committed migration", schedulingWhens.length > 0);

const maxVoice = Math.max(...voiceWhens);
const minDiscovery = Math.min(...discoveryWhens);
const maxDiscovery = Math.max(...discoveryWhens);
const minScheduling = Math.min(...schedulingWhens);

check(
  "voice migrations all precede discovery",
  maxVoice < minDiscovery,
  `max(voice)=${maxVoice} min(discovery)=${minDiscovery}`,
);

check(
  "discovery migrations all precede scheduling — the watermark trap",
  maxDiscovery < minScheduling,
  `max(discovery)=${maxDiscovery} min(scheduling)=${minScheduling}`,
);

// The order the runner declares must match the order the timestamps demand.
const domainByScript: Record<string, number[]> = {
  "migrate:voice": voiceWhens,
  "migrate:discovery": discoveryWhens,
  "migrate:scheduling": schedulingWhens,
};
const declaredDomainOrder = scriptOrder.filter((s) => s !== "push");
const chronologicalDomainOrder = [...declaredDomainOrder].sort(
  (a, b) => Math.min(...domainByScript[a]) - Math.min(...domainByScript[b]),
);

check(
  "the declared domain order is the chronological order",
  JSON.stringify(declaredDomainOrder) === JSON.stringify(chronologicalDomainOrder),
  `declared=${declaredDomainOrder.join(",")} chronological=${chronologicalDomainOrder.join(",")}`,
);

// ── 3. The shared journal is genuinely shared ────────────────────────────────

const configs = [
  "drizzle.config.ts",
  "drizzle.voice.config.ts",
  "drizzle.discovery.config.ts",
  "drizzle.scheduling.config.ts",
];

for (const config of configs) {
  const source = readFileSync(join(here, config), "utf8");
  check(
    `${config} does not override the journal location`,
    !/migrationsSchema|migrationsTable/.test(source),
  );
}

check(
  "the runner records the shared journal identity it depends on",
  runner.SHARED_JOURNAL_SCHEMA === "drizzle" &&
    runner.SHARED_JOURNAL_TABLE === "__drizzle_migrations",
);

// ── 4. Package scripts ───────────────────────────────────────────────────────

const pkg = readJson("package.json");
const scripts: Record<string, string> = pkg.scripts ?? {};

check("a canonical migrate:fresh command exists", typeof scripts["migrate:fresh"] === "string");
check(
  "migrate:fresh runs the ordered runner",
  (scripts["migrate:fresh"] ?? "").includes("migrate-fresh.mjs"),
  scripts["migrate:fresh"],
);
check(
  "migrate:fresh introduces no new dependency (plain node)",
  (scripts["migrate:fresh"] ?? "").trim().startsWith("node "),
  scripts["migrate:fresh"],
);

for (const preserved of [
  "push",
  "push-force",
  "generate:voice",
  "migrate:voice",
  "generate:scheduling",
  "migrate:scheduling",
  "migrate:discovery",
]) {
  check(`the existing ${preserved} command is preserved`, typeof scripts[preserved] === "string");
}

// ── 5. The documentation no longer states the false claim ────────────────────

const doc = readFileSync(join(here, "MIGRATIONS.md"), "utf8");

check(
  "MIGRATIONS.md no longer says the domain migrations may run in any order",
  !/may be run in any order/i.test(doc),
);
check("MIGRATIONS.md documents migrate:fresh", doc.includes("migrate:fresh"));
check(
  "MIGRATIONS.md states the chronological requirement",
  /chronological/i.test(doc),
);

// ── 6. The discovery migration is idempotent ─────────────────────────────────
//
// AR-001O correction 2. `discovery_submissions` is reachable from the shared
// barrel (src/schema/index.ts re-exports ./submissions), so `push` creates all
// 15 Phase-2C.2B columns, both of its constraints and all four of its indexes
// before `migrate:discovery` ever runs. With bare `ADD COLUMN` the migration
// aborted on statement 1 and the documented fresh-database sequence could not
// succeed in ANY order — after push the columns already existed, before push
// the table did not. Every statement is therefore now idempotent.

const DISCOVERY_TAG = "0000_discovery-domain-contract";
const DISCOVERY_WHEN = 1784601043137;

const discoveryJournal = readJson("drizzle", "discovery", "meta", "_journal.json");
const discoveryEntry = (discoveryJournal.entries as Array<{ when: number; tag: string }>)[0];

check(
  "the discovery migration keeps its original journal timestamp",
  discoveryEntry?.when === DISCOVERY_WHEN,
  `when=${discoveryEntry?.when}`,
);
check(
  "the discovery migration keeps its original tag",
  discoveryEntry?.tag === DISCOVERY_TAG,
  `tag=${discoveryEntry?.tag}`,
);
check(
  "discovery still holds exactly one migration",
  (discoveryJournal.entries as unknown[]).length === 1,
);

const discoverySql = readFileSync(join(here, "drizzle", "discovery", `${DISCOVERY_TAG}.sql`), "utf8");

/** Executable statements, comments and blank padding removed. */
const discoveryStatements = discoverySql
  .split("--> statement-breakpoint")
  .map((chunk) =>
    chunk
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter((chunk) => chunk.length > 0);

check(
  "the discovery migration still has 32 executable statements",
  discoveryStatements.length === 32,
  `found ${discoveryStatements.length}`,
);

/**
 * The four idempotent statement forms this migration is allowed to use.
 * Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so the two constraint forms
 * use a guarded DO block, which runs in a PL/pgSQL subtransaction and therefore
 * cannot abort the migration's own transaction.
 */
const IDEMPOTENT_FORMS: Array<{ name: string; pattern: RegExp }> = [
  { name: "ADD COLUMN IF NOT EXISTS", pattern: /^ALTER TABLE "[^"]+" ADD COLUMN IF NOT EXISTS "[^"]+"/ },
  {
    name: "guarded ADD CONSTRAINT",
    pattern:
      /^DO \$\$ BEGIN\n ALTER TABLE "[^"]+" ADD CONSTRAINT "[^"]+"[\s\S]*;\nEXCEPTION\n WHEN duplicate_object THEN null;\nEND \$\$;$/,
  },
  { name: "CREATE INDEX IF NOT EXISTS", pattern: /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "[^"]+"/ },
  { name: "CREATE TABLE IF NOT EXISTS", pattern: /^CREATE TABLE IF NOT EXISTS "[^"]+"/ },
];

const formCounts: Record<string, number> = {};
const nonIdempotent: string[] = [];
for (const statement of discoveryStatements) {
  const form = IDEMPOTENT_FORMS.find((f) => f.pattern.test(statement));
  if (form) formCounts[form.name] = (formCounts[form.name] ?? 0) + 1;
  else nonIdempotent.push(statement.slice(0, 90).replace(/\n/g, " "));
}

check(
  "every discovery statement uses an idempotent form",
  nonIdempotent.length === 0,
  nonIdempotent.join(" | "),
);
check("15 columns are added idempotently", formCounts["ADD COLUMN IF NOT EXISTS"] === 15, `${formCounts["ADD COLUMN IF NOT EXISTS"]}`);
check("4 constraints are added under a duplicate_object guard", formCounts["guarded ADD CONSTRAINT"] === 4, `${formCounts["guarded ADD CONSTRAINT"]}`);
check("11 indexes are created idempotently", formCounts["CREATE INDEX IF NOT EXISTS"] === 11, `${formCounts["CREATE INDEX IF NOT EXISTS"]}`);
check("2 tables are created idempotently", formCounts["CREATE TABLE IF NOT EXISTS"] === 2, `${formCounts["CREATE TABLE IF NOT EXISTS"]}`);

// No statement may survive in a non-idempotent form, including inside a
// statement this loop classified some other way.
const executableSql = discoveryStatements.join("\n");
check(
  "no bare ADD COLUMN remains",
  !/ADD COLUMN (?!IF NOT EXISTS)/.test(executableSql),
);
check(
  "no unguarded ADD CONSTRAINT remains",
  !/^ALTER TABLE "[^"]+" ADD CONSTRAINT/m.test(executableSql),
);
check(
  "no bare CREATE INDEX remains",
  !/CREATE (?:UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(executableSql),
);
check(
  "no bare CREATE TABLE remains",
  !/CREATE TABLE (?!IF NOT EXISTS)/.test(executableSql),
);

// The migration must stay additive. `ON DELETE cascade` / `ON UPDATE no action`
// are clause text, not statements, so both patterns are anchored.
for (const [label, pattern] of [
  ["DROP", /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|SCHEMA)\b/i],
  ["TRUNCATE", /\bTRUNCATE\b/i],
  ["DELETE FROM", /\bDELETE\s+FROM\b/i],
  ["UPDATE <table>", /\bUPDATE\s+"/i],
  ["INSERT INTO", /\bINSERT\s+INTO\b/i],
  ["ALTER COLUMN", /\bALTER\s+COLUMN\b/i],
  ["RENAME", /\bRENAME\b/i],
] as Array<[string, RegExp]>) {
  check(`the discovery migration performs no ${label}`, !pattern.test(executableSql));
}

// ── 7. All 15 Phase-2C.2B columns are covered, in the schema's own order ─────

const EXPECTED_DISCOVERY_COLUMNS = [
  "schema_version",
  "form_version",
  "idempotency_key",
  "idempotency_payload_hash",
  "idempotency_payload_hash_key_version",
  "idempotency_canonicalization_version",
  "duplicate_fingerprint",
  "fingerprint_key_version",
  "duplicate_review_status",
  "duplicate_of_submission_id",
  "duplicate_resolved_at",
  "duplicate_resolved_by",
  "duplicate_resolution_reason_code",
  "privacy_policy_version",
  "is_automatically_scored",
];

const migratedColumns = [...executableSql.matchAll(/ADD COLUMN IF NOT EXISTS "([^"]+)"/g)].map(
  (m) => m[1],
);

check(
  "the migration adds exactly the 15 expected discovery columns, in order",
  JSON.stringify(migratedColumns) === JSON.stringify(EXPECTED_DISCOVERY_COLUMNS),
  migratedColumns.join(","),
);

// Each column must also exist in the shared barrel's table definition — that is
// precisely why `push` creates them first and why the migration must be
// idempotent to survive running after it.
const submissionsSource = readFileSync(join(here, "src", "schema", "submissions.ts"), "utf8");
const missingFromBarrel = EXPECTED_DISCOVERY_COLUMNS.filter(
  (column) => !submissionsSource.includes(`"${column}"`),
);
check(
  "every migrated column is also declared on the shared-barrel table",
  missingFromBarrel.length === 0,
  missingFromBarrel.join(","),
);

const barrelSource = readFileSync(join(here, "src", "schema", "index.ts"), "utf8");
check(
  "discovery_submissions is reachable from the shared barrel (push creates it)",
  /export \* from "\.\/submissions"/.test(barrelSource),
);
check(
  "the two new discovery tables stay out of the shared barrel",
  !barrelSource.includes("discoveryDeliveryJobs") && !barrelSource.includes("discoveryAiBriefs"),
);

// Defaults, nullability and constraint bodies must survive the idempotency
// rewrite verbatim.
for (const fragment of [
  `ADD COLUMN IF NOT EXISTS "duplicate_review_status" text DEFAULT 'none' NOT NULL;`,
  `ADD COLUMN IF NOT EXISTS "duplicate_resolved_at" timestamp with time zone;`,
  `ADD COLUMN IF NOT EXISTS "is_automatically_scored" boolean;`,
  `FOREIGN KEY ("duplicate_of_submission_id") REFERENCES "public"."discovery_submissions"("id") ON DELETE set null ON UPDATE no action;`,
  `CHECK ("discovery_submissions"."duplicate_review_status" IN ('none', 'pending', 'cleared', 'confirmed_duplicate'));`,
  `ON DELETE cascade ON UPDATE no action;`,
]) {
  check(
    `the rewrite preserved: ${fragment.slice(0, 62)}…`,
    executableSql.includes(fragment),
  );
}

// ── 8. The installed migrator still behaves the way the rewrite assumes ──────
//
// Editing an already-applied migration's SQL is only safe because this
// migrator (a) decides pending work from the journal timestamp alone and
// (b) stores each migration's sha256 but never reads it back to compare. If a
// dependency upgrade introduces a checksum check, or switches to a set
// difference that would re-run this migration, these assertions fail first.

const migratorSource = (() => {
  // drizzle-orm's "exports" map does not expose ./pg-core/dialect, so it cannot
  // be resolved directly. Resolve the exported ./pg-core entry point instead and
  // read its sibling dialect module out of the same directory.
  const require_ = createRequire(import.meta.url);
  let pgCoreDir: string;
  try {
    pgCoreDir = dirname(require_.resolve("drizzle-orm/pg-core"));
  } catch {
    return "";
  }
  for (const candidate of ["dialect.cjs", "dialect.js", "dialect.mjs"]) {
    try {
      return readFileSync(join(pgCoreDir, candidate), "utf8");
    } catch {
      /* try the next module format */
    }
  }
  return "";
})();

const migrateBody = (() => {
  const start = migratorSource.indexOf("async migrate(");
  return start === -1 ? "" : migratorSource.slice(start, start + 1800);
})();

check("the installed pg migrator source is readable", migrateBody.length > 0);
check(
  "pending work is decided by the journal timestamp watermark",
  /Number\(lastDbMigration\.created_at\) < migration\.folderMillis/.test(migrateBody),
);
check(
  "the stored hash is written but never compared",
  /insert into[\s\S]*migration\.hash/.test(migrateBody) &&
    !/lastDbMigration\.hash/.test(migrateBody),
);
check(
  "an applied migration is skipped wholesale, never re-executed statement-wise",
  /if \(!lastDbMigration \|\| Number/.test(migrateBody),
);
check(
  "the whole run is wrapped in one transaction, so a failure commits nothing",
  /session\.transaction\(async \(tx\)/.test(migrateBody),
);

// ── 9. Importing the runner targets no database ──────────────────────────────
//
// The previous assertion only proved the module exported something. This one
// proves behaviour: with DATABASE_URL unset, a child process that imports the
// runner must exit 0 and print nothing. If the import ran `main()`, the runner
// would print its refusal and exit 1; if it ran with a URL, it would spawn
// drizzle-kit against a real database.

const importProbe = spawnSync(
  process.execPath,
  ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(join(here, "src", "migrate-fresh.mjs")).href)}); console.log("IMPORT_ONLY_OK");`],
  {
    encoding: "utf8",
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== "DATABASE_URL"),
    ) as NodeJS.ProcessEnv,
  },
);

check("importing the runner exits cleanly with DATABASE_URL unset", importProbe.status === 0, `status=${importProbe.status} stderr=${(importProbe.stderr ?? "").trim().slice(0, 200)}`);
check(
  "importing the runner runs no migration step",
  (importProbe.stdout ?? "").trim() === "IMPORT_ONLY_OK",
  JSON.stringify((importProbe.stdout ?? "").trim().slice(0, 200)),
);
check(
  "importing the runner does not refuse-and-exit (i.e. main() did not run)",
  !(importProbe.stdout ?? "").includes("Refusing to run migrations") &&
    !(importProbe.stderr ?? "").includes("Refusing to run migrations"),
);

// ── 10. A second complete run is a safe no-op ───────────────────────────────
//
// Second-run safety rests on two independent properties: every domain
// migration is already recorded, so the watermark skips it; and every discovery
// statement is idempotent, so even a forced replay would not fail. `push` is a
// declarative diff against the live schema and converges by construction.

const allWhens = [...voiceWhens, ...discoveryWhens, ...schedulingWhens];
check(
  "every committed migration timestamp is distinct",
  new Set(allWhens).size === allWhens.length,
  allWhens.join(","),
);
check(
  "the canonical order applies timestamps in strictly ascending sequence",
  allWhens.every((when, i) => i === 0 || allWhens[i - 1] < when),
  allWhens.join(" < "),
);
check(
  "discovery sits between voice and scheduling, so it cannot be skipped",
  Math.max(...voiceWhens) < DISCOVERY_WHEN && DISCOVERY_WHEN < Math.min(...schedulingWhens),
  `${Math.max(...voiceWhens)} < ${DISCOVERY_WHEN} < ${Math.min(...schedulingWhens)}`,
);
check(
  "the runner applies discovery immediately before scheduling",
  scriptOrder.indexOf("migrate:scheduling") - scriptOrder.indexOf("migrate:discovery") === 1,
);

// ── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.error("Migration-order contract violated:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("All migrationOrderContract tests passed.");
