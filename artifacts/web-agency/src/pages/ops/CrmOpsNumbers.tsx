import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { CrmLayout } from "@/pages/crm/CrmLayout";
import { Phone, RefreshCw } from "lucide-react";
import { adminGet, isDenied, isNotProvided, AdminApiError } from "@/lib/adminFetch";
import { OpsSpinner, OpsEmpty, OpsError, OpsDenied, OpsNotProvided, stateBadge } from "./opsShared";

// GET /api/admin/voice/numbers — a NEW route. Fields optional/nullable.
interface OpsNumber {
  id?: number | string;
  firmId?: number | string;
  firmName?: string;
  phoneNumberDisplay?: string;
  state?: string;
  assistantId?: string;
}

interface NumbersResponse {
  items?: OpsNumber[];
  count?: number;
}

export default function CrmOpsNumbers() {
  const [numbers, setNumbers] = useState<OpsNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notProvided, setNotProvided] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    setNotProvided(false);
    try {
      const data = await adminGet<NumbersResponse>("/api/admin/voice/numbers");
      setNumbers(data?.items ?? []);
    } catch (err) {
      if (isNotProvided(err)) {
        setNotProvided(true);
      } else if (isDenied(err)) {
        setDenied(true);
      } else if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong loading numbers.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <CrmLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Receptionist Ops — Numbers</h1>
              <p className="text-sm text-muted-foreground">Phone numbers provisioned for voice/SMS receptionist firms</p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors hover:bg-accent"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading && <OpsSpinner />}
        {!loading && denied && <OpsDenied />}
        {!loading && !denied && notProvided && <OpsNotProvided thing="numbers" />}
        {!loading && !denied && !notProvided && error && (
          <OpsError message={error} onRetry={() => void load()} />
        )}
        {!loading && !denied && !notProvided && !error && numbers.length === 0 && (
          <OpsEmpty title="No numbers found" />
        )}

        {!loading && !denied && !notProvided && !error && numbers.length > 0 && (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted border-b border-border/60">
                <tr>
                  {["Phone number", "Firm", "State", "Assistant assigned"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {numbers.map((n, idx) => (
                  <tr key={n.id != null ? String(n.id) : idx} className="hover:bg-accent transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{n.phoneNumberDisplay || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {n.firmId ? (
                        <Link href={`/admin/ops/firms/${n.firmId}`}>
                          <span className="text-blue-600 hover:underline cursor-pointer">
                            {n.firmName || `Firm #${n.firmId}`}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-foreground">{n.firmName || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{stateBadge(n.state)}</td>
                    <td className="px-4 py-3">
                      {n.assistantId ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 font-semibold">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border font-semibold">
                          No
                        </span>
                      )}
                    </td>
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
