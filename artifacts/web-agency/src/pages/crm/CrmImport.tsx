import { useRef, useState, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Upload, CheckCircle2, XCircle, AlertTriangle, ChevronRight,
  FileText, Users, GitBranch, RefreshCw, Download, X, Copy, Info,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, failureReason, readAdminResource, responseFailureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure, dataOf } from "@/components/crm/LoadState";
import { useCrmAssignees } from "@/lib/crmAssignees";
import { OwnerMapControl, type OwnerMapResult } from "@/components/crm/UnmappedOwnersPanel";

// ── Types mirroring the server's plan ────────────────────────────────────────

type RowAction = "create" | "update" | "skip" | "error";

interface PlannedRow {
  rowNumber: number;
  action: RowAction;
  reason: string | null;
  explain: string;
  matchedLeadId: number | null;
  matchedOn: "email" | "phone" | null;
  values: Record<string, unknown>;
  changes: Record<string, { from: unknown; to: unknown }>;
  errors: string[];
  notices: string[];
}

interface TargetField {
  key: string; label: string; required: boolean; note: string;
}

/** M6: one owner name in the file, and what the server's matching rules decided about it. */
interface ImportOwner {
  key: string;
  value: string;
  rows: number;
  outcome: "matched" | "ambiguous" | "none";
  staffId: number | null;
  staffName: string | null;
  rule: "display_name" | "legacy_name" | "email" | null;
  candidates: { id: number; displayName: string; email: string; status: string }[];
  explanation: string;
}

interface Preview {
  headers: string[];
  mapping: Record<string, string | null>;
  suggestedMapping: Record<string, string | null>;
  ignoredColumns: string[];
  options: { updateExisting: boolean; updateMode: "fill_blanks" | "overwrite" };
  totals: Record<RowAction, number>;
  rows: PlannedRow[];
  owners?: ImportOwner[];
  canMapOwners?: boolean;
  planHash: string;
}

const OWNER_RULE_WORDS: Record<NonNullable<ImportOwner["rule"]>, string> = {
  display_name: "their display name",
  legacy_name: "a legacy name recorded on their account",
  email: "their email address",
};

interface CommitResult {
  created: number; updated: number; skipped: number; failed: number;
  rows: { rowNumber: number; outcome: string; leadId: number | null; detail: string }[];
}

/** A body that is not the shape this page expects is a failure, not a short list. */
function pickFields(body: unknown): TargetField[] | undefined {
  const list = body && typeof body === "object" ? (body as { fields?: unknown }).fields : undefined;
  return Array.isArray(list) ? list as TargetField[] : undefined;
}

const SAMPLE_CSV = [
  "name,email,phone,company,status,priority,estimatedValue,serviceInterest,tags,notes",
  "Jane Smith,jane@acme.test,555-0100,Acme Corp,Qualified,High,5000,Website Design,\"seo,branding\",Full package inquiry",
  "Bob Jones,bob@techco.test,555-0200,Tech Co,Follow-Up Needed,Medium,,SEO,,Follow up next week",
  "Maria Lee,,555-0300,Startup XYZ,New Inquiry,Low,2500,Branding,,No email — matched on the phone number",
].join("\n");

const ACTION_STYLE: Record<RowAction, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  create: { label: "Create", cls: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 },
  update: { label: "Update", cls: "bg-teal-100 text-teal-800", Icon: RefreshCw },
  skip:   { label: "Skip",   cls: "bg-amber-100 text-amber-800", Icon: AlertTriangle },
  error:  { label: "Error",  cls: "bg-red-100 text-red-700", Icon: XCircle },
};

