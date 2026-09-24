/**
 * Reporting.
 *
 * The previous version of this page computed its own numbers in the browser
 * from four endpoints that could not say what they meant. "Win Rate 0%" sat
 * next to "Won / (Won + Lost)" whether the denominator was forty deals or
 * none, and "Total Msgs" was whatever the last two hundred rows happened to
 * contain. A figure with no definition and no denominator is decoration.
 *
 * Every number here now comes from `/api/crm/reports/summary`, which returns
 * each figure with:
 *
 *   - what it means,
 *   - what it is a share OF,
 *   - which of your filters it could and could not honour,
 *   - and a link to the exact rows it counted.
 *
 * Three rules are visible in the UI on purpose, because they are the reason to
 * trust it: a rate over an empty denominator shows "no rate yet" rather than
 * 0%; a figure nothing is measuring shows "Not tracked" with the reason; and
 * the timezone days were counted in is stated at the top rather than assumed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CrmLayout } from "./CrmLayout";
import {
  AlertTriangle, RefreshCw, Info, ChevronDown, ChevronRight, Ban, Clock,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";

// ── Shape ─────────────────────────────────────────────────────────────────────

interface Figure {
  key: string;
  area: string;
  label: string;
  unit: "count" | "currency" | "percent" | "days" | "minutes";
  available: boolean;
  value: number | null;
  definition: string;
  denominator: { label: string; value: number | null } | null;
  sources: string[];
  honoursFilters: string[];
  ignoredFilters: string[];
  traceable: boolean;
  detail: string | null;
  limitations: string[];
  unavailableReason?: string;
  wouldRequire?: string;
}

interface Summary {
  window: { from: string; to: string; timezone: string; definition: string };
  filters: { ownerStaffId: number | null; source: string | null; stage: string | null; status: string | null; note: string };
  areas: Record<string, Figure[]>;
  unavailable: { key: string; label: string; reason: string; wouldRequire: string | null }[];
  contract: Record<string, string>;
}

interface DetailRow {
  id: number; occurredAt: string | null; label: string; amount: number | null; href: string | null;
}

interface DetailResponse {
  key: string; label: string; definition: string;
  value: number | null; count: number; sum: number | null; median: number | null;
  rows: DetailRow[]; truncated: boolean; guarantee: string;
}

const AREA_ORDER = ["acquisition", "sales", "revenue", "operations", "support", "campaigns", "communications"] as const;
const AREA_LABEL: Record<string, string> = {
  acquisition: "Acquisition",
  sales: "Sales",
  revenue: "Revenue",
  operations: "Operations",
  support: "Support",
  campaigns: "Campaigns",
  communications: "Communications",
};

// A short list of common zones, plus whatever the server reports back, so the
// owner can ask "what did last Tuesday look like where the client is".
const TIMEZONES = ["UTC", "Asia/Manila", "America/New_York", "America/Los_Angeles", "Europe/London", "Australia/Sydney"];

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

const RANGE_PRESETS = [
  { key: "7d", label: "7 days", from: () => isoDay(-6) },
  { key: "30d", label: "30 days", from: () => isoDay(-29) },
  { key: "90d", label: "90 days", from: () => isoDay(-89) },
  { key: "365d", label: "12 months", from: () => isoDay(-364) },
] as const;

function formatValue(f: Figure): string {
  if (!f.available) return "Not tracked";
  if (f.value === null) return "No rate yet";
  switch (f.unit) {
    case "currency":
      return `$${f.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "percent": return `${f.value}%`;
    case "days": return `${f.value} d`;
    case "minutes": return `${f.value} min`;
    default: return f.value.toLocaleString();
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Evidence({ figure }: { figure: Figure }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchRows = useCallback(async () => {
    if (!figure.detail) return;
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(figure.detail);
      if (!res.ok) { setError(`Could not load the rows behind this figure (${res.status}).`); return; }
      setRows(await res.json() as DetailResponse);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [figure.detail]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !rows && !loading) void fetchRows();
  };

  if (!figure.detail) return null;

  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {open ? "Hide the rows behind this" : "Show the rows behind this"}
      </button>

      {open && (
        <div className="mt-2 border border-border rounded-lg overflow-hidden">
          {error && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
              <button onClick={fetchRows} className="font-medium underline hover:no-underline">Retry</button>
            </div>
          )}
          {loading && <p className="px-3 py-3 text-xs text-muted-foreground">Loading the evidence…</p>}
          {rows && (
            <>
              <p className="px-3 py-2 text-[11px] text-muted-foreground bg-muted border-b border-border">
                {rows.count} row{rows.count === 1 ? "" : "s"} · {rows.guarantee}
              </p>
              {rows.rows.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">Nothing matched. The figure is zero because there is nothing here, not because nothing was measured.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {rows.rows.map((r) => (
                        <tr key={`${rows.key}-${r.id}`} className="border-b border-border last:border-b-0">
                          <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                            {r.occurredAt ? new Date(r.occurredAt).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-foreground">
                            {r.href
                              ? <a href={r.href} className="text-teal-700 hover:underline">{r.label || `#${r.id}`}</a>
                              : (r.label || `#${r.id}`)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-foreground whitespace-nowrap">
                            {r.amount != null ? r.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FigureCard({ figure }: { figure: Figure }) {
  const [why, setWhy] = useState(false);
  const noRate = figure.available && figure.value === null;

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground font-medium">{figure.label}</p>
          <p className={`mt-1 leading-tight font-bold ${
            figure.available && !noRate ? "text-2xl text-foreground" : "text-base text-muted-foreground"
          }`}>
            {formatValue(figure)}
          </p>
          {figure.denominator && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              out of {figure.denominator.value ?? "—"} · {figure.denominator.label}
            </p>
          )}
        </div>
        {!figure.available && <Ban className="w-4 h-4 text-amber-500 shrink-0" aria-label="Not tracked" />}
      </div>

      <button
        onClick={() => setWhy((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Info className="w-3 h-3" />
        {why ? "Hide definition" : "What does this mean?"}
      </button>

      {why && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{figure.definition}</p>

          {!figure.available && figure.unavailableReason && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
              <p className="font-medium mb-0.5">Why there is no number here</p>
              <p>{figure.unavailableReason}</p>
              {figure.wouldRequire && (
                <p className="mt-1"><span className="font-medium">To measure it:</span> {figure.wouldRequire}</p>
              )}
            </div>
          )}

          {figure.limitations.length > 0 && (
            <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
              {figure.limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}

          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium">Counted from:</span> {figure.sources.join("; ")}
          </p>

          {figure.ignoredFilters.length > 0 && (
            <p className="text-[11px] text-amber-800">
              This figure cannot use: {figure.ignoredFilters.join(", ")}.
            </p>
          )}
        </div>
      )}

      <Evidence figure={figure} />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-4 animate-pulse">
      <div className="h-2.5 w-24 bg-border rounded mb-2" />
      <div className="h-7 w-16 bg-border rounded mb-2" />
      <div className="h-2 w-32 bg-muted rounded" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CrmReporting() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [from, setFrom] = useState(() => isoDay(-29));
  const [to, setTo] = useState(() => isoDay(0));
  const [timezone, setTimezone] = useState("UTC");
  const [source, setSource] = useState("");
  const [stage, setStage] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams({ from, to, timezone });
    if (source) p.set("source", source);
    if (stage) p.set("stage", stage);
    return p.toString();
  }, [from, to, timezone, source, stage]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(`/api/crm/reports/summary?${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(
          res.status === 403
            ? "You do not have permission to read reports."
            : body.error ?? `Could not load reporting (${res.status}).`,
        );
        setSummary(null);
        return;
      }
      setSummary(await res.json() as Summary);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (preset: typeof RANGE_PRESETS[number]) => {
    setFrom(preset.from());
    setTo(isoDay(0));
  };

  return (
    <CrmLayout>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-5 py-5">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Reporting</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Every figure carries its definition, its denominator, and the rows behind it.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-4 mb-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    from === p.from() ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">From</span>
              <input
                type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-input rounded-lg bg-white text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">To</span>
              <input
                type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-input rounded-lg bg-white text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Days counted in</span>
              <select
                value={timezone} onChange={(e) => setTimezone(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-input rounded-lg bg-white text-foreground"
              >
                {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Contact source</span>
              <input
                type="text" value={source} onChange={(e) => setSource(e.target.value)}
                placeholder="Any" spellCheck={false}
                className="px-2.5 py-1.5 text-xs border border-input rounded-lg bg-white text-foreground w-32"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Deal stage</span>
              <input
                type="text" value={stage} onChange={(e) => setStage(e.target.value)}
                placeholder="Any" spellCheck={false}
                className="px-2.5 py-1.5 text-xs border border-input rounded-lg bg-white text-foreground w-32"
              />
            </label>
          </div>

          {summary && (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3 shrink-0 mt-0.5" />
              <span>{summary.window.definition}</span>
            </p>
          )}
        </div>

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <button onClick={load} className="text-xs font-medium underline hover:no-underline">
              Retry
            </button>
          </div>
        )}

        {/* ── Figures ──────────────────────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from<unknown>({ length: 9 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {!loading && summary && AREA_ORDER.map((area) => {
          const figures = summary.areas[area] ?? [];
          if (figures.length === 0) return null;
          return (
            <section key={area} className="mb-6">
              <h2 className="text-sm font-semibold text-foreground mb-2">{AREA_LABEL[area] ?? area}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {figures.map((f) => <FigureCard key={f.key} figure={f} />)}
              </div>
            </section>
          );
        })}

        {/* ── What we cannot measure ───────────────────────────────────────── */}
        {!loading && summary && summary.unavailable.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-1">What this CRM cannot measure yet</h2>
            <p className="text-xs text-muted-foreground mb-2">
              These are listed rather than hidden. A dashboard that quietly drops
              what it cannot measure teaches you that everything shown is
              everything there is.
            </p>
            <div className="bg-white rounded-xl border border-border shadow-sm divide-y divide-border">
              {summary.unavailable.map((u) => (
                <div key={u.key} className="p-4">
                  <p className="text-xs font-semibold text-foreground">{u.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{u.reason}</p>
                  {u.wouldRequire && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      <span className="font-medium">To measure it:</span> {u.wouldRequire}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── The contract ─────────────────────────────────────────────────── */}
        {!loading && summary && (
          <section className="pb-6">
            <div className="bg-muted rounded-xl border border-border p-4">
              <h2 className="text-xs font-semibold text-foreground mb-2">How to read this page</h2>
              <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
                {Object.entries(summary.contract).map(([k, v]) => <li key={k}>{v}</li>)}
                <li>{summary.filters.note}</li>
              </ul>
            </div>
          </section>
        )}
      </div>
    </CrmLayout>
  );
}
