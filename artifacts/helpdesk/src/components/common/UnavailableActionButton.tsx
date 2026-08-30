import { useId, type KeyboardEvent, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UnavailableActionButtonProps {
  icon?: LucideIcon;
  label: string;
  /** e.g. "Publishing available in Checkpoint E" — must name the enabling checkpoint/milestone. */
  availability: string;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Stand-in for an action that isn't wired up yet. Unlike a native
 * `disabled` button, this stays in the tab order so keyboard and
 * screen-reader users can reach it and hear why it's unavailable —
 * `aria-disabled` + a no-op handler keep it inert without hiding the
 * explanation. Mouse users still see the tooltip on hover.
 */
export function UnavailableActionButton({
  icon: Icon,
  label,
  availability,
  size = "sm",
  className = "",
}: UnavailableActionButtonProps) {
  const descriptionId = useId();

  const guardedNoop = (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault();
  };

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          aria-describedby={descriptionId}
          onClick={guardedNoop}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") guardedNoop(e);
          }}
          className={cn(
            buttonVariants({ variant: "outline", size }),
            "min-h-11 cursor-not-allowed opacity-50 md:min-h-8",
            size === "default" && "md:min-h-9",
            className,
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-52 text-xs">
        {availability}
      </TooltipContent>
      <span id={descriptionId} className="sr-only">
        {label} — {availability}
      </span>
    </Tooltip>
  );
}
