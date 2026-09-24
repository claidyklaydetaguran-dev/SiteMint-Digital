/**
 * V7 — committed contract tests for the Transfer Contacts screen.
 * Run via: tsx artifacts/helpdesk/src/pages/transfer-contacts/transferContactsContract.test.ts
 *
 * The claims these guard are the ones that would cause real-world harm if the
 * copy drifted: that saving dials someone, that a settings check placed a call,
 * or that a browser test can hand a caller over.
 */
import {
  COPY,
  PAGE,
  everyRenderableString,
  minutesToTimeValue,
  roleLabel,
  testOutcomeLabel,
  timeValueToMinutes,
} from "./transferContactsContract.js";
import { CONTACT_ROLES } from "../../lib/inquiriesApi.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/transfer-contacts → src/pages → src → helpdesk → artifacts → root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

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

section("Saving never dials");

check("the form states that saving calls nobody", /does not call anyone/i.test(COPY.saveNeverDialsNote));
check(
  "the save button is not worded as a call or a test",
  !/call|dial|ring|test/i.test(COPY.saveLabel),
);

section("A check is a check, not a call");

check("the action is named as a setup check", /check/i.test(COPY.checkLabel) && !/call/i.test(COPY.checkLabel));
check(
  "its confirmation promises no call and no charge",
  /will not call anyone/i.test(COPY.checkConfirmDetail) && /nothing will be charged/i.test(COPY.checkConfirmDetail),
);
check("the result states plainly that nobody was called", /nobody was called/i.test(COPY.checkNobodyCalledNote));
check(
  "a passing check is labelled ready, never connected or successful",
  !/connected|success|working/i.test(COPY.checkPassedLabel),
);

section("Browser versus telephone");

check(
  "the browser-vs-phone note says a browser test has no line to hand over",
  /browser/i.test(COPY.browserVsPhoneNote) && /phone call/i.test(COPY.browserVsPhoneNote),
);
check(
  "an untested contact says so rather than implying it works",
  /not yet tested/i.test(COPY.lastTestNever),
);

section("Consent and roles");

check(
  "the consent checkbox asserts BOTH authorisation and the person's agreement",
  /authorised/i.test(COPY.consentLabel) && /agreed/i.test(COPY.consentLabel),
);
check("its hint says nothing is dialled without it", /will not put a caller through/i.test(COPY.consentHint));
check(
  "the role hint says a role grants no access",
  /no access/i.test(COPY.roleHint) && /routing/i.test(COPY.roleHint),
);

eq("a listed role uses its own label", roleLabel("manager", null), "Manager");
eq("a custom role uses the business's own title", roleLabel("custom", "Operations Lead"), "Operations Lead");
eq("a custom role with no title falls back, never to a different role", roleLabel("custom", null), "Custom title");
eq("an unrecognised role is stated, never invented", roleLabel("supreme-leader", null), "Contact");
check("every backend role has a label", CONTACT_ROLES.every((r) => roleLabel(r, "X").length > 0));

section("Empty state");

check("it tells the business what to do", /add a transfer contact/i.test(COPY.emptyTitle));
check(
  "it says what happens meanwhile, truthfully",
  /takes a message/i.test(COPY.emptyDetail),
);

section("Hours conversion");

eq("midnight", minutesToTimeValue(0), "00:00");
eq("nine in the morning", minutesToTimeValue(540), "09:00");
eq("half past five", minutesToTimeValue(17 * 60 + 30), "17:30");
eq("end of day", minutesToTimeValue(1440), "00:00");
eq("absent hours render as empty, not as midnight", minutesToTimeValue(null), "");

eq("round trip 09:00", timeValueToMinutes("09:00"), 540);
eq("round trip 17:30", timeValueToMinutes("17:30"), 1050);
eq("a malformed time is rejected, never coerced to 0", timeValueToMinutes("nine"), null);
eq("an out-of-range hour is rejected", timeValueToMinutes("25:00"), null);
eq("an out-of-range minute is rejected", timeValueToMinutes("09:99"), null);

section("Test outcomes");

eq("connected", testOutcomeLabel("connected"), "Connected");
eq("no answer", testOutcomeLabel("no_answer"), "No answer");
eq("an unrecognised outcome is stated, never invented", testOutcomeLabel("teleported"), "Unknown");

section("String surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
check(
  "no string leaks an internal identifier or provider name",
  strings.every((s) => !/vapi|twilio|firm_id|firmId|e164/i.test(s)),
);

section("what the check tells a business before it authorises a transfer");

{
  const apiSrc = read("artifacts/api-server/src/routes/receptionistTransferContacts.ts");
  const pageSrc = read("artifacts/helpdesk/src/pages/TransferContacts.tsx");

  // A label is not enough to agree to. The business is authorising these
  // digits, and the resolver may pick a different contact than the one being
  // checked — so the check resolves and reports the number that would ring.
  check("the check resolves the number that would actually ring", apiSrc.includes("wouldDial"));
  check("and the page shows it", pageSrc.includes("report.report.wouldDial") && pageSrc.includes("phoneDisplay"));
  check("with a label that says what it is", COPY.wouldDialLabel.length > 0 && /ring/i.test(COPY.wouldDialLabel));

  // Connecting a call costs money. Saying so is not optional; quoting a rate
  // nobody agreed would be worse than saying nothing.
  check("the check says a transfer is billable", /billable/i.test(apiSrc));
  check("and quotes no rate", !/\$\d|\d+\s*(cents|p\/min|per minute)/i.test(apiSrc));

  // A cold handoff. Promising the assistant can recover the caller would be a
  // promise this mechanism cannot keep.
  check("the check says the assistant leaves the call", /assistant leaves the call/i.test(apiSrc));
  check("and says it cannot take the caller back", /cannot take them back/i.test(apiSrc));
  check(
    "no page string promises a callback after a handoff",
    strings.every((s) => !/we('| wi)ll call (you|them) back|the assistant will (come|take) back/i.test(s)),
  );
}

section("the banner states the real capability, not just an assigned number");

{
  const routeSrc = read("artifacts/api-server/src/routes/receptionistTransferContacts.ts");
  const serviceSrc = read("artifacts/api-server/src/lib/voiceTransferContacts/transferContactService.ts");
  const transferPageSrc = read("artifacts/helpdesk/src/pages/TransferContacts.tsx");

  // The defect: the banner said a caller "can be handed to a transfer contact"
  // whenever a number was assigned — at a time when no assistant carried a
  // transfer tool at all, so it was true for nobody.
  check(
    "the banner comes from the server's own capability resolution",
    routeSrc.includes("resolveEffectiveCapabilities") && routeSrc.includes("describeTransferCapability"),
  );
  check(
    "and an assigned number alone is never enough to claim it",
    /telephoneTransferAvailable: active && numberAssigned/.test(serviceSrc),
  );
  check(
    "a workspace it is not switched on for is told SiteMint has to do that",
    /not switched on by SiteMint/i.test(serviceSrc),
  );
  check(
    "a business with no authorised contact is told to add one and confirm consent",
    /add a contact and confirm/i.test(serviceSrc) && /agreed to receive transferred calls/i.test(serviceSrc),
  );
  check(
    "the page states the verdict before the explanation",
    transferPageSrc.includes("COPY.capabilityStateActive") &&
      transferPageSrc.includes("COPY.capabilityStateBlocked") &&
      transferPageSrc.includes("capability.state"),
  );
  check(
    "and the blocked wording does not imply transfers work",
    /not available yet/i.test(COPY.capabilityStateBlocked) && !/available\./i.test(COPY.capabilityStateBlocked),
  );
}

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
