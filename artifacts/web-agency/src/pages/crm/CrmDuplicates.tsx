import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Copy, RefreshCw, XCircle, CheckCircle2, AlertTriangle, ShieldCheck,
  Users, ArrowRight, Info, Upload,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { failureReason, responseFailureReason } from "@/lib/adminLoad";

// ── Types ────────────────────────────────────────────────────────────────────

interface Side {
  id: number; name: string; email: string; phone: string | null;
  company: string | null; status: string; createdAt: string; activityCount: number;
}

interface Candidate {
  signal: "email" | "name_phone";
  matchedOn: string;
  confidence: "strong" | "weak";
  a: Side;
  b: Side;
}

interface Scan {
  candidates: Candidate[];
  counts: { pairs: number; strong: number; weak: number; dismissed: number; merged: number };
  signals: Record<string, string>;
}

interface MoveResult {
  table: string; describe: string; historyCritical: boolean;
  moved: number; leftBehind: number; note: string | null;
}

interface MergeOutcome {
  moves: MoveResult[];
  conflicts: { field: string; kept: unknown; discardedFromMerged: unknown; chosen: string }[];
  fieldsFilled: Record<string, { from: unknown }>;
  survivor: { id: number; name: string };
  guarantee: { history: string; retention: string; conflicts: string; leftBehind: { table: string; rows: number; why: string }[] };
}

/** Fields the operator can see on both sides and therefore judge. */
const COMPARABLE: Array<{ key: keyof Side; label: string }> = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "status", label: "Status" },
];

function pairKey(c: Candidate): string { return `${c.a.id}:${c.b.id}`; }

