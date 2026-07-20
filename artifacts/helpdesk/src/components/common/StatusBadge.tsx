import { Badge } from "@/components/ui/badge";

export type StatusTone = "success" | "warning" | "info" | "neutral" | "destructive";

// Phase 1C.1: corrected statusbadge-* component tokens (solid tints, not
// alpha-blended) — the prior raw success/warning/info/destructive-as-text
// approach measured below 4.5:1 for warning (2.09:1 light), info (3.47:1
// light), and destructive (3.83:1 dark). See semantic.css for the corrected
// values; light/dark now resolve automatically via the token cascade, no
// dark: variant needed in this class map.
const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-statusbadge-success-bg text-statusbadge-success-text border-transparent",
  warning: "bg-statusbadge-warning-bg text-statusbadge-warning-text border-transparent",
  info: "bg-statusbadge-info-bg text-statusbadge-info-text border-transparent",
  neutral: "bg-statusbadge-neutral-bg text-statusbadge-neutral-text border-transparent",
  destructive: "bg-statusbadge-danger-bg text-statusbadge-danger-text border-transparent",
};

interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
  className?: string;
}

/** Semantic-token status pill — pairs color with a text label (never color alone). */
export function StatusBadge({ label, tone, className = "" }: StatusBadgeProps) {
  return <Badge className={`${TONE_CLASSES[tone]} rounded-full px-2 py-0 text-xs ${className}`}>{label}</Badge>;
}
