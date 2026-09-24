/**
 * Frontend V2 — route-level error recovery (Phase 1).
 *
 * Before this, web-agency had effectively no per-route boundary: a failed lazy
 * chunk (the common case after a redeploy invalidates hashed filenames)
 * unmounted the tree and left a blank white screen with nothing announced.
 *
 * Behaviour:
 * - Renders a designed, announced recovery panel — never a blank screen.
 * - Offers a retry that can actually recover, plus a safe navigation escape.
 * - A stale-chunk failure gets one automatic reload attempt *per route*,
 *   recorded in `sessionStorage` so a genuinely broken build cannot cause a
 *   reload loop.
 * - **Never shows a stack trace to ordinary users.** Diagnostics go to the
 *   console only.
 *
 * ── Why the retry branches on the error ─────────────────────────────────────
 *
 * `React.lazy()` memoises a rejected import and re-throws it on every later
 * render; the factory is never called again. Measured directly, with a loader
 * that fails once and would succeed on the second call:
 *
 *     attempts: 1        ← never retried
 *     recovered: false   ← the panel stayed up permanently
 *
 * So clearing `hasError` — which is all this boundary used to do — cannot
 * recover a failed route chunk. It re-renders the lazy component, React
 * re-throws the cached rejection, and the panel comes straight back. The only
 * thing that clears that cache is a new document, so for a chunk failure the
 * retry reloads.
 *
 * For an ordinary render error (a page that loaded and then threw) remounting
 * is the right move and does work, so that case still remounts.
 *
 * Transient chunk failures are absorbed before they reach here — see
 * `lazyRoute()`, which retries the import inside the factory so React never
 * caches the rejection in the first place.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { isModuleLoadError } from "@/lib/lazyRoute";

/** Marks that we've already spent a route's one automatic reload. */
const CHUNK_RELOAD_PREFIX = "sitemint:v2:chunk-reload-attempted";

/**
 * One budget per route, not one per session.
 *
 * This key used to be a single session-wide string, so the first chunk failure
 * anywhere spent the automatic reload for *every* route for the rest of the
 * session — a later, unrelated, entirely recoverable failure went straight to
 * the dead-end panel.
 */
function reloadKeyFor(routeLabel: string | undefined): string {
  return `${CHUNK_RELOAD_PREFIX}:${routeLabel ?? "unknown"}`;
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
  /** Whether the caught error was a failed module load, which needs a reload. */
  isChunkError: boolean;
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return { hasError: true, isChunkError: isModuleLoadError(error) };
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps) {
    // Navigating away from a broken route should clear the panel, otherwise
    // the error would persist across an unrelated route change.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, isChunkError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Safe technical logging only — no secrets, no customer data, and never
    // rendered into the page.
    console.error("[SiteMint] Route render error:", error, info.componentStack);

    if (isModuleLoadError(error)) {
      const key = reloadKeyFor(this.props.routeLabel);
      let alreadyTried = true;
      try {
        alreadyTried = sessionStorage.getItem(key) === "1";
        if (!alreadyTried) sessionStorage.setItem(key, "1");
      } catch {
        // Storage unavailable (private mode, blocked cookies) — treat as
        // "already tried" so we never risk an unbounded reload loop.
      }
      if (!alreadyTried) window.location.reload();
    }
  }

  private handleRetry = () => {
    // A cached lazy() rejection survives a remount, so the only retry that can
    // work for a chunk failure is a new document. Clear this route's budget
    // first: the person asked for this reload, so it must not be mistaken for
    // the automatic one and suppress a later genuine recovery.
    if (this.state.isChunkError) {
      try {
        sessionStorage.removeItem(reloadKeyFor(this.props.routeLabel));
      } catch {
        // Storage unavailable — the reload below still happens.
      }
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, isChunkError: false });
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
            {this.state.isChunkError
              ? "Part of the application could not be downloaded. This is usually a connection drop or a new version having just been released. Your information has not been lost — reloading will pick up the current version."
              : "Something went wrong while loading this part of the site. Your information has not been lost. Try again, or head back to the homepage."}
          </p>
          <div className="v2-route-error__actions">
            <button
              type="button"
              className="v2-btn v2-btn--primary"
              data-testid="route-error-retry"
              onClick={this.handleRetry}
            >
              {this.state.isChunkError ? "Reload and try again" : "Try again"}
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
