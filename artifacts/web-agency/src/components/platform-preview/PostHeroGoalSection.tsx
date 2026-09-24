import { BusinessGoalSelector } from "./BusinessGoalSelector";

/**
 * Relocates BusinessGoalSelector out of the hero (owner feedback: "priority
 * selector clutters the hero") into its own full-width, tinted interactive
 * band directly after it. BusinessGoalSelector itself is reused unmodified
 * internally — it already reads/writes PlatformPreviewGoalContext via
 * useSelectedGoal()/selectGoal, so no context, data, or behavior changes;
 * only the presentation container around it is new.
 */
export function PostHeroGoalSection() {
  return (
    <section
      aria-labelledby="pp-goal-section-heading"
      className="px-4 py-14 md:px-8 md:py-16"
      style={{ backgroundColor: "hsl(var(--pp-mint-pale))" }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2
          id="pp-goal-section-heading"
          className="pp-font-display text-2xl font-semibold md:text-3xl"
          style={{ color: "hsl(var(--pp-forest-deep))" }}
        >
          What do you want SiteMint to help improve?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm md:text-base" style={{ color: "hsl(var(--pp-forest-slate))" }}>
          Pick a priority — the page below adjusts to show what matters most for it.
        </p>

        <div className="pp-goal-section-selector mt-8 flex justify-center">
          <BusinessGoalSelector />
        </div>
      </div>
    </section>
  );
}
