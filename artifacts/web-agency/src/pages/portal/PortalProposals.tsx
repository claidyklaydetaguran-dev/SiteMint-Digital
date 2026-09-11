// ── M4: proposals, and what accepting one actually means ────────────────────
//
// The single rule this page exists to keep: accepting is NOT signing. It is
// stated before the button, in the button, and in the confirmation afterwards —
// not hidden in small print — because the difference matters the day somebody
// has to enforce the agreement.

import { useState } from "react";
import PortalShell, {
  PortalCard, PortalEmptyState, PortalErrorState, PortalLoadingState, usePortalResource,
} from "./PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Check, Info } from "lucide-react";
import { portalFetch, PortalError } from "./portalApi";

interface Proposal {
  id: number; name: string; value: number; stage: string; closeDate: string | null;
  canAccept: boolean;
  acceptance: { acceptedAt: string; typedName: string; label: string } | null;
}

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function AcceptForm({ proposal, onDone }: { proposal: Proposal; onDone: () => void }) {
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await portalFetch(`/api/portal/proposals/${proposal.id}/accept`, {
        method: "POST", body: { typedName },
      });
      onDone();
    } catch (err) {
      setError(err instanceof PortalError ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-border pt-4" noValidate>
      <Label htmlFor={`name-${proposal.id}`}>Type your name to accept</Label>
      <Input
        id={`name-${proposal.id}`} className="mt-2 min-h-11" autoComplete="name"
        value={typedName} required minLength={2}
        onChange={(e) => setTypedName(e.target.value)}
      />
      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 break-words">{error}</span>
        </p>
      )}
      <Button type="submit" className="mt-3 min-h-11 w-full sm:w-auto" disabled={busy || typedName.trim().length < 2}>
        {busy ? "Recording…" : "Record my acceptance"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        This records your agreement in writing. It is not an electronic signature
        and does not replace a signed contract.
      </p>
    </form>
  );
}

export default function PortalProposals() {
  const { state, reload } = usePortalResource<{ proposals: Proposal[]; disclosure: string }>("/api/portal/proposals");

  return (
    <PortalShell title="Proposals">
      {state.status === "loading" && <PortalLoadingState label="Loading your proposals…" />}
      {state.status === "error" && <PortalErrorState error={state.error} onRetry={reload} />}
      {state.status === "ready" && (
        state.data.proposals.length === 0 ? (
          <PortalEmptyState
            title="No proposals right now"
            detail="When we send you a proposal, it will appear here with its price."
          />
        ) : (
          <>
            <p className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
              <span className="min-w-0">{state.data.disclosure}</span>
            </p>

            <ul className="space-y-3">
              {state.data.proposals.map((p) => (
                <li key={p.id}>
                  <PortalCard>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="break-words font-medium">{p.name}</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {p.closeDate ? `Expected to start ${when(p.closeDate)}` : "No start date set yet"}
                        </p>
                      </div>
                      <p className="shrink-0 text-lg font-semibold">{money(p.value)}</p>
                    </div>

                    {p.acceptance ? (
                      <p className="mt-4 flex items-start gap-2 rounded-md bg-teal-50 p-3 text-sm dark:bg-teal-950">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden />
                        <span className="min-w-0">
                          {/* The server's own wording, never "signed". */}
                          {p.acceptance.label} — {p.acceptance.typedName}, {when(p.acceptance.acceptedAt)}.
                          <span className="block text-muted-foreground">
                            Recorded as an agreement in writing, not as a signature.
                          </span>
                        </span>
                      </p>
                    ) : p.canAccept ? (
                      <AcceptForm proposal={p} onDone={reload} />
                    ) : (
                      <p className="mt-4 text-sm text-muted-foreground">
                        This one is not open for acceptance. Your SiteMint contact can explain where it stands.
                      </p>
                    )}
                  </PortalCard>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </PortalShell>
  );
}
