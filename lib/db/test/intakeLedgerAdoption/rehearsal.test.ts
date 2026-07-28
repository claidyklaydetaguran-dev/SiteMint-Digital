/**
 * Checkpoint A3 (correction) — rollback-only rehearsal mode tests. No live
 * database connection is made anywhere in this file; FakeAdoptionClient
 * implements real BEGIN/ROLLBACK/COMMIT snapshot semantics (see
 * fakeClient.ts) so "nothing persisted after rollback" is actually proven,
 * not just asserted. Run via:
 *   pnpm --filter @workspace/scripts exec tsx lib/db/test/intakeLedgerAdoption/rehearsal.test.ts
 */
import { runIntakeLedgerAdoption } from "../../src/intakeLedgerAdoption/adopt";
import { computeConfirmationToken } from "../../src/intakeLedgerAdoption/crypto";
import { loadAndVerifyMigrationFingerprint } from "../../src/intakeLedgerAdoption/migrationFingerprint";
import { parseArgs } from "../../src/intakeLedgerAdoption/cli";
import { FakeAdoptionClient } from "./fakeClient";
import { check, expectRejection, finish } from "./testHarness";

const TARGET = { fingerprint: "dddddddddddd", hostForDisplay: "example.invalid" };
const fingerprint = loadAndVerifyMigrationFingerprint();
const CONFIRM = computeConfirmationToken(TARGET.fingerprint, fingerprint.hash, fingerprint.journalTimestamp);

