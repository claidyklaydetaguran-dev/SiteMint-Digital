import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { CrmLayout } from "@/pages/crm/CrmLayout";
import { BarChart2, RefreshCw } from "lucide-react";
import { adminGet, isDenied, isNotProvided, AdminApiError } from "@/lib/adminFetch";
import {
  OpsSpinner,
  OpsEmpty,
  OpsError,
  OpsDenied,
  OpsNotProvided,
  stateBadge,
  formatSeconds,
  currentPeriod,
} from "./opsShared";

// GET /api/admin/voice/usage?period=YYYY-MM — a NEW route. Fields optional/nullable.
interface UsageRow {
  firmId?: number | string;
  firmName?: string;
  callCount?: number;
  totalSeconds?: number;
  includedMinutes?: number;
  capState?: string;
}

interface UsageResponse {
  period?: string;
  items?: UsageRow[];
}

export default function CrmOpsUsage() {
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notProvided, setNotProvided] = useState(false);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    setDenied(false);
    setNotProvided(false);
    try {
      const data = await adminGet<UsageResponse>(`/api/admin/voice/usage?period=${encodeURIComponent(p)}`);
      setRows(data?.items ?? []);
    } catch (err) {
      if (isNotProvided(err)) {
        setNotProvided(true);
      } else if (isDenied(err)) {
        setDenied(true);
      } else if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong loading usage.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  return (
    <CrmLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Receptionist Ops — Usage</h1>
              <p className="text-sm text-muted-foreground">Call volume and minutes by firm</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value || currentPeriod())}
              className="text-sm border border-border rounded-lg px-3 py-1.5 text-foreground"
            />
            <button
              onClick={() => void load(period)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors hover:bg-accent"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {loading && <OpsSpinner />}
        {!loading && denied && <OpsDenied />}
        {!loading && !denied && notProvided && <OpsNotProvided thing="usage" />}
        {!loading && !denied && !notProvided && error && (
          <OpsError message={error} onRetry={() => void load(period)} />
        )}
        {!loading && !denied && !notProvided && !error && rows.length === 0 && (
          <OpsEmpty title="No usage recorded for this period" />
        )}

        {!loading && !denied && !notProvided && !error && rows.length > 0 && (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted border-b border-border/60">
                <tr>
                  {["Firm", "Calls", "Total time", "Included minutes", "Cap state"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((row, idx) => (
                  <tr key={row.firmId != null ? String(row.firmId) : idx} className="hover:bg-accent transition-colors">
                    <td className="px-4 py-3 text-sm">
                      {row.firmId ? (
                        <Link href={`/admin/ops/firms/${row.firmId}`}>
                          <span className="text-blue-600 hover:underline cursor-pointer">
                            {row.firmName || `Firm #${row.firmId}`}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-foreground">{row.firmName || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{row.callCount ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{formatSeconds(row.totalSeconds)}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{row.includedMinutes ?? "—"}</td>
                    <td className="px-4 py-3">{stateBadge(row.capState)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
