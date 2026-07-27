// Checkpoint A3 — pinned identity of the one candidate migration this
// utility is allowed to adopt, and the identity of the dedicated ledger it
// adopts it into. Every value here is a fingerprint of on-disk state
// generated at Checkpoint A2 (see lib/db/drizzle-intake-candidate/), not a
// live-computed value — the whole point of pinning them is that
// migrationFingerprint.ts can detect drift between "what A2 generated" and
// "what's on disk right now" before anything touches a database.
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** lib/db/ root, independent of where this module is imported from. */
export const DB_ROOT = path.join(__dirname, "..", "..");

export const CANDIDATE_MIGRATION_DIR = path.join(DB_ROOT, "drizzle-intake-candidate");
export const CANDIDATE_MIGRATION_FILENAME = "0000_talented_virginia_dare.sql";
export const CANDIDATE_JOURNAL_TAG = "0000_talented_virginia_dare";

/** sha256(file contents) using the exact algorithm drizzle-orm's
 * readMigrationFiles() uses (crypto.createHash("sha256").update(raw file
 * text).digest("hex")) — see node_modules/drizzle-orm/migrator.js. */
export const EXPECTED_MIGRATION_HASH =
  "0b84d950fabe7cbdd035f192fce6f54820d8b59d9e703fd895936d55bab0d92f";

/** journal.entries[0].when from drizzle-intake-candidate/meta/_journal.json. */
export const EXPECTED_JOURNAL_TIMESTAMP = 1785170988166;

export const APPLICATION_TABLES = ["intake_conversations", "intake_messages"] as const;

export const BASELINE_JSON_PATH = path.join(DB_ROOT, "test", "intake_production_baseline.json");

/** Dedicated ledger location. Deliberately distinct from the shared
 * `drizzle.__drizzle_migrations` table used by drizzle.voice.config.ts /
 * drizzle.discovery.config.ts, so intake adoption can never collide with,
 * read, or overwrite voice/discovery migration state. */
export const LEDGER_SCHEMA = "drizzle_intake";
export const LEDGER_TABLE = "__drizzle_migrations";

/** Named connection env var this utility requires. Deliberately NOT
 * DATABASE_URL — DATABASE_URL is never treated as an implicit production
 * (or any) connection by this utility. */
export const CONNECTION_ENV_VAR = "INTAKE_LEDGER_ADOPTION_DATABASE_URL";

/** Deterministic single-key input to pg_advisory_xact_lock(bigint), derived
 * from a fixed identifier string (see advisoryLock.ts for the derivation).
 * Pinned here so tests and the CLI agree on the exact value without
 * recomputing it, and so any drift is visible in a diff. */
export const ADVISORY_LOCK_SEED = "sitemint:intake-ledger-adoption:v1";
export const ADVISORY_LOCK_KEY = -2666824222187930119n;
