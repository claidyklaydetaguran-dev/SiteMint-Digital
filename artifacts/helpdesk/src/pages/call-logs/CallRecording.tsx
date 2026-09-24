import { useEffect, useRef, useState } from "react";
import { RECORDING, parseRecordingResult, type RecordingResult } from "./recordingContract";

/** No autoplay, microphone, stored URLs, or background polling. A new call
 * mounts a new player, so navigation cannot play another customer's record. */
export function CallRecording({ callId, policy, isFinal, deleted = false, canDelete = false }: {
  callId: string;
  policy: string | undefined;
  isFinal: boolean;
  /** J6: the server says this call's recording was already deleted. */
  deleted?: boolean;
  /** J6: owners only; the server refuses anyone else anyway. */
  canDelete?: boolean;
}) {
  const [result, setResult] = useState<RecordingResult | null>(deleted ? { status: "deleted" } : null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => { requestRef.current?.abort(); }, []);

  async function loadRecording() {
    if (loading) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/receptionist/voice/calls/${encodeURIComponent(callId)}/recording`, {
        credentials: "include", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) {
        setError(response.status === 401 ? RECORDING.unauthorized
          : response.status === 403 ? RECORDING.ownerOnly
          : response.status === 429 ? RECORDING.rateLimited : RECORDING.failed);
        return;
      }
      setResult(parseRecordingResult(await response.json()));
    } catch {
      if (!controller.signal.aborted) setError(RECORDING.failed);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function deleteRecording() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/receptionist/voice/calls/${encodeURIComponent(callId)}/recording`, {
        method: "DELETE", credentials: "include", cache: "no-store",
      });
      if (!response.ok) {
        setError(response.status === 401 ? RECORDING.unauthorized : response.status === 403 ? RECORDING.ownerOnly : RECORDING.deleteFailed);
        return;
      }
      const body = (await response.json().catch(() => null)) as { status?: unknown } | null;
      if (body?.status !== "deleted") {
        setError(RECORDING.deleteFailed);
        return;
      }
      setResult({ status: "deleted" });
      setConfirming(false);
    } catch {
      setError(RECORDING.deleteFailed);
    } finally {
      setDeleting(false);
    }
  }

  const isDeleted = result?.status === "deleted";
  const disabled = policy !== "full";
  return (
    <section className="sc-doc" aria-labelledby="sc-recording">
      <h2 className="sc-doc__heading" id="sc-recording">{RECORDING.heading}</h2>
      <p className="sc-note">{disabled ? RECORDING.disabled : !isFinal ? RECORDING.pending : RECORDING.intro}</p>
      {!disabled && isFinal && (
        <>
          {result?.status === "available" && !error && (
            <div className="sc-recording-player">
              <audio ref={audioRef} controls preload="metadata" src={result.url} aria-label={RECORDING.player}
                onLoadedMetadata={() => { if (audioRef.current) audioRef.current.playbackRate = speed; }}
                onError={() => { setResult(null); setError(RECORDING.failed); }}>
                {RECORDING.unsupported}
              </audio>
              <label className="sc-note" htmlFor="sc-recording-speed">{RECORDING.speed}</label>
              <select id="sc-recording-speed" value={speed} className="sc-speed" onChange={(event) => {
                const next = Number(event.target.value);
                setSpeed(next);
                if (audioRef.current) audioRef.current.playbackRate = next;
              }}>
                {[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
              </select>
            </div>
          )}
          <p className={error ? "sc-absent" : "sc-note"} role="status" aria-live="polite">
            {error ?? (loading ? RECORDING.loading : result ? result.status === "available" ? RECORDING.ready : RECORDING[result.status] : "")}
          </p>
          {!isDeleted && (
            <button type="button" className="sc-retry" disabled={loading || deleting} aria-busy={loading} onClick={loadRecording}>
              {loading ? RECORDING.loading : result || error ? RECORDING.retry : RECORDING.load}
            </button>
          )}
          {canDelete && !isDeleted && !confirming && (
            <button type="button" className="sc-retry" disabled={loading || deleting} onClick={() => setConfirming(true)}>
              {RECORDING.deleteAction}
            </button>
          )}
          {canDelete && !isDeleted && confirming && (
            <div role="group" aria-label={RECORDING.deleteAction}>
              <p className="sc-note">{RECORDING.deleteConfirmPrompt}</p>
              <button type="button" className="sc-retry" disabled={deleting} aria-busy={deleting} onClick={deleteRecording}>
                {deleting ? RECORDING.deleting : RECORDING.deleteConfirm}
              </button>
              <button type="button" className="sc-retry" disabled={deleting} onClick={() => setConfirming(false)}>
                {RECORDING.deleteCancel}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
