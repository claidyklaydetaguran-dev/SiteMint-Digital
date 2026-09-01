/**
 * Frontend V4 — the Signal homepage.
 *
 * Hero contract (owner corrections, binding — V4 implementation authorization):
 * 1. The readable copy block and the animated Signal field are SEPARATE
 *    layout regions: copy first, field below it. Nothing the scroll narrative
 *    animates can overlap or clip the copy at any progress or width — the
 *    guarantee is structural, not tuned.
 * 2. Copy never transforms during the five phases; it leaves the screen only
 *    when the hero section itself scrolls out.
 * 3. The field keeps a meaningful composition at every width (min-height,
 *    five system nodes always laid out); it is never a copy-less particle
 *    soup at tablet widths.
 * 4. The phase HUD collapses on small screens to a progress line plus the
 *    current stage only.
 *
 * The scroll narrative (scatter → capture → organize → connect → resolve)
 * runs on canvas + rAF (native APIs; no new animation dependency). Reduced
 * motion renders the resolved composition immediately and drops the scroll
 * runway entirely.
 */

import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { SignalGlyphV4 } from "@/components/v4/SignalGlyphsV4";
import { whatWeBuildV4, startHrefV4, startLabelV4 } from "@/components/v4/publicNavV4";
import { SignalJourneyV4 } from "@/components/v4/SignalJourneyV4";

/* ── Hero field geometry — single source for nodes, canvas, and HUD ────── */

interface HeroNode {
  /** Fractions of the FIELD region (not the viewport). */
  x: number;
  y: number;
  label: string;
  glyph: "site" | "discovery" | "automation" | "voice" | "check";
  terminus?: boolean;
}

const HERO_NODES: HeroNode[] = [
  { x: 0.12, y: 0.5, label: "Websites & web apps", glyph: "site" },
  { x: 0.31, y: 0.74, label: "Discovery systems", glyph: "discovery" },
  { x: 0.5, y: 0.52, label: "Workflow automation", glyph: "automation" },
  { x: 0.69, y: 0.74, label: "AI Receptionist", glyph: "voice" },
  { x: 0.88, y: 0.46, label: "Booked customer", glyph: "check", terminus: true },
];

const PHASES = ["Scatter", "Capture", "Organize", "Connect", "Resolve"] as const;
/** Progress thresholds between the five phases. */
const PHASE_EDGES = [0.18, 0.38, 0.62, 0.85];

const N_PARTS = 150;

interface Particle {
  fx: number;
  fy: number;
  dx: number;
  dy: number;
  t: number;
  gate: number;
  amber: boolean;
  dash: boolean;
  ang: number;
  r: number;
  phase: number;
}

function makeParticles(): Particle[] {
  // Deterministic field: same composition every visit and every capture.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const parts: Particle[] = [];
  for (let i = 0; i < N_PARTS; i++) {
    parts.push({
      fx: rnd(),
      fy: rnd(),
      dx: (rnd() - 0.5) * 0.016,
      dy: (rnd() - 0.5) * 0.012,
      t: 0.04 + (i / (N_PARTS - 1)) * 0.93,
      gate: 0.16 + (i / (N_PARTS - 1)) * 0.64,
      amber: rnd() < 0.38,
      dash: rnd() < 0.18,
      ang: rnd() * 6.28,
      r: 1.2 + rnd() * 2.1,
      phase: rnd() * 6.28,
    });
  }
  return parts;
}

/** Catmull-Rom polyline through the node route, in field pixels. */
function buildPolyline(w: number, h: number): Array<{ x: number; y: number }> {
  const ctrl = [
    { x: 0.02, y: 0.34 },
    ...HERO_NODES.map((n) => ({ x: n.x, y: n.y })),
  ].map((p) => ({ x: p.x * w, y: p.y * h }));
  const out: Array<{ x: number; y: number }> = [];
  const cr = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    t: number,
  ) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x:
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y:
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  };
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let s = 0; s < 24; s++) out.push(cr(p0, p1, p2, p3, s / 24));
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

function HeroCheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="m5 13 4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SignalHeroV4() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const rootMaybe = rootRef.current;
    const fieldMaybe = fieldRef.current;
    const canvasMaybe = canvasRef.current;
    if (!rootMaybe || !fieldMaybe || !canvasMaybe) return;
    const ctxMaybe = canvasMaybe.getContext("2d");
    if (!ctxMaybe) return;
    // Re-bind with non-null declared types so the narrowing survives into
    // the closures below (TS does not propagate flow narrowing into them).
    const root: HTMLDivElement = rootMaybe;
    const field: HTMLDivElement = fieldMaybe;
    const canvas: HTMLCanvasElement = canvasMaybe;
    const ctx: CanvasRenderingContext2D = ctxMaybe;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const parts = makeParticles();
    let W = 0;
    let H = 0;
    let poly: Array<{ x: number; y: number }> = [];
    let parX = 0;
    let parY = 0;
    let tgX = 0;
    let tgY = 0;
    let raf = 0;
    let running = false;

    const nodeEls = Array.from(
      field.querySelectorAll<HTMLElement>("[data-v4-hero-node]"),
    );
    const hudSteps = Array.from(
      root.querySelectorAll<HTMLElement>("[data-v4-hud-step]"),
    );
    const hudBar = root.querySelector<HTMLElement>("[data-v4-hud-bar]");
    const hudCurrent = root.querySelector<HTMLElement>("[data-v4-hud-current]");

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      poly = buildPolyline(W, H);
    }

    function pos(t: number): [number, number] {
      const i = Math.min(poly.length - 1, Math.max(0, t * (poly.length - 1)));
      const a = poly[Math.floor(i)];
      const b = poly[Math.min(poly.length - 1, Math.ceil(i))];
      const f = i - Math.floor(i);
      return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f];
    }

    function progress(): number {
      const r = root.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      return total <= 0 ? 1 : Math.min(1, Math.max(0, -r.top / total));
    }

    const drawTo = (p: number) => Math.min(1, Math.max(0, (p - 0.22) / 0.7));
    const phaseOf = (p: number) => {
      let i = 0;
      while (i < PHASE_EDGES.length && p >= PHASE_EDGES[i]) i++;
      return i;
    };

    function paint(p: number, now: number) {
      ctx.clearRect(0, 0, W, H);
      const hz = ctx.createRadialGradient(
        W * 0.55,
        H * 0.45,
        0,
        W * 0.55,
        H * 0.45,
        Math.max(W, H) * 0.75,
      );
      hz.addColorStop(0, "rgba(13,36,64,0.5)");
      hz.addColorStop(1, "rgba(7,19,36,0)");
      ctx.fillStyle = hz;
      ctx.fillRect(0, 0, W, H);

      const d = drawTo(p);
      if (d > 0.005 && poly.length) {
        const [x0, y0] = pos(0);
        const [x1, y1] = pos(1);
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, "#22D3EE");
        grad.addColorStop(0.55, "#2DD4BF");
        grad.addColorStop(1, "#4AF2C8");
        ctx.beginPath();
        for (let t = 0; t <= d; t += 0.006) {
          const [x, y] = pos(t);
          if (t === 0) ctx.moveTo(x + parX, y + parY);
          else ctx.lineTo(x + parX, y + parY);
        }
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.55 + d * 0.45;
        ctx.shadowColor = "rgba(34,211,238,.6)";
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        const [hx, hy] = pos(d);
        ctx.beginPath();
        ctx.arc(hx + parX, hy + parY, 4 + Math.sin(now / 280) * 1.2, 0, 6.28);
        ctx.fillStyle = d > 0.97 ? "#4AF2C8" : "#22D3EE";
        ctx.fill();
      }

      for (const q of parts) {
        const joined = Math.min(1, Math.max(0, (p - q.gate) / 0.12));
        const wob = Math.sin(now / 900 + q.phase);
        const capture = Math.min(1, Math.max(0, (p - 0.16) / 0.2)) * 0.25;
        const [ex, ey] = poly.length ? pos(0) : [0, 0];
        const fx = (q.fx + wob * q.dx * 8) * W * (1 - capture) + ex * capture;
        const fy =
          (q.fy + Math.cos(now / 1100 + q.phase) * q.dy * 8) * H * (1 - capture) +
          ey * capture;
        const [cx, cy] = poly.length ? pos(q.t) : [0, 0];
        const e = joined < 0.5 ? 2 * joined * joined : 1 - (-2 * joined + 2) ** 2 / 2;
        const x = fx + (cx - fx) * e + parX * (1 - e * 0.5);
        const y = fy + (cy - fy) * e + parY * (1 - e * 0.5);
        const alpha = (q.amber ? 0.6 : 0.45) + e * 0.4;
        const col = joined
          ? q.t > 0.8
            ? "#4AF2C8"
            : q.t > 0.45
              ? "#2DD4BF"
              : "#22D3EE"
          : q.amber
            ? `rgba(245,165,36,${alpha * (0.55 + 0.45 * wob)})`
            : `rgba(244,248,251,${alpha * 0.8})`;
        ctx.globalAlpha = joined ? 0.8 : 1;
        if (q.dash && !joined) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(q.ang + wob * 0.3);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-q.r * 2.4, 0);
          ctx.lineTo(q.r * 2.4, 0);
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, q.r * (1 - e * 0.3), 0, 6.28);
          ctx.fillStyle = col;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // System nodes light as the thread reaches them; HUD narrates.
      for (const el of nodeEls) {
        const t = Number(el.dataset.t);
        el.classList.toggle("is-lit", d >= t - 0.06);
        el.classList.toggle("is-done", d >= t + 0.08);
      }
      const ph = phaseOf(p);
      hudSteps.forEach((s, i) => {
        s.classList.toggle("is-cur", i === ph);
        s.classList.toggle("is-done", i < ph);
      });
      if (hudBar) hudBar.style.transform = `scaleX(${Math.max(0.02, p)})`;
      if (hudCurrent) {
        hudCurrent.textContent = `${String(ph + 1).padStart(2, "0")} — ${PHASES[ph]}`;
      }
    }

    function frame(now: number) {
      if (!running) return;
      if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
      parX += (tgX - parX) * 0.06;
      parY += (tgY - parY) * 0.06;
      paint(progress(), now);
      raf = requestAnimationFrame(frame);
    }

    function paintFinal() {
      resize();
      parX = 0;
      parY = 0;
      paint(1, 0);
    }

    resize();

    if (reduced) {
      paintFinal();
      const onResize = () => paintFinal();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const vis = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(frame);
        } else if (!entry.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      }
    });
    vis.observe(root);

    function onPointer(e: PointerEvent) {
      tgX = (e.clientX / window.innerWidth - 0.5) * 20;
      tgY = (e.clientY / window.innerHeight - 0.5) * 14;
    }
    if (finePointer) root.addEventListener("pointermove", onPointer);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      vis.disconnect();
      window.removeEventListener("resize", onResize);
      if (finePointer) root.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <div className="v4-hero" ref={rootRef} data-tone="ink">
      <div className="v4-hero__stage">
        {/* Region 1 — the readable layer. Static through every phase. */}
        <div className="v4-hero__copy" data-v4-hero-copy>
          <p className="v4-kicker">SiteMint Digital · Signal</p>
          <h1 className="v4-hero__title">From first click to booked customer.</h1>
          <p className="v4-hero__sub1">
            SiteMint designs the connected digital system in between.
          </p>
          <p className="v4-hero__sub">
            Websites, web applications, <b>CRM workflows, and AI reception
            systems</b> that work together — so inquiries don't disappear
            between tools.
          </p>
          <div className="v4-hero__ctas">
            <Link href={startHrefV4} className="v4-btn v4-btn--primary">
              {startLabelV4}
            </Link>
            <a href="#signal-journey" className="v4-btn v4-btn--outline">
              See How It Works
            </a>
          </div>
        </div>

        {/* Region 2 — the Signal field. The narrative lives here, below the
            copy, at every width. */}
        <div className="v4-hero__field" ref={fieldRef} aria-hidden="true">
          <canvas className="v4-hero__canvas" ref={canvasRef} />
          {HERO_NODES.map((node, i) => (
            <div
              key={node.label}
              className={`v4-hero__node${node.terminus ? " v4-hero__node--terminus" : ""}`}
              data-v4-hero-node
              data-t={(0.04 + ((i + 1) / HERO_NODES.length) * 0.93).toFixed(3)}
              style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}
            >
              <span className="v4-hero__node-ring">
                {node.glyph === "check" ? (
                  <HeroCheckGlyph />
                ) : (
                  <SignalGlyphV4 glyph={node.glyph} />
                )}
              </span>
              <span className="v4-hero__node-label">{node.label}</span>
            </div>
          ))}
        </div>

        {/* Region 3 — phase HUD. Full five-step narration on desktop; a
            progress line + current stage on small screens (owner correction 5). */}
        <div className="v4-hero__hud" aria-hidden="true">
          <div className="v4-hero__hud-steps">
            {PHASES.map((phase) => (
              <span key={phase} className="v4-hero__hud-step" data-v4-hud-step>
                {phase}
              </span>
            ))}
          </div>
          <div className="v4-hero__hud-compact">
            <span className="v4-hero__hud-track">
              <span className="v4-hero__hud-bar" data-v4-hud-bar />
            </span>
            <span className="v4-hero__hud-current" data-v4-hud-current>
              01 — Scatter
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Chapter 02 — What We Build ────────────────────────────────────────── */

