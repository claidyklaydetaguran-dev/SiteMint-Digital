// Checkpoint A3 — pure functions only. Nothing in this file touches the
// filesystem or a database.
import { createHash } from "node:crypto";
import { ADVISORY_LOCK_SEED } from "./constants";

/** Same algorithm as drizzle-orm's readMigrationFiles(): sha256 of the raw
 * migration file text, hex-encoded. Operates on a string the caller already
 * read from disk so this function stays a pure, easily-tested primitive. */
export function hashMigrationSql(rawSqlFileText: string): string {
  return createHash("sha256").update(rawSqlFileText).digest("hex");
}

/** Derives the deterministic pg_advisory_xact_lock() key from a fixed
 * identifier string: first 8 bytes of sha256(seed), read as a signed
 * big-endian 64-bit integer (matching Postgres's signed bigint lock key
 * space). Exported so tests can verify ADVISORY_LOCK_KEY in constants.ts
 * wasn't hand-typed incorrectly. */
export function deriveAdvisoryLockKey(seed: string = ADVISORY_LOCK_SEED): bigint {
  const digest = createHash("sha256").update(seed).digest();
  return digest.readBigInt64BE(0);
}

/** A non-reversible fingerprint of a connection target, safe to log:
 * sha256("host:port/dbname") truncated to 12 hex characters. Never derived
 * from (and never contains) username or password. */
export function fingerprintConnectionTarget(hostPortDb: string): string {
  return createHash("sha256").update(hostPortDb).digest("hex").slice(0, 12);
}

/** The exact value an operator must pass as --confirm to enter apply mode.
 * Derived from the redacted target fingerprint and the migration's own
 * identity (hash + journal timestamp), so a confirmation copied from one
 * target/migration can never be reused against a different one. */
export function computeConfirmationToken(
  targetFingerprint: string,
  migrationHash: string,
  journalTimestamp: number,
): string {
  const material = `${targetFingerprint}:${migrationHash}:${journalTimestamp}`;
  const digest = createHash("sha256").update(material).digest("hex").slice(0, 16);
  return `ADOPT-INTAKE-${digest}`;
}
