/**
 * V5 customer-shell foundation — committed contract tests for the Setup hub
 * (S-3).
 *
 * Run via: pnpm --filter @workspace/scripts run test
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTIVATE_DISABLED_REASON,
  EMPTY_SETUP_SIGNALS,
  SETUP_STEPS,
  buildDisplaySteps,
  buildNextAction,
  buildReviewSummary,
  deriveStepStatuses,
  isSetupComplete,
  newlyInferredDone,
  progressLabel,
  type SavedSteps,
  type SetupSignals,
} from "./setupContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/setup → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/Setup.tsx");

let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n--- the ten steps are in the approved order ---");
{
  check("exactly ten steps", SETUP_STEPS.length === 10);
  check(
    "order matches S-3",
    JSON.stringify(SETUP_STEPS.map((s) => s.key)) ===
      JSON.stringify([
        "business",
        "assistant",
        "prompt",
        "voice",
        "availability",
        "appointment_types",
        "calendar",
        "test_call",
        "phone_number",
        "review",
      ]),
  );
  check("review has no deep link (it is answered in-page)", SETUP_STEPS.find((s) => s.key === "review")!.href === null);
  for (const s of SETUP_STEPS) {
    if (s.key === "review") continue;
    check(`${s.key} has a deep link`, typeof s.href === "string" && s.href!.length > 0);
  }
  check("business deep-links to account settings", SETUP_STEPS.find((s) => s.key === "business")!.href === "/account/settings");
  check("availability deep-links under scheduling", SETUP_STEPS.find((s) => s.key === "availability")!.href === "/scheduling/availability");
  check("appointment_types deep-links under scheduling", SETUP_STEPS.find((s) => s.key === "appointment_types")!.href === "/scheduling/appointment-types");
  check("calendar deep-links under scheduling", SETUP_STEPS.find((s) => s.key === "calendar")!.href === "/scheduling/calendar");
  check("phone_number deep-links under channels", SETUP_STEPS.find((s) => s.key === "phone_number")!.href === "/channels/phone-number");
}

console.log("\n--- status derivation combines saved state and inference ---");
{
  const empty: SavedSteps = {};
  const allPending = deriveStepStatuses(empty, EMPTY_SETUP_SIGNALS);
  check("a brand-new firm has every step pending", Object.values(allPending).every((s) => s === "pending"));

  const savedDone: SavedSteps = { business: { status: "done" } };
  check("a saved done status is respected with no signal", deriveStepStatuses(savedDone, EMPTY_SETUP_SIGNALS).business === "done");

  const signals: SetupSignals = {
    businessComplete: true,
    availabilityConfigured: false,
    calendarConnected: true,
    phoneAssigned: null,
  };
  const inferred = deriveStepStatuses({}, signals);
  check("business is inferred done from real data alone", inferred.business === "done");
  check("calendar is inferred done from real data alone", inferred.calendar === "done");
  check("availability stays pending when the signal is explicitly false", inferred.availability === "pending");
  check("a null signal (unknown) never marks a step done", inferred.phone_number === "pending");
  check(
    "inference never touches assistant/prompt/voice/test_call/review — those come only from saved state",
    ["assistant", "prompt", "voice", "test_call", "review"].every((k) => inferred[k as keyof typeof inferred] === "pending"),
  );

  const savedBlocked: SavedSteps = { calendar: { status: "blocked" } };
  const blockedWithGoodSignal = deriveStepStatuses(savedBlocked, { ...EMPTY_SETUP_SIGNALS, calendarConnected: false });
  check("a saved blocked status is preserved when the signal does not contradict it", blockedWithGoodSignal.calendar === "blocked");
  const blockedButNowTrue = deriveStepStatuses(savedBlocked, { ...EMPTY_SETUP_SIGNALS, calendarConnected: true });
  check("real data can still resolve a previously-blocked step to done", blockedButNowTrue.calendar === "done");
}

console.log("\n--- writing back only what changed (idempotent) ---");
{
  const signals: SetupSignals = { businessComplete: true, availabilityConfigured: true, calendarConnected: false, phoneAssigned: false };
  const firstPass = newlyInferredDone({}, signals);
  check("both true signals are reported as newly done", JSON.stringify(firstPass.sort()) === JSON.stringify(["availability", "business"]));

  const alreadySaved: SavedSteps = { business: { status: "done" }, availability: { status: "done" } };
  const secondPass = newlyInferredDone(alreadySaved, signals);
  check("nothing is reported once the server already has it — idempotent", secondPass.length === 0);
}

console.log("\n--- display steps: exactly one 'next' unless blocked ---");
{
  const statuses = deriveStepStatuses({ business: { status: "done" } }, EMPTY_SETUP_SIGNALS);
  const display = buildDisplaySteps(statuses);
  const nextCount = display.filter((s) => s.status === "next").length;
  check("exactly one step is marked next", nextCount === 1);
  check("the first incomplete step is the one marked next", display.find((s) => s.status === "next")!.key === "assistant");
  check("done stays done in the display list", display.find((s) => s.key === "business")!.status === "done");

  const withBlock = buildDisplaySteps(deriveStepStatuses({ business: { status: "done" }, assistant: { status: "blocked" } }, EMPTY_SETUP_SIGNALS));
  check("a blocked step is never relabelled next", withBlock.find((s) => s.key === "assistant")!.status === "blocked");
  check("no step is marked next when the first incomplete one is blocked", withBlock.filter((s) => s.status === "next").length === 0);
  check("a blocked step carries a reason", Boolean(withBlock.find((s) => s.key === "assistant")!.blockedReason));
}

console.log("\n--- progress label and completion ---");
{
  check("0 of 10 for a brand-new firm", progressLabel(deriveStepStatuses({}, EMPTY_SETUP_SIGNALS)) === "0 of 10");
  const nineDone: SavedSteps = Object.fromEntries(
    SETUP_STEPS.filter((s) => s.key !== "review").map((s) => [s.key, { status: "done" }]),
  );
  check("9 of 10 once every non-review step is done", progressLabel(deriveStepStatuses(nineDone, EMPTY_SETUP_SIGNALS)) === "9 of 10");
  check("setup is 'complete' once every step but review is done", isSetupComplete(deriveStepStatuses(nineDone, EMPTY_SETUP_SIGNALS)) === true);
  check("setup is not complete with one step outstanding", isSetupComplete(deriveStepStatuses({}, EMPTY_SETUP_SIGNALS)) === false);
}

console.log("\n--- next action and review summary ---");
{
  const statuses = deriveStepStatuses({}, EMPTY_SETUP_SIGNALS);
  const display = buildDisplaySteps(statuses);
  const action = buildNextAction(display);
  check("the next action targets the first incomplete step", action.href === "/account/settings");

  const nineDone: SavedSteps = Object.fromEntries(
    SETUP_STEPS.filter((s) => s.key !== "review").map((s) => [s.key, { status: "done" }]),
  );
  const doneDisplay = buildDisplaySteps(deriveStepStatuses(nineDone, EMPTY_SETUP_SIGNALS));
  const doneAction = buildNextAction(doneDisplay);
  check("once everything else is done, the next action points at review", doneAction.href === null || doneAction.href === "#review");

  const review = buildReviewSummary(doneDisplay);
  check("review lists nine done steps", review.doneTitles.length === 9);
  check("review never lists itself as done or missing", !review.doneTitles.includes("Final review and activation") && !review.missingTitles.includes("Final review and activation"));
}

console.log("\n--- the page never activates automatically ---");
{
  check("the activate control is disabled", pageSrc.includes("Activate receptionist") && /disabled\s*\n?\s*aria-disabled="true"/.test(pageSrc));
  check("the disabled reason is shown, not silently hidden", pageSrc.includes("ACTIVATE_DISABLED_REASON"));
  check(
    "the reason names SiteMint-mediated activation",
    ACTIVATE_DISABLED_REASON.includes("SiteMint") && ACTIVATE_DISABLED_REASON.toLowerCase().includes("private-beta"),
  );
  check("there is exactly one primary next-action control", pageSrc.includes("<NextActionCard"));
  check("newly-inferred steps are written back, not just displayed", pageSrc.includes("useSyncInferredSteps"));
}

console.log(
  failed === 0 ? "\nAll setupContract tests passed." : `\nsetupContract: ${failed} check(s) FAILED.`,
);
if (failed > 0) process.exit(1);
