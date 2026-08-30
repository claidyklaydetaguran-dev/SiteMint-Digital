// AR-001O — the canonical fresh-database initialisation, in the one order that
// actually works, with base `push` reduced to a bootstrap-only step.
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
// AR-001O correction 5 — why `push` is bootstrap-only.
//
// `drizzle-kit push` is a whole-schema reconciler, not a bootstrap tool. On an
// already-initialised database it re-diffs the live schema against the shared
// barrel every time. Correction 4's `tablesFilter` stops it dropping the ten
// domain-migration-owned tables, but it cannot stop push emitting statements at
// all: an excluded table's serial-owned `<table>_id_seq` still reaches the
// snapshot with nothing in the barrel to match it, so push appends eight
// `DROP SEQUENCE` statements, PostgreSQL rejects every one with `2BP01`
// (`cannot drop sequence … because other objects depend on it`), and push
// still exits 0 because it swallows the failure. A destructive statement that
// only fails by luck, reported through an exit code that cannot see it, is not
// acceptable steady-state output.
//
// The fix is to stop running push once the database is initialised. push is now
// executed only to bootstrap an empty database; an initialised database evolves
// exclusively through committed versioned migrations, which are ordered,
// reviewable and journalled. `migrate:fresh` is therefore NOT a schema-drift
// repair command — it never was, and correction 5 stops it pretending to be.
//
// Classification is done by querying the database catalog directly through the
// already-installed `pg` dependency. It never parses drizzle-kit's
// human-formatted output, never infers state from an exit code, and fails
// closed — before any mutation — on anything it cannot classify confidently.
//
// This file targets a database only when it is executed directly. Importing it
// — which the contract tests do — runs nothing, opens no connection, and reads
// no file.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

/**
 * The canonical order. `push` bootstraps the shared-barrel tables every domain
 * migration's foreign keys point at, so it must come first; the three domain
 * steps then ascend by journal timestamp.
 *
 * This list is the declared contract and never changes shape. Whether step 1
 * is *executed* depends on the classified database state — see
 * `classifyDatabaseState`.
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

/** The one step that is conditional. Everything else always runs. */
export const BOOTSTRAP_STEP_SCRIPT = "push";

export const SHARED_JOURNAL_SCHEMA = "drizzle";
export const SHARED_JOURNAL_TABLE = "__drizzle_migrations";

/** The three classifications. `unsafe` always means "change nothing". */
export const DATABASE_STATE = {
  FRESH: "fresh",
  INITIALIZED: "initialized",
  UNSAFE: "unsafe",
};

export const SKIP_PUSH_MESSAGE = "Base schema already initialized; skipping drizzle-kit push";

/**
 * PostGIS installs these into `public` and drizzle-kit excludes them from its
 * own introspection by exactly this list. A database that carries them is not
 * "partially initialised", so they never count as application tables.
 */
export const NON_APPLICATION_PUBLIC_TABLES = [
  "geography_columns",
  "geometry_columns",
  "spatial_ref_sys",
];

// ── Expected inventory, derived — never hand-typed ───────────────────────────

/**
 * Barrel-owned tables: every `pgTable("…")` reachable from the shared barrel.
 * These are the tables `push` manages, and their presence is the sentinel that
 * proves a database has a base schema.
 */
