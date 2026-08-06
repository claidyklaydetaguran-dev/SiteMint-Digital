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
 * Phase 1 is foundations only: this shell owns the route boundary (loading
 * fallback + error recovery) and nothing visual. Each public page still renders
 * its own `PlatformPreviewPageShell` chrome. Phase 2 replaces that with the
 * shared V2 header/nav/footer — the seam is here, ready.
 */

import { Suspense, type ReactNode } from "react";
import { useLocation } from "wouter";
import { RouteErrorBoundary } from "@/components/route/RouteErrorBoundary";
import { RouteFallback } from "@/components/route/RouteFallback";

interface PublicShellProps {
  children: ReactNode;
  /** Human name of the surface, used by the recovery panel. */
  routeLabel?: string;
}

export function PublicShell({ children, routeLabel }: PublicShellProps) {
  const [location] = useLocation();

  return (
    <div className="v2-public-shell" data-shell="public">
      <RouteErrorBoundary routeLabel={routeLabel} resetKey={location}>
        <Suspense fallback={<RouteFallback label={routeLabel ?? "Loading page"} />}>
          {children}
        </Suspense>
      </RouteErrorBoundary>
    </div>
  );
}

export default PublicShell;
