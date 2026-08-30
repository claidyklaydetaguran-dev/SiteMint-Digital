// AR-001Z — live-database proofs for the per-domain journal transition.
//
// These need a real PostgreSQL server, so they are deliberately NOT part of the
// default aggregate suite. Run them with:
//
//     TEST_DATABASE_URL=postgresql://…/scratch pnpm --filter @workspace/db run test:journals
//
// Safety rail: the suite refuses to start unless TEST_DATABASE_URL is set and is
// different from DATABASE_URL. Every case runs against its own database, created
// and dropped here. Staging is never a valid target.

import {
  BASELINE_DOMAINS,
  LEGACY_JOURNAL_SCHEMA,
  LEGACY_JOURNAL_TABLE,
  baselineJournals,
  domainJournalTable,
  journalTableDdl,
  readAllExpectedMigrations,
  readExpectedMigrations,
} from "./src/baseline-journals.mjs";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  console.error("journalIntegration — refusing to run: TEST_DATABASE_URL is not set.");
  console.error("These tests create and drop databases. They must never point at staging.");
  process.exit(1);
}
if (DATABASE_URL && TEST_DATABASE_URL === DATABASE_URL) {
  console.error("journalIntegration — refusing to run: TEST_DATABASE_URL equals DATABASE_URL.");
  process.exit(1);
}

const pg = (await import("pg")).default;

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const adminUrl = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.pathname = "/postgres";
  return u.toString();
})();

