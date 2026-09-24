// AR-001Z Commit A — baseline the shared Drizzle journal into per-domain journals.
//
// Why this exists. Every domain migration currently records into ONE table,
// `drizzle.__drizzle_migrations`, and drizzle-orm decides pending work from a
// single global watermark (`pg-core/dialect.cjs`: `select … order by created_at
// desc limit 1`, then `Number(lastDbMigration.created_at) < migration.folderMillis`).
// The hash is never compared. So one domain's newest migration can mask every
// older domain's, silently, with exit 0 — that is AR-001X's root cause.
//
// The fix (AR-001Z Commit B) gives each domain its own journal table. But a
// database that already applied migrations under the shared table would see an
// empty per-domain table, conclude nothing was applied, and replay every
// migration. None of the committed voice SQL uses `IF NOT EXISTS`, so a replay
// aborts on the first `CREATE TABLE` rather than corrupting anything — loud, but
// still a failed run.
//
// This command closes that gap ahead of the switch: it copies the already-applied
// (hash, created_at) pairs from the shared journal into the per-domain journals,
// so the first `migrate:*` after the switch resolves every entry as applied and
// executes zero statements.
//
// It never modifies or drops `drizzle.__drizzle_migrations`. That table remains
// the recovery point: reverting Commit B restores the previous behaviour exactly.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");

/** The domains that record into the shared journal. `push` records nothing. */
export const BASELINE_DOMAINS = ["voice", "discovery", "scheduling"];

export const LEGACY_JOURNAL_SCHEMA = "drizzle";
export const LEGACY_JOURNAL_TABLE = "__drizzle_migrations";

/**
 * One lock key shared by baseline and every guarded `migrate:*` run, so the two
 * can never interleave. Transaction-scoped here; session-scoped in the migrate
 * wrapper, which holds it across the drizzle-kit child process.
 */
export const ADVISORY_LOCK_KEY = 6100119;

/** Per-domain journal table name. Kept in `drizzle`, beside the legacy table. */
export function domainJournalTable(domain) {
  return `${LEGACY_JOURNAL_TABLE}_${domain}`;
}

/**
 * The exact DDL drizzle-orm itself issues (`pg-core/dialect.cjs`
 * `migrationTableCreate`). Reproduced verbatim so a table created here is
 * indistinguishable from one drizzle would have created.
 */
export function journalTableDdl(schema, table) {
  return (
    `CREATE TABLE IF NOT EXISTS "${schema}"."${table}" (\n` +
    `\tid SERIAL PRIMARY KEY,\n` +
    `\thash text NOT NULL,\n` +
    `\tcreated_at bigint\n` +
    `)`
  );
}

/**
 * Derive the expected (hash, created_at) pairs from the committed migration
 * folder — not from the database, and not from row counts. `hash` is sha256 of
 * the raw .sql file text, which is precisely what `readMigrationFiles` computes.
 */
