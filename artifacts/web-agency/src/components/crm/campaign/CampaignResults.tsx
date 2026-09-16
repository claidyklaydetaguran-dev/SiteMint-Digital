import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import {
  btnGhost, btnQuiet, call, cardClass, failureText, formatWhen, postJson,
  type Campaign, type Results,
} from "./shared";
import { deliveryReport, engagementView, failureGroups, resultTiles, retryableCount } from "./resultsView";

// ── What actually happened ───────────────────────────────────────────────────
//
// Every number here is derived from the rows beneath it, and the two things
// this panel refuses to do are the two things marketing screens normally do:
// it does not report an open rate it has no evidence for, and it does not show
// a total with no way to see the people inside it.
//
// And one thing it adds: it never folds "the provider never answered" into
// "it did not arrive". Those are different facts with opposite next steps —
// one may safely be tried again, the other may already be in somebody's inbox.

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
    return "This server is not set up to send mail, so the message was never handed to a provider. Nothing reached this person. Once mail is configured it can be tried again from here.";
  }
  if (raw.startsWith("rejected")) return "The mail provider refused this message. Check the address before trying again, or it will be refused the same way.";
  if (raw.startsWith("uncertain")) return "The mail provider did not confirm this one — it never answered, or answered with an error after receiving it — so whether it arrived is genuinely unknown. Ask them before sending it again.";
  if (raw.startsWith("failed")) return "The connection to the mail provider never opened, so the message was never handed over and did not arrive.";
  return raw;
}

interface RetryAnswer {
  campaign?: Campaign;
  attempted: number;
  sent: number;
  notDelivered?: number;
  unconfirmed?: number;
  nextAfterId: number;
  finished: boolean;
  stoppedBecause: string | null;
  unconfirmedLeftOut?: number;
}