const MAX_BYTES = 4 * 1024 * 1024;

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "sitemint-crm-import-sample.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function CrmImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  // M6: the people an unmatched owner name in the file can be mapped to.
  const people = useCrmAssignees();
  const [ownerNotice, setOwnerNotice] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [fieldsLoad, setFieldsLoad] = useState<Load<TargetField[]>>({ status: "loading" });

  // The plan is either the server's answer or a stated failure. It used to be a
  // plain `Preview | null`, and a null one still rendered the summary card:
  // 0/0/0/0, "0 rows checked", and "Nothing in this file would change anything"
  // about a file nobody had managed to check.
  const [previewLoad, setPreviewLoad] = useState<Load<Preview>>({ status: "loading" });
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [updateExisting, setUpdateExisting] = useState(false);
  const [updateMode, setUpdateMode] = useState<"fill_blanks" | "overwrite">("fill_blanks");

  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showMapping, setShowMapping] = useState(false);

  const [discLoading, setDiscLoading] = useState(false);
  const [discResult, setDiscResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [discError, setDiscError] = useState<string | null>(null);

  const options = useMemo(() => ({ updateExisting, updateMode }), [updateExisting, updateMode]);

  const runPreview = useCallback(async (
    text: string,
    withMapping: Record<string, string | null> | null,
    withOptions: { updateExisting: boolean; updateMode: "fill_blanks" | "overwrite" },
  ) => {
    setChecking(true); setError(null); setProblems([]);
    try {
      const res = await adminFetch("/api/crm/contacts/import/preview", {
        method: "POST",
        body: JSON.stringify({ csv: text, mapping: withMapping ?? undefined, options: withOptions }),
      });
      const body = await res.json().catch(() => undefined) as
        (Partial<Preview> & { problems?: unknown }) | undefined;
      if (!res.ok) {
        // The per-row problems the server listed are kept; the reason itself is
        // the response's own, so a 401, a 403 naming the missing grant, a 404, a
        // 5xx and an unreachable server each read differently.
        setProblems(Array.isArray(body?.problems) ? body.problems as string[] : []);
        setPreviewLoad({ status: "error", httpStatus: res.status, reason: failureReason(res.status, body) });
        return;
      }
      if (!body || !Array.isArray(body.rows) || !body.totals || !body.mapping) {
        setPreviewLoad({
          status: "error",
          httpStatus: res.status,
          reason: "The server's answer was not in the expected shape.",
        });
        return;
      }
      const plan = body as Preview;
      setPreviewLoad({ status: "ready", data: plan });
      setMapping(plan.mapping);
    } catch {
      setPreviewLoad({ status: "error", httpStatus: null, reason: failureReason(null) });
    } finally {
      setChecking(false);
    }
  }, []);

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("That is not a .csv file."); return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / (1024 * 1024)).toFixed(1)}MB; the limit is 4MB. Split it and import the parts.`);
      return;
    }
    setFileName(file.name);
    setResult(null); setError(null); setProblems([]); setShowAll(false);
    setPreviewLoad({ status: "loading" });
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = String(e.target?.result ?? "");
      setCsv(text);
      // The field catalogue is what the mapping editor offers; it comes from
      // the server so the two can never disagree about what is importable.
      // The mapping editor degrades to the server's own suggestion when this
      // fails — and says so, rather than passing a short list off as the whole
      // catalogue of what can be imported.
      setFieldsLoad(await readAdminResource("/api/crm/contacts/import/fields", pickFields));
      void runPreview(text, null, { updateExisting: false, updateMode: "fill_blanks" });
    };
    reader.readAsText(file);
  }, [runPreview]);

  const reset = () => {
    setFileName(null); setCsv(""); setPreviewLoad({ status: "loading" }); setMapping({});
    setResult(null); setError(null); setProblems([]); setShowMapping(false);
    setUpdateExisting(false); setUpdateMode("fill_blanks");
  };

  const changeMapping = (field: string, header: string) => {
    const next = { ...mapping, [field]: header === "" ? null : header };
    setMapping(next);
    void runPreview(csv, next, options);
  };

  const changeOptions = (next: { updateExisting: boolean; updateMode: "fill_blanks" | "overwrite" }) => {
    setUpdateExisting(next.updateExisting);
    setUpdateMode(next.updateMode);
    void runPreview(csv, mapping, next);
  };

  const runImport = async () => {
    const plan = dataOf(previewLoad);
    if (!plan) return;
    setImporting(true); setError(null);
    try {
      const res = await adminFetch("/api/crm/contacts/import/commit", {
        method: "POST",
        body: JSON.stringify({ csv, mapping, options, planHash: plan.planHash }),
      });
      if (res.status === 409) {
        // The file, or the contacts it matches, changed between the preview and
        // the button. Show the NEW plan rather than importing a different one.
        setError(`Nothing was imported. ${await responseFailureReason(res)}`);
        void runPreview(csv, mapping, options);
        setImporting(false);
        return;
      }
      if (!res.ok) {
        setError(`The import could not be run. ${await responseFailureReason(res)}`);
        setImporting(false);
        return;
      }
      const data = await res.json().catch(() => undefined) as CommitResult | undefined;
      // An answer we cannot read must not become a row of zeros under "Import
      // finished": the import may well have created a great many contacts.
      if (!data || typeof data.created !== "number" || !Array.isArray(data.rows)) {
        setError(
          "The import was sent, but the server's answer was not in the expected shape, "
          + "so what it did is not known. Check the contact list before importing this file again.",
        );
        setImporting(false);
        return;
      }
      setResult(data);
    } catch {
      setError(`The import could not be run. ${failureReason(null)}`);
    }
    setImporting(false);
  };

  const runDiscovery = async () => {
    setDiscLoading(true); setDiscError(null); setDiscResult(null);
    try {
      const res = await adminFetch("/api/crm/import-discovery", { method: "POST" });
      if (!res.ok) {
        setDiscError(`Nothing was imported. ${await responseFailureReason(res)}`);
        setDiscLoading(false);
        return;
      }
      const data = await res.json().catch(() => undefined) as { imported?: unknown; skipped?: unknown } | undefined;
      // Two zeros would say "there was nothing to import". Say what happened.
      if (typeof data?.imported !== "number" || typeof data?.skipped !== "number") {
        setDiscError("The server's answer was not in the expected shape, so what it imported is not known.");
        setDiscLoading(false);
        return;
      }
      setDiscResult({ imported: data.imported, skipped: data.skipped });
    } catch {
      setDiscError(`Nothing was imported. ${failureReason(null)}`);
    }
    setDiscLoading(false);
  };

  // The plan, or null — never an empty one standing in for a file that was
  // never successfully checked.
  const preview = dataOf(previewLoad);
  const fieldList = dataOf(fieldsLoad) ?? [];
  const rows = preview?.rows ?? [];
  const displayRows = showAll ? rows : rows.slice(0, 20);
  const totals = preview?.totals ?? null;
  const applicable = totals ? totals.create + totals.update : null;

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Import contacts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every file is checked before anything is written, and the same file imported twice does not create a second set of contacts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/crm/duplicates">
              <button className="flex items-center gap-1.5 text-sm border border-border bg-background hover:bg-accent px-3.5 py-2 rounded-lg transition-colors font-medium text-muted-foreground whitespace-nowrap">
                <Copy className="w-3.5 h-3.5" /> Duplicates
              </button>
            </Link>
            <Link href="/admin/crm/leads">
              <button className="flex items-center gap-1.5 text-sm border border-border bg-background hover:bg-accent px-3.5 py-2 rounded-lg transition-colors font-medium text-muted-foreground whitespace-nowrap">
                <Users className="w-3.5 h-3.5" /> Contacts
              </button>
            </Link>
          </div>
        </div>

        {/* ── Result ───────────────────────────────────────────────────────── */}
        {result && (
          <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h2 className="font-semibold text-foreground">Import finished</h2>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  ["Created", result.created, "bg-emerald-50 border-emerald-200 text-emerald-800"],
                  ["Updated", result.updated, "bg-teal-50 border-teal-200 text-teal-800"],
                  ["Skipped", result.skipped, "bg-amber-50 border-amber-200 text-amber-800"],
                  ["Failed", result.failed, "bg-red-50 border-red-200 text-red-700"],
                ] as const).map(([label, n, cls]) => (
                  <div key={label} className={`rounded-xl p-3 text-center border ${cls}`}>
                    <p className="text-2xl font-bold">{n}</p>
                    <p className="text-xs font-medium mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {result.failed > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">
                    A row that fails costs that row only — every other row in the file was still applied.
                  </p>
                  {result.rows.filter(r => r.outcome === "error").map(r => (
                    <p key={r.rowNumber} className="text-xs text-red-700">Row {r.rowNumber}: {r.detail}</p>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href="/admin/crm/leads">
                  <button className="flex items-center gap-1.5 text-sm bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors font-medium">
                    <Users className="w-3.5 h-3.5" /> View contacts
                  </button>
                </Link>
                <Link href="/admin/crm/duplicates">
                  <button className="flex items-center gap-1.5 text-sm border border-border bg-background text-muted-foreground px-4 py-2 rounded-lg hover:bg-accent transition-colors font-medium">
                    <Copy className="w-3.5 h-3.5" /> Review duplicates
                  </button>
                </Link>
                <button onClick={reset}
                  className="flex items-center gap-1.5 text-sm border border-border bg-background text-muted-foreground px-4 py-2 rounded-lg hover:bg-accent transition-colors font-medium">
                  <Upload className="w-3.5 h-3.5" /> Import another file
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Upload ───────────────────────────────────────────────────────── */}
        {!fileName && !result && (
          <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60">
              <h2 className="font-semibold text-foreground">Choose a CSV file</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Up to 4MB and 5,000 rows. Nothing is written until you confirm.</p>
            </div>
            <div className="p-4 sm:p-5">
              <div
                className={`border-2 border-dashed rounded-xl p-8 sm:p-14 text-center cursor-pointer transition-all ${dragOver ? "border-teal-400 bg-teal-50" : "border-border bg-muted/50 hover:bg-accent"}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? "text-teal-500" : "text-muted-foreground/40"}`} />
                <p className="font-semibold text-foreground">Drop a CSV here</p>
                <p className="text-sm text-muted-foreground mt-1">or <span className="text-teal-700 underline">browse for one</span></p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />
              <div className="mt-3 flex justify-end">
                <button onClick={downloadSample} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Download className="w-3.5 h-3.5" /> Download a sample file
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Errors ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="break-words">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Preview ──────────────────────────────────────────────────────── */}
        {fileName && !result && (
          <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-border/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                <div className="min-w-0">
                  <h2 className="font-semibold text-foreground truncate">{fileName}</h2>
                  {/* A row count is only claimed for a file that was checked. */}
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {checking
                      ? "Checking…"
                      : preview
                        ? `${rows.length} row${rows.length === 1 ? "" : "s"} checked · nothing written yet`
                        : "Not checked — nothing has been read from this file."}
                  </p>
                </div>
              </div>
              <button onClick={reset} aria-label="Discard this file"
                className="w-11 h-11 [@media(hover:hover)]:w-8 [@media(hover:hover)]:h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Totals */}
            <div className="flex items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3 bg-muted/60 border-b border-border/60 flex-wrap">
              {(Object.keys(ACTION_STYLE) as RowAction[]).map(action => (
                <div key={action} className="flex items-center gap-1.5">
                  {/* A dash, not a zero: "0 to create" about an unchecked file
                      is a claim nobody made. */}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ACTION_STYLE[action].cls}`}>
                    <Figure value={totals ? totals[action] : null} loading={checking} />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{ACTION_STYLE[action].label}</span>
                </div>
              ))}
            </div>

            {/* The check either produced a plan or it did not. The words are the
                response's own, and the per-row problems the server listed stay
                with them. */}
            {previewLoad.status === "error" && (
              <div className="px-4 sm:px-5 py-4 border-b border-border/60">
                <LoadFailure
                  what="This file's import plan"
                  reason={previewLoad.reason}
                  onRetry={() => { void runPreview(csv, mapping, options); }}
                  retrying={checking}
                >
                  <p className="mt-2 min-w-0 break-words text-sm text-muted-foreground">
                    No row count or total is shown above. Nothing in this file has been checked, so
                    nothing here says what it would — or would not — change.
                  </p>
                  {problems.length > 0 && (
                    <ul className="mt-2 space-y-0.5 list-disc pl-4 text-sm text-muted-foreground">
                      {problems.map((p, i) => <li key={i} className="break-words">{p}</li>)}
                    </ul>
                  )}
                </LoadFailure>
              </div>
            )}

            {/* Options */}
            <div className="px-4 sm:px-5 py-3 border-b border-border/60 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={updateExisting} className="mt-0.5 accent-teal-600 w-4 h-4"
                  onChange={e => changeOptions({ updateExisting: e.target.checked, updateMode })} />
                <span className="text-sm text-foreground">
                  Update contacts that already exist
                  <span className="block text-xs text-muted-foreground">
                    Off, a matching contact is left exactly as it is and the row is skipped.
                  </span>
                </span>
              </label>
              {updateExisting && (
                <div className="pl-6 space-y-1.5">
                  {([
                    ["fill_blanks", "Only fill in fields the contact has left empty", "Nothing already recorded in the CRM is replaced."],
                    ["overwrite", "Let the file replace what the contact already has", "Use this only when the file is the more current record."],
                  ] as const).map(([mode, label, hint]) => (
                    <label key={mode} className="flex items-start gap-2.5 cursor-pointer">
                      <input type="radio" name="updateMode" checked={updateMode === mode} className="mt-0.5 accent-teal-600 w-4 h-4"
                        onChange={() => changeOptions({ updateExisting, updateMode: mode })} />
                      <span className="text-sm text-foreground">
                        {label}
                        <span className="block text-xs text-muted-foreground">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Owners — M6: names resolved by the server's rules; unresolved ones reported, never guessed */}
            {preview && (preview.owners?.length ?? 0) > 0 && (
              <div className="px-4 sm:px-5 py-3 border-b border-border/60 space-y-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Owners in this file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Each name is matched to a member of staff by display name, then a legacy name on their account,
                    then email address. A name that matches nobody, or more than one person, is imported with no
                    person as its owner — it is never guessed.
                  </p>
                </div>
                {ownerNotice && (
                  <p role="status" className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 break-words">
                    {ownerNotice}
                  </p>
                )}
                <ul className="space-y-2">
                  {(preview.owners ?? []).map((o, i) => (
                    <li key={o.key} className={`rounded-lg border px-3 py-2 min-w-0 ${o.outcome === "matched" ? "border-border bg-background" : "border-amber-200 bg-amber-50"}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                        <span className="text-sm font-medium text-foreground break-all">“{o.value}”</span>
                        <span className="text-xs text-muted-foreground">{o.rows} row{o.rows === 1 ? "" : "s"}</span>
                      </div>
                      {o.outcome === "matched" ? (
                        <p className="text-xs text-foreground mt-0.5 break-words">
                          Belongs to {o.staffName}{" "}
                          <span className="text-muted-foreground">(matches {o.rule ? OWNER_RULE_WORDS[o.rule] : "a matching rule"})</span>
                        </p>
                      ) : (
                        <>
                          <p className="text-xs text-amber-900 mt-0.5 leading-relaxed break-words">{o.explanation}</p>
                          {o.outcome === "none" && preview.canMapOwners && (
                            <div className="mt-2">
                              <OwnerMapControl
                                value={o.value}
                                people={people.assignees.map(a => ({ ...a, status: "active" }))}
                                idSuffix={`import-${i}`}
                                onMapped={(result: OwnerMapResult) => {
                                  setOwnerNotice(`“${result.value}” is now recorded as ${result.staff.displayName}. The file was checked again with that decision.`);
                                  void runPreview(csv, mapping, options);
                                }}
                              />
                            </div>
                          )}
                          {o.outcome === "none" && !preview.canMapOwners && (
                            <p className="text-xs text-amber-900 mt-1 break-words">
                              An owner or a technical administrator can say who this is — here, or on Admin → Unmapped lead owners.
                            </p>
                          )}
                          {o.outcome === "ambiguous" && (
                            <p className="text-xs text-amber-900 mt-1 break-words">
                              These contacts are imported with no person as their owner. Decide who it is after importing, on{" "}
                              <Link href="/admin/crm/admin#unmapped-owners" className="underline">Admin → Unmapped lead owners</Link>.
                            </p>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Column mapping */}
            {preview && (
              <div className="border-b border-border/60">
                <button onClick={() => setShowMapping(v => !v)}
                  className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-2 hover:bg-accent transition-colors text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Column mapping</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Object.values(preview.mapping).filter(Boolean).length} of your columns are being used
                      {preview.ignoredColumns.length > 0 && ` · ${preview.ignoredColumns.length} ignored`}
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${showMapping ? "rotate-90" : ""}`} />
                </button>
                {showMapping && (
                  <div className="px-4 sm:px-5 pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      These are suggestions, not decisions. Change any of them and the check re-runs before anything is written.
                    </p>
                    {fieldsLoad.status === "error" && (
                      <LoadFailure
                        variant="inline"
                        what="The list of importable fields"
                        reason={fieldsLoad.reason}
                      >
                        <p className="mt-1 min-w-0 break-words text-xs text-muted-foreground">
                          Only the columns the check recognised are offered below — this is not the full list.
                        </p>
                      </LoadFailure>
                    )}
                    <div className="grid sm:grid-cols-2 gap-2.5">
                      {(fieldList.length ? fieldList : Object.keys(preview.mapping).map(k => ({ key: k, label: k, required: k === "name", note: "" }))).map(field => (
                        <div key={field.key} className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-foreground" htmlFor={`map-${field.key}`}>
                            {field.label}
                            {field.required && <span className="text-red-600 ml-1">required</span>}
                          </label>
                          <select id={`map-${field.key}`}
                            value={mapping[field.key] ?? ""}
                            onChange={e => changeMapping(field.key, e.target.value)}
                            className="w-full text-sm border border-input rounded-lg px-2.5 py-2 bg-background text-foreground">
                            <option value="">— not imported —</option>
                            {preview.headers.filter(Boolean).map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                          {field.note && <p className="text-[11px] text-muted-foreground leading-tight">{field.note}</p>}
                        </div>
                      ))}
                    </div>
                    {preview.ignoredColumns.length > 0 && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Not imported: {preview.ignoredColumns.join(", ")}. Map one above if you need it.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Row-by-row plan. Hidden rather than drawn as an empty table when
                there is no plan — headers over no rows read as "this file has
                no rows in it". */}
            {preview && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-left">
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground w-10">Row</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground w-20">What happens</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground">Name</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground">Email</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {displayRows.map(row => {
                    const style = ACTION_STYLE[row.action];
                    return (
                      <tr key={row.rowNumber} className={row.action === "error" ? "bg-red-50/40" : row.action === "skip" ? "bg-amber-50/30" : ""}>
                        <td className="px-3 py-2 text-muted-foreground align-top">{row.rowNumber}</td>
                        <td className="px-3 py-2 align-top">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${style.cls}`}>
                            <style.Icon className="w-2.5 h-2.5" /> {style.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground align-top max-w-[140px] truncate">
                          {String(row.values["name"] ?? "") || <span className="text-red-600 italic">missing</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground align-top max-w-[180px] truncate">
                          {String(row.values["email"] ?? "—")}
                        </td>
                        <td className="px-3 py-2 align-top max-w-[300px]">
                          <p className={`leading-tight ${row.action === "error" ? "text-red-700" : "text-muted-foreground"}`}>{row.explain}</p>
                          {row.action === "update" && Object.keys(row.changes).length > 0 && (
                            <p className="text-[10px] text-teal-800 mt-0.5">Fields: {Object.keys(row.changes).join(", ")}</p>
                          )}
                          {row.notices.map((n, i) => (
                            <p key={i} className="text-[10px] text-amber-800 mt-0.5 leading-tight">{n}</p>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            {rows.length > 20 && (
              <div className="px-5 py-3 border-t border-border/60 text-center">
                <button onClick={() => setShowAll(v => !v)} className="text-xs text-teal-700 hover:text-teal-800 font-medium">
                  {showAll ? "Show the first 20 rows" : `Show all ${rows.length} rows`}
                </button>
              </div>
            )}

            {/* Commit */}
            <div className="px-4 sm:px-5 py-4 border-t border-border/60 bg-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                {/* "Nothing in this file would change anything" is a statement
                    about the file, so it is only made about a file that was
                    actually checked. Beside a failed check it would talk
                    somebody out of an import nobody had looked at. */}
                {preview ? (
                  <>
                    <p className="text-sm text-foreground font-medium break-words">
                      {preview.totals.create + preview.totals.update > 0
                        ? `${preview.totals.create} to create, ${preview.totals.update} to update`
                        : "Nothing in this file would change anything"}
                    </p>
                    {(preview.totals.skip > 0 || preview.totals.error > 0) && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        {[
                          preview.totals.skip > 0 && `${preview.totals.skip} skipped`,
                          preview.totals.error > 0 && `${preview.totals.error} cannot be imported`,
                        ].filter(Boolean).join(" · ")} — each row says why above.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-foreground font-medium break-words">
                    {checking
                      ? "Checking this file…"
                      : "This file has not been checked, so nothing can be imported from it yet."}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={reset}
                  className="text-sm border border-border bg-background text-muted-foreground px-4 py-2.5 rounded-lg hover:bg-accent transition-colors font-medium">
                  Cancel
                </button>
                <button
                  onClick={runImport}
                  disabled={importing || checking || applicable === null || applicable === 0}
                  className="flex items-center gap-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg transition-colors font-medium"
                >
                  {importing
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                    : applicable === null
                      ? <><Upload className="w-3.5 h-3.5" /> Import</>
                      : <><Upload className="w-3.5 h-3.5" /> Import {applicable} row{applicable === 1 ? "" : "s"}</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Discovery import ─────────────────────────────────────────────── */}
        <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border/60">
            <h2 className="font-semibold text-foreground">Import from the Discovery portal</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pulls discovery form submissions that are not in the CRM yet. Submissions already linked to a contact are skipped.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            {discResult ? (
              <div>
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-3 text-center">
                    <p className="text-2xl font-bold text-emerald-800">{discResult.imported}</p>
                    <p className="text-xs text-emerald-700 font-medium">Imported</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-3 text-center">
                    <p className="text-2xl font-bold text-amber-800">{discResult.skipped}</p>
                    <p className="text-xs text-amber-700 font-medium">Already in the CRM</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href="/admin/crm/leads">
                    <button className="flex items-center gap-1.5 text-sm bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors font-medium">
                      <Users className="w-3.5 h-3.5" /> View contacts <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </Link>
                  <button onClick={() => { setDiscResult(null); setDiscError(null); }}
                    className="text-sm border border-border bg-background text-muted-foreground px-4 py-2 rounded-lg hover:bg-accent transition-colors font-medium">
                    Run it again
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <p className="text-sm text-foreground flex-1">
                  Batch-import every discovery submission that has no CRM contact yet.
                </p>
                <button
                  onClick={runDiscovery}
                  disabled={discLoading}
                  className="flex items-center gap-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg transition-colors font-medium shrink-0"
                >
                  {discLoading
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                    : <>Import discovery contacts</>}
                </button>
              </div>
            )}
            {discError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                <XCircle className="w-4 h-4 shrink-0" /> {discError}
              </div>
            )}
          </div>
        </div>

        {/* Export pointer — the other half of the round trip */}
        <div className="bg-background rounded-xl border border-border shadow-sm px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground text-sm">Taking contacts out again</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Export is on the contact list, so the file you get is the list you are looking at. It needs the data-export permission.
            </p>
          </div>
          <Link href="/admin/crm/leads">
            <button className="flex items-center gap-1.5 text-sm border border-border bg-background hover:bg-accent px-4 py-2.5 rounded-lg transition-colors font-medium text-muted-foreground whitespace-nowrap">
              <GitBranch className="w-3.5 h-3.5" /> Go to contacts
            </button>
          </Link>
        </div>

      </div>
    </CrmLayout>
  );
}
