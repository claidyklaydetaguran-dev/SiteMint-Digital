/**
 * CRM Settings — what the server actually reported, and nothing else.
 *
 * This page used to manufacture its most alarming claim out of thin air. Every
 * read here (`/crm/phone/status`, `/crm/settings/status`, `/crm/phone/audit`)
 * was fired with `if (r.ok)` and no else, so a refusal left `phoneStatus` null
 * and `auditRows` empty — and the health panel then scored those absences as
 * findings and printed "CRM System Health 0% CRITICAL". Nobody had checked the
 * system and found it critical; the reads were refused. The same nulls told the
 * operator their forwarding number was not set and that Twilio was not
 * connected, which are statements about their business, not about the request.
 *
 * So: every read is a `Load`, a failure is stated in the words
 * `failureReason` gives it (a 401, a 403, a 404, a 5xx and an unreachable
 * server each read differently), and a check whose read did not succeed has no
 * status, no colour and no row in the score. If any check could not be run
 * there is no percentage and no verdict at all — an em dash and the names of
 * the checks that are missing.
 */

import { useState, useEffect, useCallback } from "react";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, AlertCircle, Shield, Bell,
  TestTube, Phone, CheckCircle, XCircle, Copy, RefreshCw,
  Search, Sparkles, Activity, HelpCircle,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, readAdminResource, responseFailureReason, failureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure, PageLoadFailures, dataOf, failedParts } from "@/components/crm/LoadState";

interface AuditRow {
  id: number;
  name: string;
  phone: string;
  normalizedPhone: string;
  issue: string;
  canAutoFix: boolean;
}

interface NormalizeResult {
  updated: number;
  skipped: number;
  errors: number;
}

interface PhoneStatus {
  configured: boolean;
  provider: string;
  businessNumber: string;
  forwardTo: string;
  normalizedForwardTo?: string;
  forwardingNumberLooksValid?: boolean;
  accountStatus: string | null;
  forwardConfigured: boolean;
  baseUrlMissing: boolean;
  webhookSecurityEnabled: boolean;
  webhookSecurityMode: "enabled" | "development-bypass" | "disabled-missing-secret";
  webhooks: {
    incomingSms: string;
    incomingVoice: string;
    voiceStatus: string;
    smsStatus: string;
  } | null;
}

type HStatus = "healthy" | "warning" | "action";

interface HealthCard {
  title: string;
  /** null when the read behind this check did not succeed — no verdict is invented. */
  status: HStatus | null;
  desc: string;
  action?: string;
}

/** The page relies on these fields; a body without them is a failure, not a default. */
function pickPhoneStatus(body: unknown): PhoneStatus | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Partial<PhoneStatus>;
  const shaped =
    typeof b.configured === "boolean" &&
    typeof b.forwardConfigured === "boolean" &&
    typeof b.baseUrlMissing === "boolean" &&
    typeof b.webhookSecurityMode === "string";
  return shaped ? (body as PhoneStatus) : undefined;
}

/**
 * The server's email mode.
 *
 * `null` is a real answer — a backend that responded without the field — and is
 * shown as "Unknown". A refused or unreachable request is not that: it comes
 * back as an error with its own reason.
 */
function pickEmailTestMode(body: unknown): boolean | null | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as { emailTestMode?: unknown }).emailTestMode;
  return typeof value === "boolean" ? value : null;
}

function pickAuditRows(body: unknown): AuditRow[] | undefined {
  const leads = body && typeof body === "object" ? (body as { leads?: unknown }).leads : undefined;
  return Array.isArray(leads) ? (leads as AuditRow[]) : undefined;
}

