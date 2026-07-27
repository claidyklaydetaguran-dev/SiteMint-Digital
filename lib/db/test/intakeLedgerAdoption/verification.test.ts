/**
 * Checkpoint A3 — static + mocked-client verification tests. No live
 * database connection is made anywhere in this file. Run via:
 *   pnpm --filter @workspace/scripts exec tsx lib/db/test/intakeLedgerAdoption/verification.test.ts
 */
import {
  verifyApplicationTablesExist,
  verifyIntakeBaseline,
} from "../../src/intakeLedgerAdoption/baselineVerification";
import { EXPECTED_JOURNAL_TIMESTAMP, EXPECTED_MIGRATION_HASH } from "../../src/intakeLedgerAdoption/constants";
import { hashMigrationSql } from "../../src/intakeLedgerAdoption/crypto";
import { loadAndVerifyMigrationFingerprint } from "../../src/intakeLedgerAdoption/migrationFingerprint";
import { FakeAdoptionClient } from "./fakeClient";
import { check, expectRejection, finish } from "./testHarness";

async function main(): Promise<void> {
  // ── Pinned fingerprint matches the real on-disk candidate migration ──────
  const fingerprint = loadAndVerifyMigrationFingerprint();
  check("pinned filename is 0000_talented_virginia_dare.sql", fingerprint.filename === "0000_talented_virginia_dare.sql");
  check("pinned hash matches EXPECTED_MIGRATION_HASH constant", fingerprint.hash === EXPECTED_MIGRATION_HASH);
  check(
    "pinned journal timestamp matches EXPECTED_JOURNAL_TIMESTAMP constant",
    fingerprint.journalTimestamp === EXPECTED_JOURNAL_TIMESTAMP,
  );
  check(
    "hashMigrationSql recomputes the same hash independently",
    hashMigrationSql(fingerprint.sql) === EXPECTED_MIGRATION_HASH,
  );

  // ── Migration hash mismatch refusal ───────────────────────────────────────
  await expectRejection("wrong pinned expectedHash is rejected", "migration-hash-mismatch", async () => {
    loadAndVerifyMigrationFingerprint({ expectedHash: "0".repeat(64) });
  });

  // ── Journal timestamp mismatch refusal ────────────────────────────────────
  await expectRejection(
    "wrong pinned expectedJournalTimestamp is rejected",
    "journal-timestamp-mismatch",
    async () => {
      loadAndVerifyMigrationFingerprint({ expectedJournalTimestamp: 1 });
    },
  );

  // ── Journal tag / filename mismatch refusal ───────────────────────────────
  await expectRejection("wrong pinned journalTag is rejected", "filename-mismatch", async () => {
    loadAndVerifyMigrationFingerprint({ journalTag: "not_the_real_tag" });
  });

  // ── Application table existence ────────────────────────────────────────────
  const missingTablesClient = new FakeAdoptionClient({ tablesExist: false });
  await expectRejection(
    "missing application tables are rejected",
    "application-tables-missing",
    async () => verifyApplicationTablesExist(missingTablesClient),
  );

  const presentTablesClient = new FakeAdoptionClient({ tablesExist: true });
  await verifyApplicationTablesExist(presentTablesClient); // does not throw
  check("verifyApplicationTablesExist resolves when both tables exist", true);

  // ── Baseline verification: happy path ─────────────────────────────────────
  const cleanClient = new FakeAdoptionClient();
  await verifyIntakeBaseline(cleanClient); // does not throw
  check("verifyIntakeBaseline resolves against a baseline-matching fake client", true);

  // ── Baseline verification: schema mismatch refusal ────────────────────────
  const driftedClient = new FakeAdoptionClient({
    columnOverrides: { intake_conversations: { firm_id: { data_type: "text", udt_name: "text" } } },
  });
  await expectRejection(
    "column data_type drift on intake_conversations.firm_id is rejected",
    "baseline-schema-mismatch",
    async () => verifyIntakeBaseline(driftedClient),
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
