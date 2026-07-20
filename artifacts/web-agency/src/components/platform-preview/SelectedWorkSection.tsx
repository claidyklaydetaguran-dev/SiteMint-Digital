import { Link } from "wouter";
import { ArrowRight, ExternalLink } from "lucide-react";

/**
 * Real projects, matching src/pages/Portfolio.tsx — no fabricated results.
 * Trimmed to three for a homepage-scale section; "View all work" links to
 * the existing /portfolio page for the complete list.
 *
 * Checkpoint 2A.4 Part 9: real screenshots of these live sites were the
 * goal, captured with controlled local tooling. That tooling requires
 * outbound network access to each project's real domain — confirmed
 * unavailable in this environment (direct `curl` to all three domains
 * returns a 403 from the environment's outbound proxy, verified before
 * writing this component). Fabricating screenshot imagery to simulate what
 * the real pages look like would violate the "no fabricated... real
 * project interfaces" requirement, so this section keeps real text content
 * only, presented in a browser-chrome frame that visually signals "this is
 * a real, external website" without depicting invented page content.
 * Capturing genuine local screenshots remains a follow-up task once
 * network access (or owner-supplied image assets) is available.
 */
const projects = [
  {
    name: "Shasta Greene Real Estate",
    url: "https://shastagreene.com",
    domain: "shastagreene.com",
    category: "Real Estate",
    description:
      "A professional real estate website designed to build trust, showcase services, and support lead generation.",
  },
  {
    name: "OneFilAm Community",
    url: "https://onefilamcommunity.org",
    domain: "onefilamcommunity.org",
    category: "Nonprofit Organization",
    description:
      "A nonprofit community website supporting Filipino-American outreach, events, and organizational credibility.",
  },
  {
    name: "Herlinda Valdovinos",
    url: "https://herlindavaldovinos.com",
    domain: "herlindavaldovinos.com",
    category: "Professional Services",
    description:
      "A professional website built to establish online credibility and help generate client inquiries.",
  },
];

export function SelectedWorkSection() {
  return (
    <section aria-labelledby="pp-work-heading" className="px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 id="pp-work-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
              Selected work
            </h2>
            <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
              Real projects SiteMint has delivered.
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

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {projects.map((project) => (
            <a
              key={project.domain}
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col overflow-hidden rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] transition-shadow hover:shadow-[var(--sm-shadow-md)]"
            >
              {/* Browser-chrome frame — signals "real external site," without
                  depicting fabricated page content (see file header note). */}
              <div className="flex items-center gap-2 border-b border-[hsl(var(--sm-color-border-subtle))] bg-[hsl(var(--sm-color-surface-muted))] px-4 py-2.5">
                <span aria-hidden="true" className="flex gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--sm-color-border-strong))]" />
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--sm-color-border-strong))]" />
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--sm-color-border-strong))]" />
                </span>
                <span className="ml-1 truncate rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-color-surface-default))] px-2.5 py-0.5 text-[11px] text-[hsl(var(--sm-color-text-muted))]">
                  {project.domain}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-action-primary))]">
                  {project.category}
                </span>
                <h3 className="mt-2 text-base font-semibold text-[hsl(var(--sm-color-text-primary))]">{project.name}</h3>
                <p className="mt-2 flex-1 text-sm text-[hsl(var(--sm-color-text-secondary))]">{project.description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--sm-color-text-muted))] group-hover:text-[hsl(var(--sm-color-action-primary))]">
                  Visit live site
                  <ExternalLink size={13} aria-hidden="true" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
