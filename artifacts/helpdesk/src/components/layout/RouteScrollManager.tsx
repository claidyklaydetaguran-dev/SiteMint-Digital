/**
 * SiteMint V5 — scroll-to-top routing (V5-BLUEPRINT §12).
 *
 * Helpdesk counterpart of `artifacts/web-agency/src/components/v5/RouteScrollManager.tsx`
 * — same behaviour, the app's own focus landmark (`#sd-main`, the
 * `AppShell` `<main>`). See that file's header comment for the full
 * rationale; kept here rather than shared because the two apps do not share
 * a components package.
 *
 * wouter has no scroll restoration of its own. Mounted once inside each of
 * the three shells (`AppShell`, `AuthShell`, `PublicShell`); on every route
 * change:
 *
 * - no hash in the URL → scrolls to the top before paint (`useLayoutEffect`)
 *   and moves keyboard focus to `#sd-main` with `{ preventScroll: true }`.
 * - a hash is present → does nothing; nothing in this app currently owns
 *   in-page anchors, but the no-op keeps this component's contract
 *   consistent with the web-agency original rather than assuming there
 *   never will be one.
 * - the navigation was a browser back/forward (POP) → restores the scroll
 *   position this component recorded for that pathname.
 * - the very first render (a fresh load or hard refresh) → does nothing, so
 *   the browser's own reload scroll position is never overridden.
 *
 * `history.scrollRestoration = "manual"` is set once (module-level guard).
 */

import { useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

/** Pathname → last recorded scrollY, kept for the session — see the
 *  web-agency counterpart's header comment for why this is module scope. */
const scrollPositions = new Map<string, number>();

let scrollRestorationSet = false;

/** Matches the `id="sd-main"` the `AppShell` `<main>` already renders with
 *  `tabIndex={-1}`. */
const MAIN_CONTENT_ID = "sd-main";

export function RouteScrollManager(): null {
  const [location] = useLocation();
  const isPopRef = useRef(false);
  const hasMountedRef = useRef(false);

  useLayoutEffect(() => {
    if (!scrollRestorationSet && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
      scrollRestorationSet = true;
    }
    const onPopState = () => {
      isPopRef.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useLayoutEffect(() => {
    const onScroll = () => {
      scrollPositions.set(location, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location]);

  useLayoutEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      isPopRef.current = false;
      return;
    }

    const wasPop = isPopRef.current;
    isPopRef.current = false;

    if (window.location.hash) {
      return;
    }

    if (wasPop) {
      const saved = scrollPositions.get(location);
      window.scrollTo({ top: saved ?? 0, left: 0, behavior: "auto" });
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const main = document.getElementById(MAIN_CONTENT_ID);
    main?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return null;
}

export default RouteScrollManager;
