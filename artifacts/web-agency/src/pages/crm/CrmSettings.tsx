import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, AlertCircle, Settings, Shield, Bell,
  TestTube, Phone, CheckCircle, XCircle, Copy, RefreshCw,
  Search, Sparkles, Activity,
} from "lucide-react";

const tok = () => localStorage.getItem("adminToken") || "";

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

export default function CrmSettings() {
  const [, navigate] = useLocation();
  const [testMode, setTestMode] = useState(true);
  const [saved, setSaved] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus | null>(null);
  const [loadingPhone, setLoadingPhone] = useState(true);
  const [testSmsTo, setTestSmsTo] = useState("");
  const [testSmsSending, setTestSmsSending] = useState(false);
  const [testSmsResult, setTestSmsResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // ── Phone audit state ──────────────────────────────────────────────────────
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRan, setAuditRan] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeResult, setNormalizeResult] = useState<NormalizeResult | null>(null);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 3000); };

  const loadPhoneStatus = useCallback(async () => {
    setLoadingPhone(true);
    try {
      const r = await fetch("/api/crm/phone/status", { headers: { Authorization: `Bearer ${tok()}` } });
      if (r.ok) setPhoneStatus(await r.json() as PhoneStatus);
    } catch { /* ignore */ }
    setLoadingPhone(false);
  }, []);

  useEffect(() => {
    if (!tok()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
  }, [navigate]);

  useEffect(() => { loadPhoneStatus(); runAudit(); }, [loadPhoneStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendTestSms = async () => {
    if (!testSmsTo.trim()) return;
    setTestSmsSending(true);
    setTestSmsResult(null);
    try {
      const r = await fetch("/api/crm/phone/test-sms", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: testSmsTo.trim() }),
      });
      const d = await r.json() as { success?: boolean; error?: string; sid?: string };
      if (r.ok && d.success) {
        setTestSmsResult({ ok: true, msg: `Test SMS sent! SID: ${d.sid ?? ""}` });
      } else {
        setTestSmsResult({ ok: false, msg: d.error ?? "Failed to send" });
      }
    } catch (e) {
      setTestSmsResult({ ok: false, msg: String(e) });
    }
    setTestSmsSending(false);
  };

  const runAudit = async () => {
    setAuditLoading(true);
    setAuditError("");
    setNormalizeResult(null);
    setSelectedIds(new Set());
    try {
      const r = await fetch("/api/crm/phone/audit", {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as { leads: AuditRow[] };
      setAuditRows(d.leads);
      // Pre-select all auto-fixable rows
      setSelectedIds(new Set(d.leads.filter(l => l.canAutoFix).map(l => l.id)));
      setAuditRan(true);
    } catch (e) {
      setAuditError(String(e));
    }
    setAuditLoading(false);
  };

  const runNormalize = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setNormalizing(true);
    try {
      const r = await fetch("/api/crm/phone/normalize", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ids }),
      });
      const d = await r.json() as NormalizeResult;
      setNormalizeResult(d);
      // Refresh audit after normalize
      await runAudit();
    } catch (e) {
      setAuditError(String(e));
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

  const fixableRows = auditRows.filter(r => r.canAutoFix);
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

  const isConnected = phoneStatus?.configured && phoneStatus.accountStatus === "active";
  const isError = phoneStatus?.configured && phoneStatus.accountStatus === "error";

  // ── Health Center computations ──────────────────────────────────────────────
  const hTwilio: HStatus =
    phoneStatus?.configured && phoneStatus.accountStatus === "active" ? "healthy"
    : phoneStatus?.configured ? "warning" : "action";

  const hForward: HStatus =
    phoneStatus?.forwardConfigured && phoneStatus.forwardingNumberLooksValid !== false ? "healthy"
    : phoneStatus?.forwardConfigured ? "warning" : "action";

  const hSecurity: HStatus =
    !phoneStatus?.configured ? "warning"
    : phoneStatus.webhookSecurityMode === "enabled" ? "healthy"
    : phoneStatus.webhookSecurityMode === "development-bypass" ? "warning" : "action";

  const hBaseUrl: HStatus = phoneStatus?.baseUrlMissing ? "action" : "healthy";

  const hAudit: HStatus =
    !auditRan ? "warning"
    : auditRows.length === 0 ? "healthy"
    : auditRows.length <= 3 ? "warning" : "action";

  const hEmail: HStatus = testMode ? "warning" : "healthy";

  const healthCards: { title: string; status: HStatus; desc: string; action?: string }[] = [
    {
      title: "Twilio SMS/Voice",
      status: hTwilio,
      desc: hTwilio === "healthy" ? "Account connected and active."
        : hTwilio === "warning" ? "Credentials set but account status unknown."
        : "TWILIO_ACCOUNT_SID, AUTH_TOKEN, PHONE_NUMBER not set.",
      action: hTwilio !== "healthy" ? "Add Twilio env vars in Replit Secrets" : undefined,
    },
    {
      title: "Call Forwarding",
      status: hForward,
      desc: hForward === "healthy" ? "Forwarding number configured and valid."
        : hForward === "warning" ? "Set but may be invalid E.164 format."
        : "FORWARD_TO_PHONE_NUMBER not set — calls won't ring your cell.",
      action: hForward !== "healthy" ? "Set FORWARD_TO_PHONE_NUMBER in E.164 format" : undefined,
    },
    {
      title: "Webhook Security",
      status: hSecurity,
      desc: hSecurity === "healthy" ? "Signature validation active — webhooks are secure."
        : !phoneStatus?.configured ? "Configure Twilio first to enable security."
        : phoneStatus.webhookSecurityMode === "development-bypass" ? "Dev bypass active — not suitable for production."
        : "TWILIO_AUTH_TOKEN missing — webhooks not validated.",
      action: hSecurity === "action" ? "Set TWILIO_AUTH_TOKEN to enable validation" : undefined,
    },
    {
      title: "Webhook Base URL",
      status: hBaseUrl,
      desc: hBaseUrl === "healthy" ? "CRM_BASE_URL set — Twilio can route inbound events."
        : "CRM_BASE_URL missing — Twilio cannot deliver SMS or calls.",
      action: hBaseUrl === "action" ? "Set CRM_BASE_URL to your deployed domain" : undefined,
    },
    {
      title: "Phone Data Quality",
      status: hAudit,
      desc: !auditRan && auditLoading ? "Scanning lead phone numbers…"
        : !auditRan ? "Audit scan not yet run."
        : auditRows.length === 0 ? "All lead phone numbers are clean."
        : `${auditRows.length} number${auditRows.length === 1 ? "" : "s"} need attention.`,
      action: hAudit !== "healthy" && auditRan && auditRows.length > 0
        ? "Fix issues in Phone Data Hygiene section below" : undefined,
    },
    {
      title: "Email Mode",
      status: hEmail,
      desc: testMode
        ? "Test mode on — emails are simulated, not sent to leads."
        : "Live mode — emails deliver via Resend.",
      action: testMode ? "Disable test mode in Email Settings when ready" : undefined,
    },
  ];

  const healthScore = Math.max(
    0,
    100
    - healthCards.filter(c => c.status === "warning").length * 15
    - healthCards.filter(c => c.status === "action").length * 30,
  );
  const healthLabel =
    healthScore >= 90 ? "Excellent" :
    healthScore >= 70 ? "Good" :
    healthScore >= 50 ? "Needs Attention" : "Critical";
  const healthScoreColor =
    healthScore >= 90 ? "text-emerald-700" :
    healthScore >= 70 ? "text-blue-700" :
    healthScore >= 50 ? "text-amber-700" : "text-red-700";
  const healthScoreBg =
    healthScore >= 90 ? "bg-emerald-50 border-emerald-200" :
    healthScore >= 70 ? "bg-blue-50 border-blue-200" :
    healthScore >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const healthBarColor =
    healthScore >= 90 ? "bg-emerald-500" :
    healthScore >= 70 ? "bg-blue-500" :
    healthScore >= 50 ? "bg-amber-500" : "bg-red-500";
  const healthNextActions = [
    ...healthCards.filter(c => c.status === "action" && c.action),
    ...healthCards.filter(c => c.status === "warning" && c.action),
  ].slice(0, 3);

  return (
    <CrmLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm mt-0.5">CRM configuration and integrations</p>
        </div>

        {/* ── CRM System Health ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">CRM System Health</h2>
            <button
              onClick={() => { loadPhoneStatus(); runAudit(); }}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh health check"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPhone || auditLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Overall score banner */}
          {!loadingPhone && (
            <div className={`flex items-center gap-4 p-3.5 rounded-xl border mb-4 ${healthScoreBg}`}>
              <div className="text-center shrink-0 w-16">
                <p className={`text-3xl font-bold leading-none ${healthScoreColor}`}>
                  {healthScore}<span className="text-sm font-normal">%</span>
                </p>
                <p className={`text-[10px] font-bold mt-1 uppercase tracking-wide ${healthScoreColor}`}>{healthLabel}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="h-1.5 w-full bg-white/70 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-1.5 rounded-full ${healthBarColor} transition-all duration-500`}
                    style={{ width: `${healthScore}%` }}
                  />
                </div>
                {healthNextActions.length > 0 ? (
                  <div className="space-y-0.5">
                    {healthNextActions.map((a, i) => (
                      <p key={i} className={`text-[10px] leading-snug ${healthScoreColor}`}>
                        {i + 1}. {a.action}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className={`text-[10px] font-medium ${healthScoreColor}`}>All systems configured ✓</p>
                )}
              </div>
            </div>
          )}

          {/* Health cards grid */}
          {loadingPhone ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-50 border border-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {healthCards.map(card => {
                const cardBg = card.status === "healthy" ? "bg-emerald-50 border-emerald-200"
                  : card.status === "warning" ? "bg-amber-50 border-amber-200"
                  : "bg-red-50 border-red-200";
                const cardLabel = card.status === "healthy" ? "Healthy"
                  : card.status === "warning" ? "Warning" : "Action Needed";
                const labelColor = card.status === "healthy" ? "text-emerald-700"
                  : card.status === "warning" ? "text-amber-700" : "text-red-700";
                const icon = card.status === "healthy"
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  : card.status === "warning"
                  ? <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
                return (
                  <div key={card.title} className={`rounded-xl border p-3 ${cardBg}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {icon}
                      <span className={`text-[10px] font-semibold ${labelColor}`}>{cardLabel}</span>
                    </div>
                    <p className="text-xs font-semibold text-foreground leading-tight mb-0.5">{card.title}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug">{card.desc}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Email settings */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TestTube className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Email Settings</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-900">Email Test Mode</p>
                  <p className="text-xs text-yellow-700 mt-0.5">
                    When enabled, emails are logged in the activity timeline but NOT actually sent.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" className="sr-only peer" checked={testMode} onChange={e => setTestMode(e.target.checked)} />
                <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-yellow-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
              </label>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">From Email Address</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-muted-foreground">
                SiteMint Digital Solutions &lt;noreply@sitemintdigital.com&gt;
              </div>
              <p className="text-xs text-muted-foreground/70 mt-1">Set via <code className="bg-gray-100 px-1 rounded">RESEND_FROM_EMAIL</code> environment variable.</p>
            </div>
          </div>
        </div>

        {/* Phone / SMS — Twilio Integration */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Phone &amp; SMS — Twilio Integration</h2>
            <div className="ml-auto flex items-center gap-2">
              {loadingPhone ? (
                <span className="text-xs text-muted-foreground">Checking…</span>
              ) : isConnected ? (
                <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  <CheckCircle className="w-3 h-3" /> Connected
                </span>
              ) : isError ? (
                <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  <XCircle className="w-3 h-3" /> Auth Error
                </span>
              ) : phoneStatus?.configured ? (
                <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                  <AlertCircle className="w-3 h-3" /> Partially Configured
                </span>
              ) : (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Not Connected</span>
              )}
              <button onClick={loadPhoneStatus} className="text-muted-foreground hover:text-foreground transition-colors" title="Refresh status">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPhone ? "animate-spin" : ""}`} />
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

          {/* Config display (read-only, set via env vars) */}
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Provider</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-foreground capitalize">
                  {phoneStatus?.provider ?? "twilio"}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Account Status</label>
                <div className={`px-3 py-2 border rounded-lg text-sm capitalize ${isConnected ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-50 border-gray-200 text-muted-foreground"}`}>
                  {phoneStatus?.accountStatus ?? (phoneStatus?.configured ? "Unknown" : "—")}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Business Phone Number</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-foreground font-mono">
                  {phoneStatus?.businessNumber || <span className="text-muted-foreground">Not set</span>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Set via <code className="bg-gray-100 px-0.5 rounded">TWILIO_PHONE_NUMBER</code></p>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Forward-to Number (Your Cell)
                </label>

                {/* Not configured warning */}
                {!phoneStatus?.forwardConfigured && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 font-medium">
                      Inbound calls will not ring your cell phone unless forwarding is configured.
                      Set <code className="bg-red-100 px-0.5 rounded">FORWARD_TO_PHONE_NUMBER</code> to your mobile number.
                    </p>
                  </div>
                )}

                {/* Current value display */}
                <div className={`px-3 py-2 border rounded-lg text-sm font-mono ${
                  phoneStatus?.forwardConfigured
                    ? phoneStatus.forwardingNumberLooksValid === false
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-gray-50 border-gray-200 text-foreground"
                    : "bg-red-50 border-red-200 text-red-600"
                }`}>
                  {phoneStatus?.forwardTo
                    ? <>
                        {phoneStatus.forwardTo}
                        {phoneStatus.normalizedForwardTo && phoneStatus.normalizedForwardTo !== phoneStatus.forwardTo && (
                          <span className="text-[10px] font-sans text-amber-700 ml-2">
                            (normalizes to {phoneStatus.normalizedForwardTo})
                          </span>
                        )}
                      </>
                    : <span className="font-sans font-medium">⚠ Not set — calls won't forward to your cell</span>
                  }
                </div>

                {/* Format guidance */}
                <div className="mt-1.5 text-[10px] text-muted-foreground space-y-0.5">
                  <p>Set via <code className="bg-gray-100 px-0.5 rounded">FORWARD_TO_PHONE_NUMBER</code> environment variable</p>
                  <p>
                    <span className="font-semibold">Format examples:</span>{" "}
                    US: <code className="bg-gray-100 px-0.5 rounded">+19498806515</code>{" "}
                    · PH: <code className="bg-gray-100 px-0.5 rounded">+639186069624</code>
                  </p>
                  <p className="text-[10px] text-muted-foreground">Always use E.164 format (+ followed by country code and number, no spaces or dashes).</p>
                </div>

                {/* Valid number confirmation */}
                {phoneStatus?.forwardConfigured && phoneStatus.forwardingNumberLooksValid && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                    <span className="text-[10px] text-emerald-700 font-medium">Forwarding number looks valid</span>
                  </div>
                )}
                {phoneStatus?.forwardConfigured && phoneStatus.forwardingNumberLooksValid === false && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    <span className="text-[10px] text-amber-700 font-medium">Number format may be invalid — check E.164 formatting above</span>
                  </div>
                )}
              </div>
            </div>

            {/* Webhook Security */}
            {phoneStatus?.configured && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">Webhook Signature Validation</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Protects the CRM from fake SMS/call posts by verifying Twilio's request signature on every inbound webhook.
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 mt-0.5 ${
                  phoneStatus.webhookSecurityMode === "enabled"
                    ? "bg-green-100 text-green-700"
                    : phoneStatus.webhookSecurityMode === "development-bypass"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-red-100 text-red-700"
                }`}>
                  {phoneStatus.webhookSecurityMode === "enabled"
                    ? "Enabled"
                    : phoneStatus.webhookSecurityMode === "development-bypass"
                    ? "Dev Bypass"
                    : "Disabled"}
                </span>
              </div>
            )}
          </div>

          {/* Webhook URLs */}
          {phoneStatus?.configured && !phoneStatus?.webhooks && (
            <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <strong>CRM_BASE_URL not set</strong> — webhook URLs cannot be generated.
                Without this, Twilio cannot deliver inbound SMS or call logs to the CRM.
                Set <code className="bg-amber-100 px-0.5 rounded">CRM_BASE_URL</code> to your deployed domain (e.g. <code className="bg-amber-100 px-0.5 rounded">https://yourapp.replit.app</code>).
              </p>
            </div>
          )}
          {phoneStatus?.webhooks && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-foreground mb-2">
                Twilio Webhook URLs
                <span className="ml-1 font-normal text-muted-foreground">(copy these into your Twilio console)</span>
              </p>
              <div className="space-y-2">
                {([
                  { label: "Incoming SMS", key: "incomingSms", url: phoneStatus.webhooks.incomingSms },
                  { label: "Incoming Voice", key: "incomingVoice", url: phoneStatus.webhooks.incomingVoice },
                  { label: "Voice Status", key: "voiceStatus", url: phoneStatus.webhooks.voiceStatus },
                  { label: "SMS Delivery Status", key: "smsStatus", url: phoneStatus.webhooks.smsStatus },
                ] as const).map(({ label, key, url }) => (
                  <div key={key} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
                      <p className="text-xs font-mono text-foreground truncate">{url}</p>
                    </div>
                    <button onClick={() => copyToClipboard(url, key)} className="text-muted-foreground hover:text-foreground shrink-0" title="Copy URL">
                      {copied === key ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test SMS */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground">Test SMS</p>
            <p className="text-xs text-muted-foreground">Send a test text to verify your Twilio setup. Enter any phone number.</p>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 font-mono"
                placeholder="+1 (949) 555-0000"
                value={testSmsTo}
                onChange={e => setTestSmsTo(e.target.value)}
              />
              <Button size="sm" onClick={sendTestSms} disabled={testSmsSending || !phoneStatus?.configured || !testSmsTo.trim()} className="gap-1.5 shrink-0">
                <MessageSquare className="w-3.5 h-3.5" />
                {testSmsSending ? "Sending…" : "Send Test"}
              </Button>
            </div>
            {!phoneStatus?.configured && (
              <p className="text-xs text-muted-foreground">Twilio not configured. Add <code className="bg-gray-100 px-0.5 rounded">TWILIO_ACCOUNT_SID</code>, <code className="bg-gray-100 px-0.5 rounded">TWILIO_AUTH_TOKEN</code>, and <code className="bg-gray-100 px-0.5 rounded">TWILIO_PHONE_NUMBER</code> to your environment secrets.</p>
            )}
            {testSmsResult && (
              <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${testSmsResult.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {testSmsResult.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                {testSmsResult.msg}
              </div>
            )}
          </div>

          {/* Setup instructions */}
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
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
                <div key={k} className="flex gap-2">
                  <span className="text-foreground font-semibold">{k}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-blue-600">{v}</span>
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
            This requires <code className="bg-gray-100 px-0.5 rounded">CRM_BASE_URL</code> to be configured and
            webhook URLs set in your Twilio Console.
          </p>
        </div>

        {/* Phone Data Hygiene */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
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
              onClick={runAudit}
              disabled={auditLoading}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? "animate-spin" : ""}`} />
              {auditLoading ? "Scanning…" : auditRan ? "Re-scan" : "Run Phone Audit"}
            </Button>
            {auditRan && !auditLoading && (
              <span className="text-xs text-muted-foreground">
                {auditRows.length === 0
                  ? "✓ All phone numbers look clean"
                  : `${auditRows.length} number${auditRows.length === 1 ? "" : "s"} need attention · ${fixableRows.length} can be auto-fixed`}
              </span>
            )}
          </div>

          {/* Error */}
          {auditError && (
            <div className="mt-3 flex items-start gap-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {auditError}
            </div>
          )}

          {/* Success banner after normalize */}
          {normalizeResult && (
            <div className="mt-3 flex items-start gap-2 text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Done — <strong>{normalizeResult.updated}</strong> updated,{" "}
                <strong>{normalizeResult.skipped}</strong> skipped
                {normalizeResult.errors > 0 && `, ${normalizeResult.errors} error${normalizeResult.errors === 1 ? "" : "s"}`}.
              </span>
            </div>
          )}

          {/* Audit preview table */}
          {auditRan && auditRows.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
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

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="w-8 px-3 py-2 text-left">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-foreground">Lead</th>
                      <th className="px-3 py-2 text-left font-semibold text-foreground">Current</th>
                      <th className="px-3 py-2 text-left font-semibold text-foreground">Suggested</th>
                      <th className="px-3 py-2 text-left font-semibold text-foreground">Issue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditRows.map(row => (
                      <tr key={row.id} className={`${selectedIds.has(row.id) ? "bg-blue-50/40" : ""}`}>
                        <td className="px-3 py-2">
                          {row.canAutoFix ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggleSelect(row.id)}
                              className="rounded border-gray-300 text-foreground focus:ring-foreground/30 cursor-pointer"
                            />
                          ) : (
                            <span className="text-gray-300 text-[10px]">—</span>
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
                            <span className="text-gray-400 text-[11px]">Manual review needed</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            row.canAutoFix
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-gray-100 text-gray-500"
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
                <p className="text-[11px] text-muted-foreground">
                  Only confidently recognized numbers will be updated. Unrecognized formats are skipped.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Security */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Security</h2>
          </div>
          <div className="space-y-3 text-sm">
            {[
              { color: "bg-green-500", title: "CRM is protected behind admin authentication", sub: "All /api/crm/* endpoints require a valid Bearer token." },
              { color: "bg-green-500", title: "API keys are stored as environment variables", sub: "Resend, Twilio and session secrets are never exposed to the frontend." },
              { color: "bg-yellow-500", title: "Admin password", sub: 'Change the default by setting the ADMIN_PASSWORD environment variable.' },
            ].map(({ color, title, sub }) => (
              <div key={title} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full ${color} mt-1.5 shrink-0`} />
                <div>
                  <p className="font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Team Members</h2>
          </div>
          <div className="space-y-2">
            {[
              { name: "Claidy Taguran", role: "Technical Director" },
              { name: "Shasta Greene", role: "Head of Strategy" },
              { name: "Saisa Lorraigne", role: "Project & Admin Manager" },
            ].map(m => (
              <div key={m.name} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-foreground/10 rounded-full flex items-center justify-center text-sm font-bold text-foreground">
                  {m.name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save}>Save Settings</Button>
          {saved && <span className="text-sm text-green-600">Settings saved!</span>}
        </div>
      </div>
    </CrmLayout>
  );
}
