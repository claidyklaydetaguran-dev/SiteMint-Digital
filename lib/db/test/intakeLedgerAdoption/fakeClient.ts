// Checkpoint A3 — in-memory fake implementing AdoptionDbClient, used by all
// intakeLedgerAdoption tests. Never opens a socket, never imports `pg`.
// Not a test file itself; imported by the ones in this directory.
import { readFileSync } from "node:fs";
import { AdoptionDbClient } from "../../src/intakeLedgerAdoption/types";
import { BASELINE_JSON_PATH } from "../../src/intakeLedgerAdoption/constants";

type LedgerRow = { id: number; hash: string | null; created_at: number | null };

export interface FakeClientOptions {
  /** Whether the two application tables should appear to exist. */
  tablesExist?: boolean;
  /** table name -> column name -> partial field overrides, applied on top of a
   * baseline-perfect column snapshot to simulate schema drift. */
  columnOverrides?: Record<string, Record<string, Record<string, unknown>>>;
  /** Pre-seeded rows in the dedicated ledger table. */
  ledgerRows?: LedgerRow[];
  /** Whether the ledger schema/table should appear to already exist (independent of ledgerRows). */
  ledgerTableExists?: boolean;
  /** If set, an unexpected ledger table column shape is simulated (e.g. hash nullable). */
  ledgerTableShape?: "expected" | "unexpected";
  /** Whether the shared drizzle.__drizzle_migrations ledger (voice/discovery) appears to exist. */
  sharedLedgerExists?: boolean;
  /** Row count reported for the shared ledger. */
  sharedLedgerRowCount?: number;
}

const baseline = JSON.parse(readFileSync(BASELINE_JSON_PATH, "utf8")) as {
  tables: Record<
    string,
    {
      columns: Array<{
        ordinal_position: number;
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
        column_default: string | null;
      }>;
      primary_key: { constraint_name: string; column_name: string };
      foreign_key_count: number;
      indexes: Array<{ indexname: string; indexdef: string }>;
      sequences: Array<{
        sequence_name: string;
        data_type: string;
        start_value: string;
        increment_by: string;
        min_value: string;
        max_value: string;
        cycle: boolean;
      }>;
    }
  >;
};

/** Records every query issued, in order, so tests can assert on
 * transaction/lock usage (BEGIN, advisory lock, COMMIT/ROLLBACK order). */
/** Snapshot of every piece of state a real Postgres transaction would roll
 * back: row data, the id sequence's *logical* position for this fake (real
 * Postgres sequences are NOT rolled back, but that only affects id gaps,
 * never correctness — see adopt.ts), and DDL-visible existence flags. */
interface TxSnapshot {
  ledgerRows: LedgerRow[];
  nextId: number;
  ledgerTableExists: boolean;
}