export function expectedBarrelTables() {
  const barrelPath = join(here, "schema", "index.ts");
  const barrel = readFileSync(barrelPath, "utf8");
  const modules = [...barrel.matchAll(/export \* from "\.\/([^"]+)"/g)].map((m) => m[1]);
  const tables = new Set();
  for (const mod of modules) {
    const source = readFileSync(join(here, "schema", `${mod}.ts`), "utf8");
    for (const match of source.matchAll(/pgTable\(\s*"([^"]+)"/g)) tables.add(match[1]);
  }
  return [...tables].sort();
}

/**
 * Domain-migration-owned tables: every `CREATE TABLE` in the committed
 * migrations of the three domains the canonical order names. Derived from
 * `FRESH_DATABASE_MIGRATION_STEPS` so a new domain step cannot be forgotten
 * here.
 */
export function expectedDomainTables() {
  const domains = FRESH_DATABASE_MIGRATION_STEPS.filter(
    (step) => step.script !== BOOTSTRAP_STEP_SCRIPT,
  ).map((step) => step.script.replace(/^migrate:/, ""));

  const tables = new Set();
  for (const domain of domains) {
    const journal = JSON.parse(
      readFileSync(join(packageRoot, "drizzle", domain, "meta", "_journal.json"), "utf8"),
    );
    for (const entry of journal.entries ?? []) {
      const sql = readFileSync(join(packageRoot, "drizzle", domain, `${entry.tag}.sql`), "utf8");
      for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/g)) {
        tables.add(match[1]);
      }
    }
  }
  return [...tables].sort();
}

/** Every table this application owns in `public` — barrel plus domain. */
export function expectedApplicationTables() {
  return [...new Set([...expectedBarrelTables(), ...expectedDomainTables()])].sort();
}

// ── Secret redaction ─────────────────────────────────────────────────────────

/**
 * `pg` puts connection components straight into its error messages
 * (`connect ECONNREFUSED <host>:<port>`, `database "<name>" does not exist`).
 * Every string this runner prints goes through here first, so a real error is
 * still reported faithfully — only the connection components inside it are
 * replaced. Nothing is suppressed and nothing is relabelled.
 *
 * Longest replacements run first so a host is not partially rewritten by its
 * own substring, and the bare port is only redacted in `:port` form so an
 * unrelated number in the message survives.
 */
export function redactConnectionDetails(text, databaseUrl) {
  if (typeof text !== "string" || text.length === 0) return text;
  if (!databaseUrl) return text;

  const secrets = new Set([databaseUrl]);
  let port = "";
  try {
    const url = new URL(databaseUrl);
    port = url.port;
    for (const candidate of [
      url.host,
      url.hostname,
      url.username,
      url.password,
      decodeURIComponent(url.username || ""),
      decodeURIComponent(url.password || ""),
      url.pathname.replace(/^\//, ""),
      `${url.username}:${url.password}`,
    ]) {
      if (candidate && candidate.length >= 3) secrets.add(candidate);
    }
  } catch {
    /* an unparseable URL is still redacted whole, above */
  }

  let redacted = text;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join("[redacted]");
  }
  if (port) redacted = redacted.split(`:${port}`).join(":[redacted]");
  return redacted;
}

// ── Classification ───────────────────────────────────────────────────────────

/**
 * The whole state model, as a pure function of one catalog observation. No I/O,
 * no drizzle-kit output, no exit codes.
 *
 * @param {object} observation
 * @param {boolean} observation.journalExists   `drizzle.__drizzle_migrations` is a real relation
 * @param {number}  observation.journalRowCount committed migration rows in it
 * @param {string[]} observation.publicBaseTables every base table in `public`
 * @param {object} [inventory] injectable expected inventory, for tests
 * @returns {{state: string, reason: string, detail: string}}
 */
