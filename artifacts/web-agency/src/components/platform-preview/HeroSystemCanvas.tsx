import { BarChart3, Globe, MessageCircle, UserPlus, Workflow } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";

/**
 * The hero's living-system visual (Checkpoint 2A.4 Part 1) — a compact,
 * always-visible-above-the-fold companion to the headline, not a large form
 * card the visitor has to scroll to. Reuses the same five-stage subset of
 * the platform's canonical journey (systemFlow.ts ids: arrive, respond,
 * crm, followup, visible) so it never invents a second narrative; goal
 * selection re-emphasizes the relevant nodes instantly (a plain state
 * change, not an animation).
 *
 * Motion budget: exactly one leading animation — the connecting line and
 * nodes draw in once on mount (matches the existing pp-connector-draw /
 * pp-reveal keyframes already used in EcosystemVisual), then settle to a
 * fully static end state. Nothing loops, so there is nothing to pause for
 * reduced-motion, offscreen, or hidden-tab handling — @media
 * (prefers-reduced-motion: reduce) in platform-preview.css already disables
 * both keyframes globally, showing the settled state immediately.
 */
const canvasNodes = [
  { id: "arrive", label: "Website visitor", icon: Globe },
  { id: "respond", label: "AI Receptionist responds", icon: MessageCircle },
  { id: "crm", label: "Lead enters CRM", icon: UserPlus },
  { id: "followup", label: "Follow-up organized", icon: Workflow },
  { id: "visible", label: "Visible to the team", icon: BarChart3 },
];

export function HeroSystemCanvas() {
  const { selectedGoal } = useSelectedGoal();

  return (
    <div
      aria-label="A visitor inquiry moving through SiteMint's connected system: website, AI Receptionist, CRM, follow-up, and team visibility"
      className="relative w-full max-w-sm rounded-[var(--sm-radius-xl)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-6 shadow-[var(--sm-shadow-lg)]"
    >
      <div
        aria-hidden="true"
        className="pp-connector-path absolute left-[42px] top-14 h-[calc(100%-6.5rem)] w-px"
        style={{ backgroundColor: "hsl(var(--sm-color-border-focus))" }}
      />
      <p className="mb-5 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
        One inquiry, one connected system
      </p>
      <ol className="flex flex-col gap-5">
        {canvasNodes.map((node, index) => {
          const Icon = node.icon;
          const isEmphasized = selectedGoal.emphasizedStageIds.includes(node.id);
          return (
            <li key={node.id} className="pp-reveal flex items-center gap-3" style={{ animationDelay: `${index * 100}ms` }}>
              <span
                className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)] border-2 transition-colors duration-300"
                style={{
                  borderColor: isEmphasized ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-default))",
                  backgroundColor: isEmphasized ? "var(--sm-button-accent-background)" : "hsl(var(--sm-color-bg-elevated))",
                  color: isEmphasized ? "var(--sm-button-accent-text)" : "hsl(var(--sm-color-text-muted))",
                }}
              >
                <Icon size={16} aria-hidden="true" />
              </span>
              <span
                className="text-sm font-medium transition-colors duration-300"
                style={{
                  color: isEmphasized ? "hsl(var(--sm-color-text-primary))" : "hsl(var(--sm-color-text-secondary))",
                  fontWeight: isEmphasized ? 600 : 500,
                }}
              >
                {node.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
