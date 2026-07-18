import { useCallback, useState } from "react";
import type { AssistantTemplate } from "@/lib/assistantTemplates";
import type { VoicePresetId } from "@/lib/assistantEstimates";

export type FirstMessageMode = "assistant-speaks-first" | "wait-for-caller";

export interface AssistantSetupState {
  assistantName: string;
  businessName: string;
  role: string;
  industry: string;
  primaryGoal: string;
  timezone: string;
  language: string;
}

export interface AssistantPromptState {
  firstMessageMode: FirstMessageMode;
  firstMessage: string;
  systemInstructions: string;
  tone: string;
  objectives: string[];
  informationToCollect: string[];
  escalationRules: string;
  prohibitedBehavior: string;
  callEndingRules: string;
}

export interface AssistantVoiceModelState {
  preset: VoicePresetId;
}

export interface AssistantAnalysisState {
  callSummaryEnabled: boolean;
  successCriteria: string;
  leadQualificationFields: string[];
  followUpRecommendation: string;
}

export interface AssistantAdvancedState {
  voiceRuntimeProvider: string;
  modelProvider: string;
  modelIdentifier: string;
  voiceProvider: string;
  voiceIdentifier: string;
  transcriber: string;
  timeoutSeconds: string;
  endpointingMs: string;
  rawOverrides: string;
}

/**
 * Editable builder configuration. This is the source of truth mapped to/from
 * the E1 `config` JSON object (see lib/assistantConfig.ts) — it deliberately
 * excludes id/status/provider/timestamps, which live only on AssistantDto.
 */
export interface AssistantDraft {
  templateId: string;
  templateName: string;
  setup: AssistantSetupState;
  prompt: AssistantPromptState;
  voiceModel: AssistantVoiceModelState;
  analysis: AssistantAnalysisState;
  advanced: AssistantAdvancedState;
}

export function draftFromTemplate(template: AssistantTemplate): AssistantDraft {
  return {
    templateId: template.id,
    templateName: template.name,
    setup: {
      assistantName: template.id === "blank" ? "" : template.name,
      businessName: "",
      role: template.defaults.role,
      industry: "",
      primaryGoal: template.defaults.primaryGoal,
      timezone: "",
      language: "English (US)",
    },
    prompt: {
      firstMessageMode: "assistant-speaks-first",
      firstMessage: template.defaults.firstMessage,
      systemInstructions: template.defaults.systemInstructions,
      tone: template.defaults.tone,
      objectives: [...template.defaults.objectives],
      informationToCollect: [...template.defaults.informationToCollect],
      escalationRules: "",
      prohibitedBehavior: "",
      callEndingRules: "",
    },
    voiceModel: {
      preset: "natural-balanced",
    },
    analysis: {
      callSummaryEnabled: true,
      successCriteria: "",
      leadQualificationFields: [],
      followUpRecommendation: "",
    },
    advanced: {
      voiceRuntimeProvider: "",
      modelProvider: "",
      modelIdentifier: "",
      voiceProvider: "",
      voiceIdentifier: "",
      transcriber: "",
      timeoutSeconds: "",
      endpointingMs: "",
      rawOverrides: "",
    },
  };
}

/**
 * Local, in-memory-only draft state for a new, unsaved assistant. Lives for
 * the lifetime of the mounted builder route — a full reload reconstructs a
 * fresh draft from the validated template key rather than reading any
 * client-side storage (see AssistantBuilderNew).
 */
export function useLocalAssistantDraft(template: AssistantTemplate) {
  const [draft, setDraft] = useState<AssistantDraft>(() => draftFromTemplate(template));

  const update = useCallback((updater: (draft: AssistantDraft) => AssistantDraft) => {
    setDraft((prev) => updater(prev));
  }, []);

  return { draft, update };
}
