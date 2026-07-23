import type { CSSProperties, ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import "@/styles/platform-preview.css";
import { useProductionDocumentMeta } from "@/hooks/useProductionDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { InnerPageHero } from "@/components/platform-preview/InnerPageHero";
import { FeaturedVisual, SupportingVisual } from "@/components/platform-preview/PortfolioVisual";
import { portfolioProjects, type PortfolioProject } from "@/components/platform-preview/portfolioProjects";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";
import { startProjectHref } from "@/components/platform-preview/navConfig";

const PAGE_TITLE = "Portfolio | SiteMint Digital";
const PAGE_DESCRIPTION = "Real client work from SiteMint Digital — websites and systems built for real estate professionals, nonprofits, and service providers.";

const featuredProject = portfolioProjects.find((p) => p.id === "hand-homecare")!;
const supportingProjects = portfolioProjects.filter((p) => p.id !== "hand-homecare").sort((a, b) => a.sortOrder - b.sortOrder);

function textOnDark(muted = false) {
  return { color: muted ? "hsl(var(--pp-text-on-dark-muted))" : "hsl(var(--pp-text-on-dark))" };
}
function textOnLight(muted = false) {
  return { color: muted ? "hsl(var(--pp-text))" : "hsl(var(--pp-navy-950))" };
}

/** Warm-white base for the featured section. */
const warmSectionBackground: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 10% -10%, hsl(var(--pp-mint-pale) / 0.45) 0%, transparent 55%)",
  backgroundColor: "hsl(var(--pp-white))",
};

/** A distinct, slightly cooler/mintier neutral for the supporting-work
 * section — deliberately not the same shade as the featured section above,
 * so the two light sections read as two different rooms, not one repeated
 * block (per the "vary shade, not just background color" direction). */
const coolSectionBackground: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 90% 0%, hsl(var(--pp-mint-pale) / 0.55) 0%, transparent 60%)",
  backgroundColor: "hsl(var(--pp-surface-soft))",
};

const lightPanelShadow = "0 1px 2px hsl(var(--pp-navy-950) / 0.04), 0 10px 24px -14px hsl(var(--pp-navy-950) / 0.16)";

function LightPanel({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`rounded-[var(--sm-radius-lg)] border bg-white transition-all duration-300 hover:-translate-y-0.5 focus-within:-translate-y-0.5 ${className}`}
      style={{ borderColor: "hsl(var(--pp-border-pale))", boxShadow: lightPanelShadow, ...style }}
    >
      {children}
    </div>
  );
}

