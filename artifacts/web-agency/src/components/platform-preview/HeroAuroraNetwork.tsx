import { useEffect, useRef, useState } from "react";

/**
 * "Mint Aurora Network" hero background. CSS gradients + one lightweight
 * inline SVG only — no remote image, no WebGL, no video. Deliberately a
 * real background layer behind PlatformHero's copy/CTA column, not a
 * decorative unused component: it owns the section's -z-10 base layer and
 * replaces PlatformHero's previous flat radial-glow + grid treatment.
 *
 * Composition: deep navy gradient base, two radial mint glows (brighter on
 * the right, where the hero's HeroSystemCanvas sits), a quiet darker
 * readability wash behind the left copy column, a low-opacity SVG network
 * of curved paths/nodes concentrated on the right, and one translucent
 * mint ribbon crossing the transition zone.
 *
 * Motion (all paused via prefers-reduced-motion and while off-screen/tab
 * hidden): slow aurora drift (14s), gentle node pulse, tiny device
 * parallax is left to HeroSystemCanvas itself. Cursor spotlight is
 * desktop-only (`pointer: fine`) and scoped to this component.
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
      {/* 1. Deep navy foundation */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(135deg, hsl(var(--sm-charcoal-950)) 0%, hsl(var(--sm-charcoal-900)) 48%, hsl(var(--sm-charcoal-950)) 100%)" }}
      />

      {/* 2. Mint aurora glow — brighter, right side (behind device composition) */}
      <div
        className="pp-aurora-drift absolute inset-0"
        style={{ background: "radial-gradient(circle at 75% 35%, hsl(var(--sm-mint-500) / 0.32), transparent 42%)" }}
      />

      {/* 3. Soft secondary glow */}
      <div
        className="pp-aurora-drift-slow absolute inset-0"
        style={{ background: "radial-gradient(circle at 45% 75%, hsl(var(--sm-mint-300) / 0.16), transparent 38%)" }}
      />

      {/* 4. Translucent flowing ribbon, diagonal transition zone */}
      <div
        className="pp-aurora-ribbon absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, transparent 38%, hsl(var(--sm-mint-500) / 0.14) 48%, hsl(var(--sm-mint-300) / 0.08) 56%, transparent 66%)",
        }}
      />

      {/* 5. Network pattern — curved paths + nodes, concentrated right side, low opacity */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.28]"
        viewBox="0 0 1280 640"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g stroke="hsl(var(--sm-mint-300))" strokeWidth="1" strokeDasharray="2 5" opacity="0.6">
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
            fill="hsl(var(--sm-mint-500))"
          />
        ))}
      </svg>

      {/* 6. Desktop-only cursor spotlight, contained to this section */}
      {spotlight && (
        <div
          className="hidden md:block absolute inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle 260px at ${spotlight.x}% ${spotlight.y}%, hsl(var(--sm-mint-500) / 0.10), transparent 70%)`,
          }}
        />
      )}

      {/* 7. Quiet readability wash behind the headline (left ~45%) */}
      <div
        className="absolute inset-y-0 left-0 w-[55%]"
        style={{ background: "linear-gradient(90deg, hsl(var(--sm-charcoal-950) / 0.55) 0%, transparent 100%)" }}
      />

      {/* Fade to the page's own canvas background at the bottom edge */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--sm-color-bg-canvas)))" }}
      />
    </div>
  );
}
