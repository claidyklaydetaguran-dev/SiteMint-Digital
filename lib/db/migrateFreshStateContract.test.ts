/**
 * AR-001O correction 5 — committed contract test for the state-aware
 * `migrate:fresh` runner.
 *
 * Run via: tsx lib/db/migrateFreshStateContract.test.ts
 * (registered in the aggregate chain in `scripts/package.json`)
 *
 * It lives beside `lib/db` rather than inside `lib/db/src` so that `tsc
 * --build` does not compile it into the package's emitted declarations — the
 * same arrangement `migrationOrderContract.test.ts` uses.
 *
 * What it protects. Correction 4 stopped `drizzle-kit push` *dropping* the ten
 * domain-migration-owned tables, but push still ran on every `migrate:fresh`.
 * On an initialised database that produced eight destructive `DROP SEQUENCE`
 * statements, PostgreSQL error `2BP01` on each, and exit 0 — because push
 * swallows the failure. Correction 5 makes push bootstrap-only: it runs to
 * create an empty database's base schema and never again.
 *
 * Every assertion here drives the real runner through its injected seams
 * (`inspect`, `runStep`, `log`, `logError`). Nothing in this file opens a
 * database connection, spawns drizzle-kit, or reads an environment variable
 * belonging to a real environment.
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

console.log("--- migrateFreshStateContract.test.ts ---");

const runner: any = await import("./src/migrate-fresh.mjs");

const {
  FRESH_DATABASE_MIGRATION_STEPS,
  BOOTSTRAP_STEP_SCRIPT,
  DATABASE_STATE,
  SKIP_PUSH_MESSAGE,
  classifyDatabaseState,
  runMigrateFresh,
  redactConnectionDetails,
  expectedBarrelTables,
  expectedDomainTables,
  expectedApplicationTables,
} = runner;

// ── A harness that records every effect the runner produces ──────────────────

interface Recorded {
  result: any;
  spawned: string[];
  spawnedArgs: string[][];
  out: string[];
  err: string[];
  all: string;
  inspectCalls: number;
}

/**
 * Drives the real runner with fully injected effects.
 *
 * `observations` is consumed one per `inspect()` call; the last one repeats, so
 * a bootstrap run's post-push re-inspection can be given its own reading or
 * simply reuse the first.
 */
async function drive(options: {
  observations: any[] | (() => any);
  stepResult?: (step: any) => any;
  inventory?: any;
  databaseUrl?: string;
}): Promise<Recorded> {
  const spawned: string[] = [];
  const spawnedArgs: string[][] = [];
  const out: string[] = [];
  const err: string[] = [];
  let inspectCalls = 0;

  const inspect = async () => {
    inspectCalls += 1;
    if (typeof options.observations === "function") return options.observations();
    const list = options.observations;
    const observation = list[Math.min(inspectCalls - 1, list.length - 1)];
    if (observation instanceof Error) throw observation;
    return observation;
  };

  const result = await runMigrateFresh({
    inspect,
    runStep: (step: any) => {
      spawned.push(step.script);
      spawnedArgs.push(step.args);
      return options.stepResult ? options.stepResult(step) : { status: 0 };
    },
    log: (m: string) => out.push(String(m)),
    logError: (m: string) => err.push(String(m)),
    inventory: options.inventory,
    databaseUrl: options.databaseUrl,
  });

  return { result, spawned, spawnedArgs, out, err, all: [...out, ...err].join("\n"), inspectCalls };
}

// The real, derived inventory — the same one the runner uses in production.
const BARREL = expectedBarrelTables() as string[];
const DOMAIN = expectedDomainTables() as string[];
const APPLICATION = expectedApplicationTables() as string[];

const CANONICAL_ORDER = ["push", "migrate:voice", "migrate:discovery", "migrate:scheduling"];
const DOMAIN_ORDER = ["migrate:voice", "migrate:discovery", "migrate:scheduling"];

const EMPTY_DATABASE = { journalExists: false, journalRowCount: 0, publicBaseTables: [] };
const INITIALIZED_DATABASE = {
  journalExists: true,
  journalRowCount: 4,
  publicBaseTables: [...APPLICATION],
};

// ── 0. The derived inventory is the one staging is expected to hold ──────────

