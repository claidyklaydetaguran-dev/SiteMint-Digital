// Checkpoint A3 — guarded intake baseline ledger adoption orchestrator.
//
// Defaults to dry-run. Never executes the candidate migration's CREATE
// TABLE statements. Never writes to intake_conversations or
// intake_messages — the only write path (writeLedgerRecord, from
// ledgerVerification.ts) touches exclusively the dedicated
// drizzle_intake.__drizzle_migrations ledger, inside a transaction holding
// a deterministic advisory lock, and only after every read-only guard below
// has passed AND an explicit apply/rehearse flag AND an exact confirmation
// token have both been supplied by the caller.
//
// "rehearse" mode exercises the exact same write path as "apply" — same
// BEGIN, same advisory lock, same writeLedgerRecord call — but always issues
// ROLLBACK and never COMMIT, regardless of outcome. It exists to let an
// operator prove the full adoption path works against a real database
// without ever persisting a change, per Checkpoint A3's correction.
import {
  verifyApplicationTablesExist,
  verifyIntakeBaseline,
} from "./baselineVerification";
import { ADVISORY_LOCK_KEY } from "./constants";
import { computeConfirmationToken } from "./crypto";
import { inspectLedgerState, writeLedgerRecord } from "./ledgerVerification";
import { loadAndVerifyMigrationFingerprint } from "./migrationFingerprint";
import type { RedactedTarget } from "./redact";
import { sharedLedgerSnapshotsEqual, snapshotSharedLedger } from "./sharedLedgerSnapshot";
import { AdoptionDbClient, AdoptionOptions, AdoptionOutcome, IntakeAdoptionError } from "./types";

export async function runIntakeLedgerAdoption(
  client: AdoptionDbClient,
  redactedTarget: RedactedTarget,
  options: AdoptionOptions,
): Promise<AdoptionOutcome> {
  // 1. Migration identity — filesystem only, no database touched yet.
  const fingerprint = loadAndVerifyMigrationFingerprint();

  // 2. Application tables must already exist and match the production baseline.
  await verifyApplicationTablesExist(client);
  await verifyIntakeBaseline(client);

  const confirmationToken = computeConfirmationToken(
    redactedTarget.fingerprint,
    fingerprint.hash,
    fingerprint.journalTimestamp,
  );

  // 3. Read-only ledger inspection — applies in both modes, so dry-run
  // surfaces conflicts before an operator ever attempts --apply.
  const preState = await inspectLedgerState(client, fingerprint);
  if (preState.kind === "conflict") {
    throw new IntakeAdoptionError("ledger-conflict", preState.detail);
  }
  if (preState.kind === "duplicate") {
    throw new IntakeAdoptionError("ledger-duplicate", preState.detail);
  }
  if (preState.kind === "partial") {
    throw new IntakeAdoptionError("ledger-partial", preState.detail);
  }

  if (options.mode === "dry-run") {
    if (preState.kind === "already-adopted") {
      return { status: "already-adopted", targetFingerprint: redactedTarget.fingerprint };
    }
    return { status: "dry-run-ok", confirmationToken, targetFingerprint: redactedTarget.fingerprint };
  }

  // Both "apply" and "rehearse" require the exact confirmation token,
  // checked before anything opens a transaction or issues a write.
  if (options.confirmation !== confirmationToken) {
    throw new IntakeAdoptionError(
      "wrong-confirmation",
      "Provided --confirm value does not match the expected confirmation token for this target and migration",
    );
  }

  if (options.mode === "apply") {
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [ADVISORY_LOCK_KEY.toString()]);

      // Re-verify everything inside the lock to close any TOCTOU window
      // between the pre-transaction reads above and this point.
      await verifyApplicationTablesExist(client);
      await verifyIntakeBaseline(client);
      const state = await inspectLedgerState(client, fingerprint);

      if (state.kind === "conflict") throw new IntakeAdoptionError("ledger-conflict", state.detail);
      if (state.kind === "duplicate") throw new IntakeAdoptionError("ledger-duplicate", state.detail);
      if (state.kind === "partial") throw new IntakeAdoptionError("ledger-partial", state.detail);

      if (state.kind === "already-adopted") {
        await client.query("COMMIT");
        return { status: "already-adopted", targetFingerprint: redactedTarget.fingerprint };
      }

      await writeLedgerRecord(client, fingerprint);
      await client.query("COMMIT");
      return { status: "adopted", targetFingerprint: redactedTarget.fingerprint };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }

  // mode === "rehearse" from here on. Exercises the exact same write path
  // as "apply" inside a transaction, then unconditionally rolls back —
  // COMMIT is never called anywhere in this branch, on any outcome.
  const sharedLedgerBefore = await snapshotSharedLedger(client);

  await client.query("BEGIN");
  let ledgerWriteExercised = false;
  try {
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [ADVISORY_LOCK_KEY.toString()]);

    await verifyApplicationTablesExist(client);
    await verifyIntakeBaseline(client);
    const state = await inspectLedgerState(client, fingerprint);

    if (state.kind === "conflict") throw new IntakeAdoptionError("ledger-conflict", state.detail);
    if (state.kind === "duplicate") throw new IntakeAdoptionError("ledger-duplicate", state.detail);
    if (state.kind === "partial") throw new IntakeAdoptionError("ledger-partial", state.detail);

    if (state.kind === "absent") {
      await writeLedgerRecord(client, fingerprint);
      ledgerWriteExercised = true;
    }

    // Step 7: re-query inside the transaction and prove the expected row
    // and ledger structure exist, whether just written or already present.
    const postWriteState = await inspectLedgerState(client, fingerprint);
    if (postWriteState.kind !== "already-adopted") {
      throw new IntakeAdoptionError(
        "rehearsal-verification-failed",
        `Expected the ledger to report 'already-adopted' inside the rehearsal transaction, got '${postWriteState.kind}'`,
      );
    }
  } finally {
    // Step 8: intentional, unconditional rollback — success or failure.
    await client.query("ROLLBACK");
  }

  // Step 9: fresh post-rollback verification, only reached if the try block
  // above completed without throwing (a throw propagates past this point
  // after the finally's ROLLBACK has already run).
  await verifyApplicationTablesExist(client);
  await verifyIntakeBaseline(client);

  const postRollbackState = await inspectLedgerState(client, fingerprint);
  if (postRollbackState.kind !== preState.kind) {
    throw new IntakeAdoptionError(
      "rehearsal-postrollback-mismatch",
      `Ledger state before rehearsal ('${preState.kind}') does not match ledger state after rollback ('${postRollbackState.kind}') — rollback did not fully revert the rehearsed write`,
    );
  }

  const sharedLedgerAfter = await snapshotSharedLedger(client);
  if (!sharedLedgerSnapshotsEqual(sharedLedgerBefore, sharedLedgerAfter)) {
    throw new IntakeAdoptionError(
      "rehearsal-shared-ledger-changed",
      "The shared drizzle.__drizzle_migrations ledger (voice/discovery) changed during rehearsal",
    );
  }

  return { status: "rehearsed", targetFingerprint: redactedTarget.fingerprint, ledgerWriteExercised };
}
