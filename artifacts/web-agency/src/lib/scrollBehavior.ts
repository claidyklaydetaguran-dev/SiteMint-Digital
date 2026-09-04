/**
 * SiteMint V5 — shared scroll/focus primitives (owner routing directive,
 * 2026-09-05).
 *
 * Small, dependency-free functions used by both the route-level scroll
 * manager (`components/v5/RouteScrollManager.tsx`) and the places that need
 * the *same* "land at the top, on this page" behaviour without a route
 * change — the SiteMint wordmark and an already-active top-level nav item
 * (`components/v4/SiteHeaderV4.tsx`). Centralising them here means the three
 * call sites can't drift into three slightly different scroll resets.
 *
 * Also exports the "replay the intro" signal: a plain `window` `CustomEvent`
 * rather than React context, since the dispatcher (the header, mounted once
 * near the document root) and the listener (whatever page's hero happens to
 * be mounted, e.g. `SignalHeroV4` in `pages/HomeV4.tsx`) have no shared
 * component ancestor worth threading a prop through.
 */

/** Matches `HOME_SECTIONS.main` (`lib/routes.ts`) and the `id` every
 *  V2/V3/V4 `PublicShell` (and `AuthShell`/`DashboardShell`) `<main>`-ish
 *  landmark renders with `tabIndex={-1}`. */
export const MAIN_CONTENT_ID = "main-content";

/** Custom event name a hero (or any other "page introduction") listens for
 *  to replay its entrance in place — no navigation, no remount of anything
 *  else on the page. See `components/v5/useIntroReplay.ts`. */
export const INTRO_REPLAY_EVENT = "sm:replay-intro";

/**
 * Instant, top-left scroll reset. Always `behavior: "auto"` — per the owner
 * directive, a scroll *reset* (route change, re-click, wordmark) is never
 * animated, independent of `prefers-reduced-motion` (that setting governs
 * the intro *replay* itself, not this).
 */
export function scrollToTop(): void {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

/** Moves keyboard focus to the route's main-content landmark without
 *  re-triggering a scroll (the landmark may not be at `(0,0)` the instant
 *  this runs, e.g. before layout settles — `preventScroll` keeps the focus
 *  move itself inert either way). */
export function focusMainContent(): void {
  const target =
    document.getElementById(MAIN_CONTENT_ID) ??
    document.querySelector<HTMLElement>("main") ??
    document.querySelector<HTMLElement>("h1");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

/** Idempotent: hands scroll ownership on history traversal from the browser
 *  to the app. Without this, a browser back/forward restores the browser's
 *  own remembered scroll position for that history entry *before* any of
 *  our JS runs, so a same-tick `scrollToTop()` either loses the race or
 *  paints a one-frame flash of the old position first. `"manual"` makes the
 *  browser leave scroll exactly where it is on traversal, so our route
 *  effect is the only thing that ever moves it. */
export function enableManualScrollRestoration(): void {
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
}

/** Tells whichever page introduction is currently mounted to replay. A
 *  no-op if nothing is listening. */
export function dispatchIntroReplay(): void {
  window.dispatchEvent(new Event(INTRO_REPLAY_EVENT));
}
