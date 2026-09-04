/**
 * AI Receptionist V5 — the call theater (§preview).
 *
 * Reuses the canvas-ring voice object and its Ready / Listening / Thinking /
 * Speaking / Ended states (the same state model as
 * `components/v4/ReceptionistTheaterV4.tsx`), re-implemented here against
 * `previewScript.ts`'s seven curated branches and the `--sm-*` token colors
 * instead of importing the V4 file directly — this tree owns its own
 * dependency graph.
 *
 * Binding rules carried over from the V4 theater:
 * - always labeled a simulation; never requests a microphone; nothing here
 *   makes a network call or a provider request.
 * - keyboard operable: chips are buttons, Escape ends an active preview.
 * - `prefers-reduced-motion: reduce` and hidden tabs stop the animation loop.
 *
 * Cinematic motion (2026-09-05 owner directive) — this is the page's "call
 * ring" + "waveform" motif home: the idle "Ready" ring now breathes gently
 * (`useVoiceObject` below) instead of sitting perfectly static, and
 * `TheaterWaveform` adds a small ambient bar cluster next to the state
 * label. Both loops are ambient (not reveal-once) so both are paused via
 * `data-ambient-paused` — the ring loop through its own IntersectionObserver
 * (added to the existing visibility gate rather than a second effect), the
 * waveform via the shared `usePausableAmbient` hook — whenever the tab is
 * hidden or the theater scrolls offscreen.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  PREVIEW_BRANCHES,
  PREVIEW_STATE_LABEL,
  type PreviewLine,
  type VoiceState,
} from "./previewScript";
import { PREVIEW_LABEL } from "@/pages/receptionist-v5/sections";
import { usePausableAmbient } from "./heroMotion";

const MAX_SECONDS = 90;

function formatClock(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Reads a `--sm-*` token from the document, falling back to the documented
 * V5-BLUEPRINT §2 literal so the ring still renders correctly before the
 * foundation owner's `tokens-v5.css` is loaded. */
function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function useVoiceObject(state: VoiceState, canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const mint500 = readToken("--sm-mint-500", "#32C5D2");
    const mint400 = readToken("--sm-mint-400", "#56D2CF");
    const ink950 = readToken("--sm-ink-950", "#153E52");

    // "Call ring" ambient motif: the idle Ready ring breathes instead of
    // sitting perfectly still, so the visual reads as alive before a caller
    // (or, here, a visitor) does anything. Ended stays a static confirmation
    // — it's a resting result, not an ambient loop. Offscreen pausing below
    // matters specifically because this loop can now run indefinitely
    // whenever the state is "ready", not only for a few seconds per call.
    let onscreen = true;
    let raf = 0;
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) onscreen = entry.isIntersecting;
              cancelAnimationFrame(raf);
              if (onscreen && document.visibilityState === "visible") {
                raf = requestAnimationFrame(draw);
              }
            },
            { threshold: 0.05 },
          )
        : undefined;
    observer?.observe(canvas);

    function draw(now: number) {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const s = canvas.clientWidth;
      if (s > 0 && canvas.width !== s * dpr) {
        canvas.width = s * dpr;
        canvas.height = s * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = s / 2;
      ctx.clearRect(0, 0, s, s);

      if (state === "ready") {
        const breathe = reduced ? 1 : 1 + Math.sin(now / 1500) * 0.035;
        ctx.beginPath();
        ctx.arc(c, c, (c - 8) * breathe, 0, 6.28);
        ctx.strokeStyle = ink950;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (state === "ended") {
        ctx.beginPath();
        ctx.arc(c, c, c - 8, 0, 6.28);
        ctx.strokeStyle = mint500;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c, c, 4, 0, 6.28);
        ctx.fillStyle = mint500;
        ctx.fill();
      } else if (state === "listening" || state === "speaking") {
        const outward = state === "speaking";
        for (let i = 0; i < 3; i++) {
          const ph = (now / 1400 + i / 3) % 1;
          const rr = outward ? 0.35 + ph * 0.6 : 0.95 - ph * 0.6;
          const alpha = (outward ? 1 - ph : ph) * 0.8;
          ctx.beginPath();
          ctx.arc(c, c, (c - 8) * rr, 0, 6.28);
          ctx.strokeStyle = outward ? withAlpha(mint500, alpha) : withAlpha(mint400, alpha);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(c, c, c - 8, 0, 6.28);
        ctx.strokeStyle = ink950;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = now / 600 + i * 2.09;
          ctx.beginPath();
          ctx.arc(c + Math.cos(a) * (c - 8), c + Math.sin(a) * (c - 8), 3.2, 0, 6.28);
          ctx.fillStyle = mint400;
          ctx.fill();
        }
      }

      const active = state === "listening" || state === "thinking" || state === "speaking";
      const shouldLoop = active || state === "ready";
      if (!reduced && shouldLoop && document.visibilityState === "visible" && onscreen) {
        raf = requestAnimationFrame(draw);
      }
    }

    function withAlpha(hex: string, alpha: number): string {
      // hex is expected #rrggbb; anything else (e.g. an unresolved var) just
      // renders at full opacity rather than throwing.
      const m = /^#([0-9a-f]{6})$/i.exec(hex);
      if (!m) return hex;
      const int = parseInt(m[1], 16);
      const r = (int >> 16) & 255;
      const g = (int >> 8) & 255;
      const b = int & 255;
      return `rgba(${r},${g},${b},${alpha})`;
    }

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === "visible") raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVisibility);

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, [state, canvasRef]);
}

