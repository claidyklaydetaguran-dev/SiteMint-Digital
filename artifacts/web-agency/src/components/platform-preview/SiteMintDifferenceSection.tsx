import { ArrowRight, Eye, GitBranch, ShieldCheck, Workflow } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";

/**
 * One inquiry passing through a system boundary (Checkpoint 2A.4 Part 8) —
 * a single connected sequence, not a three-card SaaS-style comparison
 * table. Reads the same shared systemMode as EcosystemVisual's
 * Connected/Disconnected control (PlatformPreviewGoalContext) rather than
 * rendering a second toggle. Content is the same four boundary facts as
 * Checkpoint 2A.2/2A.3, restructured into a linear flow.
 */
const boundarySteps = [
  {
    icon: GitBranch,
    label: "Where information gets lost",
    disconnected: "Between the inbox, the spreadsheet, and whoever remembers to check.",
    connected: "Nowhere — every inquiry lands in one connected record.",
  },
  {
    icon: Workflow,
    label: "Where manual work happens",
    disconnected: "Copying details by hand between separate tools.",
    connected: "Only where a human decision genuinely belongs.",
  },
  {
    icon: ShieldCheck,
    label: "How context carries forward",
    disconnected: "It doesn't — each tool is its own island.",
    connected: "One system carries context from first contact to outcome.",
  },
  {
    icon: Eye,
    label: "Where the business keeps human oversight",
    disconnected: "Everywhere, by necessity — nothing else is watching.",
    connected: "At every decision point — automation assists, people decide.",
  },
];

export function SiteMintDifferenceSection() {
  const { systemMode } = useSelectedGoal();
  const isConnected = systemMode === "connected";

  return (
    <section aria-labelledby="pp-difference-heading" className="bg-[hsl(var(--sm-color-bg-subtle))] px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto mb-4 max-w-2xl text-center">
          <h2 id="pp-difference-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            One inquiry. Two ways it can go.
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            Most businesses assemble their online presence from disconnected pieces.
            SiteMint builds it as one system from the start.
          </p>
        </div>

        <p role="status" aria-live="polite" className="mb-10 text-center text-xs font-medium uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
          Following the inquiry:{" "}
          <span className="text-[hsl(var(--sm-color-action-primary))]">
            {isConnected ? "Connected with SiteMint" : "Disconnected — typical approach"}
          </span>{" "}
          — set above in the system view
        </p>

        <ol className="relative flex flex-col gap-3">
          <div
            aria-hidden="true"
            className="absolute bottom-6 left-5 top-6 hidden w-px sm:block"
            style={{ backgroundColor: isConnected ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-strong))" }}
          />
          {boundarySteps.map((step) => {
            const Icon = step.icon;
            return (
              <li
                key={step.label}
                className="relative z-[1] flex items-start gap-4 rounded-[var(--sm-radius-lg)] border p-5 transition-colors"
                style={{
                  borderColor: isConnected ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-default))",
                  backgroundColor: "hsl(var(--sm-color-surface-default))",
                  boxShadow: isConnected ? "var(--sm-shadow-sm)" : undefined,
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)]"
                  style={{
                    backgroundColor: isConnected ? "var(--sm-button-accent-background)" : "hsl(var(--sm-color-surface-muted))",
                    color: isConnected ? "var(--sm-button-accent-text)" : "hsl(var(--sm-color-text-muted))",
                  }}
                >
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">{step.label}</p>
                  <p className="mt-1 text-sm text-[hsl(var(--sm-color-text-secondary))]">
                    {isConnected ? step.connected : step.disconnected}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex items-center justify-center gap-2 text-sm font-medium text-[hsl(var(--sm-color-text-muted))]">
          <ArrowRight size={14} aria-hidden="true" />
          {isConnected ? "The outcome: one continuous, human-supervised system." : "Switch to “Connected with SiteMint” above to see the alternative."}
        </div>
      </div>
    </section>
  );
}
