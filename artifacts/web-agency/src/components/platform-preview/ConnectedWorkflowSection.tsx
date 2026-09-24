import { Sparkles } from "lucide-react";
import { systemStages } from "./systemFlow";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";

/**
 * Detailed vertical read of the same systemStages data EcosystemVisual
 * animates — no separate hardcoded step list. Steps matching the selected
 * business goal (BusinessGoalSelector) get a "Focus for your goal" badge,
 * so the two sections read as one coordinated system rather than two
 * unrelated diagrams. Capability labels (Available now/In development/
 * Planned direction) are shown once, in EcosystemVisual, rather than
 * repeated here — avoids the "excessive status badges" anti-pattern while
 * this section's own prose already states the same capability honestly.
 */
export function ConnectedWorkflowSection() {
  const { selectedGoal } = useSelectedGoal();

  return (
    <section aria-labelledby="pp-workflow-heading" className="px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h2 id="pp-workflow-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            A lead never falls through the cracks
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            This is the direction every connected SiteMint system is built toward — some
            steps are already live today (AI Receptionist, CRM), others are rolling out
            product by product.
          </p>
        </div>

        <ol className="flex flex-col gap-3">
          {systemStages.map((stage, index) => {
            const isEmphasized = selectedGoal.emphasizedStageIds.includes(stage.id);
            return (
              <li
                key={stage.id}
                className="flex items-start gap-4 rounded-[var(--sm-radius-lg)] border p-5 transition-colors"
                style={{
                  borderColor: isEmphasized ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-default))",
                  // Checkpoint 2A.4 Part 12: was hsl(var(--sm-mint-100) / 0.5),
                  // which reads as pale/washed gray in dark theme (mint-100 is
                  // a light-theme primitive) and can look like a disabled
                  // control. A low-opacity tint of the theme-aware
                  // action-primary color stays a legible green tint in both
                  // themes instead.
                  backgroundColor: isEmphasized ? "hsl(var(--sm-color-action-primary) / 0.1)" : "hsl(var(--sm-color-surface-default))",
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-primary-background)] text-sm font-semibold text-[var(--sm-button-primary-text)]"
                >
                  {index + 1}
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">{stage.label}</p>
                    {isEmphasized && (
                      <span className="inline-flex items-center gap-1 rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-color-action-primary))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-inverse))]">
                        <Sparkles size={10} aria-hidden="true" />
                        Focus for your goal
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[hsl(var(--sm-color-text-muted))]">{stage.note}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
