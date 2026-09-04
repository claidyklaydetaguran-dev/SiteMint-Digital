/**
 * V5 PR-6 (C-3) — the deterministic system-prompt composer.
 *
 * The guided Prompt tab edits structured sections (greeting, business
 * information, questions to ask, appointment rules, allowed actions,
 * escalation, prohibited topics, closing behaviour). The server publish path
 * sends the provider exactly one system prompt — `config.prompt.systemInstructions`
 * (see api-server `persistedConfigMapper.ts`, read-only) — so those sections
 * only reach a live call by being composed into that string. This module is
 * that composition, and it is the *only* place it happens: the serializer in
 * `assistantConfig.ts` calls it on every save while the prompt is in guided
 * mode, and the Prompt tab shows its output as the "generated full prompt"
 * preview, so what the customer previews is byte-for-byte what is saved.
 *
 * Rules that keep it trustworthy:
 *   • pure and deterministic — the same input always yields the same string,
 *     with no dates, ids, randomness or environment reads;
 *   • empty sections are omitted, never rendered as an empty heading;
 *   • list items are trimmed and blanks dropped, so a half-edited list never
 *     produces a dangling bullet;
 *   • no network, no React, no `@/` runtime import — the committed contract
 *     test runs this file directly under `tsx`.
 */

export type FirstMessageBehaviour = "assistant-speaks-first" | "wait-for-caller";

/* ── Permitted actions ─────────────────────────────────────────────────────
   The fixed catalogue behind the Configuration tab's checkbox list. Stored in
   `config.tools.permittedActions` as an array of these ids (see
   `assistantConfig.ts`). Unknown ids are ignored by the composer and dropped
   by hydration, so a retired action can never resurface in a prompt. */

export const PERMITTED_ACTION_IDS = [
  "answer_questions",
  "check_availability",
  "create_appointment_requests",
  "take_messages",
  "end_call_politely",
] as const;

export type PermittedActionId = (typeof PERMITTED_ACTION_IDS)[number];

export interface PermittedActionDefinition {
  id: PermittedActionId;
  /** Checkbox label. */
  label: string;
  /** One line under the label, in the owner's terms. */
  description: string;
  /** The sentence the composed prompt uses for this action. */
  promptLine: string;
}

export const PERMITTED_ACTIONS: readonly PermittedActionDefinition[] = [
  {
    id: "answer_questions",
    label: "Answer questions",
    description: "Reply to questions using the business information you provide.",
    promptLine: "Answer questions using only the business information provided above.",
  },
  {
    id: "check_availability",
    label: "Check availability",
    description: "Tell callers which appointment times are open.",
    promptLine: "Check availability and tell the caller which appointment times are open.",
  },
  {
    id: "create_appointment_requests",
    label: "Create appointment requests",
    description: "Take down a requested time as a booking request for you to confirm.",
    promptLine:
      "Create an appointment request for the caller's preferred time. Explain that the business will confirm it.",
  },
  {
    id: "take_messages",
    label: "Take messages",
    description: "Record the caller's name, reason for calling and how to reach them.",
    promptLine: "Take a message with the caller's name, the reason for calling and the best way to reach them.",
  },
  {
    id: "end_call_politely",
    label: "End the call politely",
    description: "Close the call with a summary once the caller's need is handled.",
    promptLine: "End the call politely once the caller's need has been handled, summarising what happens next.",
  },
];

const PERMITTED_ACTION_SET: ReadonlySet<string> = new Set(PERMITTED_ACTION_IDS);

export function isPermittedActionId(value: unknown): value is PermittedActionId {
  return typeof value === "string" && PERMITTED_ACTION_SET.has(value);
}

/** Keeps only known ids, de-duplicated, in catalogue order — never in input order. */
export function normalizePermittedActions(values: readonly unknown[]): PermittedActionId[] {
  const present = new Set(values.filter(isPermittedActionId));
  return PERMITTED_ACTION_IDS.filter((id) => present.has(id));
}

/* ── Composer input ──────────────────────────────────────────────────────── */

export interface PromptComposerInput {
  assistantName: string;
  role: string;
  primaryGoal: string;
  timezone: string;
  language: string;
  tone: string;
  /** From Workspace Settings, never edited in the builder. */
  businessName: string;
  industry: string;
  businessInformation: string;
  objectives: readonly string[];
  questionsToAsk: readonly string[];
  appointmentRules: string;
  permittedActions: readonly string[];
  escalationInstructions: string;
  prohibitedTopics: string;
  closingBehaviour: string;
  additionalInstructions: string;
  firstMessageBehaviour: FirstMessageBehaviour;
  greeting: string;
}

/** Section headings, in the order the composed prompt uses them. */
export const PROMPT_SECTIONS = {
  business: "Business information",
  objectives: "Conversation objectives",
  questions: "Questions to ask",
  appointments: "Appointment rules",
  actions: "Allowed actions",
  escalation: "Escalation",
  prohibited: "Prohibited topics",
  closing: "Closing behaviour",
  additional: "Additional instructions",
} as const;

