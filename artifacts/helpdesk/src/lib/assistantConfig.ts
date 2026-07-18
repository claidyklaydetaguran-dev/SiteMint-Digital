import { ASSISTANT_TEMPLATES, type AssistantTemplate } from "@/lib/assistantTemplates";
import {
  draftFromTemplate,
  type AssistantDraft,
  type AssistantSetupState,
  type AssistantPromptState,
  type AssistantVoiceModelState,
  type AssistantAnalysisState,
  type AssistantAdvancedState,
  type FirstMessageMode,
} from "@/hooks/useAssistantDrafts";
import type { VoicePresetId } from "@/lib/assistantEstimates";

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

const VOICE_PRESET_IDS: VoicePresetId[] = [
  "natural-balanced",
  "fast-response",
  "highest-intelligence",
  "budget-friendly",
  "custom",
];

function voicePresetId(value: unknown, fallback: VoicePresetId): VoicePresetId {
  return typeof value === "string" && (VOICE_PRESET_IDS as string[]).includes(value)
    ? (value as VoicePresetId)
    : fallback;
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
  };
}

function sanitizeVoiceModel(value: unknown, fallback: AssistantVoiceModelState): AssistantVoiceModelState {
  const src = isPlainObject(value) ? value : {};
  return { preset: voicePresetId(src.preset, fallback.preset) };
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
 * Builder state -> API config. Deterministic key order; plain
 * JSON-serializable data only. Unknown provider-neutral keys from a prior
 * hydration are intentionally NOT preserved here — E2 only round-trips the
 * fields the B3 builder actually edits, so re-saving cannot silently persist
 * stray data the UI never showed the customer.
 */
export function serializeDraftToConfig(draft: AssistantDraft): Record<string, unknown> {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    setup: { ...draft.setup },
    prompt: { ...draft.prompt, objectives: [...draft.prompt.objectives], informationToCollect: [...draft.prompt.informationToCollect] },
    voiceModel: { ...draft.voiceModel },
    tools: {},
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
    analysis: sanitizeAnalysis(config.analysis, fallback.analysis),
    advanced: sanitizeAdvanced(config.advanced, fallback.advanced),
  };

  return { draft, hadHydrationError: false };
}
