/**
 * Checkpoint A3 — guard/flow tests: default dry-run, missing apply flag,
 * wrong confirmation, transaction + advisory-lock use, rollback, and
 * connection-identity redaction. No live database connection is made
 * anywhere in this file. Run via:
 *   pnpm --filter @workspace/scripts exec tsx lib/db/test/intakeLedgerAdoption/guardsAndFlow.test.ts
 */
import { runIntakeLedgerAdoption } from "../../src/intakeLedgerAdoption/adopt";
import { ADVISORY_LOCK_KEY, CONNECTION_ENV_VAR } from "../../src/intakeLedgerAdoption/constants";
import { computeConfirmationToken, deriveAdvisoryLockKey } from "../../src/intakeLedgerAdoption/crypto";
import { loadAndVerifyMigrationFingerprint } from "../../src/intakeLedgerAdoption/migrationFingerprint";
import { fingerprintConnectionTarget } from "../../src/intakeLedgerAdoption/crypto";
import { redactConnectionTarget } from "../../src/intakeLedgerAdoption/redact";
import { parseArgs } from "../../src/intakeLedgerAdoption/cli";
import { FakeAdoptionClient } from "./fakeClient";
import { check, expectRejection, finish } from "./testHarness";

const TARGET = { fingerprint: "bbbbbbbbbbbb", hostForDisplay: "example.invalid" };
const fingerprint = loadAndVerifyMigrationFingerprint();
const CONFIRM = computeConfirmationToken(TARGET.fingerprint, fingerprint.hash, fingerprint.journalTimestamp);