check("the shared barrel derives 27 base tables", BARREL.length === 27, `${BARREL.length}`);
check("the committed migrations derive 18 domain tables", DOMAIN.length === 18, `${DOMAIN.length}`); // P4: +2 scheduling calendar tables
check(
  "the application owns exactly 45 public tables", // P4: +2 scheduling calendar tables
  APPLICATION.length === 45,
  `${APPLICATION.length}`,
);
check(
  "barrel and domain sets do not overlap",
  BARREL.every((t) => !DOMAIN.includes(t)),
  BARREL.filter((t) => DOMAIN.includes(t)).join(","),
);
check(
  "intake_firms is barrel-owned — every domain foreign key points at it",
  BARREL.includes("intake_firms"),
);
check(
  "discovery_submissions is barrel-owned, not domain-owned",
  BARREL.includes("discovery_submissions") && !DOMAIN.includes("discovery_submissions"),
);

// ── 1. Empty database → push runs exactly once, then the three domains ───────

{
  const run = await drive({ observations: [EMPTY_DATABASE, INITIALIZED_DATABASE] });

  check(
    "empty database classifies as fresh",
    run.result.state === DATABASE_STATE.FRESH,
    `${run.result.state} / ${run.result.reason}`,
  );
  check("a fresh bootstrap exits 0", run.result.exitCode === 0, `${run.result.exitCode}`);
  check(
    "a fresh bootstrap runs all four canonical steps in order",
    JSON.stringify(run.spawned) === JSON.stringify(CANONICAL_ORDER),
    run.spawned.join(" -> "),
  );
  check(
    "push runs exactly once on a fresh bootstrap",
    run.spawned.filter((s) => s === BOOTSTRAP_STEP_SCRIPT).length === 1,
    `${run.spawned.filter((s) => s === BOOTSTRAP_STEP_SCRIPT).length}`,
  );
  check(
    "push runs first, before any domain migration",
    run.spawned[0] === BOOTSTRAP_STEP_SCRIPT,
    run.spawned[0],
  );
  check(
    "push is invoked against the filtered base config",
    run.spawnedArgs[0].join(" ") === "push --config ./drizzle.config.ts",
    run.spawnedArgs[0].join(" "),
  );
  check("a fresh bootstrap skips nothing", run.result.skipped.length === 0, run.result.skipped.join(","));
  check(
    "a fresh bootstrap does not announce the skip message",
    !run.all.includes(SKIP_PUSH_MESSAGE),
  );
  check(
    "a fresh bootstrap re-reads the catalog to verify push actually built the base schema",
    run.inspectCalls === 2,
    `${run.inspectCalls}`,
  );
}

// A journal table that exists but holds no rows is still a fresh database.
{
  const run = await drive({
    observations: [
      { journalExists: true, journalRowCount: 0, publicBaseTables: [] },
      INITIALIZED_DATABASE,
    ],
  });
  check(
    "an existing but empty journal with no tables is still fresh",
    run.result.state === DATABASE_STATE.FRESH && run.spawned[0] === BOOTSTRAP_STEP_SCRIPT,
    `${run.result.state} / ${run.spawned.join(",")}`,
  );
}

// Exit code 0 alone is not proof the bootstrap worked.
{
  const run = await drive({
    observations: [EMPTY_DATABASE, EMPTY_DATABASE],
  });
  check(
    "a push that exits 0 but creates nothing fails the run",
    run.result.exitCode !== 0 && run.result.reason === "bootstrap-incomplete",
    `${run.result.exitCode} / ${run.result.reason}`,
  );
  check(
    "no domain migration runs after an unverified bootstrap",
    JSON.stringify(run.spawned) === JSON.stringify(["push"]),
    run.spawned.join(","),
  );
}

// ── 2. Initialized database → push is skipped ────────────────────────────────

