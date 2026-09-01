/**
 * Frontend V4 — the Receptionist demo theater (staging preview).
 *
 * A typed, self-contained SIMULATION. Binding rules (owner-approved
 * capability-honest wording, V4.1):
 * - labeled prominently "Interactive staging preview — simulated
 *   conversation"; the action is "Preview the experience"
 * - no microphone request, no audio, nothing live, no "live" wording
 * - scripts never claim autonomous booking or production SMS — endings are
 *   "captured for the team to confirm"
 * - visible privacy/artifact line (no recording · no transcripts retained ·
 *   artifact policy: none)
 *
 * The adapter interface is the seam a future certified live experience
 * would implement server-side; this component only ever mounts the
 * simulated one. The preview scripts are development fixtures and carry the
 * fixture label in the UI itself, so they cannot masquerade as live output.
 */

import { useEffect, useRef, useState, type RefObject } from "react";

/* ── Typed adapter contract ────────────────────────────────────────────── */

export type TheaterState =
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended";

export interface TheaterLine {
  who: "Caller" | "Assistant" | "System";
  text: string;
}

interface ScriptStep {
  afterMs: number;
  state?: TheaterState;
  line?: TheaterLine;
}

export interface PreviewScript {
  /** Chip label — the caller question this preview answers. */
  prompt: string;
  steps: ScriptStep[];
  ending: string;
}

/**
 * SIMULATED PREVIEW FIXTURES — scripted, not live. The theater surfaces
 * this fact in its own UI copy; keep every ending free of autonomous-booking
 * or production-SMS claims.
 */
const PREVIEW_SCRIPTS: PreviewScript[] = [
  {
    prompt: "“Do you have appointments this week?”",
    steps: [
      { afterMs: 1500, line: { who: "Caller", text: "“Hi — do you have any appointments this week?”" } },
      { afterMs: 2600, state: "thinking" },
      {
        afterMs: 3700,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "“We do. I can note your preferred time and make sure the right person confirms it with you. Morning or afternoon?”",
        },
      },
      { afterMs: 7300, state: "listening" },
      { afterMs: 8600, line: { who: "Caller", text: "“Morning, if possible.”" } },
      { afterMs: 9700, state: "thinking" },
      {
        afterMs: 10700,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "“Noted — a morning slot this week, and the team will confirm with you directly. Anything else I can help with?”",
        },
      },
    ],
    ending: "Preview ended · preferred time captured for the team to confirm.",
  },
  {
    prompt: "“What are your hours?”",
    steps: [
      { afterMs: 1500, line: { who: "Caller", text: "“What are your hours?”" } },
      { afterMs: 2600, state: "thinking" },
      {
        afterMs: 3600,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "“We're open weekdays from nine to six. If you'd like, I can take your details so the team follows up at a time that suits you.”",
        },
      },
      { afterMs: 7100, state: "listening" },
      { afterMs: 8300, line: { who: "Caller", text: "“Sure — mornings work best.”" } },
      { afterMs: 9400, state: "thinking" },
      {
        afterMs: 10300,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "“Got it, mornings. I'll pass that along so the follow-up lands at the right time.”",
        },
      },
    ],
    ending: "Preview ended · caller details noted for follow-up.",
  },
  {
    prompt: "“Can someone call me back?”",
    steps: [
      { afterMs: 1500, line: { who: "Caller", text: "“Can someone call me back?”" } },
      { afterMs: 2600, state: "thinking" },
      {
        afterMs: 3500,
        state: "speaking",
        line: { who: "Assistant", text: "“Of course. What's the best number and time to reach you?”" },
      },
      { afterMs: 6600, state: "listening" },
      { afterMs: 7800, line: { who: "Caller", text: "“This number, after 3pm.”" } },
      { afterMs: 8900, state: "thinking" },
      {
        afterMs: 9800,
        state: "speaking",
        line: {
          who: "Assistant",
          text: "“Perfect — after 3pm on this number. I'll route that to the team with your conversation summary.”",
        },
      },
    ],
    ending: "Preview ended · callback request routed to the team.",
  },
];

const STATE_LABEL: Record<TheaterState, string> = {
  ready: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  ended: "Preview ended",
};

const MAX_SECONDS = 120;