async function main(): Promise<void> {
  // ── Named env var, never DATABASE_URL ─────────────────────────────────────
  check("connection env var is not DATABASE_URL", CONNECTION_ENV_VAR !== "DATABASE_URL");
  check("connection env var is explicitly intake-scoped", CONNECTION_ENV_VAR.includes("INTAKE"));

  // ── Default dry-run behavior ───────────────────────────────────────────────
  const dryRunClient = new FakeAdoptionClient();
  const dryRunResult = await runIntakeLedgerAdoption(dryRunClient, TARGET, { mode: "dry-run" });
  check("default/dry-run mode returns dry-run-ok on a clean target", dryRunResult.status === "dry-run-ok");
  const writeCallsInDryRun = dryRunClient.calls.filter((c) =>
    /^(BEGIN|COMMIT|ROLLBACK|INSERT INTO|CREATE (SCHEMA|TABLE))/.test(c.text.trim()),
  );
  check("dry-run issues no transaction, lock, or write statements", writeCallsInDryRun.length === 0);
  if (dryRunResult.status === "dry-run-ok") {
    check("dry-run reports the expected confirmation token", dryRunResult.confirmationToken === CONFIRM);
  }

  // ── parseArgs: apply flag / confirmation parsing ──────────────────────────
  check("parseArgs defaults to dry-run with no flags", parseArgs([]).mode === "dry-run");
  check("parseArgs requires --apply literally", parseArgs(["--confirm=x"]).mode === "dry-run");
  check("parseArgs recognizes --apply", parseArgs(["--apply"]).mode === "apply");
  check(
    "parseArgs extracts --confirm= value",
    parseArgs(["--apply", "--confirm=ADOPT-INTAKE-abc"]).confirmation === "ADOPT-INTAKE-abc",
  );

  // ── Missing apply flag: mode stays dry-run, never writes even with a
  // (would-be) valid confirmation value passed through options ─────────────
  const noApplyClient = new FakeAdoptionClient();
  const noApplyResult = await runIntakeLedgerAdoption(noApplyClient, TARGET, {
    mode: "dry-run",
    confirmation: CONFIRM,
  });
  check("passing a confirmation without apply mode still only dry-runs", noApplyResult.status === "dry-run-ok");
  check(
    "passing a confirmation without apply mode writes nothing",
    noApplyClient.calls.every((c) => !c.text.trim().startsWith("INSERT INTO")),
  );

  // ── Wrong confirmation value ───────────────────────────────────────────────
  const wrongConfirmClient = new FakeAdoptionClient();
  await expectRejection("wrong --confirm value is rejected", "wrong-confirmation", async () =>
    runIntakeLedgerAdoption(wrongConfirmClient, TARGET, { mode: "apply", confirmation: "not-the-real-token" }),
  );
  check(
    "a rejected wrong-confirmation attempt opens no transaction",
    wrongConfirmClient.calls.every((c) => c.text.trim() !== "BEGIN"),
  );

  await expectRejection("missing --confirm value in apply mode is rejected", "wrong-confirmation", async () =>
    runIntakeLedgerAdoption(new FakeAdoptionClient(), TARGET, { mode: "apply" }),
  );

  // ── Confirmation token is bound to both target and migration identity ────
  const otherTargetConfirm = computeConfirmationToken("cccccccccccc", fingerprint.hash, fingerprint.journalTimestamp);
  check("confirmation token differs across targets", otherTargetConfirm !== CONFIRM);
  const otherHashConfirm = computeConfirmationToken(TARGET.fingerprint, "f".repeat(64), fingerprint.journalTimestamp);
  check("confirmation token differs across migration hashes", otherHashConfirm !== CONFIRM);

  // ── Transaction + advisory lock use on a successful apply ────────────────
  const applyClient = new FakeAdoptionClient({ ledgerTableExists: false });
  await runIntakeLedgerAdoption(applyClient, TARGET, { mode: "apply", confirmation: CONFIRM });
  const texts = applyClient.calls.map((c) => c.text.trim());
  const beginIdx = texts.indexOf("BEGIN");
  const lockIdx = texts.findIndex((t) => t.startsWith("SELECT pg_advisory_xact_lock"));
  const insertIdx = texts.findIndex((t) => t.startsWith("INSERT INTO"));
  const commitIdx = texts.indexOf("COMMIT");
  check("apply opens a transaction with BEGIN", beginIdx !== -1);
  check("apply acquires the advisory lock", lockIdx !== -1);
  check("advisory lock is acquired after BEGIN and before the INSERT", beginIdx < lockIdx && lockIdx < insertIdx);
  check("apply commits after the insert", insertIdx < commitIdx);
  const lockCall = applyClient.calls[lockIdx];
  check("advisory lock uses the pinned deterministic key", lockCall.params?.[0] === ADVISORY_LOCK_KEY.toString());
  check("ADVISORY_LOCK_KEY matches independently re-derived value", deriveAdvisoryLockKey() === ADVISORY_LOCK_KEY);

  // ── Rollback behavior on mid-transaction failure ──────────────────────────
  // Drift the baseline mid-flight (simulated via a client that reports a
  // schema mismatch on the *second* verification pass, i.e. the one done
  // after BEGIN/lock) to exercise the ROLLBACK path deterministically.
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
            rows: [{ ordinal_position: 1, column_name: "id", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null }] as unknown as Row[],
          };
        }
      }
      return super.query(text, params);
    }
  }
  const driftClient = new DriftAfterLockClient({ ledgerTableExists: false });
  await expectRejection(
    "a mismatch discovered after the lock is acquired triggers rollback",
    "baseline-schema-mismatch",
    async () => runIntakeLedgerAdoption(driftClient, TARGET, { mode: "apply", confirmation: CONFIRM }),
  );
  const driftTexts = driftClient.calls.map((c) => c.text.trim());
  check("rollback path issues ROLLBACK", driftTexts.includes("ROLLBACK"));
  check("rollback path never issues COMMIT", !driftTexts.includes("COMMIT"));
  check("rollback path never issues INSERT INTO", !driftTexts.some((t) => t.startsWith("INSERT INTO")));

  // ── Connection-identity redaction ──────────────────────────────────────────
  const redacted = redactConnectionTarget("postgres://user:hunter2@db.internal.example:5432/intakedb");
  check("redacted target exposes only the host", redacted.hostForDisplay === "db.internal.example");
  check("redacted target never contains the password", !JSON.stringify(redacted).includes("hunter2"));
  check("redacted target never contains the username", !JSON.stringify(redacted).includes("user"));
  check("redacted target never contains the raw db name", !JSON.stringify(redacted).includes("intakedb"));
  check(
    "redacted fingerprint matches independent recomputation",
    redacted.fingerprint === fingerprintConnectionTarget("db.internal.example:5432/intakedb"),
  );
  const redactedTwice = redactConnectionTarget("postgres://otheruser:otherpass@db.internal.example:5432/intakedb");
  check("redaction is deterministic for the same host/port/db", redactedTwice.fingerprint === redacted.fingerprint);

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
