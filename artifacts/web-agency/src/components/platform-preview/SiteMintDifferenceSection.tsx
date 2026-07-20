import { Check, X } from "lucide-react";

const typical = [
  "Separate website, separate vendor",
  "Forms that go nowhere in particular",
  "Manual, inconsistent follow-up",
  "Disconnected point tools",
  "Limited visibility into what's working",
];

const sitemint = [
  "One connected customer experience",
  "Organized lead flow into a real CRM",
  "Thoughtful, purposeful automation",
  "Products and services that work together",
  "Ongoing system improvement, not a one-time build",
];

export function SiteMintDifferenceSection() {
  return (
    <section aria-labelledby="pp-difference-heading" className="bg-[hsl(var(--sm-color-bg-subtle))] px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 id="pp-difference-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            The SiteMint difference
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            Most businesses assemble their online presence from disconnected pieces.
            SiteMint builds it as one system from the start.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-[var(--sm-radius-xl)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">Typical disconnected approach</h3>
            <ul className="mt-5 flex flex-col gap-4">
              {typical.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-[hsl(var(--sm-color-text-secondary))]">
                  <X size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[hsl(var(--sm-color-status-danger))]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[var(--sm-radius-xl)] border border-[hsl(var(--sm-color-border-focus))] bg-[hsl(var(--sm-color-surface-default))] p-8 shadow-[var(--sm-shadow-md)]">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-action-primary))]">SiteMint approach</h3>
            <ul className="mt-5 flex flex-col gap-4">
              {sitemint.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-[hsl(var(--sm-color-text-primary))]">
                  <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[hsl(var(--sm-color-status-success))]" />
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
