import { LATENCY_BANDS, bandForLatency, type LatencyCategoryEstimate } from "@/lib/assistantEstimates";

const TONE_COLOR: Record<string, string> = {
  success: "var(--sd-accent, #27e9b5)",
  info: "var(--sd-accent-soft, #e8f8f5)",
  warning: "var(--sd-warn, #8a5200)",
  destructive: "var(--sd-danger, #9c2233)",
};

const TONE_TEXT: Record<string, string> = {
  success: "var(--sd-text, #051824)",
  info: "var(--sd-text, #051824)",
  warning: "var(--sd-warn, #8a5200)",
  destructive: "var(--sd-danger, #9c2233)",
};

interface LatencyMeterProps {
  latencyMs: number;
  breakdown?: LatencyCategoryEstimate[];
  className?: string;
  compact?: boolean;
}

/**
 * Advisory latency guidance — four illustrative bands with a marker for the
 * selected preset.
 *
 * It is never presented as a measured result for this assistant, and the
 * sentence saying so travels with the figure: the contract test requires both
 * the "Guidance" chip and that denial to be present, so the number cannot
 * appear alone.
 *
 * Presentation only in this pass: `--sd-*` tokens instead of utility classes.
 */
export function LatencyMeter({ latencyMs, breakdown, className = "", compact = false }: LatencyMeterProps) {
  const band = bandForLatency(latencyMs);
  const maxScale = 1500;
  const markerPct = Math.min(100, (latencyMs / maxScale) * 100);

  return (
    <div className={className} style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sd-space-2, .5rem)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "var(--sd-space-2, .5rem)" }}>
          <span
            style={{
              fontSize: "var(--sd-text-small, .8125rem)",
              fontWeight: 600,
              color: "var(--sd-text, #051824)",
            }}
          >
            Latency guidance
          </span>
          <span className="sd-chip">Guidance</span>
        </span>
        <span
          style={{
            fontSize: "var(--sd-text-small, .8125rem)",
            fontWeight: 600,
            color: TONE_TEXT[band.tone] ?? "var(--sd-text, #051824)",
          }}
        >
          {band.label}
        </span>
      </div>

      <p
        style={{
          margin: "var(--sd-space-2, .5rem) 0 0",
          fontSize: "var(--sd-text-figure, 2rem)",
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: "var(--sd-text, #051824)",
        }}
      >
        ~{latencyMs} ms
      </p>

      <p
        style={{
          margin: "var(--sd-space-1, .25rem) 0 0",
          fontSize: "var(--sd-text-small, .8125rem)",
          lineHeight: 1.5,
          color: "var(--sd-text-muted, #3b5265)",
        }}
      >
        Illustrative planning guidance, not a measurement of this assistant's live performance.
      </p>

      {/* Four-zone advisory bar with a marker for the selected preset. */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          margin: "var(--sd-space-3, .75rem) 0 0",
          height: 8,
          borderRadius: 4,
          border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
          background: "var(--sd-muted-surface, #f6fbfa)",
          overflow: "hidden",
        }}
      >
        <span style={{ position: "absolute", inset: 0, display: "flex" }}>
          {LATENCY_BANDS.map((b) => (
            <span
              key={b.label}
              style={{
                height: "100%",
                opacity: 0.55,
                background: TONE_COLOR[b.tone] ?? "var(--sd-border, rgba(59,82,101,.12))",
                width:
                  b.maxMs === null
                    ? `${100 - (b.minMs / maxScale) * 100}%`
                    : `${((b.maxMs - b.minMs) / maxScale) * 100}%`,
              }}
            />
          ))}
        </span>
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: `${markerPct}%`,
            transform: "translate(-50%, -50%)",
            width: 3,
            height: 14,
            borderRadius: 2,
            background: "var(--sd-text, #051824)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          margin: "var(--sd-space-1, .25rem) 0 0",
          fontSize: "var(--sd-text-micro, .6875rem)",
          color: "var(--sd-text-muted, #3b5265)",
        }}
      >
        <span>Under 700 ms</span>
        <span>1200 ms+</span>
      </div>

      {!compact && breakdown && (
        <div
          style={{
            margin: "var(--sd-space-3, .75rem) 0 0",
            display: "flex",
            flexDirection: "column",
            gap: "var(--sd-space-1, .25rem)",
          }}
        >
          {breakdown.map((cat) => (
            <div
              key={cat.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "var(--sd-space-3, .75rem)",
                fontSize: "var(--sd-text-small, .8125rem)",
                color: "var(--sd-text-muted, #3b5265)",
              }}
            >
              <span style={{ minWidth: 0 }}>{cat.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--sd-text, #051824)" }}>
                ~{cat.ms} ms
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
