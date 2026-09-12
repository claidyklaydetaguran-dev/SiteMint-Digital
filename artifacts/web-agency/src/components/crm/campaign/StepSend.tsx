import { useState } from "react";
import {
  AlertCircle, AlertTriangle, CalendarClock, CheckCircle2, Clock, Loader2, Send, Users,
} from "lucide-react";
import {
  COMMON_TIMEZONES, btnGhost, btnPrimary, browserTimezone, cardClass, formatWhen,
  inputClass, zonedInputToIso,
  type Campaign, type MarketingSettings, type Preflight,
} from "./shared";

// ── Step 4: send it, or say when ─────────────────────────────────────────────
//
// One decision and one button. Everything above the button is the set of facts
// somebody would otherwise have to remember from three screens ago: who it goes
// to, who it does not, who it comes from, what it says, which version, and —
// the one that is normally missing — what time, in whose clock.
//
// And after it is scheduled, the screen says whether anything will actually
// start it. A plain "Scheduled ✓" on a server with automatic sending switched
// off is a lie that is only discovered the morning after it was supposed to go.

interface Props {
  campaign: Campaign;
  preflight: Preflight | null;
  settings: MarketingSettings | null;
  audienceLabel: string;
  busy: string | null;
  error: string | null;
  progress: { sent: number; failed: number; remaining: number } | null;
  readOnly?: boolean;
  onSendNow: () => void;
  onSchedule: (isoWhen: string, timezone: string) => void;
  onUnschedule: () => void;
}

