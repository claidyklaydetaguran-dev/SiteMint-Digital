/**
 * Frontend V2 — dashboard route error recovery (Phase 1).
 *
 * Complements the existing app-level `ErrorBoundary`: that one catches a whole-
 * app failure, this one scopes recovery to a single route group so a failed
 * lazy chunk does not tear down the shell around it.
 *
 * As with the public site: designed and announced, retry plus a safe escape,
 * one automatic reload for a stale-chunk failure, and **never a stack trace in
 * the UI**.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const CHUNK_RELOAD_KEY = "sitemint:v2:dashboard-chunk-reload-attempted";

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  routeLabel?: string;
  /** Changes to this value reset the boundary (e.g. the current location). */
  resetKey?: string;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Safe technical logging only — never rendered into the page.
    console.error("[SiteMint] Dashboard route error:", error, info.componentStack);

    if (isChunkLoadError(error)) {
      let alreadyTried = true;
      try {
        alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
        if (!alreadyTried) sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      } catch {
        // Storage unavailable — treat as already attempted so we can never
        // enter an unbounded reload loop.
      }
      if (!alreadyTried) window.location.reload();
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  private handleOverview = () => {
    window.location.assign(import.meta.env.BASE_URL || "/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { routeLabel } = this.props;

    return (
      <div
        role="alert"
        data-testid="route-error"
        className="flex min-h-[60vh] w-full items-center justify-center p-6"
      >
        <div className="max-w-md">
          <h1 className="font-display text-xl font-semibold text-foreground">
            {routeLabel ? `${routeLabel} failed to load.` : "This section failed to load."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong loading this part of the dashboard. Nothing has
            been lost. Try again, or return to the overview.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={this.handleRetry}>Try again</Button>
            <Button variant="outline" onClick={this.handleOverview}>
              Go to overview
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default RouteErrorBoundary;
