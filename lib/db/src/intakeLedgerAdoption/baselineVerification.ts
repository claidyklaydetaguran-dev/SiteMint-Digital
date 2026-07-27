// Checkpoint A3 — read-only structural verification of the two intake
// application tables against the literal production baseline captured at
// Checkpoint A2 (test/intake_production_baseline.json). Every query here is
// a SELECT against information_schema/pg_indexes/pg_sequences; nothing in
// this file ever issues CREATE, INSERT, UPDATE, DELETE, ALTER, or DROP, and
// nothing here ever references intake_conversations/intake_messages in
// anything other than a WHERE clause.
import { readFileSync } from "node:fs";
import { APPLICATION_TABLES, BASELINE_JSON_PATH } from "./constants";
import { AdoptionDbClient, IntakeAdoptionError } from "./types";

interface BaselineColumn {
  ordinal_position: number;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

interface BaselineTable {
  columns: BaselineColumn[];
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

interface Baseline {
  tables: Record<string, BaselineTable>;
}

function loadBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_JSON_PATH, "utf8")) as Baseline;
}

/** Confirms both application tables exist in `public` before any deeper
 * inspection runs. Read-only (information_schema.tables SELECT). */
export async function verifyApplicationTablesExist(client: AdoptionDbClient): Promise<void> {
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [APPLICATION_TABLES as unknown as string[]],
  );
  const found = new Set(rows.map((r) => r.table_name));
  const missing = APPLICATION_TABLES.filter((t) => !found.has(t));
  if (missing.length > 0) {
    throw new IntakeAdoptionError(
      "application-tables-missing",
      `Missing intake application table(s): ${missing.join(", ")}`,
    );
  }
}

/** Verifies intake_conversations and intake_messages match the pinned
 * production baseline exactly (columns, primary key, absence of foreign
 * keys, indexes, sequence structure). Throws on the first mismatch found;
 * the message identifies exactly what didn't match. */
export async function verifyIntakeBaseline(client: AdoptionDbClient): Promise<void> {
  const baseline = loadBaseline();

  for (const tableName of APPLICATION_TABLES) {
    const expected = baseline.tables[tableName];
    if (!expected) {
      throw new IntakeAdoptionError(
        "baseline-definition-missing",
        `No baseline entry for table '${tableName}'`,
      );
    }

    const { rows: actualCols } = await client.query<BaselineColumn>(
      `SELECT ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName],
    );
    if (actualCols.length !== expected.columns.length) {
      throw new IntakeAdoptionError(
        "baseline-schema-mismatch",
        `${tableName}: expected ${expected.columns.length} columns, found ${actualCols.length}`,
      );
    }
    for (const expCol of expected.columns) {
      const actCol = actualCols.find((c) => c.column_name === expCol.column_name);
      if (!actCol) {
        throw new IntakeAdoptionError(
          "baseline-schema-mismatch",
          `${tableName}.${expCol.column_name}: column missing`,
        );
      }
      const mismatches: string[] = [];
      if (actCol.ordinal_position !== expCol.ordinal_position) mismatches.push("ordinal_position");
      if (actCol.data_type !== expCol.data_type) mismatches.push("data_type");
      if (actCol.udt_name !== expCol.udt_name) mismatches.push("udt_name");
      if (actCol.is_nullable !== expCol.is_nullable) mismatches.push("is_nullable");
      if (actCol.column_default !== expCol.column_default) mismatches.push("column_default");
      if (mismatches.length > 0) {
        throw new IntakeAdoptionError(
          "baseline-schema-mismatch",
          `${tableName}.${expCol.column_name}: mismatch on ${mismatches.join(", ")}`,
        );
      }
    }

    const { rows: pkRows } = await client.query<{ constraint_name: string; column_name: string }>(
      `SELECT tc.constraint_name, kc.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kc
         ON tc.constraint_name = kc.constraint_name AND tc.table_schema = kc.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = $1`,
      [tableName],
    );
    if (
      pkRows.length !== 1 ||
      pkRows[0].constraint_name !== expected.primary_key.constraint_name ||
      pkRows[0].column_name !== expected.primary_key.column_name
    ) {
      throw new IntakeAdoptionError("baseline-schema-mismatch", `${tableName}: primary key mismatch`);
    }

    const { rows: fkRows } = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM information_schema.table_constraints
       WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public' AND table_name = $1`,
      [tableName],
    );
    if (parseInt(fkRows[0]?.cnt ?? "-1", 10) !== expected.foreign_key_count) {
      throw new IntakeAdoptionError("baseline-schema-mismatch", `${tableName}: foreign key count mismatch`);
    }

    const { rows: idxRows } = await client.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`,
      [tableName],
    );
    if (idxRows.length !== expected.indexes.length) {
      throw new IntakeAdoptionError("baseline-schema-mismatch", `${tableName}: index count mismatch`);
    }
    for (const expIdx of expected.indexes) {
      const actIdx = idxRows.find((i) => i.indexname === expIdx.indexname);
      if (!actIdx || actIdx.indexdef !== expIdx.indexdef) {
        throw new IntakeAdoptionError(
          "baseline-schema-mismatch",
          `${tableName}: index '${expIdx.indexname}' missing or definition mismatch`,
        );
      }
    }

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
         FROM pg_sequences WHERE schemaname = 'public' AND sequencename = $1`,
        [expSeq.sequence_name],
      );
      if (seqRows.length !== 1) {
        throw new IntakeAdoptionError(
          "baseline-schema-mismatch",
          `sequence '${expSeq.sequence_name}' missing`,
        );
      }
      const s = seqRows[0];
      const mismatches: string[] = [];
      if (s.data_type !== expSeq.data_type) mismatches.push("data_type");
      if (s.start_value !== expSeq.start_value) mismatches.push("start_value");
      if (s.increment_by !== expSeq.increment_by) mismatches.push("increment_by");
      if (s.min_value !== expSeq.min_value) mismatches.push("min_value");
      if (s.max_value !== expSeq.max_value) mismatches.push("max_value");
      if (s.cycle !== expSeq.cycle) mismatches.push("cycle");
      if (mismatches.length > 0) {
        throw new IntakeAdoptionError(
          "baseline-schema-mismatch",
          `sequence '${expSeq.sequence_name}': mismatch on ${mismatches.join(", ")}`,
        );
      }
    }
  }
}
