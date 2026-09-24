/**
 * V5 PR-7 — committed contract tests for the Calendar screen.
 *
 * Run via: tsx artifacts/helpdesk/src/pages/calendar/calendarContract.test.ts
 */

import {
  CONNECT,
  HEALTH,
  HEALTH_FIELDS,
  PAGE,
  RETURN_BANNER,
  calendarDisplayName,
  calendarReturnCopy,
  calendarViewState,
  classifyConnectError,
  everyRenderableString,
  healthSummary,
  healthTimestamp,
  lastCheckedLabel,
  parseCalendarReturn,
  resolveSelectedCalendarId,
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

section("connection health — set up is not the same as working");

// The case this exists for: an owner removes SiteMint's access at Google.
// Nothing works from that moment, but the connection row stays active until
// something tries to use it — so the screen reported a healthy connection while
// every approval silently failed.
eq("a withdrawn connection is not called disconnected", HEALTH.revoked.title, "Access to this calendar was withdrawn");
check("it says busy times are not being checked", /busy times are not being checked/i.test(HEALTH.revoked.detail));
check("it says approvals cannot write events", /cannot write events/i.test(HEALTH.revoked.detail));
check("it says what to do", /reconnect/i.test(HEALTH.revoked.detail));
// Reconnecting must not imply the past is undone.
check("it says events already written stay", /already written stay/i.test(HEALTH.revoked.detail));
eq("and it is the strongest tone", HEALTH.revoked.tone, "error");

check("connected-but-unused is not reported as working", HEALTH.untested.title !== HEALTH.healthy.title);
check("a failed last check is not reported as working", HEALTH.failing.title !== HEALTH.healthy.title);
check("a failed check says it may be temporary", /may be temporary/i.test(HEALTH.failing.detail));
check("not-connected still says requests can be taken", /take and hold requests/i.test(HEALTH.not_connected.detail));
check("every state has its own wording", new Set(Object.values(HEALTH).map((h) => h.detail)).size === 5);

eq("an absent health read is treated as not connected, never as healthy", healthSummary(undefined).title, HEALTH.not_connected.title);
eq("each state maps to its own summary", healthSummary({
  state: "revoked", usable: false, provider: "google", accountLabel: null,
  calendarId: null, lastSuccessAt: null, lastErrorAt: null, connectedAt: null,
}).title, HEALTH.revoked.title);

section("what the health panel is allowed to say");

// "primary" is a provider default, not a name the business chose — showing it
// raw would read as a calendar called "primary".
eq("the provider's default calendar is named plainly", calendarDisplayName("primary"), HEALTH_FIELDS.defaultCalendar);
eq("a named calendar is shown as it is", calendarDisplayName("team@group.calendar.google.com"), "team@group.calendar.google.com");
eq("an absent calendar is not invented", calendarDisplayName(null), HEALTH_FIELDS.none);
eq("nor is an empty one", calendarDisplayName("   "), HEALTH_FIELDS.none);

eq("a missing timestamp is not invented", healthTimestamp(null), HEALTH_FIELDS.none);
eq("an unparseable timestamp is not invented either", healthTimestamp("not-a-date"), HEALTH_FIELDS.none);
check("a real timestamp is formatted", healthTimestamp("2026-09-11T15:04:00.000Z") !== HEALTH_FIELDS.none);

check("the write-disabled note says busy times are still read", /busy times are still read/i.test(HEALTH_FIELDS.writeDisabledDetail));

section("which calendar the picker shows as chosen");

// Found live: a connection made before the picker stored the alias "primary",
// the select showed the account's calendar, and Save could never enable.
const LISTED = [
  { id: "owner@example.com", primary: true },
  { id: "team@group.calendar.google.com", primary: false },
];
eq("Google's 'primary' alias resolves to the calendar Google flags as primary", resolveSelectedCalendarId("primary", LISTED), "owner@example.com");
eq("an explicit selection is kept exactly", resolveSelectedCalendarId("team@group.calendar.google.com", LISTED), "team@group.calendar.google.com");
eq("the alias is left alone when no listed calendar is flagged primary", resolveSelectedCalendarId("primary", [{ id: "team@group.calendar.google.com", primary: false }]), "primary");
eq("no selection is not invented", resolveSelectedCalendarId(null, LISTED), null);


console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Calendar contract tests passed.");
