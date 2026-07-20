import { useEffect, useRef, useState } from "react";
import { Wrench } from "lucide-react";
import { systemStages } from "./systemFlow";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { CapabilityBadge, CapabilityLegend } from "./CapabilityBadge";

const CYCLE_MS = 2400;

/**
 * "Living system" demonstration, not a static diagram: cycles a single
 * "current stage" indicator across the same systemStages data the workflow
 * section uses, showing state words (Waiting/Received/Responding/…) rather
 * than a decorative animation. The full stage list — label, state, and
 * owning system — is always rendered as real text, so the narrative is
 * complete even with the cycle disabled (reduced motion, or before JS
 * finishes hydrating). Nodes matching the selected business goal
 * (BusinessGoalSelector) get a persistent emphasis ring independent of the
 * auto-cycle, so the two interactions read as coordinated, not competing.
 */
export function EcosystemVisual() {
  const { selectedGoal } = useSelectedGoal();
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (reducedMotionRef.current || paused) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % systemStages.length);
    }, CYCLE_MS);
    return () => window.clearInterval(interval);
  }, [paused]);

  return (
    <section
      id="pp-ecosystem"
      aria-labelledby="pp-ecosystem-heading"
      className="px-4 py-20 md:px-8 md:py-28"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 id="pp-ecosystem-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            One connected system, not six disconnected tools
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            A live look at how a single inquiry moves through SiteMint's connected
            systems — the same website, AI receptionist, CRM, and automation working
            together, not six separate tools.
          </p>
        </div>

        <div className="mb-6">
          <CapabilityLegend />
        </div>

        <ol
          aria-label="Customer journey through the SiteMint system, showing each stage's current status"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7"
        >
          {systemStages.map((stage, index) => {
            const Icon = stage.icon;
            const isActive = index === activeIndex && !reducedMotionRef.current;
            const isEmphasized = selectedGoal.emphasizedStageIds.includes(stage.id);

            return (
              <li key={stage.id}>
                <div
                  tabIndex={0}
                  className="pp-reveal flex h-full flex-col items-center gap-2 rounded-[var(--sm-radius-lg)] border p-4 text-center transition-all duration-300 focus:outline-none focus-visible:shadow-[var(--sm-shadow-glow-subtle)]"
                  style={{
                    animationDelay: `${index * 60}ms`,
                    borderColor: isEmphasized
                      ? "hsl(var(--sm-color-border-focus))"
                      : "hsl(var(--sm-color-border-default))",
                    backgroundColor: isActive
                      ? "hsl(var(--sm-mint-100))"
                      : "hsl(var(--sm-color-surface-default))",
                    boxShadow: isActive ? "var(--sm-shadow-md)" : undefined,
                  }}
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-[var(--sm-radius-pill)] transition-colors duration-300"
                    style={{
                      backgroundColor: isActive ? "var(--sm-button-accent-background)" : "hsl(var(--sm-color-surface-muted))",
                      color: isActive ? "var(--sm-button-accent-text)" : "hsl(var(--sm-color-text-muted))",
                    }}
                  >
                    <Icon size={18} aria-hidden="true" />
                  </span>

                  <span
                    className="rounded-[var(--sm-radius-pill)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors"
                    style={{
                      backgroundColor: isActive ? "hsl(var(--sm-color-action-primary))" : "hsl(var(--sm-color-surface-muted))",
                      color: isActive ? "hsl(var(--sm-color-text-inverse))" : "hsl(var(--sm-color-text-muted))",
                    }}
                  >
                    {stage.state}
                  </span>

                  <span className="text-xs font-semibold leading-tight text-[hsl(var(--sm-color-text-primary))]">{stage.label}</span>
                  <span className="text-[11px] leading-snug text-[hsl(var(--sm-color-text-muted))]">{stage.system}</span>
                  <CapabilityBadge level={stage.capability} />
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex items-center justify-center gap-3 rounded-[var(--sm-radius-lg)] border border-dashed border-[hsl(var(--sm-color-border-strong))] px-5 py-3 text-center">
          <Wrench size={16} aria-hidden="true" className="shrink-0 text-[hsl(var(--sm-color-text-muted))]" />
          <p className="text-xs text-[hsl(var(--sm-color-text-muted))]">
            <span className="font-semibold text-[hsl(var(--sm-color-text-secondary))]">AI Toolkit</span> supports the team
            behind every stage above — it isn't a single step in the pipeline, it's used throughout.
          </p>
        </div>
      </div>
    </section>
  );
}
