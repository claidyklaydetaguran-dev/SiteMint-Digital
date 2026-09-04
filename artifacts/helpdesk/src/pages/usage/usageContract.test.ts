/**
 * V5 PR-8 — committed contract tests for the Usage screen.
 * Run via: tsx artifacts/helpdesk/src/pages/usage/usageContract.test.ts
 */
import {
  COPY,
  PAGE,
  everyRenderableString,
  isPaused,
  isWarning,
  minutesRemaining,
  minutesUsed,
  percentUsed,
  periodLabel,
  railMinutesLabel,
  railSmsLabel,
} from "./usageContract.js";

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

section("No cap means no percent, no warning, never paused");

eq("null includedMinutes has no percent", percentUsed({ totalSeconds: 6000, includedMinutes: null }), null);
check("null includedMinutes is never a warning", !isWarning({ totalSeconds: 6000, includedMinutes: null }));
check("null includedMinutes is never paused", !isPaused({ totalSeconds: 6000, includedMinutes: null }));
eq("no cap means remaining is unmeasurable, not zero", minutesRemaining({ totalSeconds: 6000, includedMinutes: null }), null);

section("Threshold math");

eq("50% used is not a warning", isWarning({ totalSeconds: 30 * 60, includedMinutes: 60 }), false);
eq("80% used is a warning", isWarning({ totalSeconds: 48 * 60, includedMinutes: 60 }), true);
eq("100% used is paused, not merely a warning", isWarning({ totalSeconds: 60 * 60, includedMinutes: 60 }), false);
eq("100% used is paused", isPaused({ totalSeconds: 60 * 60, includedMinutes: 60 }), true);
eq("over 100% is still paused", isPaused({ totalSeconds: 90 * 60, includedMinutes: 60 }), true);
eq("under 100% is not paused", isPaused({ totalSeconds: 59 * 60, includedMinutes: 60 }), false);

section("Minutes math");

eq("minutesUsed floors partial minutes", minutesUsed({ totalSeconds: 125 }), 2);
eq("remaining never goes negative", minutesRemaining({ totalSeconds: 90 * 60, includedMinutes: 60 }), 0);
eq("remaining is the plain difference otherwise", minutesRemaining({ totalSeconds: 20 * 60, includedMinutes: 60 }), 40);

section("Period label");

eq("YYYY-MM formats as a month and year", periodLabel("2026-09"), "September 2026");
eq("a malformed period is returned verbatim, never guessed at", periodLabel("garbage"), "garbage");

section("Paused wording is exact");

eq("the paused sentence matches the approved copy exactly", COPY.pausedTitle, "Your receptionist is paused because the current usage limit was reached.");
eq("the paused action is exactly one action", COPY.pausedAction, "Contact SiteMint to continue");
check("the paused action is a mailto link", COPY.pausedMailto.startsWith("mailto:"));

section("Rail indicator labels");

eq("unlimited minutes label", railMinutesLabel({ period: "2026-09", callCount: 1, totalSeconds: 120, includedMinutes: null }), "2 min used");
eq("capped minutes label", railMinutesLabel({ period: "2026-09", callCount: 1, totalSeconds: 120, includedMinutes: 60 }), "2 / 60 min");
eq("SMS label with a trial limit", railSmsLabel(3, 10), "3 / 10 conversations");
eq("SMS label with no trial limit", railSmsLabel(3, 0), "3 conversations");

section("String surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Usage contract tests passed.");
