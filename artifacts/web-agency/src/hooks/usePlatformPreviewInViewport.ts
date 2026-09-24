import { useEffect, useState, type RefObject } from "react";

/**
 * Shared "is this decorative layer visible right now" signal —
 * IntersectionObserver (threshold 0.1) plus a visibilitychange listener,
 * extracted from the pattern already duplicated between
 * HeroAuroraNetwork.tsx and FinalCtaSection.tsx so InnerPageAtmosphere (and
 * any future decorative layer) has one implementation to pause/resume
 * ambient motion off-screen or on a hidden tab, instead of a third copy.
 */
export function usePlatformPreviewInViewport(ref: RefObject<Element | null>): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    function onVisibilityChange() {
      setActive(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return active;
}
