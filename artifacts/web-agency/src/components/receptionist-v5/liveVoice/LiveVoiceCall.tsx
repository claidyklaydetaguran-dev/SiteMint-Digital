/**
 * Owner-preview live AI voice demo (owner responsive-first directive,
 * 2026-09-06). A real browser voice conversation with the dedicated
 * SiteMint demo assistant via the Vapi Web SDK — mounted ONLY when
 * `liveVoiceEnabled` (build flag) is true, and functional only when the
 * public key + demo assistant id are configured.
 *
 * State machine (every state visually distinct and announced):
 *   unsupported → the browser lacks getUserMedia
 *   insecure    → not a secure context (mic APIs unavailable)
 *   missing-config → flag on but key/assistant not configured
 *   consent     → disclosure + explicit start (the user gesture that also
 *                 unlocks speaker playback)
 *   mic-request → browser permission prompt is up
 *   mic-denied / no-mic → explained, with retry
 *   connecting  → SDK loading + call starting
 *   in-call     → live; sub-state listening / speaking, mute, volume,
 *                 visible remaining time (hard 90s cap)
 *   ending / ended / timeout / error → terminal, with retry
 *
 * The in-call UI is driven by real SDK events (call-start, call-end,
 * speech-start, speech-end, volume-level, error) — no fake timers except
 * the enforced cap countdown, which starts at the real call-start event.
 * One call at a time per tab (module guard + duplicate-click guard).
 * Decorative-film rules don't apply here: this is a functional product
 * control, not a video.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  LIVE_VOICE_MAX_SECONDS,
  getDemoAssistantId,
  getVapiPublicKey,
} from "./liveVoiceConfig";
import { loadVapi, type VapiLike } from "./vapiLoader";

type Phase =
  | "unsupported"
  | "insecure"
  | "missing-config"
  | "consent"
  | "mic-request"
  | "mic-denied"
  | "no-mic"
  | "connecting"
  | "in-call"
  | "ending"
  | "ended"
  | "timeout"
  | "error";

/** One simultaneous call per tab. */
let tabCallActive = false;

