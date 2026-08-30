/**
 * Frontend V2 Phase 13 — committed contract tests for the Appointments
 * workspace.
 *
 * Run via: tsx artifacts/helpdesk/src/pages/appointments/appointmentsContract.test.ts
 *
 * Same arrangement as Phases 5–12: the file lives beside the module it tests,
 * `tsx` is the runner, and helpdesk's tsconfig excludes `**\/*.test.ts` by glob
 * so nothing here is type-built into the app or bundled by Vite.
 *
 * Much of this file asserts absence. Appointments is the route most tempted to
 * over-claim — a confirmation, a calendar write, a text message to the client,
 * a staff assignment are all one sentence away, and every one of them would be
 * plausible enough to survive a casual review while being backed by no endpoint
 * at all. So the wording the route can produce is enumerated exhaustively
 * (`everyRenderableString()`), and the prohibited claims are required to be
 * absent from that surface, from each component, from the stylesheet and from
 * the built output.
 *
 * It never performs a network request, never signs in, never creates a session,
 * never contacts Google, Vapi or any provider, and never touches a database.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AVAILABILITY,
  CALENDAR,
  PAGE,
  PREVIEW,
  PUBLIC_LINK,
  REQUESTS,
  canCancel,
  calendarCopy,
  contactDetail,
  contactName,
  dateKey,
  dayLegend,
  dayReasonLabel,
  daysInMonth,
  everyRenderableString,
  fieldForError,
  firstWeekdayOfMonth,
  isSelectableDay,
  monthRange,
  nextView,
  publicLinkActions,
  publicLinkUrlVisible,
  publicScheduleUrl,
  requestStateLabel,
  requestStateTone,
  saveErrorDetail,
  shiftMonth,
  sourceLabel,
  typeName,
  views,
} from "./appointmentsContract.js";

/**
 * AR-001J owner review, correction A. The build classifier below reads the
 * flag through the application's own parser rather than through a second
 * copy of its rule — there is exactly one truth table in the client, and a
 * test that restates it can drift away from it, which is what this
 * correction repairs.
 */
import { parseBooleanFlag } from "../../lib/featureFlags.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/appointments → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/Appointments.tsx");
const contractSrc = read("artifacts/helpdesk/src/pages/appointments/appointmentsContract.ts");
const calendarSrc = read("artifacts/helpdesk/src/components/booking/BookingCalendar.tsx");
const listSrc = read("artifacts/helpdesk/src/components/booking/AppointmentRequestsList.tsx");
const formSrc = read("artifacts/helpdesk/src/components/booking/AvailabilitySettingsForm.tsx");
const cssSrc = read("artifacts/helpdesk/src/styles/v2-appointments.css");

const appSrc = read("artifacts/helpdesk/src/App.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const navSrc = read("artifacts/helpdesk/src/lib/nav.ts");
const dashboardNavSrc = read("artifacts/helpdesk/src/components/layout/dashboardNav.ts");
const flagsSrc = read("artifacts/helpdesk/src/lib/featureFlags.ts");
const sessionSrc = read("artifacts/helpdesk/src/hooks/useSession.ts");
const hooksSrc = read("artifacts/helpdesk/src/hooks/useAvailability.ts");
const apiSrc = read("artifacts/helpdesk/src/lib/availabilityApi.ts");
const routeSrc = read("artifacts/api-server/src/routes/receptionistAvailability.ts");

/**
 * Source with comments stripped. These files explain at length what they
 * removed and why — including quoting the removed phrases — so a prose mention
 * of a deleted claim must never be mistaken for the claim still being rendered.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const pageCode = stripComments(pageSrc);
const contractCode = stripComments(contractSrc);
const calendarCode = stripComments(calendarSrc);
const listCode = stripComments(listSrc);
const formCode = stripComments(formSrc);
const cssCode = stripComments(cssSrc);
const routeCode = [pageCode, contractCode, calendarCode, listCode, formCode].join("\n");

// ─── Tiny runner ───────────────────────────────────────────────────────────

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
  check(
    `${label} (got ${JSON.stringify(actual)})`,
    JSON.stringify(actual) === JSON.stringify(expected),
  );
}

function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 66 - name.length))}`);
}

// ═══════════════════════════════════════════════════════════════════════════
section("Premise — what the availability API actually offers");
// ═══════════════════════════════════════════════════════════════════════════

const ROUTER_CALLS = routeSrc.match(/router\.(get|post|put)\("([^"]+)"/g) ?? [];

eq("the availability router exposes exactly ten endpoints", ROUTER_CALLS.length, 10);

check(
  "every endpoint the client calls exists on the router, and no others",
  (() => {
    const declared = new Set(
      ROUTER_CALLS.map((c) => {
        const m = /router\.(get|post|put)\("([^"]+)"/.exec(c)!;
        return `${m[1]!.toUpperCase()} ${m[2]!}`;
      }),
    );
    const expected = [
      "GET /receptionist/availability/config",
      "PUT /receptionist/availability/config",
      "PUT /receptionist/availability/public-link",
      "GET /receptionist/availability/calendar-status",
      "GET /receptionist/availability/days",
      "GET /receptionist/availability/slots",
      "POST /receptionist/availability/hold",
      "POST /receptionist/availability/requests",
      "GET /receptionist/availability/requests",
      "POST /receptionist/availability/requests/:publicId/cancel",
    ];
    return expected.every((e) => declared.has(e)) && declared.size === expected.length;
  })(),
);

check(
  "no confirm, approve, reject, reschedule, calendar-write, notify or message endpoint exists",
  ROUTER_CALLS.every((c) =>
    !/(confirm|approve|reject|reschedule|assign|notify|remind|calendar-event|events|sms|email|export)/i
      .test(/router\.(?:get|post|put)\("([^"]+)"/.exec(c)![1]!)),
);

check(
  "every availability endpoint is authenticated and firm-scoped by the session",
  (routeSrc.match(/requireReceptionistAuth, async/g) ?? []).length === 10 &&
    (routeSrc.match(/req\.firmId!/g) ?? []).length >= 10,
);

check(
  "the server never accepts a firm id from the browser",
  !/body\??\.\[?["']?firmId|query\["firmId"\]|params\.firmId/i.test(routeSrc),
);

check(
  "the client sends no firm or tenant identifier in any body, query or header",
  !/firmId/.test(stripComments(apiSrc).replace(/firmId: number;/, "")),
);

check(
  "a submitted request can only be stored pending_review, never booked",
  /submitAppointmentRequest\(req\.firmId!/.test(routeSrc) &&
    /"pending_review"/.test(read("artifacts/api-server/src/lib/scheduling/schedulingRepository.ts")),
);

check(
  "the hold endpoint answers 409 on a taken slot and 201 otherwise",
  /res\.status\(409\)[\s\S]{0,120}no longer available/.test(routeSrc) &&
    /res\.status\(201\)\.json\(\{ request: serializeRequestForAdmin/.test(routeSrc),
);

check(
  "the cancel endpoint answers 404 when the request is already gone",
  /res\.status\(404\)\.json\(\{ error: "Request not found" \}\)/.test(routeSrc),
);

check(
  "the config PUT answers 400 with the server's own validation sentence",
  /ValidationError[\s\S]{0,120}res\.status\(400\)\.json\(\{ error: err\.message \}\)/.test(routeSrc),
);

check(
  "the calendar-status response carries only connected and provider",
  /res\.json\(\{ connected, provider: connected \? "google" : "none" \}\)/.test(routeSrc),
);

check(
  "the public-link response carries only enabled and slug, and there is no GET for it",
  /res\.json\(\{ enabled: true, slug \}\)/.test(routeSrc) &&
    !/router\.get\("\/receptionist\/availability\/public-link/.test(routeSrc),
);

check(
  "the request serializer exposes the public id and never the internal serial",
  /id: row\.publicId/.test(routeSrc) && !/id: row\.id\b/.test(routeSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Gate — the voice flag, navigation and routing are unchanged");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "the Appointments nav entry is still live and voice-gated",
  /key: "appointments", label: "Appointments", href: "\/appointments"[\s\S]{0,120}state: "live", voiceGated: true/
    .test(navSrc),
);

check(
  "navigation still filters out a voice-gated entry when the flag is off",
  /item\.state === "live" && \(!item\.voiceGated \|\| voiceEnabled\) && Boolean\(item\.href\)/
    .test(dashboardNavSrc),
);

check(
  "the Appointments route is registered only inside the voice-enabled branch",
  (() => {
    const gate = /\{voicePlatformEnabled && \(\s*<>([\s\S]*?)<\/>\s*\)\}/.exec(appSrc)?.[1] ?? "";
    return gate.includes("path={ROUTES.appointments}") &&
      appSrc.split("path={ROUTES.appointments}").length === 2;
  })(),
);

check(
  "the voice flag still defaults to false when unset or invalid",
  /value\.trim\(\)\.toLowerCase\(\) === "true"/.test(flagsSrc) &&
    /voicePlatformEnabled: boolean = NO_BUILD_ENV[\s\S]{0,500}parseBooleanFlag\(import\.meta\.env\.VITE_VOICE_PLATFORM_ENABLED\)/
      .test(flagsSrc),
);

check(
  "the route path is the existing base-relative one",
  /appointments: "\/appointments"/.test(routesSrc),
);

check(
  "Phase 13 reads the flag through the helper and never import.meta.env directly",
  !/import\.meta\.env/.test(routeCode),
);

check(
  "Phase 13 hard-codes no base path, origin or absolute API URL",
  !/ai-receptionist\/dashboard/.test(routeCode) &&
    !/https?:\/\//.test(routeCode.replace(/https?:\/\/[^\s"']*schema[^\s"']*/g, "")),
);

