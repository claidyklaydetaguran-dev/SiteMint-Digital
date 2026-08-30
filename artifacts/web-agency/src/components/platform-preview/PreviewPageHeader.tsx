import type { ReactNode } from "react";

/**
 * Shared page-header band for every /platform-preview/* sub-page (Services,
 * Pricing, Portfolio, About, Contact, AI Receptionist) — same eyebrow/
 * heading/intro shape each page would otherwise repeat inline.
 */
export function PreviewPageHeader({
  eyebrow,
  heading,
  headingId,
  intro,
  children,
}: {
  eyebrow: string;
  heading: string;
  headingId: string;
  intro: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-16 md:px-8 md:pb-16 md:pt-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[320px]"
        style={{
          background:
            "radial-gradient(circle at 20% -10%, hsl(var(--sm-mint-100) / 0.9), transparent 55%), radial-gradient(circle at 85% 5%, hsl(var(--sm-mint-100) / 0.45), transparent 45%)",
        }}
      />
      <div className="pp-reveal mx-auto max-w-[1280px]">
        <p className="mb-4 inline-flex items-center rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
          {eyebrow}
        </p>
        <h1 id={headingId} className="pp-font-display max-w-2xl text-3xl font-semibold leading-tight text-[hsl(var(--sm-color-text-primary))] sm:text-4xl md:text-5xl">
          {heading}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-[hsl(var(--sm-color-text-secondary))] md:text-lg">{intro}</p>
        {children}
      </div>
    </section>
  );
}
