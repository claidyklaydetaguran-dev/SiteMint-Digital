// Checkpoint A3 — read-only snapshot of the shared drizzle.__drizzle_migrations
// ledger (used by drizzle.voice.config.ts and drizzle.discovery.config.ts,
// which both use drizzle-kit's default migrationsSchema/migrationsTable).
// This utility never writes to schema `drizzle` — it exists solely so
// rehearsal mode can prove, before and after its rolled-back transaction,
// that voice/discovery ledger state was never touched.
import { AdoptionDbClient } from "./types";

export interface SharedLedgerSnapshot {
  exists: boolean;
  rowCount: number;
}

export async function snapshotSharedLedger(client: AdoptionDbClient): Promise<SharedLedgerSnapshot> {
  const { rows: tableRows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'`,
  );
  if (tableRows.length === 0) {
    return { exists: false, rowCount: 0 };
  }
  const { rows } = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM drizzle.__drizzle_migrations`,
  );
  return { exists: true, rowCount: parseInt(rows[0]?.cnt ?? "0", 10) };
}

export function sharedLedgerSnapshotsEqual(a: SharedLedgerSnapshot, b: SharedLedgerSnapshot): boolean {
  return a.exists === b.exists && a.rowCount === b.rowCount;
}
