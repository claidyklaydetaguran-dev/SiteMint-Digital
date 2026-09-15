// ── M4: documents, both directions ──────────────────────────────────────────
//
// What we have shared with the client, and what we have asked them for. The
// upload answers a specific request rather than being a general file drop, so
// the file always arrives attached to the thing somebody was chasing.
//
// Nothing here calls anything "signed". A file is a file.

import { useRef, useState } from "react";
import PortalShell, {
  PortalCard, PortalEmptyState, PortalErrorState, PortalLoadingState, usePortalResource,
} from "./PortalShell";
import { Button } from "@/components/ui/button";
import { Download, FileUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { portalFetch, PortalError } from "./portalApi";

interface Doc {
  id: number; filename: string; mimeType: string; sizeBytes: number;
  createdAt: string; from: "You" | "SiteMint";
}
interface Request {
  id: number; title: string; description: string | null;
  status: string; dueDate: string | null; overdue: boolean;
}

/** 64 KiB — the server's cap, which is itself bounded by the JSON body limit. */
const MAX_BYTES = 64 * 1024;

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function UploadRow({ request, onDone }: { request: Request; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(file: File) {
    setError("");
    if (file.size > MAX_BYTES) {
      setError(`That file is ${size(file.size)}. The limit is ${size(MAX_BYTES)} — email it to us instead.`);
      return;
    }
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const view = new Uint8Array(buffer);
      for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
      await portalFetch("/api/portal/documents", {
        method: "POST",
        body: {
          documentRequestId: request.id,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: btoa(binary),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof PortalError ? err.message : "The upload did not go through.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <PortalCard className={request.overdue ? "border-destructive/40" : ""}>
      <div className="min-w-0">
        <p className="break-words font-medium">{request.title}</p>
        {request.description && (
          <p className="mt-1 break-words text-sm text-muted-foreground">{request.description}</p>
        )}
        {request.dueDate && (
          <p className={`mt-1 text-sm ${request.overdue ? "text-destructive" : "text-muted-foreground"}`}>
            {request.overdue ? "Was due " : "Due "}{when(request.dueDate)}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 break-words">{error}</span>
        </p>
      )}

      {/* The real input is hidden behind a full-width 44px button — a bare
          file input is unusable with a thumb and unstyleable besides. */}
      <input
        ref={input} type="file" className="sr-only"
        id={`upload-${request.id}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); }}
      />
      <Button
        className="mt-3 min-h-11 w-full sm:w-auto"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <FileUp className="mr-2 h-4 w-4" aria-hidden />
        {busy ? "Sending…" : "Choose a file"}
      </Button>
    </PortalCard>
  );
}

export default function PortalDocuments() {
  const { state, reload } = usePortalResource<{ documents: Doc[]; requests: Request[] }>("/api/portal/documents");

  return (
    <PortalShell title="Documents">
      {state.status === "loading" && <PortalLoadingState label="Loading your documents…" />}
      {state.status === "error" && <PortalErrorState error={state.error} onRetry={reload} />}
      {state.status === "ready" && (
        <>
          <section aria-labelledby="requested">
            <h2 id="requested" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              What we need from you
            </h2>
            <div className="mt-3 space-y-3">
              {state.data.requests.filter((r) => r.status === "pending").length === 0 ? (
                <PortalCard className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                  <p className="text-sm text-muted-foreground">Nothing outstanding. We will ask here if we need something.</p>
                </PortalCard>
              ) : (
                state.data.requests
                  .filter((r) => r.status === "pending")
                  .map((r) => <UploadRow key={r.id} request={r} onDone={reload} />)
              )}
            </div>
          </section>

          <section aria-labelledby="shared" className="pt-2">
            <h2 id="shared" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Your files
            </h2>
            <div className="mt-3">
              {state.data.documents.length === 0 ? (
                <PortalEmptyState
                  title="No documents yet"
                  detail="Anything we share with you, and anything you send us, appears here."
                />
              ) : (
                <ul className="space-y-3">
                  {state.data.documents.map((d) => (
                    <li key={d.id}>
                      <PortalCard className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-all font-medium">{d.filename}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {d.from === "You" ? "Sent by you" : "From SiteMint"} · {size(d.sizeBytes)} · {when(d.createdAt)}
                          </p>
                        </div>
                        {/* A plain link, so the browser's own download handling
                            applies and the response's Content-Disposition is
                            what decides the filename. */}
                        <Button asChild variant="outline" className="min-h-11 w-full shrink-0 sm:w-auto">
                          <a href={`/api/portal/documents/${d.id}/download`}>
                            <Download className="mr-2 h-4 w-4" aria-hidden /> Download
                          </a>
                        </Button>
                      </PortalCard>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </PortalShell>
  );
}
