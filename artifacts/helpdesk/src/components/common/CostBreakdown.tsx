import type { VoicePreset } from "@/lib/assistantEstimates";

interface CostBreakdownProps {
  preset: VoicePreset;
  className?: string;
  compact?: boolean;
}

/**
 * Clearly labeled estimated-cost component. Every figure is a planning
 * estimate — nothing here is fetched pricing or a real invoice amount.
 */
export function CostBreakdown({ preset, className = "", compact = false }: CostBreakdownProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">Estimated configuration range</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Estimate
          </span>
        </div>
      </div>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-foreground">
        ${preset.costRangeLow.toFixed(2)}–${preset.costRangeHigh.toFixed(2)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">/ min</span>
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Final pricing available after provider connection.
      </p>

      {!compact && (
        <div className="mt-3 space-y-1.5">
          {preset.costBreakdown.map((cat) => (
            <div key={cat.label} className="flex items-center gap-2">
              <span className="w-24 flex-shrink-0 text-[11px] text-muted-foreground">{cat.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(cat.share * 100)}%` }}
                />
              </div>
              <span className="w-9 flex-shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {Math.round(cat.share * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
