/**
 * V5 PR-8 — committed contract tests for the Issues screen.
 * Run via: tsx artifacts/helpdesk/src/pages/issues/issuesContract.test.ts
 */
import { COPY, PAGE, everyRenderableString, levelLabel } from "./issuesContract.js";

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean): void {
  if (condition) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}`); }
}
function eq<T>(label: string, actual: T, expected: T): void {
  check(`${label} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}
function section(name: string): void { console.log(`\n── ${name} ${"─".repeat(Math.max(0, 66 - name.length))}`); }

section("Level labels");

eq("info", levelLabel("info"), "Info");
eq("warning", levelLabel("warning"), "Warning");
eq("error", levelLabel("error"), "Error");
eq("critical", levelLabel("critical"), "Critical");
eq("an unrecognised level is stated, never invented", levelLabel("mystery"), "Notice");

section("String surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
check("the all-clear title is present", strings.includes(COPY.allClearTitle));
check("the resolve confirmation names the real consequence", strings.includes(COPY.resolveConfirmDetail));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Issues contract tests passed.");
