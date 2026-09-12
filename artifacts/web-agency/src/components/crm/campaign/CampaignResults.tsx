import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { btnGhost, btnQuiet, call, cardClass, failureText, formatWhen, type Campaign, type Results } from "./shared";

// ── What actually happened ───────────────────────────────────────────────────
//
// Every number here is derived from the rows beneath it, and the two things
// this panel refuses to do are the two things marketing screens normally do:
// it does not report an open rate it has no evidence for, and it does not show
// a total with no way to see the people inside it.

interface Props {
  campaign: Campaign;
  onClose: () => void;
}

/**
 * The provider's failure, said in words an operator can act on.
 *
 * The stored error is `<class>: <provider wording>` and the provider's half
 * often names an environment variable. That is administrator detail: somebody
 * reading a results screen needs to know whether to re-send, fix an address, or
 * call whoever runs the server. The raw text is not thrown away — it is one
 * click below.
 */
function plainFailure(lastError: string | null | undefined): string {
  const raw = (lastError ?? "").trim();
  if (!raw) return "The mail provider refused it and gave no reason.";
  if (raw.startsWith("not_configured")) {
    return "This server is not set up to send mail, so the message was never handed to a provider. Nothing reached this person, and nothing was lost — the campaign can be duplicated and sent once mail is configured.";
  }
  if (raw.startsWith("rejected")) return "The mail provider refused this address.";
  if (raw.startsWith("uncertain")) return "The provider never answered, so whether this one arrived is genuinely unknown.";
  if (raw.startsWith("failed")) return "The message could not be handed to the mail provider.";
  return raw;
}

export default function CampaignResults({ campaign, onClose }: Props) {
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [showFailures, setShowFailures] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await call<Results>(`/api/crm/marketing/campaigns/${campaign.id}/results`);
    setLoading(false);
    if (!r.ok) { setError(failureText(r, "These results could not be loaded.")); return; }
    setResults(r.data);
  }, [campaign.id]);

  useEffect(() => { void load(); }, [load]);

  const failed = (results?.recipients ?? []).filter((r) => r.status === "failed");

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={onClose} className={`${btnQuiet} -ml-2.5`}>
          <ArrowLeft className="w-4 h-4" /> All campaigns
        </button>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mt-1">{campaign.name}</h2>
        <p className="text-sm text-muted-foreground">
          {campaign.status === "sent" ? "Finished" : campaign.status === "cancelled" ? "Cancelled" : "In progress"}
          {campaign.completedAt ? ` · ${formatWhen(campaign.completedAt)}` : ""}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
          <p className="text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </p>
          <button type="button" className={`${btnGhost} mt-2`} onClick={() => void load()}>
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {loading && !results && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading results…
        </p>
      )}

      {results && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Delivered to", results.counts.sent],
              ["Failed", results.counts.failed],
              ["Left out", results.counts.excluded],
              ["Never attempted", results.counts.neverAttempted],
            ].map(([label, n]) => (
              <div key={String(label)} className={`${cardClass} p-3`}>
                <p className="text-2xl font-bold text-foreground">{n as number}</p>
                <p className="text-xs text-muted-foreground">{label as string}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{results.deliverySignal.meaning}</p>

          {failed.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50">
              <button
                type="button"
                onClick={() => setShowFailures((v) => !v)}
                aria-expanded={showFailures}
                className="w-full flex items-center gap-2 px-3.5 py-3 text-left min-h-[48px]"
              >
                <ChevronDown className={`w-3.5 h-3.5 text-red-700 transition-transform ${showFailures ? "rotate-180" : ""}`} />
                <span className="text-sm font-semibold text-red-900">
                  {failed.length} {failed.length === 1 ? "message" : "messages"} the provider refused
                </span>
              </button>
              {showFailures && (
                <div className="px-3.5 pb-3">
                  <ul className="space-y-1.5">
                    {failed.map((r) => (
                      <li key={r.id} className="text-xs text-red-900/90">
                        <span className="font-medium">{r.name}</span> — {r.address ?? "no address"}
                        <span className="block text-red-900/70">{plainFailure(r.lastError)}</span>
                        {showRaw && r.lastError && (
                          <span className="block text-red-900/60 font-mono break-words mt-0.5">{r.lastError}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    aria-expanded={showRaw}
                    className="mt-2 text-xs font-semibold text-red-900 underline min-h-[32px]"
                  >
                    {showRaw ? "Hide" : "Show"} the provider's own wording
                  </button>
                </div>
              )}
            </div>
          )}

          {results.excludedByReason.length > 0 && (
            <div className={cardClass}>
              <p className="px-3.5 py-3 text-sm font-semibold text-foreground border-b border-border">
                Who was left out, and why
              </p>
              <ul className="divide-y divide-border">
                {results.excludedByReason.map((bucket) => (
                  <li key={bucket.reason}>
                    <button
                      type="button"
                      onClick={() => setOpenReason(openReason === bucket.reason ? null : bucket.reason)}
                      aria-expanded={openReason === bucket.reason}
                      className="w-full flex items-start gap-2 px-3.5 py-2.5 text-left min-h-[44px]"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground transition-transform ${
                        openReason === bucket.reason ? "rotate-180" : ""
                      }`} />
                      <span className="text-sm text-foreground">
                        <strong>{bucket.count}</strong> — {bucket.label}
                      </span>
                    </button>
                    {openReason === bucket.reason && (
                      <ul className="px-3.5 pb-2.5 space-y-1">
                        {bucket.contacts.map((c) => (
                          <li key={c.id ?? c.leadId} className="text-xs text-muted-foreground">
                            {c.name}{c.email ? ` — ${c.email}` : ""}
                            {c.detail && <span className="block">{c.detail}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/40 p-3.5">
            <p className="text-sm font-semibold text-foreground">Opens and clicks</p>
            <p className="text-xs text-muted-foreground mt-0.5">{results.engagement.why}</p>
          </div>
        </>
      )}
    </div>
  );
}
