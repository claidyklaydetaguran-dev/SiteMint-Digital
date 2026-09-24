import { useId, type KeyboardEvent, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UnavailableActionButtonProps {
  icon?: LucideIcon;
  label: string;
  /** Why the action cannot be taken. Always rendered, never hover-only. */
  availability: string;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Stand-in for an action that is not available.
 *
 * Unlike a native `disabled` button this stays in the tab order, so keyboard
 * and screen-reader users can reach it and hear why — `aria-disabled` plus a
 * no-op handler keep it inert without hiding the explanation.
 *
 * The reason used to live only in a tooltip and a visually hidden span, which
 * meant a sighted mouse-free user had no way to read it and a touch user had
 * no hover to trigger it. It is now rendered as visible text beside the
 * control and referenced by `aria-describedby`, so the reason a control cannot
 * be used is on the screen rather than behind an interaction.
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sd-space-2, .5rem)", minWidth: 0 }}>
      <Button
        type="button"
        variant="outline"
        size={size}
        aria-disabled="true"
        aria-describedby={descriptionId}
        onClick={guardedNoop}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") guardedNoop(e);
        }}
        className={className}
        style={{ cursor: "not-allowed", opacity: 0.65, alignSelf: "flex-start" }}
      >
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </Button>
      <p
        id={descriptionId}
        style={{
          margin: 0,
          maxWidth: "34rem",
          fontSize: "var(--sd-text-small, .8125rem)",
          lineHeight: 1.5,
          color: "var(--sd-text-muted, #3b5265)",
        }}
      >
        {availability}
      </p>
    </div>
  );
}
