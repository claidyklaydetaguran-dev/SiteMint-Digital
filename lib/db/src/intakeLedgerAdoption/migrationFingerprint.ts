// Checkpoint A3 — verifies that the candidate migration on disk is exactly
// the one A2 generated and this utility is pinned to, before anything else
// happens. Filesystem-only; never opens a database connection.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CANDIDATE_JOURNAL_TAG,
  CANDIDATE_MIGRATION_DIR,
  CANDIDATE_MIGRATION_FILENAME,
  EXPECTED_JOURNAL_TIMESTAMP,
  EXPECTED_MIGRATION_HASH,
} from "./constants";
import { hashMigrationSql } from "./crypto";
import { IntakeAdoptionError } from "./types";

export interface MigrationFingerprint {
  filename: string;
  sql: string;
  hash: string;
  journalTimestamp: number;
}

interface Journal {
  entries: Array<{ tag: string; when: number }>;
}

export interface FingerprintVerificationInputs {
  dir: string;
  journalTag: string;
  filename: string;
  expectedHash: string;
  expectedJournalTimestamp: number;
}

const DEFAULT_INPUTS: FingerprintVerificationInputs = {
  dir: CANDIDATE_MIGRATION_DIR,
  journalTag: CANDIDATE_JOURNAL_TAG,
  filename: CANDIDATE_MIGRATION_FILENAME,
  expectedHash: EXPECTED_MIGRATION_HASH,
  expectedJournalTimestamp: EXPECTED_JOURNAL_TIMESTAMP,
};

/** Reads the candidate migration + its journal entry from disk and asserts
 * every identifying fact (filename, hash, journal timestamp) matches the
 * pinned Checkpoint A2 fingerprint. Throws IntakeAdoptionError on any
 * mismatch rather than silently adopting drifted content.
 *
 * Accepts an optional override of every pinned input so tests can point it
 * at fixture directories/expectations without touching the real candidate
 * migration on disk; production code always calls it with zero arguments. */
export function loadAndVerifyMigrationFingerprint(
  overrides: Partial<FingerprintVerificationInputs> = {},
): MigrationFingerprint {
  const inputs = { ...DEFAULT_INPUTS, ...overrides };

  const journalPath = path.join(inputs.dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;

  if (journal.entries.length !== 1) {
    throw new IntakeAdoptionError(
      "journal-shape-mismatch",
      `Expected exactly 1 journal entry, found ${journal.entries.length}`,
    );
  }
  const [entry] = journal.entries;
  if (entry.tag !== inputs.journalTag) {
    throw new IntakeAdoptionError(
      "filename-mismatch",
      `Journal tag '${entry.tag}' does not match expected '${inputs.journalTag}'`,
    );
  }
  if (entry.when !== inputs.expectedJournalTimestamp) {
    throw new IntakeAdoptionError(
      "journal-timestamp-mismatch",
      `Journal timestamp ${entry.when} does not match pinned ${inputs.expectedJournalTimestamp}`,
    );
  }

  const sqlPath = path.join(inputs.dir, `${inputs.journalTag}.sql`);
  const sql = readFileSync(sqlPath, "utf8");
  const hash = hashMigrationSql(sql);
  if (hash !== inputs.expectedHash) {
    throw new IntakeAdoptionError(
      "migration-hash-mismatch",
      `Candidate SQL hash ${hash} does not match pinned ${inputs.expectedHash}`,
    );
  }

  return {
    filename: inputs.filename,
    sql,
    hash,
    journalTimestamp: entry.when,
  };
}