function PillarsV4({ reveal }: { reveal: (node: HTMLElement | null) => void }) {
  return (
    <section className="v4-section" id="what-we-build" data-tone="white">
      <div className="v4-container">
        <div className="v4-chapter-head" ref={reveal} data-v4-reveal>
          <span className="v4-kicker">02 — What We Build</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>
        <h2 className="v4-h2" ref={reveal} data-v4-reveal>
          Four systems. One connected signal.
        </h2>
        <p className="v4-lede" ref={reveal} data-v4-reveal>
          Each system solves one business problem well. Connected on the signal
          line, they carry an inquiry end to end.
        </p>
        <div className="v4-pillars" ref={reveal} data-v4-reveal>
          <span className="v4-pillars__line" aria-hidden="true" />
          <div className="v4-pillars__grid">
            {whatWeBuildV4.map((item) => (
              <article className="v4-pillar" key={item.label}>
                <SignalGlyphV4 glyph={item.glyph} className="v4-pillar__glyph" />
                <span className="v4-panel__outcome">{item.outcome}</span>
                <h3 className="v4-pillar__title">{item.label}</h3>
                <p className="v4-pillar__desc">{item.description}</p>
                <Link href={item.href} className="v4-pillar__link">
                  Explore {item.label} →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── The page ──────────────────────────────────────────────────────────── */

export default function HomeV4() {
  const reveal = useReveal();

  return (
    <div className="v4-home">
      <SignalHeroV4 />

      <SignalJourneyV4 reveal={reveal} />

      <PillarsV4 reveal={reveal} />

      <section className="v4-section v4-cta-band" data-tone="ink">
        <div className="v4-container">
          <span className="v4-kicker">03 — Start</span>
          <h2 className="v4-h2">
            Tell us where attention leaks out of your business. We'll design
            the system that catches it.
          </h2>
          <div className="v4-cta-band__actions">
            <Link href={startHrefV4} className="v4-btn v4-btn--primary">
              {startLabelV4}
            </Link>
            <Link href={ROUTES.process} className="v4-btn v4-btn--outline">
              See our process
            </Link>
          </div>
        </div>
        <span className="v4-signal-rule v4-cta-band__thread" aria-hidden="true" />
      </section>
    </div>
  );
}