let counter = 0;
async function withDisposableDb<T>(label: string, fn: (url: string) => Promise<T>): Promise<T> {
  counter += 1;
  const name = `ar001z_${process.pid}_${counter}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const url = (() => {
    const u = new URL(TEST_DATABASE_URL);
    u.pathname = `/${name}`;
    return u.toString();
  })();

  try {
    return await fn(url);
  } finally {
    const cleanup = new pg.Client({ connectionString: adminUrl });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await cleanup.end();
  }
}

async function query(url: string, sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

/** Recreate the legacy staging shape: shared journal with the given rows. */
async function seedLegacy(url: string, rows: Array<{ hash: string; createdAt: number }>) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(`CREATE SCHEMA IF NOT EXISTS "${LEGACY_JOURNAL_SCHEMA}"`);
    await c.query(journalTableDdl(LEGACY_JOURNAL_SCHEMA, LEGACY_JOURNAL_TABLE));
    for (const r of rows) {
      await c.query(
        `INSERT INTO "${LEGACY_JOURNAL_SCHEMA}"."${LEGACY_JOURNAL_TABLE}" ("hash","created_at") VALUES ($1,$2)`,
        [r.hash, r.createdAt],
      );
    }
  } finally {
    await c.end();
  }
}

async function domainRows(url: string, domain: string) {
  const identifier = `"${LEGACY_JOURNAL_SCHEMA}"."${domainJournalTable(domain)}"`;
  const probe = await query(url, "SELECT to_regclass($1) IS NOT NULL AS present", [identifier]);
  if (probe.rows[0]?.present !== true) return null;
  const res = await query(url, `SELECT id, hash, created_at FROM ${identifier} ORDER BY created_at`);
  return res.rows.map((r: any) => ({ id: Number(r.id), hash: String(r.hash), createdAt: Number(r.created_at) }));
}

console.log("--- journalIntegration.test.ts ---");
console.log(`  (server: ${new URL(TEST_DATABASE_URL).host}, databases are created and dropped per case)`);

const expectedAll = readAllExpectedMigrations();
const legacyStagingRows = expectedAll.map((e) => ({ hash: e.hash, createdAt: e.createdAt }));

// ── Proof 3: legacy five-row staging shape → baseline → exact journal sets ───

await withDisposableDb("staging-shape", async (url) => {
  await seedLegacy(url, legacyStagingRows);
  const result = await baselineJournals({ databaseUrl: url, logger: { log() {} } });

  check("baseline reports success on the legacy staging shape", result.ok && result.changed === true);

  for (const domain of BASELINE_DOMAINS) {
    const expected = readExpectedMigrations(domain);
    const rows = await domainRows(url, domain);
    const exact =
      rows !== null &&
      rows.length === expected.length &&
      rows.every((r, i) => r.createdAt === expected[i].createdAt && r.hash === expected[i].hash);
    check(`${domain} journal holds exactly its committed migrations`, exact, JSON.stringify(rows?.length));
  }

  const legacy = await query(
    url,
    `SELECT count(*)::int AS n FROM "${LEGACY_JOURNAL_SCHEMA}"."${LEGACY_JOURNAL_TABLE}"`,
  );
  check("the legacy journal is left untouched", legacy.rows[0].n === legacyStagingRows.length);
});

// ── Proof 9: ID sequences remain usable by a subsequent new migration ────────

await withDisposableDb("sequence-health", async (url) => {
  await seedLegacy(url, legacyStagingRows);
  await baselineJournals({ databaseUrl: url, logger: { log() {} } });

  const identifier = `"${LEGACY_JOURNAL_SCHEMA}"."${domainJournalTable("voice")}"`;
  await query(url, `INSERT INTO ${identifier} ("hash","created_at") VALUES ($1,$2)`, [
    "c".repeat(64),
    1785400000000,
  ]);
  const rows = await domainRows(url, "voice");
  const ids = (rows ?? []).map((r) => r.id);
  check(
    "a later insert gets a fresh, unique id from the sequence",
    new Set(ids).size === ids.length && ids.length === readExpectedMigrations("voice").length + 1,
    JSON.stringify(ids),
  );
  check("ids are strictly increasing", ids.every((id, i) => i === 0 || ids[i - 1] < id), JSON.stringify(ids));
});

// ── Proof 5: baseline double-run is a verified no-op ─────────────────────────

await withDisposableDb("double-run", async (url) => {
  await seedLegacy(url, legacyStagingRows);
  const first = await baselineJournals({ databaseUrl: url, logger: { log() {} } });
  const before = await Promise.all(BASELINE_DOMAINS.map((d) => domainRows(url, d)));

  const second = await baselineJournals({ databaseUrl: url, logger: { log() {} } });
  const after = await Promise.all(BASELINE_DOMAINS.map((d) => domainRows(url, d)));

  check("first baseline changes the database", first.changed === true);
  check("second baseline reports no change", second.ok && second.changed === false, second.reason);
  check(
    "second baseline writes nothing — rows are byte-identical including ids",
    JSON.stringify(before) === JSON.stringify(after),
  );
});

// ── Proof 7: damaged legacy journals fail atomically ────────────────────────

async function expectRefusal(label: string, mutate: (rows: typeof legacyStagingRows) => typeof legacyStagingRows) {
  await withDisposableDb(label, async (url) => {
    await seedLegacy(url, mutate([...legacyStagingRows]));
    let refused = false;
    let message = "";
    try {
      await baselineJournals({ databaseUrl: url, logger: { log() {} } });
    } catch (error) {
      refused = true;
      message = (error as Error).message;
    }
    check(`${label}: baseline refuses`, refused, message.slice(0, 90));

    const created = await Promise.all(BASELINE_DOMAINS.map((d) => domainRows(url, d)));
    const nothingWritten = created.every((rows) => rows === null || rows.length === 0);
    check(`${label}: no destination journal was written`, nothingWritten, JSON.stringify(created.map((r) => r?.length ?? null)));
  });
}

await expectRefusal("missing legacy row", (rows) => rows.slice(1));
await expectRefusal("duplicate legacy row", (rows) => [...rows, rows[0]]);
await expectRefusal("unknown legacy row", (rows) => [...rows, { hash: "f".repeat(64), createdAt: 1999999999999 }]);
await expectRefusal("hash-mismatched legacy row", (rows) =>
  rows.map((r, i) => (i === 0 ? { ...r, hash: "a".repeat(64) } : r)),
);

// ── Proof 8: partial destination journals fail atomically ───────────────────

await withDisposableDb("partial-destination", async (url) => {
  await seedLegacy(url, legacyStagingRows);

  // Pre-create voice's journal with only its first migration — a half-done run.
  const identifier = `"${LEGACY_JOURNAL_SCHEMA}"."${domainJournalTable("voice")}"`;
  await query(url, `CREATE SCHEMA IF NOT EXISTS "${LEGACY_JOURNAL_SCHEMA}"`);
  await query(url, journalTableDdl(LEGACY_JOURNAL_SCHEMA, domainJournalTable("voice")));
  const firstVoice = readExpectedMigrations("voice")[0];
  await query(url, `INSERT INTO ${identifier} ("hash","created_at") VALUES ($1,$2)`, [
    firstVoice.hash,
    firstVoice.createdAt,
  ]);

  let refused = false;
  let message = "";
  try {
    await baselineJournals({ databaseUrl: url, logger: { log() {} } });
  } catch (error) {
    refused = true;
    message = (error as Error).message;
  }

  check("a partially populated destination is refused", refused, message.slice(0, 90));

  const voiceRows = await domainRows(url, "voice");
  check("the partial destination is left exactly as it was", voiceRows?.length === 1, JSON.stringify(voiceRows?.length));

  const others = await Promise.all(["discovery", "scheduling"].map((d) => domainRows(url, d)));
  check(
    "no other destination journal was populated",
    others.every((rows) => rows === null || rows.length === 0),
    JSON.stringify(others.map((r) => r?.length ?? null)),
  );
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("All journalIntegration tests passed.");