export function readExpectedMigrations(domain) {
  const folder = join(packageRoot, "drizzle", domain);
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8"));
  return (journal.entries ?? [])
    .map((entry) => {
      const sql = readFileSync(join(folder, `${entry.tag}.sql`)).toString();
      return {
        domain,
        tag: entry.tag,
        createdAt: Number(entry.when),
        hash: createHash("sha256").update(sql).digest("hex"),
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Every committed migration across every domain, ascending by created_at. */
export function readAllExpectedMigrations(domains = BASELINE_DOMAINS) {
  return domains.flatMap((domain) => readExpectedMigrations(domain)).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Verify the legacy journal holds exactly the expected set — every entry, no
 * extras, no duplicates, and the right hash for each timestamp. Pure, so the
 * failure modes are unit-testable without a database.
 *
 * @returns {{ok: boolean, problems: Array<{kind: string, detail: string}>}}
 */
export function verifyLegacyJournal(legacyRows, expected) {
  const problems = [];

  const byCreatedAt = new Map();
  for (const row of legacyRows) {
    const createdAt = Number(row.created_at);
    if (byCreatedAt.has(createdAt)) {
      problems.push({
        kind: "duplicate",
        detail: `created_at ${createdAt} appears more than once in the legacy journal`,
      });
      continue;
    }
    byCreatedAt.set(createdAt, String(row.hash));
  }

  const expectedByCreatedAt = new Map(expected.map((e) => [e.createdAt, e]));

  for (const entry of expected) {
    if (!byCreatedAt.has(entry.createdAt)) {
      problems.push({
        kind: "missing",
        detail: `${entry.domain}/${entry.tag} (created_at ${entry.createdAt}) is not recorded in the legacy journal`,
      });
      continue;
    }
    if (byCreatedAt.get(entry.createdAt) !== entry.hash) {
      problems.push({
        kind: "hash-mismatch",
        detail: `${entry.domain}/${entry.tag} (created_at ${entry.createdAt}) records a different hash than the committed SQL`,
      });
    }
  }

  for (const createdAt of byCreatedAt.keys()) {
    if (!expectedByCreatedAt.has(createdAt)) {
      problems.push({
        kind: "unknown",
        detail: `the legacy journal records created_at ${createdAt}, which no committed migration claims`,
      });
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * A destination journal is only ever one of three things. Anything else — a
 * prefix, a superset, a wrong hash — is a refusal, because baseline must not
 * guess what a half-populated journal meant.
 */
export function classifyDestination(existingRows, expected) {
  if (existingRows.length === 0) return { state: "empty" };

  const actual = existingRows
    .map((row) => ({ createdAt: Number(row.created_at), hash: String(row.hash) }))
    .sort((a, b) => a.createdAt - b.createdAt);

  const sameLength = actual.length === expected.length;
  const sameEntries =
    sameLength &&
    actual.every((row, i) => row.createdAt === expected[i].createdAt && row.hash === expected[i].hash);

  if (sameEntries) return { state: "complete" };

  return {
    state: "mismatched",
    detail: `holds ${actual.length} row(s); the committed folder describes ${expected.length}`,
  };
}

/**
 * Baseline every domain journal in ONE transaction, under an advisory lock.
 * Either every destination ends up exactly matching its committed folder, or
 * nothing is written at all.
 */
export async function baselineJournals({ databaseUrl, domains = BASELINE_DOMAINS, logger = console }) {
  if (!databaseUrl) throw new Error("baselineJournals requires a databaseUrl");

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const summary = { locked: false, created: [], inserted: {}, alreadyComplete: [], verified: {} };

  try {
    await client.query("BEGIN");

    // Transaction-scoped: released by COMMIT or ROLLBACK, never leaked.
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
    summary.locked = true;

    const legacyIdentifier = `"${LEGACY_JOURNAL_SCHEMA}"."${LEGACY_JOURNAL_TABLE}"`;
    const legacyProbe = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [
      legacyIdentifier,
    ]);
    const legacyExists = legacyProbe.rows[0]?.present === true;

    const expectedByDomain = new Map(domains.map((d) => [d, readExpectedMigrations(d)]));
    const expectedAll = [...expectedByDomain.values()].flat().sort((a, b) => a.createdAt - b.createdAt);

    const legacyRows = legacyExists
      ? (await client.query(`SELECT id, hash, created_at FROM ${legacyIdentifier} ORDER BY created_at`)).rows
      : [];

    // An empty database needs no baseline — it simply migrates. Say so plainly
    // rather than creating empty journals that hide the distinction.
    if (legacyRows.length === 0) {
      const destinations = await readDestinations(client, domains);
      const allComplete = domains.every(
        (d) => classifyDestination(destinations.get(d) ?? [], expectedByDomain.get(d)).state === "complete",
      );
      if (allComplete) {
        await client.query("COMMIT");
        summary.alreadyComplete = [...domains];
        logger.log("baseline:journals — already baselined; nothing to do");
        return { ok: true, changed: false, reason: "already-baselined", summary };
      }
      await client.query("ROLLBACK");
      throw new Error(
        "the legacy shared journal records no applied migration. There is nothing to " +
          "baseline from: an empty database should simply run its migrations.",
      );
    }

    const verdict = verifyLegacyJournal(legacyRows, expectedAll);
    if (!verdict.ok) {
      await client.query("ROLLBACK");
      const lines = verdict.problems.map((p) => `  - [${p.kind}] ${p.detail}`).join("\n");
      throw new Error(`the legacy shared journal does not match the committed migrations:\n${lines}`);
    }

    await client.query(`CREATE SCHEMA IF NOT EXISTS "${LEGACY_JOURNAL_SCHEMA}"`);
    for (const domain of domains) {
      const table = domainJournalTable(domain);
      await client.query(journalTableDdl(LEGACY_JOURNAL_SCHEMA, table));
      summary.created.push(table);
    }

    for (const domain of domains) {
      const expected = expectedByDomain.get(domain);
      const table = domainJournalTable(domain);
      const identifier = `"${LEGACY_JOURNAL_SCHEMA}"."${table}"`;
      const existing = (
        await client.query(`SELECT id, hash, created_at FROM ${identifier} ORDER BY created_at`)
      ).rows;

      const classification = classifyDestination(existing, expected);

      if (classification.state === "complete") {
        summary.alreadyComplete.push(domain);
        continue;
      }
      if (classification.state === "mismatched") {
        await client.query("ROLLBACK");
        throw new Error(
          `${identifier} is partially populated or does not match the committed folder ` +
            `(${classification.detail}). Baseline refuses to reconcile it; review the database.`,
        );
      }

      // Insert (hash, created_at) only. `id` comes from the table's own SERIAL
      // default, so the sequence stays correct for the next real migration —
      // copying legacy ids would leave the sequence at 1 and collide later.
      for (const entry of expected) {
        await client.query(`INSERT INTO ${identifier} ("hash", "created_at") VALUES ($1, $2)`, [
          entry.hash,
          entry.createdAt,
        ]);
      }
      summary.inserted[domain] = expected.length;
    }

    // Verify what was actually written, inside the same transaction.
    for (const domain of domains) {
      const expected = expectedByDomain.get(domain);
      const identifier = `"${LEGACY_JOURNAL_SCHEMA}"."${domainJournalTable(domain)}"`;
      const rows = (await client.query(`SELECT hash, created_at FROM ${identifier} ORDER BY created_at`)).rows;
      const actual = rows.map((r) => ({ createdAt: Number(r.created_at), hash: String(r.hash) }));

      const equal =
        actual.length === expected.length &&
        actual.every((r, i) => r.createdAt === expected[i].createdAt && r.hash === expected[i].hash);

      if (!equal) {
        await client.query("ROLLBACK");
        throw new Error(`post-insert verification failed for ${identifier}; nothing was committed`);
      }
      summary.verified[domain] = actual.length;
    }

    await client.query("COMMIT");
    const changed = Object.keys(summary.inserted).length > 0;
    logger.log(
      `baseline:journals — ${changed ? "baselined" : "verified"} ` +
        domains.map((d) => `${d}=${summary.verified[d]}`).join(" "),
    );
    return { ok: true, changed, reason: changed ? "baselined" : "already-baselined", summary };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // already rolled back
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function readDestinations(client, domains) {
  const out = new Map();
  for (const domain of domains) {
    const identifier = `"${LEGACY_JOURNAL_SCHEMA}"."${domainJournalTable(domain)}"`;
    const probe = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [identifier]);
    if (probe.rows[0]?.present !== true) {
      out.set(domain, []);
      continue;
    }
    out.set(domain, (await client.query(`SELECT id, hash, created_at FROM ${identifier}`)).rows);
  }
  return out;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("baseline:journals — DATABASE_URL is required");
    process.exit(1);
  }
  try {
    const result = await baselineJournals({ databaseUrl });
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(`baseline:journals — refused: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