{
  const run = await drive({ observations: [INITIALIZED_DATABASE] });

  check(
    "an initialized database classifies as initialized",
    run.result.state === DATABASE_STATE.INITIALIZED,
    `${run.result.state} / ${run.result.reason}`,
  );
  check("an initialized run exits 0", run.result.exitCode === 0, `${run.result.exitCode}`);
  check(
    "push is NOT spawned on an initialized database",
    !run.spawned.includes(BOOTSTRAP_STEP_SCRIPT),
    run.spawned.join(","),
  );
  check(
    "no drizzle-kit invocation carries the push subcommand",
    run.spawnedArgs.every((args) => !args.includes("push")),
    JSON.stringify(run.spawnedArgs),
  );
  check(
    "push is reported as skipped",
    JSON.stringify(run.result.skipped) === JSON.stringify(["push"]),
    run.result.skipped.join(","),
  );
  check(
    "the runner logs the required non-secret skip message",
    run.out.some((line) => line.includes(SKIP_PUSH_MESSAGE)),
    JSON.stringify(run.out.slice(0, 4)),
  );
  check(
    "the runner states the classification it made",
    run.out.some((line) => line.includes("Database state: initialized")),
  );
  check(
    "an initialized run inspects the catalog exactly once",
    run.inspectCalls === 1,
    `${run.inspectCalls}`,
  );
}

// ── 3. Initialized rerun → the ordered migrations run, as no-ops ─────────────

{
  const first = await drive({ observations: [INITIALIZED_DATABASE] });
  const second = await drive({ observations: [INITIALIZED_DATABASE] });

  check(
    "an initialized run executes exactly the three domain steps, chronologically",
    JSON.stringify(first.spawned) === JSON.stringify(DOMAIN_ORDER),
    first.spawned.join(" -> "),
  );
  check(
    "a repeated initialized run is byte-identical in the steps it takes",
    JSON.stringify(first.spawned) === JSON.stringify(second.spawned) &&
      JSON.stringify(first.spawnedArgs) === JSON.stringify(second.spawnedArgs),
    `${first.spawned.join(",")} vs ${second.spawned.join(",")}`,
  );
  check(
    "a repeated initialized run still never spawns push",
    !second.spawned.includes(BOOTSTRAP_STEP_SCRIPT),
    second.spawned.join(","),
  );
  check("a repeated initialized run exits 0", second.result.exitCode === 0);
  check(
    "each domain step is invoked with migrate, never push",
    second.spawnedArgs.every((args) => args[0] === "migrate"),
    JSON.stringify(second.spawnedArgs.map((a) => a[0])),
  );
  check(
    "the domain configs are the narrowly scoped per-domain ones",
    JSON.stringify(second.spawnedArgs) ===
      JSON.stringify([
        ["migrate", "--config", "./drizzle.voice.config.ts"],
        ["migrate", "--config", "./drizzle.discovery.config.ts"],
        ["migrate", "--config", "./drizzle.scheduling.config.ts"],
      ]),
    JSON.stringify(second.spawnedArgs),
  );
}

// ── 4. Journal absent + application tables present → fail closed ─────────────

{
  const run = await drive({
    observations: [
      { journalExists: false, journalRowCount: 0, publicBaseTables: [...APPLICATION] },
    ],
  });

  check(
    "journal absent while application tables stand is unsafe",
    run.result.state === DATABASE_STATE.UNSAFE,
    run.result.state,
  );
  check(
    "the unsafe reason names the empty-journal-with-tables case",
    run.result.reason === "journal-empty-but-tables-present",
    run.result.reason,
  );
  check("that state exits nonzero", run.result.exitCode !== 0, `${run.result.exitCode}`);
  check("no step runs at all", run.spawned.length === 0, run.spawned.join(","));
  check(
    "the refusal says nothing was changed",
    run.err.some((line) => line.includes("Nothing was changed")),
  );
}

// A single unrecognised table in public is enough — push would treat it as a
// deletion candidate.
{
  const run = await drive({
    observations: [{ journalExists: false, journalRowCount: 0, publicBaseTables: ["legacy_notes"] }],
  });
  check(
    "one unrecognised public table also fails closed",
    run.result.state === DATABASE_STATE.UNSAFE && run.spawned.length === 0,
    `${run.result.state} / ${run.spawned.join(",")}`,
  );
  check(
    "the refusal names the table it found",
    run.err.join("\n").includes("legacy_notes"),
  );
}

// PostGIS's own public tables are not application state and must not block a
// genuine bootstrap — drizzle-kit excludes exactly these three itself.
{
  const run = await drive({
    observations: [
      { journalExists: false, journalRowCount: 0, publicBaseTables: ["spatial_ref_sys"] },
      INITIALIZED_DATABASE,
    ],
  });
  check(
    "a PostGIS table does not make an empty database look initialized",
    run.result.state === DATABASE_STATE.FRESH,
    `${run.result.state} / ${run.result.reason}`,
  );
}

