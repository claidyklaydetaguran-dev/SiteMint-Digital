import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrowserVoiceClient, BrowserVoiceEvent, BrowserVoiceStartInput, BrowserVoiceTestState } from "@/lib/browserVoice/types";
import { useBrowserVoiceClientFactory } from "@/lib/browserVoice/context";
import { safeBrowserVoiceErrorMessage } from "@/lib/browserVoice/errors";

const ACTIVE_STATES: ReadonlySet<BrowserVoiceTestState> = new Set(["preparing", "connecting", "connected", "ending"]);

/**
 * Milestone 1 / Checkpoint F1 (correction pass): the only call site allowed
 * to invoke `client.destroy()`. Safely absorbs every shape a well- or
 * badly-behaved client might return — void, a resolved Promise, a rejected
 * Promise, a synchronous throw, or a non-Promise thenable — so a destroy
 * failure can never surface as an unhandled promise rejection, a console
 * error, or a raw error message in the UI. Never retries.
 */
function safelyDestroyClient(client: BrowserVoiceClient): void {
  try {
    const result = client.destroy();
    if (result && typeof (result as Promise<void>).then === "function") {
      void (result as Promise<void>).then(
        () => undefined,
        () => undefined,
      );
    }
  } catch {
    // Destroy must never throw into the caller; nothing to do here.
  }
}

export interface UseBrowserVoiceTestResult {
  state: BrowserVoiceTestState;
  errorMessage: string | null;
  elapsedSeconds: number;
  /** Whether the client this builder would use is able to run a real test at all (never true in production until Checkpoint F2). */
  clientAvailable: boolean;
  /** True while preparing/connecting/connected/ending — used to keep Test disabled during an active test. */
  isActive: boolean;
  /** Guarded: a second call while already starting/active is a no-op. */
  start: (input: BrowserVoiceStartInput) => void;
  /** Guarded: a second call while not connected is a no-op. */
  end: () => void;
  /** Returns a terminal state (ended/permission_denied/error) to idle. No client operation. */
  dismiss: () => void;
  /** Forced teardown for a session/tenant boundary — destroys any active client and returns to idle immediately. */
  reset: () => void;
  /** Best-effort, non-blocking client teardown for pagehide/beforeunload. Never awaited. */
  bestEffortUnloadCleanup: () => void;
}

/**
 * Milestone 1 / Checkpoint F1: the browser-test lifecycle state machine.
 * Owns at most one BrowserVoiceClient instance at a time. All start/end
 * guards are synchronous refs (not React state) so a duplicate click in the
 * same tick can never produce two client operations.
 */
export function useBrowserVoiceTest(): UseBrowserVoiceTestResult {
  const factory = useBrowserVoiceClientFactory();
  const [state, setState] = useState<BrowserVoiceTestState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const clientRef = useRef<BrowserVoiceClient | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const startGuardRef = useRef(false);
  const endGuardRef = useRef(false);
  // Starts true: no client exists yet, so any stray event must be ignored.
  const liveRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startedAtRef.current = null;
  }, []);

  /** Tears down the current client instance. Does not itself change `state`. */
  const teardownClient = useCallback(() => {
    liveRef.current = false;
    clearTimer();
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    startGuardRef.current = false;
    endGuardRef.current = false;
    const client = clientRef.current;
    clientRef.current = null;
    if (client) {
      safelyDestroyClient(client);
    }
  }, [clearTimer]);

  const handleEvent = useCallback(
    (event: BrowserVoiceEvent) => {
      if (!liveRef.current) return;
      switch (event.type) {
        case "call-start":
          setState((prev) => {
            if (prev !== "connecting") return prev;
            startedAtRef.current = Date.now();
            setElapsedSeconds(0);
            if (timerRef.current === null) {
              timerRef.current = window.setInterval(() => {
                if (startedAtRef.current !== null) {
                  setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
                }
              }, 1000);
            }
            return "connected";
          });
          break;
        case "call-end":
          setState((prev) => {
            if (prev !== "connected" && prev !== "ending") return prev;
            teardownClient();
            return "ended";
          });
          break;
        case "permission-denied":
          setState((prev) => {
            if (prev === "ended" || prev === "error" || prev === "permission_denied") return prev;
            teardownClient();
            return "permission_denied";
          });
          break;
        case "error":
          setState((prev) => {
            if (prev === "ended" || prev === "error" || prev === "permission_denied") return prev;
            setErrorMessage(safeBrowserVoiceErrorMessage());
            teardownClient();
            return "error";
          });
          break;
        default:
          // Unknown event types are ignored safely.
          break;
      }
    },
    [teardownClient],
  );

  const start = useCallback(
    (input: BrowserVoiceStartInput) => {
      if (startGuardRef.current) return;
      startGuardRef.current = true;
      setErrorMessage(null);
      setState("preparing");

      const client = factory();
      clientRef.current = client;
      liveRef.current = true;
      unsubscribeRef.current = client.subscribe(handleEvent);

      setState("connecting");
      client.start(input).catch(() => {
        if (!liveRef.current || clientRef.current !== client) return;
        setErrorMessage(safeBrowserVoiceErrorMessage("start_failed"));
        teardownClient();
        setState("error");
      });
    },
    [factory, handleEvent, teardownClient],
  );

  const end = useCallback(() => {
    if (endGuardRef.current) return;
    if (state !== "connected") return;
    endGuardRef.current = true;
    setState("ending");
    const client = clientRef.current;
    if (!client) {
      teardownClient();
      setState("ended");
      return;
    }
    client
      .end()
      .then(() => {
        if (!liveRef.current || clientRef.current !== client) return;
        teardownClient();
        setState("ended");
      })
      .catch(() => {
        if (!liveRef.current || clientRef.current !== client) return;
        setErrorMessage(safeBrowserVoiceErrorMessage("end_failed"));
        teardownClient();
        setState("error");
      });
  }, [state, teardownClient]);

  const dismiss = useCallback(() => {
    setState((prev) => {
      if (prev !== "ended" && prev !== "error" && prev !== "permission_denied") return prev;
      setErrorMessage(null);
      setElapsedSeconds(0);
      return "idle";
    });
  }, []);

  const reset = useCallback(() => {
    teardownClient();
    setErrorMessage(null);
    setElapsedSeconds(0);
    setState("idle");
  }, [teardownClient]);

  const bestEffortUnloadCleanup = useCallback(() => {
    teardownClient();
  }, [teardownClient]);

  useEffect(() => () => teardownClient(), [teardownClient]);

  const clientAvailable = useMemo(() => factory().available, [factory]);
  const isActive = ACTIVE_STATES.has(state);

  return { state, errorMessage, elapsedSeconds, clientAvailable, isActive, start, end, dismiss, reset, bestEffortUnloadCleanup };
}
