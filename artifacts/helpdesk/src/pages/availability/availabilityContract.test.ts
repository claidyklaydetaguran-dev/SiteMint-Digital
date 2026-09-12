/**
 * V5 PR-7 — committed contract tests for the Availability screen.
 * Run via: tsx artifacts/helpdesk/src/pages/availability/availabilityContract.test.ts
 */
import {
  CALENDAR_POINTER,
  EXCEPTIONS,
  PAGE,
  PUBLIC_LINK,
  SETTINGS,
  TYPES,
  effectiveForType,
  everyRenderableString,
  exceptionsSorted,
  nextFreeDateKey,
  toConfigInput,
  todayDateKey,
  wouldDuplicateDate,
  fieldForError,
  initialTabFromSearch,
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

section("The 'Appointment Types' nav entry deep-links to the types tab");

eq("?tab=types opens on the types tab", initialTabFromSearch("?tab=types"), "types");
eq("no param opens on settings", initialTabFromSearch(""), "settings");
eq("an unrecognised tab value falls back to settings, never guessed at", initialTabFromSearch("?tab=nonsense"), "settings");

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
check("the specific-dates heading is present", strings.includes(EXCEPTIONS.heading));

section("Read shape → write shape");

const SERVER_CONFIG = {
  timezone: "America/Los_Angeles",
  weeklyHours: { 0: null, 1: { start: "09:00", end: "17:00" } },
  appointmentTypes: [{ id: "7", name: "Consultation", durationMin: 30 }],
  appointmentTypeDetail: [
    {
      id: "7",
      name: "Consultation",
      description: "A first chat",
      durationMin: 30,
      active: true,
      public: true,
      calendarId: null,
      overrides: {
        bufferBeforeMin: null,
        bufferAfterMin: 30,
        minNoticeHours: null,
        maxAdvanceDays: null,
        slotIntervalMin: null,
        dailyLimit: 2,
      },
      effective: {
        durationMin: 30,
        bufferBeforeMin: 10,
        bufferAfterMin: 30,
        minNoticeHours: 4,
        maxAdvanceDays: 30,
        slotIntervalMin: 30,
        dailyLimit: null,
        typeDailyLimit: 2,
      },
    },
  ],
  bufferBeforeMin: 10,
  bufferAfterMin: 10,
  minNoticeHours: 4,
  maxAdvanceDays: 30,
  slotIntervalMin: 30,
  blockedDates: ["2027-07-05"],
  dateExceptions: [{ dateKey: "2027-07-06", closed: false, hours: { start: "09:00", end: "11:00" }, label: "Half day" }],
  dailyLimit: null,
} as unknown as Parameters<typeof toConfigInput>[0];

const input = toConfigInput(SERVER_CONFIG);

eq("an override round-trips as a number", input.appointmentTypes[0]!.bufferAfterMin, 30);
// The defect this prevents: sending the computed `effective` value back would
// turn every inherited rule into a hard-coded override on the first save, and a
// later change to the business default would then appear to do nothing.
eq("an inherited rule round-trips as null, NOT as its effective value", input.appointmentTypes[0]!.bufferBeforeMin, null);
check("the read-only effective block is not echoed back", !("effective" in (input.appointmentTypes[0] as Record<string, unknown>)));
eq("date exceptions round-trip", input.dateExceptions.length, 1);
eq("blocked dates round-trip", input.blockedDates, ["2027-07-05"]);
eq("the type keeps its server id so the save updates rather than inserts", input.appointmentTypes[0]!.id, "7");

// A dashboard deployed ahead of its backend gets no detail array. Falling back
// to the engine-shaped list keeps the business's types visible; without it the
// editor would show none and then save that emptiness over real rows.
const OLD_SERVER = {
  timezone: "UTC",
  weeklyHours: {},
  appointmentTypes: [{ id: "3", name: "Call", durationMin: 15 }],
  bufferBeforeMin: 0, bufferAfterMin: 0, minNoticeHours: 0, maxAdvanceDays: 30,
  blockedDates: [], dailyLimit: null,
} as unknown as Parameters<typeof toConfigInput>[0];
const oldInput = toConfigInput(OLD_SERVER);
eq("a server without per-type detail still yields the types", oldInput.appointmentTypes.map((t) => t.name), ["Call"]);
eq("and no date exceptions rather than undefined", oldInput.dateExceptions, []);

section("Effective values come from the server, never recomputed");

eq("the saved config supplies the effective block", effectiveForType(SERVER_CONFIG, "7")?.bufferAfterMin, 30);
eq("an unsaved type has no effective block", effectiveForType(SERVER_CONFIG, undefined), null);
eq("a type the server has not seen has no effective block", effectiveForType(SERVER_CONFIG, "999"), null);
eq("a server without detail supplies none", effectiveForType(OLD_SERVER, "3"), null);

section("Date exceptions");

const NOW = new Date("2027-03-01T12:00:00");
eq("today is the first suggestion", nextFreeDateKey([], NOW), todayDateKey(NOW));
// One entry per date is a server constraint (unique index), so a suggestion
// that collides would come back as a rejected save with the edit lost.
eq(
  "an already-used date is skipped",
  nextFreeDateKey([{ dateKey: todayDateKey(NOW), closed: true }], NOW),
  "2027-03-02",
);
check(
  "a duplicate is detected for another row but not for the row being edited",
  wouldDuplicateDate([{ dateKey: "2027-03-01", closed: true }, { dateKey: "2027-03-02", closed: true }], 0, "2027-03-02") &&
    !wouldDuplicateDate([{ dateKey: "2027-03-01", closed: true }, { dateKey: "2027-03-02", closed: true }], 0, "2027-03-01"),
);
eq(
  "exceptions are listed in date order",
  exceptionsSorted([{ dateKey: "2027-12-24", closed: true }, { dateKey: "2027-07-04", closed: true }]).map((e) => e.dateKey),
  ["2027-07-04", "2027-12-24"],
);

section("Per-type rejections route to the types tab");

// The server reports these as `appointmentTypes[0].bufferBeforeMin`, which
// contains a bare rule name too. Attributing it to the business-wide field
// would send the operator to the wrong tab and highlight the wrong input.
eq("a per-type buffer rejection is an appointmentTypes error", fieldForError("appointmentTypes[0].bufferBeforeMin must be null (inherit) or an integer between 0 and 240."), "appointmentTypes");
eq("and it lands on the types tab", tabForField("appointmentTypes"), "types");
eq("a business-wide buffer rejection is still its own field", fieldForError("bufferBeforeMin must be an integer between 0 and 240."), "bufferBeforeMin");
eq("a date-exception rejection is its own field", fieldForError('dateExceptions[1].dateKey must be "YYYY-MM-DD".'), "dateExceptions");
check("and it lives behind the advanced disclosure", isAdvancedField("dateExceptions"));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Availability contract tests passed.");