// ── 5. Journal present + a missing base-schema sentinel → fail closed ────────

{
  const run = await drive({
    observations: [
      {
        journalExists: true,
        journalRowCount: 4,
        publicBaseTables: APPLICATION.filter((t) => t !== "intake_firms"),
      },
    ],
  });

  check(
    "a populated journal with a missing barrel table is unsafe",
    run.result.state === DATABASE_STATE.UNSAFE,
    run.result.state,
  );
  check(
    "the unsafe reason names the missing-sentinel case",
    run.result.reason === "initialized-journal-missing-base-schema",
    run.result.reason,
  );
  check("that state exits nonzero", run.result.exitCode !== 0, `${run.result.exitCode}`);
  check("no step runs at all", run.spawned.length === 0, run.spawned.join(","));
  check(
    "the refusal names the missing sentinel",
    run.err.join("\n").includes("intake_firms"),
  );
  check(
    "the refusal states that migrate:fresh does not repair drift",
    run.err.join("\n").includes("does not repair"),
  );
}

// Every barrel table is a sentinel, not just a hand-picked few.
{
  let allFailClosed = true;
  const survivors: string[] = [];
  for (const sentinel of BARREL) {
    const state = classifyDatabaseState({
      journalExists: true,
      journalRowCount: 4,
      publicBaseTables: APPLICATION.filter((t) => t !== sentinel),
    });
    if (state.state !== DATABASE_STATE.UNSAFE) {
      allFailClosed = false;
      survivors.push(sentinel);
    }
  }
  check(
    "every one of the 27 barrel-owned tables is a required sentinel",
    allFailClosed,
    survivors.join(","),
  );
}

// A missing *domain* table is not a base-schema problem: the domain migrators
// own those, and the journal watermark decides whether they re-run.
{
  const state = classifyDatabaseState({
    journalExists: true,
    journalRowCount: 4,
    publicBaseTables: APPLICATION.filter((t) => t !== "voice_issues"),
  });
  check(
    "a missing domain table does not block the domain migrators",
    state.state === DATABASE_STATE.INITIALIZED,
    `${state.state} / ${state.reason}`,
  );
}

// ── 6. Database inspection failure → fail closed ─────────────────────────────

{
  const boom: any = new Error("connect ECONNREFUSED 10.1.2.3:5432");
  boom.code = "ECONNREFUSED";
  const run = await drive({ observations: [boom] });

  check(
    "an inspection failure is unsafe",
    run.result.state === DATABASE_STATE.UNSAFE,
    run.result.state,
  );
  check(
    "the unsafe reason names the inspection failure",
    run.result.reason === "inspection-failed",
    run.result.reason,
  );
  check("that state exits nonzero", run.result.exitCode !== 0, `${run.result.exitCode}`);
  check("no step runs at all", run.spawned.length === 0, run.spawned.join(","));
  check(
    "the real error is reported, not suppressed or relabelled",
    run.err.join("\n").includes("ECONNREFUSED"),
    run.err.join("\n").slice(0, 160),
  );
}

// A malformed observation must not be optimistically treated as fresh.
{
  const run = await drive({
    observations: () => {
      throw new Error("catalog unavailable");
    },
  });
  check(
    "a thrown inspection fails closed with nothing spawned",
    run.result.exitCode !== 0 && run.spawned.length === 0,
    `${run.result.exitCode} / ${run.spawned.join(",")}`,
  );
}

// ── 7. No database value ever appears in logs or errors ──────────────────────

const SECRET_URL = "postgresql://sm_stage_user:Sup3rSecretPassw0rd@db-staging-99.example.net:6544/sitemint_staging_db";
const SECRET_PARTS = [
  SECRET_URL,
  "sm_stage_user",
  "Sup3rSecretPassw0rd",
  "db-staging-99.example.net",
  "sitemint_staging_db",
  ":6544",
];