function shown(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function CrmDuplicates() {
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  /** pairKey → which side survives. */
  const [keep, setKeep] = useState<Record<string, "a" | "b">>({});
  /** pairKey → field → which side's value wins. */
  const [choices, setChoices] = useState<Record<string, Record<string, "primary" | "duplicate">>>({});
  const [outcome, setOutcome] = useState<MergeOutcome | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await adminFetch("/api/crm/contacts/duplicates?limit=200");
      if (res.status === 401) return;
      // The refusal is worded by the shared helper, so a 403 names the grant
      // the account is missing rather than guessing at "review contacts".
      if (!res.ok) { setLoadError(await responseFailureReason(res)); return; }
      setScan(await res.json() as Scan);
    } catch {
      setLoadError(failureReason(null));
    } finally {
      // The 401 `return` above used to skip this, so a signed-out session left
      // the page on "Scanning the contact book…" for ever.
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const survivorOf = (c: Candidate) => (keep[pairKey(c)] ?? "a") === "a" ? c.a : c.b;
  const mergedOf = (c: Candidate) => (keep[pairKey(c)] ?? "a") === "a" ? c.b : c.a;

  const setChoice = (c: Candidate, field: string, side: "primary" | "duplicate") => {
    const k = pairKey(c);
    setChoices(prev => ({ ...prev, [k]: { ...(prev[k] ?? {}), [field]: side } }));
  };

  const dismiss = async (c: Candidate) => {
    setBusy(pairKey(c)); setActionError("");
    try {
      const res = await adminFetch("/api/crm/contacts/duplicates/dismiss", {
        method: "POST",
        body: JSON.stringify({ leadIdA: c.a.id, leadIdB: c.b.id, signal: c.signal }),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "That could not be recorded.");
      }
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That could not be recorded.");
    }
    setBusy(null);
  };

  const merge = async (c: Candidate) => {
    const primary = survivorOf(c);
    const duplicate = mergedOf(c);
    setBusy(pairKey(c)); setActionError("");
    try {
      const res = await adminFetch("/api/crm/contacts/duplicates/merge", {
        method: "POST",
        body: JSON.stringify({
          primaryId: primary.id, duplicateId: duplicate.id, signal: c.signal,
          fieldChoices: choices[pairKey(c)] ?? {},
        }),
      });
      if (res.status === 401) return;
      const data = await res.json() as MergeOutcome & { error?: string; survivor?: { id: number; name: string } };
      if (!res.ok) throw new Error(data.error ?? "The merge could not be completed.");
      setOutcome({ ...data, survivor: data.survivor ?? { id: primary.id, name: primary.name } });
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "The merge could not be completed.");
    }
    setBusy(null);
  };

  const candidates = scan?.candidates ?? [];

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Duplicate review</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Contacts that look like the same person. Merging keeps both histories and deletes nothing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void load()} disabled={loading}
              className="flex items-center gap-1.5 text-sm border border-border bg-background hover:bg-accent px-3.5 py-2 rounded-lg transition-colors font-medium text-muted-foreground disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Rescan
            </button>
            <Link href="/admin/crm/import">
              <button className="flex items-center gap-1.5 text-sm border border-border bg-background hover:bg-accent px-3.5 py-2 rounded-lg transition-colors font-medium text-muted-foreground whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
            </Link>
          </div>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" /> {loadError}
          </div>
        )}
        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" /> {actionError}
          </div>
        )}

        {/* What just happened */}
        {outcome && (
          <div className="bg-background rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-border/60 bg-emerald-50 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <h2 className="font-semibold text-emerald-900">
                Merged into {outcome.survivor.name}
              </h2>
            </div>
            <div className="p-4 sm:p-5 space-y-3 text-sm">
              <div className="grid sm:grid-cols-2 gap-2">
                {outcome.moves.filter(m => m.moved > 0).map(m => (
                  <div key={m.table} className="border border-border rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-foreground">
                      {m.moved} × {m.table}
                      {m.historyCritical && <span className="ml-1.5 text-[10px] text-teal-800 bg-teal-100 px-1.5 py-0.5 rounded-full">history</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{m.describe}</p>
                  </div>
                ))}
              </div>
              {outcome.conflicts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-900 mb-1">Values that disagreed — nothing was thrown away:</p>
                  {outcome.conflicts.map(c => (
                    <p key={c.field} className="text-xs text-amber-900">
                      {c.field}: kept <strong>{shown(c.kept)}</strong>, recorded <strong>{shown(c.discardedFromMerged)}</strong> in the contact's notes.
                    </p>
                  ))}
                </div>
              )}
              {outcome.guarantee.leftBehind.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-900 mb-1">Rows that stayed on the merged contact:</p>
                  {outcome.guarantee.leftBehind.map(l => (
                    <p key={l.table} className="text-xs text-amber-900">{l.rows} × {l.table} — {l.why}</p>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{outcome.guarantee.retention}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/admin/crm/leads/${outcome.survivor.id}`}>
                  <button className="flex items-center gap-1.5 text-sm bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors font-medium">
                    <Users className="w-3.5 h-3.5" /> Open the contact
                  </button>
                </Link>
                <button onClick={() => setOutcome(null)}
                  className="text-sm border border-border bg-background text-muted-foreground px-4 py-2 rounded-lg hover:bg-accent transition-colors font-medium">
                  Dismiss this summary
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Counts */}
        {scan && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              ["Pairs to review", scan.counts.pairs, "border-border"],
              ["Strong (email)", scan.counts.strong, "border-teal-200 bg-teal-50"],
              ["Weak (name + phone)", scan.counts.weak, "border-amber-200 bg-amber-50"],
              ["Already dismissed", scan.counts.dismissed, "border-border"],
            ] as const).map(([label, n, cls]) => (
              <div key={label} className={`rounded-xl border px-3 py-3 text-center bg-background ${cls}`}>
                <p className="text-2xl font-bold text-foreground">{n}</p>
                <p className="text-[11px] font-medium text-muted-foreground mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        )}

        {loading && !scan && (
          <div className="bg-background rounded-xl border border-border px-5 py-10 text-center text-sm text-muted-foreground">
            Scanning the contact book…
          </div>
        )}

        {scan && candidates.length === 0 && !loading && (
          <div className="bg-background rounded-xl border border-border px-5 py-10 text-center">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
            <p className="font-semibold text-foreground">No duplicates to review</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Nothing matches on email, and nothing matches on both name and phone number.
              {scan.counts.dismissed > 0 && ` ${scan.counts.dismissed} pair(s) you have already judged are not offered again.`}
            </p>
          </div>
        )}

        {/* Pairs */}
        {candidates.map(c => {
          const k = pairKey(c);
          const survivor = survivorOf(c);
          const merged = mergedOf(c);
          const working = busy === k;
          return (
            <div key={k} className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
              {/* Signal */}
              <div className={`px-4 sm:px-5 py-3 border-b border-border/60 flex items-start gap-2 ${c.confidence === "strong" ? "bg-teal-50" : "bg-amber-50"}`}>
                {c.confidence === "strong"
                  ? <Copy className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${c.confidence === "strong" ? "text-teal-900" : "text-amber-900"}`}>
                    {c.signal === "email" ? "Same email address" : "Same name and phone number"}
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-background/70">
                      {c.confidence}
                    </span>
                  </p>
                  <p className={`text-xs mt-0.5 break-all ${c.confidence === "strong" ? "text-teal-800" : "text-amber-800"}`}>
                    Matched on <code className="bg-background/70 px-1 py-0.5 rounded">{c.matchedOn}</code>
                    {c.confidence === "weak" && " — colleagues share a switchboard and strangers share names, so check this one before merging."}
                  </p>
                </div>
              </div>

              {/* Which one survives */}
              <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
                {([c.a, c.b] as Side[]).map((side, idx) => {
                  const isSurvivor = survivor.id === side.id;
                  return (
                    <label key={side.id}
                      className={`p-4 sm:p-5 cursor-pointer transition-colors ${isSurvivor ? "bg-teal-50/60" : "hover:bg-accent"}`}>
                      <div className="flex items-start gap-2.5">
                        <input
                          type="radio"
                          name={`keep-${k}`}
                          checked={isSurvivor}
                          onChange={() => setKeep(prev => ({ ...prev, [k]: idx === 0 ? "a" : "b" }))}
                          className="mt-1 accent-teal-600 w-4 h-4 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground text-sm truncate">{side.name}</p>
                          <p className="text-xs text-muted-foreground">
                            #{side.id} · created {new Date(side.createdAt).toLocaleDateString()} · {side.activityCount} timeline entr{side.activityCount === 1 ? "y" : "ies"}
                          </p>
                          <dl className="mt-2 space-y-1">
                            {COMPARABLE.map(f => (
                              <div key={f.key} className="flex gap-2 text-xs">
                                <dt className="text-muted-foreground w-16 shrink-0">{f.label}</dt>
                                <dd className="text-foreground break-all">{shown(side[f.key])}</dd>
                              </div>
                            ))}
                          </dl>
                          <p className={`mt-2 text-[11px] font-semibold ${isSurvivor ? "text-teal-800" : "text-muted-foreground"}`}>
                            {isSurvivor ? "Keeps its record · absorbs the other side" : "Merged in · its row is retained, not deleted"}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Field conflicts */}
              {(() => {
                const conflicts = COMPARABLE.filter(f => {
                  const mine = survivor[f.key]; const theirs = merged[f.key];
                  return theirs != null && String(theirs) !== "" && String(mine ?? "") !== String(theirs);
                });
                if (conflicts.length === 0) return null;
                return (
                  <div className="px-4 sm:px-5 py-3 border-t border-border/60 bg-muted/40">
                    <p className="text-xs font-semibold text-foreground mb-2 flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      These two disagree. The kept contact wins unless you say otherwise — either way, the other value is recorded in the notes, never dropped.
                    </p>
                    <div className="space-y-2">
                      {conflicts.map(f => {
                        const chosen = choices[k]?.[f.key as string] ?? "primary";
                        return (
                          <div key={f.key} className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">{f.label}</span>
                            <div className="flex flex-wrap gap-2">
                              {([
                                ["primary", survivor[f.key], "Keep"],
                                ["duplicate", merged[f.key], "Use"],
                              ] as const).map(([side, value, verb]) => (
                                <button
                                  key={side}
                                  onClick={() => setChoice(c, f.key as string, side)}
                                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors max-w-[220px] truncate ${
                                    chosen === side
                                      ? "bg-teal-600 text-white border-teal-600"
                                      : "bg-background text-foreground border-border hover:bg-accent"
                                  }`}
                                >
                                  {verb} “{shown(value)}”
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="px-4 sm:px-5 py-4 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-foreground">#{merged.id}</span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="font-medium text-foreground">#{survivor.id}</span>
                  <span>· every note, message, task, deal, payment, meeting, ticket and document moves across.</span>
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void dismiss(c)}
                    disabled={working}
                    className="text-sm border border-border bg-background text-muted-foreground px-4 py-2.5 rounded-lg hover:bg-accent transition-colors font-medium disabled:opacity-50"
                  >
                    Not a duplicate
                  </button>
                  <button
                    onClick={() => void merge(c)}
                    disabled={working}
                    className="flex items-center gap-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg transition-colors font-medium"
                  >
                    {working
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Merging…</>
                      : <>Merge into #{survivor.id}</>}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* How the signals are defined, from the server rather than from memory */}
        {scan && (
          <div className="bg-background rounded-xl border border-border shadow-sm px-4 sm:px-5 py-4 space-y-2">
            <h2 className="font-semibold text-foreground text-sm">How a pair gets here</h2>
            {Object.entries(scan.signals).map(([name, definition]) => (
              <p key={name} className="text-xs text-muted-foreground">
                <code className="text-foreground bg-muted px-1 py-0.5 rounded">{name}</code> — {definition}
              </p>
            ))}
          </div>
        )}

      </div>
    </CrmLayout>
  );
}
