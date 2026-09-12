import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";

// ── M4: the audience builder ─────────────────────────────────────────────────
//
// Conditions over contacts, with the count computed by the SERVER as you type.
//
// The count is fetched rather than derived in the browser on purpose: it is the
// same endpoint, running the same query, that the send itself runs. A count
// computed locally from a page of contacts would be a different number from the
// one the send uses, and the moment those two disagree the builder is lying
// about who is going to receive something.
//
// The panel says, in words, that nothing is frozen. That is the single most
// misunderstood thing about a saved audience — people expect the list they
// previewed, and what they get is the list as it is on the day it goes out.

export interface SegmentCondition {
  field: string;
  operator: string;
  value?: string | number | string[] | null;
}

export interface SegmentDefinition {
  match: "all" | "any";
  conditions: SegmentCondition[];
}

export interface SegmentVocabulary {
  fields: string[];
  fieldOperators: Record<string, string[]>;
  fieldValues: Record<string, string[]>;
}

interface PreviewContact {
  id: number;
  name: string;
  email: string;
  company?: string | null;
  status: string;
  source?: string | null;
  tags?: string[];
}

const FIELD_LABELS: Record<string, string> = {
  status: "Pipeline status",
  source: "Where they came from",
  priority: "Priority",
  owner: "Assigned to",
  service_interest: "Service they want",
  company: "Company",
  tag: "Tag",
  estimated_value: "Estimated value",
  created_at: "Added to the CRM",
  last_contacted_at: "Last contacted",
};

const OPERATOR_LABELS: Record<string, string> = {
  is: "is",
  is_not: "is not",
  in: "is any of",
  not_in: "is none of",
  contains: "contains",
  has_tag: "has the tag",
  lacks_tag: "does not have the tag",
  gte: "is at least",
  lte: "is at most",
  within_days: "within the last (days)",
  older_than_days: "longer ago than (days)",
  is_set: "is filled in",
  is_not_set: "is empty",
};

const NO_VALUE = new Set(["is_set", "is_not_set"]);
const LIST_VALUE = new Set(["in", "not_in"]);
const NUMBER_VALUE = new Set(["gte", "lte", "within_days", "older_than_days"]);

export function emptyDefinition(): SegmentDefinition {
  return { match: "all", conditions: [{ field: "status", operator: "is", value: "" }] };
}

interface Props {
  definition: SegmentDefinition;
  vocabulary: SegmentVocabulary | null;
  onChange: (next: SegmentDefinition) => void;
  disabled?: boolean;
  /**
   * Hide the live-count panel, for the caller that already shows a richer one.
   *
   * The count query still runs — it is what marks the individual condition that
   * is wrong, and losing that would leave somebody with an invalid filter and no
   * idea which line of it to fix. Only the summary block is suppressed, so the
   * screen never shows two teal panels arguing about the same number.
   */
  hideSummary?: boolean;
}

