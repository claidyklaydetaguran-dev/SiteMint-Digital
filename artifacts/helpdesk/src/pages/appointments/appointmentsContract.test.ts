/**
 * V5 PR-7/PR-8 — committed contract tests for the Appointments screen
 * (requests list + detail drawer).
 *
 * Run via: tsx artifacts/helpdesk/src/pages/appointments/appointmentsContract.test.ts
 *
 * The Frontend V2 Phase 13 version of this file asserted, at length, that no
 * confirm/approve/reschedule/calendar-write endpoint existed for this route
 * and that `booked`/`rescheduled` were unreachable states. That premise is
 * gone: the calendar router (`receptionistCalendar.ts`) now provides exactly
 * those actions. This file replaces those assertions with the new premise —
 * approve/reschedule/cancel exist, are backed by real endpoints, and every
 * response `reason` this module can receive is mapped to plain copy — rather
 * than silently dropping the old ones.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADD,
  DETAIL,
  GROUPS,
  GROUP_ORDER,
  PAGE,
  REQUESTS,
  TEST_REQUEST_PREFIX,
  approveReasonCopy,
  cancelEndpointFor,
  cancelReasonCopy,
  canApprove,
  canCancel,
  canReschedule,
  addOutcomeCopy,
  contactDetail,
  contactName,
  emptyAddForm,
  groupForState,
  groupRequests,
  everyRenderableString,
  isTestRequest,
  reconcileReasonCopy,
  reconcileSummary,
  requestStateLabel,
  validateAddAppointment,
  requestStateTone,
  rescheduleReasonCopy,
  sourceLabel,
  statusHistory,
  typeName,
} from "./appointmentsContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

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

// ═══════════════════════════════════════════════════════════════════════════
section("Premise — the calendar router now provides the lifecycle actions");
// ═══════════════════════════════════════════════════════════════════════════

const calendarRouteSrc = read("artifacts/api-server/src/routes/receptionistCalendar.ts");
const CALENDAR_ROUTER_CALLS = calendarRouteSrc.match(/router\.(get|post|put|delete)\("([^"]+)"/g) ?? [];

check(
  "the calendar router exposes approve, cancel, reschedule and reconcile",
  ["approve", "cancel", "reschedule", "reconcile"].every((token) =>
    CALENDAR_ROUTER_CALLS.some((c) => c.includes(token))),
);

const availabilityRouteSrc = read("artifacts/api-server/src/routes/receptionistAvailability.ts");
check(
  "the unchanged availability router still has no confirm/approve/reschedule/calendar-write endpoint of its own",
  !/router\.(get|post|put)\("[^"]*\/(confirm|approve|reschedule|calendar-event)/i.test(availabilityRouteSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
section("State reachability and tone");
// ═══════════════════════════════════════════════════════════════════════════

eq("pending_review labels correctly", requestStateLabel("pending_review"), "Pending review");
eq("booked is now a named, reachable label", requestStateLabel("booked"), "Booked");
eq("rescheduled is now a named, reachable label", requestStateLabel("rescheduled"), "Rescheduled");
eq("cancelled labels correctly", requestStateLabel("cancelled"), "Cancelled");
eq("an unknown state is humanised, never invented", requestStateLabel("some_future_state"), "Some future state");
eq("empty state is Unknown", requestStateLabel(""), "Unknown");

eq("booked carries a settled tone, not muted", requestStateTone("booked"), "settled");
eq("rescheduled carries a settled tone", requestStateTone("rescheduled"), "settled");
eq("pending_review carries an attention tone", requestStateTone("pending_review"), "attention");
eq("cancelled carries a muted tone", requestStateTone("cancelled"), "muted");

// ═══════════════════════════════════════════════════════════════════════════
section("Action availability, exactly matching the calendar router's own state guards");
// ═══════════════════════════════════════════════════════════════════════════

check("only pending_review can be approved", canApprove("pending_review") && !canApprove("held") && !canApprove("booked") && !canApprove("cancelled"));
check("only booked can be rescheduled", canReschedule("booked") && !canReschedule("pending_review") && !canReschedule("cancelled"));
check("pending_review, held and booked can be cancelled; nothing else can", (
  canCancel("pending_review") && canCancel("held") && canCancel("booked") &&
  !canCancel("cancelled") && !canCancel("expired") && !canCancel("rescheduled")
));

eq("pending_review cancels through the unchanged availability endpoint", cancelEndpointFor("pending_review"), "availability");
eq("held cancels through the unchanged availability endpoint", cancelEndpointFor("held"), "availability");
eq("booked cancels through the new calendar endpoint", cancelEndpointFor("booked"), "calendar");
eq("a non-cancellable state has no endpoint", cancelEndpointFor("cancelled"), null);

// ═══════════════════════════════════════════════════════════════════════════
section("Reason → plain copy: every documented reason maps, nothing is a raw token");
// ═══════════════════════════════════════════════════════════════════════════

const APPROVE_REASONS = ["disabled", "no_connection", "not_found", "not_approvable", "event_write_failed", "conflict_after_write"];
for (const reason of APPROVE_REASONS) {
  const copy = approveReasonCopy(reason);
  check(`approve reason "${reason}" maps to non-empty plain copy`, copy.title.length > 0 && copy.detail.length > 0);
  check(`approve reason "${reason}" copy contains no raw token`, !copy.detail.includes(reason.replace(/_/g, "")));
}
check("an undocumented approve reason still gets safe generic copy", approveReasonCopy("something_new").detail.length > 0);
check("a null approve reason still gets safe generic copy", approveReasonCopy(null).detail.length > 0);

const CANCEL_REASONS = ["not_found", "not_booked", "conflict"];
for (const reason of CANCEL_REASONS) {
  const copy = cancelReasonCopy(reason);
  check(`cancel reason "${reason}" maps to non-empty plain copy`, copy.title.length > 0 && copy.detail.length > 0);
}

const RESCHEDULE_REASONS = ["not_found", "not_booked", "slot_unavailable", "conflict"];
for (const reason of RESCHEDULE_REASONS) {
  const copy = rescheduleReasonCopy(reason);
  check(`reschedule reason "${reason}" maps to non-empty plain copy`, copy.title.length > 0 && copy.detail.length > 0);
}

eq("reconcile's one reason maps to the disabled-workspace sentence", reconcileReasonCopy("disabled").detail, "Calendar connection is not enabled on this workspace yet.");

// ═══════════════════════════════════════════════════════════════════════════
section("Status history is derived, never fabricated beyond what's certain");
// ═══════════════════════════════════════════════════════════════════════════

const createdAt = "2026-01-01T00:00:00.000Z";
eq("pending_review history is Created → Pending review", statusHistory("pending_review", createdAt).map((s) => s.label), ["Created", "Pending review"]);
eq("booked history shows the full approved path", statusHistory("booked", createdAt).map((s) => s.label), ["Created", "Pending review", "Booked"]);
eq("rescheduled history extends the booked path", statusHistory("rescheduled", createdAt).map((s) => s.label), ["Created", "Pending review", "Booked", "Rescheduled"]);
check("cancelled history does not invent an intermediate state it can't know", statusHistory("cancelled", createdAt).length === 2);
check("exactly one step is marked current", statusHistory("booked", createdAt).filter((s) => s.tone === "current").length === 1);
eq("Created always carries the real createdAt timestamp", statusHistory("booked", createdAt)[0]!.at, createdAt);

// ═══════════════════════════════════════════════════════════════════════════
section("Test Booking rows are identifiable and never shown with a fabricated real name");
// ═══════════════════════════════════════════════════════════════════════════

check("a TEST-prefixed contact is recognised", isTestRequest({ name: `${TEST_REQUEST_PREFIX}Jane`, phone: null, email: null }));
check("a real contact is not misclassified as a test", !isTestRequest({ name: "Jane", phone: null, email: null }));
check("a null contact is not a test", !isTestRequest(null));
eq("the prefix is stripped from the displayed name", contactName({ name: `${TEST_REQUEST_PREFIX}Jane`, phone: null, email: null }), "Jane");
eq("a missing contact name is stated, never blank", contactName(null), REQUESTS.noName);
eq("a contact with neither phone nor email is stated, never blank", contactDetail({ name: "Jane", phone: null, email: null }), REQUESTS.noContact);

// ═══════════════════════════════════════════════════════════════════════════
section("Reconcile summary and helpers");
// ═══════════════════════════════════════════════════════════════════════════

eq("zero removed, zero failed", reconcileSummary(0, 0), "0 stray events removed.");
eq("one removed is singular", reconcileSummary(1, 0), "1 stray event removed.");
eq("removed with failures names both", reconcileSummary(3, 1), "3 stray events removed, 1 couldn't be removed.");
eq("an unrecognised source is stated, never invented", sourceLabel("carrier_pigeon"), "Unknown source");
eq("an unmatched type id is stated, never invented", typeName(undefined, "x"), REQUESTS.unknownType);

// ═══════════════════════════════════════════════════════════════════════════
section("String surface");
// ═══════════════════════════════════════════════════════════════════════════

const strings = everyRenderableString();
check("every renderable string is a non-empty string", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
check("the drawer's approve label is present", strings.includes(DETAIL.approveLabel));
check("the drawer's reschedule label is present", strings.includes(DETAIL.rescheduleLabel));
check("the drawer's cancel label is present", strings.includes(DETAIL.cancelLabel));
check("no string echoes a raw server reason token verbatim", strings.every((s) =>
  !/\bevent_write_failed\b|\bconflict_after_write\b|\bnot_approvable\b|\bslot_unavailable\b/.test(s)));

section("requests and confirmed appointments are kept apart");

// They shared one list called "Requests", which meant a confirmed appointment
// was filed under a word that denies somebody is expected to turn up for it,
// and the only question that matters — what still needs me? — had to be
// answered by reading a status column on every row.
eq("a request nobody has accepted needs a decision", groupForState("pending_review"), "decide");
eq("a held slot needs a decision too", groupForState("held"), "decide");
eq("a booked appointment is confirmed", groupForState("booked"), "confirmed");
eq("a rescheduled appointment is still confirmed", groupForState("rescheduled"), "confirmed");
eq("a cancelled appointment is closed", groupForState("cancelled"), "closed");
eq("an expired one is closed", groupForState("expired"), "closed");
eq("an unknown state is closed rather than silently confirmed", groupForState("something_new"), "closed");

const sample = [
  { id: "a", state: "pending_review" },
  { id: "b", state: "booked" },
  { id: "c", state: "cancelled" },
  { id: "d", state: "held" },
];
eq("grouping keeps every row exactly once", groupRequests(sample).decide.map((r) => r.id).concat(
  groupRequests(sample).confirmed.map((r) => r.id),
  groupRequests(sample).closed.map((r) => r.id),
).sort(), ["a", "b", "c", "d"]);
eq("the decision group comes first", GROUP_ORDER[0], "decide");
check("the decision group says the caller was not told it was booked", /requested, not booked/i.test(GROUPS.decide.detail));
// "Nothing is waiting on you" must not be reachable as "you have no
// appointments" — they are different facts and the empty copy differs.
check("each group has its own empty sentence", new Set(GROUP_ORDER.map((g) => GROUPS[g].emptyDetail)).size === GROUP_ORDER.length);

section("adding an appointment the business took itself");

const form = emptyAddForm("3", "2027-05-04");
eq("a new form holds no time and no consent", [form.startUtc, form.phoneConsent, form.smsConsent, form.emailConsent], ["", false, false, false]);

check("a name is required", validateAddAppointment({ ...form, startUtc: "2027-05-04T16:00:00.000Z" }).ok === false);
check("a time is required", validateAddAppointment({ ...form, name: "Dana" }).ok === false);
const valid = validateAddAppointment({ ...form, name: "  Dana Rivera  ", startUtc: "2027-05-04T16:00:00.000Z", phone: " 07700 900123 ", email: "" });
check("a complete form is accepted", valid.ok === true);
if (valid.ok) {
  eq("the name is trimmed", valid.payload.name, "Dana Rivera");
  eq("an empty optional field becomes null, not an empty string", valid.payload.email, null);
  eq("a filled optional field is kept", valid.payload.phone, "07700 900123");
  // The defect this prevents: treating a phone number's presence as permission
  // to ring it. Consent is only ever what was explicitly ticked.
  eq("a phone number alone is not consent to call", valid.payload.phoneConsent, false);
  eq("nor to text", valid.payload.smsConsent, false);
}
const consented = validateAddAppointment({ ...form, name: "Dana", startUtc: "x", phoneConsent: true });
if (consented.ok) eq("an explicit tick is carried through", consented.payload.phoneConsent, true);

section("what a business is told after adding one");

// Creating the row and writing the calendar event are two steps, and only one
// word means a calendar anywhere knows about the appointment.
eq("only 'booked' is reported as confirmed", addOutcomeCopy("booked").title, ADD.confirmedTitle);
check("everything else says it is not on a calendar yet", ["no_connection", "disabled", "event_write_failed", null].every(
  (o) => addOutcomeCopy(o).title === ADD.savedTitle));
check("no calendar connected is explained differently from a failed write",
  addOutcomeCopy("no_connection").detail !== addOutcomeCopy("event_write_failed").detail);
check("the saved-but-unconfirmed copy still says the time is held", /holds the time/i.test(addOutcomeCopy(null).detail));
check("and says what to do next", /approve|connect a calendar/i.test(addOutcomeCopy(null).detail));
// A saved-not-confirmed outcome must never be toned as a success.
eq("a confirmed outcome is toned ok", addOutcomeCopy("booked").tone, "ok");
eq("an unconfirmed one is not", addOutcomeCopy("no_connection").tone, "warn");

check("the panel offers times from the real availability endpoint, not a free-text time box",
  read("artifacts/helpdesk/src/components/booking/AddAppointmentPanel.tsx").includes("useAvailabilitySlots"));
check("and records who added it",
  read("artifacts/helpdesk/src/components/booking/AddAppointmentPanel.tsx").includes('source: "manual"'));


console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Appointments contract tests passed.");
