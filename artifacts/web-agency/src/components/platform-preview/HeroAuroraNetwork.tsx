import { useEffect, useRef, useState } from "react";

/**
 * "Ocean Network" hero background. CSS gradient + one lightweight inline
 * SVG only — no remote image, no WebGL, no video. Deliberately a real
 * background layer behind PlatformHero's copy/CTA column, not a decorative
 * unused component: it owns the section's -z-10 base layer.
 *
 * Composition (navy/cyan-mint palette, V4): white/pale-mint gradient base, a
 * quiet white readability wash behind the left copy column, and a
 * low-opacity SVG network of curved paths/nodes concentrated on the right
 * (a "connected technology company" motif — distinct from, and layered
 * behind, the animated aurora ribbon effect that AuroraBackground now
 * supplies via PlatformHero). Uses the homepage-scoped --pp-* tokens
 * (platform-preview.css) — no other /platform-preview/* page references
 * these, so this stays a homepage-only visual change.
 *
 * Motion (paused via prefers-reduced-motion and while off-screen/tab
 * hidden): gentle node pulse only; tiny device parallax is left to
 * HeroDeviceComposition itself. Cursor spotlight is desktop-only
 * (`pointer: fine`) and scoped to this component.
 */
export function HeroAuroraNetwork() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number } | null>(null);

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

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    setSpotlight({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setSpotlight(null)}
      className={`pp-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] overflow-hidden md:h-[720px] ${active ? "" : "pp-aurora-paused"}`}
      style={{ pointerEvents: "auto" }}
    >
      {/* 1. White / pale-mint foundation */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(135deg, hsl(var(--pp-white)) 0%, hsl(var(--pp-surface-soft)) 48%, hsl(var(--pp-mint-pale)) 100%)" }}
      />

      {/* 2. Network pattern — curved paths + nodes, concentrated right side, low opacity */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.28]"
        viewBox="0 0 1280 640"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g stroke="hsl(var(--pp-mint-deep))" strokeWidth="1" strokeDasharray="2 5" opacity="0.35">
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
            fill="hsl(var(--pp-mint-emerald))"
          />
        ))}
      </svg>

      {/* 3. Desktop-only cursor spotlight, contained to this section */}
      {spotlight && (
        <div
          className="hidden md:block absolute inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle 260px at ${spotlight.x}% ${spotlight.y}%, hsl(var(--pp-mint-fresh) / 0.16), transparent 70%)`,
          }}
        />
      )}

      {/* 4. Quiet readability wash behind the headline (left ~45%) */}
      <div
        className="absolute inset-y-0 left-0 w-[55%]"
        style={{ background: "linear-gradient(90deg, hsl(var(--pp-mint-warm-white) / 0.7) 0%, transparent 100%)" }}
      />

      {/* Fade to the page's own canvas background at the bottom edge */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--pp-mint-warm-white)))" }}
      />
    </div>
  );
}
