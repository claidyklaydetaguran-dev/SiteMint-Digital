const steps = [
  { label: "Visitor arrives", note: "On your website or a product landing page." },
  { label: "Inquiry captured", note: "Contact, Discovery, or product signup form." },
  { label: "AI or team responds", note: "AI Receptionist or your team follows up." },
  { label: "Lead enters CRM", note: "Every inquiry becomes a tracked record." },
  { label: "Follow-up begins", note: "Automated or manual, nothing sits idle." },
  { label: "Appointment or next action", note: "The lead moves toward a real outcome." },
  { label: "Visible to the team", note: "Every touchpoint is visible in one place." },
];

export function ConnectedWorkflowSection() {
  return (
    <section aria-labelledby="pp-workflow-heading" className="px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h2 id="pp-workflow-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            A lead never falls through the cracks
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            This is the direction every connected SiteMint system is built toward — some
            steps are already live today (AI Receptionist, CRM), others are rolling out
            product by product.
          </p>
        </div>

        <ol className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <li
              key={step.label}
              className="flex items-start gap-4 rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-5"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-primary-background)] text-sm font-semibold text-[var(--sm-button-primary-text)]"
              >
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">{step.label}</p>
                <p className="text-sm text-[hsl(var(--sm-color-text-muted))]">{step.note}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