export default function CrmSettings() {
  // Server truth for CRM_EMAIL_TEST_MODE, the Twilio configuration, and the
  // lead phone audit. Each keeps what it last showed until its next answer
  // arrives, so a retry never flashes the page back to empty.
  const [phone, setPhone] = useState<Load<PhoneStatus>>({ status: "loading" });
  const [email, setEmail] = useState<Load<boolean | null>>({ status: "loading" });
  const [audit, setAudit] = useState<Load<AuditRow[]>>({ status: "loading" });
  const [statusBusy, setStatusBusy] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);

  const [testSmsTo, setTestSmsTo] = useState("");
  const [testSmsSending, setTestSmsSending] = useState(false);
  const [testSmsResult, setTestSmsResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeResult, setNormalizeResult] = useState<NormalizeResult | null>(null);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusBusy(true);
    const [nextPhone, nextEmail] = await Promise.all([
      readAdminResource("/api/crm/phone/status", pickPhoneStatus),
      readAdminResource("/api/crm/settings/status", pickEmailTestMode),
    ]);
    setPhone(nextPhone);
    setEmail(nextEmail);
    setStatusBusy(false);
  }, []);

  const runAudit = useCallback(async () => {
    setAuditBusy(true);
    const next = await readAdminResource("/api/crm/phone/audit", pickAuditRows);
    setAudit(next);
    // Pre-select all auto-fixable rows. A failed scan selects nothing rather
    // than leaving the previous run's ids armed against a list nobody can see.
    setSelectedIds(
      next.status === "ready"
        ? new Set(next.data.filter(l => l.canAutoFix).map(l => l.id))
        : new Set(),
    );
    setAuditBusy(false);
  }, []);

  const reloadAll = useCallback(() => {
    setNormalizeResult(null);
    setNormalizeError(null);
    void loadStatus();
    void runAudit();
  }, [loadStatus, runAudit]);

  useEffect(() => { reloadAll(); }, [reloadAll]);

  const sendTestSms = async () => {
    const to = testSmsTo.trim();
    if (!to) return;
    setTestSmsSending(true);
    setTestSmsResult(null);
    try {
      const r = await adminFetch("/api/crm/phone/test-sms", {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      if (!r.ok) {
        setTestSmsResult({ ok: false, msg: await responseFailureReason(r) });
      } else {
        const d = await r.json().catch(() => null) as { success?: boolean; error?: string; sid?: string } | null;
        if (d?.success) {
          setTestSmsResult({ ok: true, msg: d.sid ? `Test SMS sent. Twilio message SID ${d.sid}.` : "Test SMS sent." });
        } else {
          setTestSmsResult({
            ok: false,
            msg: d?.error ?? "The server answered, but did not confirm the message was sent.",
          });
        }
      }
    } catch {
      setTestSmsResult({ ok: false, msg: failureReason(null) });
    }
    setTestSmsSending(false);
  };

  const runNormalize = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setNormalizing(true);
    setNormalizeError(null);
    setNormalizeResult(null);
    try {
      const r = await adminFetch("/api/crm/phone/normalize", {
        method: "POST",
        body: JSON.stringify({ leadIds: ids }),
      });
      if (!r.ok) {
        setNormalizeError(await responseFailureReason(r));
      } else {
        const d = await r.json().catch(() => null) as Partial<NormalizeResult> | null;
        if (d && typeof d.updated === "number" && typeof d.skipped === "number" && typeof d.errors === "number") {
          const done: NormalizeResult = { updated: d.updated, skipped: d.skipped, errors: d.errors };
          // Re-scan first: the summary is set afterwards so the scan does not
          // wipe the only record of what just happened.
          await runAudit();
          setNormalizeResult(done);
        } else {
          setNormalizeError("The server's answer was not in the expected shape, so this page cannot say what changed. Re-scan to see the current state.");
        }
      }
    } catch {
      setNormalizeError(failureReason(null));
    }
    setNormalizing(false);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const phoneData = dataOf(phone);
  const auditRows = dataOf(audit);
  const rows = auditRows ?? [];
  const fixableRows = rows.filter(r => r.canAutoFix);
  const allFixableSelected = fixableRows.length > 0 && fixableRows.every(r => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allFixableSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        fixableRows.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        fixableRows.forEach(r => next.add(r.id));
        return next;
      });
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const isConnected = !!phoneData && phoneData.configured && phoneData.accountStatus === "active";
  const isError = !!phoneData && phoneData.configured && phoneData.accountStatus === "error";
  /** null when the status read did not succeed — not "false". */
  const twilioConfigured = phoneData ? phoneData.configured : null;

  // ── Health Center computations ──────────────────────────────────────────────
  // Every one of these is null unless the read behind it succeeded. A check
  // that was not run is not a passing check and not a failing one.
  const emailMode = email.status === "ready" ? email.data : undefined;
  const phoneNote = phone.status === "loading" ? "Still checking…" : phone.status === "error" ? phone.reason : "";

  const hTwilio: HStatus | null = phoneData
    ? (phoneData.configured && phoneData.accountStatus === "active" ? "healthy"
      : phoneData.configured ? "warning" : "action")
    : null;

  const hForward: HStatus | null = phoneData
    ? (phoneData.forwardConfigured && phoneData.forwardingNumberLooksValid !== false ? "healthy"
      : phoneData.forwardConfigured ? "warning" : "action")
    : null;

  const hSecurity: HStatus | null = phoneData
    ? (!phoneData.configured ? "warning"
      : phoneData.webhookSecurityMode === "enabled" ? "healthy"
      : phoneData.webhookSecurityMode === "development-bypass" ? "warning" : "action")
    : null;

  const hBaseUrl: HStatus | null = phoneData ? (phoneData.baseUrlMissing ? "action" : "healthy") : null;

  const hAudit: HStatus | null = auditRows
    ? (auditRows.length === 0 ? "healthy" : auditRows.length <= 3 ? "warning" : "action")
    : null;

  const hEmail: HStatus | null = emailMode === true ? "warning" : emailMode === false ? "healthy" : null;

  const healthCards: HealthCard[] = [
    {
      title: "Twilio SMS/Voice",
      status: hTwilio,
      desc: hTwilio === "healthy" ? "Account connected and active."
        : hTwilio === "warning" ? "Credentials set but account status unknown."
        : hTwilio === "action" ? "TWILIO_ACCOUNT_SID, AUTH_TOKEN, PHONE_NUMBER not set."
        : phoneNote,
      action: hTwilio && hTwilio !== "healthy" ? "Add Twilio env vars in Replit Secrets" : undefined,
    },
    {
      title: "Call Forwarding",
      status: hForward,
      desc: hForward === "healthy" ? "Forwarding number configured and valid."
        : hForward === "warning" ? "Set but may be invalid E.164 format."
        : hForward === "action" ? "FORWARD_TO_PHONE_NUMBER not set — calls won't ring your cell."
        : phoneNote,
      action: hForward && hForward !== "healthy" ? "Set FORWARD_TO_PHONE_NUMBER in E.164 format" : undefined,
    },
    {
      title: "Webhook Security",
      status: hSecurity,
      desc: !phoneData ? phoneNote
        : hSecurity === "healthy" ? "Signature validation active — webhooks are secure."
        : !phoneData.configured ? "Configure Twilio first to enable security."
        : phoneData.webhookSecurityMode === "development-bypass" ? "Dev bypass active — not suitable for production."
        : "TWILIO_AUTH_TOKEN missing — webhooks not validated.",
      action: hSecurity === "action" ? "Set TWILIO_AUTH_TOKEN to enable validation" : undefined,
    },
    {
      title: "Webhook Base URL",
      status: hBaseUrl,
      desc: hBaseUrl === "healthy" ? "CRM_BASE_URL set — Twilio can route inbound events."
        : hBaseUrl === "action" ? "CRM_BASE_URL missing — Twilio cannot deliver SMS or calls."
        : phoneNote,
      action: hBaseUrl === "action" ? "Set CRM_BASE_URL to your deployed domain" : undefined,
    },
    {
      title: "Phone Data Quality",
      status: hAudit,
      desc: audit.status === "ready"
        ? (audit.data.length === 0
          ? "All lead phone numbers are clean."
          : `${audit.data.length} number${audit.data.length === 1 ? "" : "s"} need attention.`)
        : audit.status === "loading" ? "Scanning lead phone numbers…" : audit.reason,
      action: hAudit && hAudit !== "healthy" && rows.length > 0
        ? "Fix issues in Phone Data Hygiene section below" : undefined,
    },
    {
      title: "Email Mode",
      status: hEmail,
      desc: emailMode === false ? "Live mode — emails deliver via Resend."
        : emailMode === true ? "Test mode on — emails are simulated, not sent to leads."
        : emailMode === null ? "Email mode unknown — the server did not report it."
        : email.status === "loading" ? "Still checking…" : email.status === "error" ? email.reason : "",
      action: hEmail === "warning" ? "Set CRM_EMAIL_TEST_MODE=false when ready to send" : undefined,
    },
  ];

  const uncheckable = healthCards.filter(c => c.status === null);
  // No score unless every check behind it actually ran. A percentage over the
  // checks that happened to load is still a claim about the whole system.
  const healthScore = uncheckable.length === 0
    ? Math.max(
        0,
        100
        - healthCards.filter(c => c.status === "warning").length * 15
        - healthCards.filter(c => c.status === "action").length * 30,
      )
    : null;
  const healthLabel =
    healthScore === null ? null :
    healthScore >= 90 ? "Excellent" :
    healthScore >= 70 ? "Good" :
    healthScore >= 50 ? "Needs Attention" : "Critical";
  const healthScoreColor =
    healthScore === null ? "text-muted-foreground" :
    healthScore >= 90 ? "text-emerald-700" :
    healthScore >= 70 ? "text-blue-700" :
    healthScore >= 50 ? "text-amber-700" : "text-red-700";
  const healthScoreBg =
    healthScore === null ? "bg-muted border-border" :
    healthScore >= 90 ? "bg-emerald-50 border-emerald-200" :
    healthScore >= 70 ? "bg-blue-50 border-blue-200" :
    healthScore >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const healthBarColor =
    healthScore === null ? "bg-muted" :
    healthScore >= 90 ? "bg-emerald-500" :
    healthScore >= 70 ? "bg-blue-500" :
    healthScore >= 50 ? "bg-amber-500" : "bg-red-500";
  // Real findings from checks that really ran — shown even when the overall
  // score is withheld, because each one is something somebody verified.
  const healthNextActions = [
    ...healthCards.filter(c => c.status === "action" && c.action),
    ...healthCards.filter(c => c.status === "warning" && c.action),
  ].slice(0, 3);

  const healthLoading = phone.status === "loading" || email.status === "loading" || audit.status === "loading";
  const busy = statusBusy || auditBusy;

  return (
    <CrmLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm mt-0.5">CRM configuration and integrations</p>
        </div>

        <PageLoadFailures
          failures={failedParts([
            ["Twilio settings", phone],
            ["Email mode", email],
            ["Phone number audit", audit],
          ])}
          onRetry={reloadAll}
          retrying={busy}
        />

        {/* ── CRM System Health ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">CRM System Health</h2>
            <button
              onClick={reloadAll}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh health check"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
              <span className="sr-only">Refresh health check</span>
            </button>
          </div>

          {/* Overall score — withheld entirely unless every check ran. */}
          <div className={`flex items-start gap-4 p-3.5 rounded-xl border mb-4 ${healthScoreBg}`}>
            <div className="text-center shrink-0 w-16">
              <p className={`text-3xl font-bold leading-none ${healthScoreColor}`}>
                <Figure value={healthScore} loading={healthLoading} />
                {healthScore !== null && <span className="text-sm font-normal">%</span>}
              </p>
              <p className={`text-[10px] font-bold mt-1 uppercase tracking-wide ${healthScoreColor}`}>
                {healthLabel ?? "Not scored"}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              {healthScore !== null ? (
                <div className="h-1.5 w-full bg-white/70 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-1.5 rounded-full ${healthBarColor} transition-all duration-500`}
                    style={{ width: `${healthScore}%` }}
                  />
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-muted-foreground mb-1.5 break-words">
                  {healthLoading && uncheckable.length === healthCards.length
                    ? "Checking. Nothing has been scored yet."
                    : `Not scored — ${uncheckable.map(c => c.title).join(", ")} could not be checked, so there is no overall verdict.`}
                </p>
              )}
              {healthNextActions.length > 0 ? (
                <div className="space-y-0.5">
                  {healthNextActions.map((a, i) => (
                    <p key={i} className={`text-[10px] leading-snug break-words ${healthScoreColor}`}>
                      {i + 1}. {a.action}
                    </p>
                  ))}
                </div>
              ) : healthScore !== null ? (
                <p className={`text-[10px] font-medium ${healthScoreColor}`}>All systems configured ✓</p>
              ) : null}
            </div>
          </div>

          {/* Health cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {healthCards.map(card => {
              const cardBg = card.status === "healthy" ? "bg-emerald-50 border-emerald-200"
                : card.status === "warning" ? "bg-amber-50 border-amber-200"
                : card.status === "action" ? "bg-red-50 border-red-200"
                : "bg-muted border-border";
              const cardLabel = card.status === "healthy" ? "Healthy"
                : card.status === "warning" ? "Warning"
                : card.status === "action" ? "Action Needed"
                : "Not checked";
              const labelColor = card.status === "healthy" ? "text-emerald-700"
                : card.status === "warning" ? "text-amber-700"
                : card.status === "action" ? "text-red-700"
                : "text-muted-foreground";
              const icon = card.status === "healthy"
                ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                : card.status === "warning"
                ? <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                : card.status === "action"
                ? <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                : <HelpCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
              return (
                <div key={card.title} className={`rounded-xl border p-3 min-w-0 ${cardBg}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {icon}
                    <span className={`text-[10px] font-semibold ${labelColor}`}>{cardLabel}</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground leading-tight mb-0.5 break-words">{card.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug break-words">{card.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Email settings */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TestTube className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Email Settings</h2>
          </div>
          <div className="space-y-4">
            {email.status === "error" ? (
              <LoadFailure
                what="Email mode"
                reason={email.reason}
                onRetry={() => { void loadStatus(); }}
                retrying={statusBusy}
              />
            ) : (
              <div className={`flex items-start justify-between gap-4 p-3 rounded-lg border ${
                emailMode === false ? "bg-green-50 border-green-200"
                : emailMode === true ? "bg-yellow-50 border-yellow-200"
                : "bg-muted border-border"
              }`}>
                <div className="flex items-start gap-2 min-w-0">
                  <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${
                    emailMode === false ? "text-green-600"
                    : emailMode === true ? "text-yellow-600"
                    : "text-muted-foreground"
                  }`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${
                      emailMode === false ? "text-green-900"
                      : emailMode === true ? "text-yellow-900"
                      : "text-foreground"
                    }`}>Email Test Mode</p>
                    <p className={`text-xs mt-0.5 break-words ${
                      emailMode === false ? "text-green-700"
                      : emailMode === true ? "text-yellow-700"
                      : "text-muted-foreground"
                    }`}>
                      {emailMode === false
                        ? "Off — emails deliver to leads via Resend."
                        : emailMode === true
                          ? "On — emails are logged in the activity timeline but NOT actually sent."
                          : emailMode === null
                            ? "Unknown — this backend does not report the email mode."
                            : "Checking with the server…"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 break-words">
                      Controlled by the server's <code className="bg-muted px-1 rounded">CRM_EMAIL_TEST_MODE</code> environment
                      variable — it cannot be changed from this page.
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  emailMode === false ? "bg-green-100 text-green-700"
                  : emailMode === true ? "bg-yellow-100 text-yellow-700"
                  : "bg-muted text-muted-foreground"
                }`}>
                  {emailMode === false ? "LIVE"
                    : emailMode === true ? "TEST"
                    : emailMode === null ? "UNKNOWN"
                    : <Figure value={null} loading />}
                </span>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">From Email Address</label>
              <div className="px-3 py-2 bg-muted border border-border rounded-lg text-sm text-muted-foreground break-words">
                SiteMint Digital Solutions &lt;noreply@sitemintdigital.com&gt;
              </div>
              <p className="text-xs text-muted-foreground/70 mt-1">Set via <code className="bg-muted px-1 rounded">RESEND_FROM_EMAIL</code> environment variable.</p>
            </div>
          </div>
        </div>

        {/* Phone / SMS — Twilio Integration */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Phone &amp; SMS — Twilio Integration</h2>
            <div className="ml-auto flex items-center gap-2">
              {phone.status === "loading" ? (
                <span className="text-xs text-muted-foreground">Checking…</span>
              ) : phone.status === "error" ? (
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                  Status unavailable
                </span>
              ) : isConnected ? (
                <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  <CheckCircle className="w-3 h-3" /> Connected
                </span>
              ) : isError ? (
                <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  <XCircle className="w-3 h-3" /> Auth Error
                </span>
              ) : twilioConfigured ? (
                <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                  <AlertCircle className="w-3 h-3" /> Partially Configured
                </span>
              ) : (
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Not Connected</span>
              )}
              <button
                onClick={() => { void loadStatus(); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${statusBusy ? "animate-spin" : ""}`} />
                <span className="sr-only">Refresh Twilio status</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            SiteMint CRM uses a dedicated Twilio business number. Incoming calls are forwarded to your cell.
            All calls and texts are logged to the correct lead profile automatically.
          </p>

          {/* How it works */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-xs font-semibold text-blue-900 mb-2">How this works</p>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>📞 <strong>Inbound calls</strong> — Lead calls your Twilio number → CRM logs it → call forwards to your cell</li>
              <li>💬 <strong>Inbound SMS</strong> — Lead texts your Twilio number → CRM logs it → appears in Inbox</li>
              <li>📤 <strong>Outbound SMS</strong> — You send from CRM → message delivered from your Twilio number</li>
              <li>🌉 <strong>Outbound calls (bridge)</strong> — CRM calls your cell first, then connects you to the lead</li>
              <li>🔕 <strong>Opt-out</strong> — STOP messages are automatically honored and recorded per lead</li>
            </ul>
          </div>

          {/* Config display (read-only, set via env vars).
              When the status read failed there is nothing to display and no way
              to tell whether anything is configured — so the panel says that
              instead of printing "Not set" over every field. */}
          {phone.status === "error" ? (
            <LoadFailure
              what="Twilio settings"
              reason={phone.reason}
              onRetry={() => { void loadStatus(); }}
              retrying={statusBusy}
              className="mb-4"
            />
          ) : (
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Provider</label>
                  <div className="px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground capitalize break-words">
                    {phoneData
                      ? (phoneData.provider || "twilio")
                      : <Figure value={null} loading={phone.status === "loading"} />}
                  </div>
                </div>
                <div className="min-w-0">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Account Status</label>
                  <div className={`px-3 py-2 border rounded-lg text-sm capitalize break-words ${isConnected ? "bg-green-50 border-green-200 text-green-700" : "bg-muted border-border text-muted-foreground"}`}>
                    {phoneData
                      ? (phoneData.accountStatus ?? (phoneData.configured ? "Unknown" : "Not configured"))
                      : <Figure value={null} loading={phone.status === "loading"} />}
                  </div>
                </div>
                <div className="min-w-0">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Business Phone Number</label>
                  <div className="px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground font-mono break-all">
                    {phoneData
                      ? (phoneData.businessNumber || <span className="font-sans text-muted-foreground">Not set</span>)
                      : <Figure value={null} loading={phone.status === "loading"} />}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Set via <code className="bg-muted px-0.5 rounded">TWILIO_PHONE_NUMBER</code></p>
                </div>
                <div className="sm:col-span-2 min-w-0">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Forward-to Number (Your Cell)
                  </label>

                  {/* Not configured warning — only when the server said so. */}
                  {phoneData && !phoneData.forwardConfigured && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-2">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 font-medium min-w-0 break-words">
                        Inbound calls will not ring your cell phone unless forwarding is configured.
                        Set <code className="bg-red-100 px-0.5 rounded">FORWARD_TO_PHONE_NUMBER</code> to your mobile number.
                      </p>
                    </div>
                  )}

                  {/* Current value display */}
                  {phoneData ? (
                    <div className={`px-3 py-2 border rounded-lg text-sm font-mono break-all ${
                      phoneData.forwardConfigured
                        ? phoneData.forwardingNumberLooksValid === false
                          ? "bg-amber-50 border-amber-200 text-amber-700"
                          : "bg-muted border-border text-foreground"
                        : "bg-red-50 border-red-200 text-red-600"
                    }`}>
                      {phoneData.forwardTo
                        ? <>
                            {phoneData.forwardTo}
                            {phoneData.normalizedForwardTo && phoneData.normalizedForwardTo !== phoneData.forwardTo && (
                              <span className="text-[10px] font-sans text-amber-700 ml-2">
                                (normalizes to {phoneData.normalizedForwardTo})
                              </span>
                            )}
                          </>
                        : <span className="font-sans font-medium">⚠ Not set — calls won't forward to your cell</span>
                      }
                    </div>
                  ) : (
                    <div className="px-3 py-2 border border-border bg-muted rounded-lg text-sm font-mono text-muted-foreground">
                      <Figure value={null} loading={phone.status === "loading"} />
                    </div>
                  )}

                  {/* Format guidance */}
                  <div className="mt-1.5 text-[10px] text-muted-foreground space-y-0.5">
                    <p>Set via <code className="bg-muted px-0.5 rounded">FORWARD_TO_PHONE_NUMBER</code> environment variable</p>
                    <p className="break-words">
                      <span className="font-semibold">Format examples:</span>{" "}
                      US: <code className="bg-muted px-0.5 rounded">+19498806515</code>{" "}
                      · PH: <code className="bg-muted px-0.5 rounded">+639186069624</code>
                    </p>
                    <p className="text-[10px] text-muted-foreground">Always use E.164 format (+ followed by country code and number, no spaces or dashes).</p>
                  </div>

                  {/* Valid number confirmation */}
                  {phoneData?.forwardConfigured && phoneData.forwardingNumberLooksValid && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="text-[10px] text-emerald-700 font-medium">Forwarding number looks valid</span>
                    </div>
                  )}
                  {phoneData?.forwardConfigured && phoneData.forwardingNumberLooksValid === false && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <AlertCircle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                      <span className="text-[10px] text-amber-700 font-medium min-w-0 break-words">Number format may be invalid — check E.164 formatting above</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Webhook Security */}
              {phoneData?.configured && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted border border-border">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">Webhook Signature Validation</p>
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                      Protects the CRM from fake SMS/call posts by verifying Twilio's request signature on every inbound webhook.
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 mt-0.5 ${
                    phoneData.webhookSecurityMode === "enabled"
                      ? "bg-green-100 text-green-700"
                      : phoneData.webhookSecurityMode === "development-bypass"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-red-100 text-red-700"
                  }`}>
                    {phoneData.webhookSecurityMode === "enabled"
                      ? "Enabled"
                      : phoneData.webhookSecurityMode === "development-bypass"
                      ? "Dev Bypass"
                      : "Disabled"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Webhook URLs */}
          {phoneData?.configured && !phoneData.webhooks && (
            <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 min-w-0 break-words">
                <strong>CRM_BASE_URL not set</strong> — webhook URLs cannot be generated.
                Without this, Twilio cannot deliver inbound SMS or call logs to the CRM.
                Set <code className="bg-amber-100 px-0.5 rounded">CRM_BASE_URL</code> to your deployed domain (e.g. <code className="bg-amber-100 px-0.5 rounded">https://yourapp.replit.app</code>).
              </p>
            </div>
          )}
          {phoneData?.webhooks && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-foreground mb-2">
                Twilio Webhook URLs
                <span className="ml-1 font-normal text-muted-foreground">(copy these into your Twilio console)</span>
              </p>
              <div className="space-y-2">
                {([
                  { label: "Incoming SMS", key: "incomingSms", url: phoneData.webhooks.incomingSms },
                  { label: "Incoming Voice", key: "incomingVoice", url: phoneData.webhooks.incomingVoice },
                  { label: "Voice Status", key: "voiceStatus", url: phoneData.webhooks.voiceStatus },
                  { label: "SMS Delivery Status", key: "smsStatus", url: phoneData.webhooks.smsStatus },
                ] as const).map(({ label, key, url }) => (
                  <div key={key} className="flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
                      <p className="text-xs font-mono text-foreground truncate">{url}</p>
                    </div>
                    <button onClick={() => copyToClipboard(url, key)} className="text-muted-foreground hover:text-foreground shrink-0" title="Copy URL">
                      {copied === key ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="sr-only">Copy the {label} webhook URL</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test SMS */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground">Test SMS</p>
            <p className="text-xs text-muted-foreground">Send a test text to verify your Twilio setup. Enter any phone number.</p>
            <div className="flex flex-wrap gap-2">
              <input
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 font-mono"
                placeholder="+1 (949) 555-0000"
                aria-label="Phone number to send the test SMS to"
                value={testSmsTo}
                onChange={e => setTestSmsTo(e.target.value)}
              />
              <Button
                size="sm"
                onClick={sendTestSms}
                disabled={testSmsSending || twilioConfigured === false || phone.status === "loading" || !testSmsTo.trim()}
                className="gap-1.5 shrink-0"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {testSmsSending ? "Sending…" : "Send Test"}
              </Button>
            </div>
            {twilioConfigured === false && (
              <p className="text-xs text-muted-foreground break-words">Twilio not configured. Add <code className="bg-muted px-0.5 rounded">TWILIO_ACCOUNT_SID</code>, <code className="bg-muted px-0.5 rounded">TWILIO_AUTH_TOKEN</code>, and <code className="bg-muted px-0.5 rounded">TWILIO_PHONE_NUMBER</code> to your environment secrets.</p>
            )}
            {phone.status === "error" && (
              // The settings read failed, so this page cannot say whether Twilio
              // is configured — and must not disable the control as if it knew.
              // A send is self-verifying: the result below is the real answer.
              <p className="text-xs text-muted-foreground break-words">
                The Twilio setup could not be checked, so this page cannot say whether it is configured. Sending a test will show what happens.
              </p>
            )}
            {testSmsResult && (
              <div
                role="alert"
                className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${testSmsResult.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}
              >
                {testSmsResult.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                <span className="min-w-0 break-words">{testSmsResult.msg}</span>
              </div>
            )}
          </div>

          {/* Setup instructions */}
          <div className="mt-4 bg-muted border border-border rounded-lg p-4">
            <p className="text-xs font-semibold text-foreground mb-2">Required environment variables</p>
            <div className="space-y-1.5 text-xs font-mono">
              {[
                ["PHONE_PROVIDER", "twilio"],
                ["TWILIO_ACCOUNT_SID", "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"],
                ["TWILIO_AUTH_TOKEN", "your_auth_token"],
                ["TWILIO_PHONE_NUMBER", "+19495550000"],
                ["FORWARD_TO_PHONE_NUMBER", "+19495551234"],
                ["CRM_BASE_URL", "https://yourdomain.replit.app"],
              ].map(([k, v]) => (
                // These example values are unbreakable tokens — a 34-character
                // Twilio SID has no space or hyphen in it — so without
                // `break-all` the row sets a 427px min-content width that the
                // page then clips on a phone rather than scrolling.
                <div key={k} className="flex flex-wrap gap-2 min-w-0">
                  <span className="text-foreground font-semibold">{k}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-blue-600 break-all min-w-0">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              After adding env vars, also configure webhook URLs in your{" "}
              <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Twilio Console</a>{" "}
              under Phone Numbers → Active Numbers → your number.
            </p>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-semibold text-amber-900 mb-1">⚠️ Important: SMS Compliance</p>
            <ul className="text-xs text-amber-800 space-y-0.5">
              <li>• Always get opt-in consent before sending SMS to leads</li>
              <li>• Leads who reply STOP will be automatically opted out</li>
              <li>• Call recording is disabled by default (requires legal compliance)</li>
              <li>• API credentials are stored server-side only — never exposed to browser</li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            📍 SMS delivery status (Delivered, Failed, Undelivered) is updated via Twilio status callbacks.
            This requires <code className="bg-muted px-0.5 rounded">CRM_BASE_URL</code> to be configured and
            webhook URLs set in your Twilio Console.
          </p>
        </div>

        {/* Phone Data Hygiene */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Search className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Phone Data Hygiene</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Scan all lead phone numbers for formatting issues and normalize them to E.164 format in bulk.
            Only confidently recognized numbers will be updated.
          </p>

          {/* Run audit button + result summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setNormalizeResult(null); setNormalizeError(null); void runAudit(); }}
              disabled={auditBusy}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditBusy ? "animate-spin" : ""}`} />
              {auditBusy ? "Scanning…" : auditRows ? "Re-scan" : "Run Phone Audit"}
            </Button>
            {/* A count only exists when the scan itself came back. */}
            {auditRows && !auditBusy && (
              <span className="text-xs text-muted-foreground min-w-0 break-words">
                {auditRows.length === 0
                  ? "✓ All phone numbers look clean"
                  : `${auditRows.length} number${auditRows.length === 1 ? "" : "s"} need attention · ${fixableRows.length} can be auto-fixed`}
              </span>
            )}
          </div>

          {/* The scan itself failed — no rows, and no claim that there are none. */}
          {audit.status === "error" && (
            <LoadFailure
              what="The phone number audit"
              reason={audit.reason}
              onRetry={() => { void runAudit(); }}
              retrying={auditBusy}
              variant="inline"
              className="mt-3"
            />
          )}

          {/* A normalize that did not go through */}
          {normalizeError && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 text-xs rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-destructive" />
              <span className="min-w-0 break-words text-foreground">
                <span className="font-medium">Normalizing did not finish.</span> {normalizeError} Re-scan to see the current state.
              </span>
            </div>
          )}

          {/* Success banner after normalize */}
          {normalizeResult && (
            <div className="mt-3 flex items-start gap-2 text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">
                Done — <strong>{normalizeResult.updated}</strong> updated,{" "}
                <strong>{normalizeResult.skipped}</strong> skipped
                {normalizeResult.errors > 0 && `, ${normalizeResult.errors} error${normalizeResult.errors === 1 ? "" : "s"}`}.
              </span>
            </div>
          )}

          {/* Audit preview table */}
          {auditRows && auditRows.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  Preview ({auditRows.length} {auditRows.length === 1 ? "lead" : "leads"})
                </p>
                {fixableRows.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    {allFixableSelected ? "Deselect all fixable" : "Select all fixable"}
                  </button>
                )}
              </div>

              {/* `overflow-hidden` clipped this table rather than letting it
                  scroll, so on a narrow screen the right-hand columns were cut
                  off with no way to reach them. `overflow-x-auto` keeps the
                  rounded corners and makes the content reachable. */}
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full text-xs min-w-[34rem]">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="w-8 px-3 py-2 text-left">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-foreground">Lead</th>
                      <th className="px-3 py-2 text-left font-semibold text-foreground">Current</th>
                      <th className="px-3 py-2 text-left font-semibold text-foreground">Suggested</th>
                      <th className="px-3 py-2 text-left font-semibold text-foreground">Issue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {auditRows.map(row => (
                      <tr key={row.id} className={`${selectedIds.has(row.id) ? "bg-blue-50/40" : ""}`}>
                        <td className="px-3 py-2">
                          {row.canAutoFix ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggleSelect(row.id)}
                              aria-label={`Select ${row.name} for normalizing`}
                              className="rounded border-input text-foreground focus:ring-foreground/30 cursor-pointer"
                            />
                          ) : (
                            <span className="text-muted-foreground/40 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground max-w-[120px] truncate">
                          {row.name}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{row.phone}</td>
                        <td className="px-3 py-2 font-mono">
                          {row.canAutoFix ? (
                            <span className="text-green-700">{row.normalizedPhone}</span>
                          ) : (
                            <span className="text-muted-foreground/60 text-[11px]">Manual review needed</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            row.canAutoFix
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {row.issue}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Normalize selected button */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  size="sm"
                  onClick={runNormalize}
                  disabled={normalizing || selectedIds.size === 0}
                  className="gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {normalizing
                    ? "Normalizing…"
                    : `Normalize Selected (${selectedIds.size})`}
                </Button>
                <p className="text-[11px] text-muted-foreground min-w-0 break-words">
                  Only confidently recognized numbers will be updated. Unrecognized formats are skipped.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Security */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Security</h2>
          </div>
          <div className="space-y-3 text-sm">
            {[
              { color: "bg-green-500", title: "CRM is protected behind admin authentication", sub: "All /api/crm/* endpoints require a valid Bearer token." },
              { color: "bg-green-500", title: "API keys are stored as environment variables", sub: "Resend, Twilio and session secrets are never exposed to the frontend." },
              { color: "bg-green-500", title: "Admin password is fail-closed", sub: "There is no default password. If ADMIN_PASSWORD is unset, admin login is unavailable (503) rather than guessable." },
              { color: "bg-yellow-500", title: "One shared staff identity", sub: "Everyone signs in with the same password — per-staff accounts, roles, and password recovery are not built yet." },
            ].map(({ color, title, sub }) => (
              <div key={title} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full ${color} mt-1.5 shrink-0`} />
                <div className="min-w-0">
                  <p className="font-medium text-foreground break-words">{title}</p>
                  <p className="text-xs text-muted-foreground break-words">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Team Members</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Static directory. Team members do not have individual logins yet — task and lead
            "Assigned" fields reference these names as plain text.
          </p>
          <div className="space-y-2">
            {[
              { name: "Claidy Taguran", role: "Technical Director" },
              { name: "Shasta Greene", role: "Head of Strategy" },
              { name: "Saisa Lorraigne", role: "Project & Admin Manager" },
            ].map(m => (
              <div key={m.name} className="flex items-center gap-3 p-2.5 bg-muted rounded-lg">
                <div className="w-8 h-8 bg-foreground/10 rounded-full flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                  {m.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground break-words">{m.name}</p>
                  <p className="text-xs text-muted-foreground break-words">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </CrmLayout>
  );
}
