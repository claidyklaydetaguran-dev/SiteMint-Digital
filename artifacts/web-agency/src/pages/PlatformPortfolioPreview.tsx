import { useMemo, useState } from "react";
import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { PreviewPageHeader } from "@/components/platform-preview/PreviewPageHeader";
import { PortfolioFilter } from "@/components/platform-preview/PortfolioFilter";
import { SupportingVisual } from "@/components/platform-preview/PortfolioVisual";
import { portfolioProjects } from "@/components/platform-preview/portfolioProjects";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";

const PREVIEW_TITLE = "Portfolio — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION = "Internal, unpublished preview of SiteMint's approved, real client work.";

export default function PlatformPortfolioPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);
  const [category, setCategory] = useState("All");

  const categories = useMemo(
    () => Array.from(new Set(portfolioProjects.map((project) => project.category))),
    [],
  );
  const sorted = useMemo(() => [...portfolioProjects].sort((a, b) => a.sortOrder - b.sortOrder), []);
  const filtered = useMemo(
    () => (category === "All" ? sorted : sorted.filter((project) => project.category === category)),
    [sorted, category],
  );

  return (
    <PlatformPreviewPageShell>
      <PreviewPageHeader
        eyebrow="Selected Work"
        headingId="pp-portfolio-page-heading"
        heading="Real projects SiteMint has delivered"
        intro="Every project below is real, approved client work — no invented results or metrics. Desktop and mobile visuals are shown together wherever both were captured."
      >
        <div className="mt-8">
          <PortfolioFilter categories={categories} active={category} onSelect={setCategory} />
        </div>
      </PreviewPageHeader>

      <section aria-labelledby="pp-portfolio-page-heading" className="px-4 pb-24 md:px-8">
        <div key={category} className="pp-reveal mx-auto grid max-w-[1280px] grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <article
              key={project.id}
              className="flex flex-col overflow-hidden rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[hsl(var(--sm-mint-500))] hover:shadow-[var(--sm-shadow-glow-subtle)]"
            >
              <div className="overflow-hidden rounded-[var(--sm-radius-md)]">
                <SupportingVisual project={project} />
              </div>
              <div className="mt-6 flex flex-1 flex-col">
                <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-action-primary))]">
                  {project.statusLabel ?? project.category}
                </span>
                <h3 className="mt-2 text-base font-semibold text-[hsl(var(--sm-color-text-primary))]">{project.projectName}</h3>
                <p className="mt-1 text-xs text-[hsl(var(--sm-color-text-muted))]">{project.industry}</p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">{project.summary}</p>
                <ul className="mt-4 flex flex-col gap-1.5">
                  {project.contribution.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-[hsl(var(--sm-color-text-secondary))]">
                      <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--sm-mint-500))]" />
                      {item}
                    </li>
                  ))}
                </ul>
                {project.publicUrl && (
                  <a
                    href={project.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${project.ctaLabel} — ${project.projectName} (opens in a new tab)`}
                    className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[hsl(var(--sm-color-action-primary))] hover:underline"
                  >
                    {project.ctaLabel}
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <FinalCtaSection />
    </PlatformPreviewPageShell>
  );
}
