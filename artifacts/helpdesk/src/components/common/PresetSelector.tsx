import { Check } from "lucide-react";
import { VOICE_MODEL_PRESETS } from "@/lib/assistantEstimates";
import { VOICE_MODEL, type StoredVoicePresetId, type SupportedVoicePresetId } from "@/pages/assistants/assistantsContract";

interface PresetSelectorProps {
  /**
   * May be a retired preset a saved config still carries, in which case no
   * card is selected — the caller shows the recovery state above this group.
   */
  value: StoredVoicePresetId;
  onChange: (value: SupportedVoicePresetId) => void;
  className?: string;
}

/**
 * Business-friendly Voice & Model preset cards — no provider names shown
 * here, and only presets the server can actually publish.
 *
 * Selection is carried by the border, the surface and the check mark
 * together, never by colour alone. AR-001I removed the glow that used to
 * mark the active card: mint reads as "this is live" elsewhere in the
 * product, and a chosen preset is a saved setting, not a running thing.
 */
export function PresetSelector({ value, onChange, className = "" }: PresetSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label={VOICE_MODEL.presetGroupLabel}
      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${className}`}
    >
      {VOICE_MODEL_PRESETS.map((preset) => {
        const active = preset.id === value;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(preset.id)}
            className={`flex min-h-11 flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              active
                ? "border-primary bg-surface-muted"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{preset.label}</span>
              {active && (
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
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
