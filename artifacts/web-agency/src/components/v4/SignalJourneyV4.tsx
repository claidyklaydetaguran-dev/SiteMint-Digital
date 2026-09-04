/**
 * Frontend V4 — the Signal Map journey (homepage chapter 01).
 *
 * Scrolling the chapter advances one inquiry dot through the five stages;
 * every transition swaps a business-outcome panel. The stage chips override
 * manually (scroll control re-arms when the chapter leaves the viewport).
 * Reduced motion renders the completed journey and keeps the chips working —
 * nothing about the story requires motion to understand.
 */

import { useEffect, useRef, useState } from "react";

interface Stage {
  title: string;
  desc: string;
  outcome: string;
}

const STAGES: Stage[] = [
  {
    title: "Attention",
    desc: "Your website and channels capture the inquiry the moment it appears — no ring-out, no unread message.",
    outcome: "Outcome: no inquiry goes unnoticed",
  },
  {
    title: "Conversation",
    desc: "The inquiry gets an immediate, useful reply — a receptionist that answers, or a site that responds — in your voice, with your rules.",
    outcome: "Outcome: every inquiry gets answered",
  },
  {
    title: "Organization",
    desc: "Every detail lands in the CRM automatically: who they are, what they need, how warm the lead is.",
    outcome: "Outcome: nothing lives in someone's inbox",
  },
  {
    title: "Action",
    desc: "Workflows follow up, remind, and route the next step to the right person — before the lead goes cold.",
    outcome: "Outcome: follow-up happens on time, every time",
  },
  {
    title: "Customer",
    desc: "The inquiry ends as a scheduled appointment and a real customer — and the system learned along the way.",
    outcome: "Outcome: attention became revenue",
  },
];

/** Node anchors on the fixed 640×300 diagram. */
const NODE_POS = [
  { x: 52, y: 240 },
  { x: 190, y: 175 },
  { x: 330, y: 160 },
  { x: 470, y: 105 },
  { x: 592, y: 84 },
];

export interface SignalJourneyV4Props {
  reveal: (node: HTMLElement | null) => void;
}

export function SignalJourneyV4({ reveal }: SignalJourneyV4Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [stage, setStage] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const manualRef = useRef(false);
  const stageRef = useRef(0);
  stageRef.current = stage;

  useEffect(() => {
    const reduced = window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    if (reduced) {
      setDrawn(true);
      setStage(4);
      return;
    }

    const section = sectionRef.current;
    if (!section) return;

    const drawObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setDrawn(true);
            drawObs.disconnect();
          }
        }
      },
      { threshold: 0.35 },
    );
    drawObs.observe(section);

    // Manual chip control re-arms scroll control once the chapter leaves.
    const manualObs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) manualRef.current = false;
      }
    });
    manualObs.observe(section);

    let raf = 0;
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (manualRef.current || !section) return;
        const r = section.getBoundingClientRect();
        if (r.top > window.innerHeight || r.bottom < 0) return;
        const span = r.height + window.innerHeight * 0.55;
        const prog = Math.min(
          1,
          Math.max(0, (window.innerHeight * 0.68 - r.top) / span),
        );
        const next = Math.min(4, Math.floor(prog * 5.2));
        if (next !== stageRef.current) setStage(next);
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      drawObs.disconnect();
      manualObs.disconnect();
    };
  }, []);

  // Dot position: sampled from the real path so it rides the curve exactly.
  const [dot, setDot] = useState<{ x: number; y: number }>(NODE_POS[0]);
  useEffect(() => {
    const path = pathRef.current;
    if (!path) {
      setDot(NODE_POS[stage]);
      return;
    }
    try {
      const len = path.getTotalLength();
      const pt = path.getPointAtLength((len * stage) / 4);
      setDot({ x: pt.x, y: pt.y });
    } catch {
      setDot(NODE_POS[stage]);
    }
  }, [stage]);

  const current = STAGES[stage];

  return (
    <section
      className="v4-section"
      id="signal-journey"
      data-tone="porcelain"
      ref={sectionRef}
    >
      <div className="v4-container">
        <div className="v4-chapter-head" ref={reveal} data-v4-reveal>
          <span className="v4-kicker">01 — The journey</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>

        <div className="v4-journey">
          <div className="v4-journey__copy" ref={reveal} data-v4-reveal>
            <h2 className="v4-h2">
              Every inquiry takes a journey. Most businesses lose it halfway.
            </h2>
            <p className="v4-lede">
              A missed call, a form no one answers, a lead that never gets a
              follow-up. Scroll the journey — each stage is a place where
              inquiries usually die, and a place where a connected system keeps
              them moving.
            </p>
            <p className="v4-pull-quote">
              One thread, from first click to booked customer.
            </p>
          </div>

          <div
            className={`v4-sigmap${drawn ? " is-drawn" : ""}`}
            data-tone="ink"
            ref={reveal}
            data-v4-reveal
          >
            <svg
              viewBox="0 0 640 300"
              role="img"
              aria-label="Diagram: an inquiry travels from attention through conversation, organization, and action to a booked customer"
            >
              <defs>
                <linearGradient id="v4-journey-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="var(--v4-cyan)" />
                  <stop offset="0.55" stopColor="var(--v4-turquoise)" />
                  <stop offset="1" stopColor="var(--v4-mint)" />
                </linearGradient>
              </defs>
              <path
                ref={pathRef}
                className="v4-sigmap__path"
                d="M52 240 C 160 90, 220 265, 330 160 S 520 60, 592 84"
                fill="none"
                stroke="url(#v4-journey-grad)"
                strokeWidth="3"
                pathLength={1}
              />
              <circle
                className="v4-sigmap__dot"
                cx={dot.x}
                cy={dot.y}
                r="6"
                fill={stage === 4 ? "var(--v4-mint)" : "var(--v4-cyan)"}
              />
              {NODE_POS.map((pos, i) => (
                <g
                  key={STAGES[i].title}
                  className={`v4-sigmap__node${i === stage ? " is-lit" : ""}${i < stage ? " is-done" : ""}`}
                  transform={`translate(${pos.x} ${pos.y})`}
                >
                  <circle
                    className="v4-sigmap__core"
                    r="21"
                    style={i === 4 ? { stroke: "var(--v4-mint)" } : undefined}
                  />
                  <text y="44" textAnchor="middle">
                    {STAGES[i].title}
                  </text>
                </g>
              ))}
            </svg>

            <div
              className="v4-sigmap__chips"
              role="group"
              aria-label="Journey stages"
            >
              {STAGES.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  className="v4-sigmap__chip"
                  aria-pressed={i === stage}
                  onClick={() => {
                    manualRef.current = true;
                    setStage(i);
                  }}
                >
                  {s.title}
                </button>
              ))}
            </div>

            <div className="v4-sigmap__panel" aria-live="polite">
              <p className="v4-sigmap__panel-title">{current.title}</p>
              <p className="v4-sigmap__panel-desc">{current.desc}</p>
              <span className="v4-sigmap__panel-outcome">{current.outcome}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SignalJourneyV4;
