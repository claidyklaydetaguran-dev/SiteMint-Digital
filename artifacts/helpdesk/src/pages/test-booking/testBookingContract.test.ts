/**
 * V5 PR-7 — committed contract tests for the Test Booking screen.
 * Run via: tsx artifacts/helpdesk/src/pages/test-booking/testBookingContract.test.ts
 */
import { TEST_REQUEST_PREFIX } from "../appointments/appointmentsContract.js";
import {
  BOUNDARY,
  CALENDAR_NOTE,
  PAGE,
  PREVIEW,
  activeAppointmentTypeId,
  calendarReadiness,
  everyRenderableString,
  withTestPrefix,
} from "./testBookingContract.js";

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

section("Every submitted name is test-prefixed, exactly once");

eq("a plain name gets the prefix", withTestPrefix("Jane Doe"), `${TEST_REQUEST_PREFIX}Jane Doe`);
eq("an already-prefixed name is not double-prefixed", withTestPrefix(`${TEST_REQUEST_PREFIX}Jane Doe`), `${TEST_REQUEST_PREFIX}Jane Doe`);
eq("surrounding whitespace is trimmed before prefixing", withTestPrefix("  Jane  "), `${TEST_REQUEST_PREFIX}Jane`);
check("the prefix used here is the same constant Appointments recognises for the Test chip", withTestPrefix("X").startsWith(TEST_REQUEST_PREFIX));

section("Active appointment type resolution");

eq("an explicit selection wins", activeAppointmentTypeId({ appointmentTypes: [{ id: "a", name: "A", durationMin: 30 }] } as never, "b"), "b");
eq("falls back to the first configured type", activeAppointmentTypeId({ appointmentTypes: [{ id: "a", name: "A", durationMin: 30 }] } as never, undefined), "a");
eq("no config and no selection resolves to undefined, never invented", activeAppointmentTypeId(undefined, undefined), undefined);

section("Only 'Create test request' submits, per its own disclosure");

check("the disclosure states that selecting or holding a time creates nothing a client would see", /creates nothing a client would see/i.test(PREVIEW.disclosure));
check("the disclosure states every stored row is always a test row", /always saved as a test row/i.test(PREVIEW.disclosure));
check("the submit control is labelled as creating a TEST request, never a real one", PREVIEW.createLabel === "Create test request");
check("the result explains the row is findable by its Test chip", /Test chip/i.test(PREVIEW.resultDetail));

section("String surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
check("no renderable string claims to submit a real request", strings.every((s) => !/submit request\b/i.test(s)));

section("what a test does, and what it does not");

// The page said what a test request IS. It never said where it stops — and the
// unsaid half is the one a business acts on when deciding it is ready to take
// real bookings.
check("it says a test writes nothing to a calendar", BOUNDARY.doesNot.some((s) => /write anything to your calendar/i.test(s)));
check("it says nothing reaches a calendar until approval", BOUNDARY.doesNot.some((s) => /until you approve/i.test(s)));
check("it says nobody is contacted", BOUNDARY.doesNot.some((s) => /no email or text is sent/i.test(s)));
check("it says a passing test does not prove the calendar works", BOUNDARY.doesNot.some((s) => /prove your calendar works/i.test(s)));
check("it still says the time is held", BOUNDARY.does.some((s) => /hold the time/i.test(s)));
check("the two columns are not the same list", BOUNDARY.does.every((s) => !BOUNDARY.doesNot.includes(s as never)));

section("what approving would actually do, given the connection");

eq("a connected calendar reads as connected", calendarReadiness({ connected: true }, false), "connected");
eq("a disconnected one reads as not connected", calendarReadiness({ connected: false }, false), "not_connected");
// Not-yet-loaded and failed-to-load are both "unknown", never "not connected":
// claiming a calendar is missing when the workspace simply could not ask would
// send a business off to reconnect something that was already fine.
eq("a failed read is unknown, not disconnected", calendarReadiness({ connected: true }, true), "unknown");
eq("an unloaded read is unknown", calendarReadiness(undefined, false), "unknown");

check("the connected note says approving writes a real event", /writes a real event/i.test(CALENDAR_NOTE.connected.detail));
check("the disconnected note says requests can still be taken", /still be taken and held/i.test(CALENDAR_NOTE.not_connected.detail));
check("and says where to fix it", /under calendar/i.test(CALENDAR_NOTE.not_connected.detail));
// It must report that it could not tell, rather than picking a side. Claiming
// "no calendar" when the workspace merely failed to ask would send a business
// off to reconnect something that was already fine.
check("the unknown note says it could not read the state", /couldn't read whether/i.test(CALENDAR_NOTE.unknown.detail));
check("and it is not worded as either of the two answers",
  CALENDAR_NOTE.unknown.title !== CALENDAR_NOTE.connected.title &&
  CALENDAR_NOTE.unknown.title !== CALENDAR_NOTE.not_connected.title);
check("every readiness has its own wording", new Set(Object.values(CALENDAR_NOTE).map((c) => c.detail)).size === 3);


console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Test Booking contract tests passed.");
