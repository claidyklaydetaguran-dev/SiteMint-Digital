import { useRef, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Upload, CheckCircle2, XCircle, AlertTriangle, ChevronRight,
  FileText, Users, GitBranch, RefreshCw, Download, X,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"]);
const VALID_PRIORITIES = new Set(["Low","Medium","High"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SAMPLE_CSV = [
  "name,email,phone,company,source,status,priority,estimatedValue,serviceInterest,tags,notes",
  "Jane Smith,jane@acme.com,555-0100,Acme Corp,Referral,New,High,5000,Web Design,\"seo,branding\",Full package inquiry",
  "Bob Jones,bob@techco.com,555-0200,Tech Co,,Contacted,Medium,,SEO,,Follow up next week",
  "Maria Lee,maria@startupxyz.com,,Startup XYZ,Cold Outreach,Follow-up,Low,2500,Branding,,",
].join("\n");

const COLUMNS = [
  { name: "name",            req: true,  note: "Full contact name" },
  { name: "email",           req: false, note: "Used for duplicate detection" },
  { name: "phone",           req: false, note: "" },
  { name: "company",         req: false, note: "" },
  { name: "source",          req: false, note: "Defaults to CSV Import" },
  { name: "status",          req: false, note: "New · Contacted · Follow-up · Proposal Sent · Negotiating · Won · Lost · Nurture" },
  { name: "priority",        req: false, note: "Low · Medium (default) · High" },
  { name: "estimatedValue",  req: false, note: "Numeric, e.g. 5000" },
  { name: "serviceInterest", req: false, note: "e.g. Web Design, SEO" },
  { name: "tags",            req: false, note: "Comma-separated within the cell" },
  { name: "assignedTo",      req: false, note: "Team member name" },
  { name: "notes",           req: false, note: "" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedRow {
  idx: number;
  raw: Record<string, string>;
  errors: string[];
  warnings: string[];
  isDupInCSV: boolean;
}
interface ImportResult {
  created: number;
  skippedDuplicates: number;
  invalid: number;
  errors: { rowIndex: number; message: string }[];
}

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { fields.push(field.trim()); field = ""; }
      else field += c;
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseCSV(text: string): { headers: string[]; data: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], data: [] };
  const headers = parseCsvLine(lines[0]);
  const data = lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
  return { headers, data };
}

// ── Row Validation ────────────────────────────────────────────────────────────

function validateRows(data: Record<string, string>[]): ParsedRow[] {
  const emailsSeen = new Set<string>();
  return data.map((raw, idx) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isDupInCSV = false;

    if (!raw.name?.trim()) errors.push("Name is required");

    const email = raw.email?.trim().toLowerCase();
    if (email) {
      if (!EMAIL_RE.test(email)) errors.push("Invalid email format");
      else if (emailsSeen.has(email)) { isDupInCSV = true; warnings.push("Duplicate email in this CSV — will be skipped"); }
      else emailsSeen.add(email);
    }

    const status = raw.status?.trim();
    if (status && !VALID_STATUSES.has(status)) warnings.push(`Status "${status}" → normalized to "New"`);

    const priority = raw.priority?.trim();
    if (priority && !VALID_PRIORITIES.has(priority)) warnings.push(`Priority "${priority}" → normalized to "Medium"`);

    const ev = raw.estimatedValue?.trim();
    if (ev && isNaN(parseFloat(ev.replace(/[^0-9.]/g, "")))) warnings.push(`estimatedValue "${ev}" is not a valid number`);

    return { idx, raw, errors, warnings, isDupInCSV };
  });
}

// ── Sample download ───────────────────────────────────────────────────────────

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "sitemint-crm-import-sample.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CrmImport() {
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [discLoading, setDiscLoading] = useState(false);
  const [discResult, setDiscResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [discError, setDiscError] = useState<string | null>(null);

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) { alert("Please upload a .csv file."); return; }
    setFileName(file.name);
    setImportResult(null);
    setImportError(null);
    setShowAll(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { data } = parseCSV(e.target?.result as string);
        setRows(validateRows(data));
      } catch {
        setFileName(null); setRows([]);
        alert("Could not parse the CSV. Please check the file format.");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = "";
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0]; if (f) processFile(f);
  };
  const resetFile = () => {
    setFileName(null); setRows([]); setImportResult(null); setImportError(null);
  };

  // Rows to send: no fatal errors AND not a CSV duplicate
  const sendable = rows.filter(r => r.errors.length === 0 && !r.isDupInCSV);
  const errorCount = rows.filter(r => r.errors.length > 0).length;
  const dupCount = rows.filter(r => r.isDupInCSV).length;
  const displayRows = showAll ? rows : rows.slice(0, 15);

  const runImport = async () => {
    if (!token()) { navigate("/admin?redirect=/admin/crm/import"); return; }
    if (sendable.length === 0) return;
    setImporting(true); setImportError(null);
    try {
      const res = await fetch("/api/crm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ rows: sendable.map(r => r.raw) }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? "Server error"); }
      setImportResult(await res.json() as ImportResult);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    }
    setImporting(false);
  };

  const runDiscovery = async () => {
    if (!token()) { navigate("/admin?redirect=/admin/crm/import"); return; }
    setDiscLoading(true); setDiscError(null); setDiscResult(null);
    try {
      const res = await fetch("/api/crm/import-discovery", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? "Server error"); }
      setDiscResult(await res.json() as { imported: number; skipped: number });
    } catch (e) {
      setDiscError(e instanceof Error ? e.message : "Import failed");
    }
    setDiscLoading(false);
  };

  return (
    <CrmLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Import Leads</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Upload a CSV to add contacts into your CRM without duplicates.</p>
          </div>
          <Link href="/admin/crm/leads">
            <button className="flex items-center gap-1.5 text-sm border border-gray-200 bg-white hover:bg-gray-50 px-3.5 py-2 rounded-lg transition-colors font-medium text-muted-foreground">
              <Users className="w-3.5 h-3.5" /> View Leads
            </button>
          </Link>
        </div>

        {/* ── Import Result ─────────────────────────────────────────────────── */}
        {importResult && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <h2 className="font-semibold text-foreground">Import Complete</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
                  <p className="text-3xl font-bold text-green-700">{importResult.created}</p>
                  <p className="text-xs font-medium text-green-600 mt-1">Leads Created</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 text-center border border-yellow-100">
                  <p className="text-3xl font-bold text-yellow-700">{importResult.skippedDuplicates}</p>
                  <p className="text-xs font-medium text-yellow-600 mt-1">Skipped (Duplicate)</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center border border-red-100">
                  <p className="text-3xl font-bold text-red-700">{importResult.invalid}</p>
                  <p className="text-xs font-medium text-red-600 mt-1">Invalid Rows</p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">Row-level errors:</p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">Row {e.rowIndex + 1}: {e.message}</p>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href="/admin/crm/leads">
                  <button className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    <Users className="w-3.5 h-3.5" /> View Leads
                  </button>
                </Link>
                <Link href="/admin/crm/pipeline">
                  <button className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium">
                    <GitBranch className="w-3.5 h-3.5" /> Lead Pipeline
                  </button>
                </Link>
                <button onClick={resetFile}
                  className="flex items-center gap-1.5 text-sm border border-gray-200 bg-white text-muted-foreground px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                  <Upload className="w-3.5 h-3.5" /> Import Another CSV
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Upload Card (no file selected, no result) ─────────────────────── */}
        {!fileName && !importResult && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-foreground">Upload CSV File</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Accepts .csv only. Data is validated before import.</p>
              </div>
              <div className="p-5">
                <div
                  className={`border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition-all ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50/50 hover:bg-gray-50 hover:border-gray-300"}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? "text-blue-400" : "text-gray-300"}`} />
                  <p className="font-semibold text-foreground">Drop your CSV here</p>
                  <p className="text-sm text-muted-foreground mt-1">or <span className="text-blue-600 underline">click to browse</span></p>
                  <p className="text-xs text-muted-foreground mt-3">.csv files only</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                <div className="mt-3 flex justify-end">
                  <button onClick={downloadSample} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Download className="w-3.5 h-3.5" /> Download sample CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Column reference */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-foreground">Supported CSV Columns</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Column headers must match exactly (case-sensitive)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground">Column</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground">Required</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {COLUMNS.map(col => (
                      <tr key={col.name}>
                        <td className="px-5 py-2.5">
                          <code className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{col.name}</code>
                        </td>
                        <td className="px-5 py-2.5">
                          {col.req
                            ? <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Required</span>
                            : <span className="text-[10px] text-muted-foreground">Optional</span>}
                        </td>
                        <td className="px-5 py-2.5 text-xs text-muted-foreground">{col.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Preview & Validate (file selected, not yet imported) ──────────── */}
        {fileName && !importResult && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* File header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                <div>
                  <h2 className="font-semibold text-foreground">{fileName}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{rows.length} row{rows.length !== 1 ? "s" : ""} parsed</p>
                </div>
              </div>
              <button onClick={resetFile} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Validation summary bar */}
            <div className="flex items-center gap-4 px-5 py-3 bg-gray-50/60 border-b border-gray-100 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-medium text-foreground">{sendable.length} valid</span>
              </div>
              {errorCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs font-medium text-red-700">{errorCount} with error{errorCount !== 1 ? "s" : ""}</span>
                </div>
              )}
              {dupCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  <span className="text-xs font-medium text-yellow-700">{dupCount} duplicate{dupCount !== 1 ? "s" : ""} in CSV</span>
                </div>
              )}
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/40">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground w-8">#</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground">Row</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground">Phone</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground">Company</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground">Priority</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayRows.map(row => {
                    const hasErr = row.errors.length > 0;
                    const isDup = row.isDupInCSV;
                    return (
                      <tr key={row.idx} className={hasErr ? "bg-red-50/30" : isDup ? "bg-yellow-50/30" : ""}>
                        <td className="px-4 py-2 text-muted-foreground">{row.idx + 1}</td>
                        <td className="px-4 py-2">
                          {hasErr ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              <XCircle className="w-2.5 h-2.5" /> Error
                            </span>
                          ) : isDup ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              <AlertTriangle className="w-2.5 h-2.5" /> CSV Dup
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              <CheckCircle2 className="w-2.5 h-2.5" /> OK
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-medium text-foreground max-w-[130px] truncate">
                          {row.raw.name || <span className="text-red-500 italic">missing</span>}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground max-w-[160px] truncate">{row.raw.email || "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{row.raw.phone || "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground max-w-[110px] truncate">{row.raw.company || "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{row.raw.status || "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{row.raw.priority || "—"}</td>
                        <td className="px-4 py-2 max-w-[220px]">
                          {row.errors.map((e, i) => (
                            <p key={i} className="text-[10px] text-red-600 leading-tight mb-0.5">{e}</p>
                          ))}
                          {row.warnings.map((w, i) => (
                            <p key={i} className="text-[10px] text-yellow-700 leading-tight mb-0.5">{w}</p>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.length > 15 && (
              <div className="px-5 py-3 border-t border-gray-100 text-center">
                <button onClick={() => setShowAll(v => !v)} className="text-xs text-blue-600 hover:text-blue-700">
                  {showAll ? "Show first 15 rows" : `Show all ${rows.length} rows`}
                </button>
              </div>
            )}

            {/* Import CTA */}
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between gap-4">
              <div>
                {sendable.length > 0 ? (
                  <p className="text-sm text-foreground font-medium">{sendable.length} row{sendable.length !== 1 ? "s" : ""} ready to import</p>
                ) : (
                  <p className="text-sm text-red-600 font-medium">No valid rows to import</p>
                )}
                {(errorCount > 0 || dupCount > 0) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[
                      errorCount > 0 && `${errorCount} error row${errorCount !== 1 ? "s" : ""} skipped`,
                      dupCount > 0 && `${dupCount} CSV duplicate${dupCount !== 1 ? "s" : ""} skipped`,
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={resetFile}
                  className="text-sm border border-gray-200 bg-white text-muted-foreground px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                  Cancel
                </button>
                <button
                  onClick={runImport}
                  disabled={importing || sendable.length === 0}
                  className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg transition-colors font-medium"
                >
                  {importing
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                    : <><Upload className="w-3.5 h-3.5" /> Import {sendable.length} Lead{sendable.length !== 1 ? "s" : ""}</>}
                </button>
              </div>
            </div>

            {importError && (
              <div className="px-5 py-3 border-t border-red-100 bg-red-50 flex items-center gap-2 text-sm text-red-700">
                <XCircle className="w-4 h-4 shrink-0" /> {importError}
              </div>
            )}
          </div>
        )}

        {/* ── Discovery Import Section ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-foreground">Import from Discovery Portal</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pull all unimported discovery form submissions into the CRM. Already-imported submissions are skipped automatically.
            </p>
          </div>
          <div className="p-5">
            {discResult ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-green-50 border border-green-100 rounded-lg px-5 py-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{discResult.imported}</p>
                    <p className="text-xs text-green-600 font-medium">Imported</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-5 py-3 text-center">
                    <p className="text-2xl font-bold text-yellow-700">{discResult.skipped}</p>
                    <p className="text-xs text-yellow-600 font-medium">Already in CRM</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/admin/crm/leads">
                    <button className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                      <Users className="w-3.5 h-3.5" /> View Leads <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </Link>
                  <button onClick={() => { setDiscResult(null); setDiscError(null); }}
                    className="text-sm border border-gray-200 bg-white text-muted-foreground px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                    Import Again
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-sm text-foreground">Batch-import all unimported discovery form submissions from the admin portal.</p>
                  <p className="text-xs text-muted-foreground mt-1">Individual submissions can also be imported from the Discovery Portal detail pages.</p>
                </div>
                <button
                  onClick={runDiscovery}
                  disabled={discLoading}
                  className="flex items-center gap-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors font-medium shrink-0"
                >
                  {discLoading
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                    : <>Import Discovery Leads</>}
                </button>
              </div>
            )}
            {discError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
                <XCircle className="w-4 h-4 shrink-0" /> {discError}
              </div>
            )}
          </div>
        </div>

      </div>
    </CrmLayout>
  );
}
