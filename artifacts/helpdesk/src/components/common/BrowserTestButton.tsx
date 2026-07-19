import { forwardRef, useId, type KeyboardEvent, type MouseEvent } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BrowserTestButtonProps {
  /** True only when clicking should open the browser-test confirmation dialog. */
  eligible: boolean;
  /** True while preparing/connecting/connected/ending — shows a busy label and disables the control. */
  active: boolean;
  /** Accessible explanation shown whenever the control is not eligible. Always present when `eligible` is false. */
  disabledReason?: string;
  onClick: () => void;
}

/**
 * Milestone 1 / Checkpoint F1: the header Test control for the persisted
 * assistant builder. Mirrors PublishButton's accessibility pattern —
 * `aria-disabled` + a guarded no-op instead of a native `disabled`
 * attribute so keyboard/screen-reader users can always discover the reason,
 * becoming a real actionable button only when `eligible` is true.
 */
export const BrowserTestButton = forwardRef<HTMLButtonElement, BrowserTestButtonProps>(function BrowserTestButton(
  { eligible, active, disabledReason, onClick },
  ref,
) {
  const descriptionId = useId();

  if (!eligible || active) {
    const reason = active ? "A browser test is already active." : (disabledReason ?? "Browser voice testing is not available right now.");
    const guardedNoop = (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
      e.preventDefault();
    };
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            type="button"
            aria-disabled="true"
            aria-describedby={descriptionId}
            onClick={guardedNoop}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") guardedNoop(e);
            }}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "min-h-11 cursor-not-allowed gap-1.5 opacity-50 md:min-h-8",
            )}
          >
            {active ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Test
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-52 text-xs">
          {reason}
        </TooltipContent>
        <span id={descriptionId} className="sr-only">
          Test — {reason}
        </span>
      </Tooltip>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11 gap-1.5 md:min-h-8")}
    >
      <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Test
    </button>
  );
});
