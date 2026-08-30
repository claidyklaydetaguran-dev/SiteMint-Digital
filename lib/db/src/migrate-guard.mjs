// AR-001Z Commit B — the preflight wrapper for every direct `migrate:*` run.
//
// Commit B points each domain at its own journal table. That removes the shared
// watermark, but it also means a database that applied migrations under the old
// shared journal now reads an EMPTY per-domain journal and concludes nothing was
// ever applied. Running `migrate:voice` there would replay 0000 onwards; the
// committed SQL has no `IF NOT EXISTS`, so it aborts on the first CREATE TABLE.
//
// This wrapper stands in front of drizzle-kit so that cannot happen by accident.
// It classifies the journal state first, refuses anything it does not recognise,
// and only then hands over — holding a session-scoped advisory lock (the same key
// baseline:journals takes) across the child process, so a baseline can never run
// underneath a migration or vice versa.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  ADVISORY_LOCK_KEY,
  BASELINE_DOMAINS,
  LEGACY_JOURNAL_SCHEMA,
  LEGACY_JOURNAL_TABLE,
  domainJournalTable,
  readExpectedMigrations,
} from "./baseline-journals.mjs";
import { resolveDrizzleKitBin } from "./migrate-fresh.mjs";

export const MIGRATE_DECISION = {
  ALLOW_EMPTY: "allow-empty-database",
  ALLOW_BASELINED: "allow-baselined",
  REFUSE_UNBASELINED: "refuse-legacy-unbaselined",
  REFUSE_MISMATCHED: "refuse-mismatched",
};

/**
 * Pure decision function, so every branch is unit-testable without a server.
 *
 * @param {object} input
 * @param {Array<{hash: string, created_at: string|number}>} input.legacyRows
 * @param {Map<string, Array<{hash: string, created_at: string|number}>|null>} input.domainRows
 *        null means the domain's journal table does not exist yet.
 * @param {Map<string, Array<{createdAt: number, hash: string, tag: string}>>} input.expectedByDomain
 */
export function classifyMigrateReadiness({ legacyRows, domainRows, expectedByDomain }) {
  const domains = [...expectedByDomain.keys()];
  const legacyByCreatedAt = new Map(legacyRows.map((r) => [Number(r.created_at), String(r.hash)]));

  const problems = [];
  const unbaselined = [];

  for (const domain of domains) {
    const expected = expectedByDomain.get(domain);
    const rows = domainRows.get(domain) ?? null;
    const actual = (rows ?? [])
      .map((r) => ({ createdAt: Number(r.created_at), hash: String(r.hash) }))
      .sort((a, b) => a.createdAt - b.createdAt);

    // Every recorded row must correspond to a committed migration, exactly.
    for (const row of actual) {
      const match = expected.find((e) => e.createdAt === row.createdAt);
      if (!match) {
        problems.push(`${domain}: journal records created_at ${row.createdAt}, which no committed migration claims`);
        continue;
      }
      if (match.hash !== row.hash) {
        problems.push(`${domain}: ${match.tag} records a different hash than the committed SQL`);
      }
    }

    // Applied migrations must form a prefix — a gap means something was skipped.
    const prefix = expected.slice(0, actual.length).map((e) => e.createdAt);
    const actualIds = actual.map((r) => r.createdAt);
    if (JSON.stringify(prefix) !== JSON.stringify(actualIds)) {
      problems.push(`${domain}: applied migrations are not a contiguous prefix of the committed folder`);
    }

    // Anything the legacy journal says was applied must also be in this journal.
    const legacyApplied = expected.filter((e) => legacyByCreatedAt.has(e.createdAt));
    const missingHere = legacyApplied.filter((e) => !actualIds.includes(e.createdAt));
    if (missingHere.length > 0) {
      unbaselined.push(`${domain}: ${missingHere.length} migration(s) recorded in the legacy journal are absent here`);
    }
  }

  if (problems.length > 0) {
    return { decision: MIGRATE_DECISION.REFUSE_MISMATCHED, problems };
  }
  if (unbaselined.length > 0) {
    return { decision: MIGRATE_DECISION.REFUSE_UNBASELINED, problems: unbaselined };
  }

  const nothingApplied =
    legacyRows.length === 0 && domains.every((d) => (domainRows.get(d) ?? []).length === 0);

  return {
    decision: nothingApplied ? MIGRATE_DECISION.ALLOW_EMPTY : MIGRATE_DECISION.ALLOW_BASELINED,
    problems: [],
  };
}

async function readState(client, domains) {
  const legacyIdentifier = `"${LEGACY_JOURNAL_SCHEMA}"."${LEGACY_JOURNAL_TABLE}"`;
  const legacyProbe = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [legacyIdentifier]);
  const legacyRows =
    legacyProbe.rows[0]?.present === true
      ? (await client.query(`SELECT hash, created_at FROM ${legacyIdentifier}`)).rows
      : [];

  const domainRows = new Map();
  for (const domain of domains) {
    const identifier = `"${LEGACY_JOURNAL_SCHEMA}"."${domainJournalTable(domain)}"`;
    const probe = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [identifier]);
    domainRows.set(
      domain,
      probe.rows[0]?.present === true
        ? (await client.query(`SELECT hash, created_at FROM ${identifier}`)).rows
        : null,
    );
  }
  return { legacyRows, domainRows };
}

function runDrizzleKit(domain) {
  return new Promise((resolve) => {
    const child = spawn(
      resolveDrizzleKitBin(),
      ["migrate", "--config", `./drizzle.${domain}.config.ts`],
      { stdio: "inherit", shell: process.platform === "win32" },
    );
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function main() {
  const domain = process.argv[2];
  if (!BASELINE_DOMAINS.includes(domain)) {
    console.error(`migrate guard — unknown domain "${domain}". Expected one of ${BASELINE_DOMAINS.join(", ")}.`);
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("migrate guard — DATABASE_URL is required");
    process.exit(1);
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let exitCode = 1;
  try {
    // Session-scoped: held across the drizzle-kit child, released in `finally`.
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);

    const expectedByDomain = new Map(BASELINE_DOMAINS.map((d) => [d, readExpectedMigrations(d)]));
    const { legacyRows, domainRows } = await readState(client, BASELINE_DOMAINS);
    const verdict = classifyMigrateReadiness({ legacyRows, domainRows, expectedByDomain });

    if (verdict.decision === MIGRATE_DECISION.REFUSE_UNBASELINED) {
      console.error("migrate guard — refused: this database still records its migrations in the");
      console.error(`legacy shared journal ("${LEGACY_JOURNAL_SCHEMA}"."${LEGACY_JOURNAL_TABLE}"),`);
      console.error("but the per-domain journals do not yet reflect it. Running a migration now");
      console.error("would replay already-applied SQL.");
      verdict.problems.forEach((p) => console.error(`  - ${p}`));
      console.error("\nRun this first:\n  pnpm --filter @workspace/db run baseline:journals");
      exitCode = 1;
      return;
    }
    if (verdict.decision === MIGRATE_DECISION.REFUSE_MISMATCHED) {
      console.error("migrate guard — refused: the migration journals do not match the committed folders.");
      verdict.problems.forEach((p) => console.error(`  - ${p}`));
      console.error("\nNothing was changed. Review the database before migrating.");
      exitCode = 1;
      return;
    }

    exitCode = await runDrizzleKit(domain);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    } catch {
      // connection already gone; the lock dies with the session either way
    }
    await client.end();
    process.exit(exitCode);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
