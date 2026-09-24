import { Link } from "wouter";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { portfolioProjects, type PortfolioProject } from "./portfolioProjects";
import { FeaturedVisual } from "./PortfolioVisual";

/**
 * Data-driven Selected Work. Project content lives in portfolioProjects.ts;
 * this file only composes layout.
 *
 * Frontend Epic 1 visual redesign V2: rewritten from a featured project +
 * supporting grid to a single large spotlight (the owner's "one large
 * project spotlight rather than a tiny grid" direction), showing only the
 * `featured: true` project (Hand Homecare). This is the ONLY place on the
 * homepage a client portfolio screenshot appears — the hero
 * (HeroDeviceComposition) is an original illustrative diagram and never
 * references this or any other client project.
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

export function SelectedWorkSection() {
  const featured = portfolioProjects.find((project) => project.featured);

  return (
    <section aria-labelledby="pp-work-heading" className="px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 id="pp-work-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
              Selected work
            </h2>
            <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
              A real project SiteMint has delivered — see the full portfolio for more.
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

        {featured && <FeaturedProject project={featured} />}
      </div>
    </section>
  );
}
