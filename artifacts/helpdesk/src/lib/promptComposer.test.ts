/**
 * V5 PR-6 (C-3) — committed contract test for `promptComposer.ts`.
 *
 * Run via: pnpm --filter @workspace/scripts run test (registered in
 * scripts/package.json's `test` chain, beside assistantsContract.test.ts).
 *
 * `promptComposer.ts` is deliberately dependency-free — no React, no `@/`
 * runtime import, no network, no dates/randomness — so this file imports it
 * directly and runs it under `tsx`, exactly like every other sibling
 * `*Contract.test.ts` file in this journey. helpdesk's tsconfig excludes
 * `**\/*.test.ts` by glob, so nothing here is type-built into the app or
 * bundled by Vite.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  composeSystemPrompt,
  composeCallerPreview,
  normalizePermittedActions,
  isPermittedActionId,
  PERMITTED_ACTION_IDS,
  PERMITTED_ACTIONS,
  PROMPT_SECTIONS,
  CALLER_PREVIEW_CALLER_LINE,
  CALLER_PREVIEW_OPENING_LINE,
  type PromptComposerInput,
} from "./promptComposer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/lib → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../..");
const selfSrc = readFileSync(path.join(repoRoot, "artifacts/helpdesk/src/lib/promptComposer.ts"), "utf8");

let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  try {
    assert.deepStrictEqual(actual, expected);
    console.log(`  PASS  ${name}`);
  } catch {
    failed++;
    console.error(`  FAIL  ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const FULL_INPUT: PromptComposerInput = {
  assistantName: "Ava",
  role: "front-desk receptionist",
  primaryGoal: "book appointments",
  timezone: "America/New_York",
  language: "English (US)",
  tone: "Warm and efficient",
  businessName: "Riverside Dental",
  industry: "dental clinic",
  businessInformation: "Open Mon–Fri, 8am–5pm. Located at 12 River St.",
  objectives: ["Answer the call promptly", "  ", "Identify the caller's need"],
  questionsToAsk: ["Caller's full name", "  ", "Reason for calling"],
  appointmentRules: "Only offer times at least 24 hours out.",
  permittedActions: ["answer_questions", "check_availability", "not_a_real_action"],
  escalationInstructions: "Escalate anything involving billing disputes.",
  prohibitedTopics: "Never give medical advice.",
  closingBehaviour: "Thank the caller and confirm next steps.",
  additionalInstructions: "Speak slowly for elderly callers.",
  firstMessageBehaviour: "assistant-speaks-first",
  greeting: "Thanks for calling Riverside Dental!",
};

console.log("\n--- composeSystemPrompt: determinism and purity ---");
{
  const a = composeSystemPrompt(FULL_INPUT);
  const b = composeSystemPrompt(FULL_INPUT);
  eq("the same input always yields the same string", a, b);
  check("no source in this module reads Date/Math.random/environment", !/\bDate\.now\(\)|Math\.random\(\)|process\.env/.test(selfSrc));
  check("this module imports no React and no runtime @/ alias", !/from "react"|from "@\//.test(selfSrc));
}

console.log("\n--- composeSystemPrompt: full input ---");
{
  const prompt = composeSystemPrompt(FULL_INPUT);
  check("opens with the identity line", prompt.startsWith("You are Ava, front-desk receptionist for Riverside Dental."));
  check("includes the industry line", prompt.includes("The business is in the dental clinic industry."));
  check("includes the primary goal", prompt.includes("Primary goal: book appointments"));
  check("includes the business information section", prompt.includes(`## ${PROMPT_SECTIONS.business}`) && prompt.includes("12 River St."));
  check(
    "objectives are trimmed and blanks dropped",
    prompt.includes("- Answer the call promptly") &&
      prompt.includes("- Identify the caller's need") &&
      !prompt.includes("-  \n"),
  );
  check("questions section asks one at a time and confirms", prompt.includes("one item at a time, and confirm each answer"));
  check("appointment rules section present", prompt.includes(`## ${PROMPT_SECTIONS.appointments}`) && prompt.includes("24 hours"));
  check(
    "allowed actions only include known, catalogue-ordered ids — the unknown id is dropped silently",
    prompt.includes("Answer questions using only the business information provided above.") &&
      prompt.includes("Check availability and tell the caller which appointment times are open.") &&
      !prompt.includes("not_a_real_action"),
  );
  check("escalation section present", prompt.includes(`## ${PROMPT_SECTIONS.escalation}`) && prompt.includes("billing disputes"));
  check("prohibited topics section present", prompt.includes(`## ${PROMPT_SECTIONS.prohibited}`) && prompt.includes("medical advice"));
  check("closing behaviour section present", prompt.includes(`## ${PROMPT_SECTIONS.closing}`) && prompt.includes("confirm next steps"));
  check("additional instructions section present, last", prompt.trim().endsWith("Speak slowly for elderly callers."));
  check("the greeting itself is never duplicated into the composed prompt", !prompt.includes(FULL_INPUT.greeting));
}

console.log("\n--- composeSystemPrompt: every field blank ---");
{
  const blank: PromptComposerInput = {
    assistantName: "",
    role: "",
    primaryGoal: "",
    timezone: "",
    language: "",
    tone: "",
    businessName: "",
    industry: "",
    businessInformation: "",
    objectives: [],
    questionsToAsk: [],
    appointmentRules: "",
    permittedActions: [],
    escalationInstructions: "",
    prohibitedTopics: "",
    closingBehaviour: "",
    additionalInstructions: "",
    firstMessageBehaviour: "wait-for-caller",
    greeting: "",
  };
  const prompt = composeSystemPrompt(blank);
  check("still a short, valid, non-empty prompt", prompt.trim().length > 0);
  check("falls back to generic identity wording", prompt.includes("You are the assistant, a receptionist."));
  check("omits every empty section entirely — no dangling headings", !/## /.test(prompt));
}

console.log("\n--- permitted actions ---");
{
  eq("the catalogue has exactly five ids", [...PERMITTED_ACTION_IDS].length, 5);
  eq("PERMITTED_ACTIONS carries one definition per id, in catalogue order", PERMITTED_ACTIONS.map((a) => a.id), [
    ...PERMITTED_ACTION_IDS,
  ]);
  check("isPermittedActionId accepts a known id", isPermittedActionId("take_messages"));
  check("isPermittedActionId rejects an unknown string", !isPermittedActionId("do_anything"));
  check("isPermittedActionId rejects non-strings", !isPermittedActionId(7) && !isPermittedActionId(null) && !isPermittedActionId(undefined));
  eq(
    "normalizePermittedActions de-duplicates and re-orders to catalogue order, dropping unknowns",
    normalizePermittedActions(["end_call_politely", "answer_questions", "answer_questions", "bogus"]),
    ["answer_questions", "end_call_politely"],
  );
  eq("normalizePermittedActions of an empty list is empty", normalizePermittedActions([]), []);
}

console.log("\n--- composeCallerPreview ---");
{
  const base = {
    greeting: "Thanks for calling!",
    questionsToAsk: ["Caller's full name", "  ", "Reason for calling"],
    assistantName: "Ava",
  };

  const speaksFirst = composeCallerPreview({ ...base, firstMessageBehaviour: "assistant-speaks-first" });
  check("assistant-speaks-first opens with the greeting", speaksFirst !== null && speaksFirst[0]?.speaker === "assistant" && speaksFirst[0]?.text === base.greeting);
  check(
    "then a caller line, then a question derived from the first non-blank item",
    speaksFirst !== null &&
      speaksFirst[1]?.speaker === "caller" &&
      speaksFirst[1]?.text === CALLER_PREVIEW_CALLER_LINE &&
      speaksFirst[2]?.speaker === "assistant" &&
      /full name\?$/.test(speaksFirst[2]?.text ?? ""),
  );

  const noGreetingSpeaksFirst = composeCallerPreview({ ...base, greeting: "", firstMessageBehaviour: "assistant-speaks-first" });
  eq("assistant-speaks-first with no greeting returns null rather than inventing one", noGreetingSpeaksFirst, null);

  const waitForCaller = composeCallerPreview({ ...base, firstMessageBehaviour: "wait-for-caller" });
  check(
    "wait-for-caller opens with the caller, then the greeting",
    waitForCaller !== null &&
      waitForCaller[0]?.speaker === "caller" &&
      waitForCaller[0]?.text === CALLER_PREVIEW_OPENING_LINE &&
      waitForCaller[1]?.speaker === "assistant" &&
      waitForCaller[1]?.text === base.greeting,
  );

  const noQuestions = composeCallerPreview({ ...base, questionsToAsk: [], firstMessageBehaviour: "assistant-speaks-first" });
  check(
    "with no questions to ask, the assistant's second line is a generic offer to help",
    noQuestions !== null && noQuestions[noQuestions.length - 1]?.text === "Happy to help. What can I do for you today?",
  );
}

console.log(
  failed === 0
    ? "\nAll promptComposerContract tests passed."
    : `\npromptComposerContract: ${failed} check(s) FAILED.`,
);
if (failed > 0) process.exit(1);
