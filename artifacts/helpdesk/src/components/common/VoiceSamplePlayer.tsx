import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Play, Pause, Loader2, VolumeX, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVoiceSample } from "@/lib/voiceSampleAdapter";
import type { SupportedVoicePresetId } from "@/pages/assistants/assistantsContract";

type PlayerState = "idle" | "loading" | "playing" | "unavailable" | "error";

/**
 * V5 PR-6 (C-4): a play control for one voice preset's sample, with an
 * explicit state for every outcome `voiceSampleAdapter.getVoiceSample` can
 * report. Nothing here fetches, loads, or plays anything until the customer
 * presses Play — there is no autoplay and no work done on mount.
 */
export function VoiceSamplePlayer({
  presetId,
  presetLabel,
}: {
  presetId: SupportedVoicePresetId;
  presetLabel: string;
}) {
  const [state, setState] = useState<PlayerState>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Sits on a selectable preset card — never let Play also select it.
    e.stopPropagation();

    if (state === "playing") {
      audioRef.current?.pause();
      audioRef.current = null;
      setState("idle");
      return;
    }
    if (state === "loading") return;

    const requestId = ++requestIdRef.current;
    setState("loading");
    setReason(null);

    void getVoiceSample(presetId)
      .then((result) => {
        if (requestIdRef.current !== requestId) return; // superseded by a newer click
        if ("unavailable" in result) {
          setState("unavailable");
          setReason(result.reason);
          return;
        }
        const audio = new Audio(result.url);
        audioRef.current = audio;
        audio.onended = () => {
          if (requestIdRef.current === requestId) setState("idle");
        };
        audio.onerror = () => {
          if (requestIdRef.current === requestId) setState("error");
        };
        audio
          .play()
          .then(() => {
            if (requestIdRef.current === requestId) setState("playing");
          })
          .catch(() => {
            if (requestIdRef.current === requestId) setState("error");
          });
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setState("error");
        setReason(null);
      });
  };

  const label =
    state === "loading"
      ? "Loading sample…"
      : state === "playing"
        ? "Playing…"
        : state === "unavailable"
          ? "Sample unavailable"
          : state === "error"
            ? "Couldn't play sample"
            : "Play sample";

  const Icon =
    state === "loading"
      ? Loader2
      : state === "playing"
        ? Pause
        : state === "unavailable"
          ? VolumeX
          : state === "error"
            ? AlertTriangle
            : Play;

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={handleClick}
        disabled={state === "loading"}
        aria-label={`${label} — ${presetLabel}`}
      >
        <Icon className={`h-3 w-3 ${state === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
        {label}
      </Button>
      {(state === "unavailable" || state === "error") && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {reason ?? "Please try again."}
        </p>
      )}
    </div>
  );
}
