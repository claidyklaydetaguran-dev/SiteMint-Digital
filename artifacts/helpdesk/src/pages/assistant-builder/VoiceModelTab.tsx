import { BrainCircuit, AudioLines, Ear, Cpu } from "lucide-react";
import { PresetSelector } from "@/components/common/PresetSelector";
import { CostBreakdown } from "@/components/common/CostBreakdown";
import { LatencyMeter } from "@/components/common/LatencyMeter";
import { getVoicePreset } from "@/lib/assistantEstimates";
import type { BuilderTabProps } from "@/pages/AssistantBuilder";

const FRIENDLY_STACK = [
  { icon: BrainCircuit, label: "Conversational model", desc: "Understands the caller and decides how to respond." },
  { icon: AudioLines, label: "Natural voice", desc: "Speaks back in a clear, human-sounding voice." },
  { icon: Ear, label: "Accurate transcription", desc: "Turns what the caller says into text the assistant can use." },
  { icon: Cpu, label: "SiteMint voice runtime", desc: "Coordinates the conversation in real time." },
];

export default function VoiceModelTab({ draft, update }: BuilderTabProps) {
  const preset = getVoicePreset(draft.voiceModel.preset);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Voice & Model</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Choose how this assistant sounds and thinks. Provider details live under Advanced.
        </p>
      </div>

      <PresetSelector
        value={draft.voiceModel.preset}
        onChange={(preset) => update((d) => ({ ...d, voiceModel: { ...d.voiceModel, preset } }))}
      />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">What's included</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FRIENDLY_STACK.map((item) => (
            <div key={item.label} className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-surface-muted text-primary">
                <item.icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <CostBreakdown preset={preset} />
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <LatencyMeter latencyMs={preset.latencyMs} breakdown={preset.latencyBreakdown} />
        </div>
      </div>
    </div>
  );
}