export default function SegmentBuilder({ definition, vocabulary, onChange, disabled, hideSummary }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [sample, setSample] = useState<PreviewContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ index: number; problem: string }[]>([]);
  const requestId = useRef(0);

  const serialised = useMemo(() => JSON.stringify(definition), [definition]);

  const runPreview = useCallback(async (body: string) => {
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/crm/marketing/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: JSON.parse(body) }),
      });
      const data = await res.json().catch(() => ({}));
      // A slower earlier request must never overwrite a newer answer.
      if (mine !== requestId.current) return;
      if (!res.ok) {
        setCount(null);
        setSample([]);
        setProblems(Array.isArray(data.problems) ? data.problems : []);
        setError(typeof data.error === "string" ? data.error : `The count could not be worked out (${res.status}).`);
        return;
      }
      setProblems([]);
      setCount(Number(data.count ?? 0));
      setSample(Array.isArray(data.sample) ? data.sample : []);
    } catch {
      if (mine !== requestId.current) return;
      setCount(null);
      setSample([]);
      setError("The count could not be worked out — the server did not answer.");
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void runPreview(serialised); }, 350);
    return () => clearTimeout(t);
  }, [serialised, runPreview]);

  const patchCondition = (index: number, patch: Partial<SegmentCondition>) => {
    const conditions = definition.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...definition, conditions });
  };

  const changeField = (index: number, field: string) => {
    const ops = vocabulary?.fieldOperators[field] ?? ["is"];
    patchCondition(index, { field, operator: ops[0] ?? "is", value: "" });
  };

  const changeOperator = (index: number, operator: string) => {
    patchCondition(index, {
      operator,
      value: NO_VALUE.has(operator) ? null : LIST_VALUE.has(operator) ? [] : "",
    });
  };

  const addCondition = () => {
    onChange({ ...definition, conditions: [...definition.conditions, { field: "status", operator: "is", value: "" }] });
  };

  const removeCondition = (index: number) => {
    onChange({ ...definition, conditions: definition.conditions.filter((_, i) => i !== index) });
  };

  const fields = vocabulary?.fields ?? Object.keys(FIELD_LABELS);

  return (
    <div className="space-y-3">
      {/* ── Match mode ── */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Include a contact when</span>
        <select
          value={definition.match}
          disabled={disabled}
          onChange={(e) => onChange({ ...definition, match: e.target.value as "all" | "any" })}
          className="px-2 py-1 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
        >
          <option value="all">every</option>
          <option value="any">any</option>
        </select>
        <span className="text-muted-foreground">condition below is true.</span>
      </div>

      {/* ── Conditions ── */}
      <div className="space-y-2">
        {definition.conditions.map((condition, index) => {
          const ops = vocabulary?.fieldOperators[condition.field] ?? ["is"];
          const values = vocabulary?.fieldValues[condition.field] ?? [];
          const problem = problems.find((p) => p.index === index);
          return (
            <div
              key={index}
              className={`rounded-lg border p-2.5 ${problem ? "border-red-300 bg-red-50/60" : "border-border bg-card"}`}
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={condition.field}
                  disabled={disabled}
                  onChange={(e) => changeField(index, e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
                >
                  {fields.map((f) => <option key={f} value={f}>{FIELD_LABELS[f] ?? f}</option>)}
                </select>

                <select
                  value={condition.operator}
                  disabled={disabled}
                  onChange={(e) => changeOperator(index, e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
                >
                  {ops.map((o) => <option key={o} value={o}>{OPERATOR_LABELS[o] ?? o}</option>)}
                </select>

                {!NO_VALUE.has(condition.operator) && (
                  LIST_VALUE.has(condition.operator) ? (
                    <input
                      type="text"
                      disabled={disabled}
                      value={Array.isArray(condition.value) ? condition.value.join(", ") : ""}
                      placeholder="Comma separated"
                      onChange={(e) => patchCondition(index, {
                        value: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                      })}
                      className="flex-1 min-w-0 px-2 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
                    />
                  ) : (
                    <input
                      type={NUMBER_VALUE.has(condition.operator) ? "number" : "text"}
                      disabled={disabled}
                      list={values.length ? `segval-${condition.field}` : undefined}
                      value={condition.value === null || condition.value === undefined ? "" : String(condition.value)}
                      placeholder={NUMBER_VALUE.has(condition.operator) ? "Number" : "Value"}
                      onChange={(e) => patchCondition(index, { value: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
                    />
                  )
                )}

                <button
                  type="button"
                  disabled={disabled || definition.conditions.length === 1}
                  onClick={() => removeCondition(index)}
                  title="Remove this condition"
                  aria-label="Remove this condition"
                  className="shrink-0 self-start sm:self-auto p-2 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {values.length > 0 && (
                <datalist id={`segval-${condition.field}`}>
                  {values.map((v) => <option key={v} value={v} />)}
                </datalist>
              )}

              {problem && (
                <p className="mt-1.5 text-xs text-red-700 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {problem.problem}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={addCondition}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-border text-foreground hover:bg-accent disabled:opacity-60"
      >
        <Plus className="w-3.5 h-3.5" /> Add condition
      </button>

      {/* ── The live count ── */}
      <div className={`rounded-lg border border-teal-200 bg-teal-50/60 p-3 ${hideSummary ? "hidden" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-teal-700 shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate">
              {loading
                ? "Counting…"
                : error
                  ? "Count unavailable"
                  : count === null
                    ? "No count yet"
                    : `${count} contact${count === 1 ? "" : "s"} match right now`}
            </span>
          </div>
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin text-teal-700 shrink-0" />
            : (
              <button
                type="button"
                onClick={() => void runPreview(serialised)}
                className="flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-900 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recount
              </button>
            )}
        </div>

        {error && (
          <p className="mt-2 text-xs text-red-700 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
          </p>
        )}

        {!error && count !== null && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            This audience is not frozen. The same query runs again when a campaign using it starts
            sending, so anybody who stops matching — or unsubscribes — between now and then is left out.
          </p>
        )}

        {sample.length > 0 && (
          <div className="mt-2.5 max-h-48 overflow-auto rounded-md border border-teal-200 bg-card">
            <table className="w-full text-xs">
              <tbody>
                {sample.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-2.5 py-1.5 font-medium text-foreground whitespace-nowrap">{c.name}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[160px]">{c.email}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap hidden sm:table-cell">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {count !== null && count > sample.length && (
              <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
                Showing the first {sample.length} of {count}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
