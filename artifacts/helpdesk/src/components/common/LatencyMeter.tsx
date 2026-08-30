import { LATENCY_BANDS, bandForLatency, type LatencyCategoryEstimate } from "@/lib/assistantEstimates";

const TONE_BAR_CLASSES: Record<string, string> = {
  success: "bg-success",
  info: "bg-accent",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

const TONE_TEXT_CLASSES: Record<string, string> = {
  success: "text-success",
  info: "text-accent-foreground dark:text-accent",
  warning: "text-warning",
  destructive: "text-destructive",
};

interface LatencyMeterProps {
  latencyMs: number;
  breakdown?: LatencyCategoryEstimate[];
  className?: string;
  compact?: boolean;
}

/**
 * Advisory latency guidance — four illustrative bands with a marker for the
 * selected preset. Never presented as a measured result for this assistant.
 */
export function LatencyMeter({ latencyMs, breakdown, className = "", compact = false }: LatencyMeterProps) {
  const band = bandForLatency(latencyMs);
  const maxScale = 1500;
  const markerPct = Math.min(100, (latencyMs / maxScale) * 100);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">Latency guidance</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Guidance
          </span>
        </div>
        <span className={`text-xs font-semibold ${TONE_TEXT_CLASSES[band.tone]}`}>{band.label}</span>
      </div>

      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-foreground">
        ~{latencyMs} ms
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Illustrative planning guidance, not a measurement of this assistant's live performance.
      </p>

      {/* Four-zone advisory bar with a marker for the selected preset */}
      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-0 flex">
          {LATENCY_BANDS.map((b) => (
            <div
              key={b.label}
              className={`h-full ${TONE_BAR_CLASSES[b.tone]} opacity-60`}
              style={{
                width:
                  b.maxMs === null
                    ? `${100 - (b.minMs / maxScale) * 100}%`
                    : `${((b.maxMs - b.minMs) / maxScale) * 100}%`,
              }}
            />
          ))}
        </div>
        <div
          className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow"
          style={{ left: `${markerPct}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Under 700 ms</span>
        <span>1200 ms+</span>
      </div>

      {!compact && breakdown && (
        <div className="mt-3 space-y-1.5">
          {breakdown.map((cat) => (
            <div key={cat.label} className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{cat.label}</span>
              <span className="tabular-nums text-foreground">~{cat.ms} ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
