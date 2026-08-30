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

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dbPackageRoot = dirname(fileURLToPath(import.meta.url));

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
  // created_at strictly after every committed migration, DERIVED so new
  // reviewed migrations can't reorder this proof (created_at ordering is the
  // fold/journal ordering contract).
  const afterAllCommitted = Math.max(...readAllExpectedMigrations().map((e) => e.createdAt)) + 60_000;
  await query(url, `INSERT INTO ${identifier} ("hash","created_at") VALUES ($1,$2)`, [
    "c".repeat(64),
    afterAllCommitted,
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

// ── AR-001Z Commit B proofs — the switched, per-domain world ────────────────
//
// These drive the real package commands against disposable databases, so they
// exercise the shipped configs, the guard, and drizzle-kit itself.



function run(script: string, url: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["run", script], {
      cwd: dbPackageRoot,
      env: { ...process.env, DATABASE_URL: url },
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
    child.on("error", (e) => resolve({ code: 1, output: String(e) }));
  });
}

/** A stable fingerprint of the application schema, for "nothing changed" proofs. */
async function schemaFingerprint(url: string) {
  const cols = await query(
    url,
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' ORDER BY table_name, column_name`,
  );
  const cons = await query(
    url,
    `SELECT conrelid::regclass::text AS t, conname FROM pg_constraint
      WHERE connamespace='public'::regnamespace ORDER BY 1,2`,
  );
  const idx = await query(
    url,
    `SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2`,
  );
  return JSON.stringify({
    cols: cols.rows.map((r: any) => `${r.table_name}.${r.column_name}`),
    cons: cons.rows.map((r: any) => `${r.t}:${r.conname}`),
    idx: idx.rows.map((r: any) => `${r.tablename}:${r.indexname}`),
  });
}

async function journalCounts(url: string) {
  const out: Record<string, number | null> = {};
  for (const domain of BASELINE_DOMAINS) {
    const rows = await domainRows(url, domain);
    out[domain] = rows === null ? null : rows.length;
  }
  return out;
}

/** Rebuild the pre-Commit-B world: real schema, migrations recorded ONLY in the legacy journal. */
async function seedLegacyStagingWorld(url: string) {
  const push = await run("push", url);
  if (push.code !== 0) throw new Error(`push failed: ${push.output.slice(-400)}`);

  for (const domain of BASELINE_DOMAINS) {
    for (const entry of readExpectedMigrations(domain)) {
      const sql = readFileSync(join(dbPackageRoot, "drizzle", domain, `${entry.tag}.sql`)).toString();
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await query(url, statement);
      }
    }
  }
  await seedLegacy(
    url,
    readAllExpectedMigrations().map((e) => ({ hash: e.hash, createdAt: e.createdAt })),
  );
}

// ── Proof 1: an empty database applies every migration exactly once ─────────

await withDisposableDb("empty-exact-once", async (url) => {
  const push = await run("push", url);
  check("base push succeeds on an empty database", push.code === 0, push.output.slice(-200));

  for (const domain of BASELINE_DOMAINS) {
    const res = await run(`migrate:${domain}`, url);
    check(`migrate:${domain} succeeds on an empty database`, res.code === 0, res.output.slice(-200));
  }

  for (const domain of BASELINE_DOMAINS) {
    const expected = readExpectedMigrations(domain);
    const rows = await domainRows(url, domain);
    const exact =
      rows !== null &&
      rows.length === expected.length &&
      rows.every((r, i) => r.createdAt === expected[i].createdAt && r.hash === expected[i].hash);
    check(`${domain} applied each migration exactly once`, exact, JSON.stringify(rows?.length));
  }

  const legacy = await query(url, `SELECT to_regclass('"drizzle"."__drizzle_migrations"') IS NOT NULL AS p`);
  const legacyRows = legacy.rows[0].p
    ? (await query(url, `SELECT count(*)::int n FROM "drizzle"."__drizzle_migrations"`)).rows[0].n
    : 0;
  check("the legacy shared journal is never written to after the switch", legacyRows === 0, String(legacyRows));

  const tables = await query(
    url,
    `SELECT count(*)::int n FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
      ('voice_assistants','provider_webhook_events','voice_issues','discovery_delivery_jobs','discovery_ai_briefs')`,
  );
  check("every domain-owned table exists", tables.rows[0].n === 5, String(tables.rows[0].n));
});

