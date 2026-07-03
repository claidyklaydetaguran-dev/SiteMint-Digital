import { useMemo } from "react";
import "./Particles.css";

interface ParticlesProps {
  particleCount?: number;
  particleColors?: string[];
  className?: string;
}

interface Dot {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
  dur: number;
  dx: number;
  dy: number;
  delay: number;
  color: string;
}

interface Line {
  i: number;
  j: number;
}

// Seeded pseudo-random so dots are stable across renders
function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return Math.abs(s) / 0x7fffffff;
  };
}

export default function Particles({
  particleCount = 40,
  particleColors = ["#1e3a8a", "#1e40af", "#2563eb", "#3b82f6"],
  className = "",
}: ParticlesProps) {
  const dots = useMemo<Dot[]>(() => {
    const rand = seededRand(42);
    return Array.from({ length: particleCount }, (_, i) => ({
      cx: rand() * 100,
      cy: rand() * 100,
      r: 2 + rand() * 3,
      opacity: 0.08 + rand() * 0.22,
      dur: 8 + rand() * 16,
      dx: (rand() - 0.5) * 6,
      dy: (rand() - 0.5) * 6,
      delay: -(rand() * 20),
      color: particleColors[Math.floor(rand() * particleColors.length)],
    }));
  }, [particleCount, particleColors]);

  const lines = useMemo<Line[]>(() => {
    const result: Line[] = [];
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].cx - dots[j].cx;
        const dy = dots[i].cy - dots[j].cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 22) result.push({ i, j });
      }
    }
    return result;
  }, [dots]);

  return (
    <div className={`particles-container ${className}`} aria-hidden="true">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0 }}
      >
        {/* Connection lines */}
        {lines.map(({ i, j }) => {
          const a = dots[i];
          const b = dots[j];
          const dx = a.cx - b.cx;
          const dy = a.cy - b.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const lineOpacity = Math.max(0, (1 - dist / 22) * 0.15);
          return (
            <line
              key={`l-${i}-${j}`}
              x1={`${a.cx}%`} y1={`${a.cy}%`}
              x2={`${b.cx}%`} y2={`${b.cy}%`}
              stroke="#1e3a8a"
              strokeWidth="0.18"
              opacity={lineOpacity}
            />
          );
        })}

        {/* Dots with CSS animation */}
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={`${d.cx}%`}
            cy={`${d.cy}%`}
            r={d.r * 0.38}
            fill={d.color}
            opacity={d.opacity}
            className="particle-dot"
            style={{
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
              // custom properties for per-dot movement
              ["--dx" as string]: `${d.dx}%`,
              ["--dy" as string]: `${d.dy}%`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
