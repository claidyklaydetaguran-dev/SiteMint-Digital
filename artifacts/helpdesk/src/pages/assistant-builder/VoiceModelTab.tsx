import { BrainCircuit, AudioLines, Ear, Cpu, AlertTriangle } from "lucide-react";
import { PresetSelector } from "@/components/common/PresetSelector";
import { CostBreakdown } from "@/components/common/CostBreakdown";
import { LatencyMeter } from "@/components/common/LatencyMeter";
import { findVoicePreset } from "@/lib/assistantEstimates";
import { PRESET_RECOVERY, VOICE_MODEL } from "@/pages/assistants/assistantsContract";
import type { BuilderTabProps } from "@/pages/AssistantBuilder";

const FRIENDLY_STACK = [
  { icon: BrainCircuit, label: "Conversational model", desc: "Understands the caller and decides how to respond." },
  { icon: AudioLines, label: "Natural voice", desc: "Speaks back in a clear, human-sounding voice." },
  { icon: Ear, label: "Accurate transcription", desc: "Turns what the caller says into text the assistant can use." },
  { icon: Cpu, label: "SiteMint voice runtime", desc: "Coordinates the conversation in real time." },
];

/**
 * AR-001I: when the saved config carries a retired preset, `findVoicePreset`
 * returns undefined and this tab says so, in amber, above an unselected
 * preset group. It does not correct the draft: an automatic rewrite here
 * would look like a saved change the customer never made, and would be
 * persisted by the next save. The estimates are withheld for the same
 * reason — there is no honest figure to show for a preset that is not one of
 * the four below.
 */
export default function VoiceModelTab({ draft, update }: BuilderTabProps) {
  const preset = findVoicePreset(draft.voiceModel.preset);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">{VOICE_MODEL.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{VOICE_MODEL.detail}</p>
      </div>

      {preset === undefined && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-warning-foreground dark:text-warning">
              {PRESET_RECOVERY.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{PRESET_RECOVERY.detail}</p>
          </div>
        </div>
      )}

      <PresetSelector
        value={draft.voiceModel.preset}
        onChange={(preset) => update((d) => ({ ...d, voiceModel: { ...d.voiceModel, preset } }))}
      />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
          {VOICE_MODEL.includedHeading}
        </p>
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

      {preset === undefined ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          {PRESET_RECOVERY.estimatesUnavailable}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <CostBreakdown preset={preset} />
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <LatencyMeter latencyMs={preset.latencyMs} breakdown={preset.latencyBreakdown} />
          </div>
        </div>
      )}
    </div>
  );
}
