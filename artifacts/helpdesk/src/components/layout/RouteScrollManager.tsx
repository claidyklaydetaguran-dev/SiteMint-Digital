/**
 * SiteMint V5 — scroll-to-top routing (V5-BLUEPRINT §12; corrected under the
 * 2026-09-05 owner routing directive).
 *
 * Helpdesk counterpart of
 * `artifacts/web-agency/src/components/v5/RouteScrollManager.tsx` — same
 * behaviour, the app's own focus landmark (`#sd-main`, the `AppShell`
 * `<main>`). Kept here rather than shared because the two apps do not share
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
 * - the very first render (a fresh load or hard refresh) → does nothing, so
 *   the browser's own reload scroll position is never overridden.
 *
 * Correction (owner directive): a browser back/forward (POP) navigation
 * used to restore whatever scroll position this component had last
 * recorded for that pathname. Primary navigation to another route must
 * start the new page at the top and must not inherit a prior scroll
 * position — POP included, so it now gets the same top-of-page + focus
 * treatment as a forward navigation. There is no longer a POP branch, and
 * nothing records or restores a per-pathname scroll position.
 *
 * (Searched the app for an intentional list→detail→back scroll-preservation
 * feature before removing this — e.g. Contacts list → ContactDetail → back,
 * Inbox list → conversation → back. None exists: no code reads or writes
 * `scrollY`/`scrollTop` anywhere outside this file, so nothing is being
 * taken away here beyond the buggy generic restore.)
 *
 * `history.scrollRestoration = "manual"` (module-level guard) is still the
 * right tool even though this component no longer restores anything
 * itself: without it, the browser's own native restore fires on POP before
 * this effect runs, so a same-tick scroll-to-top either loses the race
 * against it or paints one frame of the old position first. "manual" tells
 * the browser to leave scroll exactly where it is on traversal, so this
 * effect is the only thing that ever moves it.
 */

import { useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

let scrollRestorationSet = false;

/** Matches the `id="sd-main"` the `AppShell` `<main>` already renders with
 *  `tabIndex={-1}`. */
const MAIN_CONTENT_ID = "sd-main";

export function RouteScrollManager(): null {
  const [location] = useLocation();
  const hasMountedRef = useRef(false);

  useLayoutEffect(() => {
    if (!scrollRestorationSet && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
      scrollRestorationSet = true;
    }
  }, []);

  useLayoutEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (window.location.hash) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.getElementById(MAIN_CONTENT_ID)?.focus({ preventScroll: true });
  }, [location]);

  return null;
}

export default RouteScrollManager;
