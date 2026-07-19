import { Loader2, Mic, AlertTriangle, CircleAlert, CircleCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrowserVoiceTestState } from "@/lib/browserVoice/types";

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface BrowserTestPanelProps {
  state: BrowserVoiceTestState;
  assistantName: string;
  elapsedSeconds: number;
  errorMessage: string | null;
  onEnd: () => void;
  onDismiss: () => void;
}

/**
 * Milestone 1 / Checkpoint F1: the persistent builder panel shown while a
 * browser test is preparing, connecting, connected, ending, or has reached
 * a terminal (ended/permission_denied/error) state. Only ever displays
 * safe, static information — never a provider assistant id, provider call
 * id, request metadata, or a raw provider event/error.
 */
export function BrowserTestPanel({ state, assistantName, elapsedSeconds, errorMessage, onEnd, onDismiss }: BrowserTestPanelProps) {
  if (state === "idle") return null;

  const announcement: Record<Exclude<BrowserVoiceTestState, "idle">, string> = {
    preparing: "Preparing browser voice test…",
    connecting: "Connecting to browser voice test…",
    connected: "Browser voice test connected.",
    ending: "Ending browser voice test…",
    ended: "Browser voice test ended.",
    permission_denied: "Microphone permission was denied.",
    error: "Browser voice test error.",
  };

  return (
    <div
      role="region"
      aria-label="Browser voice test"
      className="rounded-lg border border-border bg-card px-4 py-3"
    >
      <div aria-live="polite" className="sr-only">
        {announcement[state]}
      </div>

      {(state === "preparing" || state === "connecting") && (
        <div className="flex items-center gap-2 text-sm text-info">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{state === "preparing" ? "Preparing browser voice test…" : "Connecting to browser voice test…"}</span>
        </div>
      )}

      {state === "connected" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-success">
            <CircleCheck className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="font-medium">Browser voice test connected</span>
            <span className="truncate text-muted-foreground">— {assistantName}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label={`Elapsed time ${formatElapsed(elapsedSeconds)}`}>
              <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              <span aria-hidden="true">{formatElapsed(elapsedSeconds)}</span>
            </span>
            <Button onClick={onEnd} variant="outline" size="sm" className="min-h-11 md:min-h-8">
              End Test
            </Button>
          </div>
        </div>
      )}

      {state === "connected" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Your browser's microphone is in use for this test. Audio is being sent to the configured voice
          provider.
        </p>
      )}

      {state === "ending" && (
        <div className="flex items-center gap-2 text-sm text-info">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Ending browser voice test…</span>
        </div>
      )}

      {state === "ended" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Browser voice test ended.</p>
          <Button onClick={onDismiss} variant="outline" size="sm" className="min-h-11 gap-1.5 md:min-h-8">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Close
          </Button>
        </div>
      )}

      {state === "permission_denied" && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="flex items-start gap-2 text-sm text-warning-foreground dark:text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            Microphone permission was denied. Allow microphone access in your browser settings and try again.
          </p>
          <Button onClick={onDismiss} variant="outline" size="sm" className="min-h-11 gap-1.5 md:min-h-8">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Close
          </Button>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {errorMessage ?? "Something went wrong with the browser voice test. Please try again."}
          </p>
          <Button onClick={onDismiss} variant="outline" size="sm" className="min-h-11 gap-1.5 md:min-h-8">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
