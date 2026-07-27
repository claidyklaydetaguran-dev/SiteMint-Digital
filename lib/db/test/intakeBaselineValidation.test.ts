/**
 * Checkpoint A2 — live dev-database structural validation.
 *
 * Connects to DATABASE_URL (the Replit Development Database only) and asserts
 * that intake_conversations and intake_messages match the literal production
 * baseline captured in intake_production_baseline.json.
 *
 * Invariants:
 *   - Read-only: no CREATE, INSERT, UPDATE, DELETE, ALTER, or DROP is issued.
 *   - Never touches the production database; DATABASE_URL must be the dev URL.
 *   - Does not validate sequence last_value (differs between prod and dev due
 *     to dev traffic; only structural sequence properties are checked).
 *   - Does not validate row counts (dev has test data; prod was empty at
 *     inspection time).
 *
 * Run via:
 *   scripts/node_modules/.bin/tsx lib/db/test/intakeBaselineValidation.test.ts
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load production baseline (static, quarantined JSON) ──────────────────────
const baseline = JSON.parse(
  readFileSync(path.join(__dirname, "intake_production_baseline.json"), "utf8"),
) as {
  _meta: Record<string, unknown>;
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

// ── Assertion infrastructure ──────────────────────────────────────────────────
let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures++;
    console.error(`  FAIL  ${message}`);
  } else {
    console.log(`  PASS  ${message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("FATAL: DATABASE_URL is not set. This test requires the Replit Development Database.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const TABLES = ["intake_conversations", "intake_messages"] as const;

    for (const tableName of TABLES) {
      console.log(`\n── ${tableName} ──`);
      const expected = baseline.tables[tableName];

      // 1. Columns
      const { rows: actualCols } = await client.query<{
        ordinal_position: number;
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT ordinal_position, column_name, data_type, udt_name,
                is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName],
      );

      assert(
        actualCols.length === expected.columns.length,
        `${tableName}: column count = ${expected.columns.length} (got ${actualCols.length})`,
      );

      for (const expCol of expected.columns) {
        const actCol = actualCols.find((c) => c.column_name === expCol.column_name);
        assert(
          actCol !== undefined,
          `${tableName}.${expCol.column_name} column exists`,
        );
        if (!actCol) continue;

        assert(
          actCol.ordinal_position === expCol.ordinal_position,
          `${tableName}.${expCol.column_name} ordinal_position = ${expCol.ordinal_position} (got ${actCol.ordinal_position})`,
        );
        assert(
          actCol.data_type === expCol.data_type,
          `${tableName}.${expCol.column_name} data_type = '${expCol.data_type}' (got '${actCol.data_type}')`,
        );
        assert(
          actCol.udt_name === expCol.udt_name,
          `${tableName}.${expCol.column_name} udt_name = '${expCol.udt_name}' (got '${actCol.udt_name}')`,
        );
        assert(
          actCol.is_nullable === expCol.is_nullable,
          `${tableName}.${expCol.column_name} is_nullable = '${expCol.is_nullable}' (got '${actCol.is_nullable}')`,
        );
        assert(
          actCol.column_default === expCol.column_default,
          `${tableName}.${expCol.column_name} column_default = ${JSON.stringify(expCol.column_default)} (got ${JSON.stringify(actCol.column_default)})`,
        );
      }

      // 2. Primary key
      const { rows: pkRows } = await client.query<{
        constraint_name: string;
        column_name: string;
      }>(
        `SELECT tc.constraint_name, kc.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kc
           ON tc.constraint_name = kc.constraint_name
          AND tc.table_schema = kc.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = 'public'
           AND tc.table_name = $1`,
        [tableName],
      );
      assert(pkRows.length === 1, `${tableName}: exactly one primary key`);
      if (pkRows.length === 1) {
        assert(
          pkRows[0].constraint_name === expected.primary_key.constraint_name,
          `${tableName}: PK constraint name = '${expected.primary_key.constraint_name}' (got '${pkRows[0].constraint_name}')`,
        );
        assert(
          pkRows[0].column_name === expected.primary_key.column_name,
          `${tableName}: PK column = '${expected.primary_key.column_name}' (got '${pkRows[0].column_name}')`,
        );
      }

      // 3. No foreign keys
      const { rows: fkRows } = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
         FROM information_schema.table_constraints
         WHERE constraint_type = 'FOREIGN KEY'
           AND table_schema = 'public'
           AND table_name = $1`,
        [tableName],
      );
      assert(
        parseInt(fkRows[0].cnt, 10) === expected.foreign_key_count,
        `${tableName}: foreign key count = ${expected.foreign_key_count} (got ${fkRows[0].cnt})`,
      );

      // 4. Indexes
      const { rows: idxRows } = await client.query<{
        indexname: string;
        indexdef: string;
      }>(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = $1
         ORDER BY indexname`,
        [tableName],
      );
      assert(
        idxRows.length === expected.indexes.length,
        `${tableName}: index count = ${expected.indexes.length} (got ${idxRows.length})`,
      );
      for (const expIdx of expected.indexes) {
        const actIdx = idxRows.find((i) => i.indexname === expIdx.indexname);
        assert(
          actIdx !== undefined,
          `${tableName}: index '${expIdx.indexname}' exists`,
        );
        if (actIdx) {
          assert(
            actIdx.indexdef === expIdx.indexdef,
            `${tableName}: index '${expIdx.indexname}' def matches production`,
          );
        }
      }

      // 5. Sequences (structural properties only — not last_value)
      for (const expSeq of expected.sequences) {
        const { rows: seqRows } = await client.query<{
          data_type: string;
          start_value: string;
          increment_by: string;
          min_value: string;
          max_value: string;
          cycle: boolean;
        }>(
          `SELECT data_type, start_value, increment_by, min_value, max_value, cycle
           FROM pg_sequences
           WHERE schemaname = 'public' AND sequencename = $1`,
          [expSeq.sequence_name],
        );
        assert(
          seqRows.length === 1,
          `sequence '${expSeq.sequence_name}' exists`,
        );
        if (seqRows.length === 1) {
          const s = seqRows[0];
          assert(
            s.data_type === expSeq.data_type,
            `sequence '${expSeq.sequence_name}' data_type = '${expSeq.data_type}' (got '${s.data_type}')`,
          );
          assert(
            s.start_value === expSeq.start_value,
            `sequence '${expSeq.sequence_name}' start_value = ${expSeq.start_value} (got ${s.start_value})`,
          );
          assert(
            s.increment_by === expSeq.increment_by,
            `sequence '${expSeq.sequence_name}' increment_by = ${expSeq.increment_by} (got ${s.increment_by})`,
          );
          assert(
            s.min_value === expSeq.min_value,
            `sequence '${expSeq.sequence_name}' min_value = ${expSeq.min_value} (got ${s.min_value})`,
          );
          assert(
            s.max_value === expSeq.max_value,
            `sequence '${expSeq.sequence_name}' max_value = ${expSeq.max_value} (got ${s.max_value})`,
          );
          assert(
            s.cycle === expSeq.cycle,
            `sequence '${expSeq.sequence_name}' cycle = ${expSeq.cycle} (got ${s.cycle})`,
          );
        }
      }
    }
  } finally {
    await client.end();
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} baseline validation assertion(s) failed.`);
    process.exit(1);
  }
  console.log("All baseline validation assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
