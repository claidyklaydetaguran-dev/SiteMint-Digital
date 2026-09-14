/**
 * A destructive test helper must never be able to run against a real database.
 *
 * Several suites clear whole tables in setup — one of them empties `crm_staff`
 * outright, because it needs a zero-staff database to exercise the bootstrap
 * path. Against `crm_preview` that deletes the owner accounts somebody actually
 * signs in with, including the real one.
 *
 * The protection used to be "whoever runs it exports the right
 * CRM_TEST_DATABASE_URL". This pins the replacement, and the source scan is the
 * part that matters: it fails when a NEW unqualified delete appears without the
 * guard, which is how this would otherwise come back.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");

function everyTestFile(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { everyTestFile(full, out); continue; }
    if (entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/**
 * An unqualified delete: `db.delete(table)` with no `.where(...)` after it.
 * Matching on the absence of `.where` on the same line is exact here, because
 * drizzle's builder puts them together — a qualified delete never wraps.
 */
const UNQUALIFIED_DELETE = /\bdb\.delete\((?:schema\.)?[A-Za-z_][A-Za-z0-9_]*\)\s*;/;
const TRUNCATE = /\bTRUNCATE\b/i;

describe("destructive test cleanup is guarded", () => {
  const files = everyTestFile(SRC);

  it("finds the suites to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("every file that wipes a whole table asserts the database is disposable", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const wipes = UNQUALIFIED_DELETE.test(source) || TRUNCATE.test(source);
      if (!wipes) continue;
      if (source.includes("assertDisposableDatabase")) continue;
      // This file itself contains the patterns as string literals.
      if (file.endsWith("disposableDatabase.test.ts")) continue;
      offenders.push(file.slice(SRC.length + 1).replace(/\\/g, "/"));
    }

    expect(
      offenders,
      "these suites clear whole tables without asserting the database is disposable, "
        + "so pointing them at crm_preview would delete real accounts:\n  "
        + offenders.join("\n  ")
        + "\nAdd: await assertDisposableDatabase(\"<suite> cleanup\") before the deletes.",
    ).toEqual([]);
  });

  it("keeps the owner preview off the disposable list", async () => {
    // The whole point. If crm_preview is ever added here, the guard stops
    // guarding the one database it exists to protect.
    const { DISPOSABLE_DATABASES } = await import("./disposableDatabase.js");
    expect(DISPOSABLE_DATABASES).not.toContain("crm_preview");
    expect(DISPOSABLE_DATABASES).toContain("crm_test");
  });
});
