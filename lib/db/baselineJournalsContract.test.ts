// AR-001Z Commit A — the database-free contract for `baseline:journals`.
//
// Everything here is a pure function of the committed migration folders, so it
// runs in the ordinary aggregate suite with no database at all. The behaviours
// that need a live server (transaction atomicity, advisory locking, sequence
// health) are proven separately in journalIntegration.test.ts, which refuses to
// run without a dedicated TEST_DATABASE_URL.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADVISORY_LOCK_KEY,
  BASELINE_DOMAINS,
  LEGACY_JOURNAL_SCHEMA,
  LEGACY_JOURNAL_TABLE,
  classifyDestination,
  domainJournalTable,
  journalTableDdl,
  readAllExpectedMigrations,
  readExpectedMigrations,
  verifyLegacyJournal,
} from "./src/baseline-journals.mjs";

const here = dirname(fileURLToPath(import.meta.url));

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

console.log("--- baselineJournalsContract.test.ts ---");

// ── 1. Domains and table naming ──────────────────────────────────────────────

check(
  "the baseline covers exactly the three journal-recording domains",
  JSON.stringify(BASELINE_DOMAINS) === JSON.stringify(["voice", "discovery", "scheduling"]),
  BASELINE_DOMAINS.join(","),
);

const tables = BASELINE_DOMAINS.map((d) => domainJournalTable(d));
check("every domain gets a distinct journal table", new Set(tables).size === tables.length, tables.join(","));
check(
  "no domain journal table collides with the legacy table",
  !tables.includes(LEGACY_JOURNAL_TABLE),
  tables.join(","),
);
check(
  "domain journal tables stay in the drizzle schema",
  LEGACY_JOURNAL_SCHEMA === "drizzle",
  LEGACY_JOURNAL_SCHEMA,
);

// ── 2. The DDL is drizzle's own ──────────────────────────────────────────────
//
// Reproduced from drizzle-orm pg-core `migrationTableCreate`. If drizzle ever
// changes shape, this fails here rather than at the first real migration.

const ddl = journalTableDdl("drizzle", "__drizzle_migrations_voice");
check("the journal DDL declares a SERIAL primary key", /id SERIAL PRIMARY KEY/.test(ddl), ddl);
check("the journal DDL declares hash text NOT NULL", /hash text NOT NULL/.test(ddl), ddl);
check("the journal DDL declares created_at bigint", /created_at bigint/.test(ddl), ddl);
check("the journal DDL is CREATE TABLE IF NOT EXISTS", /CREATE TABLE IF NOT EXISTS/.test(ddl), ddl);

const ormDialect = readFileSync(
  join(here, "node_modules/drizzle-orm/pg-core/dialect.cjs"),
  "utf8",
);
check(
  "drizzle still creates its journal with the shape this baseline reproduces",
  /id SERIAL PRIMARY KEY/.test(ormDialect) &&
    /hash text NOT NULL/.test(ormDialect) &&
    /created_at bigint/.test(ormDialect),
);
check(
  "drizzle still inserts only (hash, created_at), leaving id to the sequence",
  /insert into .*\("hash", "created_at"\) values/.test(ormDialect),
);
check(
  "drizzle still decides pending work from a single created_at watermark",
  /Number\(lastDbMigration\.created_at\) < migration\.folderMillis/.test(ormDialect),
);

// ── 3. Expected pairs derive from the committed folders ──────────────────────

const expectedAll = readAllExpectedMigrations();
check("the committed folders describe five migrations", expectedAll.length === 5, String(expectedAll.length));
check(
  "expected migrations are unique by created_at",
  new Set(expectedAll.map((e) => e.createdAt)).size === expectedAll.length,
);
check(
  "every expected hash is a sha256 hex digest",
  expectedAll.every((e) => /^[0-9a-f]{64}$/.test(e.hash)),
);

// The hash must be sha256 of the raw file text — the same thing drizzle's
// readMigrationFiles computes. Recompute one independently and compare.
const voice = readExpectedMigrations("voice");
const firstVoiceSql = readFileSync(join(here, "drizzle", "voice", `${voice[0].tag}.sql`)).toString();
check(
  "the expected hash is sha256 of the raw migration file",
  voice[0].hash === createHash("sha256").update(firstVoiceSql).digest("hex"),
);
check(
  "voice migrations are ordered ascending by created_at",
  voice.every((e, i) => i === 0 || voice[i - 1].createdAt < e.createdAt),
  voice.map((e) => e.createdAt).join(" < "),
);

