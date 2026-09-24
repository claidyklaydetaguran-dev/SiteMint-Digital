import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InlineErrorProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Shared section-level error state with a Retry action. Used so an API
 * failure never leaves a blank page.
 */
export function InlineError({
  title = "Something went wrong",
  description = "Check your connection and try again.",
  onRetry,
  className = "",
}: InlineErrorProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 text-center px-8 py-12 ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
        </Button>
      )}
    </div>
  );
}