// ── Proof 2: domain migrations after base push are order-independent ────────

await withDisposableDb("order-independent", async (url) => {
  const push = await run("push", url);
  check("base push succeeds (reverse-order case)", push.code === 0, push.output.slice(-200));

  for (const domain of [...BASELINE_DOMAINS].reverse()) {
    const res = await run(`migrate:${domain}`, url);
    check(`migrate:${domain} succeeds when run in reverse order`, res.code === 0, res.output.slice(-200));
  }

  for (const domain of BASELINE_DOMAINS) {
    const expected = readExpectedMigrations(domain);
    const rows = await domainRows(url, domain);
    check(
      `${domain} still applied exactly its own migrations in reverse order`,
      rows !== null && rows.length === expected.length,
      JSON.stringify(rows?.length),
    );
  }

  const tables = await query(
    url,
    `SELECT count(*)::int n FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
      ('voice_assistants','provider_webhook_events','voice_issues','discovery_delivery_jobs','discovery_ai_briefs')`,
  );
  check("reverse order still creates every domain-owned table", tables.rows[0].n === 5, String(tables.rows[0].n));
});

// ── Proof 6: migration double-run is a verified no-op ───────────────────────

await withDisposableDb("migrate-double-run", async (url) => {
  await run("push", url);
  for (const domain of BASELINE_DOMAINS) await run(`migrate:${domain}`, url);

  const before = await schemaFingerprint(url);
  const countsBefore = await journalCounts(url);

  for (const domain of BASELINE_DOMAINS) {
    const res = await run(`migrate:${domain}`, url);
    check(`second migrate:${domain} exits cleanly`, res.code === 0, res.output.slice(-200));
  }

  const after = await schemaFingerprint(url);
  const countsAfter = await journalCounts(url);

  check("a second migration pass changes no schema", before === after);
  check(
    "a second migration pass records no new journal rows",
    JSON.stringify(countsBefore) === JSON.stringify(countsAfter),
    JSON.stringify(countsAfter),
  );
});

// ── Proof 10: legacy-unbaselined direct migrate is blocked ──────────────────

await withDisposableDb("guard-blocks-unbaselined", async (url) => {
  await seedLegacyStagingWorld(url);

  const before = await schemaFingerprint(url);

  for (const domain of BASELINE_DOMAINS) {
    const res = await run(`migrate:${domain}`, url);
    check(`migrate:${domain} is refused before baseline`, res.code !== 0, `exit=${res.code}`);
    check(
      `migrate:${domain} names baseline:journals in its refusal`,
      /baseline:journals/.test(res.output),
      res.output.slice(-160),
    );
  }

  const after = await schemaFingerprint(url);
  check("a refused migration changes nothing", before === after);

  const counts = await journalCounts(url);
  check(
    "a refused migration creates no per-domain journal rows",
    Object.values(counts).every((n) => n === null || n === 0),
    JSON.stringify(counts),
  );
});

// ── Proof 4: after baseline, every migrate:* executes zero old SQL ──────────

await withDisposableDb("zero-replay-after-baseline", async (url) => {
  await seedLegacyStagingWorld(url);

  const baseline = await run("baseline:journals", url);
  check("baseline succeeds on the legacy staging world", baseline.code === 0, baseline.output.slice(-200));

  const before = await schemaFingerprint(url);
  const countsBefore = await journalCounts(url);

  for (const domain of BASELINE_DOMAINS) {
    const res = await run(`migrate:${domain}`, url);
    check(`migrate:${domain} is allowed after baseline`, res.code === 0, res.output.slice(-200));
  }

  const after = await schemaFingerprint(url);
  const countsAfter = await journalCounts(url);

  check("no migration replayed any SQL — the schema is byte-identical", before === after);
  check(
    "no migration recorded a new journal row",
    JSON.stringify(countsBefore) === JSON.stringify(countsAfter),
    JSON.stringify(countsAfter),
  );

  const legacyAfter = await query(url, `SELECT count(*)::int n FROM "drizzle"."__drizzle_migrations"`);
  check(
    "the legacy journal still holds one row per committed migration",
    legacyAfter.rows[0].n === readAllExpectedMigrations().length,
    String(legacyAfter.rows[0].n),
  ); // derived, so a reviewed new migration cannot silently break this proof
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("All journalIntegration tests passed.");
