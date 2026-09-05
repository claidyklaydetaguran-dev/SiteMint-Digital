import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { CrmLayout } from "@/pages/crm/CrmLayout";
import { ArrowLeft, Building2 } from "lucide-react";
import { adminGet, isDenied, isNotProvided, AdminApiError } from "@/lib/adminFetch";
import { OpsSpinner, OpsError, OpsDenied, OpsNotProvided, stateBadge, formatSeconds } from "./opsShared";

// GET /api/admin/voice/firms/:id/diagnostics — a NEW route. Every field below
// is optional/nullable; an older backend may 404 the whole route, or return
// a payload missing any of these nested objects.

interface DiagFirm {
  id?: number | string;
  name?: string;
  planTier?: string;
}

interface DiagSubscription {
  state?: string;
  planCode?: string;
}

interface DiagUsage {
  period?: string;
  callCount?: number;
  totalSeconds?: number;
  includedMinutes?: number;
}

interface DiagNumber {
  id?: number | string;
  phoneNumberDisplay?: string;
  state?: string;
  assistantId?: string;
}

interface Diagnostics {
  firm?: DiagFirm;
  subscription?: DiagSubscription | null;
  usage?: DiagUsage | null;
  capState?: { state?: string; pauseRequestedAt?: string } | null;
  openIssueCount?: number;
  numbers?: DiagNumber[];
}

type CopyState = "idle" | "copied" | "error";

export default function CrmOpsFirmDetail() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notProvided, setNotProvided] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const load = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    setError(null);
    setDenied(false);
    setNotProvided(false);
    try {
      const result = await adminGet<Diagnostics>(`/api/admin/voice/firms/${params.id}/diagnostics`);
      setData(result ?? null);
    } catch (err) {
      if (isNotProvided(err)) {
        setNotProvided(true);
      } else if (isDenied(err)) {
        setDenied(true);
      } else if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong loading this firm.");
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const firmName = data?.firm?.name || `Firm #${params.id ?? "?"}`;
  const firstNumber = data?.numbers?.[0];
  const openIssueCount = data?.openIssueCount ?? 0;

  const copySummary = async () => {
    const lines = [
      `Firm: ${firmName}`,
      `Plan: ${data?.firm?.planTier || data?.subscription?.planCode || "Not reported"}`,
      `Subscription state: ${data?.subscription?.state || "Not reported"}`,
      `Usage period: ${data?.usage?.period || "Not reported"}`,
      `Calls this period: ${data?.usage?.callCount ?? "Not reported"}`,
      `Open issues: ${openIssueCount}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  return (
    <CrmLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <Link href="/admin/ops/firms">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer mb-4">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Firms
          </span>
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{loading ? "Loading…" : firmName}</h1>
            <p className="text-sm text-muted-foreground">Receptionist Ops — firm diagnostics</p>
          </div>
        </div>

        {loading && <OpsSpinner />}
        {!loading && denied && <OpsDenied />}
        {!loading && !denied && notProvided && <OpsNotProvided thing="firm diagnostics" />}
        {!loading && !denied && !notProvided && error && (
          <OpsError message={error} onRetry={() => void load()} />
        )}

        {!loading && !denied && !notProvided && !error && (
          <div className="space-y-4">
            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Activation / readiness</h2>
              {data?.subscription ? (
                <div className="flex items-center gap-3 flex-wrap">
                  {stateBadge(data.subscription.state)}
                  <span className="text-sm text-muted-foreground">
                    Plan: {data.subscription.planCode || "Not reported"}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not reported</p>
              )}
            </section>

            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Assigned number</h2>
              {firstNumber ? (
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  <span className="font-mono text-foreground">{firstNumber.phoneNumberDisplay || "—"}</span>
                  {stateBadge(firstNumber.state)}
                  {firstNumber.assistantId ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 font-semibold">
                      Assigned
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border font-semibold">
                      Not assigned
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not reported</p>
              )}
            </section>

            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Calendar status</h2>
              {/* Intentional: the diagnostics endpoint contract has no calendar
                  field yet — the backend doesn't expose calendar status here. */}
              <p className="text-sm text-muted-foreground">Not reported</p>
            </section>

            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Usage</h2>
              {data?.usage ? (
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Period</dt>
                    <dd className="text-foreground font-medium">{data.usage.period || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Calls</dt>
                    <dd className="text-foreground font-medium">{data.usage.callCount ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Total time</dt>
                    <dd className="text-foreground font-medium">{formatSeconds(data.usage.totalSeconds)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Included minutes</dt>
                    <dd className="text-foreground font-medium">{data.usage.includedMinutes ?? "—"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Not reported</p>
              )}
            </section>

            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Limits</h2>
              {data?.usage?.totalSeconds != null && data?.usage?.includedMinutes != null ? (
                <p className="text-sm text-foreground">
                  {formatSeconds(data.usage.totalSeconds)} used of {data.usage.includedMinutes} included minutes
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Not available</p>
              )}
            </section>

            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Open issues</h2>
              <Link href={`/admin/ops/issues?firmId=${params.id ?? ""}`}>
                <span className="text-sm text-blue-600 hover:underline cursor-pointer">
                  {openIssueCount} open issue{openIssueCount === 1 ? "" : "s"}
                </span>
              </Link>
            </section>

            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Recent failures</h2>
              {/* Intentional: this diagnostics contract doesn't define a
                  "recent failures" list — no failure feed exposed by this
                  endpoint yet. */}
              <p className="text-sm text-muted-foreground">Not reported — no failure feed exposed by this endpoint yet.</p>
            </section>

            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Support actions</h2>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => void copySummary()}
                  className="text-sm border border-border rounded-lg px-3 py-1.5 hover:bg-accent transition-colors text-foreground"
                >
                  {copyState === "copied" ? "Copied!" : "Copy support summary"}
                </button>
                <Link href="/admin/crm/dashboard">
                  <span className="text-sm border border-border rounded-lg px-3 py-1.5 hover:bg-accent transition-colors text-foreground cursor-pointer inline-block">
                    Open in Command Center
                  </span>
                </Link>
                {copyState === "error" && (
                  <span className="text-xs text-red-600">Couldn't copy — your browser blocked clipboard access.</span>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
