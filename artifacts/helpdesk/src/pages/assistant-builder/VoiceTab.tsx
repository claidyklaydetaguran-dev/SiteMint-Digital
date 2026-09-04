import { BrainCircuit, AudioLines, Ear, Cpu, AlertTriangle, Check, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CostBreakdown } from "@/components/common/CostBreakdown";
import { LatencyMeter } from "@/components/common/LatencyMeter";
import { VoiceSamplePlayer } from "@/components/common/VoiceSamplePlayer";
import { VOICE_MODEL_PRESETS, findVoicePreset } from "@/lib/assistantEstimates";
import {
  PRESET_RECOVERY,
  VOICE_MODEL,
  CURATED_VOICE_PRESET_IDS,
  isCuratedVoicePreset,
  type SupportedVoicePresetId,
} from "@/pages/assistants/assistantsContract";
import type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";

const FRIENDLY_STACK = [
  { icon: BrainCircuit, label: "Conversational model", desc: "Understands the caller and decides how to respond." },
  { icon: AudioLines, label: "Natural voice", desc: "Speaks back in a clear, human-sounding voice." },
  { icon: Ear, label: "Accurate transcription", desc: "Turns what the caller says into text the assistant can use." },
  { icon: Cpu, label: "SiteMint voice runtime", desc: "Coordinates the conversation in real time." },
];

const CURATED_PRESETS = VOICE_MODEL_PRESETS.filter((p) => isCuratedVoicePreset(p.id));
const MORE_PRESETS = VOICE_MODEL_PRESETS.filter((p) => !isCuratedVoicePreset(p.id));

/**
 * V5 PR-6 (C-4): two curated presets as the primary choice, each with a
 * sample player and a plain-language description. The other two supported
 * presets (and provider/model detail) move under Advanced — still fully
 * selectable and still fully supported for publishing, just not presented as
 * a first choice. A saved config carrying a retired preset (see AR-001I)
 * still gets the truthful recovery state above the picker; that behavior is
 * unchanged.
 */
export default function VoiceTab({ draft, update }: BuilderTabProps) {
  const preset = findVoicePreset(draft.voiceModel.preset);
  const selectedIsCurated = isCuratedVoicePreset(draft.voiceModel.preset);

  const choosePreset = (id: SupportedVoicePresetId) =>
    update((d) => ({ ...d, voiceModel: { ...d.voiceModel, preset: id } }));

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

      <div>
        <p className="mb-2 text-[11px] text-muted-foreground">{VOICE_MODEL.curatedNote}</p>
        <div role="radiogroup" aria-label={VOICE_MODEL.presetGroupLabel} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CURATED_PRESETS.map((p) => {
            const active = p.id === draft.voiceModel.preset;
            return (
              <div
                key={p.id}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                onClick={() => choosePreset(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choosePreset(p.id);
                  }
                }}
                className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  active ? "border-primary bg-surface-muted" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{p.label}</span>
                  {active && (
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{p.friendlyDescription}</p>
                <VoiceSamplePlayer presetId={p.id} presetLabel={p.label} />
              </div>
            );
          })}
        </div>
      </div>

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

      <Collapsible defaultOpen={!selectedIsCurated}>
        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg border border-border bg-card px-3.5 py-2.5 text-left text-sm font-medium text-foreground hover-elevate">
          Advanced
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4 rounded-lg border border-dashed border-border p-3.5">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
              {VOICE_MODEL.moreOptionsHeading}
            </p>
            <p className="mb-2 text-[11px] text-muted-foreground">{VOICE_MODEL.moreOptionsDetail}</p>
            <div role="radiogroup" aria-label="More voice presets" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MORE_PRESETS.map((p) => {
                const active = p.id === draft.voiceModel.preset;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => choosePreset(p.id)}
                    className={`flex min-h-11 flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      active ? "border-primary bg-surface-muted" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{p.label}</span>
                      {active && (
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.friendlyDescription}</p>
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      Est. ${p.costRangeLow.toFixed(2)}–${p.costRangeHigh.toFixed(2)}/min · ~{p.latencyMs} ms
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
              {VOICE_MODEL.advancedHeading}
            </p>
            <p className="text-xs text-muted-foreground">
              Model, voice and transcription providers are chosen by the selected preset above. There is no separate
              per-provider selection in this build.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
