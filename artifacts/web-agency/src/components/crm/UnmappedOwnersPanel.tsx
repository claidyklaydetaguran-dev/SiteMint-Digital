import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, RefreshCw, UserX, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminFetch } from "@/lib/adminFetch";

// ── M6: "Unmapped lead owners" ──────────────────────────────────────────────
//
// Contacts used to record their owner as typed text. Every name the matching
// rules could not turn into exactly one person is listed here with how many
// contacts carry it and why it was left alone — and somebody allowed to can say
// who it is. The server records each decision (who, when, which rule or by
// hand), and the most recent ones are listed under "Decisions so far".
//
// The rules themselves live on the server (lib/leadOwnerRules.ts). Nothing here
// matches names; it shows what the server decided and sends a person's choice.

export interface OwnerPerson {
  id: number;
  displayName: string;
  email: string;
  status: string;
}

type MatchRule = "display_name" | "legacy_name" | "email";

interface UnresolvedOwner {
  value: string;
  key: string;
  leads: number;
  reason: "no_match" | "ambiguous" | "matched_not_applied";
  rule: MatchRule | null;
  candidates: OwnerPerson[];
  explanation: string;
}

interface MappingRecord {
  id: number;
  value: string;
  staff: OwnerPerson;
  rule: MatchRule | "manual";
  leadsUpdated: number;
  legacyNameAdded: boolean;
  decidedByStaffId: number | null;
  decidedBy: string;
  createdAt: string;
}

interface Summary {
  unresolved: UnresolvedOwner[];
  resolvedLeads: number;
  unresolvedLeads: number;
  unassignedLeads: number;
  recentMappings: MappingRecord[];
  canMap: boolean;
  mapRequires: string;
  staff: OwnerPerson[];
}

export interface OwnerMapResult {
  mappingId: number;
  value: string;
  staff: OwnerPerson;
  rule: MatchRule | "manual";
  leadsUpdated: number;
  legacyNameAdded: boolean;
  future: { outcome: "resolves_to_them" | "still_ambiguous" | "resolves_to_someone_else"; note: string };
}

const REASON: Record<UnresolvedOwner["reason"], { label: string; cls: string }> = {
  no_match: { label: "Matches nobody", cls: "bg-amber-100 text-amber-800" },
  ambiguous: { label: "More than one person", cls: "bg-orange-100 text-orange-800" },
  matched_not_applied: { label: "Matches one person — not applied yet", cls: "bg-teal-100 text-teal-800" },
};

const DECIDED_BY_RULE: Record<MappingRecord["rule"], string> = {
  display_name: "matched their display name",
  legacy_name: "matched a legacy name on their account",
  email: "matched their email address",
  manual: "chosen by hand",
};

/** A person's name, with enough added to tell two of them apart. */
function personLabel(p: OwnerPerson, everyone: OwnerPerson[]): string {
  const namesake = everyone.filter(o => o.displayName === p.displayName).length > 1;
  const tags = [namesake ? p.email : "", p.status !== "active" ? p.status : ""].filter(Boolean);
  return tags.length ? `${p.displayName} (${tags.join(", ")})` : p.displayName;
}

/**
 * Say who an owner name belongs to. Shared by this panel and the import
 * preview, so a name is mapped the same way — and recorded the same way —
 * wherever somebody meets it.
 */
