/**
 * Frontend V2 — route-level error recovery (Phase 1).
 *
 * Before this, web-agency had effectively no per-route boundary: a failed lazy
 * chunk (the common case after a redeploy invalidates hashed filenames)
 * unmounted the tree and left a blank white screen with nothing announced.
 *
 * Behaviour:
 * - Renders a designed, announced recovery panel — never a blank screen.
 * - Offers a retry that re-mounts the subtree, plus a safe navigation escape.
 * - A stale-chunk failure gets exactly one automatic reload attempt, recorded
 *   in `sessionStorage` so a genuinely broken build cannot cause a reload loop.
 * - **Never shows a stack trace to ordinary users.** Diagnostics go to the
 *   console only.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

/** Marks that we've already spent this session's one automatic reload. */
const CHUNK_RELOAD_KEY = "sitemint:v2:chunk-reload-attempted";

/**
 * A failed dynamic import surfaces differently across browsers; match the
 * observed shapes rather than a single message.
 */
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
  /** Human name of the surface, used in the recovery copy. */
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
    // Navigating away from a broken route should clear the panel, otherwise
    // the error would persist across an unrelated route change.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Safe technical logging only — no secrets, no customer data, and never
    // rendered into the page.
    console.error("[SiteMint] Route render error:", error, info.componentStack);

    if (isChunkLoadError(error)) {
      let alreadyTried = true;
      try {
        alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
        if (!alreadyTried) sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      } catch {
        // Storage unavailable (private mode, blocked cookies) — treat as
        // "already tried" so we never risk an unbounded reload loop.
      }
      if (!alreadyTried) window.location.reload();
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  private handleHome = () => {
    // Full document navigation: the router base is already part of BASE_URL,
    // so this lands correctly at both `/` and a prefixed deployment.
    window.location.assign(import.meta.env.BASE_URL || "/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { routeLabel } = this.props;

    return (
      <div className="v2-route-error" role="alert" data-testid="route-error">
        <div className="v2-route-error__panel">
          <h1 className="v2-route-error__title">
            {routeLabel ? `${routeLabel} failed to load.` : "This section failed to load."}
          </h1>
          <p className="v2-route-error__body">
            Something went wrong while loading this part of the site. Your
            information has not been lost. Try again, or head back to the
            homepage.
          </p>
          <div className="v2-route-error__actions">
            <button type="button" className="v2-btn v2-btn--primary" onClick={this.handleRetry}>
              Try again
            </button>
            <button type="button" className="v2-btn v2-btn--secondary" onClick={this.handleHome}>
              Go to homepage
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default RouteErrorBoundary;
