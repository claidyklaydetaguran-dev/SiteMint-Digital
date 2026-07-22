import { useEffect, useRef, useState } from "react";

const HERO_SECTION_ID = "pp-hero-section";

/**
 * "Ocean Network" hero background. CSS gradient + one lightweight inline
 * SVG only — no remote image, no WebGL, no video. Deliberately a real
 * background layer behind PlatformHero's copy/CTA column, not a decorative
 * unused component: it owns the section's -z-10 base layer.
 *
 * Round 9: rebuilt dark, reference-matched to an owner-supplied Aurora Dev
 * screenshot (not the round-8 pale-mint wash). Composition: an
 * overwhelmingly dark navy foundation (`.pp-aurora-dark-base`), a
 * brightened SVG connector network, three tall vertical "plume" layers
 * (cyan/teal/violet, heavily blurred — deliberately not the old horizontal
 * ribbon-ellipse technique), structural dark shadow-folds that keep the
 * true top edge and outer edges dark, and a localized pointer-following
 * glow. Uses the homepage-scoped --pp-* tokens (platform-preview.css) — no
 * other /platform-preview/* page references these, so this stays a
 * homepage-only visual change.
 *
 * Motion (paused via prefers-reduced-motion and while off-screen/tab
 * hidden): gentle node pulse plus the plume/fold/glow animation described
 * above; tiny device parallax is left to HeroDeviceComposition itself.
 * Round 8 removed the previous per-pointer-event React-state cursor
 * spotlight in favor of a shared rAF/CSS-variable controller
 * (usePlatformPreviewAuroraParallax, driven from PlatformPreviewPageShell);
 * round 9 keeps that controller as-is and adds `.pp-aurora-parallax-glow`
 * to read the same `--pp-aurora-x/y` variables for the new pointer-glow
 * layer, at a much larger translate range than the near-stationary plume/
 * fold layers (see the CSS for the "backdrop must not slide" rationale).
 *
 * Round 9 (final): this is now the ONLY decorative background layer for
 * the navbar+hero region — PlatformHero's own AuroraBackground no longer
 * renders anything (see aurora-background.tsx). Running two independently
 * positioned background systems produced a visible seam at their box
 * edges no amount of width/inset tuning fully removed. Instead of a fixed
 * pixel height (640/720px), this component measures PlatformHero's real
 * section (`#pp-hero-section`) via `ResizeObserver` and sizes itself to
 * match exactly — covering the whole hero on every breakpoint, including
 * tall stacked mobile content, with a single continuous composition.
 */
export function HeroAuroraNetwork() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const [heroHeight, setHeroHeight] = useState<number | null>(null);

  useEffect(() => {
    const heroEl = document.getElementById(HERO_SECTION_ID);
    if (!heroEl || typeof ResizeObserver === "undefined") return;

    function measure() {
      const rect = heroEl!.getBoundingClientRect();
      setHeroHeight(Math.ceil(rect.bottom + window.scrollY));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(heroEl);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") setActive(false);
      else if (rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        setActive(rect.top < window.innerHeight && rect.bottom > 0);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`pp-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] overflow-hidden md:h-[720px] ${active ? "" : "pp-aurora-paused"}`}
      style={heroHeight ? { height: `${heroHeight}px` } : undefined}
    >
      {/* 1. Dark navy foundation — dominant field, not the light */}
      <div className="pp-aurora-dark-base absolute inset-0" />

      {/* 2. Network pattern — curved paths + nodes, concentrated right side.
          Brightened to aurora-cyan (was --pp-mint-deep, tuned for a light
          background) so it stays visible against the new dark base. */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.3]"
        viewBox="0 0 1280 640"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g stroke="hsl(var(--aurora-cyan))" strokeWidth="1" strokeDasharray="2 5" opacity="0.4">
          <path className="pp-node-path" d="M620 120 C 780 80, 900 180, 1040 140" />
          <path className="pp-node-path" d="M700 260 C 840 220, 980 320, 1150 260" />
          <path className="pp-node-path" d="M660 420 C 820 400, 960 480, 1120 430" />
        </g>
        {[
          [1040, 140],
          [1150, 260],
          [900, 180],
          [980, 320],
          [1120, 430],
          [820, 400],
        ].map(([cx, cy], index) => (
          <circle
            key={`${cx}-${cy}`}
            className="pp-node-pulse"
            style={{ animationDelay: `${index * 0.4}s` }}
            cx={cx}
            cy={cy}
            r="3.5"
            fill="hsl(var(--aurora-cyan))"
          />
        ))}
      </svg>

      {/* 3. Aurora plumes — tall, blurred vertical forms, biased center-right/device side */}
      <div aria-hidden="true" className="pp-aurora-parallax-fg absolute inset-0">
        <div className="pp-aurora-plume-a absolute inset-0" />
      </div>
      <div aria-hidden="true" className="pp-aurora-parallax-fg-alt absolute inset-0">
        <div className="pp-aurora-plume-b absolute inset-0" />
      </div>
      <div aria-hidden="true" className="pp-aurora-parallax-mid absolute inset-0">
        <div className="pp-aurora-plume-c absolute inset-0" />
      </div>

      {/* 4. Structural dark shadow folds — keeps the true top edge (behind the navbar) and outer edges dark */}
      <div aria-hidden="true" className="pp-aurora-parallax-deep absolute inset-0">
        <div className="pp-aurora-shadow-folds absolute inset-0" />
      </div>

      {/* 5. Localized pointer-responsive glow — oversized box so its large translate range never reveals a hard edge */}
      <div aria-hidden="true" className="pp-aurora-parallax-glow absolute" style={{ left: "-20%", top: "-20%", width: "140%", height: "140%" }}>
        <div className="pp-aurora-pointer-glow absolute inset-0" />
      </div>

      {/* 6. Grain */}
      <div aria-hidden="true" className="pp-aurora-grain absolute inset-0" />
    </div>
  );
}
