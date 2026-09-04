/**
 * Frontend V2 — DashboardShell (Phase 1).
 *
 * The shell for web-agency's authenticated operational surface: the internal
 * `/admin/*` CRM. It is the single lazy boundary behind which the entire CRM
 * import graph lives.
 *
 * **This module is the reason the CRM leaves the public bundle.** Every
 * `/admin/*` page is imported through `React.lazy()` *inside this file's
 * subtree only*, so Rollup can prove the CRM is unreachable from the public
 * entry and gives it its own chunk graph. Two rules keep that true:
 *
 * 1. Nothing in the public journey may import from `src/pages/crm/*`,
 *    `src/pages/Admin*`, or this module.
 * 2. The lazy imports must stay one-per-route and must **not** be routed
 *    through a barrel/index that re-exports every CRM page — a barrel makes
 *    every page reachable from one module and silently collapses the split
 *    back into a single chunk.
 *
 * The CRM's own UI is explicitly **out of V2 visual scope** (it is an internal
 * tool). Phase 1 changes how it loads, never how it looks: `CrmErrorBoundary`
 * still lives inside `CrmLayout` exactly as before, and this shell only adds
 * the outer chunk-loading boundary that the lazy split now requires.
 */

import { Suspense, type ReactNode } from "react";
import { useLocation } from "wouter";
import { RouteErrorBoundary } from "@/components/route/RouteErrorBoundary";
import { RouteFallback } from "@/components/route/RouteFallback";
import { RouteScrollManager } from "@/components/v5/RouteScrollManager";

interface DashboardShellProps {
  children: ReactNode;
  routeLabel?: string;
}

export function DashboardShell({ children, routeLabel }: DashboardShellProps) {
  const [location] = useLocation();

  return (
    <div className="v2-dashboard-shell" data-shell="dashboard">
      <RouteScrollManager />
      {/* V3 Phase 5: honest internal-environment labelling. Server-side
          Bearer auth remains the actual access boundary. */}
      <div className="v3o-bar">
        <span className="v3o-bar__brand">
          <span className="v3o-bar__brand-dot" aria-hidden="true" />
          SiteMint Operations
        </span>
        <span className="v3o-bar__scope">
          Internal operating environment — not a customer surface
        </span>
        <span className="v3o-bar__badge">Authorized personnel</span>
      </div>
      <RouteErrorBoundary routeLabel={routeLabel} resetKey={location}>
        <Suspense fallback={<RouteFallback label={routeLabel ?? "Loading workspace"} />}>
          {children}
        </Suspense>
      </RouteErrorBoundary>
    </div>
  );
}

export default DashboardShell;