// ── 4. Legacy verification refuses every damaged shape ───────────────────────

const legacyOk = expectedAll.map((e) => ({ hash: e.hash, created_at: String(e.createdAt) }));

check("a complete legacy journal verifies", verifyLegacyJournal(legacyOk, expectedAll).ok);

const missing = verifyLegacyJournal(legacyOk.slice(1), expectedAll);
check(
  "a missing legacy row is refused",
  !missing.ok && missing.problems.some((p) => p.kind === "missing"),
  JSON.stringify(missing.problems.map((p) => p.kind)),
);

const duplicated = verifyLegacyJournal([...legacyOk, legacyOk[0]], expectedAll);
check(
  "a duplicate legacy row is refused",
  !duplicated.ok && duplicated.problems.some((p) => p.kind === "duplicate"),
  JSON.stringify(duplicated.problems.map((p) => p.kind)),
);

const unknown = verifyLegacyJournal(
  [...legacyOk, { hash: "f".repeat(64), created_at: "1999999999999" }],
  expectedAll,
);
check(
  "an unknown legacy row is refused",
  !unknown.ok && unknown.problems.some((p) => p.kind === "unknown"),
  JSON.stringify(unknown.problems.map((p) => p.kind)),
);

const tampered = legacyOk.map((r, i) => (i === 0 ? { ...r, hash: "a".repeat(64) } : r));
const mismatched = verifyLegacyJournal(tampered, expectedAll);
check(
  "a hash-mismatched legacy row is refused",
  !mismatched.ok && mismatched.problems.some((p) => p.kind === "hash-mismatch"),
  JSON.stringify(mismatched.problems.map((p) => p.kind)),
);

check(
  "verification does not rely on row counts alone",
  !verifyLegacyJournal(
    [...legacyOk.slice(1), { hash: "f".repeat(64), created_at: "1999999999999" }],
    expectedAll,
  ).ok,
);

// ── 5. Destination classification ────────────────────────────────────────────

check("an empty destination is classified empty", classifyDestination([], voice).state === "empty");
check(
  "an exactly-matching destination is classified complete",
  classifyDestination(
    voice.map((e) => ({ hash: e.hash, created_at: String(e.createdAt) })),
    voice,
  ).state === "complete",
);
check(
  "a partially populated destination is classified mismatched",
  classifyDestination(
    voice.slice(0, 1).map((e) => ({ hash: e.hash, created_at: String(e.createdAt) })),
    voice,
  ).state === "mismatched",
);
check(
  "a destination with a wrong hash is classified mismatched",
  classifyDestination(
    voice.map((e, i) => ({ hash: i === 0 ? "b".repeat(64) : e.hash, created_at: String(e.createdAt) })),
    voice,
  ).state === "mismatched",
);

// ── 6. Locking and the legacy table's immutability ───────────────────────────

const baselineSource = readFileSync(join(here, "src", "baseline-journals.mjs"), "utf8");

check(
  "baseline takes a transaction-scoped advisory lock",
  /pg_advisory_xact_lock/.test(baselineSource),
);
check("the advisory lock key is a fixed integer", Number.isInteger(ADVISORY_LOCK_KEY));
check(
  "baseline runs inside an explicit transaction",
  /"BEGIN"/.test(baselineSource) && /"COMMIT"/.test(baselineSource) && /"ROLLBACK"/.test(baselineSource),
);
check(
  "baseline never updates, deletes from, or drops the legacy journal",
  !new RegExp(`(UPDATE|DELETE FROM|DROP TABLE)[^\\n]*${LEGACY_JOURNAL_TABLE}"`).test(baselineSource),
);
check(
  "baseline inserts only hash and created_at, never id",
  /INSERT INTO \$\{?[^\n]*\("hash", "created_at"\) VALUES/.test(baselineSource) ||
    /\("hash", "created_at"\) VALUES \(\$1, \$2\)/.test(baselineSource),
);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("All baselineJournalsContract tests passed.");
