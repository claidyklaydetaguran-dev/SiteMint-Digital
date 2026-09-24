import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";

interface DisabledFeatureCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** e.g. "Publishing available in Checkpoint E" — every disabled action must name what enables it. */
  availability: string;
  action?: ReactNode;
  className?: string;
}

/** Explains what a disabled control does and which checkpoint/milestone enables it — never a silent dead control. */
export function DisabledFeatureCard({
  icon: Icon = Lock,
  title,
  description,
  availability,
  action,
  className = "",
}: DisabledFeatureCardProps) {
  return (
    <div className={`flex items-start gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3.5 ${className}`}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-card text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        <p className="mt-1.5 text-[11px] font-medium text-primary">{availability}</p>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
