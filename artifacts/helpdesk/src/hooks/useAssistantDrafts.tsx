import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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

export interface AssistantDraft {
  id: string;
  templateId: string;
  templateName: string;
  setup: AssistantSetupState;
  prompt: AssistantPromptState;
  voiceModel: AssistantVoiceModelState;
  analysis: AssistantAnalysisState;
  advanced: AssistantAdvancedState;
}

function draftFromTemplate(id: string, template: AssistantTemplate): AssistantDraft {
  return {
    id,
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

interface AssistantDraftsContextValue {
  drafts: Record<string, AssistantDraft>;
  createDraft: (template: AssistantTemplate) => string;
  updateDraft: (id: string, updater: (draft: AssistantDraft) => AssistantDraft) => void;
}

const AssistantDraftsContext = createContext<AssistantDraftsContextValue | null>(null);

/**
 * In-memory only — no localStorage/IndexedDB/API calls. Lives for the
 * lifetime of the mounted app so builder tabs keep their state while
 * navigating, but a full page reload starts fresh (Checkpoint B3 is UI-only,
 * nothing here is a persisted assistant).
 */
export function AssistantDraftsProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, AssistantDraft>>({});

  const createDraft = useCallback((template: AssistantTemplate) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const draft = draftFromTemplate(id, template);
    setDrafts((prev) => ({ ...prev, [id]: draft }));
    return id;
  }, []);

  const updateDraft = useCallback((id: string, updater: (draft: AssistantDraft) => AssistantDraft) => {
    setDrafts((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: updater(existing) };
    });
  }, []);

  const value = useMemo(() => ({ drafts, createDraft, updateDraft }), [drafts, createDraft, updateDraft]);

  return <AssistantDraftsContext.Provider value={value}>{children}</AssistantDraftsContext.Provider>;
}

function useAssistantDraftsContext(): AssistantDraftsContextValue {
  const ctx = useContext(AssistantDraftsContext);
  if (!ctx) throw new Error("useAssistantDraftsContext must be used within AssistantDraftsProvider");
  return ctx;
}

export function useCreateAssistantDraft() {
  const { createDraft } = useAssistantDraftsContext();
  return createDraft;
}

/** Returns the draft for `id`, or undefined if it was never created this session (e.g. after a reload). */
export function useAssistantDraft(id: string | undefined) {
  const { drafts, updateDraft } = useAssistantDraftsContext();
  const draft = id ? drafts[id] : undefined;

  const update = useCallback(
    (updater: (draft: AssistantDraft) => AssistantDraft) => {
      if (id) updateDraft(id, updater);
    },
    [id, updateDraft],
  );

  return { draft, update };
}
