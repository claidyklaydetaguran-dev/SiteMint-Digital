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
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  return useCallback((node: HTMLElement | null) => {
    if (!node || !observerRef.current) return;
    node.setAttribute("data-reveal-ready", "");
    observerRef.current.observe(node);
  }, []);
}

export default useReveal;
