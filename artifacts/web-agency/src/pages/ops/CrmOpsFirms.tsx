import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { CrmLayout } from "@/pages/crm/CrmLayout";
import { Building2, RefreshCw } from "lucide-react";
import { adminGet, isDenied, AdminApiError } from "@/lib/adminFetch";
import { OpsSpinner, OpsEmpty, OpsError, OpsDenied, firmHealthBadge, formatDate } from "./opsShared";

// This page reads the stable, already-live receptionist-accounts endpoint
// (also consumed by CrmReceptionistAccounts.tsx) — unlike the other four Ops
// pages, it is not expected to 404 on an older backend.

interface OpsFirm {
  id: number | string;
  name?: string;
  email?: string;
  twilioNumber?: string;
  planTier?: string;
  trialConversationsLimit?: number;
  conversationCount?: number;
  createdAt?: string;
}

interface FirmsResponse {
  accounts?: OpsFirm[];
}

export default function CrmOpsFirms() {
  const [firms, setFirms] = useState<OpsFirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const data = await adminGet<FirmsResponse>("/api/admin/receptionist-accounts");
      setFirms(data?.accounts ?? []);
    } catch (err) {
      if (isDenied(err)) {
        setDenied(true);
      } else if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong loading firms.");
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
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Receptionist Ops — Firms</h1>
              <p className="text-sm text-muted-foreground">Customer accounts on the AI Receptionist product</p>
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
        {!loading && !denied && error && <OpsError message={error} onRetry={() => void load()} />}
        {!loading && !denied && !error && firms.length === 0 && (
          <OpsEmpty
            title="No firms yet"
            hint="When businesses sign up for the AI Receptionist product, they'll appear here."
          />
        )}

        {!loading && !denied && !error && firms.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted border-b border-border/60">
                  <tr>
                    {["Name", "Plan", "Conversations", "Created", "Health"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {firms.map((f) => (
                    <tr key={String(f.id)} className="hover:bg-accent transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/admin/ops/firms/${f.id}`}>
                          <span className="text-sm font-medium text-blue-600 hover:underline cursor-pointer">
                            {f.name || `Firm #${f.id}`}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{f.planTier || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {f.conversationCount ?? "—"} / {f.trialConversationsLimit ?? "Unlimited"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(f.createdAt)}</td>
                      <td className="px-4 py-3">{firmHealthBadge(f.conversationCount, f.trialConversationsLimit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card rows */}
            <div className="md:hidden space-y-2">
              {firms.map((f) => (
                <Link key={String(f.id)} href={`/admin/ops/firms/${f.id}`}>
                  <div className="bg-white rounded-xl border border-border p-4 cursor-pointer active:bg-accent">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-blue-600">{f.name || `Firm #${f.id}`}</span>
                      {firmHealthBadge(f.conversationCount, f.trialConversationsLimit)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Plan: {f.planTier || "—"}</span>
                      <span>
                        {f.conversationCount ?? "—"} / {f.trialConversationsLimit ?? "Unlimited"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground/70 mt-1">Created {formatDate(f.createdAt)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </CrmLayout>
  );
}
