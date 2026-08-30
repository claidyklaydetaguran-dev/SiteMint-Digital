/**
 * Frontend V2 — DashboardShell (Phase 1, helpdesk).
 *
 * The authenticated operator surface. This wraps — and does not replace — the
 * existing `AppShell`, which still owns the dashboard chrome (navigation,
 * header, session handling). Phase 1 adds only the route boundary that the new
 * lazy page split requires; Phase 6 replaces the chrome itself.
 *
 * **Binding constraint:** no promotional public-site section may be placed in
 * here. The dashboard is operational, not marketing.
 *
 * Voice-platform readiness logic is untouched by this shell — the
 * `voicePlatformEnabled` flag, route gating, and `VoiceProviderStatusCard`
 * behave exactly as before.
 */

import { Suspense, type ReactNode } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { RouteErrorBoundary } from "@/components/route/RouteErrorBoundary";
import { RouteFallback } from "@/components/route/RouteFallback";

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [location] = useLocation();

  return (
    <AppShell>
      <div data-shell="dashboard" className="contents">
        <RouteErrorBoundary routeLabel="This page" resetKey={location}>
          <Suspense fallback={<RouteFallback label="Loading page" />}>{children}</Suspense>
        </RouteErrorBoundary>
      </div>
    </AppShell>
  );
}

export default DashboardShell;