export function classifyDatabaseState(observation, inventory) {
  const barrelTables = inventory?.barrelTables ?? expectedBarrelTables();
  const applicationTables = inventory?.applicationTables ?? expectedApplicationTables();

  const present = new Set(observation.publicBaseTables ?? []);
  const exempt = new Set(NON_APPLICATION_PUBLIC_TABLES);

  const presentApplicationTables = applicationTables.filter((t) => present.has(t));
  const unrecognisedPublicTables = [...present].filter(
    (t) => !applicationTables.includes(t) && !exempt.has(t),
  );
  const missingBarrelTables = barrelTables.filter((t) => !present.has(t));

  const journalPopulated = observation.journalExists === true && observation.journalRowCount > 0;

  if (!journalPopulated) {
    // A truly fresh database: nothing recorded, nothing standing. `push` is
    // allowed to create the base schema from scratch.
    if (presentApplicationTables.length === 0 && unrecognisedPublicTables.length === 0) {
      return {
        state: DATABASE_STATE.FRESH,
        reason: "empty-database",
        detail: observation.journalExists
          ? "shared journal present but empty, and no table stands in public"
          : "no shared journal and no table stands in public",
      };
    }
    // Anything already standing while the journal says nothing was applied is
    // ambiguous. push would treat every unexported table as a deletion
    // candidate, so bootstrapping here can destroy schema. Refuse.
    const standing = [...presentApplicationTables, ...unrecognisedPublicTables].sort();
    return {
      state: DATABASE_STATE.UNSAFE,
      reason: "journal-empty-but-tables-present",
      detail:
        `the shared journal records no applied migration, but ${standing.length} table(s) ` +
        `already stand in public (${standing.slice(0, 12).join(", ")}` +
        `${standing.length > 12 ? ", …" : ""}). This looks like a partially initialised or ` +
        "hand-built database. Bootstrapping it would let push treat unexported tables as " +
        "deletion candidates.",
    };
  }

  // The journal holds committed rows. The base schema must be there in full.
  if (missingBarrelTables.length > 0) {
    return {
      state: DATABASE_STATE.UNSAFE,
      reason: "initialized-journal-missing-base-schema",
      detail:
        `the shared journal records ${observation.journalRowCount} applied migration(s), but ` +
        `${missingBarrelTables.length} barrel-owned base table(s) are missing ` +
        `(${missingBarrelTables.slice(0, 12).join(", ")}` +
        `${missingBarrelTables.length > 12 ? ", …" : ""}). This is schema drift, and ` +
        "migrate:fresh does not repair it. Review the database, then apply the intended " +
        "change deliberately.",
    };
  }

  // AR-001Z. Commit B gives each domain its own journal. A database still
  // recorded only in the legacy shared journal must be baselined first, or the
  // first migration would read an empty per-domain journal and replay applied
  // SQL. `domainsReady` defaults to true so pre-existing observations, and the
  // unit tests built on them, keep their meaning.
  if (observation.domainsReady === false) {
    return {
      state: DATABASE_STATE.UNSAFE,
      reason: "legacy-journal-not-baselined",
      detail:
        "this database records applied migrations in the legacy shared journal, but the " +
        "per-domain journals do not yet reflect it. Run `pnpm --filter @workspace/db run " +
        "baseline:journals` first — migrating now would replay already-applied SQL.",
    };
  }

  return {
    state: DATABASE_STATE.INITIALIZED,
    reason: "journal-and-base-schema-present",
    detail:
      `${observation.journalRowCount} applied migration(s) recorded and all ` +
      `${barrelTables.length} barrel-owned base tables present`,
  };
}

// ── Live inspection ──────────────────────────────────────────────────────────

/**
 * Reads the two catalog facts classification needs. Opens one short-lived
 * connection with the already-installed `pg` dependency and closes it before
 * any migration step runs, so nothing holds the database open across a
 * migration. `pg` is imported dynamically so that merely importing this module
 * loads no driver and touches no network.
 */
