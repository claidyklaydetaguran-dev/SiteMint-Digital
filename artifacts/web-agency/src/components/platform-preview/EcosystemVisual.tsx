import { useEffect, useRef, useState } from "react";
import { systemStages } from "./systemFlow";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { CapabilityLegend } from "./CapabilityBadge";
import { capabilityTokenKey } from "./capabilityStatus";
import { ConnectedModeToggle } from "./ConnectedModeToggle";
import { AiToolkitPreview } from "./AiToolkitPreview";

const CYCLE_MS = 2400;

/**
 * "Living system" demonstration, not a static diagram: in "Connected with
 * SiteMint" mode, cycles a single "current stage" indicator across the same
 * systemStages data the workflow section uses, showing state words
 * (Waiting/Received/Responding/…). In "Disconnected" mode the cycle stops —
 * there is no live system to animate — and each stage instead shows its
 * disconnectedNote/disconnectedState (systemFlow.ts), so the comparison
 * lives inside this one visual rather than a second unrelated diagram
 * (Checkpoint 2A.2 Part 2). The full stage list is always rendered as real
 * text in both modes, so the narrative is complete with the cycle disabled
 * (reduced motion, disconnected mode, or before JS finishes hydrating).
 *
 * The auto-cycle (connected mode only) pauses on hover/focus, when the tab
 * is hidden (`document.visibilityState`), and when the section scrolls out
 * of view (IntersectionObserver) — never runs anywhere the visitor isn't
 * actually looking, per the Part 9 motion requirement.
 */
export function EcosystemVisual() {
  const { selectedGoal, systemMode } = useSelectedGoal();
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredSystem, setHoveredSystem] = useState<string | null>(null);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [inViewport, setInViewport] = useState(false);
  const reducedMotionRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  const isConnected = systemMode === "connected";

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      setDocumentVisible(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), {
      threshold: 0.3,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cycleActive = isConnected && !reducedMotionRef.current && !interactionPaused && documentVisible && inViewport;

  useEffect(() => {
    if (!cycleActive) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % systemStages.length);
    }, CYCLE_MS);
    return () => window.clearInterval(interval);
  }, [cycleActive]);

  return (
    <section
      ref={sectionRef}
      id="pp-ecosystem"
      aria-labelledby="pp-ecosystem-heading"
      className="px-4 py-20 md:px-8 md:py-28"
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocus={() => setInteractionPaused(true)}
      onBlur={() => setInteractionPaused(false)}
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h2 id="pp-ecosystem-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            One connected system, not six disconnected tools
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            {isConnected
              ? "A live look at how a single inquiry moves through SiteMint's connected systems — the same website, AI receptionist, CRM, and automation working together."
              : "The same inquiry, moving through separate tools with no system connecting them — a realistic day for a business without SiteMint."}
          </p>
        </div>

        <div className="mb-8 flex justify-center">
          <ConnectedModeToggle />
        </div>

        {isConnected && (
          <div className="mb-6">
            <CapabilityLegend />
          </div>
        )}

        <ol
          aria-label={
            isConnected
              ? "Customer journey through the connected SiteMint system, showing each stage's current status"
              : "The same customer journey without a connected system"
          }
          className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7"
        >
          {/* Connecting thread, desktop only — decorative; the numbered
              sequence and labels already carry the meaning. */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-9 hidden h-px lg:block"
            style={{ backgroundColor: "hsl(var(--sm-color-border-default))" }}
          />
          {systemStages.map((stage, index) => {
            const Icon = stage.icon;
            const isActive = isConnected && index === activeIndex && !reducedMotionRef.current;
            const isEmphasized = isConnected && selectedGoal.emphasizedStageIds.includes(stage.id);
            const isHoverRelated = isConnected && hoveredSystem !== null && stage.system === hoveredSystem;

            const capKey = capabilityTokenKey[stage.capability];

            return (
              <li key={stage.id} className="relative z-[1]">
                <div
                  tabIndex={0}
                  onMouseEnter={() => setHoveredSystem(stage.system)}
                  onMouseLeave={() => setHoveredSystem(null)}
                  onFocus={() => setHoveredSystem(stage.system)}
                  onBlur={() => setHoveredSystem(null)}
                  className="pp-reveal flex h-full flex-col items-center gap-2 rounded-[var(--sm-radius-lg)] border p-4 text-center transition-all duration-300 focus:outline-none focus-visible:shadow-[var(--sm-shadow-glow-subtle)]"
                  style={{
                    animationDelay: `${index * 60}ms`,
                    borderColor: isHoverRelated
                      ? "hsl(var(--sm-mint-500))"
                      : isEmphasized
                        ? "hsl(var(--sm-color-border-focus))"
                        : "hsl(var(--sm-color-border-default))",
                    backgroundColor: isActive
                      ? "hsl(var(--sm-mint-100))"
                      : isHoverRelated
                        ? "hsl(var(--sm-mint-100) / 0.5)"
                        : isConnected
                          ? "hsl(var(--sm-color-surface-default))"
                          : "hsl(var(--sm-color-surface-muted))",
                    boxShadow: isActive || isHoverRelated ? "var(--sm-shadow-glow-subtle)" : undefined,
                    transform: isHoverRelated ? "translateY(-2px)" : undefined,
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
                    {isConnected ? stage.state : stage.disconnectedState}
                  </span>

                  <span className="text-xs font-semibold leading-tight text-[hsl(var(--sm-color-text-primary))]">{stage.label}</span>
                  <span className="text-[11px] leading-snug text-[hsl(var(--sm-color-text-muted))]">
                    {isConnected ? stage.system : stage.disconnectedNote}
                  </span>
                  {isConnected && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: `var(--sm-statusbadge-${capKey}-text)` }}>
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `var(--sm-statusbadge-${capKey}-text)` }} />
                      {stage.capability === "available" ? "Available" : stage.capability === "in-development" ? "In development" : "Planned"}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-6">
          <AiToolkitPreview />
        </div>
      </div>
    </section>
  );
}
