import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";

interface KpiTileProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  href?: string;
  /** When true, renders a muted "not available" tile instead of a value — never a fabricated number. */
  unavailable?: boolean;
  unavailableLabel?: string;
}

/**
 * Business-metric tile for the Overview daily briefing. Real data only —
 * when a metric has no real source yet, pass `unavailable` and it renders
 * an honest "No data yet" state instead of a number.
 */
export function KpiTile({
  label,
  value,
  icon: Icon,
  href,
  unavailable = false,
  unavailableLabel = "No data yet",
}: KpiTileProps) {
  const inner = (
    <div
      className={`rounded-xl border border-border bg-card p-5 flex flex-col gap-3 shadow-xs transition-all duration-150 ${
        href && !unavailable ? "hover:shadow-md hover:border-primary/30 cursor-pointer" : ""
      } ${unavailable ? "opacity-70" : ""}`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          unavailable ? "bg-muted" : "bg-surface-muted"
        }`}
      >
        <Icon className={`h-4 w-4 ${unavailable ? "text-muted-foreground" : "text-primary"}`} aria-hidden="true" />
      </div>
      <div>
        {unavailable ? (
          <div className="text-sm font-medium text-muted-foreground leading-none">{unavailableLabel}</div>
        ) : (
          <div className="text-[28px] font-bold text-foreground leading-none tabular-nums">{value}</div>
        )}
        <div className="text-xs text-muted-foreground mt-2 leading-snug">{label}</div>
      </div>
    </div>
  );

  if (href && !unavailable) {
    return (
      <Link href={href} aria-label={`${label}: ${value}`}>
        {inner}
      </Link>
    );
  }
  return inner;
}
