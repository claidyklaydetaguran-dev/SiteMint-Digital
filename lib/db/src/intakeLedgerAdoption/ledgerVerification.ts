// Checkpoint A3 — dedicated intake migration ledger (schema
// LEDGER_SCHEMA / table LEDGER_TABLE, see constants.ts). Every statement
// here targets only that schema/table, never intake_conversations or
// intake_messages, and never the shared `drizzle.__drizzle_migrations`
// ledger used by voice/discovery.
//
// The table shape (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at
// bigint) mirrors drizzle-orm's own PgDialect.migrate() ledger table
// exactly (see node_modules/drizzle-orm/pg-core/dialect.js), so a row
// written here is byte-for-byte what a real `drizzle-kit migrate` run
// against this schema/table would have written — this utility just never
// executes the CREATE TABLE statement to get there.
import { LEDGER_SCHEMA, LEDGER_TABLE } from "./constants";
import type { MigrationFingerprint } from "./migrationFingerprint";
import { AdoptionDbClient } from "./types";

export type LedgerState =
  | { kind: "absent" }
  | { kind: "already-adopted" }
  | { kind: "conflict"; detail: string }
  | { kind: "duplicate"; detail: string }
  | { kind: "partial"; detail: string };

interface LedgerRow {
  id: number;
  hash: string | null;
  created_at: string | number | null;
}

/** Read-only inspection of the dedicated ledger's current state relative to
 * the pinned migration fingerprint. Never writes. */
export async function inspectLedgerState(
  client: AdoptionDbClient,
  fingerprint: MigrationFingerprint,
): Promise<LedgerState> {
  const { rows: schemaRows } = await client.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
    [LEDGER_SCHEMA],
  );
  if (schemaRows.length === 0) {
    return { kind: "absent" };
  }

  const { rows: tableRows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [LEDGER_SCHEMA, LEDGER_TABLE],
  );
  if (tableRows.length === 0) {
    return { kind: "absent" };
  }

  const { rows: colRows } = await client.query<{ column_name: string; data_type: string; is_nullable: string }>(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [LEDGER_SCHEMA, LEDGER_TABLE],
  );
  const byName = new Map(colRows.map((c) => [c.column_name, c]));
  const hashCol = byName.get("hash");
  const createdAtCol = byName.get("created_at");
  const idCol = byName.get("id");
  const shapeOk =
    idCol !== undefined &&
    hashCol?.data_type === "text" &&
    hashCol.is_nullable === "NO" &&
    createdAtCol?.data_type === "bigint";
  if (!shapeOk) {
    return {
      kind: "partial",
      detail: `${LEDGER_SCHEMA}.${LEDGER_TABLE} exists but does not have the expected (id, hash text not null, created_at bigint) shape`,
    };
  }

  const { rows } = await client.query<LedgerRow>(
    `SELECT id, hash, created_at FROM ${LEDGER_SCHEMA}.${LEDGER_TABLE} ORDER BY id`,
  );

  if (rows.length === 0) {
    return { kind: "absent" };
  }
  if (rows.length > 1) {
    return { kind: "duplicate", detail: `${rows.length} rows present; expected at most 1` };
  }

  const [row] = rows;
  if (row.hash === null || row.created_at === null) {
    return { kind: "partial", detail: `single ledger row has null hash or created_at` };
  }
  const rowCreatedAt = typeof row.created_at === "string" ? Number(row.created_at) : row.created_at;
  if (row.hash !== fingerprint.hash || rowCreatedAt !== fingerprint.journalTimestamp) {
    return {
      kind: "conflict",
      detail: `existing ledger row (hash=${row.hash}, created_at=${rowCreatedAt}) does not match the pinned migration (hash=${fingerprint.hash}, created_at=${fingerprint.journalTimestamp})`,
    };
  }
  return { kind: "already-adopted" };
}

/** Writes exactly one baseline adoption record. Must only ever be called
 * from within an apply-mode transaction holding the advisory lock, and only
 * after inspectLedgerState() returned "absent". Never touches
 * intake_conversations/intake_messages and never executes the candidate
 * migration's CREATE TABLE statements. */
export async function writeLedgerRecord(
  client: AdoptionDbClient,
  fingerprint: MigrationFingerprint,
): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${LEDGER_SCHEMA}`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${LEDGER_SCHEMA}.${LEDGER_TABLE} (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`,
  );
  await client.query(
    `INSERT INTO ${LEDGER_SCHEMA}.${LEDGER_TABLE} ("hash", "created_at") VALUES ($1, $2)`,
    [fingerprint.hash, fingerprint.journalTimestamp],
  );
}
