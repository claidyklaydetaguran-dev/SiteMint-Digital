import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Play, Square, Loader2, VolumeX, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVoiceSample } from "@/lib/voiceSampleAdapter";

type PlayerState = "idle" | "loading" | "playing" | "unavailable" | "error";

/**
 * Plays the provider's own recording of one voice.
 *
 * Nothing loads until the customer presses Play. Only one sample plays across
 * the page: starting another stops this one. State follows the real media
 * element — "Playing" appears only once playback has actually begun, and ends
 * on the element's own `ended` event. A newer press, a voice change or an
 * unmount cancels any request still in flight and releases the audio.
 */
let stopActive: (() => void) | null = null;

export function VoiceSamplePlayer({ voiceKey, voiceLabel }: { voiceKey: string; voiceLabel: string }) {
  const [state, setState] = useState<PlayerState>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const teardown = () => {
    requestIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audioRef.current = null;
    releaseRef.current?.();
    releaseRef.current = null;
    if (stopActive === stop) stopActive = null;
  };

  const stop = () => {
    teardown();
    setState("idle");
  };

  // A different voice, or leaving the page, ends whatever this control started.
  useEffect(() => {
    setState("idle");
    setReason(null);
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceKey]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Sits on a selectable card — pressing Play must not also select it.
    e.stopPropagation();
    if (state === "playing" || state === "loading") {
      stop();
      return;
    }

    stopActive?.();
    stopActive = stop;
    teardown();
    stopActive = stop;
    const requestId = requestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setState("loading");
    setReason(null);

    getVoiceSample(voiceKey, controller.signal)
      .then((result) => {
        if (requestIdRef.current !== requestId) {
          if ("release" in result) result.release();
          return;
        }
        if ("unavailable" in result) {
          setState("unavailable");
          setReason(result.reason);
          return;
        }
        releaseRef.current = result.release;
        const audio = new Audio(result.url);
        audioRef.current = audio;
        audio.onended = () => {
          if (requestIdRef.current === requestId) stop();
        };
        audio.onerror = () => {
          if (requestIdRef.current !== requestId) return;
          teardown();
          setState("error");
          setReason("This browser couldn't play the sample.");
        };
        audio.play().then(
          () => {
            if (requestIdRef.current === requestId) setState("playing");
          },
          () => {
            if (requestIdRef.current !== requestId) return;
            teardown();
            setState("error");
            setReason("Playback was blocked. Press Play again.");
          },
        );
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId || (err as { name?: string })?.name === "AbortError") return;
        setState("error");
        setReason(err instanceof Error ? err.message : "The sample couldn't be loaded.");
      });
  };

  const label =
    state === "loading"
      ? "Loading…"
      : state === "playing"
        ? "Stop"
        : state === "unavailable"
          ? "No sample"
          : state === "error"
            ? "Try again"
            : "Play sample";

  const Icon =
    state === "loading"
      ? Loader2
      : state === "playing"
        ? Square
        : state === "unavailable"
          ? VolumeX
          : state === "error"
            ? RotateCcw
            : Play;

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-xs"
        onClick={handleClick}
        disabled={state === "unavailable"}
        aria-label={`${label} — ${voiceLabel} voice sample`}
        aria-pressed={state === "playing"}
        data-state={state}
      >
        <Icon className={`h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
        {label}
      </Button>
      {(state === "unavailable" || state === "error") && reason && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground" role="status">
          {state === "error" && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
          {reason}
        </p>
      )}
    </div>
  );
}
