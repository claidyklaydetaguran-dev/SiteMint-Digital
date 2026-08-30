import { capabilityLabels, capabilityTokenKey, type CapabilityLevel } from "./capabilityStatus";

/**
 * Small, always-legible status pill using the shared design-tokens'
 * statusbadge-* soft-tint pairs (already contrast-corrected — see
 * lib/design-tokens/src/semantic.css Phase 1C.1 notes) so labeling honesty
 * doesn't cost visual premium-ness.
 */
export function CapabilityBadge({ level }: { level: CapabilityLevel }) {
  const key = capabilityTokenKey[level];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--sm-radius-pill)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: `var(--sm-statusbadge-${key}-background)`,
        color: `var(--sm-statusbadge-${key}-text)`,
      }}
    >
      {capabilityLabels[level]}
    </span>
  );
}

export function CapabilityLegend() {
  const order: CapabilityLevel[] = ["available", "in-development", "planned"];
  return (
    <div className="flex flex-wrap items-center justify-center gap-3" aria-hidden="false">
      <span className="text-xs text-[hsl(var(--sm-color-text-muted))]">Status key:</span>
      {order.map((level) => (
        <span key={level} className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--sm-color-text-muted))]">
          <CapabilityBadge level={level} />
        </span>
      ))}
    </div>
  );
}
