import { Sparkles, Wand2, ShieldCheck } from "lucide-react";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { CharCountField } from "@/components/common/CharCountField";
import { RepeatableList } from "@/components/common/RepeatableList";
import { UnavailableActionButton } from "@/components/common/UnavailableActionButton";
import type { BuilderTabProps } from "@/pages/AssistantBuilder";
import type { FirstMessageMode } from "@/hooks/useAssistantDrafts";

export default function PromptTab({ draft, update }: BuilderTabProps) {
  const { prompt } = draft;
  const set = (patch: Partial<typeof prompt>) =>
    update((d) => ({ ...d, prompt: { ...d.prompt, ...patch } }));

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Prompt</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            How the assistant opens, speaks, and knows when to stop or hand off.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <UnavailableActionButton
            icon={Sparkles}
            label="Generate"
            availability="Available after assistant services are connected"
          />
          <UnavailableActionButton
            icon={Wand2}
            label="Improve"
            availability="Available after assistant services are connected"
          />
          <UnavailableActionButton
            icon={ShieldCheck}
            label="Check for conflicts"
            availability="Available after assistant services are connected"
          />
        </div>
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
        id="first-message"
        label="First message"
        value={prompt.firstMessage}
        onChange={(v) => set({ firstMessage: v })}
        maxLength={300}
        rows={2}
        placeholder="What the assistant says first"
      />

      <CharCountField
        id="system-instructions"
        label="System instructions"
        value={prompt.systemInstructions}
        onChange={(v) => set({ systemInstructions: v })}
        maxLength={2000}
        rows={6}
        placeholder="Core instructions the assistant follows on every call"
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

      <RepeatableList
        label="Conversation objectives"
        items={prompt.objectives}
        onChange={(v) => set({ objectives: v })}
        itemPlaceholder="Objective"
        addLabel="Add objective"
        maxItems={8}
      />

      <RepeatableList
        label="Information to collect"
        items={prompt.informationToCollect}
        onChange={(v) => set({ informationToCollect: v })}
        itemPlaceholder="Field to collect"
        addLabel="Add field"
        maxItems={10}
      />

      <CharCountField
        id="escalation-rules"
        label="Escalation rules"
        value={prompt.escalationRules}
        onChange={(v) => set({ escalationRules: v })}
        maxLength={800}
        rows={3}
        placeholder="When should this assistant hand off to a human?"
      />

      <CharCountField
        id="prohibited-behavior"
        label="Prohibited behavior"
        value={prompt.prohibitedBehavior}
        onChange={(v) => set({ prohibitedBehavior: v })}
        maxLength={800}
        rows={3}
        placeholder="What should this assistant never say or do?"
      />

      <CharCountField
        id="call-ending-rules"
        label="Call-ending rules"
        value={prompt.callEndingRules}
        onChange={(v) => set({ callEndingRules: v })}
        maxLength={500}
        rows={2}
        placeholder="When and how should the assistant end the call?"
      />
    </div>
  );
}
