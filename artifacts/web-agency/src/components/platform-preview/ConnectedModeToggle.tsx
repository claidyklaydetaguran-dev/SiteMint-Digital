import { useSelectedGoal, type SystemMode } from "./PlatformPreviewGoalContext";

const options: { id: SystemMode; label: string }[] = [
  { id: "disconnected", label: "Disconnected" },
  { id: "connected", label: "Connected with SiteMint" },
];

/**
 * Real accessible segmented control (not hover-only), shared by
 * EcosystemVisual and SiteMintDifferenceSection via PlatformPreviewGoalContext
 * — renders once, here, so the two sections never duplicate the toggle.
 * Selection is static/meaning-bearing on its own: no animation is required
 * to understand either state, and nothing shifts layout when it changes.
 */
export function ConnectedModeToggle() {
  const { systemMode, setSystemMode } = useSelectedGoal();

  return (
    <div
      role="radiogroup"
      aria-label="View the customer journey as disconnected or connected with SiteMint"
      className="inline-flex rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-muted))] p-1"
    >
      {options.map((option) => {
        const isSelected = option.id === systemMode;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => setSystemMode(option.id)}
            className={`rounded-[var(--sm-radius-pill)] px-4 py-2 text-sm font-semibold transition-colors ${
              isSelected
                ? "bg-[hsl(var(--sm-color-surface-default))] text-[hsl(var(--sm-color-text-primary))] shadow-[var(--sm-shadow-sm)]"
                : "text-[hsl(var(--sm-color-text-muted))] hover:text-[hsl(var(--sm-color-text-primary))]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
      <span role="status" aria-live="polite" className="sr-only">
        {systemMode === "connected" ? "Showing the connected SiteMint system" : "Showing the disconnected, typical approach"}
      </span>
    </div>
  );
}
