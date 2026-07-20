import { useRef } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { startProjectHref } from "./navConfig";

/**
 * The homepage's signature interaction — now integrated directly into the
 * hero (Checkpoint 2A.4 Part 1), not a separate boxed card section below
 * it. Selecting a business priority updates PlatformPreviewGoalContext,
 * which EcosystemVisual, ConnectedWorkflowSection, ProductsSection,
 * ServicesSection, HeroSystemCanvas, and AiReceptionistDemo all read — one
 * control, no per-goal page variant duplicated anywhere.
 *
 * Works fully without animation: selection is a plain state change.
 * Keyboard: standard radiogroup pattern (arrow keys move selection).
 */
export function BusinessGoalSelector() {
  const { goals, selectedGoal, selectedGoalId, selectGoal } = useSelectedGoal();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + goals.length) % goals.length;
    selectGoal(goals[nextIndex].id);
    buttonRefs.current[nextIndex]?.focus();
  }

  return (
    <div id="pp-goal-selector">
      <h2 id="pp-goal-selector-heading" className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
        What's your priority right now?
      </h2>

      <div
        role="radiogroup"
        aria-labelledby="pp-goal-selector-heading"
        className="mt-3 flex flex-wrap gap-2"
      >
        {goals.map((goal, index) => {
          const isSelected = goal.id === selectedGoalId;
          return (
            <button
              key={goal.id}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectGoal(goal.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`rounded-[var(--sm-radius-pill)] border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? "border-transparent bg-[var(--sm-button-primary-background)] text-[var(--sm-button-primary-text)]"
                  : "border-[hsl(var(--sm-color-border-default))] bg-transparent text-[hsl(var(--sm-color-text-secondary))] hover:bg-[hsl(var(--sm-color-surface-interactive))]"
              }`}
            >
              {goal.label}
            </button>
          );
        })}
      </div>

      <div role="status" aria-live="polite" className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-sm text-[hsl(var(--sm-color-text-secondary))]">{selectedGoal.heroSupportingCopy}</p>
        <Link
          href={startProjectHref}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--sm-color-action-primary))] hover:underline"
        >
          {selectedGoal.ctaLabel}
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-1 text-[11px] text-[hsl(var(--sm-color-text-muted))]">
        Updates this page for this visit only — nothing is tracked or saved.
      </p>
    </div>
  );
}
