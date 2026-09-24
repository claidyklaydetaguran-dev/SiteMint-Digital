import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { startProjectHref } from "./navConfig";

/**
 * Memorable closing scene — one deliberate deep-forest panel with mint
 * highlights (the owner's "final CTA" direction), staying visually constant
 * regardless of theme, same as before. Frontend Epic 1 visual redesign V2:
 * palette moved from raw hsl(160 …) literals to the homepage-scoped
 * --pp-forest- and --pp-mint- tokens, plus one restrained ambient glow drift —
 * paused via IntersectionObserver/visibilitychange like every other
 * ambient-motion layer on this page, and covered by the existing global
 * prefers-reduced-motion rule (pp-* prefixed keyframe).
 */
export function FinalCtaSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      setActive(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return (
    <section ref={sectionRef} aria-labelledby="pp-final-cta-heading" className="px-4 py-20 md:px-8 md:py-28">
      <div
        className="relative mx-auto max-w-3xl overflow-hidden rounded-[var(--sm-radius-xl)] px-8 py-14 text-center shadow-[var(--sm-shadow-lg)] md:px-16 md:py-20"
        style={{ background: "linear-gradient(160deg, hsl(var(--pp-forest-slate)), hsl(var(--pp-forest-near-black)))" }}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${active ? "pp-aurora-drift-slow" : ""}`}
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, hsl(var(--pp-mint-fresh) / 0.16), transparent 45%), radial-gradient(circle at 85% 85%, hsl(var(--pp-mint-emerald) / 0.12), transparent 50%)",
          }}
        />
        <h2 id="pp-final-cta-heading" className="pp-font-display relative text-3xl font-semibold md:text-4xl" style={{ color: "hsl(var(--pp-mint-warm-white))" }}>
          Your business deserves more than disconnected software.
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-base" style={{ color: "hsl(var(--pp-mint-mist))" }}>
          Let's build a website, product, and system that actually work together.
        </p>
        <Link
          href={startProjectHref}
          className="relative mt-8 inline-flex items-center gap-2 rounded-[var(--sm-radius-pill)] px-7 py-3.5 text-sm font-semibold shadow-[var(--sm-shadow-glow-subtle)] transition-transform hover:-translate-y-0.5"
          style={{ backgroundColor: "hsl(var(--pp-mint-fresh))", color: "hsl(var(--pp-forest-deep))" }}
        >
          Build Your SiteMint System
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