function formatClock(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/* ── The Signal voice object — state-driven canvas ─────────────────────── */

function useVoiceObject(
  state: TheaterState,
  canvasRef: RefObject<HTMLCanvasElement | null>,
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    function draw(now: number) {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const s = canvas.clientWidth;
      if (canvas.width !== s * dpr) {
        canvas.width = s * dpr;
        canvas.height = s * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = s / 2;
      ctx.clearRect(0, 0, s, s);

      if (state === "ready" || state === "ended") {
        ctx.beginPath();
        ctx.arc(c, c, c - 8, 0, 6.28);
        ctx.strokeStyle = state === "ended" ? "#4AF2C8" : "#1B3A5E";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (state === "ended") {
          ctx.beginPath();
          ctx.arc(c, c, 4, 0, 6.28);
          ctx.fillStyle = "#4AF2C8";
          ctx.fill();
        }
      } else if (state === "listening" || state === "speaking") {
        const outward = state === "speaking";
        const col = outward ? "45,212,191" : "34,211,238";
        for (let i = 0; i < 3; i++) {
          const ph = (now / 1400 + i / 3) % 1;
          const rr = outward ? 0.35 + ph * 0.6 : 0.95 - ph * 0.6;
          ctx.beginPath();
          ctx.arc(c, c, (c - 8) * rr, 0, 6.28);
          ctx.strokeStyle = `rgba(${col},${(outward ? 1 - ph : ph) * 0.8})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else {
        // thinking — three orbiting dots on the ring
        ctx.beginPath();
        ctx.arc(c, c, c - 8, 0, 6.28);
        ctx.strokeStyle = "#1B3A5E";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = now / 600 + i * 2.09;
          ctx.beginPath();
          ctx.arc(c + Math.cos(a) * (c - 8), c + Math.sin(a) * (c - 8), 3.2, 0, 6.28);
          ctx.fillStyle = "#22D3EE";
          ctx.fill();
        }
      }

      const active = state === "listening" || state === "thinking" || state === "speaking";
      if (!reduced && active) raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [state, canvasRef]);
}

/* ── The theater ───────────────────────────────────────────────────────── */

export function ReceptionistTheaterV4() {
  const [state, setState] = useState<TheaterState>("ready");
  const [scriptIdx, setScriptIdx] = useState(0);
  const [lines, setLines] = useState<TheaterLine[]>([]);
  const [seconds, setSeconds] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const convoRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const tickRef = useRef<number | null>(null);
  const stateRef = useRef<TheaterState>("ready");
  stateRef.current = state;

  useVoiceObject(state, canvasRef);

  function clearTimers() {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function end(message: string) {
    clearTimers();
    setLines((prev) => [...prev, { who: "System", text: message }]);
    setState("ended");
  }

  function start() {
    const script = PREVIEW_SCRIPTS[scriptIdx];
    clearTimers();
    setLines([
      {
        who: "System",
        text: "Simulated preview — scripted conversation, no live call.",
      },
    ]);
    setSeconds(0);
    setState("listening");
    const startedAt = Date.now();
    tickRef.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) end(script.ending);
    }, 500);
    for (const step of script.steps) {
      timersRef.current.push(
        window.setTimeout(() => {
          if (step.state) setState(step.state);
          if (step.line) setLines((prev) => [...prev, step.line as TheaterLine]);
        }, step.afterMs),
      );
    }
    const total = script.steps[script.steps.length - 1].afterMs + 3500;
    timersRef.current.push(window.setTimeout(() => end(script.ending), total));
  }

  function reset() {
    clearTimers();
    setLines([]);
    setSeconds(0);
    setState("ready");
  }

  // Escape ends an active preview (keyboard-safe, interruptible motion).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const s = stateRef.current;
      if (s === "listening" || s === "thinking" || s === "speaking") {
        end("Preview ended by you.");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up on unmount.
  useEffect(() => clearTimers, []);

  // Keep the transcript scrolled to the newest line.
  useEffect(() => {
    const el = convoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const active = state === "listening" || state === "thinking" || state === "speaking";

  return (
    <div className="v4-theater" data-state={state} data-tone="charcoal">
      <span className="v4-theater__tag">
        Interactive staging preview — simulated conversation
      </span>

      <div className="v4-theater__voice" aria-hidden="true">
        <canvas ref={canvasRef} className="v4-theater__canvas" />
        <svg className="v4-theater__gem" viewBox="0 0 24 24">
          <rect
            x="5.2"
            y="5.2"
            width="13.6"
            height="13.6"
            rx="2"
            transform="rotate(45 12 12)"
            fill="none"
            stroke="var(--v4-cyan)"
            strokeWidth="2"
          />
          <circle cx="12" cy="12" r="2.4" fill="var(--v4-cyan)" />
        </svg>
      </div>

      <p className="v4-theater__state" aria-live="polite">
        {STATE_LABEL[state]}
      </p>

      {active && (
        <p className="v4-theater__timer">
          {formatClock(seconds)} / {formatClock(MAX_SECONDS)}
        </p>
      )}

      {state === "ready" && (
        <div
          className="v4-theater__chips"
          role="group"
          aria-label="Example questions for the preview"
        >
          {PREVIEW_SCRIPTS.map((script, i) => (
            <button
              key={script.prompt}
              type="button"
              className="v4-theater__chip"
              aria-pressed={i === scriptIdx}
              onClick={() => setScriptIdx(i)}
            >
              {script.prompt}
            </button>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="v4-theater__convo" aria-live="polite" ref={convoRef}>
          {lines.map((line, i) => (
            <p key={`${i}-${line.text.slice(0, 12)}`} className="v4-theater__line">
              <b>{line.who}:</b> {line.text}
            </p>
          ))}
        </div>
      )}

      <div className="v4-theater__actions">
        {state === "ready" && (
          <button type="button" className="v4-btn v4-btn--primary" onClick={start}>
            Preview the experience
          </button>
        )}
        {active && (
          <button
            type="button"
            className="v4-btn v4-theater__end"
            onClick={() => end("Preview ended by you.")}
          >
            End preview
          </button>
        )}
        {state === "ended" && (
          <button type="button" className="v4-btn v4-btn--outline" onClick={reset}>
            Back to start
          </button>
        )}
      </div>

      <p className="v4-theater__disclose">
        This is a designed preview with a simulated conversation. No microphone
        is requested, no audio plays, and nothing is live.
      </p>
      <p className="v4-theater__privacy">
        No recording · no transcripts retained · artifact policy: none
      </p>
    </div>
  );
}

export default ReceptionistTheaterV4;