export default function LiveVoiceCall() {
  const [phase, setPhase] = useState<Phase>("consent");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(LIVE_VOICE_MAX_SECONDS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const vapiRef = useRef<VapiLike | null>(null);
  const timersRef = useRef<number[]>([]);
  const startingRef = useRef(false);

  const publicKey = getVapiPublicKey();
  const assistantId = getDemoAssistantId();

  useEffect(() => {
    if (!window.isSecureContext) {
      setPhase("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }
    if (!publicKey || !assistantId) {
      setPhase("missing-config");
    }
  }, [publicKey, assistantId]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearInterval(t));
    timersRef.current = [];
  }, []);

  const teardown = useCallback(() => {
    clearTimers();
    try {
      vapiRef.current?.stop();
    } catch {
      /* already stopped */
    }
    vapiRef.current = null;
    tabCallActive = false;
    startingRef.current = false;
  }, [clearTimers]);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (startingRef.current || tabCallActive) return; // duplicate-click / concurrent guard
    if (!publicKey || !assistantId) {
      setPhase("missing-config");
      return;
    }
    startingRef.current = true;
    setErrorMsg(null);
    setMuted(false);
    setSpeaking(false);
    setSecondsLeft(LIVE_VOICE_MAX_SECONDS);

    // 1 · Explicit microphone permission from the user gesture.
    setPhase("mic-request");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // the SDK re-acquires
    } catch (e) {
      startingRef.current = false;
      const name = (e as DOMException)?.name;
      setPhase(name === "NotFoundError" || name === "OverconstrainedError" ? "no-mic" : "mic-denied");
      return;
    }

    // 2 · Load the SDK and connect.
    setPhase("connecting");
    let vapi: VapiLike;
    try {
      vapi = await loadVapi(publicKey);
    } catch {
      startingRef.current = false;
      setErrorMsg("The voice service could not be loaded. Please try again.");
      setPhase("error");
      return;
    }
    vapiRef.current = vapi;
    tabCallActive = true;

    vapi.on("call-start", () => {
      startingRef.current = false;
      setPhase("in-call");
      // Hard cap countdown — starts at the REAL call-start event.
      const startedAt = Date.now();
      const tick = window.setInterval(() => {
        const left = LIVE_VOICE_MAX_SECONDS - Math.floor((Date.now() - startedAt) / 1000);
        setSecondsLeft(Math.max(0, left));
        if (left <= 0) {
          setPhase("timeout");
          teardown();
        }
      }, 250);
      timersRef.current.push(tick);
    });
    vapi.on("call-end", () => {
      setPhase((p) => (p === "timeout" || p === "error" ? p : "ended"));
      teardown();
    });
    vapi.on("speech-start", () => setSpeaking(true));
    vapi.on("speech-end", () => setSpeaking(false));
    vapi.on("volume-level", (level) => {
      if (typeof level === "number") setVolume(Math.max(0, Math.min(1, level)));
    });
    vapi.on("error", (err) => {
      setErrorMsg(
        typeof (err as { message?: string })?.message === "string"
          ? "The voice provider reported an error. Please try again."
          : "Something went wrong with the voice connection.",
      );
      setPhase("error");
      teardown();
    });

    try {
      await vapi.start(assistantId);
    } catch {
      setErrorMsg("The call could not be started. Please try again.");
      setPhase("error");
      teardown();
    }
  }, [publicKey, assistantId, teardown]);

  const endCall = useCallback(() => {
    setPhase("ending");
    teardown();
    setPhase("ended");
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const v = vapiRef.current;
    if (!v) return;
    setMuted((m) => {
      v.setMuted(!m);
      return !m;
    });
  }, []);

  /* ── Render ─────────────────────────────────────────────────────────── */

  if (phase === "insecure") {
    return (
      <Panel phase={phase} role="alert">
        <p className="smv5-livecall__body">
          The live demo needs a secure (HTTPS) connection for microphone access. The simulated
          preview above shows the same conversation flow.
        </p>
      </Panel>
    );
  }
  if (phase === "unsupported") {
    return (
      <Panel phase={phase} role="alert">
        <p className="smv5-livecall__body">
          This browser doesn&rsquo;t support microphone capture. The simulated preview above shows
          the same conversation flow.
        </p>
      </Panel>
    );
  }
  if (phase === "missing-config") {
    return (
      <Panel phase={phase}>
        <p className="smv5-livecall__badge">Live demo — owner preview not configured</p>
        <p className="smv5-livecall__body">
          The live voice mode is enabled but the demo assistant is not configured for this build.
          The simulated preview above remains fully available.
        </p>
      </Panel>
    );
  }
  if (phase === "consent") {
    return (
      <Panel phase={phase}>
        <p className="smv5-livecall__badge">Live AI voice demo</p>
        <ul className="smv5-livecall__disclosure">
          <li>You&rsquo;ll be speaking with an AI — the SiteMint demo receptionist.</li>
          <li>Your browser will ask for microphone access.</li>
          <li>Audio is transmitted to our configured voice and AI providers to hold the conversation.</li>
          <li>Please don&rsquo;t share sensitive personal, financial, or medical information.</li>
          <li>You can end the demo at any time. Sessions cap at {LIVE_VOICE_MAX_SECONDS} seconds.</li>
        </ul>
        <button type="button" className="smv5-btn smv5-btn--primary" onClick={() => void start()}>
          Start live demo
        </button>
      </Panel>
    );
  }
  if (phase === "mic-request") {
    return (
      <Panel phase={phase} live>
        <p className="smv5-livecall__body">Waiting for microphone permission…</p>
      </Panel>
    );
  }
  if (phase === "mic-denied" || phase === "no-mic") {
    return (
      <Panel phase={phase} role="alert">
        <p className="smv5-livecall__body">
          {phase === "mic-denied"
            ? "Microphone access was declined, so the live demo can't start. You can allow the microphone in your browser's site settings and try again — or keep using the simulated preview above."
            : "No microphone was found. Connect one and try again — or keep using the simulated preview above."}
        </p>
        <button type="button" className="smv5-btn smv5-btn--outline" onClick={() => setPhase("consent")}>
          Try again
        </button>
      </Panel>
    );
  }
  if (phase === "connecting") {
    return (
      <Panel phase={phase} live>
        <p className="smv5-livecall__body">Connecting to the demo receptionist…</p>
      </Panel>
    );
  }
  if (phase === "in-call") {
    return (
      <Panel phase={phase} live>
        <div className="smv5-livecall__status">
          <span className="smv5-livecall__dot" data-speaking={speaking || undefined} aria-hidden="true" />
          <span>{speaking ? "AI speaking" : muted ? "You are muted" : "Listening"}</span>
          <span
            className="smv5-livecall__meter"
            aria-hidden="true"
            style={{ "--sm-vol": volume } as CSSProperties}
          />
          <span className="smv5-livecall__clock" aria-label="Time remaining">
            {`0:${String(secondsLeft).padStart(2, "0")}`}
          </span>
        </div>
        <div className="smv5-livecall__controls">
          <button type="button" className="smv5-btn smv5-btn--outline" aria-pressed={muted} onClick={toggleMute}>
            {muted ? "Unmute" : "Mute"}
          </button>
          <button type="button" className="smv5-btn smv5-btn--primary" onClick={endCall}>
            End call
          </button>
        </div>
        <p className="smv5-livecall__note">Live demo — speaking with AI. Please don&rsquo;t share sensitive information.</p>
      </Panel>
    );
  }
  if (phase === "error") {
    return (
      <Panel phase={phase} role="alert">
        <p className="smv5-livecall__body">{errorMsg ?? "Something went wrong."}</p>
        <button type="button" className="smv5-btn smv5-btn--outline" onClick={() => setPhase("consent")}>
          Try again
        </button>
      </Panel>
    );
  }
  if (phase === "timeout") {
    return (
      <Panel phase={phase}>
        <p className="smv5-livecall__body">
          The {LIVE_VOICE_MAX_SECONDS}-second demo window ended. Thanks for trying it!
        </p>
        <button type="button" className="smv5-btn smv5-btn--outline" onClick={() => setPhase("consent")}>
          Start another
        </button>
      </Panel>
    );
  }
  // ending / ended
  return (
    <Panel phase={phase}>
      <p className="smv5-livecall__body">Demo ended. Thanks for trying the AI Receptionist.</p>
      <button type="button" className="smv5-btn smv5-btn--outline" onClick={() => setPhase("consent")}>
        Start another
      </button>
    </Panel>
  );
}

function Panel({
  phase,
  live,
  role,
  children,
}: {
  phase: Phase;
  live?: boolean;
  role?: "alert";
  children: ReactNode;
}) {
  return (
    <div
      className="smv5-livecall"
      data-phase={phase}
      role={role}
      aria-live={live ? "polite" : undefined}
    >
      {children}
    </div>
  );
}
