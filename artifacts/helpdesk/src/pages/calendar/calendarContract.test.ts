/**
 * V5 PR-7 — committed contract tests for the Calendar screen.
 *
 * Run via: tsx artifacts/helpdesk/src/pages/calendar/calendarContract.test.ts
 */

import {
  CONNECT,
  PAGE,
  RETURN_BANNER,
  calendarReturnCopy,
  calendarViewState,
  classifyConnectError,
  everyRenderableString,
  lastCheckedLabel,
  parseCalendarReturn,
} from "./calendarContract.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  check(`${label} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}

function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 66 - name.length))}`);
}

section("View state machine");

eq("loading wins over everything else", calendarViewState({
  statusLoading: true, statusError: true, connected: true, connecting: true, connectDisabled: true,
}), "loading");

eq("connecting wins once loading has resolved", calendarViewState({
  statusLoading: false, statusError: true, connected: true, connecting: true, connectDisabled: true,
}), "connecting");

eq("disabled surfaces once not loading or connecting", calendarViewState({
  statusLoading: false, statusError: true, connected: true, connecting: false, connectDisabled: true,
}), "disabled");

eq("a status read failure is reported", calendarViewState({
  statusLoading: false, statusError: true, connected: false, connecting: false, connectDisabled: false,
}), "error");

eq("connected reflects the server's answer", calendarViewState({
  statusLoading: false, statusError: false, connected: true, connecting: false, connectDisabled: false,
}), "connected");

eq("not-connected is the default settled state", calendarViewState({
  statusLoading: false, statusError: false, connected: false, connecting: false, connectDisabled: false,
}), "not-connected");

section("Connect-error classification");

eq("a 503 is classified as the workspace being disabled", classifyConnectError({ status: 503 }), "disabled");
eq("any other status is a generic failure", classifyConnectError({ status: 500 }), "failed");
eq("no status is a generic failure", classifyConnectError({}), "failed");

section("OAuth return banner");

eq("?calendar=connected parses", parseCalendarReturn("?calendar=connected"), "connected");
eq("?calendar=error parses", parseCalendarReturn("?calendar=error"), "error");
eq("no calendar param is null", parseCalendarReturn("?other=1"), null);
eq("an unrecognised value is null, never invented", parseCalendarReturn("?calendar=maybe"), null);
eq("empty search is null", parseCalendarReturn(""), null);

check("connected copy uses the approved title", calendarReturnCopy("connected").title === RETURN_BANNER.connectedTitle);
check("error copy uses the approved title", calendarReturnCopy("error").title === RETURN_BANNER.errorTitle);

section("Last-checked label");

eq("no timestamp yet is stated, never invented", lastCheckedLabel(undefined), CONNECT.lastCheckedUnknown);
eq("a zero timestamp is treated as unset", lastCheckedLabel(0), CONNECT.lastCheckedUnknown);
check("a real timestamp renders a non-empty label", lastCheckedLabel(Date.now()).length > 0);
check("a real timestamp is never the unknown label", lastCheckedLabel(Date.now()) !== CONNECT.lastCheckedUnknown);

section("Disabled-workspace wording");

check(
  "the exact owner-approved disabled sentence is present",
  Object.values(CONNECT).includes("Calendar connection is not enabled on this workspace yet"),
);

section("String surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
check("no string claims a calendar id, account email or token is shown", strings.every((s) =>
  !/calendar id|account email|access token|refresh token/i.test(s)));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Calendar contract tests passed.");
