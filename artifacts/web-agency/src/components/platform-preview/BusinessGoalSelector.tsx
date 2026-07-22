import { useRef } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { startProjectHref } from "./navConfig";

/**
 * The homepage's signature interaction. Selecting a business priority
 * updates PlatformPreviewGoalContext, which EcosystemVisual, ProductsSection,
 * ServicesSection, and AiReceptionistDemo all read — one control, no
 * per-goal page variant duplicated anywhere. Hosted by PostHeroGoalSection
 * as its own dedicated post-hero section (relocated out of the hero per
 * owner feedback that the selector cluttered it); sized here for that
 * larger, more deliberate presentation rather than a compact hero widget.
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
    <div id="pp-goal-selector" className="w-full max-w-2xl">
      <div
        role="radiogroup"
        aria-label="What's your priority right now?"
        className="flex flex-wrap justify-center gap-3"
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
              className={`rounded-[var(--sm-radius-pill)] border px-5 py-3 text-sm font-semibold transition-all duration-200 ${
                isSelected ? "shadow-[var(--sm-shadow-md)]" : "hover:-translate-y-0.5"
              }`}
              style={{
                borderColor: isSelected ? "transparent" : "hsl(var(--pp-mint-mist))",
                backgroundColor: isSelected ? "hsl(var(--pp-mint-deep))" : "hsl(var(--pp-mint-warm-white))",
                color: isSelected ? "hsl(var(--pp-mint-warm-white))" : "hsl(var(--pp-forest-deep))",
              }}
            >
              {goal.label}
            </button>
          );
        })}
      </div>

      <div role="status" aria-live="polite" className="mt-6 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center">
        <p className="text-sm" style={{ color: "hsl(var(--pp-forest-slate))" }}>
          {selectedGoal.heroSupportingCopy}
        </p>
        <Link
          href={startProjectHref}
          className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          style={{ color: "hsl(var(--pp-mint-deep))" }}
        >
          {selectedGoal.ctaLabel}
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-2 text-center text-[11px]" style={{ color: "hsl(var(--pp-mint-sage-gray))" }}>
        Updates this page for this visit only — nothing is tracked or saved.
      </p>
    </div>
  );
}