export default function CampaignResults({ campaign, onClose }: Props) {
  const [results, setResults] = useState<Results | null>(null);
  const [status, setStatus] = useState(campaign.status);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [showRaw, setShowRaw] = useState(false);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryNote, setRetryNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await call<Results & { campaign?: Campaign }>(`/api/crm/marketing/campaigns/${campaign.id}/results`);
    setLoading(false);
    if (!r.ok) { setError(failureText(r, "These results could not be loaded.")); return; }
    setResults(r.data);
    if (r.data.campaign?.status) setStatus(r.data.campaign.status);
  }, [campaign.id]);

  useEffect(() => { void load(); }, [load]);

  /**
   * One pass of "try again". Each call carries on after the last person it
   * tried, so somebody refused a second time is not tried a third time in this
   * pass. It stops when the server says it is finished, or refuses.
   */
  const retry = async () => {
    setConfirmRetry(false);
    setRetrying(true);
    setRetryNote(null);
    let afterId = 0;
    let attempted = 0, sent = 0, notDelivered = 0, unconfirmed = 0, leftOut = 0;
    let stopped: string | null = null;
    for (let i = 0; i < 100; i += 1) {
      const r = await call<RetryAnswer>(
        `/api/crm/marketing/campaigns/${campaign.id}/retry`, postJson({ afterId, batchSize: 25 }),
      );
      if (!r.ok) { stopped = failureText(r, "Trying again could not be started."); break; }
      attempted += r.data.attempted;
      sent += r.data.sent;
      notDelivered += r.data.notDelivered ?? 0;
      unconfirmed += r.data.unconfirmed ?? 0;
      leftOut = r.data.unconfirmedLeftOut ?? leftOut;
      if (r.data.campaign?.status) setStatus(r.data.campaign.status);
      if (r.data.stoppedBecause) { stopped = r.data.stoppedBecause; break; }
      if (r.data.finished || r.data.nextAfterId === afterId) break;
      afterId = r.data.nextAfterId;
    }
    setRetrying(false);

    const outcome = attempted === 0
      ? "There was nobody left to try again."
      : `${sent} of ${attempted} ${attempted === 1 ? "was" : "were"} accepted this time.`
        + (notDelivered > 0 ? ` ${notDelivered} ${notDelivered === 1 ? "was" : "were"} refused or not taken again.` : "")
        + (unconfirmed > 0 ? ` ${unconfirmed} got no answer and may have arrived.` : "");
    const skipped = leftOut > 0 ? ` ${leftOut} whose outcome was already unknown ${leftOut === 1 ? "was" : "were"} left out.` : "";
    setRetryNote(stopped
      ? { ok: false, text: `${stopped}${attempted > 0 ? ` Before it stopped: ${outcome}` : ""}` }
      : { ok: true, text: `${outcome}${skipped}` });
    await load();
  };

  const tiles = results ? resultTiles(results) : [];
  const groups = results ? failureGroups(results) : [];
  const retryable = results ? retryableCount(results) : 0;
  const unknownCount = groups.filter((g) => g.arrived === "unknown").reduce((s, g) => s + g.people.length, 0);
  const canRetry = retryable > 0 && (status === "sent" || status === "sending");
  const engagement = results ? engagementView(results.engagement) : null;
  // Only the delivery states that actually occurred; a row of zeroes would
  // read as a measurement of nothing.
  const report = results ? deliveryReport(results) : [];

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={onClose} className={`${btnQuiet} -ml-2.5`}>
          <ArrowLeft className="w-4 h-4" /> All campaigns
        </button>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mt-1 break-words">{campaign.name}</h2>
        <p className="text-sm text-muted-foreground">
          {status === "sent" ? "Finished" : status === "cancelled" ? "Cancelled" : "In progress"}
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

      {results && engagement && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {tiles.map((t) => (
              <div key={t.key} className={`${cardClass} p-3 min-w-0`}>
                <p className="text-2xl font-bold text-foreground">{t.value}</p>
                <p className="text-xs font-semibold text-foreground break-words">{t.label}</p>
                <p className="text-[11px] text-muted-foreground break-words mt-0.5">{t.hint}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{results.deliverySignal.meaning}</p>

          {/* The one outcome that must never read as "it did not arrive". */}
          {unknownCount > 0 && results.deliverySignal.unconfirmedNote && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5">
              <p className="text-sm font-semibold text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="min-w-0">
                  {unknownCount} {unknownCount === 1 ? "message" : "messages"} may or may not have arrived
                </span>
              </p>
              <p className="text-xs text-amber-900/80 mt-1">{results.deliverySignal.unconfirmedNote}</p>
            </div>
          )}

          {groups.map((g) => {
            const open = !closedGroups[g.key];
            const unknown = g.arrived === "unknown";
            return (
              <div key={g.key} className={`rounded-xl border ${unknown ? "border-amber-300 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                <button
                  type="button"
                  onClick={() => setClosedGroups((c) => ({ ...c, [g.key]: open }))}
                  aria-expanded={open}
                  className="w-full flex items-center gap-2 px-3.5 py-3 text-left min-h-[48px]"
                >
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${unknown ? "text-amber-800" : "text-red-700"} ${open ? "rotate-180" : ""}`} />
                  <span className={`text-sm font-semibold min-w-0 break-words ${unknown ? "text-amber-900" : "text-red-900"}`}>
                    {g.people.length} — {g.label}
                  </span>
                </button>
                {open && (
                  <ul className="px-3.5 pb-3 space-y-1.5">
                    {g.people.map((p) => (
                      <li key={p.id} className={`text-xs min-w-0 break-words ${unknown ? "text-amber-900/90" : "text-red-900/90"}`}>
                        <span className="font-medium">{p.name}</span> — {p.address ?? "no address"}
                        <span className="block opacity-80">{plainFailure(p.lastError)}</span>
                        {showRaw && p.lastError && (
                          <span className="block opacity-70 font-mono break-words mt-0.5">{p.lastError}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {groups.length > 0 && (
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              aria-expanded={showRaw}
              className="text-xs font-semibold text-muted-foreground underline min-h-[32px]"
            >
              {showRaw ? "Hide" : "Show"} the provider's own wording
            </button>
          )}

          {/* ══ Try again — only for what provably never arrived ══ */}
          {canRetry && (
            <div className={`${cardClass} p-3.5`}>
              <p className="text-sm font-semibold text-foreground">
                Try again for the {retryable} not delivered
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The mail provider refused these or never took them. Each is tried once more, under the same
                key as the first attempt, so the provider can recognise a repeat.
                {unknownCount > 0 ? ` The ${unknownCount} whose outcome is unknown are left out — ask them whether it arrived first.` : ""}
                {" "}Fix the cause of a refusal first, such as a wrong address, or it will be refused the same way.
              </p>
              {!confirmRetry ? (
                <button type="button" className={`${btnGhost} mt-2`} disabled={retrying} onClick={() => setConfirmRetry(true)}>
                  {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Try again
                </button>
              ) : (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-900">
                    This sends to {retryable} {retryable === 1 ? "person" : "people"} now.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-50 min-h-[44px]"
                      disabled={retrying}
                      onClick={() => void retry()}
                    >
                      Yes, try again
                    </button>
                    <button type="button" className={btnGhost} onClick={() => setConfirmRetry(false)}>
                      Not yet
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {retryNote && (
            <p className={`text-sm flex items-start gap-2 ${retryNote.ok ? "text-emerald-800" : "text-red-700"}`}>
              {retryNote.ok
                ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span className="min-w-0">{retryNote.text}</span>
            </p>
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
                      <span className="text-sm text-foreground min-w-0 break-words">
                        <strong>{bucket.count}</strong> — {bucket.label}
                      </span>
                    </button>
                    {openReason === bucket.reason && (
                      <ul className="px-3.5 pb-2.5 space-y-1">
                        {bucket.contacts.map((c) => (
                          <li key={c.id ?? c.leadId} className="text-xs text-muted-foreground break-words">
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

          {/* ══ What the provider reported about the messages it accepted ══ */}
          {report.length > 0 && (
            <div className={`${cardClass} p-3.5`}>
              <p className="text-sm font-semibold text-foreground">Delivery reports</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                From the mail provider itself, about the messages it accepted.
              </p>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {report.map((row) => (
                  <div key={row.key} className="min-w-0">
                    <dt className={`text-xs ${row.attention ? "text-red-700" : "text-muted-foreground"} break-words`}>
                      {row.label}
                    </dt>
                    <dd className={`text-sm font-semibold ${row.attention ? "text-red-800" : "text-foreground"}`}>
                      {row.count}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {results.deliverySignal.providerNote && (
            <p className="text-xs text-muted-foreground">{results.deliverySignal.providerNote}</p>
          )}

          {/* ══ Opens and clicks — said as unmeasured, never as zero ══ */}
          <div className="rounded-xl border border-border bg-muted/40 p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Opens and clicks</p>
              <span className="text-xs font-semibold text-muted-foreground">{engagement.headline}</span>
            </div>
            <dl className="grid grid-cols-2 gap-2 mt-2">
              {engagement.figures.map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="text-sm font-semibold text-foreground">{f.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground mt-1.5">{engagement.detail}</p>
            {results.engagement.why && results.engagement.why !== engagement.detail && (
              <p className="text-xs text-muted-foreground mt-1">{results.engagement.why}</p>
            )}

            {(results.engagement.clickedLinks?.length ?? 0) > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-foreground">Links people clicked</p>
                <ul className="mt-1 space-y-1">
                  {results.engagement.clickedLinks!.map((link) => (
                    <li key={link.url} className="text-xs text-muted-foreground min-w-0 break-words">
                      <span className="font-semibold text-foreground">{link.recipients}</span>
                      {link.recipients === 1 ? " person · " : " people · "}
                      {link.clicks} {link.clicks === 1 ? "click" : "clicks"} — {link.url}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
