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
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

// ── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.error("Migration-order contract violated:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("All migrationOrderContract tests passed.");
