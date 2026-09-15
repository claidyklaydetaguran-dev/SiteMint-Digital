/**
 * V5 PR-8 — committed contract tests for the Issues screen.
 * Run via: tsx artifacts/helpdesk/src/pages/issues/issuesContract.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COPY, PAGE, canResolve, everyRenderableString, levelLabel } from "./issuesContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");
const pageSrc = read("artifacts/helpdesk/src/pages/Issues.tsx");
const monitoringRouteSrc = read("artifacts/api-server/src/routes/receptionistMonitoring.ts");
const issueServiceSrc = read("artifacts/api-server/src/lib/voiceIssues/voiceIssueService.ts");

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

section("Only customer-actionable issues offer Resolve");

// A customer could "resolve" billing_suspended or usage_pause_requested, which
// only hid an operator-level issue from the list an operator shares with them.
check("an issue the server marks resolvable offers Resolve", canResolve({ customerResolvable: true }));
check("an issue the server marks operator-only does not", !canResolve({ customerResolvable: false }));
check("a missing flag is treated as operator-only, never guessed", !canResolve({}));
check("the page gates the Resolve action on canResolve", pageSrc.includes("canResolve(issue) ? ("));
check("an operator-only issue shows a note instead", pageSrc.includes("COPY.operatorOnlyNote"));
check("the server sends the flag the page reads", monitoringRouteSrc.includes("customerResolvable: isCustomerResolvableIssueCode(issue.code)"));
check("the server refuses operator-only codes with 403", /decision === "operator_only"[\s\S]{0,80}res\.status\(403\)/.test(monitoringRouteSrc));
const allowlist = /CUSTOMER_RESOLVABLE_ISSUE_CODES = \[([\s\S]*?)\]/.exec(issueServiceSrc)?.[1] ?? "";
check("billing suspension is not on the customer allowlist", allowlist.length > 0 && !allowlist.includes("billing_suspended"));
check("a usage pause is not on the customer allowlist", allowlist.length > 0 && !allowlist.includes("usage_pause_requested"));

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