export default function StepSend(props: Props) {
  const {
    campaign, preflight, settings, audienceLabel, busy, error, progress,
    onSendNow, onSchedule, onUnschedule,
  } = props;

  const [mode, setMode] = useState<"now" | "later">(campaign.scheduledAt ? "later" : "now");
  const [when, setWhen] = useState("");
  const [timezone, setTimezone] = useState(campaign.scheduledTimezone ?? browserTimezone());
  const [confirming, setConfirming] = useState(false);

  const autosend = settings?.autosend.enabled === true;
  const canSend = preflight?.canSend === true;
  const sendable = preflight?.sendable ?? 0;
  const iso = mode === "later" ? zonedInputToIso(when, timezone) : null;

  const zones = [...new Set([browserTimezone(), ...COMMON_TIMEZONES])];

  const scheduled = campaign.status === "scheduled";
  const finished = campaign.status === "sent" || campaign.status === "cancelled";

  return (
    <div className="space-y-4">
      {/* ══ The facts ══ */}
      <div className={cardClass}>
        <dl className="divide-y divide-border">
          <Row label="Goes to">
            <span className="font-semibold text-foreground">
              {sendable} {sendable === 1 ? "person" : "people"}
            </span>
            <span className="text-muted-foreground"> — {audienceLabel}</span>
          </Row>
          <Row label="Left out">
            {(preflight?.excluded ?? 0) === 0
              ? <span className="text-muted-foreground">Nobody</span>
              : (
                <span className="text-foreground">
                  {preflight?.excluded} {preflight?.excluded === 1 ? "person" : "people"}
                  <span className="text-muted-foreground">
                    {" — "}
                    {(preflight?.excludedByReason ?? []).map((b) => `${b.count} ${b.label.split(" — ")[0].toLowerCase()}`).join(", ")}
                  </span>
                </span>
              )}
          </Row>
          <Row label="From">
            <span className="text-foreground break-words">{settings?.sender.address ?? "—"}</span>
            {settings && !settings.delivery.configured && (
              <span className="block text-xs text-amber-800 mt-0.5">{settings.delivery.operatorNote}</span>
            )}
          </Row>
          <Row label="Subject">
            <span className="text-foreground break-words">{campaign.subject || <span className="text-muted-foreground">No subject yet</span>}</span>
          </Row>
          <Row label="Version">
            <span className="text-muted-foreground">
              Last edited {formatWhen(campaign.updatedAt)}
              {campaign.updatedByLabel ? ` by ${campaign.updatedByLabel}` : ""}
              {campaign.aiContentState === "approved" ? ` · AI copy approved by ${campaign.aiApprovedByLabel ?? "staff"}` : ""}
            </span>
          </Row>
        </dl>
      </div>

      {/* ══ Already scheduled ══ */}
      {scheduled && (
        <div className={`rounded-xl border p-3.5 ${autosend ? "border-teal-200 bg-teal-50" : "border-amber-300 bg-amber-50"}`}>
          <p className="text-sm font-semibold text-foreground flex items-start gap-2">
            {autosend
              ? <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />}
            Scheduled for {formatWhen(campaign.scheduledAt, campaign.scheduledTimezone)}
            {campaign.scheduledTimezone ? ` (${campaign.scheduledTimezone})` : ""}
          </p>
          <p className="text-sm text-foreground/80 mt-1.5">
            {autosend
              ? "It will start on its own at that time. The audience is checked again at that moment, so anybody who unsubscribes between now and then is left out."
              : "Nothing on this server will start it. At that time somebody has to open this campaign and press Send — the time is a reminder and a record of intent, not an alarm clock."}
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {!autosend && (
              <button type="button" className={btnPrimary} disabled={!!busy || !canSend} onClick={() => setConfirming(true)}>
                {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send it now
              </button>
            )}
            <button type="button" className={btnGhost} disabled={!!busy} onClick={onUnschedule}>
              Put it back to a draft
            </button>
          </div>
        </div>
      )}

      {/* ══ The decision ══ */}
      {!scheduled && !finished && (
        <div className={`${cardClass} p-3.5 space-y-3`}>
          <div className="flex flex-col sm:flex-row gap-2">
            {([["now", "Send it now", Send], ["later", "Schedule it", CalendarClock]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border text-sm font-semibold min-h-[48px] ${
                  mode === id ? "border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600/30" : "border-border bg-card text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          {mode === "later" && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-xs font-semibold text-foreground mb-1">Date and time</span>
                  <input type="datetime-local" className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-foreground mb-1">In which timezone</span>
                  <select className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                </label>
              </div>
              {iso && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0 mt-px" />
                  {formatWhen(iso, timezone)} in {timezone} — which is {formatWhen(iso, "UTC")} UTC,
                  and {formatWhen(iso)} on your own clock.
                </p>
              )}
              {!autosend && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Worth knowing before you pick a time: nothing on this server starts a scheduled
                  campaign by itself. Somebody will have to come back and press Send.
                </p>
              )}
            </div>
          )}

          {!canSend && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-800">This cannot go out yet.</p>
              <ul className="mt-1 space-y-1">
                {(preflight?.blockers ?? []).map((b, i) => (
                  <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            className={`${btnPrimary} w-full sm:w-auto`}
            disabled={!!busy || !canSend || (mode === "later" && !iso)}
            onClick={() => (mode === "now" ? setConfirming(true) : iso && onSchedule(iso, timezone))}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "now" ? <Send className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
            {mode === "now"
              ? `Send to ${sendable} ${sendable === 1 ? "person" : "people"} now`
              : "Schedule this campaign"}
          </button>
        </div>
      )}

      {/* ══ Confirmation — the one irreversible step ══ */}
      {confirming && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
          <p className="text-sm font-semibold text-red-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            This sends to {sendable} {sendable === 1 ? "person" : "people"} now.
          </p>
          <p className="text-sm text-red-900/80 mt-1">
            Once a message is handed to the mail provider it is in somebody's inbox. Pausing stops
            what has not gone yet; it cannot recall what has.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-50 min-h-[44px]"
              disabled={!!busy}
              onClick={() => { setConfirming(false); onSendNow(); }}
            >
              <Send className="w-4 h-4" /> Yes, send it
            </button>
            <button type="button" className={btnGhost} onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </div>
        </div>
      )}

      {/* ══ Progress ══ */}
      {progress && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3.5">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-700" />
            {progress.sent} sent{progress.failed > 0 ? `, ${progress.failed} failed` : ""}
            {progress.remaining > 0 ? `, ${progress.remaining} still to go` : ""}
          </p>
          {progress.remaining > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">Still working through the list. You can pause it from the campaign list.</p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {finished && (
        <p className="text-sm text-muted-foreground">
          This campaign is {campaign.status === "sent" ? "finished" : "cancelled"} and cannot be sent again.
          Duplicate it from the list if you want to send something like it.
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
      <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wide sm:w-28 shrink-0">{label}</dt>
      <dd className="text-sm min-w-0 flex-1">{children}</dd>
    </div>
  );
}
