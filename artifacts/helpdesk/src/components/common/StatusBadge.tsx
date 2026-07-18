import { Badge } from "@/components/ui/badge";

export type StatusTone = "success" | "warning" | "info" | "neutral" | "destructive";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-success/15 text-success border-transparent dark:bg-success/20",
  warning: "bg-warning/15 text-warning border-transparent dark:bg-warning/20",
  info: "bg-info/15 text-info border-transparent dark:bg-info/20",
  neutral: "bg-muted text-muted-foreground border-transparent",
  destructive: "bg-destructive/10 text-destructive border-transparent dark:bg-destructive/20",
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
