/**
 * Checkpoint A3 — ledger-state tests (partial / duplicate / conflicting /
 * already-adopted / successful adoption) against a mocked client. No live
 * database connection is made anywhere in this file. Run via:
 *   pnpm --filter @workspace/scripts exec tsx lib/db/test/intakeLedgerAdoption/ledgerStates.test.ts
 */
import { runIntakeLedgerAdoption } from "../../src/intakeLedgerAdoption/adopt";
import { computeConfirmationToken } from "../../src/intakeLedgerAdoption/crypto";
import { loadAndVerifyMigrationFingerprint } from "../../src/intakeLedgerAdoption/migrationFingerprint";
import { FakeAdoptionClient } from "./fakeClient";
import { check, expectRejection, finish } from "./testHarness";

const TARGET = { fingerprint: "aaaaaaaaaaaa", hostForDisplay: "example.invalid" };
const fingerprint = loadAndVerifyMigrationFingerprint();
const CONFIRM = computeConfirmationToken(TARGET.fingerprint, fingerprint.hash, fingerprint.journalTimestamp);

async function main(): Promise<void> {
  // ── Duplicate ledger records ────────────────────────────────────────────
  const duplicateClient = new FakeAdoptionClient({
    ledgerTableExists: true,
    ledgerRows: [
      { id: 1, hash: fingerprint.hash, created_at: fingerprint.journalTimestamp },
      { id: 2, hash: fingerprint.hash, created_at: fingerprint.journalTimestamp },
    ],
  });
  await expectRejection("duplicate ledger rows are rejected", "ledger-duplicate", async () =>
    runIntakeLedgerAdoption(duplicateClient, TARGET, { mode: "dry-run" }),
  );

  // ── Conflicting ledger record (different hash) ──────────────────────────
  const conflictClient = new FakeAdoptionClient({
    ledgerTableExists: true,
    ledgerRows: [{ id: 1, hash: "f".repeat(64), created_at: fingerprint.journalTimestamp }],
  });
  await expectRejection("conflicting ledger hash is rejected", "ledger-conflict", async () =>
    runIntakeLedgerAdoption(conflictClient, TARGET, { mode: "dry-run" }),
  );

  // ── Conflicting ledger record (different created_at) ────────────────────
  const conflictTimestampClient = new FakeAdoptionClient({
    ledgerTableExists: true,
    ledgerRows: [{ id: 1, hash: fingerprint.hash, created_at: 1 }],
  });
  await expectRejection("conflicting ledger created_at is rejected", "ledger-conflict", async () =>
    runIntakeLedgerAdoption(conflictTimestampClient, TARGET, { mode: "dry-run" }),
  );

  // ── Partial ledger record (null hash) ────────────────────────────────────
  const partialClient = new FakeAdoptionClient({
    ledgerTableExists: true,
    ledgerRows: [{ id: 1, hash: null, created_at: fingerprint.journalTimestamp }],
  });
  await expectRejection("partial ledger row (null hash) is rejected", "ledger-partial", async () =>
    runIntakeLedgerAdoption(partialClient, TARGET, { mode: "dry-run" }),
  );

  // ── Partial ledger table (unexpected shape) ──────────────────────────────
  const badShapeClient = new FakeAdoptionClient({
    ledgerTableExists: true,
    ledgerTableShape: "unexpected",
    ledgerRows: [],
  });
  await expectRejection("ledger table with wrong column shape is rejected", "ledger-partial", async () =>
    runIntakeLedgerAdoption(badShapeClient, TARGET, { mode: "dry-run" }),
  );

  // ── Already-adopted idempotency (dry-run) ────────────────────────────────
  const adoptedClient = new FakeAdoptionClient({
    ledgerTableExists: true,
    ledgerRows: [{ id: 1, hash: fingerprint.hash, created_at: fingerprint.journalTimestamp }],
  });
  const dryRunOnAdopted = await runIntakeLedgerAdoption(adoptedClient, TARGET, { mode: "dry-run" });
  check("dry-run against an already-adopted ledger reports already-adopted", dryRunOnAdopted.status === "already-adopted");

  // ── Already-adopted idempotency (apply — no second write) ────────────────
  const adoptedApplyClient = new FakeAdoptionClient({
    ledgerTableExists: true,
    ledgerRows: [{ id: 1, hash: fingerprint.hash, created_at: fingerprint.journalTimestamp }],
  });
  const applyOnAdopted = await runIntakeLedgerAdoption(adoptedApplyClient, TARGET, {
    mode: "apply",
    confirmation: CONFIRM,
  });
  check("apply against an already-adopted ledger reports already-adopted", applyOnAdopted.status === "already-adopted");
  check(
    "apply against an already-adopted ledger does not insert a second row",
    adoptedApplyClient.getLedgerRows().length === 1,
  );
  const insertCallsOnAdopted = adoptedApplyClient.calls.filter((c) => c.text.startsWith("INSERT INTO"));
  check("apply against an already-adopted ledger issues no INSERT", insertCallsOnAdopted.length === 0);

  // ── Successful first-time adoption ────────────────────────────────────────
  const freshClient = new FakeAdoptionClient({ ledgerTableExists: false });
  const adoptResult = await runIntakeLedgerAdoption(freshClient, TARGET, { mode: "apply", confirmation: CONFIRM });
  check("first-time apply reports adopted", adoptResult.status === "adopted");
  const rows = freshClient.getLedgerRows();
  check("adoption writes exactly one ledger record", rows.length === 1);
  check("the written record has the pinned migration hash", rows[0]?.hash === fingerprint.hash);
  check(
    "the written record has the pinned journal timestamp as created_at",
    rows[0]?.created_at === fingerprint.journalTimestamp,
  );

  // ── Adoption is safely idempotent after success (re-run same client) ─────
  const secondRun = await runIntakeLedgerAdoption(freshClient, TARGET, { mode: "apply", confirmation: CONFIRM });
  check("re-running apply after successful adoption reports already-adopted", secondRun.status === "already-adopted");
  check("re-running apply after successful adoption does not add a row", freshClient.getLedgerRows().length === 1);

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
