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

/**
 * Session flag written by `restartAtTop()` and consumed by
 * `settleRestartAtTop()` on the next document load. sessionStorage is
 * per-tab, so a restart in one tab never moves another.
 */
export const RESTART_AT_TOP_KEY = "sm:restart-at-top";

/**
 * Wordmark behaviour on the public site (owner directive, 2026-09-24): the
 * SiteMint Digital logo is the site's refresh control. Clicking it always
 * performs a full document load of the homepage that starts at the top,
 * even mid-scroll and even when already on the homepage, so the hero and
 * its scroll-linked film restart from the beginning.
 *
 * This is a plain navigation: it never touches localStorage (Discovery
 * drafts) or cookies (staff / portal / receptionist sessions). It is wired
 * only into the public Mint chrome; the CRM and portal shells keep in-app
 * routing so an unsaved form is never discarded by a header click.
 */
export function restartAtTop(path = "/"): void {
  try {
    sessionStorage.setItem(RESTART_AT_TOP_KEY, "1");
  } catch {
    // Storage can be unavailable (private mode, blocked storage). The
    // navigation below still starts at the top; the flag only guards
    // against a browser scroll restore racing our reset on the next load.
  }
  enableManualScrollRestoration();
  scrollToTop();
  const target = new URL(path, window.location.href);
  const alreadyThere =
    target.pathname === window.location.pathname &&
    !window.location.search &&
    !window.location.hash;
  if (alreadyThere) window.location.reload();
  else window.location.assign(target.pathname);
}

/**
 * Runs once on public-shell mount. If the previous document asked for a
 * restart, make sure this load starts at (0,0) even where the browser
 * restored a scroll position before our scripts ran.
 */
export function settleRestartAtTop(): void {
  let flagged = false;
  try {
    flagged = sessionStorage.getItem(RESTART_AT_TOP_KEY) === "1";
    if (flagged) sessionStorage.removeItem(RESTART_AT_TOP_KEY);
  } catch {
    flagged = false;
  }
  if (!flagged) return;
  enableManualScrollRestoration();
  scrollToTop();
  // Layout can still be settling (fonts, media geometry); one more reset
  // after the first frame catches a late restore without fighting the user.
  window.requestAnimationFrame(scrollToTop);
}
