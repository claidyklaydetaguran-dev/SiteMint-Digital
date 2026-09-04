/**
 * V5 PR-8 — committed contract tests for the Contacts workspace.
 *
 * Run via: tsx artifacts/helpdesk/src/pages/contacts/contactsContract.test.ts
 *
 * The Frontend V2 Phase 10 version of this file pinned a *capability-absent*
 * state: no contact table, no contact endpoint, and copy that said so. PR-8
 * adds `GET /receptionist/contacts` and `GET /receptionist/contacts/:id`,
 * which makes that premise false. This file replaces it rather than leaving
 * the old absence claims in place beside a page that now shows a real list.
 */

import {
  DETAIL,
  LIST,
  PAGE,
  contactDisplayName,
  dispositionLabel,
  everyRenderableString,
  sourceLabel,
} from "./contactsContract.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}`); }
}
function eq<T>(label: string, actual: T, expected: T): void {
  check(`${label} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}
function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 66 - name.length))}`);
}

section("Display helpers never invent a value");

eq("a missing name is stated, never blank", contactDisplayName({ name: null }), LIST.unnamed);
eq("a whitespace-only name is treated as missing", contactDisplayName({ name: "   " }), LIST.unnamed);
eq("a real name is shown verbatim", contactDisplayName({ name: "Jane Doe" }), "Jane Doe");

eq("voice source labels correctly", sourceLabel("voice"), "Voice");
eq("sms source labels correctly", sourceLabel("sms"), "SMS");
eq("manual source labels correctly", sourceLabel("manual"), "Added manually");
eq("an unrecognised source is stated, never invented", sourceLabel("carrier_pigeon"), "Unknown source");

eq("a null disposition is stated, never blank", dispositionLabel(null), "Not set");
eq("a snake_case disposition is humanised", dispositionLabel("appointment_requested"), "Appointment requested");

section("Count phrasing");

eq("singular count", LIST.countSuffix(1), "1 contact");
eq("plural count", LIST.countSuffix(0), "0 contacts");
eq("plural count for many", LIST.countSuffix(5), "5 contacts");

section("String surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
check("the search placeholder is present", strings.includes(LIST.searchPlaceholder));
check("the opted-out label reaches the detail surface", strings.includes(DETAIL.optedOutLabel));
check(
  "no claim about a call log, tier or scoring applied to a person survives — the old Phase 10 rationale for absence, not the new capability",
  strings.every((s) => !/no separate contact records|does not store a separate contact directory/i.test(s)),
);

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Contacts contract tests passed.");