export function OwnerMapControl({ value, people, suggested = [], onMapped, idSuffix }: {
  value: string;
  /** Everyone the name may be mapped to. */
  people: OwnerPerson[];
  /** The people the rules point at, offered first. */
  suggested?: OwnerPerson[];
  onMapped: (result: OwnerMapResult) => void;
  /** Distinguishes this control's form ids from its neighbours'. */
  idSuffix: string;
}) {
  const [choice, setChoice] = useState(suggested.length === 1 ? String(suggested[0].id) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const suggestedIds = useMemo(() => new Set(suggested.map(p => p.id)), [suggested]);
  const others = people.filter(p => !suggestedIds.has(p.id));
  const everyone = useMemo(() => [...suggested, ...others], [suggested, others]);

  async function save() {
    if (!choice) return;
    setSaving(true);
    setError("");
    try {
      const r = await adminFetch("/api/crm/lead-assignment/map", {
        method: "POST",
        body: JSON.stringify({ value, staffId: Number(choice) }),
      });
      const d = await r.json().catch(() => ({})) as Partial<OwnerMapResult> & { error?: string };
      if (!r.ok) {
        setError(d.error ?? (r.status === 401
          ? "Sign in with your own account to map a name — the decision is recorded against a person."
          : "That mapping could not be saved. Nothing was changed."));
        return;
      }
      onMapped(d as OwnerMapResult);
    } catch {
      setError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  }

  const selectId = `owner-map-${idSuffix}`;
  return (
    <div className="min-w-0">
      <label htmlFor={selectId} className="sr-only">Who “{value}” is</label>
      <div className="flex flex-col sm:flex-row gap-2 min-w-0">
        <select
          id={selectId}
          value={choice}
          onChange={e => setChoice(e.target.value)}
          className="w-full sm:w-auto sm:flex-1 min-w-0 px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none"
        >
          <option value="">Choose who this is…</option>
          {suggested.length > 0 && (
            <optgroup label={suggested.length === 1 ? "Matches" : "Could be"}>
              {suggested.map(p => <option key={p.id} value={String(p.id)}>{personLabel(p, everyone)}</option>)}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label={suggested.length > 0 ? "Somebody else" : "Staff"}>
              {others.map(p => <option key={p.id} value={String(p.id)}>{personLabel(p, everyone)}</option>)}
            </optgroup>
          )}
        </select>
        <Button size="sm" onClick={() => void save()} disabled={!choice || saving} className="shrink-0">
          {saving ? "Saving…" : "Map this name"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5 break-words">{error}</p>}
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg border px-2.5 py-2 ${warn ? "border-amber-200 bg-amber-50" : "border-border bg-muted/40"}`}>
      <dd className={`text-lg font-bold tabular-nums ${warn ? "text-amber-800" : "text-foreground"}`}>{value}</dd>
      <dt className="text-[11px] leading-tight text-muted-foreground break-words">{label}</dt>
    </div>
  );
}

export function UnmappedOwnersPanel() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; detail: string } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch("/api/crm/lead-assignment/unresolved");
      if (r.status === 401) return;
      if (r.status === 403) {
        setData(null);
        setError("You do not have permission to see who contacts belong to.");
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json() as Summary);
      setError("");
    } catch {
      setError("Couldn't load the owner names waiting for a decision. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // A contact's "map it for every contact" link lands here.
  useEffect(() => {
    if (!loading && window.location.hash === "#unmapped-owners") {
      sectionRef.current?.scrollIntoView({ block: "start" });
    }
  }, [loading]);

  function mapped(result: OwnerMapResult) {
    setNotice({
      // Named with the email when two people share the display name: the whole
      // decision was WHICH of them, so the confirmation must say.
      text: `“${result.value}” is ${personLabel(result.staff, data?.staff ?? [])}: ${result.leadsUpdated} contact${result.leadsUpdated === 1 ? "" : "s"} updated.`,
      detail: result.future.note,
    });
    void load();
  }

  return (
    <section id="unmapped-owners" ref={sectionRef} className="bg-white rounded-xl border border-border p-4 sm:p-5 min-w-0 scroll-mt-4">
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <UserX className="w-4 h-4 text-muted-foreground shrink-0" /> Unmapped lead owners
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Contacts once recorded their owner as typed text. Each name below does not belong to exactly one
            person, so nobody was assumed. Say who it is, and every contact carrying it follows — the decision
            is recorded with your name.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh the list"
          className="shrink-0 w-11 h-11 [@media(hover:hover)]:w-8 [@media(hover:hover)]:h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !data && !error && <p className="text-xs text-muted-foreground mt-4">Loading…</p>}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p className="min-w-0 break-words">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="underline font-medium">Try again</button>
          </p>
        </div>
      )}

      {data && (
        <>
          <dl className="grid grid-cols-3 gap-2 mt-4">
            <Stat label="Belong to a person" value={data.resolvedLeads} />
            {/* Unresolved covers two reasons — a name matching nobody, and a name
                matching more than one person — so the label names neither. */}
            <Stat label="Carry a name not yet tied to one person" value={data.unresolvedLeads} warn={data.unresolvedLeads > 0} />
            <Stat label="No owner recorded" value={data.unassignedLeads} />
          </dl>

          {notice && (
            <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <p className="font-semibold break-words">{notice.text}</p>
              <p className="mt-0.5 break-words">{notice.detail}</p>
            </div>
          )}

          {data.unresolved.length === 0 ? (
            <p className="mt-4 text-sm text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              Every recorded owner name belongs to a person.
            </p>
          ) : (
            <>
              {!data.canMap && (
                <p className="mt-4 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 break-words">
                  You can see these names but not map them. Mapping needs {data.mapRequires.charAt(0).toLowerCase()}{data.mapRequires.slice(1)}
                </p>
              )}
              <ul className="mt-4 divide-y divide-border/60 border border-border rounded-lg">
                {data.unresolved.map((u, i) => (
                  <li key={u.key} className="p-3 sm:p-4 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground break-all">“{u.value}”</span>
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${REASON[u.reason].cls}`}>
                        {REASON[u.reason].label}
                      </span>
                      <Link href="/admin/crm/leads" className="text-xs text-muted-foreground hover:text-foreground">
                        {u.leads} contact{u.leads === 1 ? "" : "s"}
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">{u.explanation}</p>
                    {u.candidates.length > 1 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`People “${u.value}” could be`}>
                        {u.candidates.map(c => (
                          <li key={c.id} className="text-[11px] rounded-full border border-border bg-muted px-2 py-0.5 text-foreground break-all">
                            {personLabel(c, u.candidates)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {data.canMap && (
                      <div className="mt-2.5">
                        <OwnerMapControl
                          value={u.value}
                          people={data.staff}
                          suggested={u.candidates}
                          onMapped={mapped}
                          idSuffix={String(i)}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <details className="mt-4">
            <summary className="text-xs font-semibold text-foreground cursor-pointer select-none">
              Decisions so far ({data.recentMappings.length === 25 ? "latest 25" : data.recentMappings.length})
            </summary>
            {data.recentMappings.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-2">No owner name has been mapped yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.recentMappings.map(m => (
                  <li key={m.id} className="text-xs text-foreground rounded-lg border border-border px-3 py-2 min-w-0">
                    <p className="break-words">
                      <span className="font-semibold">“{m.value}”</span> → {personLabel(m.staff, data.staff)}
                    </p>
                    <p className="text-muted-foreground mt-0.5 break-words">
                      {DECIDED_BY_RULE[m.rule]} · by {m.decidedBy} · {new Date(m.createdAt).toLocaleString()} ·{" "}
                      {m.leadsUpdated} contact{m.leadsUpdated === 1 ? "" : "s"}
                      {m.legacyNameAdded ? " · name recorded on their account" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </>
      )}
    </section>
  );
}
