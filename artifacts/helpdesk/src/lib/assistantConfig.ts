import { ASSISTANT_TEMPLATES, type AssistantTemplate } from "@/lib/assistantTemplates";
import {
  draftFromTemplate,
  type AssistantDraft,
  type AssistantSetupState,
  type AssistantPromptState,
  type AssistantVoiceModelState,
  type AssistantToolsState,
  type AssistantAnalysisState,
  type AssistantAdvancedState,
  type FirstMessageMode,
  type PromptMode,
} from "@/hooks/useAssistantDrafts";
import {
  isStoredVoicePreset,
  type StoredVoicePresetId,
} from "@/pages/assistants/assistantsContract";
import { composeSystemPrompt, normalizePermittedActions } from "@/lib/promptComposer";

/**
 * Milestone 1 / Checkpoint E2: deterministic, provider-neutral mapping
 * between the B3 builder state (AssistantDraft) and the E1 `config` JSON
 * object. Every field is plain string/boolean/array data — never a Date,
 * Map, Set, function, class instance, or credential-shaped key.
 */

export const CONFIG_SCHEMA_VERSION = 1;

export const BLANK_TEMPLATE: AssistantTemplate =
  ASSISTANT_TEMPLATES.find((t) => t.id === "blank") ?? ASSISTANT_TEMPLATES[0];

export function findTemplateByKey(templateKey: string): AssistantTemplate | undefined {
  return ASSISTANT_TEMPLATES.find((t) => t.id === templateKey);
}

