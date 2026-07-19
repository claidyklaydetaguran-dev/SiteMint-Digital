import { forwardRef, useId, type KeyboardEvent, type MouseEvent } from "react";
import { Loader2, Rocket } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PublishButtonProps {
  /** True only when clicking should open the confirmation dialog. */
  eligible: boolean;
  /** True while the publish mutation is in flight. */
  pending: boolean;
  /** Accessible explanation shown whenever the control is not eligible. Always present when `eligible` is false. */
  disabledReason?: string;
  onClick: () => void;
}

/**
 * Milestone 1 / Checkpoint E3C: the single Publish control surface for the
 * persisted assistant builder. Mirrors UnavailableActionButton's
 * accessibility pattern (stays in the tab order, aria-disabled + guarded
 * no-op instead of a native `disabled` attribute, tooltip + sr-only text for
 * the explanation) whenever it isn't eligible, so keyboard and screen-reader
 * users can always discover why. Becomes a real actionable button only when
 * `eligible` is true. Forwards its ref to the underlying <button> so a
 * caller can restore focus here after the confirmation dialog closes.
 */
export const PublishButton = forwardRef<HTMLButtonElement, PublishButtonProps>(function PublishButton(
  { eligible, pending, disabledReason, onClick },
  ref,
) {
  const descriptionId = useId();
  const label = pending ? "Publishing…" : "Publish";

  if (!eligible) {
    const reason = disabledReason ?? "Publishing is not available right now.";
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
              "min-h-11 cursor-not-allowed opacity-50 md:min-h-8",
            )}
          >
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            Publish
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-52 text-xs">
          {reason}
        </TooltipContent>
        <span id={descriptionId} className="sr-only">
          Publish — {reason}
        </span>
      </Tooltip>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        if (pending) return;
        onClick();
      }}
      disabled={pending}
      aria-busy={pending}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11 gap-1.5 md:min-h-8")}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Rocket className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </button>
  );
});
