const steps = [
  { label: "Discover", note: "Understand your business, goals, and current systems." },
  { label: "Design", note: "Plan the experience and structure before building." },
  { label: "Build", note: "Engineer the website, application, or system." },
  { label: "Launch", note: "Ship it, with training and a real handoff." },
  { label: "Improve", note: "Ongoing refinement as your business changes." },
];

export function ProcessSection() {
  return (
    <section aria-labelledby="pp-process-heading" className="bg-[hsl(var(--sm-color-bg-subtle))] px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 id="pp-process-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            How SiteMint works
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            Business understanding, design, engineering, and systems thinking — combined,
            not siloed.
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, index) => (
            <li
              key={step.label}
              className="rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-6"
            >
              <span className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-mint-500))]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-3 text-base font-semibold text-[hsl(var(--sm-color-text-primary))]">{step.label}</p>
              <p className="mt-1 text-sm text-[hsl(var(--sm-color-text-muted))]">{step.note}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