// Root base and configured prefix both resolve through the same helper.
eq(
  "the public link resolves under the configured prefix",
  publicScheduleUrl("http://x", "/ai-receptionist/dashboard/appointments", "abc123"),
  "http://x/ai-receptionist/dashboard/schedule/abc123",
);
eq(
  "the public link resolves under the root base",
  publicScheduleUrl("http://x", "/appointments", "abc123"),
  "http://x/schedule/abc123",
);
eq(
  "a trailing slash on the route does not double up",
  publicScheduleUrl("http://x", "/appointments/", "abc123"),
  "http://x/schedule/abc123",
);
eq("no slug means no URL is shown at all", publicScheduleUrl("http://x", "/appointments", null), null);
eq("an empty slug is never dressed as a link", publicScheduleUrl("http://x", "/appointments", "  "), null);

// ═══════════════════════════════════════════════════════════════════════════
section("Session — one read, no duplicate, nothing before it resolves");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "the page reads the shell's session entry rather than fetching its own",
  /useSession\(\)/.test(pageCode) && !/auth\/me/.test(routeCode),
);

check(
  "the session query is still the single shared key with a stale window",
  /SESSION_KEY = \["receptionist-me"\]/.test(sessionSrc) && /staleTime: 60_000/.test(sessionSrc),
);

