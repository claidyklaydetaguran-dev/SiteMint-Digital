/**
 * V5 PR-7 — committed contract tests for the Test Booking screen.
 * Run via: tsx artifacts/helpdesk/src/pages/test-booking/testBookingContract.test.ts
 */
import { TEST_REQUEST_PREFIX } from "../appointments/appointmentsContract.js";
import {
  PAGE,
  PREVIEW,
  activeAppointmentTypeId,
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

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Test Booking contract tests passed.");
