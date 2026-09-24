interface MetricEstimateProps {
  label: string;
  value: string;
  sublabel?: string;
  className?: string;
}

/** Renders a value with a required "Estimate" affordance — never presented as a real measurement. */
export function MetricEstimate({ label, value, sublabel, className = "" }: MetricEstimateProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Estimate
        </span>
      </div>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {sublabel && <p className="text-[11px] text-muted-foreground">{sublabel}</p>}
    </div>
  );
}
