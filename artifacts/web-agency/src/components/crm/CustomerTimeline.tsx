/**
 * One contact's whole history, in one list.
 *
 * The CRM showed this as four separate streams that could not see each other,
 * so "what has actually happened with this client" meant opening four screens
 * and doing the merge in your head. This is that merge.
 *
 * Three things it is careful about:
 *
 *  - Every entry says whether it is INTERNAL or something the customer has
 *    already seen. The "What the client can see" toggle is the customer
 *    projection, served by its own endpoint, so what it shows is what a
 *    customer portal would show — not this component hiding rows.
 *  - Older history loads with a cursor, not a page number. Nothing slides out
 *    of the record while you read it.
 *  - An entry whose author was never recorded says "Unattributed". It does not
 *    put somebody's name on work they may not have done.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Lock, Eye, RefreshCw, ChevronDown, Filter,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";

// ── Shape ─────────────────────────────────────────────────────────────────────

interface TimelineActor {
  kind: "staff" | "customer" | "system" | "unattributed";
  staffId?: number | null;
  label: string;
  note?: string | null;
}

interface TimelineEntry {
  id: string;
  occurredAt: string;
  source: string;
  kind: string;
  visibility: "internal" | "customer";
  summary: string;
  detail?: string | null;
  actor: TimelineActor;
  record?: { type: string; id: number; href: string };
  amount?: number | null;
}

interface StaffResponse {
  entries: TimelineEntry[];
  nextCursor: string | null;
  sources: { omitted: { source: string; needs: string }[]; note: string };
}

interface CustomerResponse {
  entries: TimelineEntry[];
  nextCursor: string | null;
  guarantee: { internalEntriesReturned: number };
}

const KINDS = [
  { key: "communication", label: "Messages" },
  { key: "note", label: "Notes" },
  { key: "meeting", label: "Meetings" },
  { key: "document", label: "Documents" },
  { key: "deal", label: "Deals" },
  { key: "project", label: "Projects" },
  { key: "payment", label: "Payments" },
  { key: "support", label: "Support" },
  { key: "task", label: "Tasks" },
] as const;

// Kind accents stay inside the ops teal/mint family, with amber and emerald
// carrying their usual semantic weight. No decorative hues.
const KIND_STYLE: Record<string, string> = {
  communication: "bg-teal-50 text-teal-700 border-teal-200",
  note: "bg-muted text-muted-foreground border-border",
  meeting: "bg-sky-50 text-sky-700 border-sky-200",
  document: "bg-cyan-50 text-cyan-700 border-cyan-200",
  deal: "bg-amber-50 text-amber-700 border-amber-200",
  project: "bg-teal-50 text-teal-700 border-teal-200",
  payment: "bg-emerald-50 text-emerald-700 border-emerald-200",
  support: "bg-amber-50 text-amber-700 border-amber-200",
  task: "bg-muted text-muted-foreground border-border",
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function ActorLine({ actor }: { actor: TimelineActor }) {
  if (actor.kind === "unattributed") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground italic"
        title={actor.note ?? "No author was recorded on this row."}
      >
        Unattributed
      </span>
    );
  }
  const prefix = actor.kind === "customer" ? "From" : actor.kind === "system" ? "By" : "By";
  return (
    <span className="text-[11px] text-muted-foreground" title={actor.note ?? undefined}>
      {prefix} {actor.label}
      {actor.note ? " *" : ""}
    </span>
  );
}

function EntryRow({ entry, showLinks }: { entry: TimelineEntry; showLinks: boolean }) {
  const style = KIND_STYLE[entry.kind] ?? "bg-muted text-muted-foreground border-border";
  return (
    <li className="flex flex-col sm:flex-row gap-2 sm:gap-3 py-3 border-b border-border last:border-b-0">
      <div className="sm:w-40 shrink-0 flex sm:flex-col items-center sm:items-start gap-2 sm:gap-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${style}`}>
          {entry.kind}
        </span>
        <span className="text-[11px] text-muted-foreground">{when(entry.occurredAt)}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {entry.visibility === "internal" ? (
            <Lock
              className="w-3 h-3 mt-1 shrink-0 text-muted-foreground"
              aria-label="Internal — never shown to the customer"
            />
          ) : (
            <Eye
              className="w-3 h-3 mt-1 shrink-0 text-teal-600"
              aria-label="The customer has seen this"
            />
          )}
          <p className="text-sm text-foreground break-words">{entry.summary}</p>
        </div>

        {entry.detail && entry.detail !== entry.summary && (
          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
            {entry.detail.length > 400 ? `${entry.detail.slice(0, 400)}…` : entry.detail}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <ActorLine actor={entry.actor} />
          {entry.amount != null && (
            <span className="text-[11px] font-medium text-emerald-700">{money(entry.amount)}</span>
          )}
          {showLinks && entry.record && (
            <a
              href={entry.record.href}
              className="text-[11px] text-teal-700 underline hover:no-underline"
            >
              Open {entry.record.type}
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CustomerTimeline({ leadId }: { leadId: number }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [omitted, setOmitted] = useState<{ source: string; needs: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [customerView, setCustomerView] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const path = useCallback((next: string | null) => {
    const params = new URLSearchParams({ limit: "40" });
    if (kinds.length) params.set("kind", kinds.join(","));
    if (next) params.set("cursor", next);
    const suffix = customerView ? "/customer" : "";
    return `/api/crm/history/${leadId}${suffix}?${params.toString()}`;
  }, [leadId, kinds, customerView]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(path(null));
      if (!res.ok) {
        setError(
          res.status === 403
            ? "You do not have permission to read this contact's history."
            : `Could not load the history (${res.status}).`,
        );
        setEntries([]);
        setCursor(null);
        return;
      }
      const data = await res.json() as StaffResponse & CustomerResponse;
      setEntries(data.entries ?? []);
      setCursor(data.nextCursor ?? null);
      setOmitted(data.sources?.omitted ?? []);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setEntries([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);

  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setError("");
    try {
      const res = await adminFetch(path(cursor));
      if (!res.ok) {
        setError(`Could not load older history (${res.status}).`);
        return;
      }
      const data = await res.json() as StaffResponse;
      // Appended, never merged by index: the cursor guarantees these are
      // strictly older than what is already on screen.
      setEntries((prev) => [...prev, ...(data.entries ?? [])]);
      setCursor(data.nextCursor ?? null);
    } catch {
      setError("Could not reach the server while loading older history.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, path]);

  const toggleKind = (key: string) =>
    setKinds((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  return (
    <div className="p-4 sm:p-5">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setCustomerView(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              !customerView ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Everything
          </button>
          <button
            onClick={() => setCustomerView(true)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              customerView ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            What the client can see
          </button>
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
        >
          <Filter className="w-3.5 h-3.5" />
          {kinds.length ? `${kinds.length} filter${kinds.length > 1 ? "s" : ""}` : "Filter"}
        </button>

        <button
          onClick={load}
          disabled={loading}
          className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => toggleKind(k.key)}
              className={`text-[11px] px-2 py-1 rounded-full border font-medium transition-colors ${
                kinds.includes(k.key)
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {k.label}
            </button>
          ))}
          {kinds.length > 0 && (
            <button
              onClick={() => setKinds([])}
              className="text-[11px] px-2 py-1 text-muted-foreground underline hover:no-underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {customerView && (
        <div className="mb-4 flex items-start gap-2 text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2.5">
          <Eye className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Exactly what a customer-facing view would show. Internal notes, deal
            values, loss reasons and staff-only support notes are excluded by the
            server, not hidden here.
          </span>
        </div>
      )}

      {/* ── Permission gaps ──────────────────────────────────────────────── */}
      {!customerView && omitted.length > 0 && (
        <div className="mb-4 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            This history is incomplete: your account cannot read{" "}
            {[...new Set(omitted.map((o) => o.needs))].join(", ")}. Anything
            behind those permissions is not shown.
          </span>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button onClick={load} className="text-xs font-medium underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* ── The history ──────────────────────────────────────────────────── */}
      {loading ? (
        <ul className="animate-pulse">
          {Array.from<unknown>({ length: 5 }).map((_, i) => (
            <li key={i} className="flex gap-3 py-3 border-b border-border last:border-b-0">
              <div className="w-40 shrink-0 space-y-1.5">
                <div className="h-3 w-16 bg-border rounded-full" />
                <div className="h-2.5 w-28 bg-muted rounded" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 bg-border rounded" />
                <div className="h-2.5 w-1/3 bg-muted rounded" />
              </div>
            </li>
          ))}
        </ul>
      ) : entries.length === 0 && !error ? (
        <p className="text-center text-muted-foreground text-sm py-10">
          {kinds.length
            ? "Nothing of that kind has happened with this contact yet."
            : customerView
              ? "Nothing has happened yet that a customer would have seen."
              : "No history recorded for this contact yet."}
        </p>
      ) : (
        <ul>
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} showLinks={!customerView} />
          ))}
        </ul>
      )}

      {/* ── Older ────────────────────────────────────────────────────────── */}
      {cursor && !loading && (
        <div className="pt-4 text-center">
          <button
            onClick={loadOlder}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-foreground border border-border rounded-lg hover:bg-muted disabled:opacity-50"
          >
            <ChevronDown className={`w-3.5 h-3.5 ${loadingMore ? "animate-bounce" : ""}`} />
            {loadingMore ? "Loading…" : "Load older history"}
          </button>
        </div>
      )}

      {!loading && !cursor && entries.length > 0 && (
        <p className="pt-4 text-center text-[11px] text-muted-foreground">
          That is the whole history — loaded with a cursor, so nothing was skipped.
        </p>
      )}
    </div>
  );
}
