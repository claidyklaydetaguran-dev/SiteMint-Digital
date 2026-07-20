import { Globe, Phone, Users, Workflow, Wrench, BarChart3 } from "lucide-react";

const nodes = [
  { label: "Website", description: "Your front door — built to convert visitors into leads.", icon: Globe },
  { label: "AI Receptionist", description: "Answers, qualifies, and follows up on every inbound lead.", icon: Phone },
  { label: "CRM", description: "One record of truth for every lead and client touchpoint.", icon: Users },
  { label: "Automation", description: "Follow-up and scheduling that runs without manual work.", icon: Workflow },
  { label: "AI Toolkit", description: "Focused AI tools that support day-to-day business work.", icon: Wrench },
  { label: "Analytics", description: "Visibility into what's working, for the whole business.", icon: BarChart3 },
];

export function EcosystemVisual() {
  return (
    <section
      id="pp-ecosystem"
      aria-labelledby="pp-ecosystem-heading"
      className="px-4 py-20 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 id="pp-ecosystem-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            One connected system, not six disconnected tools
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            Every SiteMint product and service is designed to work together — a lead
            captured on your website can flow all the way to a follow-up in your CRM.
          </p>
        </div>

        {/* Visible node grid — communicates the same information at every breakpoint,
            so no meaning depends on the connecting-line animation alone. */}
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {nodes.map((node, index) => {
            const Icon = node.icon;
            return (
              <li key={node.label}>
                <div
                  tabIndex={0}
                  className="pp-reveal group flex h-full flex-col items-center gap-3 rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-5 text-center transition-shadow focus:outline-none focus-visible:shadow-[var(--sm-shadow-glow-subtle)] hover:shadow-[var(--sm-shadow-md)]"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-accent-background)] text-[var(--sm-button-accent-text)]">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">{node.label}</span>
                  <span className="text-xs leading-relaxed text-[hsl(var(--sm-color-text-muted))]">{node.description}</span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Decorative connecting line — desktop/tablet only, purely supplementary. */}
        <div aria-hidden="true" className="mt-8 hidden justify-center sm:flex">
          <svg width="100%" height="12" viewBox="0 0 600 12" preserveAspectRatio="none" className="max-w-4xl">
            <line
              x1="10"
              y1="6"
              x2="590"
              y2="6"
              stroke="hsl(var(--sm-mint-500))"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
              className="pp-connector-path"
            />
          </svg>
        </div>
      </div>
    </section>
  );
}
