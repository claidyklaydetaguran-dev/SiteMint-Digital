import { useRef, useState } from "react";
import { CheckSquare, FileSearch, Hammer, Network, TrendingUp } from "lucide-react";

/**
 * Coordinated project-control rail (Checkpoint 2A.2 Part 6) rather than five
 * identical generic cards. Every phase's artifact/decision is always
 * visible in its own rail card — "readable without interaction" — and
 * selecting a phase (click or arrow keys, matching BusinessGoalSelector's
 * proven accessible pattern) opens a detail panel with the fuller
 * description. No fake project-status data, timeline, or delivery date.
 */
const phases = [
  {
    id: "discover",
    label: "Discover",
    artifact: "Business goals, bottlenecks, and customer journey",
    artifactType: "Customer-journey map",
    icon: FileSearch,
    detail:
      "We start by understanding the business, not the tech stack: current goals, where leads or time are being lost, and what the customer's actual journey looks like today.",
  },
  {
    id: "architect",
    label: "Architect",
    artifact: "System map, product scope, and technical plan",
    artifactType: "System blueprint",
    icon: Network,
    detail:
      "Before building anything, we map how the pieces connect — website, product, CRM, automation — and scope exactly what's in and out, so the build has a real plan behind it.",
  },
  {
    id: "build",
    label: "Build",
    artifact: "Design, engineering, and integrations",
    artifactType: "Interface & integration modules",
    icon: Hammer,
    detail:
      "Design and engineering happen together, with the systems from Architect actually wired up — not a static design handed off to be built later.",
  },
  {
    id: "launch",
    label: "Launch",
    artifact: "Quality assurance, training, and controlled release",
    artifactType: "QA & release checklist",
    icon: CheckSquare,
    detail:
      "We verify the system works end to end, train the team who'll use it, and release in a controlled way rather than a single risky cutover.",
  },
  {
    id: "improve",
    label: "Improve",
    artifact: "Performance review, system refinement, and future opportunities",
    artifactType: "Performance & opportunity review",
    icon: TrendingUp,
    detail:
      "A launched system isn't a finished one. We review how it's actually performing and refine it — and flag real opportunities as the business changes.",
  },
] as const;

export function ProcessSection() {
  const [selectedId, setSelectedId] = useState<(typeof phases)[number]["id"]>(phases[0].id);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedPhase = phases.find((phase) => phase.id === selectedId) ?? phases[0];

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + phases.length) % phases.length;
    setSelectedId(phases[nextIndex].id);
    buttonRefs.current[nextIndex]?.focus();
  }

  return (
    <section aria-labelledby="pp-process-heading" className="bg-[hsl(var(--sm-color-bg-subtle))] px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 id="pp-process-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            How SiteMint works
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            Business understanding, systems architecture, engineering, and ongoing
            improvement — one connected process, not a one-time build.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Project phases — select a phase for more detail"
          className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          {/* Connecting rail line, desktop only — decorative, meaning already
              carried by the numbered/labeled cards themselves. */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-9 hidden h-px lg:block"
            style={{ backgroundColor: "hsl(var(--sm-color-border-default))" }}
          />

          {phases.map((phase, index) => {
            const isSelected = phase.id === selectedId;
            return (
              <button
                key={phase.id}
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setSelectedId(phase.id)}
                onFocus={() => setSelectedId(phase.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className="relative z-[1] flex flex-col items-start gap-2 rounded-[var(--sm-radius-lg)] border p-6 text-left transition-all"
                style={{
                  borderColor: isSelected ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-default))",
                  backgroundColor: "hsl(var(--sm-color-surface-default))",
                  boxShadow: isSelected ? "var(--sm-shadow-md)" : undefined,
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--sm-radius-pill)] text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: isSelected ? "hsl(var(--sm-color-action-primary))" : "hsl(var(--sm-color-surface-muted))",
                    color: isSelected ? "hsl(var(--sm-color-text-inverse))" : "hsl(var(--sm-color-text-muted))",
                  }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="pp-font-display text-lg font-semibold text-[hsl(var(--sm-color-text-primary))]">{phase.label}</p>
                <p className="text-xs leading-relaxed text-[hsl(var(--sm-color-text-muted))]">{phase.artifact}</p>
              </button>
            );
          })}
        </div>

        <div
          role="status"
          aria-live="polite"
          className="mt-6 overflow-hidden rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))]"
        >
          {/* Artifact-style header bar — signals "this is a project deliverable
              preview," not just another paragraph (Checkpoint 2A.4 Part 10). */}
          <div className="flex items-center gap-2.5 border-b border-[hsl(var(--sm-color-border-subtle))] bg-[hsl(var(--sm-color-surface-muted))] px-6 py-3">
            <selectedPhase.icon size={15} aria-hidden="true" className="text-[hsl(var(--sm-color-action-primary))]" />
            <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-action-primary))]">
              {selectedPhase.label} artifact — {selectedPhase.artifactType}
            </span>
          </div>
          <p className="p-6 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">{selectedPhase.detail}</p>
        </div>
      </div>
    </section>
  );
}
