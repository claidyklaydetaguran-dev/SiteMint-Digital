import { Eye, GitBranch, ShieldCheck, Workflow } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";

const fragmented = [
  "Separate website, separate vendor",
  "Forms that go nowhere in particular",
  "Manual, inconsistent follow-up",
];

const connected = [
  "One connected customer experience",
  "Organized lead flow into a real CRM",
  "Thoughtful, purposeful automation",
];

/**
 * Where the business boundary sits — the four things worth naming in any
 * connected-vs-fragmented comparison (Checkpoint 2A.2 Part 5). Each row
 * reads differently depending on the shared systemMode (from
 * PlatformPreviewGoalContext, set by EcosystemVisual's ConnectedModeToggle)
 * — this section renders no toggle of its own.
 */
const boundaryRows = [
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
    label: "How SiteMint creates continuity",
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
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto mb-4 max-w-2xl text-center">
          <h2 id="pp-difference-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            The SiteMint difference
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            Most businesses assemble their online presence from disconnected pieces.
            SiteMint builds it as one system from the start.
          </p>
        </div>

        <p role="status" aria-live="polite" className="mb-10 text-center text-xs font-medium uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
          Currently viewing:{" "}
          <span className="text-[hsl(var(--sm-color-action-primary))]">
            {isConnected ? "Connected with SiteMint" : "Disconnected — typical approach"}
          </span>{" "}
          — set above in the system view
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr_1fr]">
          <div
            className="rounded-[var(--sm-radius-xl)] border p-7 transition-colors"
            style={{
              borderColor: !isConnected ? "hsl(var(--sm-color-border-strong))" : "hsl(var(--sm-color-border-default))",
              backgroundColor: "hsl(var(--sm-color-surface-default))",
              opacity: isConnected ? 0.75 : 1,
            }}
          >
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">Fragmented operation</h3>
            <ul className="mt-5 flex flex-col gap-3">
              {fragmented.map((item) => (
                <li key={item} className="text-sm text-[hsl(var(--sm-color-text-secondary))]">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[var(--sm-radius-xl)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-7">
            <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
              The customer journey boundary
            </h3>
            <dl className="mt-5 flex flex-col gap-4">
              {boundaryRows.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="flex gap-3 border-t border-[hsl(var(--sm-color-border-subtle))] pt-4 first:border-t-0 first:pt-0">
                    <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[hsl(var(--sm-color-action-primary))]" />
                    <div>
                      <dt className="text-xs font-semibold text-[hsl(var(--sm-color-text-primary))]">{row.label}</dt>
                      <dd className="mt-0.5 text-xs text-[hsl(var(--sm-color-text-muted))]">
                        {isConnected ? row.connected : row.disconnected}
                      </dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </div>

          <div
            className="rounded-[var(--sm-radius-xl)] border p-7 transition-colors"
            style={{
              borderColor: isConnected ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-default))",
              backgroundColor: "hsl(var(--sm-color-surface-default))",
              boxShadow: isConnected ? "var(--sm-shadow-md)" : undefined,
              opacity: isConnected ? 1 : 0.75,
            }}
          >
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-action-primary))]">SiteMint connected system</h3>
            <ul className="mt-5 flex flex-col gap-3">
              {connected.map((item) => (
                <li key={item} className="text-sm text-[hsl(var(--sm-color-text-primary))]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
