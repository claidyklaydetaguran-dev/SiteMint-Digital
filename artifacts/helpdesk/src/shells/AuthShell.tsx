/**
 * Frontend V2 — AuthShell (Phase 1, helpdesk).
 *
 * Wraps the dashboard's sign-in route. Deliberately has **no** dashboard
 * navigation and no `AppShell` chrome: an unauthenticated visitor must not see
 * operator navigation.
 *
 * Holds no session state and no credential logic — authentication behaviour
 * (httpOnly `receptionist_session` cookie, 30-day TTL) is unchanged.
 */

import { Suspense, type ReactNode } from "react";
import { useLocation } from "wouter";
import { RouteErrorBoundary } from "@/components/route/RouteErrorBoundary";
import { RouteFallback } from "@/components/route/RouteFallback";
import { RouteScrollManager } from "@/components/layout/RouteScrollManager";

interface AuthShellProps {
  children: ReactNode;
  routeLabel?: string;
}

export function AuthShell({ children, routeLabel = "Sign in" }: AuthShellProps) {
  const [location] = useLocation();

  return (
    <div data-shell="auth">
      <RouteScrollManager />
      <RouteErrorBoundary routeLabel={routeLabel} resetKey={location}>
        <Suspense fallback={<RouteFallback label={routeLabel} />}>{children}</Suspense>
      </RouteErrorBoundary>
    </div>
  );
}

export default AuthShell;
