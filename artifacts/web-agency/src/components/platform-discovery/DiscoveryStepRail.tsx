import { STEP_LABELS, TOTAL_STEPS } from "./DiscoveryProgress";
import { STEP_WHY_COPY } from "./discoveryStepCopy";

interface DiscoveryStepRailProps {
  currentStep: number;
}

/**
 * Desktop-only (>=768px, hidden via CSS below that) left rail: narrative
 * context for the step someone is currently on, plus a read-only vertical
 * list of every step's status. Not clickable — the guided form has never
 * supported jumping ahead from the progress indicator (only DiscoveryReview's
 * per-section "Edit" links jump back to an already-completed step), so this
 * stays a status display, not new navigation.
 */
export function DiscoveryStepRail({ currentStep }: DiscoveryStepRailProps) {
  return (
    <aside className="dv5-rail" aria-label="About this step">
      <p className="dv5-rail-eyebrow">
        Step {currentStep + 1} of {TOTAL_STEPS}
      </p>
      <h3 className="dv5-rail-title pp-font-display font-semibold">{STEP_LABELS[currentStep]}</h3>
      <p className="dv5-rail-why">{STEP_WHY_COPY[currentStep]}</p>

      {/* Decorative status list only — the accessible, precisely-annotated
          equivalent (aria-current="step", "(completed)"/"(current step)")
          already exists in DiscoveryProgress's nav, kept in the DOM for
          screen readers via .md:sr-only rather than duplicated here. */}
      <ol className="dv5-rail-steps" aria-hidden="true">
        {STEP_LABELS.map((label, index) => {
          const isCurrent = index === currentStep;
          const isDone = index < currentStep;
          return (
            <li
              key={label}
              className={
                "dv5-rail-step" +
                (isCurrent ? " dv5-rail-step--current" : isDone ? " dv5-rail-step--done" : "")
              }
            >
              {label}
            </li>
          );
        })}
      </ol>

      <p className="dv5-rail-save-status">
        Your answers are saved in this browser as you go — close the tab and come back anytime before you submit.
      </p>
    </aside>
  );
}
