/**
 * Frontend V4/V5 — the connected-system journey (homepage chapter 01 / "the
 * interactive connected-system explanation" per V5-BLUEPRINT §4 row 3).
 *
 * Scrolling the chapter advances one inquiry dot through the stages; every
 * transition swaps a business-outcome panel. The stage chips override
 * manually (scroll control re-arms when the chapter leaves the viewport).
 * Reduced motion renders the completed journey and keeps the chips working —
 * nothing about the story requires motion to understand.
 *
 * V5 extension (owner amendment §8, V5-BLUEPRINT §4/§6): re-scored from five
 * stages to the six-step connected-system story — website → capture → CRM
 * record → automation → AI conversation/workflow → resolved outcome. This
 * is an EXTENSION of the original component (more stages, same mechanism),
 * not a replacement — the scroll-linked dot, chip overrides, SVG path and
 * reduced-motion behaviour are unchanged.
 */

import { useEffect, useRef, useState } from "react";

interface Stage {
  title: string;
  desc: string;
  outcome: string;
}

const STAGES: Stage[] = [
  {
    title: "Website",
    desc: "Your site is the front door — built so every visit that matters becomes an inquiry, not a bounce.",
    outcome: "Outcome: no inquiry goes unnoticed",
  },
  {
    title: "Capture",
    desc: "The inquiry gets an immediate, useful reply — a form, a receptionist, or a site that responds — in your voice, with your rules.",
    outcome: "Outcome: every inquiry gets answered",
  },
  {
    title: "CRM record",
    desc: "Every detail lands in the CRM automatically: who they are, what they need, how warm the lead is.",
    outcome: "Outcome: nothing lives in someone's inbox",
  },
  {
    title: "Automation",
    desc: "Workflows follow up, remind, and route the next step to the right person — before the lead goes cold.",
    outcome: "Outcome: follow-up happens on time, every time",
  },
  {
    title: "AI conversation",
    desc: "Where it's in scope, an AI system handles the routine parts of the conversation — qualifying, scheduling, answering — and hands off to a person for judgment calls.",
    outcome: "Outcome: routine work stops waiting on a person",
  },
  {
    title: "Resolved outcome",
    desc: "The inquiry ends as a scheduled appointment, a completed task, or a real customer — and the record reflects it.",
    outcome: "Outcome: attention became a resolved outcome",
  },
];

/** Node anchors on the fixed 640×300 diagram. */
const NODE_POS = [
  { x: 40, y: 252 },
  { x: 148, y: 198 },
  { x: 256, y: 214 },
  { x: 364, y: 150 },
  { x: 480, y: 168 },
  { x: 596, y: 84 },
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
      setStage(STAGES.length - 1);
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
        const next = Math.min(
          STAGES.length - 1,
          Math.floor(prog * (STAGES.length + 0.2)),
        );
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
      const pt = path.getPointAtLength((len * stage) / (STAGES.length - 1));
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
          <span className="v4-kicker">01 — How it connects</span>
          <span className="v4-chapter-rule" aria-hidden="true" />
        </div>

        <div className="v4-journey">
          <div className="v4-journey__copy" ref={reveal} data-v4-reveal>
            <h2 className="v4-h2">
              One connected system, from first click to resolved outcome.
            </h2>
            <p className="v4-lede">
              A missed call, a form no one answers, a lead that never gets a
              follow-up. Scroll the diagram — or select a stage — to see where
              inquiries usually die, and how a connected system keeps them
              moving instead.
            </p>
            <p className="v4-pull-quote">
              One thread, from first click to resolved outcome.
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
              aria-label="Diagram: an inquiry travels from the website through capture, the CRM record, automation, and an AI conversation to a resolved outcome"
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
                d="M40 252 C 110 160, 190 240, 256 214 S 320 130, 364 150 S 440 200, 480 168 S 555 60, 596 84"
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
                fill={stage === STAGES.length - 1 ? "var(--v4-mint)" : "var(--v4-cyan)"}
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
                    style={i === STAGES.length - 1 ? { stroke: "var(--v4-mint)" } : undefined}
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
