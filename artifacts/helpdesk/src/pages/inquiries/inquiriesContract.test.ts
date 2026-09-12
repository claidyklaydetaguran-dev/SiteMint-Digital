/**
 * V7 — committed contract tests for the Inquiries screen.
 * Run via: tsx artifacts/helpdesk/src/pages/inquiries/inquiriesContract.test.ts
 *
 * These guard wording, not layout. Two claims in particular would be untrue if
 * the copy drifted: that an email reached someone, and that a call with no saved
 * message was dealt with.
 */
import { COPY, PAGE, TABS, everyRenderableString, followUpLabel, notificationLabel } from "./inquiriesContract.js";
import { FOLLOW_UP_STATUSES, NOTIFICATION_STATES } from "../../lib/inquiriesApi.js";

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

section("Follow-up workflow");

eq("the three statuses are exactly the backend's", [...FOLLOW_UP_STATUSES], ["new", "in_progress", "resolved"]);
eq("new", followUpLabel("new"), "New");
eq("in progress", followUpLabel("in_progress"), "In progress");
eq("resolved", followUpLabel("resolved"), "Resolved");
eq("an unrecognised status is stated, never invented", followUpLabel("mystery"), "Unknown");

check(
  "every status has a tab, plus All",
  TABS.length === FOLLOW_UP_STATUSES.length + 1 && TABS[0]!.key === "all",
);
check(
  "every backend status appears as a tab key",
  FOLLOW_UP_STATUSES.every((s) => TABS.some((t) => t.key === s)),
);

section("Delivery status honesty");

eq("every state is labelled", NOTIFICATION_STATES.map(notificationLabel).filter((l) => l === "Unknown").length, 0);
eq("an unrecognised state is stated, never invented", notificationLabel("teleported"), "Unknown");
check(
  "no label claims the email was delivered or read",
  NOTIFICATION_STATES.map(notificationLabel).every((l) => !/delivered|received|read|arrived/i.test(l)),
);
eq(
  "the accepted label names the provider, not the inbox",
  notificationLabel("accepted"),
  "Accepted by email provider",
);
check(
  "the section explains what accepted does and does not mean",
  /accepted/i.test(COPY.notificationsDetail) && /not proof/i.test(COPY.notificationsDetail),
);

section("Empty states");

check(
  "an empty list explains what will appear, rather than implying nobody called",
  /caller/i.test(COPY.emptyDetail) && !/no one called|nobody called/i.test(COPY.emptyDetail),
);
check("a filtered empty list is worded differently from a genuinely empty one", COPY.emptyDetail !== COPY.emptyFilteredDetail);

section("Consent wording");

check(
  "the email-copy note describes a caller REQUEST, never an inferred address",
  /asked/i.test(COPY.ackRequestedNote),
);

section("String surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
check(
  "no string leaks an internal identifier or provider name",
  strings.every((s) => !/vapi|firm_id|firmId|provider_call_id|tool_call/i.test(s)),
);

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
