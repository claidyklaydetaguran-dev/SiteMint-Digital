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
 *
 * AR-001O correction 4 added section 11. Second-run safety needed one more
 * property than correction 2 assumed: `push` does not merely "converge by
 * construction", it reconciles the whole managed schema and drops anything the
 * shared barrel does not export. On staging that removed all ten
 * domain-migration-owned tables while the journal still reported them applied.
 * Section 11 pins the `tablesFilter` exclusions that now protect them, proves
 * the boundary against table names derived from the committed migrations and
 * the shared barrel rather than hand-typed lists, and fails if the installed
 * drizzle-kit stops implementing the filter the way the boundary depends on.
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

function journalEntries(domain: string): Array<{ tag: string; when: number }> {
  const journal = readJson("drizzle", domain, "meta", "_journal.json");
  return (journal.entries as Array<{ tag: string; when: number }>).map((e) => ({
    tag: e.tag,
    when: e.when,
  }));
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

// All domains record into ONE shared journal table, and drizzle-kit decides
// pending work from a single global watermark: the newest recorded created_at.
// A migration whose journal `when` sits at or below that watermark is skipped
// silently — no hash comparison, no error, no row.
//
// Domain-block ordering ("every voice migration precedes discovery") is
// therefore NOT the invariant that matters, and enforcing it is what caused
// AR-001X: voice 0002 was authored below the scheduling watermark, and
// migrate:voice reported success while applying nothing. The invariant that
// matters is that the shared journal describes ONE strictly increasing global
// timeline, and that every committed migration appears on it exactly once, in
// the order it is actually applied.

/** Every migration sharing drizzle.__drizzle_migrations, in application order. */
const SHARED_JOURNAL_TIMELINE: Array<{ domain: string; tag: string; when: number }> = [
  { domain: "voice", tag: "0000_military_komodo", when: 1784372011129 },
  { domain: "voice", tag: "0001_empty_sage", when: 1784444570582 },
  { domain: "discovery", tag: "0000_discovery-domain-contract", when: 1784601043137 },
  { domain: "scheduling", tag: "0000_superb_rhodey", when: 1785251267367 },
  { domain: "voice", tag: "0002_provider_sync_state", when: 1785300000000 },
];

const committedMigrations = ["voice", "discovery", "scheduling"].flatMap((domain) =>
  journalEntries(domain).map((e) => ({ domain, tag: e.tag, when: e.when })),
);

check(
  "the timeline enumerates every committed migration exactly once",
  committedMigrations.length === SHARED_JOURNAL_TIMELINE.length &&
    committedMigrations.every(
      (e) =>
        SHARED_JOURNAL_TIMELINE.filter((t) => t.domain === e.domain && t.tag === e.tag)
          .length === 1,
    ),
  `committed=${committedMigrations.length} timeline=${SHARED_JOURNAL_TIMELINE.length}`,
);

check(
  "each timeline entry matches the timestamp recorded in its journal",
  SHARED_JOURNAL_TIMELINE.every((t) =>
    committedMigrations.some(
      (e) => e.domain === t.domain && e.tag === t.tag && e.when === t.when,
    ),
  ),
  SHARED_JOURNAL_TIMELINE.map((t) => `${t.domain}/${t.tag}=${t.when}`).join(" "),
);

const timelineWhens = SHARED_JOURNAL_TIMELINE.map((t) => t.when);

check(
  "the global timeline is strictly increasing",
  timelineWhens.every((when, i) => i === 0 || timelineWhens[i - 1] < when),
  timelineWhens.join(" < "),
);

check(
  "every committed timestamp is unique across the shared journal",
  new Set(timelineWhens).size === timelineWhens.length,
  timelineWhens.join(","),
);

check(
  "the newest committed migration ends the timeline, clearing the watermark",
  Math.max(...timelineWhens) === timelineWhens[timelineWhens.length - 1],
  `max=${Math.max(...timelineWhens)} last=${timelineWhens[timelineWhens.length - 1]}`,
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

// Timestamp distinctness, strict ascent, and watermark clearance are asserted
// once, against SHARED_JOURNAL_TIMELINE in section 2. Duplicating them here
// against domain blocks is what encoded the obsolete ordering rule.
check(
  "the runner applies discovery immediately before scheduling",
  scriptOrder.indexOf("migrate:scheduling") - scriptOrder.indexOf("migrate:discovery") === 1,
);

// ── 11. The base push config's domain-table exclusion boundary ──────────────
//
// AR-001O correction 4. Absence from the shared barrel does not protect a table
// from `drizzle-kit push` — it is exactly what marks it for deletion, and a
// second `migrate:fresh` proved it by dropping all ten domain-migration-owned
// tables on staging. The only thing that protects them is `tablesFilter` in
// drizzle.config.ts. These assertions fail if a required exclusion is removed
// or weakened, if `discovery_submissions` is ever excluded, if a barrel-owned
// table stops being managed, or if the installed drizzle-kit stops
// implementing the filter the way this boundary depends on.

const baseConfigSource = readFileSync(join(here, "drizzle.config.ts"), "utf8");

function configArray(key: string): string[] {
  const match = baseConfigSource.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  return match ? [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]) : [];
}

const tablesFilter = configArray("tablesFilter");
const schemaFilter = configArray("schemaFilter");

/**
 * Mirrors the installed drizzle-kit's push-time table filter exactly
 * (`pgPushIntrospect` -> `filter` in drizzle-kit's bin.cjs):
 *
 *   no patterns            -> keep everything
 *   a negated pattern      -> contributes `false` when the bare pattern matches
 *   any pattern that hits  -> contributes `true`
 *   nothing contributed    -> drop the table
 *
 * A minimatch matcher built from `!foo` reports `negate` and returns the
 * inverted result from `.match()`, which is why the two branches below are not
 * mutually exclusive. Section 11's installed-source assertions fail if that
 * shape ever changes, and `patterns use only mirrored glob syntax` fails if a
 * pattern needs a minimatch feature this mirror does not implement.
 */
function mirrorGlob(pattern: string): RegExp {
  const body = pattern.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${body}$`);
}

function pushKeepsTable(patterns: string[], tableName: string): boolean {
  if (patterns.length === 0) return true;
  const flags: boolean[] = [];
  for (const pattern of patterns) {
    const negate = pattern.startsWith("!");
    const matched = negate
      ? !mirrorGlob(pattern.slice(1)).test(tableName)
      : mirrorGlob(pattern).test(tableName);
    if (negate && !matched) flags.push(false);
    if (matched) flags.push(true);
  }
  return flags.length > 0 ? flags.every(Boolean) : false;
}

// The protected set is derived from the committed migrations, never hand-typed.

function tablesCreatedBy(domain: string): string[] {
  const journal = readJson("drizzle", domain, "meta", "_journal.json");
  return (journal.entries as Array<{ tag: string }>).flatMap((entry) => {
    const sql = readFileSync(join(here, "drizzle", domain, `${entry.tag}.sql`), "utf8");
    return [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/g)].map((m) => m[1]);
  });
}

const voiceTables = tablesCreatedBy("voice");
const discoveryTables = tablesCreatedBy("discovery");
const schedulingTables = tablesCreatedBy("scheduling");
const domainTables = [...voiceTables, ...discoveryTables, ...schedulingTables];

check(
  "the committed migrations create exactly ten domain tables",
  domainTables.length === 10,
  domainTables.join(","),
);
check(
  "the scheduling migration creates exactly five scheduling_* tables",
  schedulingTables.length === 5 && schedulingTables.every((t) => t.startsWith("scheduling_")),
  schedulingTables.join(","),
);
check(
  "the voice migrations create voice_assistants, provider_webhook_events, voice_issues",
  ["voice_assistants", "provider_webhook_events", "voice_issues"].every((t) =>
    voiceTables.includes(t),
  ),
  voiceTables.join(","),
);
check(
  "the discovery migration creates the two discovery domain tables",
  discoveryTables.length === 2 &&
    ["discovery_delivery_jobs", "discovery_ai_briefs"].every((t) => discoveryTables.includes(t)),
  discoveryTables.join(","),
);

// The barrel-owned set is derived from the shared barrel, never hand-typed.

const barrelModules = [...barrelSource.matchAll(/export \* from "\.\/([^"]+)"/g)].map((m) => m[1]);
const barrelTables = [
  ...new Set(
    barrelModules.flatMap((mod) => {
      const source = readFileSync(join(here, "src", "schema", `${mod}.ts`), "utf8");
      return [...source.matchAll(/pgTable\(\s*"([^"]+)"/g)].map((m) => m[1]);
    }),
  ),
];

check("the shared barrel resolves to real table names", barrelTables.length > 20, `${barrelTables.length}`);
check(
  "no barrel-owned table is also created by a domain migration",
  barrelTables.every((t) => !domainTables.includes(t)),
  barrelTables.filter((t) => domainTables.includes(t)).join(","),
);

// ── the required exclusions ──

const REQUIRED_EXCLUSIONS = [
  "!voice_*",
  "!provider_webhook_events",
  "!discovery_ai_briefs",
  "!discovery_delivery_jobs",
  "!scheduling_*",
];

check(
  "drizzle.config.ts declares a tablesFilter",
  tablesFilter.length > 0,
  JSON.stringify(tablesFilter),
);
for (const pattern of REQUIRED_EXCLUSIONS) {
  check(`tablesFilter still excludes ${pattern}`, tablesFilter.includes(pattern));
}
check(
  "tablesFilter declares no pattern beyond the required exclusions",
  tablesFilter.every((p) => REQUIRED_EXCLUSIONS.includes(p)),
  JSON.stringify(tablesFilter.filter((p) => !REQUIRED_EXCLUSIONS.includes(p))),
);
check(
  "every pattern is an exclusion — a positive pattern would drop every barrel table",
  tablesFilter.every((p) => p.startsWith("!")),
);
check(
  "patterns use only the glob syntax this mirror implements",
  tablesFilter.every((p) => /^![A-Za-z0-9_]+\*?$/.test(p)),
  JSON.stringify(tablesFilter.filter((p) => !/^![A-Za-z0-9_]+\*?$/.test(p))),
);
check(
  "no discovery_* wildcard — it would exclude barrel-owned discovery_submissions",
  !tablesFilter.includes("!discovery_*"),
);

// ── the boundary actually holds ──

const unprotected = domainTables.filter((t) => pushKeepsTable(tablesFilter, t));
check(
  "push cannot see any of the ten domain tables",
  unprotected.length === 0,
  unprotected.join(","),
);

const unmanaged = barrelTables.filter((t) => !pushKeepsTable(tablesFilter, t));
check(
  "push still manages every barrel-owned table",
  unmanaged.length === 0,
  unmanaged.join(","),
);

check(
  "discovery_submissions stays managed by push",
  pushKeepsTable(tablesFilter, "discovery_submissions"),
);

check(
  "a future voice_* table is protected without a config change",
  !pushKeepsTable(tablesFilter, "voice_call_recordings"),
);
check(
  "a future scheduling_* table is protected without a config change",
  !pushKeepsTable(tablesFilter, "scheduling_reminders"),
);
check(
  "a future barrel-owned table is still managed",
  pushKeepsTable(tablesFilter, "crm_invoices"),
);

// Removing or weakening any single required exclusion must leave a domain
// table exposed — that is what makes this section a regression gate rather
// than a restatement of the config.
for (const pattern of REQUIRED_EXCLUSIONS) {
  const weakened = tablesFilter.filter((p) => p !== pattern);
  const exposed = domainTables.filter((t) => pushKeepsTable(weakened, t));
  check(
    `removing ${pattern} would expose a domain table`,
    exposed.length > 0,
    exposed.join(","),
  );
}

// ── the schema boundary that keeps Stripe out ──

check(
  "schemaFilter is pinned to public, so the stripe schema is never managed",
  schemaFilter.length === 1 && schemaFilter[0] === "public",
  JSON.stringify(schemaFilter),
);
check(
  "drizzle.config.ts still points push at the shared barrel",
  /schema: path\.join\(__dirname, "\.\/src\/schema\/index\.ts"\)/.test(baseConfigSource),
);
check(
  "drizzle.config.ts still refuses to load without DATABASE_URL",
  /if \(!process\.env\.DATABASE_URL\)/.test(baseConfigSource),
);
check(
  "only the base config carries a tablesFilter — the domain configs never push",
  configs
    .filter((c) => c !== "drizzle.config.ts")
    .every((c) => !/^\s*tablesFilter\s*:/m.test(readFileSync(join(here, c), "utf8"))),
);

// ── the canonical second run preserves the inventory ──

check(
  "migrate:fresh step 1 is push against the filtered base config",
  steps[0].args.join(" ") === "push --config ./drizzle.config.ts",
  steps[0].args.join(" "),
);
check(
  "no later migrate:fresh step runs push",
  steps.slice(1).every((s) => !s.args.includes("push")),
);
check(
  "the runner still stops at the first failing step",
  /No later step was run/.test(readFileSync(join(here, "src", "migrate-fresh.mjs"), "utf8")),
);

// ── the installed drizzle-kit still implements the filter we rely on ─────────

const drizzleKit = (() => {
  // drizzle-kit's "exports" map does not expose ./package.json, so resolve the
  // exported ./api entry point and read its siblings out of the same directory.
  const require_ = createRequire(import.meta.url);
  let dir: string;
  try {
    dir = dirname(require_.resolve("drizzle-kit/api"));
  } catch {
    return { version: "", bin: "" };
  }
  let version = "";
  let bin = "";
  try {
    version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version ?? "";
  } catch {
    /* leave empty — the assertion below reports it */
  }
  try {
    bin = readFileSync(join(dir, "bin.cjs"), "utf8");
  } catch {
    /* leave empty — the assertion below reports it */
  }
  return { version, bin };
})();

check("the installed drizzle-kit is readable", drizzleKit.bin.length > 0);
check(
  "the installed drizzle-kit is the audited 0.31.x line",
  /^0\.31\./.test(drizzleKit.version),
  drizzleKit.version,
);
check(
  "push still accepts tablesFilter and defaults schemaFilter to public",
  /tablesFilter: unionType\(\[stringType\(\), stringType\(\)\.array\(\)\]\)\.optional\(\)/.test(
    drizzleKit.bin,
  ) && /schemaFilter: unionType\(\[[\s\S]{0,80}?\.default\(\["public"\]\)/.test(drizzleKit.bin),
);
check(
  "push forwards tablesFilter into the database introspection",
  /pgPushIntrospect\d*\(db, tablesFilter, schemasFilter/.test(drizzleKit.bin),
);
check(
  "the filter is a minimatch matcher list that honours negation",
  /matchers = filters\.map\([\s\S]{0,80}new Minimatch\(it\)/.test(drizzleKit.bin) &&
    /if \(matcher\.negate\) \{[\s\S]{0,120}flags\.push\(false\)/.test(drizzleKit.bin),
);
check(
  "an unmatched table is dropped from the snapshot, not kept",
  /if \(flags\.length > 0\) \{[\s\S]{0,80}return flags\.every\(Boolean\);[\s\S]{0,40}\}[\s\S]{0,40}return false;/.test(
    drizzleKit.bin,
  ),
);
check(
  "an excluded table never enters the introspected snapshot at all",
  /const tableName = row\.table_name;[\s\S]{0,80}if \(!tablesFilter\(tableName\)\) return res\(""\)/.test(
    drizzleKit.bin,
  ),
);
check(
  "drizzle-kit itself uses the leading-! exclusion form",
  /return \["!geography_columns", "!geometry_columns", "!spatial_ref_sys"\]/.test(drizzleKit.bin),
);
check(
  "introspection is still scoped by schemaFilter, so stripe is unreachable",
  /const where = schemaFilters\.map\(\(\w+\) => `n\.nspname = '\$\{\w+\}'`\)/.test(drizzleKit.bin),
);

// ── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.error("Migration-order contract violated:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("All migrationOrderContract tests passed.");
