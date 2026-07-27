/**
 * Runs the api-server's legacy standalone test files (artifacts/api-server/test/*.test.ts).
 * These predate the Vitest setup and are not Vitest suites — each is a
 * self-contained script that prints PASS/FAIL lines and calls
 * process.exit(1) on any failure. Each is run in its own tsx process to
 * match the header comment already in every file ("Run via: pnpm --filter
 * @workspace/scripts exec tsx ...") and to avoid cross-file state leaking
 * through shared module singletons (e.g. rate limiters).
 *
 * discoveryLegacyRoute.test.ts additionally requires DATABASE_URL and
 * RESEND_API_KEY to be set to harmless dummy values purely so module-scope
 * client construction doesn't throw before the test's own monkey-patches
 * take effect; no real connection is ever attempted (see that file's header).
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const legacyTestDir = path.resolve(scriptsDir, "../../artifacts/api-server/test");

const files = readdirSync(legacyTestDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort();

if (files.length === 0) {
  console.error(`No legacy test files found in ${legacyTestDir}`);
  process.exit(1);
}

const dummyEnv = {
  DATABASE_URL: "postgres://test:test@127.0.0.1:1/test_never_connects",
  RESEND_API_KEY: "test-only-dummy-key",
};

let failed = 0;
for (const file of files) {
  const fullPath = path.join(legacyTestDir, file);
  console.log(`\n--- ${file} ---`);
  const result = spawnSync(process.execPath, ["--import", "tsx", fullPath], {
    stdio: "inherit",
    env: { ...process.env, ...dummyEnv },
  });
  if (result.status !== 0) {
    failed++;
    console.error(`--- ${file} FAILED (exit ${result.status}) ---`);
  }
}

console.log(`\nLegacy api-server tests: ${files.length - failed}/${files.length} files passed.`);
if (failed > 0) {
  process.exit(1);
}
