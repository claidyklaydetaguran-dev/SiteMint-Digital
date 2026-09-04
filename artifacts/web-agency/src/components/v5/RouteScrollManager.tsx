/**
 * SiteMint V5 — scroll-to-top routing (V5-BLUEPRINT §12).
 *
 * wouter has no scroll restoration of its own. This component is mounted
 * once inside each of the three shells (`PublicShell`, `AuthShell`,
 * `DashboardShell`) and, on every route change:
 *
 * - no hash in the URL → scrolls to the top before paint (`useLayoutEffect`)
 *   and moves keyboard focus to the route's `#main-content` landmark with
 *   `{ preventScroll: true }` (so the focus move itself never re-scrolls).
 * - a hash is present → does nothing at all; `useHashScrollV4` (mounted
 *   separately in `PublicShell`) already owns anchor navigation, retried
 *   until the lazy route mounts. Fighting it here would race it.
 * - the navigation was a browser back/forward (POP) → restores the scroll
 *   position this component itself recorded for that pathname the last time
 *   the visitor was there, instead of scrolling to top or touching focus.
 * - the very first render (a fresh load or a hard refresh) → does nothing,
 *   so the browser's own reload scroll position is never overridden.
 *
 * `history.scrollRestoration = "manual"` is set once (module-level guard),
 * handing scroll ownership on traversal to this component instead of the
 * browser's default auto-restore, which would otherwise fight the POP
 * handling above.
 */

import { useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

/** Pathname → last recorded scrollY, kept across the whole session so a POP
 *  navigation back to a route restores where the visitor left it. Module
 *  scope on purpose: the three shells mount/unmount this component as the
 *  route family changes, but the visitor's scroll history should not reset
 *  each time. */
const scrollPositions = new Map<string, number>();

let scrollRestorationSet = false;

/** The landmark `RouteScrollManager` moves focus to on a plain (non-hash,
 *  non-POP) navigation. Matches `HOME_SECTIONS.main` (`lib/routes.ts`) and
 *  the `id` every V2/V3/V4 `PublicShell` `<main>` renders. */
const MAIN_CONTENT_ID = "main-content";

export function RouteScrollManager(): null {
  const [location] = useLocation();
  const isPopRef = useRef(false);
  const hasMountedRef = useRef(false);

  // One-time setup: take over scroll restoration and start tracking POP vs.
  // PUSH navigations. Runs once regardless of how many shells mount this
  // component over the session (module-level guard for the history API
  // call; the popstate listener itself is a normal effect subscription).
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

  // Passive recorder: every scroll on the current route updates its saved
  // position, so a later POP back to it restores from here. No state, no
  // re-render — a direct write into the module map.
  useLayoutEffect(() => {
    const onScroll = () => {
      scrollPositions.set(location, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location]);

  // The actual scroll-to-top / restore-on-POP decision, before paint.
  useLayoutEffect(() => {
    // A fresh document load (including a hard refresh) fires this effect on
    // mount too; leave the browser's own restored position alone.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      isPopRef.current = false;
      return;
    }

    const wasPop = isPopRef.current;
    isPopRef.current = false;

    if (window.location.hash) {
      // Anchor navigation — useHashScrollV4 owns this.
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
