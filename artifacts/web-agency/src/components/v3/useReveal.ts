/**
 * Frontend V3 — section entrance reveal.
 *
 * Returns a ref callback to spread over `.v3-reveal` elements. Progressive
 * enhancement in both directions: `data-reveal-ready` is only set once the
 * observer exists (so content is never hidden without JS), and the CSS only
 * animates under `prefers-reduced-motion: no-preference`.
 */

import { useCallback, useEffect, useRef } from "react";

export function useReveal() {
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Nodes whose ref callback ran before the observer existed. Ref callbacks
  // fire at render-commit, BEFORE effects run — with the old early-return,
  // observerRef.current was always null at that moment, so no element was
  // ever armed and every reveal on the site rendered as its static fallback.
  const pendingRef = useRef<Set<HTMLElement>>(new Set());

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    observerRef.current = observer;
    for (const node of pendingRef.current) {
      node.setAttribute("data-reveal-ready", "");
      observer.observe(node);
    }
    pendingRef.current.clear();
    return () => {
      observer.disconnect();
      observerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  return useCallback((node: HTMLElement | null) => {
    if (!node) return;
    if (observerRef.current) {
      node.setAttribute("data-reveal-ready", "");
      observerRef.current.observe(node);
    } else {
      pendingRef.current.add(node);
    }
  }, []);
}

export default useReveal;
