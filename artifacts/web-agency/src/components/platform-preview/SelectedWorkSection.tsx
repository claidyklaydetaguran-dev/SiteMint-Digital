import { Link } from "wouter";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { portfolioProjects, type PortfolioProject } from "./portfolioProjects";
import { FeaturedVisual, SupportingVisual } from "./PortfolioVisual";

/**
 * Data-driven Selected Work (Checkpoint 2B.3). Project content lives in
 * portfolioProjects.ts; this file only composes layout. Adding, replacing,
 * or reordering a project — or later adding Shasta Greene once its asset is
 * approved — is a data change there, not a redesign here.
 */

function ProjectCta({ project }: { project: PortfolioProject }) {
  if (!project.publicUrl) return null;
  return (
    <a
      href={project.publicUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${project.ctaLabel} — ${project.projectName} (opens in a new tab)`}
      className="group/cta inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--sm-color-action-primary))] hover:underline"
    >
      {project.ctaLabel}
      <ArrowUpRight size={15} aria-hidden="true" className="transition-transform group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
    </a>
  );
}

function FeaturedProject({ project }: { project: PortfolioProject }) {
  return (
    <article className="grid grid-cols-1 items-center gap-10 rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-6 md:p-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
      <div className="order-2 lg:order-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-action-primary))]">
          Featured project — {project.category}
        </span>
        <h3 className="pp-font-display mt-3 text-2xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-3xl">
          {project.projectName}
        </h3>
        <p className="mt-4 text-base leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">{project.summary}</p>
        <ul className="mt-6 space-y-2">
          {project.contribution.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-[hsl(var(--sm-color-text-secondary))]">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--sm-color-action-primary))]" />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <ProjectCta project={project} />
        </div>
      </div>
      <div className="order-1 lg:order-2 lg:pb-10 lg:pr-6">
        <FeaturedVisual project={project} />
      </div>
    </article>
  );
}

function SupportingProject({ project }: { project: PortfolioProject }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-6">
      <SupportingVisual project={project} />
      <div className="mt-6 flex flex-1 flex-col">
        <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-action-primary))]">
          {project.statusLabel ?? project.category}
        </span>
        <h3 className="mt-2 text-base font-semibold text-[hsl(var(--sm-color-text-primary))]">{project.projectName}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">{project.summary}</p>
        <div className="mt-5">
          <ProjectCta project={project} />
        </div>
      </div>
    </article>
  );
}

export function SelectedWorkSection() {
  const sorted = [...portfolioProjects].sort((a, b) => a.sortOrder - b.sortOrder);
  const featured = sorted.find((project) => project.featured);
  const supporting = sorted.filter((project) => !project.featured);

  return (
    <section aria-labelledby="pp-work-heading" className="px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 id="pp-work-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
              Selected work
            </h2>
            <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
              Real projects SiteMint has delivered, across different industries.
            </p>
          </div>
          <Link
            href="/portfolio"
            className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[hsl(var(--sm-color-action-primary))] hover:underline"
          >
            View all work
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        {featured && (
          <div className="mb-6">
            <FeaturedProject project={featured} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {supporting.map((project) => (
            <SupportingProject key={project.id} project={project} />
          ))}
        </div>
      </div>
    </section>
  );
}
