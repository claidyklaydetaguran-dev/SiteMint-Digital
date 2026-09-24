// ── M4: the client's support requests ───────────────────────────────────────
//
// The list, one request's thread, and a form to raise a new one — all in one
// route so a phone never has to load a second page to read a reply.
//
// What is NOT here: internal notes. They are not filtered out on this side;
// the server never sends them, and never counts them either.

import { useState } from "react";
import PortalShell, {
  PortalCard, PortalEmptyState, PortalErrorState, PortalLoadingState, usePortalResource,
} from "./PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ChevronLeft, Plus } from "lucide-react";
import { portalFetch, PortalError } from "./portalApi";

interface Ticket {
  id: number; reference: string; subject: string; description: string | null;
  status: string; priority: string; requestType: string | null;
  resolution: string | null; createdAt: string; lastUpdateAt: string;
  messageCount?: number;
}
interface Message {
  id: number; body: string; from: "You" | "SiteMint"; author: string | null; createdAt: string;
}

const REQUEST_TYPES: Array<[string, string]> = [
  ["content_change", "Change some content"],
  ["bug_report", "Something is broken"],
  ["new_feature", "Ask for something new"],
  ["hosting_or_domain", "Hosting or domain"],
  ["billing_question", "A billing question"],
  ["training_or_how_to", "How do I…?"],
  ["access_request", "Access for someone"],
  ["other", "Something else"],
];

const STATUS_WORDS: Record<string, string> = {
  new: "Received",
  open: "Being worked on",
  waiting_on_customer: "Waiting on you",
  resolved: "Resolved",
  closed: "Closed",
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// ── One thread ──────────────────────────────────────────────────────────────

function Thread({ id, onBack }: { id: number; onBack: () => void }) {
  const { state, reload } = usePortalResource<{ ticket: Ticket; messages: Message[] }>(
    `/api/portal/tickets/${id}`,
  );
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await portalFetch(`/api/portal/tickets/${id}/messages`, { method: "POST", body: { body } });
      setBody("");
      reload();
    } catch (err) {
      setError(err instanceof PortalError ? err.message : "Your message did not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" className="min-h-11 -ml-3" onClick={onBack}>
        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> All requests
      </Button>

      {state.status === "loading" && <PortalLoadingState label="Loading the conversation…" />}
      {state.status === "error" && <PortalErrorState error={state.error} onRetry={reload} />}
      {state.status === "ready" && (
        <>
          <PortalCard>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {state.data.ticket.reference}
            </p>
            <h2 className="mt-1 break-words text-lg font-medium">{state.data.ticket.subject}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {STATUS_WORDS[state.data.ticket.status] ?? state.data.ticket.status}
              {state.data.ticket.resolution ? ` · ${state.data.ticket.resolution.replace(/_/g, " ")}` : ""}
            </p>
          </PortalCard>

          <ul className="space-y-3">
            {state.data.messages.map((m) => (
              <li key={m.id}>
                <PortalCard className={m.from === "You" ? "border-teal-200 dark:border-teal-900" : ""}>
                  <p className="text-sm font-medium">
                    {m.from === "You" ? "You" : m.author ?? "SiteMint"}
                    <span className="ml-2 font-normal text-muted-foreground">{when(m.createdAt)}</span>
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{m.body}</p>
                </PortalCard>
              </li>
            ))}
          </ul>

          <PortalCard>
            <form onSubmit={reply} noValidate>
              <Label htmlFor="reply">Add to this request</Label>
              <textarea
                id="reply" rows={4} value={body} required
                onChange={(e) => setBody(e.target.value)}
                className="mt-2 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {error && (
                <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  <span className="min-w-0 break-words">{error}</span>
                </p>
              )}
              <Button type="submit" className="mt-3 min-h-11 w-full sm:w-auto" disabled={busy || body.trim().length === 0}>
                {busy ? "Sending…" : "Send"}
              </Button>
            </form>
          </PortalCard>
        </>
      )}
    </>
  );
}

// ── Raise a new one ─────────────────────────────────────────────────────────

function NewRequest({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [requestType, setRequestType] = useState("content_change");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await portalFetch("/api/portal/tickets", { method: "POST", body: { subject, body, requestType } });
      onDone();
    } catch (err) {
      setError(err instanceof PortalError ? err.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalCard>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="req-type">What is this about?</Label>
          <select
            id="req-type" value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {REQUEST_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="req-subject">Short title</Label>
          <Input
            id="req-subject" className="min-h-11" value={subject} required minLength={3}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="req-body">Tell us what you need</Label>
          <textarea
            id="req-body" rows={5} value={body} required
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {error && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span className="min-w-0 break-words">{error}</span>
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="min-h-11 sm:w-auto" disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </Button>
          <Button type="button" variant="outline" className="min-h-11 sm:w-auto" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </PortalCard>
  );
}

// ── The page ────────────────────────────────────────────────────────────────

export default function PortalSupport() {
  const { state, reload } = usePortalResource<{ tickets: Ticket[] }>("/api/portal/tickets");
  const [open, setOpen] = useState<number | null>(null);
  const [raising, setRaising] = useState(false);

  if (open !== null) {
    return (
      <PortalShell title="Support">
        <Thread id={open} onBack={() => { setOpen(null); reload(); }} />
      </PortalShell>
    );
  }

  return (
    <PortalShell title="Support">
      {raising ? (
        <NewRequest onDone={() => { setRaising(false); reload(); }} onCancel={() => setRaising(false)} />
      ) : (
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => setRaising(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden /> Raise a request
        </Button>
      )}

      {state.status === "loading" && <PortalLoadingState label="Loading your requests…" />}
      {state.status === "error" && <PortalErrorState error={state.error} onRetry={reload} />}
      {state.status === "ready" && (
        state.data.tickets.length === 0 ? (
          <PortalEmptyState
            title="No requests yet"
            detail="Anything you ask us for appears here, with our replies."
          />
        ) : (
          <ul className="space-y-3">
            {state.data.tickets.map((t) => (
              <li key={t.id}>
                {/* The whole card is the target — a 44px-plus tap area rather
                    than a small link somewhere inside it. */}
                <button
                  type="button"
                  onClick={() => setOpen(t.id)}
                  className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-teal-400 sm:p-5"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t.reference}
                      </p>
                      <p className="mt-0.5 break-words font-medium">{t.subject}</p>
                    </div>
                    <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                      {STATUS_WORDS[t.status] ?? t.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Last update {when(t.lastUpdateAt)}
                    {typeof t.messageCount === "number" ? ` · ${t.messageCount} message${t.messageCount === 1 ? "" : "s"}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </PortalShell>
  );
}
