import { Check } from "lucide-react";
import { VOICE_MODEL_PRESETS, type VoicePresetId } from "@/lib/assistantEstimates";

interface PresetSelectorProps {
  value: VoicePresetId;
  onChange: (value: VoicePresetId) => void;
  className?: string;
}

/** Business-friendly Voice & Model preset cards — no provider names shown here. */
export function PresetSelector({ value, onChange, className = "" }: PresetSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Voice and model preset" className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${className}`}>
      {VOICE_MODEL_PRESETS.map((preset) => {
        const active = preset.id === value;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(preset.id)}
            className={`flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all hover-elevate ${
              active
                ? "border-primary bg-surface-muted shadow-mint-glow"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{preset.label}</span>
              {active && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{preset.friendlyDescription}</p>
            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
              Est. ${preset.costRangeLow.toFixed(2)}–${preset.costRangeHigh.toFixed(2)}/min · ~{preset.latencyMs} ms
            </p>
          </button>
        );
      })}
    </div>
  );
}