export class FakeAdoptionClient implements AdoptionDbClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] | undefined }> = [];
  private ledgerRows: LedgerRow[];
  private nextId = 1;
  private opts: FakeClientOptions;
  private txSnapshot: TxSnapshot | null = null;

  constructor(opts: FakeClientOptions = {}) {
    this.opts = {
      tablesExist: true,
      ledgerTableExists: false,
      ledgerTableShape: "expected",
      sharedLedgerExists: false,
      sharedLedgerRowCount: 0,
      ...opts,
    };
    this.ledgerRows = [...(opts.ledgerRows ?? [])];
    this.nextId = this.ledgerRows.length > 0 ? Math.max(...this.ledgerRows.map((r) => r.id)) + 1 : 1;
  }

  /** Lets a test mutate the shared ledger mid-run to simulate a concurrent
   * voice/discovery migration, proving rehearsal's drift detection works. */
  setSharedLedgerRowCount(n: number): void {
    this.opts.sharedLedgerRowCount = n;
  }

  async query<Row extends object = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: Row[] }> {
    this.calls.push({ text, params });
    const sql = text.trim().replace(/\s+/g, " ");

    if (sql === "BEGIN") {
      this.txSnapshot = {
        ledgerRows: this.ledgerRows.map((r) => ({ ...r })),
        nextId: this.nextId,
        ledgerTableExists: Boolean(this.opts.ledgerTableExists),
      };
      return { rows: [] as Row[] };
    }
    if (sql === "COMMIT") {
      this.txSnapshot = null;
      return { rows: [] as Row[] };
    }
    if (sql === "ROLLBACK") {
      if (this.txSnapshot) {
        this.ledgerRows = this.txSnapshot.ledgerRows;
        this.nextId = this.txSnapshot.nextId;
        this.opts.ledgerTableExists = this.txSnapshot.ledgerTableExists;
        this.txSnapshot = null;
      }
      return { rows: [] as Row[] };
    }
    if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
      return { rows: [] as Row[] };
    }

    if (sql.includes("table_schema = 'drizzle'") && sql.includes("table_name = '__drizzle_migrations'")) {
      return {
        rows: this.opts.sharedLedgerExists ? [{ table_name: "__drizzle_migrations" }] : ([] as Row[]),
      } as { rows: Row[] };
    }
    if (sql.includes("FROM drizzle.__drizzle_migrations")) {
      return { rows: [{ cnt: String(this.opts.sharedLedgerRowCount ?? 0) }] as unknown as Row[] };
    }

    if (sql.includes("FROM information_schema.tables") && sql.includes("table_name = ANY")) {
      const names = this.opts.tablesExist ? ["intake_conversations", "intake_messages"] : [];
      return { rows: names.map((table_name) => ({ table_name })) as unknown as Row[] };
    }

    if (sql.includes("FROM information_schema.columns") && sql.includes("$1") && params && params.length === 1) {
      const tableName = params[0] as string;
      const table = baseline.tables[tableName];
      const overrides = this.opts.columnOverrides?.[tableName] ?? {};
      const rows = table.columns.map((c) => ({ ...c, ...(overrides[c.column_name] ?? {}) }));
      return { rows: rows as unknown as Row[] };
    }

    if (sql.includes("FROM information_schema.table_constraints tc")) {
      const tableName = params?.[0] as string;
      const table = baseline.tables[tableName];
      return {
        rows: [{ constraint_name: table.primary_key.constraint_name, column_name: table.primary_key.column_name }] as unknown as Row[],
      };
    }

    if (sql.includes("constraint_type = 'FOREIGN KEY'")) {
      const tableName = params?.[0] as string;
      const table = baseline.tables[tableName];
      return { rows: [{ cnt: String(table.foreign_key_count) }] as unknown as Row[] };
    }

    if (sql.includes("FROM pg_indexes")) {
      const tableName = params?.[0] as string;
      const table = baseline.tables[tableName];
      return { rows: table.indexes as unknown as Row[] };
    }

    if (sql.includes("FROM pg_sequences")) {
      const seqName = params?.[0] as string;
      for (const table of Object.values(baseline.tables)) {
        const seq = table.sequences.find((s) => s.sequence_name === seqName);
        if (seq) return { rows: [seq] as unknown as Row[] };
      }
      return { rows: [] as Row[] };
    }

    if (sql.includes("FROM information_schema.schemata")) {
      return { rows: this.opts.ledgerTableExists ? [{ schema_name: "drizzle_intake" }] : ([] as Row[]) } as {
        rows: Row[];
      };
    }

    if (sql.includes("FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2")) {
      return {
        rows: this.opts.ledgerTableExists ? [{ table_name: "__drizzle_migrations" }] : ([] as Row[]),
      } as { rows: Row[] };
    }

    if (sql.includes("FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2")) {
      if (!this.opts.ledgerTableExists) return { rows: [] as Row[] };
      if (this.opts.ledgerTableShape === "unexpected") {
        return {
          rows: [
            { column_name: "id", data_type: "integer", is_nullable: "NO" },
            { column_name: "hash", data_type: "text", is_nullable: "YES" },
          ] as unknown as Row[],
        };
      }
      return {
        rows: [
          { column_name: "id", data_type: "integer", is_nullable: "NO" },
          { column_name: "hash", data_type: "text", is_nullable: "NO" },
          { column_name: "created_at", data_type: "bigint", is_nullable: "YES" },
        ] as unknown as Row[],
      };
    }

    if (sql.startsWith("SELECT id, hash, created_at FROM")) {
      return { rows: this.ledgerRows as unknown as Row[] };
    }

    if (sql.startsWith("CREATE SCHEMA IF NOT EXISTS")) {
      this.opts.ledgerTableExists = true;
      return { rows: [] as Row[] };
    }
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) {
      return { rows: [] as Row[] };
    }
    if (sql.startsWith("INSERT INTO")) {
      const [hash, created_at] = params as [string, number];
      this.ledgerRows.push({ id: this.nextId++, hash, created_at });
      return { rows: [] as Row[] };
    }

    throw new Error(`FakeAdoptionClient: unhandled query: ${sql}`);
  }

  getLedgerRows(): readonly LedgerRow[] {
    return this.ledgerRows;
  }
}
