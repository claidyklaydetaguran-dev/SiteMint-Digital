import type { ReactNode } from "react";
import { InnerPageAtmosphere } from "./InnerPageAtmosphere";

/**
 * Dark hero band for the five redesigned inner pages — same eyebrow/
 * heading/intro shape as PreviewPageHeader.tsx (which is left untouched and
 * keeps serving the AI-Receptionist page), rendered over InnerPageAtmosphere
 * instead of PreviewPageHeader's flat light radial-gradient decoration.
 */
export function InnerPageHero({
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
      <InnerPageAtmosphere intensity="hero" />
      <div className="pp-reveal mx-auto max-w-[1280px]">
        <p
          className="mb-4 inline-flex items-center rounded-[var(--sm-radius-pill)] border px-4 py-1.5 text-xs font-medium uppercase tracking-wide"
          style={{
            borderColor: "hsl(var(--pp-cyan-mint) / 0.3)",
            backgroundColor: "hsl(var(--pp-navy-800) / 0.6)",
            color: "hsl(var(--pp-text-on-dark-muted))",
          }}
        >
          {eyebrow}
        </p>
        <h1
          id={headingId}
          className="pp-font-display max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl"
          style={{ color: "hsl(var(--pp-text-on-dark))" }}
        >
          {heading}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed md:text-lg" style={{ color: "hsl(var(--pp-text-on-dark-muted))" }}>
          {intro}
        </p>
        {children}
      </div>
    </section>
  );
}
