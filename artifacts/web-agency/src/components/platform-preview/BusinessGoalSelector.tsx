import { useRef } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { startProjectHref } from "./navConfig";

/**
 * The homepage's signature interaction. Selecting a business priority here
 * updates the shared PlatformPreviewGoalContext, which EcosystemVisual,
 * ConnectedWorkflowSection, ProductsSection, and ServicesSection all read —
 * so this one control coordinates hero-adjacent copy, system emphasis,
 * workflow emphasis, and recommendations without any per-goal page variant.
 *
 * Works fully without animation: selection is a plain state change; the
 * result panel below re-renders immediately regardless of motion
 * preference. Keyboard: standard radiogroup pattern (arrow keys move
 * selection, Tab enters/exits the group once).
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
    <section
      id="pp-goal-selector"
      aria-labelledby="pp-goal-selector-heading"
      className="px-4 pb-16 md:px-8 md:pb-20"
    >
      <div className="mx-auto max-w-4xl rounded-[var(--sm-radius-xl)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-6 shadow-[var(--sm-shadow-md)] md:p-8">
        <h2
          id="pp-goal-selector-heading"
          className="text-center text-sm font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]"
        >
          What's your priority right now?
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-center text-xs text-[hsl(var(--sm-color-text-muted))]">
          Your selection updates the page below for this visit only — nothing is
          tracked, profiled, or saved after you leave.
        </p>

        <div
          role="radiogroup"
          aria-labelledby="pp-goal-selector-heading"
          className="mt-5 flex flex-wrap justify-center gap-2"
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
                className={`rounded-[var(--sm-radius-pill)] border px-4 py-2 text-sm font-medium transition-colors ${
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

        <div
          role="status"
          aria-live="polite"
          className="mt-7 flex flex-col items-center gap-5 border-t border-[hsl(var(--sm-color-border-subtle))] pt-6 text-center"
        >
          <p className="max-w-xl text-base text-[hsl(var(--sm-color-text-primary))]">{selectedGoal.heroSupportingCopy}</p>

          <ul className="flex flex-wrap justify-center gap-2" aria-label="Recommended for this priority">
            {[...selectedGoal.recommendedProductIds, ...selectedGoal.recommendedServiceIds].map((id) => (
              <li
                key={id}
                className="inline-flex items-center gap-1.5 rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-mint-100))] px-3 py-1 text-xs font-medium text-[hsl(var(--sm-color-action-primary))]"
              >
                <CheckCircle2 size={12} aria-hidden="true" />
                {formatRecommendationLabel(id)}
              </li>
            ))}
          </ul>

          <div className="flex flex-col items-center gap-2">
            {/* Uses the primary (not accent-glow) treatment — the platform's one
                approved glow-CTA per page is reserved for FinalCtaSection. */}
            <Link
              href={startProjectHref}
              className="inline-flex items-center gap-2 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-primary-background)] px-6 py-3 text-sm font-semibold text-[var(--sm-button-primary-text)] shadow-[var(--sm-shadow-sm)] transition-colors hover:bg-[var(--sm-button-primary-background-hover)]"
            >
              {selectedGoal.ctaLabel}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <p className="text-xs text-[hsl(var(--sm-color-text-muted))]">{selectedGoal.microcopy}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  "ai-receptionist": "AI Receptionist",
  "ai-toolkit": "AI Toolkit",
  websites: "Websites",
  "web-apps": "Web Applications",
  crm: "CRM Systems",
  automation: "Business Automation",
  seo: "SEO & Digital Growth",
  maintenance: "Maintenance & Support",
};

function formatRecommendationLabel(id: string): string {
  return RECOMMENDATION_LABELS[id] ?? id;
}
