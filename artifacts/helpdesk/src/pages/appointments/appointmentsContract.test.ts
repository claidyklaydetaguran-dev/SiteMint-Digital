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
  DETAIL,
  PAGE,
  REQUESTS,
  TEST_REQUEST_PREFIX,
  approveReasonCopy,
  cancelEndpointFor,
  cancelReasonCopy,
  canApprove,
  canCancel,
  canReschedule,
  contactDetail,
  contactName,
  everyRenderableString,
  isTestRequest,
  reconcileReasonCopy,
  reconcileSummary,
  requestStateLabel,
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

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Appointments contract tests passed.");
