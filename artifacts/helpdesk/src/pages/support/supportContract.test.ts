// Support copy and validation: what the screen may claim, and what it may not.
//
// The two claims worth pinning are the ones a customer would act on: that a
// request was received (true — it is stored), and that SiteMint's inbox was
// told (only when the server says so).

import { strict as assert } from "node:assert";

import {
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_COPY,
  SUPPORT_EMAIL,
  SUPPORT_STATUS,
  hasSupportFormErrors,
  sentMessage,
  supportMailto,
  validateSupportForm,
} from "./supportContract.js";

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("--- support address ---");
check("one address, used by every screen", SUPPORT_EMAIL === "info.sitemint@gmail.com");
check("mailto carries an optional subject", supportMailto("Help") === `mailto:${SUPPORT_EMAIL}?subject=Help`);
check("mailto without a subject stays bare", supportMailto() === `mailto:${SUPPORT_EMAIL}`);

console.log("--- form validation ---");
const empty = validateSupportForm({ subject: "  ", body: "", category: "question" });
check("an empty form names both fields", Boolean(empty.subject && empty.body));
check("errors are reported as a group", hasSupportFormErrors(empty));
const long = validateSupportForm({ subject: "x".repeat(161), body: "y", category: "other" });
check("an over-long subject is refused before sending", Boolean(long.subject));
const good = validateSupportForm({ subject: "Calendar", body: "It disconnects weekly.", category: "problem" });
check("a normal request passes", !hasSupportFormErrors(good));

console.log("--- what the screen may claim ---");
check(
  "a sent request only claims the inbox was told when it was",
  sentMessage(true) === SUPPORT_COPY.sentNotified && sentMessage(false) === SUPPORT_COPY.sentNotNotified,
);
check(
  "the not-notified sentence still says the request is saved",
  /saved/i.test(SUPPORT_COPY.sentNotNotified) && /not reachable/i.test(SUPPORT_COPY.sentNotNotified),
);
check(
  "no copy promises a response time",
  !Object.values(SUPPORT_COPY).some((line) => /within .*(hour|day|business)/i.test(line)),
);
check(
  "'open' does not claim somebody is already working on it",
  !/working/i.test(SUPPORT_STATUS.open.label) && !/working/i.test(SUPPORT_STATUS.open.detail),
);
check("every status has a label and a sentence", Object.values(SUPPORT_STATUS).every((s) => s.label.length > 0 && s.detail.length > 10));
check("closing is reversible, and says so", /reopen/i.test(SUPPORT_STATUS.closed.detail) && /reopen/i.test(SUPPORT_COPY.reopenNote));
check("categories are a fixed, readable list", SUPPORT_CATEGORY_OPTIONS.length === 4 && SUPPORT_CATEGORY_OPTIONS.every((o) => o.label.length > 2));

console.log(failures === 0 ? "\nAll support contract checks passed." : `\n${failures} support contract check(s) failed.`);
if (failures > 0) process.exit(1);
