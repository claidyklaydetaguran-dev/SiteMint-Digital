import { useMemo, useRef, useState, useCallback } from "react";
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

function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return Math.abs(s) / 0x7fffffff;
  };
}

export default function Particles({
  particleCount = 40,
  particleColors = ["#062e71", "#0a3d91", "#1255c4", "#3b82f6"],
  className = "",
}: ParticlesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const targetOffset = useRef({ x: 0, y: 0 });
  const currentOffset = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dots = useMemo<Dot[]>(() => {
    const rand = seededRand(42);
    return Array.from({ length: particleCount }, () => ({
      cx: rand() * 100,
      cy: rand() * 100,
      r: 2 + rand() * 3,
      opacity: 0.12 + rand() * 0.26,
      dur: 10 + rand() * 18,
      dx: (rand() - 0.5) * 7,
      dy: (rand() - 0.5) * 7,
      delay: -(rand() * 22),
      color: particleColors[Math.floor(rand() * particleColors.length)],
    }));
  }, [particleCount, particleColors]);

  const lines = useMemo(() => {
    const result: { i: number; j: number; dist: number }[] = [];
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].cx - dots[j].cx;
        const dy = dots[i].cy - dots[j].cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 24) result.push({ i, j, dist });
      }
    }
    return result;
  }, [dots]);

  const animate = useCallback(() => {
    const lerp = 0.06;
    currentOffset.current.x += (targetOffset.current.x - currentOffset.current.x) * lerp;
    currentOffset.current.y += (targetOffset.current.y - currentOffset.current.y) * lerp;
    setOffset({ x: currentOffset.current.x, y: currentOffset.current.y });
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    targetOffset.current = { x: (nx - 0.5) * 16, y: (ny - 0.5) * 12 };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(animate);
  }, [animate]);

  const handleMouseLeave = useCallback(() => {
    targetOffset.current = { x: 0, y: 0 };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`particles-container ${className}`}
      aria-hidden="true"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: "transform 0.05s linear",
        }}
      >
        {/* Connection lines */}
        {lines.map(({ i, j, dist }) => {
          const a = dots[i];
          const b = dots[j];
          const lineOpacity = Math.max(0, (1 - dist / 24) * 0.25);
          return (
            <line
              key={`l-${i}-${j}`}
              x1={`${a.cx}%`} y1={`${a.cy}%`}
              x2={`${b.cx}%`} y2={`${b.cy}%`}
              stroke="#062e71"
              strokeWidth="0.22"
              opacity={lineOpacity}
            />
          );
        })}

        {/* Dots */}
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
              ["--dx" as string]: `${d.dx}%`,
              ["--dy" as string]: `${d.dy}%`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
