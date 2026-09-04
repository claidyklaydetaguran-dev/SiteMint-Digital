/**
 * SiteMint V5 — hero intro replay signal (owner routing directive,
 * 2026-09-05, wordmark spec).
 *
 * Clicking the SiteMint wordmark, or an already-active top-level nav item,
 * while already on that page must NOT navigate or reload — it scrolls to
 * top and replays ONLY that page's hero entrance (the initial particle
 * presentation for Home). Everything else on the page — below-the-fold
 * reveals, form state, auth state — must stay exactly as it was.
 *
 * `SiteHeaderV4` (the dispatcher) and the page's hero (the listener, e.g.
 * `SignalHeroV4` in `pages/HomeV4.tsx`) share no useful common ancestor, so
 * the signal travels as a plain `window` event
 * (`INTRO_REPLAY_EVENT`, `dispatchIntroReplay()` — both in
 * `lib/scrollBehavior.ts`) instead of prop-drilled state.
 *
 * This is the listener half, kept in its own file — deliberately not added
 * to `pages/HomeV5.tsx` or any other page component, several of which are
 * being edited concurrently by other agents — so wiring it into a hero
 * costs that file only the smallest possible edit (call the hook, add its
 * return value to one effect's dependency array).
 */

import { useEffect, useState } from "react";
import { INTRO_REPLAY_EVENT } from "@/lib/scrollBehavior";

/**
 * Returns a number that increments every time an intro replay is requested.
 * A hero that puts this value in a `useEffect` dependency array gets that
 * effect's cleanup + re-run — i.e. a full restart of whatever the effect set
 * up (particle field, rAF loop, IntersectionObserver) — without unmounting
 * the component or touching any sibling state.
 */
export function useIntroReplayKey(): number {
  const [key, setKey] = useState(0);

  useEffect(() => {
    function onReplay() {
      setKey((k) => k + 1);
    }
    window.addEventListener(INTRO_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(INTRO_REPLAY_EVENT, onReplay);
  }, []);

  return key;
}

export default useIntroReplayKey;
