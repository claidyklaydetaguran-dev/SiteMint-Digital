import { forwardRef, useId, type KeyboardEvent, type MouseEvent } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BrowserTestButtonProps {
  /** True only when clicking should open the browser-test confirmation dialog. */
  eligible: boolean;
  /** True while preparing/connecting/connected/ending. */
  active: boolean;
  /** Why testing is unavailable. Always present when `eligible` is false. */
  disabledReason?: string;
  onClick: () => void;
}

/**
 * The Test control for the persisted builder. Mirrors PublishButton: when it
 * is not eligible it keeps `aria-disabled` and a guarded no-op rather than a
 * native `disabled` attribute, and the reason is rendered as visible text
 * rather than hidden in a tooltip.
 */
export const BrowserTestButton = /*#__PURE__*/ forwardRef<HTMLButtonElement, BrowserTestButtonProps>(
  function BrowserTestButton({ eligible, active, disabledReason, onClick }, ref) {
    const descriptionId = useId();

    if (!eligible || active) {
      const reason = active
        ? "A browser test is already active."
        : (disabledReason ?? "Browser voice testing is not available right now.");
      const guardedNoop = (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
        e.preventDefault();
      };
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sd-space-2, .5rem)", minWidth: 0 }}>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            size="sm"
            aria-disabled="true"
            aria-describedby={descriptionId}
            onClick={guardedNoop}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") guardedNoop(e);
            }}
            style={{ cursor: "not-allowed", opacity: 0.65, alignSelf: "flex-start" }}
          >
            {active ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Test
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
            {reason}
          </p>
        </div>
      );
    }

    return (
      <Button ref={ref} type="button" variant="outline" size="sm" onClick={onClick}>
        <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Test
      </Button>
    );
  },
);
