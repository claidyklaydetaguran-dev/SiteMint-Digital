// Checkpoint A3 — guarded intake baseline ledger adoption orchestrator.
//
// Defaults to dry-run. Never executes the candidate migration's CREATE
// TABLE statements. Never writes to intake_conversations or
// intake_messages — the only write path (writeLedgerRecord, from
// ledgerVerification.ts) touches exclusively the dedicated
// drizzle_intake.__drizzle_migrations ledger, inside a transaction holding
// a deterministic advisory lock, and only after every read-only guard below
// has passed AND an explicit apply flag AND an exact confirmation token
// have both been supplied by the caller.
import {
  verifyApplicationTablesExist,
  verifyIntakeBaseline,
} from "./baselineVerification";
import { ADVISORY_LOCK_KEY } from "./constants";
import { computeConfirmationToken } from "./crypto";
import { inspectLedgerState, writeLedgerRecord } from "./ledgerVerification";
import { loadAndVerifyMigrationFingerprint } from "./migrationFingerprint";
import type { RedactedTarget } from "./redact";
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

  // mode === "apply" from here on.
  if (options.confirmation !== confirmationToken) {
    throw new IntakeAdoptionError(
      "wrong-confirmation",
      "Provided --confirm value does not match the expected confirmation token for this target and migration",
    );
  }

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