/**
 * "Waveform" motif — a small ambient CSS bar cluster (`transform: scaleY`
 * only), shown alongside the idle Ready state as a quiet audio-readiness
 * accent. Paused via `usePausableAmbient` whenever the tab is hidden or the
 * theater scrolls offscreen; `aria-hidden` since it carries no information
 * beyond decoration (the state label above it is the accessible signal).
 */
function TheaterWaveform() {
  const ambientRef = usePausableAmbient<HTMLDivElement>();
  const bars = [0, 1, 2, 3, 4];
  return (
    <div className="smv5-theater__waveform" ref={ambientRef} aria-hidden="true">
      {bars.map((i) => (
        <span key={i} className="smv5-theater__wavebar" style={{ animationDelay: `${i * 110}ms` }} />
      ))}
    </div>
  );
}

export function CallTheaterV5() {
  const [state, setState] = useState<VoiceState>("ready");
  const [branchIdx, setBranchIdx] = useState(0);
  const [lines, setLines] = useState<PreviewLine[]>([]);
  const [seconds, setSeconds] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const convoRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const tickRef = useRef<number | null>(null);
  const stateRef = useRef<VoiceState>("ready");
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
    const branch = PREVIEW_BRANCHES[branchIdx];
    clearTimers();
    setLines([{ who: "System", text: "Simulated preview — no live call is taking place." }]);
    setSeconds(0);
    setState("listening");
    const startedAt = Date.now();
    tickRef.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) end(branch.ending);
    }, 500);
    for (const step of branch.steps) {
      timersRef.current.push(
        window.setTimeout(() => {
          if (step.state) setState(step.state);
          if (step.line) setLines((prev) => [...prev, step.line as PreviewLine]);
        }, step.afterMs),
      );
    }
    const lastStep = branch.steps[branch.steps.length - 1];
    const total = (lastStep?.afterMs ?? 0) + 2600;
    timersRef.current.push(window.setTimeout(() => end(branch.ending), total));
  }

  function reset() {
    clearTimers();
    setLines([]);
    setSeconds(0);
    setState("ready");
  }

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

  useEffect(() => clearTimers, []);

  useEffect(() => {
    const el = convoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const active = state === "listening" || state === "thinking" || state === "speaking";

  return (
    <div className="smv5-theater" data-state={state}>
      <div className="smv5-theater__top">
        <span className="smv5-theater__label">{PREVIEW_LABEL}</span>
        {active && (
          <p className="smv5-theater__timer">
            {formatClock(seconds)} / {formatClock(MAX_SECONDS)}
          </p>
        )}
      </div>

      <div className="smv5-theater__body">
        <div className="smv5-theater__voice-col">
          <div className="smv5-theater__voice" aria-hidden="true">
            <canvas ref={canvasRef} className="smv5-theater__canvas" />
          </div>
          <p className="smv5-theater__state" aria-live="polite">
            {PREVIEW_STATE_LABEL[state]}
          </p>
          {state === "ready" && <TheaterWaveform />}
        </div>

        <div className="smv5-theater__interact">
          {state === "ready" && (
            <div className="smv5-theater__chips" role="group" aria-label="Preview topics">
              {PREVIEW_BRANCHES.map((branch, i) => (
                <button
                  key={branch.id}
                  type="button"
                  className="smv5-theater__chip"
                  aria-pressed={i === branchIdx}
                  onClick={() => setBranchIdx(i)}
                >
                  {branch.chipLabel}
                </button>
              ))}
            </div>
          )}

          {lines.length > 0 && (
            <div className="smv5-theater__convo" aria-live="polite" ref={convoRef}>
              {lines.map((line, i) => (
                <p key={`${i}-${line.text.slice(0, 12)}`} className="smv5-theater__line">
                  <b>{line.who}:</b> {line.text}
                </p>
              ))}
            </div>
          )}

          <div className="smv5-theater__actions">
            {state === "ready" && (
              <button type="button" className="smv5-btn smv5-btn--primary" onClick={start}>
                Start the interactive preview
              </button>
            )}
            {active && (
              <button
                type="button"
                className="smv5-btn smv5-btn--ghost"
                onClick={() => end("Preview ended by you.")}
              >
                End preview
              </button>
            )}
            {state === "ended" && (
              <button type="button" className="smv5-btn smv5-btn--outline" onClick={reset}>
                Choose another topic
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="smv5-theater__disclose">
        Simulated conversation. No microphone is requested, no audio plays, and no call is placed.
      </p>
    </div>
  );
}

export default CallTheaterV5;
