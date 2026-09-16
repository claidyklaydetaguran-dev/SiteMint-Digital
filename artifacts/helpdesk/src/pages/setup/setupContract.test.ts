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
  PROGRESS_SAVE,
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
  type SetupStepKey,
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

/**
 * Every signal at one value.
 *
 * Status comes from live capability now, not from saved ticks, so a test that
 * wants to describe a finished account has to say every capability is
 * genuinely in place — and one that wants "not checked" says so with nulls
 * rather than by leaving fields out.
 */
function allSignals(value: boolean | null): SetupSignals {
  return {
    businessComplete: value,
    emailVerified: value,
    assistantPublished: value,
    assistantSynchronized: value,
    promptReady: value,
    voiceChosen: value,
    availabilityConfigured: value,
    appointmentTypesReady: value,
    calendarReady: value,
    phoneAssigned: value,
    testCallMade: value,
  };
}
const NONE_MET = allSignals(false);
const ALL_MET = allSignals(true);
const MEASURABLE = SETUP_STEPS.filter((s) => s.key !== "review");

console.log("\n--- the ten steps are in the approved order ---");
{
  // Eleven since email confirmation was added: setup could be finished in full
  // and the account still receive nothing, because every send needs a verified
  // address and no step mentioned it.
  check("exactly eleven steps", SETUP_STEPS.length === 11);
  check(
    "order matches S-3",
    JSON.stringify(SETUP_STEPS.map((s) => s.key)) ===
      JSON.stringify([
        "business",
        "email_verified",
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

console.log("\n--- status is derived from live capability, not from stored ticks ---");
{
  const allPending = deriveStepStatuses({}, NONE_MET);
  check("a brand-new firm has every measurable step pending", MEASURABLE.every((s) => allPending[s.key] === "pending"));

  // The defect this replaces: a stored `done` used to win outright, so a step
  // stayed ticked long after the thing it described had stopped being true —
  // a calendar whose access was withdrawn, a number that was released.
  check(
    "a stored tick does not survive the capability going away",
    deriveStepStatuses({ calendar: { status: "done" } }, { ...NONE_MET, calendarReady: false }).calendar === "pending",
  );
  check(
    "and the live answer ticks a step with or without a saved record",
    deriveStepStatuses({}, { ...NONE_MET, calendarReady: true }).calendar === "done",
  );

  // "We could not ask" is a third answer, shown as neither of the other two.
  const unreadable = deriveStepStatuses({ calendar: { status: "done" } }, { ...NONE_MET, calendarReady: null });
  check("an unreadable signal is 'not checked'", unreadable.calendar === "unknown");
  check("and never done on the strength of an old tick", unreadable.calendar !== "done");
  check(
    "nothing is checked when nothing could be read",
    MEASURABLE.every((s) => deriveStepStatuses({}, allSignals(null))[s.key] === "unknown"),
  );

  // Each step is answered by its own signal and no other.
  const oneAtATime: [keyof SetupSignals, SetupStepKey][] = [
    ["businessComplete", "business"],
    ["emailVerified", "email_verified"],
    ["assistantPublished", "assistant"],
    ["promptReady", "prompt"],
    ["voiceChosen", "voice"],
    ["availabilityConfigured", "availability"],
    ["appointmentTypesReady", "appointment_types"],
    ["calendarReady", "calendar"],
    ["testCallMade", "test_call"],
    ["phoneAssigned", "phone_number"],
  ];
  for (const [signal, step] of oneAtATime) {
    const statuses = deriveStepStatuses({}, { ...NONE_MET, [signal]: true });
    check(`${step} is settled by ${signal} alone`, statuses[step] === "done");
    check(
      `and ${signal} settles nothing else`,
      MEASURABLE.filter((s) => s.key !== step).every((s) => statuses[s.key] !== "done"),
    );
  }

  // A recorded block carries a reason this page cannot reconstruct.
  const savedBlocked: SavedSteps = { calendar: { status: "blocked" } };
  check("a saved block is preserved while the capability is genuinely absent", deriveStepStatuses(savedBlocked, { ...NONE_MET, calendarReady: false }).calendar === "blocked");
  check("real data can still resolve a previously-blocked step to done", deriveStepStatuses(savedBlocked, { ...NONE_MET, calendarReady: true }).calendar === "done");

  // Requesting activation is an action taken with SiteMint, not a capability.
  check("review is never derived", deriveStepStatuses({}, ALL_MET).review === "pending");
  check("and a saved review is honoured", deriveStepStatuses({ review: { status: "done" } }, ALL_MET).review === "done");
}

console.log("\n--- writing back only what changed (idempotent) ---");
{
  const signals: SetupSignals = { ...NONE_MET, businessComplete: true, availabilityConfigured: true };
  const firstPass = newlyInferredDone({}, signals);
  check("both met capabilities are reported as newly done", JSON.stringify(firstPass.sort()) === JSON.stringify(["availability", "business"]));

  const alreadySaved: SavedSteps = { business: { status: "done" }, availability: { status: "done" } };
  const secondPass = newlyInferredDone(alreadySaved, signals);
  check("nothing is reported once the server already has it — idempotent", secondPass.length === 0);
  check("an unreadable signal is never written back as done", newlyInferredDone({}, allSignals(null)).length === 0);
  check("a fully-ready account reports every measurable step", newlyInferredDone({}, ALL_MET).length === MEASURABLE.length);
  check("and never review, which is not a capability", !newlyInferredDone({}, ALL_MET).includes("review"));
}

console.log("\n--- display steps: exactly one 'next' unless blocked ---");
{
  const statuses = deriveStepStatuses({}, { ...NONE_MET, businessComplete: true });
  const display = buildDisplaySteps(statuses);
  const nextCount = display.filter((s) => s.status === "next").length;
  check("exactly one step is marked next", nextCount === 1);
  check("the first incomplete step is the one marked next", display.find((s) => s.status === "next")!.key === "email_verified");
  check("done stays done in the display list", display.find((s) => s.key === "business")!.status === "done");

  const withBlock = buildDisplaySteps(
    deriveStepStatuses({ assistant: { status: "blocked" } }, { ...NONE_MET, businessComplete: true, emailVerified: true }),
  );
  check("a blocked step is never relabelled next", withBlock.find((s) => s.key === "assistant")!.status === "blocked");
  check("no step is marked next when the first incomplete one is blocked", withBlock.filter((s) => s.status === "next").length === 0);
  check("a blocked step carries a reason", Boolean(withBlock.find((s) => s.key === "assistant")!.blockedReason));

  // An unchecked step is not "next" either: naming it the next thing to do
  // would assert it is outstanding, which is exactly what could not be shown.
  const withUnknown = buildDisplaySteps(deriveStepStatuses({}, { ...NONE_MET, businessComplete: null }));
  check("an unchecked step keeps its own label", withUnknown.find((s) => s.key === "business")!.status === "unknown");
  check("and is never promoted to next", withUnknown.filter((s) => s.status === "next").length === 0);
}

console.log("\n--- progress label and completion ---");
{
  check("nothing done for a brand-new firm", progressLabel(deriveStepStatuses({}, NONE_MET)) === "0 of 11");
  const everythingMet = deriveStepStatuses({}, ALL_MET);
  check("every measurable capability in place reads as all but review", progressLabel(everythingMet) === "10 of 11");
  check("setup is 'complete' once every step but review is done", isSetupComplete(everythingMet) === true);
  check("setup is not complete with one step outstanding", isSetupComplete(deriveStepStatuses({}, NONE_MET)) === false);
  check("nor with one capability that could not be checked", isSetupComplete(deriveStepStatuses({}, { ...ALL_MET, calendarReady: null })) === false);

  // The heart of it: ticks alone can no longer report a ready receptionist.
  const everyTick = Object.fromEntries(SETUP_STEPS.map((s) => [s.key, { status: "done" }])) as SavedSteps;
  check("a full set of saved ticks never completes setup on its own", isSetupComplete(deriveStepStatuses(everyTick, allSignals(null))) === false);
}

console.log("\n--- next action and review summary ---");
{
  const statuses = deriveStepStatuses({}, NONE_MET);
  const display = buildDisplaySteps(statuses);
  const action = buildNextAction(display);
  check("the next action targets the first incomplete step", action.href === "/account/settings");

  const doneDisplay = buildDisplaySteps(deriveStepStatuses({}, ALL_MET));
  const doneAction = buildNextAction(doneDisplay);
  check("once everything else is done, the next action points at review", doneAction.href === null || doneAction.href === "#review");

  // A page that could not check a step must not congratulate the customer on
  // a setup it never verified.
  const unknownAction = buildNextAction(buildDisplaySteps(deriveStepStatuses({}, allSignals(null))));
  check("an unchecked step is offered as somewhere to go, not reported as complete", !/complete/i.test(unknownAction.title));

  const review = buildReviewSummary(doneDisplay);
  check("review lists every done step but itself", review.doneTitles.length === SETUP_STEPS.length - 1);
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

console.log("\n--- confirming the email address ---");
{
  // The gap this closes: every message SiteMint sends goes only to a VERIFIED
  // address, so a business could tick off all ten original steps and still
  // never hear about a single call — with nothing on the checklist to explain
  // it.
  const step = SETUP_STEPS.find((s) => s.key === "email_verified");
  check("the step exists", step !== undefined);
  check("it comes second, before any assistant work", SETUP_STEPS[1]!.key === "email_verified");
  check("it links to the page that finishes it", step?.href === "/verify-email");
  check("it says what is lost without it", /nothing is sent/i.test(step?.detail ?? ""));

  const verified = deriveStepStatuses({}, { ...NONE_MET, emailVerified: true });
  check("a verified address ticks it without a saved record", verified.email_verified === "done");
  const unverified = deriveStepStatuses({}, { ...NONE_MET, emailVerified: false });
  check("an unverified one leaves it outstanding", unverified.email_verified === "pending");
  // "We could not ask" is not "not verified" — and it is not "verified"
  // either, however the server last recorded it.
  const unreadableEmail = deriveStepStatuses({ email_verified: { status: "done" } }, { ...NONE_MET, emailVerified: null });
  check("a failed read is reported as not checked", unreadableEmail.email_verified === "unknown");
  check("and never as confirmed on the strength of an old tick", unreadableEmail.email_verified !== "done");
  check("the exported empty signal set is the all-unknown one", deriveStepStatuses({}, EMPTY_SETUP_SIGNALS).email_verified === "unknown");

  check(
    "a newly-verified address is written back to the server",
    newlyInferredDone({}, { ...NONE_MET, emailVerified: true }).includes("email_verified"),
  );
  check(
    "and an already-saved one is not written again",
    !newlyInferredDone({ email_verified: { status: "done" } }, { ...NONE_MET, emailVerified: true }).includes("email_verified"),
  );
}

console.log("\n--- progress is actually recorded (the client speaks the route's shape) ---");
{
  // The defect: this client sent `{ steps: { business: { status: "done" } } }`
  // to a route that reads two top-level scalars, `body.step` and `body.status`.
  // Every write was answered 400 invalid_step, and the caller fired it with
  // `void`, so the page reported success and no progress was ever saved.
  const clientSrc = read("artifacts/helpdesk/src/lib/onboardingApi.ts");
  const routeSrc = read("artifacts/api-server/src/routes/receptionistOnboarding.ts");
  const apiSrc = read("artifacts/helpdesk/src/pages/setup/setupApi.ts");

  check(
    "the route still reads one step and one status as top-level fields",
    /body\.step/.test(routeSrc) && /body\.status/.test(routeSrc),
  );
  check(
    "the client sends exactly those two fields",
    /JSON\.stringify\(\{ step: update\.step, status: update\.status \}\)/.test(clientSrc),
  );
  check(
    // What matters is what is SENT. The client still has a `steps` map in the
    // shape it READS back (the saved state) and in its empty default, so the
    // check looks inside the request bodies rather than anywhere in the file —
    // an earlier version failed on that default and said nothing true about
    // the defect.
    "and no longer sends a `steps` map the route cannot read",
    !/body:\s*JSON\.stringify\(\{[^}]*steps/.test(clientSrc) &&
      !/JSON\.stringify\(\{\s*steps/.test(clientSrc) &&
      !/\{ steps: patch \}/.test(apiSrc),
  );
  check(
    "one request per step, so a partial failure is attributable",
    /for \(const step of newlyDone\)/.test(apiSrc) &&
      /updateOnboardingState\(\{ step, status: "done" \}\)/.test(apiSrc),
  );

  // A rejected write must be observable. Fire-and-forget is what made the
  // original defect survive in production.
  check("the write-back is no longer fired and forgotten", !/void sync\(/.test(pageSrc));
  check(
    "a failed write is recorded as state and shown",
    /setSaveFailed/.test(pageSrc) && pageSrc.includes("PROGRESS_SAVE.failedTitle"),
  );
  check("and it can be retried", pageSrc.includes("PROGRESS_SAVE.retryLabel"));
  check(
    "the failure sentence does not claim the customer's setup was lost",
    /still correct/i.test(PROGRESS_SAVE.failedDetail) &&
      !/lost|deleted/i.test(PROGRESS_SAVE.failedDetail),
  );
}

console.log(
  failed === 0 ? "\nAll setupContract tests passed." : `\nsetupContract: ${failed} check(s) FAILED.`,
);
if (failed > 0) process.exit(1);