const clean = (value: string): string => value.replace(/\r\n/g, "\n").trim();

const cleanList = (items: readonly string[]): string[] =>
  items.map((item) => item.trim()).filter((item) => item.length > 0);

const bullets = (items: readonly string[]): string => items.map((item) => `- ${item}`).join("\n");

function section(title: string, body: string): string | null {
  const text = clean(body);
  return text.length > 0 ? `## ${title}\n${text}` : null;
}

/**
 * The full system prompt. Every part of it is derived from the input; nothing
 * is injected from the environment, and an input with every field blank
 * still yields a short, valid prompt rather than an empty string.
 */
export function composeSystemPrompt(input: PromptComposerInput): string {
  const name = clean(input.assistantName) || "the assistant";
  const role = clean(input.role) || "a receptionist";
  const businessName = clean(input.businessName);
  const industry = clean(input.industry);

  const identity = [`You are ${name}, ${role}`, businessName ? ` for ${businessName}` : "", "."].join("");
  const industryLine = industry ? `The business is in the ${industry} industry.` : "";
  const goalLine = clean(input.primaryGoal) ? `Primary goal: ${clean(input.primaryGoal)}` : "";
  const toneLine = clean(input.tone) ? `Tone: ${clean(input.tone)}` : "";
  const timezoneLine = clean(input.timezone) ? `Business timezone: ${clean(input.timezone)}` : "";
  const languageLine = clean(input.language) ? `Speak in ${clean(input.language)}.` : "";

  const opening = [identity, industryLine, goalLine, toneLine, timezoneLine, languageLine]
    .filter((line) => line.length > 0)
    .join("\n");

  const questions = cleanList(input.questionsToAsk);
  const objectives = cleanList(input.objectives);
  const actions = normalizePermittedActions(input.permittedActions);

  const parts: Array<string | null> = [
    opening,
    section(PROMPT_SECTIONS.business, input.businessInformation),
    objectives.length > 0 ? section(PROMPT_SECTIONS.objectives, bullets(objectives)) : null,
    questions.length > 0
      ? section(
          PROMPT_SECTIONS.questions,
          `Ask for the following, one item at a time, and confirm each answer:\n${bullets(questions)}`,
        )
      : null,
    section(PROMPT_SECTIONS.appointments, input.appointmentRules),
    actions.length > 0
      ? section(
          PROMPT_SECTIONS.actions,
          `You may:\n${bullets(actions.map((id) => PERMITTED_ACTIONS.find((a) => a.id === id)!.promptLine))}\nDo not attempt any action outside this list.`,
        )
      : null,
    section(PROMPT_SECTIONS.escalation, input.escalationInstructions),
    section(PROMPT_SECTIONS.prohibited, input.prohibitedTopics),
    section(PROMPT_SECTIONS.closing, input.closingBehaviour),
    section(PROMPT_SECTIONS.additional, input.additionalInstructions),
  ];

  return parts.filter((part): part is string => part !== null).join("\n\n");
}

/* ── "How callers will hear this" ────────────────────────────────────────── */

export interface CallerPreviewTurn {
  speaker: "assistant" | "caller";
  text: string;
}

/** Fixed caller line: the preview is a simulation and says so wherever it is rendered. */
export const CALLER_PREVIEW_CALLER_LINE = "Hi — I have a quick question, and I might want to book something.";
export const CALLER_PREVIEW_OPENING_LINE = "Hello?";

function questionFromItem(item: string): string {
  const subject = item
    .trim()
    .replace(/^(the |your |caller'?s? |a )+/i, "")
    .replace(/[.?!]+$/, "");
  const lower = subject.charAt(0).toLowerCase() + subject.slice(1);
  return `Happy to help. First, could I get your ${lower}?`;
}

/**
 * A short simulated exchange rendered from the greeting and the first
 * question. Returns `null` when there is nothing to open with — the assistant
 * speaks first but has no greeting — so the tab can ask for one instead of
 * inventing it.
 */
export function composeCallerPreview(
  input: Pick<PromptComposerInput, "greeting" | "firstMessageBehaviour" | "questionsToAsk" | "assistantName">,
): CallerPreviewTurn[] | null {
  const greeting = clean(input.greeting);
  const questions = cleanList(input.questionsToAsk);
  const turns: CallerPreviewTurn[] = [];

  if (input.firstMessageBehaviour === "wait-for-caller") {
    turns.push({ speaker: "caller", text: CALLER_PREVIEW_OPENING_LINE });
    if (greeting) turns.push({ speaker: "assistant", text: greeting });
  } else {
    if (!greeting) return null;
    turns.push({ speaker: "assistant", text: greeting });
  }

  turns.push({ speaker: "caller", text: CALLER_PREVIEW_CALLER_LINE });
  turns.push({
    speaker: "assistant",
    text:
      questions.length > 0
        ? questionFromItem(questions[0]!)
        : "Happy to help. What can I do for you today?",
  });
  return turns;
}
