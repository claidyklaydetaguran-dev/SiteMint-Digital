/**
 * Frontend V4 — route-aware anchor navigation (R1 correction 4).
 *
 * wouter routes on pathname only, so a client-side navigation to
 * "/#signal-journey" changes the route but never scrolls to the section.
 * This hook, mounted once in the V4 shell, resolves `window.location.hash`
 * after every route change (and on plain hash changes), scrolls the target
 * into view — CSS `scroll-margin-top` keeps it clear of the fixed header —
 * and moves keyboard focus to it so Tab continues from the section, not the
 * top of the page.
 *
 * Lazy routes mount asynchronously, so the target is retried briefly until
 * it exists (bounded — this is not a timeout-based layout fix; the scroll
 * happens the moment the element appears).
 */

import { useEffect } from "react";
import { useLocation } from "wouter";

const RETRY_MS = 80;
const MAX_TRIES = 25; // ≤2s of retries while a lazy chunk loads

export function useHashScrollV4(): void {
  const [location] = useLocation();

  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    function attempt() {
      if (cancelled) return;
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const target = document.getElementById(hash);
      if (!target) {
        if (tries++ < MAX_TRIES) window.setTimeout(attempt, RETRY_MS);
        return;
      }
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      target.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
      if (!target.hasAttribute("tabindex")) {
        target.setAttribute("tabindex", "-1");
      }
      target.focus({ preventScroll: true });
    }

    attempt();
    window.addEventListener("hashchange", attempt);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", attempt);
    };
  }, [location]);
}

export default useHashScrollV4;