{
  const redacted = redactConnectionDetails(
    `connect ECONNREFUSED ${SECRET_URL} host db-staging-99.example.net:6544 db sitemint_staging_db user sm_stage_user password Sup3rSecretPassw0rd`,
    SECRET_URL,
  );
  const leaked = SECRET_PARTS.filter((part) => redacted.includes(part));
  check("the redactor removes every connection component", leaked.length === 0, leaked.join(","));
  check(
    "the redactor leaves the rest of the message intact",
    redacted.includes("connect ECONNREFUSED"),
    redacted,
  );
  check(
    "the redactor is a no-op without a database url",
    redactConnectionDetails("plain text", undefined) === "plain text",
  );
  check(
    "the redactor tolerates an unparseable url and still removes it",
    !redactConnectionDetails("failed for not-a-url-at-all", "not-a-url-at-all").includes(
      "not-a-url-at-all",
    ),
  );
  check(
    "a bare number that is not the port survives redaction",
    redactConnectionDetails("4 applied migration(s) recorded", SECRET_URL).includes(
      "4 applied migration(s)",
    ),
  );
}

// Drive every path that can print, with the secret URL live, and prove none of
// it reaches the output.
{
  const boom: any = new Error(`connection to ${SECRET_URL} failed: password authentication failed for user "sm_stage_user"`);
  boom.code = "28P01";

  const runs = [
    await drive({ observations: [INITIALIZED_DATABASE], databaseUrl: SECRET_URL }),
    await drive({ observations: [EMPTY_DATABASE, INITIALIZED_DATABASE], databaseUrl: SECRET_URL }),
    await drive({ observations: [boom], databaseUrl: SECRET_URL }),
    await drive({
      observations: [{ journalExists: false, journalRowCount: 0, publicBaseTables: [...APPLICATION] }],
      databaseUrl: SECRET_URL,
    }),
    await drive({
      observations: [
        { journalExists: true, journalRowCount: 4, publicBaseTables: APPLICATION.filter((t) => t !== "crm_leads") },
      ],
      databaseUrl: SECRET_URL,
    }),
    await drive({
      observations: [INITIALIZED_DATABASE],
      databaseUrl: SECRET_URL,
      stepResult: () => ({ status: 0, error: new Error(`spawn failed talking to ${SECRET_URL}`) }),
    }),
  ];

  const leaked = new Set<string>();
  for (const run of runs) {
    for (const part of SECRET_PARTS) {
      if (run.all.includes(part)) leaked.add(part);
    }
  }
  check(
    "no connection component appears in any runner output, on any path",
    leaked.size === 0,
    [...leaked].join(","),
  );
  check(
    "the authentication failure is still reported by its Postgres code",
    runs[2].err.join("\n").includes("28P01"),
    runs[2].err.join("\n").slice(0, 160),
  );
}

// The runner source itself must never print the variable.
{
  const source = readFileSync(join(here, "src", "migrate-fresh.mjs"), "utf8");
  // The refusal message names the variable on purpose; what must never appear
  // is its *value*, whether read directly or interpolated.
  check(
    "the runner never prints the DATABASE_URL value",
    !/console\.(log|error|warn)\([^)]*process\.env\.DATABASE_URL/.test(source) &&
      !/\$\{\s*databaseUrl\s*\}/.test(source) &&
      !/\$\{\s*deps\.databaseUrl\s*\}/.test(source),
  );
  check(
    "the runner reads DATABASE_URL exactly once, in main()",
    (source.match(/process\.env\.DATABASE_URL/g) ?? []).length === 1,
    `${(source.match(/process\.env\.DATABASE_URL/g) ?? []).length} reads`,
  );
  check(
    "the connection string is handed only to pg, never to a logger",
    /connectionString: databaseUrl/.test(source) &&
      !/log\([^)]*databaseUrl/.test(source) &&
      !/logError\([^)]*databaseUrl/.test(source),
  );
  check(
    "the runner still refuses to run without DATABASE_URL",
    source.includes("DATABASE_URL is not set"),
  );
  check(
    "the runner routes printed text through the redactor",
    /redactConnectionDetails\(String\(text\), deps\.databaseUrl\)/.test(source),
  );
}

// ── 8. The required command order remains fixed ──────────────────────────────

