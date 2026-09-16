import { forwardRef, useId, type KeyboardEvent, type MouseEvent } from "react";
import { Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PublishButtonProps {
  /** True only when clicking should open the confirmation dialog. */
  eligible: boolean;
  /** True while the publish mutation is in flight. */
  pending: boolean;
  /** Why publishing is unavailable. Always present when `eligible` is false. */
  disabledReason?: string;
  onClick: () => void;
}

/**
 * The single Publish control for the persisted builder.
 *
 * When it is not eligible it stays in the tab order with `aria-disabled` and a
 * guarded no-op rather than a native `disabled` attribute, so the reason is
 * always reachable. That reason is now rendered as visible text beneath the
 * control instead of living only in a tooltip and a screen-reader-only span:
 * publishing is the one irreversible action in this journey, and "why can't I
 * press this?" should never require hovering.
 *
 * `forwardRef(...)` is a call expression at module top level, so a bundler must
 * otherwise assume it has side effects and keep it even when nothing
 * references the result. The annotation states what is already true and
 * changes nothing at runtime.
 */
export const PublishButton = /*#__PURE__*/ forwardRef<HTMLButtonElement, PublishButtonProps>(
  function PublishButton({ eligible, pending, disabledReason, onClick }, ref) {
    const descriptionId = useId();
    const label = pending ? "Publishing…" : "Publish";

    if (!eligible) {
      const reason = disabledReason ?? "Publishing is not available right now.";
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
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            Publish
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
      <Button
        ref={ref}
        type="button"
        size="sm"
        onClick={() => {
          if (pending) return;
          onClick();
        }}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {label}
      </Button>
    );
  },
);
