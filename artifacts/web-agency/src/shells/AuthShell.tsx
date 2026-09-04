/**
 * Frontend V2 — AuthShell (Phase 1).
 *
 * The shell for authentication entry points served by web-agency: the AI
 * Receptionist signup page (customer, cookie session) and the staff admin login
 * (CRM, Bearer token).
 *
 * These are two separate auth systems and **must never be merged** — see
 * CLAUDE.md. AuthShell deliberately provides only the route boundary and
 * layout seam; it holds no session state, no token handling, and no
 * credential logic, so hosting both here cannot couple them.
 *
 * Phase 1 changes no authentication behaviour and no signup contract. The
 * signup request body, endpoint, and response handling are untouched.
 */

import { Suspense, type ReactNode } from "react";
import { useLocation } from "wouter";
import { RouteErrorBoundary } from "@/components/route/RouteErrorBoundary";
import { RouteFallback } from "@/components/route/RouteFallback";
import { RouteScrollManager } from "@/components/v5/RouteScrollManager";

interface AuthShellProps {
  children: ReactNode;
  routeLabel?: string;
}

export function AuthShell({ children, routeLabel }: AuthShellProps) {
  const [location] = useLocation();

  return (
    <div className="v2-auth-shell" data-shell="auth">
      <RouteScrollManager />
      <RouteErrorBoundary routeLabel={routeLabel} resetKey={location}>
        <Suspense fallback={<RouteFallback label={routeLabel ?? "Loading"} />}>
          {children}
        </Suspense>
      </RouteErrorBoundary>
    </div>
  );
}

export default AuthShell;