export function isValidTemplateKey(value: string | undefined | null): value is string {
  return typeof value === "string" && ASSISTANT_TEMPLATES.some((t) => t.id === value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function strArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.filter((v): v is string => typeof v === "string");
  return cleaned.length === value.length ? cleaned : fallback;
}

const FIRST_MESSAGE_MODES: FirstMessageMode[] = ["assistant-speaks-first", "wait-for-caller"];

function firstMessageMode(value: unknown, fallback: FirstMessageMode): FirstMessageMode {
  return typeof value === "string" && (FIRST_MESSAGE_MODES as string[]).includes(value)
    ? (value as FirstMessageMode)
    : fallback;
}

/**
 * V5 PR-6 (C-3): a config saved before this field existed carries no
 * `promptMode` at all. It must NOT default to `"guided"` — this assistant's
 * `systemInstructions` is whatever the customer wrote (by hand, or from a
 * template's old canned text), and every guided section below it is empty.
 * Composing from empty sections on the very next save would silently replace
 * that text with a near-blank prompt. So a missing/invalid value always
 * resolves to `"advanced"`, regardless of what a caller's fallback prefers —
 * only an explicit stored `"guided"` (which a customer can only reach by
 * saving from this builder, after this field existed) turns composition on.
 */
function promptMode(value: unknown): PromptMode {
  return value === "guided" || value === "advanced" ? value : "advanced";
}

/**
 * AR-001I: a stored preset is preserved exactly as saved, including a
 * retired one such as `custom`. Collapsing it to the template default here
 * would silently re-label the customer's configuration as a preset they
 * never chose — and then persist that on the next save. The builder shows a
 * recovery state for it instead, and only an explicit choice changes it.
 */
function voicePresetId(value: unknown, fallback: StoredVoicePresetId): StoredVoicePresetId {
  return isStoredVoicePreset(value) ? value : fallback;
}

function sanitizeSetup(value: unknown, fallback: AssistantSetupState): AssistantSetupState {
  const src = isPlainObject(value) ? value : {};
  return {
    assistantName: str(src.assistantName, fallback.assistantName),
    businessName: str(src.businessName, fallback.businessName),
    role: str(src.role, fallback.role),
    industry: str(src.industry, fallback.industry),
    primaryGoal: str(src.primaryGoal, fallback.primaryGoal),
    timezone: str(src.timezone, fallback.timezone),
    language: str(src.language, fallback.language),
  };
}

function sanitizePrompt(value: unknown, fallback: AssistantPromptState): AssistantPromptState {
  const src = isPlainObject(value) ? value : {};
  return {
    firstMessageMode: firstMessageMode(src.firstMessageMode, fallback.firstMessageMode),
    firstMessage: str(src.firstMessage, fallback.firstMessage),
    systemInstructions: str(src.systemInstructions, fallback.systemInstructions),
    tone: str(src.tone, fallback.tone),
    objectives: strArray(src.objectives, fallback.objectives),
    informationToCollect: strArray(src.informationToCollect, fallback.informationToCollect),
    escalationRules: str(src.escalationRules, fallback.escalationRules),
    prohibitedBehavior: str(src.prohibitedBehavior, fallback.prohibitedBehavior),
    callEndingRules: str(src.callEndingRules, fallback.callEndingRules),
    promptMode: promptMode(src.promptMode),
    businessInformation: str(src.businessInformation, fallback.businessInformation),
    appointmentRules: str(src.appointmentRules, fallback.appointmentRules),
    additionalInstructions: str(src.additionalInstructions, fallback.additionalInstructions),
  };
}

function sanitizeVoiceModel(value: unknown, fallback: AssistantVoiceModelState): AssistantVoiceModelState {
  const src = isPlainObject(value) ? value : {};
  return { preset: voicePresetId(src.preset, fallback.preset) };
}

/**
 * V5 PR-6 (C-2): a config saved before this section existed carries no
 * `tools.permittedActions` at all. It falls back to every known action
 * enabled — matching what that assistant could already do before this
 * checklist existed to say so explicitly, rather than silently narrowing an
 * existing assistant's behavior the first time its config is merely re-read.
 */
function sanitizeTools(value: unknown, fallback: AssistantToolsState): AssistantToolsState {
  const src = isPlainObject(value) ? value : {};
  const raw = Array.isArray(src.permittedActions) ? src.permittedActions : undefined;
  return { permittedActions: raw ? normalizePermittedActions(raw) : [...fallback.permittedActions] };
}

function sanitizeAnalysis(value: unknown, fallback: AssistantAnalysisState): AssistantAnalysisState {
  const src = isPlainObject(value) ? value : {};
  return {
    callSummaryEnabled: bool(src.callSummaryEnabled, fallback.callSummaryEnabled),
    successCriteria: str(src.successCriteria, fallback.successCriteria),
    leadQualificationFields: strArray(src.leadQualificationFields, fallback.leadQualificationFields),
    followUpRecommendation: str(src.followUpRecommendation, fallback.followUpRecommendation),
  };
}

function sanitizeAdvanced(value: unknown, fallback: AssistantAdvancedState): AssistantAdvancedState {
  const src = isPlainObject(value) ? value : {};
  return {
    voiceRuntimeProvider: str(src.voiceRuntimeProvider, fallback.voiceRuntimeProvider),
    modelProvider: str(src.modelProvider, fallback.modelProvider),
    modelIdentifier: str(src.modelIdentifier, fallback.modelIdentifier),
    voiceProvider: str(src.voiceProvider, fallback.voiceProvider),
    voiceIdentifier: str(src.voiceIdentifier, fallback.voiceIdentifier),
    transcriber: str(src.transcriber, fallback.transcriber),
    timeoutSeconds: str(src.timeoutSeconds, fallback.timeoutSeconds),
    endpointingMs: str(src.endpointingMs, fallback.endpointingMs),
    rawOverrides: str(src.rawOverrides, fallback.rawOverrides),
  };
}

/**
 * V5 PR-6 (C-2): the firm's business name/industry as read live from
 * Workspace Settings (`useWorkspaceBusinessInfo`). Passed in only at save
 * time — never stored into the draft or diffed for "unsaved changes" — so a
 * background refetch of Workspace Settings can never make the builder look
 * dirty on its own. When omitted (the fetch hasn't resolved yet), the
 * draft's own last-hydrated values are used instead.
 */
export interface BusinessInfoOverride {
  name: string;
  industry: string;
}

/**
 * Builder state -> API config. Deterministic key order; plain
 * JSON-serializable data only. Unknown provider-neutral keys from a prior
 * hydration are intentionally NOT preserved here — E2 only round-trips the
 * fields the B3 builder actually edits, so re-saving cannot silently persist
 * stray data the UI never showed the customer.
 *
 * V5 PR-6 (C-3): while `prompt.promptMode` is `"guided"`, this is also the
 * one place `systemInstructions` is generated — `composeSystemPrompt` runs
 * here, on every save, so the persisted config's `systemInstructions` is
 * always exactly what the Prompt tab's "generated full prompt" preview last
 * showed. While `"advanced"`, the customer's own text is saved unchanged.
 */
export function serializeDraftToConfig(
  draft: AssistantDraft,
  businessInfo?: BusinessInfoOverride,
): Record<string, unknown> {
  const businessName = businessInfo?.name ?? draft.setup.businessName;
  const industry = businessInfo?.industry ?? draft.setup.industry;

  const systemInstructions =
    draft.prompt.promptMode === "guided"
      ? composeSystemPrompt({
          assistantName: draft.setup.assistantName,
          role: draft.setup.role,
          primaryGoal: draft.setup.primaryGoal,
          timezone: draft.setup.timezone,
          language: draft.setup.language,
          tone: draft.prompt.tone,
          businessName,
          industry,
          businessInformation: draft.prompt.businessInformation,
          objectives: draft.prompt.objectives,
          questionsToAsk: draft.prompt.informationToCollect,
          appointmentRules: draft.prompt.appointmentRules,
          permittedActions: draft.tools.permittedActions,
          escalationInstructions: draft.prompt.escalationRules,
          prohibitedTopics: draft.prompt.prohibitedBehavior,
          closingBehaviour: draft.prompt.callEndingRules,
          additionalInstructions: draft.prompt.additionalInstructions,
          firstMessageBehaviour: draft.prompt.firstMessageMode,
          greeting: draft.prompt.firstMessage,
        })
      : draft.prompt.systemInstructions;

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    setup: { ...draft.setup, businessName, industry },
    prompt: {
      ...draft.prompt,
      systemInstructions,
      objectives: [...draft.prompt.objectives],
      informationToCollect: [...draft.prompt.informationToCollect],
    },
    voiceModel: { ...draft.voiceModel },
    tools: { permittedActions: [...draft.tools.permittedActions] },
    knowledge: {},
    testing: {},
    analysis: { ...draft.analysis, leadQualificationFields: [...draft.analysis.leadQualificationFields] },
    advanced: { ...draft.advanced },
  };
}