export async function inspectDatabase(databaseUrl) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const journalIdentifier = `"${SHARED_JOURNAL_SCHEMA}"."${SHARED_JOURNAL_TABLE}"`;
    const journalProbe = await client.query(
      "SELECT to_regclass($1) IS NOT NULL AS present",
      [journalIdentifier],
    );
    const journalExists = journalProbe.rows[0]?.present === true;

    let journalRowCount = 0;
    if (journalExists) {
      const countProbe = await client.query(
        `SELECT count(*)::int AS rows FROM ${journalIdentifier}`,
      );
      journalRowCount = countProbe.rows[0]?.rows ?? 0;
    }

    const tableProbe = await client.query(
      `SELECT c.relname AS name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        ORDER BY c.relname`,
    );

    // AR-001Z. Are the per-domain journals in step with the legacy one?
    let domainsReady = true;
    if (journalExists && journalRowCount > 0) {
      const { BASELINE_DOMAINS, domainJournalTable, readExpectedMigrations } = await import(
        "./baseline-journals.mjs"
      );
      const legacy = await client.query(`SELECT hash, created_at FROM ${journalIdentifier}`);
      const legacyAt = new Set(legacy.rows.map((r) => Number(r.created_at)));
      for (const domain of BASELINE_DOMAINS) {
        const identifier = `"${SHARED_JOURNAL_SCHEMA}"."${domainJournalTable(domain)}"`;
        const probe = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [identifier]);
        const rows =
          probe.rows[0]?.present === true
            ? (await client.query(`SELECT created_at FROM ${identifier}`)).rows
            : [];
        const here = new Set(rows.map((r) => Number(r.created_at)));
        const owed = readExpectedMigrations(domain).filter((entry) => legacyAt.has(entry.createdAt));
        if (owed.some((entry) => !here.has(entry.createdAt))) domainsReady = false;
      }
    }

    return {
      journalExists,
      journalRowCount,
      domainsReady,
      publicBaseTables: tableProbe.rows.map((row) => row.name),
    };
  } finally {
    await client.end();
  }
}

// ── The runner ───────────────────────────────────────────────────────────────

// drizzle-kit's "exports" map does not expose ./package.json, so it cannot be
// resolved through `require.resolve`. The package manager's own bin shim for
// this package's declared devDependency is the stable handle.
export function resolveDrizzleKitBin() {
  const shim = resolve(packageRoot, "node_modules", ".bin", "drizzle-kit");
  if (!existsSync(shim)) {
    throw new Error(
      "Unable to locate the drizzle-kit executable for @workspace/db. " +
        "Run `pnpm install --frozen-lockfile` at the repository root first.",
    );
  }
  return shim;
}

function spawnDrizzleKitStep(step) {
  const result = spawnSync(resolveDrizzleKitBin(), step.args, {
    cwd: packageRoot,
    stdio: "inherit",
  });
  return { status: result.status, signal: result.signal, error: result.error };
}

/**
 * The orchestration, with every effect injected so it is testable without a
 * database and without spawning anything.
 *
 * @param {object} deps
 * @param {() => Promise<object>} deps.inspect  returns a catalog observation
 * @param {(step: object) => object} deps.runStep spawns one drizzle-kit step
 * @param {(message: string) => void} [deps.log]
 * @param {(message: string) => void} [deps.logError]
 * @param {string} [deps.databaseUrl] redaction source only; never logged
 * @param {object} [deps.inventory] injectable expected inventory, for tests
 * @returns {Promise<{exitCode: number, state: string, reason: string, executed: string[], skipped: string[]}>}
 */
