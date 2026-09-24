import type { PortfolioProject } from "./portfolioProjects";

/**
 * Reusable browser-chrome (desktop) and device-bezel (mobile) frames for
 * Selected Work. Reads imageFit/desktopPosition/mobilePosition per project
 * so a new project with a different capture ratio never needs a new
 * component — only a new data row (portfolioProjects.ts).
 */

function DesktopFrame({ project, className }: { project: PortfolioProject; className?: string }) {
  const asset = project.desktopAsset;
  if (!asset) return null;
  return (
    <div
      className={`overflow-hidden rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] shadow-[var(--sm-shadow-md)] ${className ?? ""}`}
    >
      <div className="flex items-center gap-1.5 border-b border-[hsl(var(--sm-color-border-subtle))] bg-[hsl(var(--sm-color-surface-muted))] px-3 py-2">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--sm-color-border-strong))]" />
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--sm-color-border-strong))]" />
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--sm-color-border-strong))]" />
        </span>
      </div>
      <div className="w-full" style={{ aspectRatio: `${asset.width} / ${asset.height}` }}>
        <img
          src={asset.src}
          width={asset.width}
          height={asset.height}
          alt={asset.alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full"
          style={{ objectFit: project.imageFit, objectPosition: project.desktopPosition ?? "center" }}
        />
      </div>
    </div>
  );
}

function MobileFrame({ project, className }: { project: PortfolioProject; className?: string }) {
  const asset = project.mobileAsset;
  if (!asset) return null;
  return (
    <div
      className={`overflow-hidden rounded-[1.5rem] border-[6px] border-[hsl(var(--sm-color-bg-inverse))] bg-[hsl(var(--sm-color-bg-inverse))] shadow-[var(--sm-shadow-lg)] ${className ?? ""}`}
    >
      <div className="w-full" style={{ aspectRatio: `${asset.width} / ${asset.height}` }}>
        <img
          src={asset.src}
          width={asset.width}
          height={asset.height}
          alt={asset.alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full"
          style={{ objectFit: project.imageFit, objectPosition: project.mobilePosition ?? "top center" }}
        />
      </div>
    </div>
  );
}

/**
 * Featured composition: large desktop frame with the mobile frame
 * deliberately overlapping its lower-right corner on md+ viewports (never
 * obscuring the desktop hero's readable content), stacking cleanly below it
 * on narrow viewports instead of overlapping.
 */
export function FeaturedVisual({ project }: { project: PortfolioProject }) {
  return (
    <div className="relative">
      <DesktopFrame project={project} className="w-full" />
      {project.mobileAsset && (
        <div className="relative mx-auto mt-6 w-[136px] sm:w-[152px] md:absolute md:-bottom-10 md:-right-8 md:mt-0 md:w-[168px]">
          <MobileFrame project={project} />
        </div>
      )}
    </div>
  );
}

/**
 * Supporting compositions vary by visualMode so desktop-only and
 * mobile-only projects never render an empty device frame, and
 * responsive-pair projects stack (never overlap) at narrow widths.
 */
export function SupportingVisual({ project }: { project: PortfolioProject }) {
  if (project.visualMode === "desktop-only") {
    return <DesktopFrame project={project} className="w-full" />;
  }

  if (project.visualMode === "mobile-only") {
    return (
      <div className="mx-auto w-[176px] sm:w-[196px]">
        <MobileFrame project={project} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <DesktopFrame project={project} className="w-full sm:min-w-0 sm:flex-1" />
      {project.mobileAsset && (
        <div className="mx-auto w-[128px] sm:mx-0 sm:w-[88px] sm:shrink-0">
          <MobileFrame project={project} />
        </div>
      )}
    </div>
  );
}
