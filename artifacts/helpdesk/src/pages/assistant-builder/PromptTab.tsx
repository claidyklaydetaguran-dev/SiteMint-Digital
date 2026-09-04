import { ChevronDown } from "lucide-react";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { CharCountField } from "@/components/common/CharCountField";
import { RepeatableList } from "@/components/common/RepeatableList";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PROMPT_TAB } from "@/pages/assistants/assistantsContract";
import { composeSystemPrompt, composeCallerPreview, PERMITTED_ACTIONS } from "@/lib/promptComposer";
import type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";
import type { FirstMessageMode } from "@/hooks/useAssistantDrafts";

/**
 * V5 PR-6 (C-3): the guided structured prompt. Every section below writes to
 * the same draft fields the Configuration tab and `composeSystemPrompt` read
 * — there is no separate copy of "the prompt" living in this component.
 *
 * While `promptMode` is "guided" (the default for a new assistant), the
 * "Generated prompt" preview below is exactly what `assistantConfig.ts`
 * saves into `systemInstructions` — same function, same input, so nothing
 * shown here can drift from what gets published. Flip the switch at the foot
 * of this tab to edit the full prompt directly instead.
 */
export default function PromptTab({ draft, update, businessInfo }: BuilderTabProps) {
  const { prompt, setup, tools } = draft;
  const set = (patch: Partial<typeof prompt>) =>
    update((d) => ({ ...d, prompt: { ...d.prompt, ...patch } }));

  const businessName = businessInfo?.name || setup.businessName;
  const industry = businessInfo?.industry || setup.industry;

  const generatedPrompt = composeSystemPrompt({
    assistantName: setup.assistantName,
    role: setup.role,
    primaryGoal: setup.primaryGoal,
    timezone: setup.timezone,
    language: setup.language,
    tone: prompt.tone,
    businessName,
    industry,
    businessInformation: prompt.businessInformation,
    objectives: prompt.objectives,
    questionsToAsk: prompt.informationToCollect,
    appointmentRules: prompt.appointmentRules,
    permittedActions: tools.permittedActions,
    escalationInstructions: prompt.escalationRules,
    prohibitedTopics: prompt.prohibitedBehavior,
    closingBehaviour: prompt.callEndingRules,
    additionalInstructions: prompt.additionalInstructions,
    firstMessageBehaviour: prompt.firstMessageMode,
    greeting: prompt.firstMessage,
  });

  const currentPrompt = prompt.promptMode === "guided" ? generatedPrompt : prompt.systemInstructions;

  const callerPreview = composeCallerPreview({
    greeting: prompt.firstMessage,
    firstMessageBehaviour: prompt.firstMessageMode,
    questionsToAsk: prompt.informationToCollect,
    assistantName: setup.assistantName,
  });

  const selectedActionLabels = PERMITTED_ACTIONS.filter((a) => tools.permittedActions.includes(a.id)).map(
    (a) => a.label,
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">{PROMPT_TAB.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{PROMPT_TAB.detail}</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">First message mode</p>
        <SegmentedControl<FirstMessageMode>
          value={prompt.firstMessageMode}
          onChange={(v) => set({ firstMessageMode: v })}
          aria-label="First message mode"
          options={[
            { value: "assistant-speaks-first", label: "Assistant speaks first" },
            { value: "wait-for-caller", label: "Wait for caller" },
          ]}
        />
      </div>

      <CharCountField
        id="greeting-guided"
        label="Greeting"
        value={prompt.firstMessage}
        onChange={(v) => set({ firstMessage: v })}
        maxLength={300}
        rows={2}
        placeholder="What the assistant says first"
      />

      <CharCountField
        id="business-information"
        label="Business information"
        value={prompt.businessInformation}
        onChange={(v) => set({ businessInformation: v })}
        maxLength={2000}
        rows={4}
        placeholder="Hours, location, services, policies — anything the assistant needs to answer questions accurately."
      />

      <RepeatableList
        label="Questions to ask"
        items={prompt.informationToCollect}
        onChange={(v) => set({ informationToCollect: v })}
        itemPlaceholder="Question or field to collect"
        addLabel="Add question"
        maxItems={10}
      />

      <RepeatableList
        label="Conversation objectives"
        items={prompt.objectives}
        onChange={(v) => set({ objectives: v })}
        itemPlaceholder="Objective"
        addLabel="Add objective"
        maxItems={8}
      />

      <CharCountField
        id="appointment-rules"
        label="Appointment rules"
        value={prompt.appointmentRules}
        onChange={(v) => set({ appointmentRules: v })}
        maxLength={800}
        rows={3}
        placeholder="What should the assistant know before creating an appointment request?"
      />

      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Allowed actions</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {selectedActionLabels.length > 0 ? selectedActionLabels.join(", ") : "None selected yet."}
        </p>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{PROMPT_TAB.permittedActionsNote}</p>
      </div>

      <CharCountField
        id="escalation-instructions"
        label="Escalation instructions"
        value={prompt.escalationRules}
        onChange={(v) => set({ escalationRules: v })}
        maxLength={800}
        rows={3}
        placeholder="When should this assistant hand off to a human?"
      />

      <CharCountField
        id="prohibited-topics"
        label="Prohibited topics"
        value={prompt.prohibitedBehavior}
        onChange={(v) => set({ prohibitedBehavior: v })}
        maxLength={800}
        rows={3}
        placeholder="What should this assistant never say or do?"
      />

      <CharCountField
        id="closing-behavior"
        label="Closing behaviour"
        value={prompt.callEndingRules}
        onChange={(v) => set({ callEndingRules: v })}
        maxLength={500}
        rows={2}
        placeholder="When and how should the assistant end the call?"
      />

      <CharCountField
        id="tone"
        label="Tone and personality"
        value={prompt.tone}
        onChange={(v) => set({ tone: v })}
        maxLength={200}
        rows={2}
        placeholder="e.g. Warm, professional, efficient"
      />

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{PROMPT_TAB.generatedHeading}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{PROMPT_TAB.generatedDetail}</p>
        <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-xs text-foreground">
          {currentPrompt || "Nothing generated yet — fill in the sections above."}
        </pre>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            {PROMPT_TAB.callerPreviewHeading}
          </p>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {PROMPT_TAB.callerPreviewSimulatedLabel}
          </span>
        </div>
        {callerPreview ? (
          <div className="mt-3 space-y-2">
            {callerPreview.map((turn, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                  turn.speaker === "assistant"
                    ? "bg-surface-muted text-foreground"
                    : "ml-auto bg-primary/10 text-foreground"
                }`}
              >
                {turn.text}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{PROMPT_TAB.callerPreviewEmpty}</p>
        )}
      </div>

      <Collapsible defaultOpen={prompt.promptMode === "advanced"}>
        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg border border-border bg-card px-3.5 py-2.5 text-left text-sm font-medium text-foreground hover-elevate">
          Advanced
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3 rounded-lg border border-dashed border-border p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{PROMPT_TAB.advancedToggleLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{PROMPT_TAB.advancedToggleDetail}</p>
            </div>
            <Switch
              checked={prompt.promptMode === "advanced"}
              onCheckedChange={(checked) => {
                if (checked) {
                  // Freeze the current generated text so switching to manual
                  // editing never appears to erase anything.
                  set({ promptMode: "advanced", systemInstructions: generatedPrompt });
                } else {
                  set({ promptMode: "guided" });
                }
              }}
              aria-label={PROMPT_TAB.advancedToggleLabel}
            />
          </div>
          {prompt.promptMode === "advanced" && (
            <CharCountField
              id="system-instructions-advanced"
              label="Full prompt"
              value={prompt.systemInstructions}
              onChange={(v) => set({ systemInstructions: v })}
              maxLength={10000}
              rows={14}
              placeholder="The complete system prompt sent on every call"
              helpText="Edited here directly — the guided sections above are no longer applied while this is on."
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