async function main(): Promise<void> {
  // ── --apply and --rehearse are mutually exclusive ─────────────────────────
  await expectRejection("--apply and --rehearse together is rejected", "mutually-exclusive-flags", async () => {
    parseArgs(["--apply", "--rehearse", `--confirm=${CONFIRM}`]);
  });
  check("parseArgs recognizes --rehearse alone", parseArgs(["--rehearse"]).mode === "rehearse");
  check(
    "parseArgs still recognizes --apply alone",
    parseArgs(["--apply", `--confirm=${CONFIRM}`]).mode === "apply",
  );
  check("parseArgs still defaults to dry-run with neither flag", parseArgs([]).mode === "dry-run");

  // ── Missing/incorrect confirmation: no transaction, no write ──────────────
  const noConfirmClient = new FakeAdoptionClient({ ledgerTableExists: false });
  await expectRejection("rehearse without --confirm is rejected", "wrong-confirmation", async () =>
    runIntakeLedgerAdoption(noConfirmClient, TARGET, { mode: "rehearse" }),
  );
  check("no BEGIN was issued", noConfirmClient.calls.every((c) => c.text.trim() !== "BEGIN"));
  check(
    "no ledger write statement was issued",
    noConfirmClient.calls.every((c) => !/^(INSERT INTO|CREATE (SCHEMA|TABLE))/.test(c.text.trim())),
  );

  const wrongConfirmClient = new FakeAdoptionClient({ ledgerTableExists: false });
  await expectRejection("rehearse with wrong --confirm is rejected", "wrong-confirmation", async () =>
    runIntakeLedgerAdoption(wrongConfirmClient, TARGET, { mode: "rehearse", confirmation: "not-the-token" }),
  );
  check("wrong-confirmation rehearse attempt opens no transaction", wrongConfirmClient.calls.every((c) => c.text.trim() !== "BEGIN"));

  // ── Full successful rehearsal on a fresh (not-yet-adopted) target ─────────
  const freshClient = new FakeAdoptionClient({ ledgerTableExists: false });
  const result = await runIntakeLedgerAdoption(freshClient, TARGET, { mode: "rehearse", confirmation: CONFIRM });
  check("rehearsal reports status 'rehearsed'", result.status === "rehearsed");
  if (result.status === "rehearsed") {
    check("rehearsal reports the ledger write path was exercised", result.ledgerWriteExercised === true);
  }

  const texts = freshClient.calls.map((c) => c.text.trim());
  const beginIdx = texts.indexOf("BEGIN");
  const lockIdx = texts.findIndex((t) => t.startsWith("SELECT pg_advisory_xact_lock"));
  const createSchemaIdx = texts.findIndex((t) => t.startsWith("CREATE SCHEMA IF NOT EXISTS"));
  const createTableIdx = texts.findIndex((t) => t.startsWith("CREATE TABLE IF NOT EXISTS"));
  const insertIdx = texts.findIndex((t) => t.startsWith("INSERT INTO"));
  const rollbackIdx = texts.indexOf("ROLLBACK");
  const commitCount = texts.filter((t) => t === "COMMIT").length;

  check("rehearsal opens a transaction with BEGIN", beginIdx !== -1);
  check("rehearsal acquires the advisory lock", lockIdx !== -1);
  check("advisory lock is acquired before any ledger DDL", lockIdx > beginIdx && lockIdx < createSchemaIdx);
  check("rehearsal issues CREATE SCHEMA", createSchemaIdx !== -1);
  check("rehearsal issues CREATE TABLE", createTableIdx !== -1);
  check("rehearsal issues INSERT INTO", insertIdx !== -1);
  check(
    "ledger DDL/write happens in order: lock -> schema -> table -> insert",
    lockIdx < createSchemaIdx && createSchemaIdx < createTableIdx && createTableIdx < insertIdx,
  );
  check("rehearsal issues ROLLBACK", rollbackIdx !== -1);
  check("rollback happens after the insert", insertIdx < rollbackIdx);
  check("rehearsal never issues COMMIT", commitCount === 0);

  // Step 9: post-rollback verification queries happen (more information_schema
  // reads occur after the ROLLBACK than just the pre-transaction ones).
  const readsAfterRollback = freshClient.calls
    .slice(rollbackIdx + 1)
    .filter((c) => /information_schema|SELECT id, hash, created_at|drizzle\.__drizzle_migrations/.test(c.text));
  check("post-rollback verification issues additional read-only queries", readsAfterRollback.length > 0);
  check(
    "post-rollback verification issues no writes",
    freshClient.calls.slice(rollbackIdx + 1).every((c) => !/^(INSERT INTO|CREATE (SCHEMA|TABLE)|UPDATE|DELETE|ALTER|DROP)/.test(c.text.trim())),
  );

  // ── Nothing persisted: the fake client's rollback semantics prove the
  // ledger row inserted mid-transaction did not survive ────────────────────
  check("rehearsal leaves the ledger with zero rows after rollback", freshClient.getLedgerRows().length === 0);

  // ── Rehearsal is repeatable — a second rehearsal against the same
  // (still-unadopted) target behaves identically ───────────────────────────
  const secondResult = await runIntakeLedgerAdoption(freshClient, TARGET, { mode: "rehearse", confirmation: CONFIRM });
  check("a second rehearsal also reports 'rehearsed'", secondResult.status === "rehearsed");
  check("a second rehearsal also leaves zero rows", freshClient.getLedgerRows().length === 0);

  // ── Rehearsal against an already-adopted target: no insert needed, still
  // verifies + rolls back cleanly ───────────────────────────────────────────
  const adoptedClient = new FakeAdoptionClient({
    ledgerTableExists: true,
    ledgerRows: [{ id: 1, hash: fingerprint.hash, created_at: fingerprint.journalTimestamp }],
  });
  const adoptedResult = await runIntakeLedgerAdoption(adoptedClient, TARGET, {
    mode: "rehearse",
    confirmation: CONFIRM,
  });
  check("rehearsal on an already-adopted target reports 'rehearsed'", adoptedResult.status === "rehearsed");
  if (adoptedResult.status === "rehearsed") {
    check(
      "rehearsal on an already-adopted target reports no write was exercised",
      adoptedResult.ledgerWriteExercised === false,
    );
  }
  check(
    "rehearsal on an already-adopted target issues no INSERT",
    adoptedClient.calls.every((c) => !c.text.trim().startsWith("INSERT INTO")),
  );
  check("rehearsal on an already-adopted target still issues ROLLBACK", adoptedClient.calls.some((c) => c.text.trim() === "ROLLBACK"));
  check(
    "rehearsal on an already-adopted target never issues COMMIT",
    adoptedClient.calls.every((c) => c.text.trim() !== "COMMIT"),
  );
  check("rehearsal on an already-adopted target leaves exactly the original row", adoptedClient.getLedgerRows().length === 1);

  // ── Error during rehearsal also rolls back (drift discovered after lock) ─
  class DriftAfterLockClient extends FakeAdoptionClient {
    private verifyCount = 0;
    async query<Row extends object = Record<string, unknown>>(
      text: string,
      params?: readonly unknown[],
    ): Promise<{ rows: Row[] }> {
      if (text.includes("FROM information_schema.columns") && params?.[0] === "intake_conversations") {
        this.verifyCount++;
        if (this.verifyCount === 2) {
          return {
            rows: [
              {
                ordinal_position: 1,
                column_name: "id",
                data_type: "text",
                udt_name: "text",
                is_nullable: "NO",
                column_default: null,
              },
            ] as unknown as Row[],
          };
        }
      }
      return super.query(text, params);
    }
  }
  const driftClient = new DriftAfterLockClient({ ledgerTableExists: false });
  await expectRejection(
    "a mismatch discovered mid-rehearsal (after the lock) triggers rollback",
    "baseline-schema-mismatch",
    async () => runIntakeLedgerAdoption(driftClient, TARGET, { mode: "rehearse", confirmation: CONFIRM }),
  );
  const driftTexts = driftClient.calls.map((c) => c.text.trim());
  check("failed rehearsal still issues ROLLBACK", driftTexts.includes("ROLLBACK"));
  check("failed rehearsal never issues COMMIT", !driftTexts.includes("COMMIT"));
  check("failed rehearsal leaves zero ledger rows behind", driftClient.getLedgerRows().length === 0);

  // ── Shared (voice/discovery) ledger drift is detected post-rollback ──────
  class ExternalDriftClient extends FakeAdoptionClient {
    private rollbackCount = 0;
    async query<Row extends object = Record<string, unknown>>(
      text: string,
      params?: readonly unknown[],
    ): Promise<{ rows: Row[] }> {
      const result = await super.query<Row>(text, params);
      if (text.trim() === "ROLLBACK") {
        this.rollbackCount++;
        if (this.rollbackCount === 1) {
          this.setSharedLedgerRowCount(999);
        }
      }
      return result;
    }
  }
  const externalDriftClient = new ExternalDriftClient({ ledgerTableExists: false, sharedLedgerExists: true, sharedLedgerRowCount: 3 });
  await expectRejection(
    "a shared voice/discovery ledger change detected after rollback is rejected",
    "rehearsal-shared-ledger-changed",
    async () => runIntakeLedgerAdoption(externalDriftClient, TARGET, { mode: "rehearse", confirmation: CONFIRM }),
  );

  // ── Rehearsal never mutates the shared ledger itself (no writes to schema
  // `drizzle` anywhere in a normal run) ──────────────────────────────────────
  const sharedLedgerAwareClient = new FakeAdoptionClient({
    ledgerTableExists: false,
    sharedLedgerExists: true,
    sharedLedgerRowCount: 2,
  });
  await runIntakeLedgerAdoption(sharedLedgerAwareClient, TARGET, { mode: "rehearse", confirmation: CONFIRM });
  check(
    "rehearsal issues no write statements referencing schema 'drizzle'",
    sharedLedgerAwareClient.calls.every(
      (c) => !/^(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)/i.test(c.text.trim()) || !c.text.includes("drizzle."),
    ),
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