/** Light-surface supporting-project card (OneFilAm, Herlinda). */
function SupportingCardLight({ project, imageEmphasis = false }: { project: PortfolioProject; imageEmphasis?: boolean }) {
  return (
    <LightPanel className="flex h-full flex-col overflow-hidden p-0">
      <div className="p-4 pb-0">
        <SupportingVisual project={project} />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>
          {project.statusLabel ?? project.category}
        </span>
        <h3 className={`pp-font-display mt-2 font-semibold ${imageEmphasis ? "text-xl" : "text-lg"}`} style={textOnLight()}>
          {project.projectName}
        </h3>
        <p className="mt-1 text-xs" style={textOnLight(true)}>
          {project.industry}
        </p>
        <p className="mt-3 flex-1 text-sm leading-relaxed" style={textOnLight(true)}>
          {project.summary}
        </p>
        {project.publicUrl && (
          <a
            href={project.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${project.ctaLabel} — ${project.projectName} (opens in a new tab)`}
            className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold hover:underline"
            style={{ color: "hsl(var(--pp-navy-800))" }}
          >
            {project.ctaLabel}
            <ArrowUpRight size={14} aria-hidden="true" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }} />
          </a>
        )}
      </div>
    </LightPanel>
  );
}

/**
 * Dark-surface supporting-project card, used only for Claidy — the one
 * supporting project whose actual source imagery is itself a dark
 * violet/tech theme. A dark card frames that screenshot better than a
 * white one would (no jarring light border around dark content), and gives
 * the otherwise-light supporting section one deliberately different node
 * instead of three uniform cards.
 */
function SupportingCardDark({ project }: { project: PortfolioProject }) {
  return (
    <div
      className="pp-glass-card flex h-full flex-col overflow-hidden rounded-[var(--sm-radius-lg)] border p-0"
      style={{ backgroundColor: "hsl(var(--pp-navy-800) / 0.7)", borderColor: "hsl(var(--pp-cyan-mint) / 0.16)" }}
    >
      <div className="p-4 pb-0">
        <SupportingVisual project={project} />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint))" }}>
          {project.statusLabel ?? project.category}
        </span>
        <h3 className="pp-font-display mt-2 text-lg font-semibold" style={textOnDark()}>
          {project.projectName}
        </h3>
        <p className="mt-1 text-xs" style={textOnDark(true)}>
          {project.industry}
        </p>
        <p className="mt-3 flex-1 text-sm leading-relaxed" style={textOnDark(true)}>
          {project.summary}
        </p>
        {project.publicUrl && (
          <a
            href={project.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${project.ctaLabel} — ${project.projectName} (opens in a new tab)`}
            className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold hover:underline"
            style={{ color: "hsl(var(--pp-cyan-mint))" }}
          >
            {project.ctaLabel}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function PlatformPortfolioPreview() {
  useProductionDocumentMeta(PAGE_TITLE, PAGE_DESCRIPTION, "/portfolio");

  const oneFilAm = supportingProjects.find((p) => p.id === "onefilam-community")!;
  const herlinda = supportingProjects.find((p) => p.id === "herlinda-valdovinos")!;
  const claidy = supportingProjects.find((p) => p.id === "claidy-taguran")!;

  return (
    <PlatformPreviewPageShell footerVariant="dark">
      {/* Hero — dark */}
      <InnerPageHero
        eyebrow="Selected Work"
        headingId="pp-portfolio-page-heading"
        heading="Real work, thoughtfully built."
        intro="Explore websites and digital systems SiteMint has created for real organizations — presented through approved project visuals across desktop and mobile."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={startProjectHref} className="pp-btn pp-btn-primary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            Start a Project
            <ArrowRight size={16} aria-hidden="true" style={{ marginLeft: 8 }} />
          </Link>
          <a href="#featured-project" className="pp-btn pp-btn-secondary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            See the featured project
          </a>
        </div>
      </InnerPageHero>

      {/* Featured project — light section, one visually dominant dark panel inside it */}
      <section id="featured-project" aria-labelledby="pp-featured-heading" className="scroll-mt-24 px-4 py-16 md:px-8 md:py-24" style={warmSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <p className="pp-reveal text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>
            Featured Project
          </p>

          <div
            className="pp-reveal relative mt-4 grid grid-cols-1 gap-10 overflow-hidden rounded-[var(--sm-radius-xl)] border p-6 md:grid-cols-[0.85fr_1.15fr] md:gap-12 md:p-12"
            style={{ backgroundColor: "hsl(var(--pp-navy-950))", borderColor: "hsl(var(--pp-cyan-mint) / 0.18)" }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                backgroundImage:
                  "radial-gradient(ellipse at 8% 12%, hsl(var(--pp-cyan-mint) / 0.14) 0%, transparent 55%), radial-gradient(ellipse at 95% 90%, hsl(var(--pp-aurora-violet) / 0.16) 0%, transparent 55%)",
              }}
            />

            <div className="flex flex-col justify-center">
              <h2 id="pp-featured-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnDark()}>
                {featuredProject.projectName}
              </h2>
              <p className="mt-1 text-sm" style={{ color: "hsl(var(--pp-cyan-mint))" }}>
                {featuredProject.category} · {featuredProject.industry}
              </p>

              <p className="mt-6 text-base leading-relaxed" style={textOnDark(true)}>
                {featuredProject.summary}
              </p>

              <p className="mt-6 text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-text-on-dark-faint))" }}>
                What we delivered
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {featuredProject.contribution.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm" style={textOnDark(true)}>
                    <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: "hsl(var(--pp-cyan-mint))" }} />
                    {item}
                  </li>
                ))}
              </ul>

              {featuredProject.publicUrl && (
                <a
                  href={featuredProject.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${featuredProject.ctaLabel} — ${featuredProject.projectName} (opens in a new tab)`}
                  className="pp-btn pp-btn-primary mt-8 inline-flex w-fit items-center gap-2 rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold"
                >
                  {featuredProject.ctaLabel}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              )}
            </div>

            {/* pp-featured-visual-halo gives the mobile device frame's dark
                bezel a soft light edge so it reads clearly against this
                panel's own navy-950 background, rather than relying on the
                bezel's own (light-theme-oriented) near-black color alone. */}
            <div className="pp-featured-visual-halo flex items-center">
              <FeaturedVisual project={featuredProject} />
            </div>
          </div>
        </div>
      </section>

      {/* More real work — a distinct, cooler-mint light section; one dark card mixed in for Claidy */}
      <section aria-labelledby="pp-more-work-heading" className="px-4 py-16 md:px-8 md:py-24" style={coolSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal max-w-xl">
            <h2 id="pp-more-work-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              More real work
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={textOnLight(true)}>
              Three more approved projects — each shown with whichever real capture (desktop, mobile, or both) was
              cleared for use.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="pp-reveal lg:col-span-2">
              <SupportingCardLight project={herlinda} imageEmphasis />
            </div>
            <div className="pp-reveal lg:col-span-1">
              <SupportingCardLight project={oneFilAm} />
            </div>
            <div className="pp-reveal lg:col-span-1">
              <SupportingCardDark project={claidy} />
            </div>
            <div className="pp-reveal lg:col-span-2">
              <LightPanel className="flex h-full flex-col justify-center gap-3 p-8 text-center sm:text-left">
                <h3 className="pp-font-display text-lg font-semibold" style={textOnLight()}>
                  Want to see your business here?
                </h3>
                <p className="text-sm leading-relaxed" style={textOnLight(true)}>
                  Every project above started with a real conversation about what the business actually needed —
                  not a template.
                </p>
                <div className="mt-1 flex flex-wrap justify-center gap-3 sm:justify-start">
                  <Link href={startProjectHref} className="pp-btn pp-btn-primary rounded-[var(--sm-radius-pill)] px-5 py-2.5 text-sm font-semibold">
                    Start a Project
                    <ArrowRight size={15} aria-hidden="true" style={{ marginLeft: 6 }} />
                  </Link>
                  <Link href="/services" className="pp-btn pp-btn-secondary rounded-[var(--sm-radius-pill)] px-5 py-2.5 text-sm font-semibold">
                    See our services
                  </Link>
                </div>
              </LightPanel>
            </div>
          </div>
        </div>
      </section>

      {/* Closing — dark, one continuous zone into the dark footer */}
      <div className="relative" style={{ backgroundColor: "hsl(var(--pp-navy-950))" }}>
        <section aria-labelledby="pp-portfolio-closing-heading" className="px-4 pt-16 md:px-8 md:pt-20">
          <div className="mx-auto max-w-[1280px] text-center">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint))" }}>
              Honest by default
            </p>
            <h2 id="pp-portfolio-closing-heading" className="pp-font-display mx-auto mt-3 max-w-2xl text-2xl font-semibold sm:text-3xl" style={textOnDark()}>
              What you see above is what we've actually built — nothing staged for this page
            </h2>
          </div>
        </section>

        <FinalCtaSection />
      </div>
    </PlatformPreviewPageShell>
  );
}
