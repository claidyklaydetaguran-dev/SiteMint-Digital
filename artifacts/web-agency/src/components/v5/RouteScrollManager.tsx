/**
 * SiteMint V5 — scroll-to-top routing (V5-BLUEPRINT §12; corrected under the
 * 2026-09-05 owner routing directive).
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
 * - the very first render (a fresh load or a hard refresh) → does nothing,
 *   so the browser's own reload scroll position is never overridden.
 *
 * Correction (owner directive): a browser back/forward (POP) navigation
 * used to restore whatever scroll position this component had last
 * recorded for that pathname — the exact "returning to /ai-receptionist
 * keeps the old scroll position" defect the owner called out. Every path
 * change, POP included, now gets the *same* top-of-page + focus treatment
 * as a forward navigation; there is no longer a POP branch, and nothing
 * records or restores a per-pathname scroll position. (The public site,
 * the CRM, and the auth shell all want "new route starts at top" — none of
 * the three wants back/forward to feel different from a link click.)
 *
 * `history.scrollRestoration = "manual"` (module-level guard,
 * `enableManualScrollRestoration()`) is still the right tool even though
 * this component no longer restores anything itself: without it, the
 * *browser's own* native restore fires on POP before this effect runs,
 * so a same-tick `scrollToTop()` either loses the race against it or
 * paints one frame of the old position first. "manual" tells the browser
 * to leave scroll exactly where it is on traversal, so this effect is the
 * only thing that ever moves it.
 */

import { useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";
import { enableManualScrollRestoration, focusMainContent, scrollToTop } from "@/lib/scrollBehavior";

let scrollRestorationSet = false;

export function RouteScrollManager(): null {
  const [location] = useLocation();
  const hasMountedRef = useRef(false);

  // One-time setup: take over scroll restoration from the browser. Runs
  // once regardless of how many shells mount this component over the
  // session (module-level guard).
  useLayoutEffect(() => {
    if (!scrollRestorationSet) {
      enableManualScrollRestoration();
      scrollRestorationSet = true;
    }
  }, []);

  // The scroll-to-top / focus decision, before paint, on every route change
  // — PUSH or POP alike.
  useLayoutEffect(() => {
    // A fresh document load (including a hard refresh) fires this effect on
    // mount too; leave the browser's own restored position alone.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (window.location.hash) {
      // Anchor navigation — useHashScrollV4 owns this.
      return;
    }

    scrollToTop();
    focusMainContent();
  }, [location]);

  return null;
}

export default RouteScrollManager;
