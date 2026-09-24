import type { VoicePreset } from "@/lib/assistantEstimates";

interface CostBreakdownProps {
  preset: VoicePreset;
  className?: string;
  compact?: boolean;
}

/**
 * The estimated per-minute range for a preset.
 *
 * Every figure here is a planning estimate — nothing is fetched pricing and
 * nothing is an invoice amount. The "Estimate" chip and the sentence naming
 * the limit travel with the number by design: the contract test requires both
 * to be present, so the figure can never appear on its own.
 *
 * Presentation only in this pass: `--sd-*` tokens instead of utility classes.
 */
export function CostBreakdown({ preset, className = "", compact = false }: CostBreakdownProps) {
  return (
    <div className={className} style={{ minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--sd-space-2, .5rem)" }}>
        <span
          style={{
            fontSize: "var(--sd-text-small, .8125rem)",
            fontWeight: 600,
            color: "var(--sd-text, #051824)",
          }}
        >
          Estimated configuration range
        </span>
        <span className="sd-chip">Estimate</span>
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
          overflowWrap: "anywhere",
        }}
      >
        ${preset.costRangeLow.toFixed(2)}–${preset.costRangeHigh.toFixed(2)}
        <span
          style={{
            marginLeft: "var(--sd-space-1, .25rem)",
            fontSize: "var(--sd-text-small, .8125rem)",
            fontWeight: 400,
            color: "var(--sd-text-muted, #3b5265)",
          }}
        >
          / min
        </span>
      </p>

      <p
        style={{
          margin: "var(--sd-space-1, .25rem) 0 0",
          fontSize: "var(--sd-text-small, .8125rem)",
          lineHeight: 1.5,
          color: "var(--sd-text-muted, #3b5265)",
        }}
      >
        Final pricing available after provider connection.
      </p>

      {!compact && (
        <div
          style={{
            margin: "var(--sd-space-3, .75rem) 0 0",
            display: "flex",
            flexDirection: "column",
            gap: "var(--sd-space-2, .5rem)",
          }}
        >
          {preset.costBreakdown.map((cat) => (
            <div
              key={cat.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sd-space-3, .75rem)",
                fontSize: "var(--sd-text-small, .8125rem)",
                color: "var(--sd-text-muted, #3b5265)",
              }}
            >
              <span style={{ flex: "0 0 6rem", minWidth: 0 }}>{cat.label}</span>
              <span
                aria-hidden="true"
                style={{
                  flex: "1 1 auto",
                  height: 6,
                  borderRadius: 3,
                  background: "var(--sd-muted-surface, #f6fbfa)",
                  border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.round(cat.share * 100)}%`,
                    background: "var(--sd-accent, #27e9b5)",
                  }}
                />
              </span>
              <span style={{ flex: "0 0 2.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(cat.share * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