{
  const declared = (FRESH_DATABASE_MIGRATION_STEPS as any[]).map((s) => s.script);
  check(
    "the declared canonical order is unchanged",
    JSON.stringify(declared) === JSON.stringify(CANONICAL_ORDER),
    declared.join(" -> "),
  );
  check(
    "the bootstrap step is the first declared step",
    declared[0] === BOOTSTRAP_STEP_SCRIPT,
  );
  check(
    "discovery is declared before scheduling",
    declared.indexOf("migrate:discovery") < declared.indexOf("migrate:scheduling"),
  );

  // Order holds under both classifications, with only push's presence differing.
  const fresh = await drive({ observations: [EMPTY_DATABASE, INITIALIZED_DATABASE] });
  const initialized = await drive({ observations: [INITIALIZED_DATABASE] });
  check(
    "the initialized order is the fresh order minus push, nothing else",
    JSON.stringify(initialized.spawned) ===
      JSON.stringify(fresh.spawned.filter((s) => s !== BOOTSTRAP_STEP_SCRIPT)),
    `${initialized.spawned.join(",")} vs ${fresh.spawned.join(",")}`,
  );

  // A failing step stops the run and propagates a nonzero exit.
  const stopped = await drive({
    observations: [INITIALIZED_DATABASE],
    stepResult: (step: any) => (step.script === "migrate:voice" ? { status: 3 } : { status: 0 }),
  });
  check(
    "a failing step stops the run before the next one",
    JSON.stringify(stopped.spawned) === JSON.stringify(["migrate:voice"]),
    stopped.spawned.join(","),
  );
  check("a failing step propagates its exit code", stopped.result.exitCode === 3, `${stopped.result.exitCode}`);
  check(
    "a failing step says no later step was run",
    stopped.err.join("\n").includes("No later step was run"),
  );

  // A killed child reports status null; that must still be nonzero.
  const signalled = await drive({
    observations: [INITIALIZED_DATABASE],
    stepResult: () => ({ status: null, signal: "SIGKILL" }),
  });
  check(
    "a signalled step propagates a nonzero exit",
    signalled.result.exitCode !== 0,
    `${signalled.result.exitCode}`,
  );
  check(
    "a signalled step names the signal",
    signalled.err.join("\n").includes("SIGKILL"),
  );

  // A spawn that never started at all.
  const unspawnable = await drive({
    observations: [INITIALIZED_DATABASE],
    stepResult: () => ({ status: 0, error: new Error("ENOENT") }),
  });
  check(
    "a spawn error propagates a nonzero exit",
    unspawnable.result.exitCode !== 0,
    `${unspawnable.result.exitCode}`,
  );
}

// ── 9. The push-on-initialized regression gate has teeth ─────────────────────
//
// The assertions above pass only because the runner skips push. This section
// proves they would FAIL if it did not, by running the identical assertion
// against a simulated regression. Without this, "push was not spawned" could
// silently become vacuous.

{
  /** The exact gate applied in section 2, isolated so it can be re-run. */
  function pushWasNotInvoked(spawned: string[], spawnedArgs: string[][]): boolean {
    return (
      !spawned.includes(BOOTSTRAP_STEP_SCRIPT) && spawnedArgs.every((args) => !args.includes("push"))
    );
  }

  const real = await drive({ observations: [INITIALIZED_DATABASE] });
  check(
    "the gate passes for the corrected runner",
    pushWasNotInvoked(real.spawned, real.spawnedArgs),
    real.spawned.join(","),
  );

  // The pre-correction-5 behaviour: run every declared step unconditionally.
  const regressionSpawned: string[] = [];
  const regressionArgs: string[][] = [];
  for (const step of FRESH_DATABASE_MIGRATION_STEPS as any[]) {
    regressionSpawned.push(step.script);
    regressionArgs.push(step.args);
  }
  check(
    "the gate FAILS for a runner that still pushes on an initialized database",
    !pushWasNotInvoked(regressionSpawned, regressionArgs),
    regressionSpawned.join(","),
  );

  // And the classification itself — not just the step list — must refuse to
  // call an initialized database fresh.
  const state = classifyDatabaseState(INITIALIZED_DATABASE);
  check(
    "an initialized observation can never classify as fresh",
    state.state === DATABASE_STATE.INITIALIZED,
    `${state.state} / ${state.reason}`,
  );
  check(
    "only a fresh classification is allowed to bootstrap",
    classifyDatabaseState(EMPTY_DATABASE).state === DATABASE_STATE.FRESH &&
      classifyDatabaseState(INITIALIZED_DATABASE).state !== DATABASE_STATE.FRESH,
  );
}

// ── 10. The existing domain-table filter protections remain intact ──────────
//
// The full boundary proof lives in `migrationOrderContract.test.ts` section 11.
// This is the cross-check that correction 5 did not weaken it while making push
// conditional: when push *does* run, it still runs against the filtered config.

