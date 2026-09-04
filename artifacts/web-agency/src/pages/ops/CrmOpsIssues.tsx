import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CrmLayout } from "@/pages/crm/CrmLayout";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { adminGet, adminPost, isDenied, isNotProvided, AdminApiError } from "@/lib/adminFetch";
import { OpsSpinner, OpsEmpty, OpsError, OpsDenied, OpsNotProvided, levelBadge, formatDate } from "./opsShared";

// GET /api/admin/voice/issues — a NEW route. Fields optional/nullable.
interface OpsIssue {
  id: number | string;
  firmId?: number | string;
  firmName?: string;
  level?: string;
  code?: string;
  message?: string;
  occurrences?: number;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string | null;
}

interface IssuesResponse {
  items?: OpsIssue[];
  count?: number;
}

export default function CrmOpsIssues() {
  const [issues, setIssues] = useState<OpsIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notProvided, setNotProvided] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // ?firmId= client-side pre-filter, e.g. arriving from the firm detail page's
  // "Open issues" link.
  const firmIdFilter = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("firmId");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    setNotProvided(false);
    try {
      const data = await adminGet<IssuesResponse>("/api/admin/voice/issues");
      setIssues(data?.items ?? []);
    } catch (err) {
      if (isNotProvided(err)) {
        setNotProvided(true);
      } else if (isDenied(err)) {
        setDenied(true);
      } else if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong loading issues.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = firmIdFilter ? issues.filter((i) => String(i.firmId ?? "") === firmIdFilter) : issues;

  const resolveIssue = async (id: number | string) => {
    setResolvingId(String(id));
    try {
      await adminPost(`/api/admin/voice/issues/${id}/resolve`);
      setIssues((prev) =>
        prev.map((i) => (String(i.id) === String(id) ? { ...i, resolvedAt: new Date().toISOString() } : i)),
      );
    } catch {
      // Leave the row as-is on failure; the Resolve button stays visible so
      // staff can retry.
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <CrmLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Receptionist Ops — Issues</h1>
              <p className="text-sm text-muted-foreground">Voice/SMS receptionist issues across customer firms</p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-gray-200 rounded-lg px-3 py-1.5 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {firmIdFilter && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-2 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1">
              Filtered to firm #{firmIdFilter}
              <Link href="/admin/ops/issues">
                <span className="underline cursor-pointer">Clear filter</span>
              </Link>
            </span>
          </div>
        )}

        {loading && <OpsSpinner />}
        {!loading && denied && <OpsDenied />}
        {!loading && !denied && notProvided && <OpsNotProvided thing="issues" />}
        {!loading && !denied && !notProvided && error && (
          <OpsError message={error} onRetry={() => void load()} />
        )}
        {!loading && !denied && !notProvided && !error && visible.length === 0 && (
          <OpsEmpty
            title="No issues found"
            hint={firmIdFilter ? "No issues match this firm." : "Nothing needs attention right now."}
          />
        )}

        {!loading && !denied && !notProvided && !error && visible.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Level", "Firm", "Code", "Message", "Occurrences", "Created", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visible.map((issue) => (
                    <tr key={String(issue.id)} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">{levelBadge(issue.level)}</td>
                      <td className="px-4 py-3 text-sm">
                        {issue.firmId ? (
                          <Link href={`/admin/ops/firms/${issue.firmId}`}>
                            <span className="text-blue-600 hover:underline cursor-pointer">
                              {issue.firmName || `Firm #${issue.firmId}`}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{issue.firmName || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-foreground">{issue.code || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">{issue.message || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{issue.occurrences ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(issue.createdAt)}</td>
                      <td className="px-4 py-3">
                        {issue.resolvedAt ? (
                          <span className="text-xs text-green-700 font-medium">Resolved</span>
                        ) : (
                          <button
                            onClick={() => void resolveIssue(issue.id)}
                            disabled={resolvingId === String(issue.id)}
                            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition-colors text-foreground disabled:opacity-50"
                          >
                            {resolvingId === String(issue.id) ? "Resolving…" : "Resolve"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card rows */}
            <div className="md:hidden space-y-2">
              {visible.map((issue) => (
                <div key={String(issue.id)} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    {levelBadge(issue.level)}
                    <span className="text-xs text-muted-foreground">{formatDate(issue.createdAt)}</span>
                  </div>
                  {issue.firmId ? (
                    <Link href={`/admin/ops/firms/${issue.firmId}`}>
                      <span className="text-sm font-medium text-blue-600 hover:underline cursor-pointer">
                        {issue.firmName || `Firm #${issue.firmId}`}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-foreground">{issue.firmName || "—"}</span>
                  )}
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{issue.code || "—"}</p>
                  <p className="text-sm text-foreground mt-1">{issue.message || "—"}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-muted-foreground">{issue.occurrences ?? "—"} occurrence(s)</span>
                    {issue.resolvedAt ? (
                      <span className="text-xs text-green-700 font-medium">Resolved</span>
                    ) : (
                      <button
                        onClick={() => void resolveIssue(issue.id)}
                        disabled={resolvingId === String(issue.id)}
                        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition-colors text-foreground disabled:opacity-50"
                      >
                        {resolvingId === String(issue.id) ? "Resolving…" : "Resolve"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </CrmLayout>
  );
}
