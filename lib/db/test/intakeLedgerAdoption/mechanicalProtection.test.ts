/**
 * Checkpoint A3 — static source-text scans that mechanically guarantee the
 * guarded adoption utility cannot execute the candidate CREATE TABLE
 * statements, cannot write to the two intake application tables, is not
 * wired into any ordinary drizzle-kit/drizzle-orm migration command, and is
 * not exposed as an accidentally-runnable package.json script. No database
 * connection and no module execution beyond static text inspection happens
 * in this file (mirrors the approach in intakeOwnershipContract.test.ts).
 * Run via:
 *   pnpm --filter @workspace/scripts exec tsx lib/db/test/intakeLedgerAdoption/mechanicalProtection.test.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, finish } from "./testHarness";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.join(__dirname, "..", "..");
const srcDir = path.join(dbRoot, "src", "intakeLedgerAdoption");

/** Strips // line comments and /* block comments so prose that *mentions*
 * SQL keywords or table names (to explain why they're absent) isn't
 * mistaken for actual code using them. Safe here because none of this
 * utility's SQL template literals contain `//` or `/*`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const sourceFiles = readdirSync(srcDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => {
    const raw = readFileSync(path.join(srcDir, f), "utf8");
    return { name: f, text: stripComments(raw) };
  });

function combinedSource(): string {
  return sourceFiles.map((f) => f.text).join("\n");
}

async function main(): Promise<void> {
  // ── No write verbs against the application tables anywhere in the utility ─
  const writeVerbPattern = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE)\b/gi;
  for (const file of sourceFiles) {
    const matches = [...file.text.matchAll(writeVerbPattern)];
    for (const m of matches) {
      const windowStart = Math.max(0, m.index! - 200);
      const windowEnd = Math.min(file.text.length, m.index! + 200);
      const window = file.text.slice(windowStart, windowEnd);
      const touchesApplicationTables =
        window.includes("intake_conversations") || window.includes("intake_messages");
      check(
        `${file.name}: write verb '${m[0]}' near offset ${m.index} does not reference an application table`,
        !touchesApplicationTables,
      );
    }
  }

  // ── The candidate's literal CREATE TABLE statements never appear as
  // executable strings anywhere in the utility (only as read/hash targets) ──
  for (const file of sourceFiles) {
    check(
      `${file.name}: does not contain the literal candidate CREATE TABLE statement text`,
      !file.text.includes('CREATE TABLE "intake_conversations"') &&
        !file.text.includes('CREATE TABLE "intake_messages"'),
    );
  }

  // ── The only *executable* SQL passed to .query(...) anywhere that
  // mentions CREATE TABLE targets the dedicated ledger. Anchored to
  // `.query(` specifically (rather than any backtick pair) so unrelated
  // template-literal strings elsewhere in the same file — e.g. cli.ts's
  // human-readable log messages, which also happen to use backticks and may
  // mention "CREATE TABLE" in prose — can never be mistaken for it. ───────
  const queryArgPattern = /\.query\(\s*`([^`]*)`/gs;
  const createTableQueryArgs = [...combinedSource().matchAll(queryArgPattern)]
    .map((m) => m[1])
    .filter((sqlArg) => sqlArg.includes("CREATE TABLE"));
  check("exactly one .query(...) call's SQL literal contains CREATE TABLE", createTableQueryArgs.length === 1);
  if (createTableQueryArgs[0]) {
    check(
      "that CREATE TABLE SQL literal targets the dedicated ledger table, not an application table",
      createTableQueryArgs[0].includes("LEDGER_SCHEMA") &&
        !createTableQueryArgs[0].includes("intake_conversations") &&
        !createTableQueryArgs[0].includes("intake_messages"),
    );
  }

  // ── No import of drizzle-orm's migrate() or drizzle-kit's CLI ────────────
  const combined = combinedSource();
  check("utility never imports drizzle-orm's migrate() function", !/from\s+["']drizzle-orm\/[^"']*migrator["']/.test(combined));
  check("utility never imports drizzle-kit", !/from\s+["']drizzle-kit["']/.test(combined));
  check("utility source never calls a function literally named migrate(", !/\bmigrate\s*\(/.test(combined));

  // ── CLI never falls back to DATABASE_URL ──────────────────────────────────
  const cliSource = sourceFiles.find((f) => f.name === "cli.ts")!.text;
  check(
    "cli.ts never reads process.env.DATABASE_URL",
    !/process\.env(\.DATABASE_URL|\[["']DATABASE_URL["']\])/.test(cliSource),
  );
  check("cli.ts reads the named env var via CONNECTION_ENV_VAR, not a hardcoded string", cliSource.includes("CONNECTION_ENV_VAR"));

  // ── No credentials or connection strings ever logged ─────────────────────
  for (const file of sourceFiles) {
    check(
      `${file.name}: never logs a raw connectionString/connection string variable`,
      !/console\.(log|error)\([^)]*connectionString/i.test(file.text),
    );
  }

  // ── package.json has no migrate:intake / check:intake scripts, and no
  // script references this utility's cli.ts at all ─────────────────────────
  const packageJson = JSON.parse(readFileSync(path.join(dbRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};
  check("package.json has no migrate:intake script", !("migrate:intake" in scripts));
  check("package.json has no check:intake script", !("check:intake" in scripts));
  check(
    "no package.json script references intakeLedgerAdoption/cli.ts",
    Object.values(scripts).every((cmd) => !cmd.includes("intakeLedgerAdoption")),
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
