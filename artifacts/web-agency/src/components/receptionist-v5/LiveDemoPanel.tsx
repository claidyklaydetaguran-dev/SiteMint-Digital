/**
 * AI Receptionist V5 — the live-demo panel (§try, mode 2).
 *
 * The live path renders only when `publicDemoEnabled` is true, which never
 * happens in a committed build (`publicDemoFlag.ts`). When it is false this
 * component still mounts, but only ever shows the disabled, explained state
 * — "Live demo — coming after certification" — so the component and its
 * copy exist and are reviewable without the flag ever being flipped in this
 * tree. No provider SDK is imported anywhere in this file.
 */

import { useCallback, useRef, useState } from "react";
import { publicDemoEnabled } from "./publicDemoFlag";
import { startDemoSession, type DemoSession } from "./liveDemoClient";

type LiveDemoState =
  | { phase: "disabled" }
  | { phase: "consent" }
  | { phase: "connecting" }
  | { phase: "countdown"; session: DemoSession; secondsLeft: number }
  | { phase: "fallback"; message: string }
  | { phase: "ended" };

export function LiveDemoPanel() {
  const [state, setState] = useState<LiveDemoState>(
    publicDemoEnabled ? { phase: "consent" } : { phase: "disabled" },
  );
  const tickRef = useRef<number | null>(null);

  const stopCountdown = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const requestSession = useCallback(async () => {
    setState({ phase: "connecting" });
    const result = await startDemoSession();
    if (!result.ok) {
      setState({ phase: "fallback", message: result.message });
      return;
    }
    const { session } = result;
    const startedAt = Date.now();
    setState({ phase: "countdown", session, secondsLeft: session.maxSeconds });
    tickRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, session.maxSeconds - elapsed);
      if (left <= 0) {
        stopCountdown();
        setState({ phase: "ended" });
        return;
      }
      setState({ phase: "countdown", session, secondsLeft: left });
    }, 500);
  }, [stopCountdown]);

  const endSession = useCallback(() => {
    stopCountdown();
    setState({ phase: "ended" });
  }, [stopCountdown]);

  if (!publicDemoEnabled || state.phase === "disabled") {
    return (
      <div className="smv5-live" data-phase="disabled">
        <p className="smv5-live__badge">Live demo — coming after certification</p>
        <p className="smv5-live__body">
          A controlled, consent-based live demo is planned for after the browser call passes
          end-to-end certification. It is not available yet, so no live-call button is shown.
        </p>
      </div>
    );
  }

  if (state.phase === "consent") {
    return (
      <div className="smv5-live" data-phase="consent">
        <p className="smv5-live__body">
          The live demo places a short, real voice call with a SiteMint-owned demo assistant — not
          your data, not a customer account. Sessions are capped at a fixed number of seconds, are
          not recorded, and are logged only as metadata (duration and outcome, no audio or
          transcript).
        </p>
        <button type="button" className="smv5-btn smv5-btn--primary" onClick={requestSession}>
          Start live demo
        </button>
      </div>
    );
  }

  if (state.phase === "connecting") {
    return (
      <div className="smv5-live" data-phase="connecting" aria-live="polite">
        <p className="smv5-live__body">Requesting a demo session…</p>
      </div>
    );
  }

  if (state.phase === "countdown") {
    return (
      <div className="smv5-live" data-phase="countdown" aria-live="polite">
        <p className="smv5-live__countdown">{state.secondsLeft}s remaining</p>
        <button type="button" className="smv5-btn smv5-btn--ghost" onClick={endSession}>
          End demo
        </button>
      </div>
    );
  }

  if (state.phase === "fallback") {
    return (
      <div className="smv5-live" data-phase="fallback" role="alert">
        <p className="smv5-live__body">{state.message}</p>
        <button
          type="button"
          className="smv5-btn smv5-btn--outline"
          onClick={() => setState({ phase: "consent" })}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="smv5-live" data-phase="ended">
      <p className="smv5-live__body">Demo ended. Thanks for trying it.</p>
      <button
        type="button"
        className="smv5-btn smv5-btn--outline"
        onClick={() => setState({ phase: "consent" })}
      >
        Start another
      </button>
    </div>
  );
}

export default LiveDemoPanel;
