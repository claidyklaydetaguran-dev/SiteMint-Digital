// ── M4/M5: proposals, quotes, and what accepting one actually means ─────────
//
// The single rule this page exists to keep: accepting is NOT signing. It is
// stated before the button, in the button, and in the confirmation afterwards —
// not hidden in small print — because the difference matters the day somebody
// has to enforce the agreement.
//
// M5 adds quotes above the proposals. A proposal is a headline figure; a quote
// is the same offer broken into what it is made of, so the client can see what
// they are paying for line by line. They share one page because "what have you
// offered me" is one question.

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

interface QuoteLine {
  id: number; description: string; quantity: number; unitPrice: number; lineTotal: number;
}

interface Quote {
  id: number;
  reference: string;
  title: string;
  status: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  notes: string | null;
  validUntil: string | null;
  lineItems: QuoteLine[];
  canAccept: boolean;
  expired: boolean;
  acceptance: { acceptedAt: string; typedName: string | null; label: string } | null;
}

interface Payload {
  quotes?: Quote[];
  proposals: Proposal[];
  disclosure: string;
}

const money = (n: number, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
const roundMoney = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** One accept form, used by both a proposal and a quote. */
function AcceptForm({
  id, path, onDone,
}: { id: number | string; path: string; onDone: () => void }) {
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await portalFetch(path, { method: "POST", body: { typedName } });
      onDone();
    } catch (err) {
      setError(err instanceof PortalError ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-border pt-4" noValidate>
      <Label htmlFor={`name-${id}`}>Type your name to accept</Label>
      <Input
        id={`name-${id}`} className="mt-2 min-h-11" autoComplete="name"
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

function AcceptedNote({ label, typedName, acceptedAt }: {
  label: string; typedName: string | null; acceptedAt: string;
}) {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-md bg-teal-50 p-3 text-sm dark:bg-teal-950">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden />
      <span className="min-w-0">
        {/* The server's own wording, never "signed". */}
        {label}{typedName ? ` — ${typedName}` : ""}, {when(acceptedAt)}.
        <span className="block text-muted-foreground">
          Recorded as an agreement in writing, not as a signature.
        </span>
      </span>
    </p>
  );
}

/**
 * A quote's line items.
 *
 * The table is the one wide thing on this page, so it scrolls inside its own
 * container at 375px — the page body never scrolls sideways.
 */
function QuoteLines({ quote }: { quote: Quote }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm">
        <caption className="sr-only">What {quote.reference} is made up of</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Item</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Qty</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Each</th>
            <th scope="col" className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {quote.lineItems.map((line) => (
            <tr key={line.id} className="border-b border-border last:border-0">
              <td className="py-2 pr-3">{line.description}</td>
              <td className="whitespace-nowrap py-2 pr-3 text-right">{line.quantity}</td>
              <td className="whitespace-nowrap py-2 pr-3 text-right">{money(line.unitPrice, quote.currency)}</td>
              <td className="whitespace-nowrap py-2 text-right font-medium">{money(line.lineTotal, quote.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {quote.discountAmount > 0 && (
            <>
              <tr>
                <td colSpan={3} className="py-2 pr-3 text-right text-muted-foreground">Subtotal</td>
                <td className="whitespace-nowrap py-2 text-right">{money(quote.subtotal, quote.currency)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="py-2 pr-3 text-right text-muted-foreground">Discount</td>
                <td className="whitespace-nowrap py-2 text-right">−{money(quote.discountAmount, quote.currency)}</td>
              </tr>
            </>
          )}
          <tr>
            <td colSpan={3} className="py-2 pr-3 text-right font-medium">Total</td>
            <td className="whitespace-nowrap py-2 text-right text-base font-semibold">
              {money(quote.total, quote.currency)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function PortalProposals() {
  const { state, reload } = usePortalResource<Payload>("/api/portal/proposals");

  return (
    <PortalShell title="Quotes & proposals">
      {state.status === "loading" && <PortalLoadingState label="Loading your quotes…" />}
      {state.status === "error" && <PortalErrorState error={state.error} onRetry={reload} />}
      {state.status === "ready" && (() => {
        const quotes = state.data.quotes ?? [];
        const { proposals } = state.data;
        if (quotes.length === 0 && proposals.length === 0) {
          return (
            <PortalEmptyState
              title="Nothing to look at right now"
              detail="When we send you a quote or a proposal, it will appear here with its price."
            />
          );
        }
        return (
          <>
            <p className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
              <span className="min-w-0">{state.data.disclosure}</span>
            </p>

            {quotes.length > 0 && (
              <section aria-labelledby="quotes-heading">
                <h2 id="quotes-heading" className="text-sm font-semibold text-muted-foreground">
                  Quotes
                </h2>
                <ul className="mt-2 space-y-3">
                  {quotes.map((q) => (
                    <li key={q.id}>
                      <PortalCard>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="break-words font-medium">
                              <span className="text-muted-foreground">{q.reference}</span> {q.title}
                            </h3>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {q.validUntil
                                ? q.expired
                                  ? `Expired ${when(q.validUntil)}`
                                  : `Valid until ${when(q.validUntil)}`
                                : "No expiry date"}
                            </p>
                          </div>
                          <p className="shrink-0 text-lg font-semibold">{money(q.total, q.currency)}</p>
                        </div>

                        {q.lineItems.length > 0 && <QuoteLines quote={q} />}

                        {q.notes && (
                          <p className="mt-3 break-words text-sm text-muted-foreground">{q.notes}</p>
                        )}

                        {q.acceptance ? (
                          <AcceptedNote
                            label={q.acceptance.label}
                            typedName={q.acceptance.typedName}
                            acceptedAt={q.acceptance.acceptedAt}
                          />
                        ) : q.canAccept ? (
                          <AcceptForm id={`quote-${q.id}`} path={`/api/portal/quotes/${q.id}/accept`} onDone={reload} />
                        ) : (
                          <p className="mt-4 text-sm text-muted-foreground">
                            {q.expired
                              ? "This quote has passed its date. Ask your SiteMint contact for a fresh one."
                              : "This one is not open for acceptance. Your SiteMint contact can explain where it stands."}
                          </p>
                        )}
                      </PortalCard>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {proposals.length > 0 && (
              <section aria-labelledby="proposals-heading">
                <h2 id="proposals-heading" className="text-sm font-semibold text-muted-foreground">
                  Proposals
                </h2>
                <ul className="mt-2 space-y-3">
                  {proposals.map((p) => (
                    <li key={p.id}>
                      <PortalCard>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="break-words font-medium">{p.name}</h3>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {p.closeDate ? `Expected to start ${when(p.closeDate)}` : "No start date set yet"}
                            </p>
                          </div>
                          <p className="shrink-0 text-lg font-semibold">{roundMoney(p.value)}</p>
                        </div>

                        {p.acceptance ? (
                          <AcceptedNote
                            label={p.acceptance.label}
                            typedName={p.acceptance.typedName}
                            acceptedAt={p.acceptance.acceptedAt}
                          />
                        ) : p.canAccept ? (
                          <AcceptForm id={`proposal-${p.id}`} path={`/api/portal/proposals/${p.id}/accept`} onDone={reload} />
                        ) : (
                          <p className="mt-4 text-sm text-muted-foreground">
                            This one is not open for acceptance. Your SiteMint contact can explain where it stands.
                          </p>
                        )}
                      </PortalCard>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        );
      })()}
    </PortalShell>
  );
}