{
  const baseConfig = readFileSync(join(here, "drizzle.config.ts"), "utf8");
  const match = baseConfig.match(/tablesFilter:\s*\[([^\]]*)\]/);
  const tablesFilter = match ? [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]) : [];

  for (const pattern of [
    "!voice_*",
    "!provider_webhook_events",
    "!discovery_ai_briefs",
    "!discovery_delivery_jobs",
    "!scheduling_*",
  ]) {
    check(`correction 4's exclusion ${pattern} is still declared`, tablesFilter.includes(pattern));
  }
  check(
    "no discovery_* wildcard was introduced",
    !tablesFilter.includes("!discovery_*"),
  );

  const bootstrapStep = (FRESH_DATABASE_MIGRATION_STEPS as any[]).find(
    (s) => s.script === BOOTSTRAP_STEP_SCRIPT,
  );
  check(
    "the bootstrap step still targets the filtered base config",
    bootstrapStep.args.join(" ") === "push --config ./drizzle.config.ts",
    bootstrapStep.args.join(" "),
  );

  const bootstrap = await drive({ observations: [EMPTY_DATABASE, INITIALIZED_DATABASE] });
  check(
    "a bootstrap never invokes push with a domain config",
    bootstrap.spawnedArgs
      .filter((args) => args.includes("push"))
      .every((args) => args.join(" ") === "push --config ./drizzle.config.ts"),
    JSON.stringify(bootstrap.spawnedArgs.filter((a) => a.includes("push"))),
  );
  check(
    "no domain config is ever paired with the push subcommand",
    bootstrap.spawnedArgs.every(
      (args) => !(args.includes("push") && args.some((a) => /drizzle\.\w+\.config\.ts/.test(a))),
    ),
    JSON.stringify(bootstrap.spawnedArgs),
  );
}

// ── 11. Documentation states the bootstrap-only contract ─────────────────────

{
  const doc = readFileSync(join(here, "MIGRATIONS.md"), "utf8");
  check("MIGRATIONS.md says push is bootstrap-only", /bootstrap-only/i.test(doc));
  check(
    "MIGRATIONS.md says migrate:fresh is not a drift-repair command",
    /not a general schema-drift repair command/i.test(doc),
  );
  check(
    "MIGRATIONS.md says existing databases evolve through committed migrations",
    /evolve through committed migrations/i.test(doc),
  );
  check(
    "MIGRATIONS.md keeps tablesFilter as a defense-in-depth bootstrap boundary",
    /defense-in-depth/i.test(doc),
  );
  check(
    "MIGRATIONS.md no longer calls the DROP SEQUENCE errors expected output",
    !/as \*\*expected output\*\*/.test(doc),
  );
  check(
    "MIGRATIONS.md states DROP SEQUENCE must not appear on an initialized rerun",
    /DROP SEQUENCE/.test(doc) && /must disappear|no longer acceptable|not acceptable/i.test(doc),
  );
  check("MIGRATIONS.md documents the skip message", doc.includes(SKIP_PUSH_MESSAGE));
}

// ── Result ───────────────────────────────────────────────────────────────────

// ── AR-001Z: an un-baselined legacy database is unsafe ──────────────────────

const unbaselined = classifyDatabaseState(
  {
    journalExists: true,
    journalRowCount: 5,
    domainsReady: false,
    publicBaseTables: [...expectedBarrelTables(), ...expectedDomainTables()],
  },
  undefined,
);
check(
  "a legacy database whose per-domain journals are not baselined is unsafe",
  unbaselined.state === "unsafe" && unbaselined.reason === "legacy-journal-not-baselined",
  `${unbaselined.state}/${unbaselined.reason}`,
);
check(
  "the refusal names the baseline command",
  /baseline:journals/.test(unbaselined.detail),
);

const baselined = classifyDatabaseState(
  {
    journalExists: true,
    journalRowCount: 5,
    domainsReady: true,
    publicBaseTables: [...expectedBarrelTables(), ...expectedDomainTables()],
  },
  undefined,
);
check(
  "a baselined database is still initialized",
  baselined.state === "initialized",
  baselined.state,
);

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.error("migrate:fresh state contract violated:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("All migrateFreshStateContract tests passed.");