export interface HydratedConfig {
  draft: AssistantDraft;
  /** True when `config` was not a usable plain object and defaults had to be used wholesale. */
  hadHydrationError: boolean;
}

/**
 * API config -> builder state. Malformed or missing sections fall back to
 * template defaults per-field rather than failing — a corrupted config must
 * never crash the detail page or silently look like a fake success.
 */
export function hydrateConfigToDraft(config: unknown, templateKey: string, name: string): HydratedConfig {
  const template = findTemplateByKey(templateKey) ?? BLANK_TEMPLATE;
  const fallback = draftFromTemplate(template);
  fallback.setup.assistantName = name;

  if (!isPlainObject(config)) {
    return { draft: fallback, hadHydrationError: config !== null && config !== undefined };
  }

  const draft: AssistantDraft = {
    templateId: template.id,
    templateName: template.name,
    setup: { ...sanitizeSetup(config.setup, fallback.setup), assistantName: name },
    prompt: sanitizePrompt(config.prompt, fallback.prompt),
    voiceModel: sanitizeVoiceModel(config.voiceModel, fallback.voiceModel),
    tools: sanitizeTools(config.tools, fallback.tools),
    analysis: sanitizeAnalysis(config.analysis, fallback.analysis),
    advanced: sanitizeAdvanced(config.advanced, fallback.advanced),
  };

  return { draft, hadHydrationError: false };
}
