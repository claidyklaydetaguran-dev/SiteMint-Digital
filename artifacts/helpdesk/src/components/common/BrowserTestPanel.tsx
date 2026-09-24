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
  /**
   * Shown only for a failure whose copy cannot already tell the customer what
   * to do. Opaque and random — never an identifier.
   */
  supportReference?: string | null;
  onEnd: () => void;
  onDismiss: () => void;
  /**
   * Provided only when the last failure was the provider REFUSING this
   * assistant's stored credential — the one failure a fresh, identically
   * scoped token can actually fix. Absent for a microphone or network failure,
   * where offering a new credential would be misleading.
   */
  onRetryWithNewCredential?: (() => void) | undefined;
  retryingCredential?: boolean;
}

const ROW = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--sd-space-3, .75rem)",
  minWidth: 0,
};

const NOTE = {
  margin: "var(--sd-space-2, .5rem) 0 0",
  fontSize: "var(--sd-text-small, .8125rem)",
  lineHeight: 1.5,
  color: "var(--sd-text-muted, #3b5265)",
};

/**
 * The panel shown while a browser test is preparing, connecting, connected,
 * ending, or has reached a terminal state.
 *
 * It only ever displays safe, static information — never a provider assistant
 * id, provider call id, request metadata, or a raw provider event. It also
 * never describes the session as a telephone call, because it is not one.
 *
 * Presentation only in this pass: `--sd-*` tokens instead of utility classes.
 */
export function BrowserTestPanel({
  state,
  assistantName,
  elapsedSeconds,
  errorMessage,
  supportReference,
  onEnd,
  onDismiss,
  onRetryWithNewCredential,
  retryingCredential = false,
}: BrowserTestPanelProps) {
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
      style={{
        padding: "var(--sd-space-4, 1rem) var(--sd-space-5, 1.25rem)",
        border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
        borderRadius: "var(--sd-radius-card, 10px)",
        background: "var(--sd-surface, #fff)",
        minWidth: 0,
      }}
    >
      <div aria-live="polite" className="sd-sr">
        {announcement[state]}
      </div>

      {(state === "preparing" || state === "connecting") && (
        <>
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: "var(--sd-space-2, .5rem)", fontSize: "var(--sd-text-body, .875rem)" }}>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {state === "preparing" ? "Preparing browser voice test…" : "Connecting to browser voice test…"}
          </p>
          {/* A test always runs the configuration the provider last confirmed,
              never the unsaved or unpublished draft in the builder. Saying so
              here removes the only reasonable misreading of the result. */}
          <p style={NOTE}>
            This tests the configuration last sent to the voice provider — not unpublished changes.
          </p>
        </>
      )}

      {state === "connected" && (
        <>
          <div style={ROW}>
            <p
              style={{
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "var(--sd-space-2, .5rem)",
                minWidth: 0,
                fontSize: "var(--sd-text-body, .875rem)",
                fontWeight: 600,
                color: "var(--sd-text, #051824)",
              }}
            >
              <CircleCheck className="h-4 w-4" aria-hidden="true" style={{ color: "var(--sd-accent-ink, #051824)" }} />
              Browser voice test connected
              <span style={{ fontWeight: 400, color: "var(--sd-text-muted, #3b5265)", overflowWrap: "anywhere" }}>
                — {assistantName}
              </span>
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sd-space-3, .75rem)" }}>
              <span
                aria-label={`Elapsed time ${formatElapsed(elapsedSeconds)}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--sd-space-1, .25rem)",
                  fontSize: "var(--sd-text-small, .8125rem)",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--sd-text-muted, #3b5265)",
                }}
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                <span aria-hidden="true">{formatElapsed(elapsedSeconds)}</span>
              </span>
              <Button onClick={onEnd} variant="outline" size="sm">
                End test
              </Button>
            </div>
          </div>
          <p style={NOTE}>
            Your browser&rsquo;s microphone is in use for this test. Audio is being sent to the configured voice
            provider.
          </p>
        </>
      )}

      {state === "ending" && (
        <p style={{ margin: 0, display: "flex", alignItems: "center", gap: "var(--sd-space-2, .5rem)", fontSize: "var(--sd-text-body, .875rem)" }}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Ending browser voice test…
        </p>
      )}

      {state === "ended" && (
        <div style={ROW}>
          <p style={{ margin: 0, fontSize: "var(--sd-text-body, .875rem)", color: "var(--sd-text-muted, #3b5265)" }}>
            Browser voice test ended.
          </p>
          <Button onClick={onDismiss} variant="outline" size="sm">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Close
          </Button>
        </div>
      )}

      {state === "permission_denied" && (
        <div style={ROW}>
          <p
            style={{
              margin: 0,
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--sd-space-2, .5rem)",
              minWidth: 0,
              fontSize: "var(--sd-text-body, .875rem)",
              color: "var(--sd-warn, #8a5200)",
            }}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 2 }} />
            Microphone permission was denied. Allow microphone access in your browser settings and try again.
          </p>
          <Button onClick={onDismiss} variant="outline" size="sm">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Close
          </Button>
        </div>
      )}

      {state === "error" && (
        <>
          <div style={ROW}>
            <p
              style={{
                margin: 0,
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--sd-space-2, .5rem)",
                minWidth: 0,
                fontSize: "var(--sd-text-body, .875rem)",
                color: "var(--sd-danger, #9c2233)",
              }}
            >
              <CircleAlert className="h-4 w-4" aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 2 }} />
              {errorMessage ?? "Something went wrong with the browser voice test. Please try again."}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sd-space-2, .5rem)" }}>
              {onRetryWithNewCredential && (
                <Button onClick={onRetryWithNewCredential} size="sm" disabled={retryingCredential}>
                  {retryingCredential ? "Getting a new key…" : "Get a new key and retry"}
                </Button>
              )}
              <Button onClick={onDismiss} variant="outline" size="sm">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Close
              </Button>
            </div>
          </div>
          {supportReference && (
            <p style={NOTE}>
              If this keeps happening, quote reference{" "}
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontWeight: 600 }}>
                {supportReference}
              </span>{" "}
              to SiteMint support.
            </p>
          )}
        </>
      )}
    </div>
  );
}
