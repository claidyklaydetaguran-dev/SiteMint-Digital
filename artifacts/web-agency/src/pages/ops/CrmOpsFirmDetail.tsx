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
  /** What the diagnostics route actually returns. */
  phoneE164?: string;
  phoneNumberDisplay?: string;
  state?: string;
  assistantId?: string;
}

interface Diagnostics {
  firm?: DiagFirm;
  firmId?: number;
  /** The route reports the usage period at the top level, not inside `usage`. */
  period?: string;
  subscription?: DiagSubscription | null;
  usage?: DiagUsage | null;
  capState?: { state?: string; capMinutes?: number | null; pauseRequestedAt?: string } | null;
  /** The route's name for the count. `openIssueCount` is what this page used to expect. */
  openIssues?: number;
  openIssueCount?: number;
  numbers?: DiagNumber[];
}

type CopyState = "idle" | "copied" | "error";

export default function CrmOpsFirmDetail() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The refusal itself, so the page can name the permission that is missing.
  const [denied, setDenied] = useState<AdminApiError | null>(null);
  const [notProvided, setNotProvided] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const load = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    setError(null);
    setDenied(null);
    setNotProvided(false);
    try {
      const result = await adminGet<Diagnostics>(`/api/admin/voice/firms/${params.id}/diagnostics`);
      setData(result ?? null);
    } catch (err) {
      if (isNotProvided(err)) {
        setNotProvided(true);
      } else if (isDenied(err)) {
        setDenied(err as AdminApiError);
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
  // Read the names the diagnostics route actually sends. This page used to read
  // `openIssueCount`, `usage.period`, `usage.includedMinutes` and
  // `phoneNumberDisplay` — none of which the route returns — so the moment staff
  // could load it, it said "0 open issues" and showed no number whatever was
  // true. A value the route does not report is shown as not reported, not zero.
  const openIssueCount: number | null = data?.openIssues ?? data?.openIssueCount ?? null;
  const usagePeriod = data?.period ?? data?.usage?.period;
  const capMinutes = data?.capState?.capMinutes ?? data?.usage?.includedMinutes ?? null;
  const numberDisplay = (n: DiagNumber) => n.phoneE164 || n.phoneNumberDisplay || "—";

  const copySummary = async () => {
    const lines = [
      `Firm: ${firmName}`,
      `Plan: ${data?.subscription?.planCode || data?.firm?.planTier || "Not reported"}`,
      `Subscription state: ${data?.subscription?.state || "Not reported"}`,
      `Usage period: ${usagePeriod || "Not reported"}`,
      `Calls this period: ${data?.usage?.callCount ?? "Not reported"}`,
      `Open issues: ${openIssueCount ?? "Not reported"}`,
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
        {!loading && denied && <OpsDenied error={denied} />}
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
                  <span className="font-mono text-foreground">{numberDisplay(firstNumber)}</span>
                  {stateBadge(firstNumber.state)}
                  {/* Only claim an assignment the route reports. It does not
                      send `assistantId`, so "Not assigned" was never evidence. */}
                  {firstNumber.assistantId ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 font-semibold">
                      Assigned
                    </span>
                  ) : null}
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
                    <dd className="text-foreground font-medium">{usagePeriod || "—"}</dd>
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
                    <dt className="text-xs text-muted-foreground">Minute cap</dt>
                    <dd className="text-foreground font-medium">{capMinutes ?? "—"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Not reported</p>
              )}
            </section>

            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Limits</h2>
              {data?.usage?.totalSeconds != null && capMinutes != null ? (
                <p className="text-sm text-foreground">
                  {formatSeconds(data.usage.totalSeconds)} used of a {capMinutes}-minute cap
                  {data?.capState?.state ? ` (${data.capState.state})` : ""}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Not available</p>
              )}
            </section>

            <section className="bg-white rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Open issues</h2>
              <Link href={`/admin/ops/issues?firmId=${params.id ?? ""}`}>
                <span className="text-sm text-blue-600 hover:underline cursor-pointer">
                  {openIssueCount == null
                    ? "Open issues not reported"
                    : `${openIssueCount} open issue${openIssueCount === 1 ? "" : "s"}`}
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
