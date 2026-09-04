/**
 * V5 PR-7 — committed contract tests for the Availability screen.
 * Run via: tsx artifacts/helpdesk/src/pages/availability/availabilityContract.test.ts
 */
import {
  CALENDAR_POINTER,
  PAGE,
  PUBLIC_LINK,
  SETTINGS,
  TYPES,
  everyRenderableString,
  fieldForError,
  isAdvancedField,
  publicLinkActions,
  publicLinkUrlVisible,
  publicScheduleUrl,
  saveErrorDetail,
  tabForField,
  tabs,
} from "./availabilityContract.js";

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

section("Tabs");

eq("exactly two tabs, settings then types", tabs().map((t) => t.id), ["settings", "types"]);

section("Advanced field routing (owner decision B-1)");

check("buffers, notice, window, daily limit and blocked dates are all advanced", [
  "bufferBeforeMin", "bufferAfterMin", "minNoticeHours", "maxAdvanceDays", "dailyLimit", "blockedDates",
].every((f) => isAdvancedField(f as Parameters<typeof isAdvancedField>[0])));
check("timezone, weeklyHours and appointmentTypes are not advanced", [
  "timezone", "weeklyHours", "appointmentTypes",
].every((f) => !isAdvancedField(f as Parameters<typeof isAdvancedField>[0])));

section("Field → tab routing, so a rejected value moves the operator to where it lives");

eq("appointmentTypes routes to the types tab", tabForField("appointmentTypes"), "types");
eq("every other field routes to the settings tab", tabForField("timezone"), "settings");
eq("an advanced field still routes to settings, since Advanced lives there", tabForField("dailyLimit"), "settings");

section("Server-error field detection — unchanged from Phase 13");

eq("a timezone message is detected", fieldForError("Invalid IANA timezone"), "timezone");
eq("a daily limit message is detected", fieldForError("dailyLimit must be a positive integer"), "dailyLimit");
eq("an unrelated message detects nothing", fieldForError("Unauthorized"), null);
eq("a null message detects nothing", fieldForError(null), null);
eq("a blank server message gets a safe fallback sentence", saveErrorDetail(""), "The server rejected these settings. Check the values and try again.");
eq("a real server message is shown verbatim, trimmed", saveErrorDetail("  Bad value.  "), "Bad value.");

section("Public link state — unchanged from Phase 13");

eq("unknown offers both commands", publicLinkActions("unknown"), { enable: true, disable: true });
eq("enabled offers only disable", publicLinkActions("enabled"), { enable: false, disable: true });
eq("disabled offers only enable", publicLinkActions("disabled"), { enable: true, disable: false });
check("the URL is shown only when enabled and a slug exists", publicLinkUrlVisible("enabled", "abc") && !publicLinkUrlVisible("enabled", null) && !publicLinkUrlVisible("disabled", "abc"));
eq("the schedule URL is built under the availability route's own base", publicScheduleUrl("https://app.example.com", "/dash/availability", "abc"), "https://app.example.com/dash/schedule/abc");
eq("no slug means no URL, never a guess", publicScheduleUrl("https://app.example.com", "/dash/availability", null), null);

section("Calendar connection moved out — this module owns no connection wording");

check("no 'connected' calendar sentence lives in this module's strings", !everyRenderableString().some((s) => /calendar is connected/i.test(s)));
check("the pointer to the Calendar screen is present", everyRenderableString().includes(CALENDAR_POINTER.linkLabel));

section("String surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
check("the appointment types heading is present", strings.includes(TYPES.heading));
check("the public link heading is present", strings.includes(PUBLIC_LINK.heading));
check("the advanced disclosure label is present", strings.includes(SETTINGS.advancedShow));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Availability contract tests passed.");
