/**
 * Tells the operator, plainly, when the CRM cannot reach the server.
 *
 * This release is online-first by decision: there is no offline write queue. So
 * the honest thing to show is not "working offline" — which would promise a
 * synchronisation that does not exist — but "we cannot reach the server, your
 * text is safe, nothing has been sent".
 *
 * The banner never offers to replay anything. Retry re-reads; it does not
 * re-send. A button that silently re-fires a send, approve or delete after a
 * reconnect is the failure mode the owner ruled out, and it is worse than
 * losing the action because nobody watched it happen.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import {
  getConnectionState,
  startConnectionWatch,
  subscribeConnection,
  type ConnectionState,
} from "@/lib/connectionState";

function secondsSince(t: number | null): number {
  if (!t) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

export function ConnectionBanner() {
  const [state, setState] = useState<ConnectionState>(() => getConnectionState());
  // A tick so "for 40 seconds" stays true without the connection layer having
  // to emit on a timer.
  const [, setNow] = useState(0);

  useEffect(() => {
    startConnectionWatch();
    const off = subscribeConnection(setState);
    return off;
  }, []);

  useEffect(() => {
    if (state.status === "online") return;
    const t = window.setInterval(() => setNow((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [state.status]);

  if (state.status === "online") return null;

  const down = secondsSince(state.troubleSince);
  const offline = state.status === "offline";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="connection-banner"
      className={`flex items-start gap-2.5 px-3 sm:px-4 py-2.5 border-b text-xs ${
        offline
          ? "bg-red-50 border-red-200 text-red-800"
          : "bg-amber-50 border-amber-200 text-amber-800"
      }`}
    >
      {offline
        ? <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
        : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}

      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {offline
            ? "Cannot reach SiteMint."
            : "Trouble reaching SiteMint — trying again."}
        </p>
        <p className="mt-0.5">
          {offline
            ? "Anything you have typed is kept in this browser. Nothing has been saved, sent or changed while the connection is down."
            : "Your work is safe. Give it a moment."}
          {down > 5 && <span className="tabular-nums"> ({down}s)</span>}
        </p>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-current/30 px-2 py-1 font-medium hover:bg-white/50 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Reload
      </button>
    </div>
  );
}

export default ConnectionBanner;
