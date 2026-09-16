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
 * "Advanced" — the guided structured prompt.
 *
 * Every section below writes to the same draft fields the other sections and
 * `composeSystemPrompt` read; there is no separate copy of "the prompt" living
 * in this component. While `promptMode` is "guided" (the default for a new
 * assistant) the "Generated prompt" preview is exactly what `assistantConfig.ts`
 * saves into `systemInstructions` — same function, same input — so nothing
 * shown here can drift from what gets published. The switch at the foot hands
 * editing over entirely.
 *
 * Presentation only in this pass.
 */

const MUTED = {
  margin: "var(--sd-space-1, .25rem) 0 0",
  fontSize: "var(--sd-text-small, .8125rem)",
  lineHeight: 1.55,
  color: "var(--sd-text-muted, #3b5265)",
} as const;

const PANEL = {
  padding: "var(--sd-space-4, 1rem)",
  border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
  borderRadius: "var(--sd-radius-card, 10px)",
  background: "var(--sd-surface, #fff)",
  minWidth: 0,
} as const;

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

  const selectedActionLabels = PERMITTED_ACTIONS.filter((a) =>
    tools.permittedActions.includes(a.id),
  ).map((a) => a.label);

  return (
    <>
      <div>
        <h2 className="sd-h2">{PROMPT_TAB.title}</h2>
        <p style={MUTED}>{PROMPT_TAB.detail}</p>
      </div>

      <div className="si-field">
        <span className="si-label">First message</span>
        <SegmentedControl<FirstMessageMode>
          value={prompt.firstMessageMode}
          onChange={(v) => set({ firstMessageMode: v })}
          aria-label="First message"
          options={[
            { value: "assistant-speaks-first", label: "Assistant speaks first" },
            { value: "wait-for-caller", label: "Wait for caller" },
          ]}
        />
        <p className="si-hint">
          Whether the assistant opens the call, or waits for the caller to speak first.
        </p>
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

      <div style={PANEL}>
        <h3 className="sd-h2">Allowed actions</h3>
        <p style={MUTED}>
          {selectedActionLabels.length > 0 ? selectedActionLabels.join(", ") : "None selected yet."}
        </p>
        <p style={MUTED}>{PROMPT_TAB.permittedActionsNote}</p>
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

      <div style={PANEL}>
        <h3 className="sd-h2">{PROMPT_TAB.generatedHeading}</h3>
        <p style={MUTED}>{PROMPT_TAB.generatedDetail}</p>
        <pre
          style={{
            margin: "var(--sd-space-3, .75rem) 0 0",
            maxHeight: "18rem",
            overflow: "auto",
            padding: "var(--sd-space-3, .75rem)",
            border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
            borderRadius: "var(--sd-radius-control, 6px)",
            background: "var(--sd-surface-alt, #f6fbfa)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "var(--sd-text-small, .8125rem)",
            lineHeight: 1.55,
            color: "var(--sd-text, #051824)",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {currentPrompt || "Nothing generated yet — fill in the sections above."}
        </pre>
      </div>

      <div style={PANEL}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--sd-space-2, .5rem)",
          }}
        >
          <h3 className="sd-h2">{PROMPT_TAB.callerPreviewHeading}</h3>
          <span className="sd-chip">{PROMPT_TAB.callerPreviewSimulatedLabel}</span>
        </div>
        {callerPreview ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sd-space-2, .5rem)",
              marginTop: "var(--sd-space-3, .75rem)",
              minWidth: 0,
            }}
          >
            {callerPreview.map((turn, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  maxWidth: "85%",
                  alignSelf: turn.speaker === "assistant" ? "flex-start" : "flex-end",
                  padding: "var(--sd-space-2, .5rem) var(--sd-space-3, .75rem)",
                  borderRadius: "var(--sd-radius-card, 10px)",
                  background:
                    turn.speaker === "assistant"
                      ? "var(--sd-surface-alt, #f6fbfa)"
                      : "var(--sd-surface-accent, #f0f9f6)",
                  fontSize: "var(--sd-text-small, .8125rem)",
                  lineHeight: 1.55,
                  color: "var(--sd-text, #051824)",
                  overflowWrap: "anywhere",
                }}
              >
                {turn.text}
              </p>
            ))}
          </div>
        ) : (
          <p style={MUTED}>{PROMPT_TAB.callerPreviewEmpty}</p>
        )}
      </div>

      <Collapsible defaultOpen={prompt.promptMode === "advanced"}>
        <CollapsibleTrigger
          className="sd-error__action"
          style={{ width: "100%", justifyContent: "space-between", background: "var(--sd-surface-alt, #f6fbfa)" }}
        >
          Edit the prompt directly
          <ChevronDown className="sd-navlink__icon" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sd-space-3, .75rem)",
              marginTop: "var(--sd-space-3, .75rem)",
              padding: "var(--sd-space-4, 1rem)",
              border: "1px dashed var(--sd-border-strong, rgba(59,82,101,.24))",
              borderRadius: "var(--sd-radius-card, 10px)",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--sd-space-3, .75rem)",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--sd-text-body, .875rem)",
                    fontWeight: 600,
                    color: "var(--sd-text, #051824)",
                  }}
                >
                  {PROMPT_TAB.advancedToggleLabel}
                </span>
                <span style={{ ...MUTED, display: "block" }}>{PROMPT_TAB.advancedToggleDetail}</span>
              </span>
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
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
