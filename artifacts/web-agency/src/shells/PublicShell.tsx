/**
 * Frontend V2 — PublicShell (Phase 1).
 *
 * The shell for the public marketing journey. One of exactly three intentional
 * shells (`PublicShell`, `AuthShell`, `DashboardShell`).
 *
 * **Binding constraint:** no dashboard navigation and no admin/CRM dependency
 * may be imported from here, directly or transitively. Admin code reaching the
 * public shell is precisely what put all 26 CRM pages into the public entry
 * bundle; keeping this module's import graph clean is what keeps them out.
 *
 * Phase 2 attaches the shared V2 chrome (skip link, header/nav, footer) at this
 * seam, behind an explicit `chrome` opt-in:
 *
 * - `chrome="none"` (**default**) — the page renders its own chrome. Every
 *   surface that still uses `PlatformPreviewPageShell` stays on this, so
 *   Phase 2 changes not one pixel of a page it has not rebuilt.
 * - `chrome="v2"` — this shell renders the shared header and footer around the
 *   page. Routes migrate to it as each surface is rebuilt.
 *
 * The `<main>` element and its skip-link target live here rather than in each
 * page, so the landmark structure is identical on every V2 surface.
 */

import { Suspense, type ReactNode } from "react";
import { useLocation } from "wouter";
import { RouteErrorBoundary } from "@/components/route/RouteErrorBoundary";
import { RouteFallback } from "@/components/route/RouteFallback";
import { SiteHeader } from "@/components/v2/SiteHeader";
import { SiteFooter } from "@/components/v2/SiteFooter";
import { SiteHeaderV3 } from "@/components/v3/SiteHeaderV3";
import { SiteFooterV3 } from "@/components/v3/SiteFooterV3";
import { SiteHeaderV4 } from "@/components/v4/SiteHeaderV4";
import { SiteFooterV4 } from "@/components/v4/SiteFooterV4";
import { useHashScrollV4 } from "@/components/v4/useHashScrollV4";
import { HOME_SECTIONS } from "@/lib/routes";

interface PublicShellProps {
  children: ReactNode;
  /** Human name of the surface, used by the recovery panel. */
  routeLabel?: string;
  /** Which chrome wraps the page. See the module comment. */
  chrome?: "none" | "v2" | "v3" | "v4";
  /**
   * V3/V4 chrome: pages that open on an ink hero let it run underneath the
   * floating header ("ink"); light pages pad below it ("light").
   */
  heroTone?: "ink" | "light";
}

export function PublicShell({
  children,
  routeLabel,
  chrome = "none",
  heroTone = "light",
}: PublicShellProps) {
  const [location] = useLocation();
  // Route-aware anchors (R1): resolves /#section navigations after lazy
  // routes mount. No-op when the URL carries no hash.
  useHashScrollV4();

  const boundary = (
    <RouteErrorBoundary routeLabel={routeLabel} resetKey={location}>
      <Suspense fallback={<RouteFallback label={routeLabel ?? "Loading page"} />}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
  );

  if (chrome === "v4") {
    // Frontend V4 "Signal": the V4 chrome plus the `.v4-shell` token remap —
    // inside it the V3 tone/role system resolves to the Signal palette, so
    // `.v3m-*` page vocabulary inherits V4 without markup changes
    // (tokens-v4.css). V3 remains the rollback chrome.
    return (
      <div
        className="v4-shell"
        data-shell="public"
        data-chrome="v4"
        data-hero-tone={heroTone}
        data-tone={heroTone === "ink" ? "ink" : "porcelain"}
      >
        <a className="v4-skip" href={`#${HOME_SECTIONS.main}`}>
          Skip to main content
        </a>
        <SiteHeaderV4 tone={heroTone} />
        <main id={HOME_SECTIONS.main} className="v4-shell__main" tabIndex={-1}>
          {boundary}
        </main>
        <SiteFooterV4 />
      </div>
    );
  }

  if (chrome === "v3") {
    return (
      <div
        className="v3-shell"
        data-shell="public"
        data-chrome="v3"
        data-hero-tone={heroTone}
        data-tone={heroTone === "ink" ? "ink" : "porcelain"}
      >
        <a className="v3-skip" href={`#${HOME_SECTIONS.main}`}>
          Skip to main content
        </a>
        <SiteHeaderV3 tone={heroTone} />
        <main id={HOME_SECTIONS.main} className="v3-shell__main" tabIndex={-1}>
          {boundary}
        </main>
        <SiteFooterV3 />
      </div>
    );
  }

  if (chrome !== "v2") {
    return (
      <div className="v2-public-shell" data-shell="public">
        {boundary}
      </div>
    );
  }

  return (
    <div className="v2-public-shell v2-shell" data-shell="public" data-chrome="v2">
      <a className="v2-skip" href={`#${HOME_SECTIONS.main}`}>
        Skip to main content
      </a>
      <SiteHeader />
      <main id={HOME_SECTIONS.main} className="v2-shell__main" tabIndex={-1}>
        {boundary}
      </main>
      <SiteFooter />
    </div>
  );
}

export default PublicShell;
