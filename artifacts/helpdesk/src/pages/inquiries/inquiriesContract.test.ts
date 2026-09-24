/**
 * V7 — committed contract tests for the Inquiries screen.
 * Run via: tsx artifacts/helpdesk/src/pages/inquiries/inquiriesContract.test.ts
 *
 * These guard wording, not layout. Two claims in particular would be untrue if
 * the copy drifted: that an email reached someone, and that a call with no saved
 * message was dealt with.
 */
import {
  ACTIONS,
  CAPABILITY,
  COPY,
  DELIVERY,
  PAGE,
  TABS,
  URGENCY_FILTERS,
  deliveryLine,
  everyRenderableString,
  followUpLabel,
  mailtoHref,
  matchesUrgency,
  notificationLabel,
  telHref,
} from "./inquiriesContract.js";
import { DELIVERY_STATUSES, FOLLOW_UP_STATUSES, NOTIFICATION_STATES } from "../../lib/inquiriesApi.js";

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

section("Delivery evidence is separate from acceptance");

eq(
  "accepted with no event claims a hand-off and nothing more",
  deliveryLine({ state: "accepted", deliveryStatus: null }),
  DELIVERY.acceptedNoEvent,
);
check(
  "that sentence says delivery is not yet confirmed",
  /not yet confirmed/i.test(DELIVERY.acceptedNoEvent),
);
eq(
  "a delivered event is the one case that may say delivered",
  deliveryLine({ state: "accepted", deliveryStatus: "delivered" }),
  DELIVERY.delivered,
);
eq("an unconfirmed send warns it will not retry itself", deliveryLine({ state: "unconfirmed" }), DELIVERY.unconfirmed);
check(
  "the unconfirmed sentence tells the reader it will not be sent again automatically",
  /will not be sent again automatically/i.test(DELIVERY.unconfirmed),
);
eq("an abandoned send says plainly that it was not sent", deliveryLine({ state: "abandoned" }), DELIVERY.abandoned);

check(
  "every delivery status the backend can store has its own sentence",
  DELIVERY_STATUSES.every((s) => {
    const line = deliveryLine({ state: "accepted", deliveryStatus: s });
    return typeof line === "string" && line !== DELIVERY.acceptedNoEvent && line !== DELIVERY.unrecognised;
  }),
);
check(
  "each problem sentence states the problem AND what to check",
  [DELIVERY.bounced, DELIVERY.complained, DELIVERY.deliveryFailed].every((s) => /check/i.test(s)),
);
check(
  "no delivery sentence claims an inbox we cannot observe, except where an event said so",
  [DELIVERY.acceptedNoEvent, DELIVERY.unconfirmed, DELIVERY.abandoned, DELIVERY.queued, DELIVERY.sending].every(
    (s) => !/\bdelivered\b/i.test(s),
  ),
);
eq("an unrecognised state is stated, never guessed", deliveryLine({ state: "teleported" }), DELIVERY.unrecognised);

section("Follow-up actions use the caller's own details");

eq("a phone link keeps digits and a leading plus", telHref("+1 (555) 010-2231"), "tel:+15550102231");
check("a mail link carries the topic as its subject", mailtoHref("a@b.test", "Broken tap").includes("subject="));
check(
  "neither action label claims SiteMint contacts anyone",
  !/\bwe (sent|texted|emailed|called)\b/i.test(`${ACTIONS.callLabel} ${ACTIONS.emailLabel}`),
);

section("Urgency filter");

check("the filter keeps everything on 'all'", matchesUrgency({ urgency: "normal" }, "all"));
check("urgent only keeps urgent", matchesUrgency({ urgency: "urgent" }, "urgent"));
check("urgent only drops normal", !matchesUrgency({ urgency: "normal" }, "urgent"));
check("every filter option has a label", URGENCY_FILTERS.every((f) => f.label.trim() !== ""));

section("Message-taking that is not attached");

check(
  "an unavailable capability is stated rather than shown as an empty list",
  /isn't switched on/i.test(CAPABILITY.offTitle) && CAPABILITY.offFallback.trim() !== "",
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
