import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, AlertCircle, Settings, Shield, Bell,
  TestTube, Phone, CheckCircle, XCircle, Copy, RefreshCw,
} from "lucide-react";

const tok = () => localStorage.getItem("adminToken") || "";

interface PhoneStatus {
  configured: boolean;
  provider: string;
  businessNumber: string;
  forwardTo: string;
  accountStatus: string | null;
  webhooks: {
    incomingSms: string;
    incomingVoice: string;
    voiceStatus: string;
    smsStatus: string;
  } | null;
}

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

  useEffect(() => { loadPhoneStatus(); }, [loadPhoneStatus]);

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

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const isConnected = phoneStatus?.configured && phoneStatus.accountStatus === "active";
  const isError = phoneStatus?.configured && phoneStatus.accountStatus === "error";

  return (
    <CrmLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm mt-0.5">CRM configuration and integrations</p>
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
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Forward-to Number (Your Cell)</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-foreground font-mono">
                  {phoneStatus?.forwardTo || <span className="text-muted-foreground">Not set</span>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Set via <code className="bg-gray-100 px-0.5 rounded">FORWARD_TO_PHONE_NUMBER</code></p>
              </div>
            </div>
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