check(
  "no authenticated content renders while the session is loading",
  /if \(isLoading\) \{[\s\S]{0,220}PAGE\.loading/.test(pageCode),
);

check(
  "nothing renders at all when there is no session",
  /if \(!me\) return null;/.test(pageCode),
);

check(
  "every availability query stays disabled until the firm id resolves",
  (hooksSrc.match(/enabled: (firmId !== undefined|resolved)/g) ?? []).length === 5 &&
    (hooksSrc.match(/useQuery\(/g) ?? []).length === 5 &&
    /UNRESOLVED_SESSION_KEY/.test(hooksSrc),
);

check(
  "the page never substitutes a fallback firm id",
  !/firmId \|\||firmId \?\?/.test(routeCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Views — three local tabs, no route change, no request");
// ═══════════════════════════════════════════════════════════════════════════

eq("there are exactly three views", views().map((v) => v.id), ["preview", "requests", "availability"]);
eq("the view labels are the approved ones", views().map((v) => v.label), [
  "Booking preview",
  "Requests",
  "Availability",
]);

eq("arrow-right moves forward", nextView("preview", 1), "requests");
eq("arrow-left moves back", nextView("requests", -1), "preview");
eq("arrow-right wraps at the end", nextView("availability", 1), "preview");
eq("arrow-left wraps at the start", nextView("preview", -1), "availability");

check(
  "the tablist carries correct roles, selection and roving tabindex",
  /role="tablist"/.test(pageCode) &&
    /role="tab"/.test(pageCode) &&
    /role="tabpanel"/.test(pageCode) &&
    /aria-selected=\{view === item\.id\}/.test(pageCode) &&
    /aria-controls=\{`sa-panel-\$\{item\.id\}`\}/.test(pageCode) &&
    /aria-labelledby=\{`sa-tab-\$\{item\.id\}`\}/.test(pageCode) &&
    /tabIndex=\{view === item\.id \? 0 : -1\}/.test(pageCode),
);

check(
  "Home and End jump to the first and last view",
  /event\.key === "Home"[\s\S]{0,60}all\[0\]!\.id/.test(pageCode) &&
    /event\.key === "End"[\s\S]{0,80}all\[all\.length - 1\]!\.id/.test(pageCode),
);

check(
  "changing view is local state only — no navigation, no route push",
  !/setLocation|navigate\(|history\.(push|replace)|window\.location/.test(pageCode),
);

check(
  "changing view triggers no mutation",
  !/mutate|mutateAsync/.test(pageCode),
);

check(
  "a visited panel is kept mounted, so returning to it refetches nothing",
  /seen\.includes\(id\) \? seen : \[\.\.\.seen, id\]/.test(pageCode) &&
    /visited\.includes\(v\.id\)/.test(pageCode) &&
    /hidden=\{view !== item\.id\}/.test(pageCode),
);

check(
  "the config is read once by the page and handed down, not re-read per panel",
  /useAvailabilityConfig\(\)/.test(pageCode) &&
    !/useAvailabilityConfig/.test(calendarCode) &&
    !/useAvailabilityConfig/.test(listCode) &&
    !/useAvailabilityConfig/.test(formCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Requests behaviour — no poll, no refetch loop, no animation fetch");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "no polling or refetch interval anywhere on the route",
  !/refetchInterval|setInterval|setTimeout\(\s*\(\)\s*=>\s*(refetch|invalidate)/.test(routeCode),
);

check(
  "no refetch-on-focus or refetch-on-mount override is introduced",
  !/refetchOnWindowFocus|refetchOnMount|refetchOnReconnect/.test(routeCode),
);

check(
  "no request can be triggered from an animation frame",
  !/requestAnimationFrame|requestIdleCallback/.test(routeCode),
);

check(
  "the previous page's requestAnimationFrame re-selection is gone",
  !/requestAnimationFrame\(\(\) => setSelectedDate/.test(calendarCode),
);

check(
  "no prefetch, no provider script, no third-party host",
  !/prefetch|preconnect|dns-prefetch|googleapis|gstatic|vapi|stripe/i.test(routeCode),
);

check(
  "the days and slots queries are keyed on their own inputs, not re-fired by render",
  /useAvailabilityDays\(start, end, activeTypeId\)/.test(calendarCode) &&
    /useAvailabilitySlots\(selectedDate, activeTypeId\)/.test(calendarCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Mutations — explicit activation, one request, honest failure");
// ═══════════════════════════════════════════════════════════════════════════

const MUTATIONS: [string, string, RegExp, RegExp][] = [
  ["hold", calendarCode, /const handleHold = useCallback\(async \(\) => \{[\s\S]*?\}, \[/, /holdMutation\.isPending\) return;/],
  ["request submit", calendarCode, /const handleSubmit = useCallback\(async \(\) => \{[\s\S]*?\}, \[/, /submitMutation\.isPending\) return;/],
  ["cancel", listCode, /const confirmCancel = useCallback\(async \(id: string\) => \{[\s\S]*?\}, \[/, /if \(pendingId !== null\) return;/],
  ["config save", formCode, /const handleSave = useCallback\(async \(\) => \{[\s\S]*?\}, \[/, /save === "pending"\) return;/],
  ["public link", formCode, /const set = useCallback\(async \(enabled: boolean\) => \{[\s\S]*?\}, \[/, /if \(pending !== null\) return;/],
];

for (const [name, src, body, guard] of MUTATIONS) {
  const block = body.exec(src)?.[0] ?? "";
  check(`the ${name} mutation exists as its own guarded handler`, block !== "");
  check(`the ${name} mutation returns early on a second activation`, guard.test(block));
  check(
    `the ${name} mutation clears its pending state on failure`,
    /catch|finally/.test(block),
  );
}

check(
  "every mutation is reached only from an onClick, never from an effect",
  !/useEffect\([\s\S]{0,400}mutateAsync/.test(routeCode),
);

check(
  "there are exactly five mutation calls, one per named handler",
  (routeCode.match(/\.mutateAsync\(/g) ?? []).length === 5 &&
    !/\.mutate\(/.test(routeCode),
);

check(
  "each pending control is disabled and marked busy while it runs",
  (routeCode.match(/aria-busy=\{/g) ?? []).length >= 5 &&
    (routeCode.match(/disabled=\{[^}]*isPending|disabled=\{[^}]*=== "pending"|disabled=\{busy\}/g) ?? []).length >= 5,
);

check(
  "cancelling one request disables only that row's control",
  /const busy = pendingId === req\.id;/.test(listCode) &&
    !/disabled=\{cancelMutation\.isPending\}/.test(listCode),
);

check(
  "nothing retries automatically after a failure",
  !/retry:\s*(true|[1-9])|setTimeout\([\s\S]{0,60}(mutate|retry)/.test(routeCode),
);

check(
  "no success is claimed before a valid response resolves",
  !/setStep\("submitted"\)[\s\S]{0,40}await |onMutate/.test(calendarCode) &&
    /await submitMutation\.mutateAsync\([\s\S]*?\);\s*setStep\("submitted"\);/.test(calendarCode),
);

check(
  "the hold POST carries exactly the documented body",
  /holdMutation\.mutateAsync\(\{ appointmentTypeId: activeTypeId, startUtc: selectedSlot \}\)/
    .test(calendarCode) &&
    /JSON\.stringify\(\{ appointmentTypeId, startUtc \}\)/.test(apiSrc),
);

check(
  "the appointment-request POST carries exactly the documented body",
  /JSON\.stringify\(\{ appointmentTypeId, startUtc, contact, source: "website" \}\)/.test(apiSrc) &&
    /contact: \{ name: name\.trim\(\), phone: phone\.trim\(\) \|\| null, email: email\.trim\(\) \|\| null \}/
      .test(calendarCode),
);

check(
  "the cancel POST addresses the server-generated public id and nothing else",
  /requests\/\$\{encodeURIComponent\(id\)\}\/cancel`, \{ method: "POST" \}/.test(apiSrc) &&
    /cancelMutation\.mutateAsync\(id\)/.test(listCode),
);

check(
  "the config PUT sends the whole config object unchanged",
  /updateAvailabilityConfig\(config\)/.test(hooksSrc) &&
    /method: "PUT", body: JSON\.stringify\(config\)/.test(apiSrc) &&
    /updateMutation\.mutateAsync\(draft\)/.test(formCode),
);

check(
  "the public-link PUT sends only the enabled flag",
  /method: "PUT", body: JSON\.stringify\(\{ enabled \}\)/.test(apiSrc),
);

check(
  "a 409 and a transport failure are told apart and worded differently",
  /status === 409 \? "holdConflict" : "holdFailed"/.test(calendarCode) &&
    /status === 409 \? "submitConflict" : "submitFailed"/.test(calendarCode),
);

check(
  "a 404 on cancel is reported as already-gone, not as a failure",
  /status === 404 \? "missing" : "failed"/.test(listCode),
);

check(
  "a 400 on save is separated from a transport failure",
  /status === 400 \? "invalid" : "failed"/.test(formCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Booking preview — the server decides availability, not the browser");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "day state comes from the server's reason and is never computed locally",
  /dayByKey\.get\(key\)/.test(calendarCode) &&
    !/isPast|dateKey < today|new Date\(\)\s*[<>]/.test(calendarCode),
);

eq("only an open day is selectable", ["open", "blocked", "fully_booked", "outside_hours", "past_booking_window", "beyond_advance_window"].map(isSelectableDay), [true, false, false, false, false, false]);
eq("an absent day is not selectable", isSelectableDay(undefined), false);

eq("every server day reason has a plain-language label", [
  dayReasonLabel("open"),
  dayReasonLabel("blocked"),
  dayReasonLabel("outside_hours"),
  dayReasonLabel("fully_booked"),
  dayReasonLabel("past_booking_window"),
  dayReasonLabel("beyond_advance_window"),
], ["Open", "Blocked date", "Outside weekly hours", "No times left", "Inside minimum notice", "Beyond booking window"]);

eq("an unknown reason degrades honestly", dayReasonLabel(undefined), "Not available");

check(
  "each day cell names its date and its reason for assistive technology",
  /aria-label=\{`\$\{dayLabel\(key\)\} — \$\{dayReasonLabel\(reason\)\}`\}/.test(calendarCode),
);

check(
  "a day that is not open is genuinely disabled, not merely styled",
  /disabled=\{!open \|\| daysQuery\.isLoading\}/.test(calendarCode),
);

check(
  "the legend explains only the three marks the grid draws",
  dayLegend().length === 3,
);

// Month arithmetic is pure and UTC-anchored.
eq("a month range spans the whole month", monthRange(2026, 2), { start: "2026-02-01", end: "2026-02-28" });
eq("a leap February is 29 days", daysInMonth(2028, 2), 29);
eq("December steps into next January", shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
eq("January steps back into last December", shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
eq("a date key is zero-padded", dateKey(2026, 3, 7), "2026-03-07");
eq("the first weekday of a month is UTC-anchored", firstWeekdayOfMonth(2026, 8), 6);

check(
  "no appointment type means the flow says so rather than showing an empty calendar",
  /config\.appointmentTypes\.length === 0[\s\S]{0,200}PREVIEW\.noTypesTitle/.test(calendarCode),
);

check(
  "an empty slot list is stated, not drawn as an error",
  /slots\.length \?\? 0\) === 0[\s\S]{0,120}PREVIEW\.slotsEmpty/.test(calendarCode),
);

check(
  "the required submission disclosure is shown before the submit control",
  calendarCode.indexOf("PREVIEW.disclosure") < calendarCode.indexOf("PREVIEW.submitLabel"),
);

eq(
  "the disclosure is the exact approved sentence",
  PREVIEW.disclosure,
  "Submitting creates an appointment request. It does not confirm an appointment or add it to a calendar.",
);

eq("the result state is Pending review", PREVIEW.resultState, "Pending review");

check(
  "the client name is required before a request can be submitted",
  /if \(name\.trim\(\) === ""\) \{[\s\S]{0,140}return;/.test(calendarCode) &&
    /aria-invalid=\{nameTouched && name\.trim\(\) === ""\}/.test(calendarCode) &&
    /aria-describedby=\{nameTouched && name\.trim\(\) === "" \? "sa-name-error" : undefined\}/
      .test(calendarCode),
);

check(
  "hold is a separate activation and is never chained into submit",
  /handleHold/.test(calendarCode) &&
    !/handleHold[\s\S]{0,200}handleSubmit\(\)/.test(calendarCode) &&
    !/mutateAsync[\s\S]{0,80}holdMutation[\s\S]{0,200}submitMutation\.mutateAsync/.test(calendarCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Requests view — only what the API returns, and one mutation");
// ═══════════════════════════════════════════════════════════════════════════

eq("a reachable state reads plainly", [
  requestStateLabel("pending_review"),
  requestStateLabel("held"),
  requestStateLabel("cancelled"),
  requestStateLabel("expired"),
], ["Pending review", "Held", "Cancelled", "Expired"]);

check(
  "no state is dressed as a success",
  (["pending_review", "held", "cancelled", "expired", "requested", "booked"] as const)
    .every((s) => requestStateTone(s) !== ("success" as never)),
);

eq("pending review is the one state that wants attention", requestStateTone("pending_review"), "attention");

eq(
  "an unmodelled state is humanised rather than given a prepared label",
  requestStateLabel("some_future_state"),
  "Some future state",
);
eq("an empty state degrades to Unknown", requestStateLabel(""), "Unknown");

eq("only a live request can be cancelled", [
  canCancel("pending_review"), canCancel("held"), canCancel("cancelled"), canCancel("expired"),
], [true, true, false, false]);

eq("a missing contact is stated, not invented", contactName(null), REQUESTS.noName);
eq("a nameless contact is stated", contactName({ name: "   " }), REQUESTS.noName);
eq("a present name is used verbatim", contactName({ name: " Dana " }), "Dana");
eq("absent phone and email are stated", contactDetail({ phone: null, email: null }), REQUESTS.noContact);
eq("a null contact is stated", contactDetail(null), REQUESTS.noContact);
eq("one present detail is shown alone", contactDetail({ phone: "555", email: null }), "555");
eq("both details are joined", contactDetail({ phone: "555", email: "a@b.c" }), "555 · a@b.c");

eq("an unknown appointment type is stated", typeName(undefined, "t-1"), REQUESTS.unknownType);
eq(
  "a known appointment type is named from the config",
  typeName({ appointmentTypes: [{ id: "t-1", name: "Cleaning", durationMin: 30 }] } as never, "t-1"),
  "Cleaning",
);

eq("every source value has a label", [
  sourceLabel("website"), sourceLabel("ai_receptionist"), sourceLabel("manual"), sourceLabel("zzz"),
], ["Website", "AI receptionist", "Added manually", "Unknown source"]);

check(
  "cancellation requires a confirmation step before the POST",
  /askToCancel/.test(listCode) &&
    /REQUESTS\.cancelConfirmTitle/.test(listCode) &&
    /onClick=\{\(\) => confirmCancel\(req\.id\)\}/.test(listCode) &&
    /onClick=\{\(\) => askToCancel\(req\.id\)\}/.test(listCode),
);

check(
  "the confirmation is labelled, described and dismissible by keyboard",
  /aria-labelledby=\{`sa-confirm-title-\$\{req\.id\}`\}/.test(listCode) &&
    /aria-describedby=\{`sa-confirm-detail-\$\{req\.id\}`\}/.test(listCode) &&
    /e\.key === "Escape"/.test(listCode),
);

check(
  "focus moves into the confirmation and back to the trigger on dismiss",
  /if \(confirming !== null\) confirmRef\.current\?\.focus\(\);/.test(listCode) &&
    /triggerRefs\.current\.get\(id\)\?\.focus\(\)/.test(listCode),
);

check(
  "the cancellation result is announced through a targeted live region",
  /className="sa-announce" role="status" aria-live="polite"/.test(listCode.replace(/\s+/g, " ")),
);

/* ── The complete successful-cancellation sequence ──────────────────────────
   Owner review found a frame announcing "Request cancelled." while the affected
   row still read "Pending review" and still offered "Cancel request". The cause
   was the QA fixture, whose requests GET replayed a pristine list and so never
   reflected the write; the production path does move the row
   (`cancelAppointmentRequestByPublicId` sets status "cancelled", and the list
   route serialises that status). These assertions pin every link in the chain
   that has to hold for the rendered result to match the announcement. */

check(
  "step 1 — the row control only opens the confirmation, it never posts",
  /onClick=\{\(\) => askToCancel\(req\.id\)\}/.test(listCode) &&
    /const askToCancel = \(id: string\) => \{[\s\S]{0,200}setConfirming\(id\);/.test(listCode) &&
    !/const askToCancel[\s\S]{0,200}mutateAsync/.test(listCode),
);

check(
  "step 2 — exactly one POST is issued, and only from the confirm control",
  (listCode.match(/cancelMutation\.mutateAsync\(/g) ?? []).length === 1 &&
    /onClick=\{\(\) => confirmCancel\(req\.id\)\}/.test(listCode),
);

check(
  "step 3 — success is recorded only after the POST resolves, never optimistically",
  /await cancelMutation\.mutateAsync\(id\);\s*setOutcome\(\{ kind: "cancelled" \}\);/.test(listCode) &&
    !/onMutate|setQueryData|optimistic/i.test(listCode),
);

check(
  "step 4 — success invalidates the requests query, so a refetch must follow",
  /mutationFn: \(id: string\) => cancelAppointmentRequest\(id\)/.test(hooksSrc) &&
    /onSuccess: \(\) => \{\s*if \(firmId !== undefined\) qc\.invalidateQueries\(\{ queryKey: \[ROOT, "requests", firmId\] \}\);/
      .test(hooksSrc),
);

check(
  "step 5 — the rows rendered are the refetched ones, held in no local copy",
  /const items = data\?\.items \?\? \[\];/.test(listCode) &&
    !/useState[^\n]*items|setItems\(/.test(listCode),
);

check(
  "step 6 — a row's status is the server's state, never the local outcome",
  /\{requestStateLabel\(req\.state\)\}/.test(listCode) &&
    !/outcome[\s\S]{0,80}requestStateLabel|requestStateLabel\([^)]*outcome/.test(listCode),
);

eq(
  "step 7 — a refetched cancelled row reads Cancelled and offers no cancellation",
  { label: requestStateLabel("cancelled"), cancellable: canCancel("cancelled") },
  { label: "Cancelled", cancellable: false },
);

check(
  "step 7 — the row's cancel control is gated on that same predicate",
  /\{canCancel\(req\.state\) && !open && \(/.test(listCode),
);

check(
  "the success announcement carries no action the product cannot perform",
  REQUESTS.cancelledAnnouncement === "Request cancelled." &&
    !/notif|calendar|email|text|sms|refund|inform|told|let them know/i
      .test(REQUESTS.cancelledAnnouncement) &&
    /Nobody is told, and nothing else changes\./.test(REQUESTS.cancelConfirmDetail),
);

check(
  "a 404 stays a distinct outcome and never renders the success sentence",
  /status === 404 \? "missing" : "failed"/.test(listCode) &&
    /outcome\.kind === "cancelled" \? REQUESTS\.cancelledAnnouncement/.test(listCode) &&
    REQUESTS.cancelMissingTitle !== REQUESTS.cancelledAnnouncement &&
    /Nothing changed\./.test(REQUESTS.cancelMissingDetail),
);

check(
  "no approve, confirm, reject, reschedule, assign, remind, export, note, filter or search control exists",
  !/>\s*(Approve|Confirm|Reject|Decline|Reschedule|Assign|Add to calendar|Send reminder|Remind|Email client|Text client|Export|Add note|Filter|Search)\b/i
    .test(listCode),
);

check(
  "the internal id is used as a key and a path segment, never displayed",
  /key=\{req\.id\}/.test(listCode) && !/>\{req\.id\}</.test(listCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Availability — the server is the authority on what is valid");
// ═══════════════════════════════════════════════════════════════════════════

eq("a timezone rejection is attributed to the timezone field", fieldForError('"X" is not a recognized IANA timezone.'), "timezone");
eq("a weekly-hours rejection is attributed", fieldForError("weeklyHours[2]: start must be before end."), "weeklyHours");
eq("an appointment-type rejection is attributed", fieldForError("appointmentTypes[0].name is required (max 100 chars)."), "appointmentTypes");
eq("a buffer rejection is attributed", fieldForError("bufferBeforeMin must be an integer between 0 and 240."), "bufferBeforeMin");
eq("an advance-window rejection is attributed", fieldForError("maxAdvanceDays must be at least 1."), "maxAdvanceDays");
eq("a blocked-date rejection is attributed", fieldForError('blockedDates[0] must be "YYYY-MM-DD".'), "blockedDates");
eq("a daily-limit rejection is attributed", fieldForError("dailyLimit must be an integer between 0 and 200."), "dailyLimit");
eq("an unrecognised sentence falls back to the form", fieldForError("Something odd."), null);
eq("a missing message falls back to the form", fieldForError(null), null);

check(
  "the server's own sentence is shown rather than a rewritten one",
  saveErrorDetail("maxAdvanceDays must be at least 1.") === "maxAdvanceDays must be at least 1.",
);
check(
  "a bare 400 still produces an accessible form-level sentence",
  saveErrorDetail("").length > 0 && saveErrorDetail(null).length > 0,
);

check(
  "a rejected value is never silently coerced into a different valid one",
  !/Math\.(min|max|round|floor|ceil)\(/.test(formCode) && !/clamp/i.test(formCode),
);

check(
  "the whole config contract is present as editable fields",
  ["timezone", "weeklyHours", "appointmentTypes", "bufferBeforeMin", "bufferAfterMin",
   "minNoticeHours", "maxAdvanceDays", "blockedDates", "dailyLimit"]
    .every((f) => formCode.includes(f)),
);

check(
  "there is no form element and every control is an explicit button",
  !/<form\b/.test(formCode) &&
    (formCode.match(/<button/g) ?? []).length === (formCode.match(/type="button"/g) ?? []).length,
);

check(
  "field errors are associated with their field",
  /aria-invalid=\{error !== null\}/.test(formCode) && /aria-describedby=\{describedBy\}/.test(formCode),
);

check(
  "the draft is seeded once and later renders never overwrite an edit in progress",
  /if \(!seeded\.current && config\)/.test(formCode),
);

check(
  "the saved response is shown, so any server normalisation is visible",
  /setDraft\(clone\(res\.config\)\)/.test(formCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Calendar connection — availability only, never a write");
// ═══════════════════════════════════════════════════════════════════════════

eq(
  "the disconnected heading is the exact approved wording",
  CALENDAR.disconnectedHeading,
  "Calendar availability isn’t connected",
);
eq(
  "the disconnected body is the exact approved wording",
  CALENDAR.disconnectedDetail,
  "Appointment times are based on the availability settings shown here.",
);

check(
  "the connected wording describes an availability check and denies writing",
  /checked alongside the availability settings/.test(CALENDAR.connectedDetail) &&
    /Nothing is written to that calendar\./.test(CALENDAR.connectedDetail),
);

check(
  "connection state is derived only from the two response fields",
  /statusQuery\.data\?\.connected === true/.test(formCode) &&
    !/provider\s*===\s*["']google["']/.test(formCode),
);

check(
  "no calendar id, account email, token or credential is ever displayed",
  !/calendarId|accountEmail|access_?[Tt]oken|refresh_?[Tt]oken|client_?secret|@gmail|calendar\.google/i
    .test(routeCode),
);

for (const state of ["checking", "connected", "disconnected", "failed"] as const) {
  const copy = calendarCopy(state);
  check(
    `the ${state} calendar copy claims no synchronisation or event creation`,
    !/sync|synchroni[sz]|creates? (an )?event|added to|writes? to (your|the) calendar/i
      .test(`${copy.heading} ${copy.detail}`),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
section("Public link — no read endpoint, so no guessed state");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "the initial state is unknown rather than a guessed off position",
  /useState<PublicLinkKnownState>\("unknown"\)/.test(formCode) &&
    /PUBLIC_LINK\.unknownDetail/.test(formCode),
);

check(
  "the unknown state says plainly that the current position cannot be read",
  /can't read whether the link is currently on/.test(PUBLIC_LINK.unknownDetail),
);

/* ── Which commands are offered, per known state ─────────────────────────────
   The owner-review defect: both "Turn on public link" and "Turn off public
   link" stayed on screen after the server had established the state, so the
   section kept asking a question it already had the answer to. */

eq(
  "unknown offers both state-setting commands, since neither position is known",
  publicLinkActions("unknown"),
  { enable: true, disable: true },
);
eq(
  "a known enabled state offers only the command that turns it off",
  publicLinkActions("enabled"),
  { enable: false, disable: true },
);
eq(
  "a known disabled state offers only the command that turns it on",
  publicLinkActions("disabled"),
  { enable: true, disable: false },
);

check(
  "the rendered commands are driven by that function, not by both being fixed",
  /const actions = publicLinkActions\(known\)/.test(formCode) &&
    /\{actions\.enable && \(/.test(formCode) &&
    /\{actions\.disable && \(/.test(formCode),
);

check(
  "each command names the state it sets rather than toggling an unknown one",
  PUBLIC_LINK.enableLabel === "Turn on public link" &&
    PUBLIC_LINK.disableLabel === "Turn off public link" &&
    /role="group" aria-label=\{PUBLIC_LINK\.commandsLabel\}/.test(formCode),
);

check(
  "neither command is styled as the recommended one",
  (() => {
    const group = /<div className="sa-link__actions"[\s\S]*?<\/div>/.exec(formCode)?.[0] ?? "";
    const classes = [...group.matchAll(/className="(sa-button[^"]*)"/g)].map((m) => m[1]);
    return classes.length === 2 && classes.every((c) => c === "sa-button");
  })(),
);

/* ── The URL follows the state, and only the server's slug ─────────────────── */

check(
  "a URL is shown only in a known enabled state that carries a server slug",
  publicLinkUrlVisible("enabled", "hv-3k9qp2r7") &&
    !publicLinkUrlVisible("disabled", "hv-3k9qp2r7") &&
    !publicLinkUrlVisible("unknown", "hv-3k9qp2r7") &&
    !publicLinkUrlVisible("enabled", null) &&
    !publicLinkUrlVisible("enabled", "   "),
);

check(
  "the disabled state drops the slug, so no URL can outlive it",
  /setSlug\(res\.enabled \? res\.slug : null\)/.test(formCode),
);

check(
  "the slug is only ever the one the server returned",
  /setSlug\(res\.enabled \? res\.slug : null\)/.test(formCode) &&
    !/Math\.random|crypto\.randomUUID|slugify|toLowerCase\(\)\.replace/.test(formCode),
);

eq(
  "a server slug becomes a URL under the configured prefix",
  publicScheduleUrl("http://x", "/ai-receptionist/dashboard/appointments", "hv-3k9qp2r7"),
  "http://x/ai-receptionist/dashboard/schedule/hv-3k9qp2r7",
);
eq(
  "no slug means no URL, under any base",
  [publicScheduleUrl("http://x", "/appointments", null),
   publicScheduleUrl("http://x", "/appointments", "")],
  [null, null],
);

check(
  "no copy, share or email affordance was invented for the link",
  !/clipboard|navigator\.share|mailto:|Copy link|Share link/i.test(formCode),
);

/* ── Mutation behaviour ────────────────────────────────────────────────────── */

check(
  "one PUT per explicit activation, guarded against a second while in flight",
  /if \(pending !== null\) return;/.test(formCode) &&
    (formCode.match(/linkMutation\.mutateAsync\(/g) ?? []).length === 1,
);

check(
  "no mutation is reachable from render, mount, view change, focus or animation",
  !/useEffect\([\s\S]{0,300}linkMutation/.test(formCode) &&
    !/onFocus=|onAnimation|onTransition/.test(formCode) &&
    /onClick=\{\(\) => set\(true\)\}/.test(formCode) &&
    /onClick=\{\(\) => set\(false\)\}/.test(formCode),
);

check(
  "the command being written is disabled and marked busy while it runs",
  /disabled=\{pending !== null\}/.test(formCode) &&
    /aria-busy=\{pending === true\}/.test(formCode) &&
    /aria-busy=\{pending === false\}/.test(formCode) &&
    /pending === true \? PUBLIC_LINK\.pendingLabel/.test(formCode) &&
    /pending === false \? PUBLIC_LINK\.pendingLabel/.test(formCode),
);

check(
  "nothing about the public link retries automatically",
  !/retry|setTimeout\([\s\S]{0,80}set\(/.test(formCode),
);

check(
  "a failure preserves the last truthful known state instead of replacing it",
  // `setFailed(true)` alone in the catch — `known` and `slug` are untouched, so
  // the state the server last established is still what is displayed.
  /catch \{\s*setFailed\(true\);\s*\}/.test(formCode) &&
    !/catch \{[\s\S]{0,120}setKnown\(/.test(formCode) &&
    !/catch \{[\s\S]{0,120}setSlug\(/.test(formCode),
);

check(
  "the pending flag is always cleared, success or failure",
  /finally \{\s*setPending\(null\);\s*\}/.test(formCode),
);

check(
  "success and failure are both announced through a polite live region",
  /className="sa-announce"\s+role="status"\s+aria-live="polite"/.test(formCode) &&
    /hidden=\{state === "unknown" \|\| state === "pending"\}/.test(formCode),
);

check(
  "enabled, disabled, pending and failed are each presented distinctly",
  ["enabledTitle", "disabledTitle", "failedTitle", "pendingLabel"]
    .every((k) => formCode.includes(`PUBLIC_LINK.${k}`)),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Prohibited claims — absent from every reachable string");
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phrase-level, deliberately. `fully_booked`, `AppointmentRequestState` and
 * `booked` as a schema value are legitimate names inside a protected API
 * contract, and rejecting the token would reject the contract itself. What is
 * banned is the *claim* — a sentence telling an operator or a client that
 * something is confirmed, scheduled, written somewhere, or that a message went
 * out.
 */
const BANNED: [string, RegExp][] = [
  /* Subject-anchored, so that a *denial* ("Nothing is confirmed and nothing is
     on a calendar") is not mistaken for the claim it exists to rule out. The
     denials themselves are asserted present further down, so this is narrower
     without being weaker. */
  ["a confirmed appointment", /\b(appointment|request|time|slot|booking)s?\s+(is|are|has been|have been|was|were|will be)\s+(confirmed|booked|scheduled)\b/i],
  ["someone confirming for you", /\b(we|the business|our team|a receptionist|someone)\s+(will\s+|'ll\s+)?(confirm|book|schedule)s?\b/i],
  ["a confirmation promise", /will be (confirmed|booked|scheduled|added)\b/i],
  ["automatic approval", /automatically (confirm|approve|accept|book|schedule)/i],
  ["a calendar write", /add(ed|s)? to (your |the |a )?calendar|creates? (a )?calendar event|calendar event will/i],
  ["calendar synchronisation", /calendar sync|sync(ed|hronis|hroniz)[a-z]* with|fully synchroni[sz]ed|real-?time sync/i],
  /* Anchored on send+object, so a neutral clause ("exactly as if a client had
     sent it") does not read as a promise to deliver a message. */
  ["an SMS promise", /\b(send|sends|sending|sent)\s+(a|an|the)?\s*(text|SMS|message|reminder|confirmation|notification)\b|\b(we|you|they)\s*('?ll|will)\s+(be\s+)?(text|SMS)|\btext (you|them|the client)\b|\bSMS (confirmation|reminder|notification)\b/i],
  ["an email promise", /(email (you|the client|confirmation|reminder))|we'?ll email/i],
  ["a reminder promise", /(send|sends|sending) (a )?reminder|reminder (will|is) sent/i],
  ["a staff notification", /notif(y|ies|ied|ication) (the )?(staff|team|receptionist|someone)|staff will be (told|notified)/i],
  ["a follow-up promise", /(we'?ll|you'?ll) (hear back|be in touch|get back|follow up)|someone will (call|contact|reach)/i],
  ["a staff assignment", /assign(ed|s)? to (a |the )?(staff|provider|member|team)/i],
  ["a payment claim", /(pay|payment|deposit|card|invoice|charge) (is )?(required|taken|collected)/i],
  ["a video meeting claim", /(zoom|google meet|teams|video (call|link|meeting))/i],
  ["a CRM synchronisation claim", /sync(ed|s)? (to|with) (the )?CRM|CRM sync/i],
  ["an AI scheduling claim", /AI (schedul|book)[a-z]*|smart schedul|auto-?schedul/i],
  ["an automated rescheduling claim", /automatic(ally)? reschedul|reschedul[a-z]* for you/i],
  ["an unlimited-scheduling claim", /unlimited (appointment|booking|scheduling)/i],
  ["a guaranteed reservation", /reserved? (permanently|for you)|guarantee[sd]? (the |your )?(time|slot)/i],
  ["a provider-status claim", /provider is (online|connected|healthy)|vapi/i],
  ["a coming-soon promise", /coming\s+soon/i],
  ["a security-theatre badge", /bank-?level|military-?grade|256-bit|secured by/i],
];

const bannedHits = (src: string) => BANNED.filter(([, re]) => re.test(src)).map(([name]) => name);

eq("no prohibited claim appears in the page", bannedHits(pageCode), []);
eq("no prohibited claim appears in the contract module", bannedHits(contractCode), []);
eq("no prohibited claim appears in the booking preview", bannedHits(calendarCode), []);
eq("no prohibited claim appears in the requests view", bannedHits(listCode), []);
eq("no prohibited claim appears in the availability view", bannedHits(formCode), []);
eq("no prohibited claim appears in the stylesheet", bannedHits(cssCode), []);

// The exhaustive surface: every string any reachable state can render.
const renderable = everyRenderableString();
check("the renderable surface is genuinely enumerated", renderable.length > 100);
eq("no prohibited claim is reachable from any state", bannedHits(renderable.join("\n")), []);

check(
  "no reachable string is empty where a state needs words",
  renderable.filter((s) => typeof s !== "string").length === 0,
);

check(
  "long prose is owned by the contract, not inlined in JSX",
  (() => {
    /* A text node, not a generic. `useState<Foo>(undefined)` and a JSX ternary
       boundary both sit between a `>` and a `<`, so the match additionally
       requires a sentence: it must open on a capital and carry none of the
       punctuation that only appears in code. */
    const inlineProse = [pageCode, calendarCode, listCode, formCode]
      .join("\n")
      .match(/>[ \t\r\n]*[A-Z][^<>{};=()]{59,}</g) ?? [];
    if (inlineProse.length > 0) console.log(`        inline prose: ${JSON.stringify(inlineProse)}`);
    return inlineProse.length === 0;
  })(),
);

/* The banned patterns above are subject-anchored so they do not fire on a
   denial. These require the denials to actually be there, so narrowing the
   patterns cannot quietly let the guarantee disappear with them. */
check(
  "the submitted result explicitly denies confirmation and a calendar entry",
  /Nothing is confirmed and nothing is on a calendar\./.test(PREVIEW.resultDetail),
);
check(
  "the pre-submit disclosure explicitly denies confirmation and a calendar entry",
  /does not confirm an appointment or add it to a calendar/.test(PREVIEW.disclosure),
);
check(
  "cancelling explicitly denies telling anyone",
  /Nobody is told/.test(REQUESTS.cancelConfirmDetail),
);
check(
  "the connected calendar wording explicitly denies writing",
  /Nothing is written to that calendar/.test(CALENDAR.connectedDetail),
);

check(
  "the removed 'nothing here is a real appointment' claim is gone",
  !/Nothing submitted here is a real appointment/i.test(routeCode),
);

check(
  "the removed 'you'll hear back to confirm' claim is gone",
  !/hear back to confirm/i.test(routeCode),
);

check(
  "the removed development-database and calendar-name disclosures are gone",
  !/Development database|Development calendar/i.test(routeCode),
);

check(
  "the removed 'reviews and books it' claim is gone",
  !/reviews and books it/i.test(routeCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Presentation — accessibility, motion, palette");
// ═══════════════════════════════════════════════════════════════════════════

check("the page owns exactly one h1", (pageCode.match(/<h1/g) ?? []).length === 1);
check(
  "panel headings are h2, so the order never skips a level",
  !/<h3|<h4|<h5|<h6/.test(routeCode) &&
    (calendarCode + listCode + formCode).includes("<h2"),
);

check(
  "no clickable generic div — every action is a real button",
  !/<div[^>]*onClick/.test(routeCode) && !/<span[^>]*onClick/.test(routeCode),
);

check(
  "every interactive target reaches the 44px minimum",
  (() => {
    // Anchored on the opening brace: ".sa-view" alone would match the
    // ".sa-views" tablist rule, which is a container and has no target size.
    const rules = [".sa-view {", ".sa-button {", ".sa-input,", ".sa-day {", ".sa-slot {", ".sa-step {", ".sa-back {"];
    return rules.every((r) => {
      const at = cssCode.indexOf(r);
      if (at === -1) return false;
      const block = cssCode.slice(at, cssCode.indexOf("}", at));
      return /min-height: 44px|min-width: 44px/.test(block);
    });
  })(),
);

/* ── Empty states ───────────────────────────────────────────────────────────
   Owner review found a stray empty dashed rectangle beside the "No appointment
   types yet" copy: `.sa-empty` was a full-measure dashed box with centred text,
   so most of it was blank ruled space that read as a missing tile or a drop
   target. It is now sized to its words. */

check(
  "an empty state is a card sized to its content, not a full-measure box",
  (() => {
    const at = cssCode.indexOf(".sa-empty {");
    if (at === -1) return false;
    const block = cssCode.slice(at, cssCode.indexOf("}", at));
    return /border: 1px solid var\(--sd-border\)/.test(block) &&
      !/dashed|dotted/.test(block) &&
      /max-width:/.test(block) &&
      /text-align: left/.test(block);
  })(),
);

check(
  "no dashed or dotted rule is drawn anywhere in this stylesheet",
  !/border[^;:]*:\s*[^;]*\b(dashed|dotted)\b/.test(cssCode),
);

check(
  "an empty state contains only real text — no icon slot, asset or placeholder",
  (() => {
    // Both empty states in this route, taken from source rather than trusted.
    const blocks = (calendarCode + listCode).match(/<section className="sa-empty"[\s\S]*?<\/section>/g) ?? [];
    return blocks.length === 2 && blocks.every((b) =>
      !/<img|<svg|<i\b|<picture|<canvas|aria-hidden="true"|Icon|placeholder|&nbsp;/i.test(b) &&
      /sa-empty__title/.test(b) && /sa-empty__detail/.test(b) &&
      // Nothing but the title and the detail.
      (b.match(/<(div|span|p|h2)\b/g) ?? []).length === 2);
  })(),
);

check(
  "the empty booking preview names the exact place an appointment type is added",
  PREVIEW.noTypesTitle === "No appointment types yet" &&
    /Add one under Availability\./.test(PREVIEW.noTypesDetail) &&
    views().some((v) => v.label === "Availability"),
);

check(
  "the empty state inherits theme, motion and zoom behaviour from shell tokens",
  (() => {
    const at = cssCode.indexOf(".sa-empty {");
    const block = cssCode.slice(at, cssCode.indexOf("}", at));
    // rem sizing and shell surface/border tokens: light, dark, zoom and
    // reduced motion are then all the shell's existing behaviour.
    return /background: var\(--sd-surface\)/.test(block) &&
      /max-width: \d+(\.\d+)?rem/.test(block) &&
      !/px\)/.test(block.replace(/1px solid/, "")) &&
      !/animation|transition/.test(block);
  })(),
);

check(
  "a visible focus ring is defined from the shell's focus tokens",
  /outline: var\(--sd-focus-width\) solid var\(--sd-focus-color\)/.test(cssCode) &&
    (cssCode.match(/:focus-visible/g) ?? []).length >= 3,
);

check(
  "the stylesheet defines no colour of its own — every value is a shell token",
  !/#[0-9a-fA-F]{3,8}\b/.test(cssCode.replace(/rect\(0 0 0 0\)/g, "")) &&
    !/\b(rgb|hsl)a?\(/.test(cssCode),
);

check(
  "no purple, indigo, ordinary green, neon, glow or heavy gradient",
  !/purple|indigo|violet|#8b5cf6|#6366f1|linear-gradient|radial-gradient|box-shadow:[^;]*(0 0 \d{2,})|blur\(/i
    .test(cssCode),
);

check(
  "no remote font, image or network request from the stylesheet",
  !/@import|url\(\s*['"]?https?:|fonts\.googleapis|fonts\.gstatic|\.woff|\.png|\.jpg|\.svg/i.test(cssCode),
);

check(
  "motion is transform and opacity only, and never loops",
  (() => {
    const keyframes = cssCode.match(/@keyframes[\s\S]*?\n\}/g) ?? [];
    return keyframes.every((k) => !/\b(width|height|left|top|margin|color|background)\s*:/.test(k)) &&
      !/infinite|animation-iteration-count/.test(cssCode);
  })(),
);

check(
  "reduced motion removes the local animation and transitions",
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.sa-panel \{ animation: none; \}/.test(cssCode),
);

check(
  "the requests table becomes a labelled stack on a narrow viewport",
  /@media \(max-width: 60rem\)[\s\S]*?\.sa-list__head \{ display: none; \}/.test(cssCode) &&
    /content: attr\(data-label\)/.test(cssCode),
);

check(
  "long values wrap rather than forcing horizontal scroll",
  (cssCode.match(/overflow-wrap: anywhere/g) ?? []).length >= 3,
);

check(
  "the dark theme is inherited from the shell, not redefined here",
  !/prefers-color-scheme|\[data-theme/.test(cssCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Built output — the claims are absent from the bundle");
// ═══════════════════════════════════════════════════════════════════════════

const distDir = path.join(repoRoot, "artifacts/helpdesk/dist/public/assets");
if (!existsSync(distDir)) {
  console.log("  SKIP  no built output present (run a production build to include these)");
} else {
  const chunks = readdirSync(distDir).filter((f) => /^Appointments-.*\.js$/.test(f));

  /**
   * Which build produced these assets — never read from the presence of the
   * chunks under test, which would make the assertion circular.
   *
   * The AR-001J correction folds every voice flag to a literal, so the parser
   * call this used to read out of the entry chunk is, by design, no longer
   * there in a canonically-flagged build. The variant is therefore declared
   * by whoever produced the build, under the same variable name it was built
   * with and read through the same truth table. An undeclared run still falls
   * back to the old echo — a non-canonical spelling keeps the parser in the
   * bundle — and reports indeterminate rather than guessing.
   *
   * ── AR-001J owner review, correction A ──────────────────────────────────
   *
   * This classifier used to split the false spellings in two: `""`,
   * `"false"` and unset counted as removed, and every other rejected
   * spelling — `"1"`, `"yes"`, `"on"`, `"true1"`, whitespace — counted as
   * built-in, because before canonicalisation those really did leave the
   * gated chunks emitted and unroutable. `vite.config.ts` now applies
   * `parseBooleanFlag`'s table once, before Vite resolves its environment and
   * therefore before Rollup constructs the module graph, so a rejected
   * spelling produces exactly the build its canonical form produces and there
   * is nothing left for a second rule to describe. The classification is
   * therefore the parser's own, called rather than restated, and the built
   * canonical value is what it is deciding about.
   */
  const buildVariant = ((): "default-gated" | "voice-enabled" | "indeterminate" => {
    const raw = ((): string | undefined | null => {
      if (process.env.AR001J_DECLARED === "1") {
        return process.env.AR001J_VITE_VOICE_PLATFORM_ENABLED;
      }
      const entryChunks = readdirSync(distDir).filter((f) => /^index-.*\.js$/.test(f));
      if (entryChunks.length !== 1) return null;
      const entrySrc = readFileSync(path.join(distDir, entryChunks[0]!), "utf8");
      const parser = /function (\w+)\(\w+\)\{[^{}]*trim\(\)\.toLowerCase\(\)==="true"\}/.exec(
        entrySrc,
      );
      if (parser === null) return null;
      return new RegExp(`${parser[1]}\\("([^"]*)"\\)`).exec(entrySrc)?.[1] ?? null;
    })();

    if (raw === null) return "indeterminate";
    return parseBooleanFlag(raw) ? "voice-enabled" : "default-gated";
  })();

  /**
   * AR-001J. `App.tsx` used to import every page unconditionally, so a
   * default-gated build emitted the Appointments chunk and simply never
   * fetched it. The import now sits behind the build boundary, so which
   * chunks exist depends on the build, and the expectation is per-variant.
   * Phase 13's own subject — what the Appointments route contains — is
   * unchanged, and is asserted against the build that contains it.
   */
  if (buildVariant === "default-gated") {
    eq("AR-001J — a default-gated build emits no Appointments chunk", chunks.length, 0);
    eq(
      "AR-001J — a default-gated build emits no Appointments stylesheet",
      readdirSync(distDir).filter((f) => /^Appointments-.*\.css$/.test(f)).length,
      0,
    );
  } else if (buildVariant === "indeterminate") {
    console.log("  SKIP  the build variant could not be read from the entry chunk");
  } else {
    check("exactly one Appointments route chunk is emitted", chunks.length === 1);
  }

  if (chunks.length === 1) {
    /**
     * Follow the route's static import graph rather than globbing one file: a
     * contract module that gains a second importer is re-chunked by Vite, and a
     * chunk-scoped assertion would then silently stop finding its strings.
     * Required strings are looked for *including* the shared entry, because the
     * entry is genuinely shipped to the route; banned strings are looked for
     * *excluding* it, because the entry carries unrelated application code.
     */
    const graph = (entry: string, includeEntry: boolean): string[] => {
      const seen = new Set<string>();
      const queue = [entry];
      while (queue.length > 0) {
        const file = queue.shift()!;
        if (seen.has(file) || !existsSync(path.join(distDir, file))) continue;
        seen.add(file);
        const src = readFileSync(path.join(distDir, file), "utf8");
        for (const m of src.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g)) {
          if (includeEntry || !/^index-/.test(m[1]!)) queue.push(m[1]!);
        }
      }
      return [...seen];
    };
    const join = (files: string[]) =>
      files.map((f) => readFileSync(path.join(distDir, f), "utf8")).join("\n");

    const built = join(graph(chunks[0]!, true));
    const routeOnly = join(graph(chunks[0]!, false));
    const wholeBundle = join(readdirSync(distDir).filter((f) => f.endsWith(".js")));

    eq("no prohibited claim survives into the built route code", bannedHits(routeOnly), []);

    check(
      "the approved disclosure reaches the built output",
      built.includes("It does not confirm an appointment or add it to a calendar."),
    );
    check(
      "the approved disconnected-calendar wording reaches the built output",
      built.includes("Appointment times are based on the availability settings shown here."),
    );
    check("the Pending review state reaches the built output", built.includes("Pending review"));

    check(
      "the built route calls only the ten documented availability paths",
      (built.match(/receptionist\/availability\/[a-z-]+/g) ?? []).every((m) =>
        ["receptionist/availability/config", "receptionist/availability/public-link",
         "receptionist/availability/calendar-status", "receptionist/availability/days",
         "receptionist/availability/slots", "receptionist/availability/hold",
         "receptionist/availability/requests"].includes(m)),
    );

    check(
      "the built route contains no confirm, approve, reschedule or calendar-write path",
      !/availability\/(confirm|approve|reject|reschedule|book|notify|remind|events|calendar-event)/i
        .test(built),
    );

    check(
      "the built route contacts no provider directly",
      !/googleapis\.com|calendar\.google|api\.vapi\.ai|vapi\.ai|js\.stripe/i.test(built),
    );

    check(
      "no private provider credential is present in any emitted chunk",
      !/VAPI_API_KEY|GOOGLE_CLIENT_SECRET|client_secret|refresh_token/i.test(wholeBundle),
    );

    const cssFiles = readdirSync(distDir).filter((f) => /^Appointments-.*\.css$/.test(f));
    check("a dedicated Appointments stylesheet is emitted", cssFiles.length === 1);

    const allCss = readdirSync(distDir)
      .filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(path.join(distDir, f), "utf8"))
      .join("\n");
    check(
      "no remote font is requested by any emitted stylesheet",
      !/@import\s+url\(|fonts\.googleapis|fonts\.gstatic|https?:\/\/[^)]*\.woff/i.test(allCss),
    );
  }
}

// ─── Result ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Phase 13 appointments contract tests passed.");