export async function runMigrateFresh(deps) {
  const log = deps.log ?? ((message) => console.log(message));
  const logError = deps.logError ?? ((message) => console.error(message));
  const redact = (text) => redactConnectionDetails(String(text), deps.databaseUrl);
  const executed = [];
  const skipped = [];

  const fail = (reason, detail) => {
    logError(`\nmigrate:fresh refused to run: ${redact(detail)}`);
    logError("Nothing was changed. No migration step ran.");
    return { exitCode: 1, state: DATABASE_STATE.UNSAFE, reason, executed, skipped };
  };

  // ── classify, before anything is mutated ──
  let observation;
  try {
    observation = await deps.inspect();
  } catch (error) {
    const code = error?.code ? ` (code ${error.code})` : "";
    return fail(
      "inspection-failed",
      `the connected database could not be inspected${code}: ${error?.message ?? error}`,
    );
  }

  let classification;
  try {
    classification = classifyDatabaseState(observation, deps.inventory);
  } catch (error) {
    return fail(
      "classification-failed",
      `the connected database could not be classified: ${error?.message ?? error}`,
    );
  }

  if (classification.state === DATABASE_STATE.UNSAFE) {
    return fail(classification.reason, classification.detail);
  }

  log(`Database state: ${classification.state} — ${classification.detail}`);

  // ── choose the steps ──
  const bootstrapping = classification.state === DATABASE_STATE.FRESH;
  const steps = FRESH_DATABASE_MIGRATION_STEPS.filter((step) => {
    if (step.script !== BOOTSTRAP_STEP_SCRIPT) return true;
    if (bootstrapping) return true;
    skipped.push(step.script);
    return false;
  });

  if (!bootstrapping) log(SKIP_PUSH_MESSAGE);

  log(
    `Applying ${steps.length} step(s) in the required order:\n` +
      steps.map((s, i) => `  ${i + 1}. ${s.script}`).join("\n"),
  );

  // ── run them ──
  for (const step of steps) {
    log(`\n=== ${step.script} — ${step.description} ===`);
    const result = deps.runStep(step);
    executed.push(step.script);

    if (result?.error) {
      logError(`\nmigrate:fresh stopped at ${step.script}: ${redact(result.error.message)}`);
      logError("No later step was run.");
      return { exitCode: 1, state: classification.state, reason: "step-spawn-failed", executed, skipped };
    }
    if (result?.status !== 0) {
      const how = result?.signal ? `signal ${result.signal}` : `exit ${result?.status}`;
      logError(`\nmigrate:fresh stopped at ${step.script} (${how}). No later step was run.`);
      return {
        exitCode: typeof result?.status === "number" && result.status !== 0 ? result.status : 1,
        state: classification.state,
        reason: "step-failed",
        executed,
        skipped,
      };
    }

    // A bootstrap that reports success but created nothing must not be trusted
    // on its exit code alone. Re-read the catalog before any domain migration
    // depends on the base schema being there.
    if (bootstrapping && step.script === BOOTSTRAP_STEP_SCRIPT) {
      let afterBootstrap;
      try {
        afterBootstrap = await deps.inspect();
      } catch (error) {
        const code = error?.code ? ` (code ${error.code})` : "";
        logError(
          `\nmigrate:fresh stopped after ${step.script}: the database could not be ` +
            `re-inspected${code}: ${redact(error?.message ?? String(error))}`,
        );
        logError("No later step was run.");
        return { exitCode: 1, state: classification.state, reason: "bootstrap-verification-failed", executed, skipped };
      }

      const barrelTables = deps.inventory?.barrelTables ?? expectedBarrelTables();
      const present = new Set(afterBootstrap.publicBaseTables ?? []);
      const stillMissing = barrelTables.filter((t) => !present.has(t));
      if (stillMissing.length > 0) {
        logError(
          `\nmigrate:fresh stopped after ${step.script}: it reported success but ` +
            `${stillMissing.length} barrel-owned base table(s) are still missing ` +
            `(${stillMissing.slice(0, 12).join(", ")}${stillMissing.length > 12 ? ", …" : ""}).`,
        );
        logError("No later step was run.");
        return { exitCode: 1, state: classification.state, reason: "bootstrap-incomplete", executed, skipped };
      }
    }
  }

  log(
    "\nmigrate:fresh completed. Verify the shared journal holds one row per " +
      "committed migration before trusting the schema.",
  );
  return { exitCode: 0, state: classification.state, reason: classification.reason, executed, skipped };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "DATABASE_URL is not set. Refusing to run migrations against an unidentified database.",
    );
    process.exit(1);
  }

  const result = await runMigrateFresh({
    inspect: () => inspectDatabase(databaseUrl),
    runStep: spawnDrizzleKitStep,
    databaseUrl,
  });

  process.exit(result.exitCode);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
