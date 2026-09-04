/**
 * V5 PR-8 — committed contract tests for the Phone Number screen.
 * Run via: tsx artifacts/helpdesk/src/pages/phone-number/phoneNumberContract.test.ts
 */
import { COPY, PAGE, everyRenderableString, numberViewState } from "./phoneNumberContract.js";

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

section("View state");

eq("loading wins over everything", numberViewState({ loading: true, isError: true, state: "assigned" }), "loading");
eq("error surfaces once not loading", numberViewState({ loading: false, isError: true, state: undefined }), "error");
eq("assigned state maps directly", numberViewState({ loading: false, isError: false, state: "assigned" }), "assigned");
eq("paused state maps directly", numberViewState({ loading: false, isError: false, state: "paused" }), "paused");
eq("no number at all is none-assigned", numberViewState({ loading: false, isError: false, state: undefined }), "none-assigned");
eq("inventory (not yet assigned to this firm) reads as none-assigned", numberViewState({ loading: false, isError: false, state: "inventory" }), "none-assigned");

section("SMS capability line is honest");

check("the capabilities line states SMS is not enabled on this number", COPY.capabilitiesLine.includes("SMS on this number is not enabled"));
check("the capabilities line states voice is managed by SiteMint", COPY.capabilitiesLine.includes("managed by SiteMint"));

section("String surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
check("the pause confirmation names the real consequence", strings.includes(COPY.pauseConfirmDetail));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Phone Number contract tests passed.");
