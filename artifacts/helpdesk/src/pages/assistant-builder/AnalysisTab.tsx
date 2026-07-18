import { Switch } from "@/components/ui/switch";
import { CharCountField } from "@/components/common/CharCountField";
import { RepeatableList } from "@/components/common/RepeatableList";
import { DisabledFeatureCard } from "@/components/common/DisabledFeatureCard";
import { BarChart3, FileOutput } from "lucide-react";
import type { BuilderTabProps } from "@/pages/AssistantBuilder";

export default function AnalysisTab({ draft, update }: BuilderTabProps) {
  const { analysis } = draft;
  const set = (patch: Partial<typeof analysis>) =>
    update((d) => ({ ...d, analysis: { ...d.analysis, ...patch } }));

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Analysis</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure what this assistant should extract and summarize after each call. These
          settings are editable now but won't run against real calls yet.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Call summary</p>
          <p className="text-xs text-muted-foreground">Generate a short summary after each call.</p>
        </div>
        <Switch
          checked={analysis.callSummaryEnabled}
          onCheckedChange={(checked) => set({ callSummaryEnabled: checked })}
          aria-label="Enable call summary"
        />
      </div>

      <CharCountField
        id="success-criteria"
        label="Success criteria"
        value={analysis.successCriteria}
        onChange={(v) => set({ successCriteria: v })}
        maxLength={500}
        rows={3}
        placeholder="What should count as a successful call?"
      />

      <RepeatableList
        label="Lead qualification fields"
        items={analysis.leadQualificationFields}
        onChange={(v) => set({ leadQualificationFields: v })}
        itemPlaceholder="Field"
        addLabel="Add field"
        maxItems={8}
      />

      <CharCountField
        id="follow-up-recommendation"
        label="Follow-up recommendation"
        value={analysis.followUpRecommendation}
        onChange={(v) => set({ followUpRecommendation: v })}
        maxLength={300}
        rows={2}
        placeholder="What should happen next after this type of call?"
      />

      <div className="space-y-3">
        <DisabledFeatureCard
          icon={FileOutput}
          title="Structured outputs"
          description="Schema-defined data extracted from each call."
          availability="Real analytics available after live calls are connected"
        />
        <DisabledFeatureCard
          icon={BarChart3}
          title="End reason & call summary results"
          description="Populated automatically once calls start coming in."
          availability="Real analytics available after live calls are connected"
        />
      </div>
    </div>
  );
}
