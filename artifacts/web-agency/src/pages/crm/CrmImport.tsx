import { useState } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle, AlertTriangle, X, Download } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

const FIELD_MAPPING: Record<string, string[]> = {
  name: ["name","full name","fullname","contact","contact name","first name","lead name"],
  email: ["email","email address","e-mail"],
  phone: ["phone","phone number","mobile","cell","telephone"],
  company: ["company","business","organization","company name","business name"],
  website: ["website","url","web","site"],
  service_interest: ["service","service interest","interested in","services"],
  notes: ["notes","note","comments","comment","description"],
};

function mapCsvHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(FIELD_MAPPING)) {
      if (aliases.includes(normalized)) { mapping[header] = field; break; }
    }
  }
  return mapping;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || ""]));
  });
  return { headers, rows };
}

interface ImportResult { imported: number; skipped: number; errors: string[]; }

export default function CrmImport() {
  const [, navigate] = useLocation();
  const [file, setFile] = useState<File|null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string,string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string,string>>({});
  const [step, setStep] = useState<"upload"|"map"|"preview"|"done">("upload");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult|null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setColumnMap(mapCsvHeaders(parsed.headers));
      setStep("map");
    };
    reader.readAsText(f);
  };

  const doImport = async () => {
    setImporting(true);
    // Remap rows using column map
    const mapped = rows.map(row => {
      const out: Record<string, string> = {};
      for (const [csvCol, fieldName] of Object.entries(columnMap)) {
        if (fieldName && row[csvCol]) out[fieldName] = row[csvCol];
      }
      return out;
    });

    const r = await fetch("/api/crm/import", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ rows: mapped }),
    });
    const d = await r.json() as ImportResult;
    setResult(d);
    setImporting(false);
    setStep("done");
  };

  const reset = () => { setFile(null); setHeaders([]); setRows([]); setColumnMap({}); setStep("upload"); setResult(null); };

  const downloadSample = () => {
    const csv = `name,email,phone,company,website,service_interest,notes\nJohn Doe,john@example.com,555-1234,Acme Corp,https://acme.com,Website,Interested in redesign\nJane Smith,jane@smith.biz,555-5678,Smith LLC,,CRM System,Cold outreach lead`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sample-leads.csv"; a.click();
  };

  const CRM_FIELDS = ["name","email","phone","company","website","service_interest","notes","— skip —"];

  return (
    <CrmLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-foreground">Import Leads</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Upload a CSV file to bulk import leads. Duplicates are skipped automatically.</p>
        </div>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer ${dragOver ? "border-foreground bg-foreground/5" : "border-gray-200 hover:border-gray-400"}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.name.endsWith(".csv")) handleFile(f); }}
              onClick={() => document.getElementById("csv-input")?.click()}
            >
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-foreground">Drop your CSV file here, or click to browse</p>
              <p className="text-sm text-muted-foreground mt-1">Only .csv files supported</p>
              <input id="csv-input" type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900">Need a template?</p>
                <p className="text-sm text-blue-700 mt-0.5">Download our sample CSV with the correct column format.</p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={downloadSample}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Sample CSV
              </Button>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{file?.name} — {rows.length} rows detected</span>
                <button onClick={reset} className="ml-auto text-gray-400 hover:text-red-500"><X className="w-4 h-4"/></button>
              </div>

              <p className="text-sm font-semibold text-foreground mb-3">Map CSV columns to CRM fields</p>
              <div className="space-y-2">
                {headers.map(header => (
                  <div key={header} className="flex items-center gap-3">
                    <div className="w-40 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-foreground font-mono truncate">{header}</div>
                    <span className="text-muted-foreground text-sm">→</span>
                    <select
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                      value={columnMap[header] || "— skip —"}
                      onChange={e => setColumnMap(m => ({ ...m, [header]: e.target.value === "— skip —" ? "" : e.target.value }))}
                    >
                      {CRM_FIELDS.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview first 3 rows */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-sm font-semibold text-foreground mb-3">Preview (first 3 rows)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {headers.map(h => <th key={h} className="text-left py-1 px-2 text-muted-foreground font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0,3).map((row,i) => (
                      <tr key={i} className="border-b border-gray-50">
                        {headers.map(h => <td key={h} className="py-1.5 px-2 text-foreground">{row[h]||""}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={doImport} disabled={importing} className="gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {importing ? `Importing ${rows.length} rows…` : `Import ${rows.length} Leads`}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-serif font-bold text-foreground mb-2">Import Complete</h2>
            <div className="flex justify-center gap-8 my-5">
              <div>
                <p className="text-3xl font-bold text-green-600">{result.imported}</p>
                <p className="text-sm text-muted-foreground">Imported</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-yellow-600">{result.skipped}</p>
                <p className="text-sm text-muted-foreground">Skipped (duplicates)</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-red-600"/><p className="text-sm font-semibold text-red-800">Errors ({result.errors.length})</p></div>
                {result.errors.slice(0,5).map((e,i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={reset}>Import Another File</Button>
              <Button onClick={() => navigate("/admin/crm/leads")}>View Leads</Button>
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
