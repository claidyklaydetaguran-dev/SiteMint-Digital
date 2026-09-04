/**
 * Frontend V2 — PublicShell (Phase 1, helpdesk).
 *
 * The helpdesk serves exactly one genuinely public surface: `/schedule/:slug`,
 * the unauthenticated booking page a customer reaches from a link. It gets its
 * own shell so it can never inherit dashboard navigation or imply a session.
 *
 * Scheduling behaviour and its API calls are unchanged.
 */

import { Suspense, type ReactNode } from "react";
import { useLocation } from "wouter";
import { RouteErrorBoundary } from "@/components/route/RouteErrorBoundary";
import { RouteFallback } from "@/components/route/RouteFallback";
import { RouteScrollManager } from "@/components/layout/RouteScrollManager";

interface PublicShellProps {
  children: ReactNode;
  routeLabel?: string;
}

export function PublicShell({ children, routeLabel = "This page" }: PublicShellProps) {
  const [location] = useLocation();

  return (
    <div data-shell="public">
      <RouteScrollManager />
      <RouteErrorBoundary routeLabel={routeLabel} resetKey={location}>
        <Suspense fallback={<RouteFallback label="Loading" />}>{children}</Suspense>
      </RouteErrorBoundary>
    </div>
  );
}

export default PublicShell;
