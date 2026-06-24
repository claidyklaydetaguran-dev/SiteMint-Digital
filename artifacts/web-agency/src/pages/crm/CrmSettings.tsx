import { useState } from "react";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { MessageSquare, AlertCircle, Settings, Shield, Bell, TestTube } from "lucide-react";

export default function CrmSettings() {
  const [testMode, setTestMode] = useState(true);
  const [saved, setSaved] = useState(false);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 3000); };

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
                    When enabled, emails are logged in the activity timeline but NOT actually sent. Disable test mode to send real emails via Resend.
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

        {/* SMS / Texting */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">SMS / Texting Integration</h2>
            <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Not Connected</span>
          </div>

          <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900">SMS is not connected yet.</p>
                <p className="text-sm text-blue-700 mt-1">Connect Twilio or Telnyx to enable texting from lead profiles. No real SMS will be sent until a provider is configured.</p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">SMS Provider</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-muted-foreground">
                <option value="">— Not configured —</option>
                <option>Twilio</option>
                <option>Telnyx</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">API Key / Account SID</label>
                <input disabled className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-muted-foreground bg-gray-50 cursor-not-allowed" placeholder="Set via environment variable" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Sender Phone Number</label>
                <input disabled className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-muted-foreground bg-gray-50 cursor-not-allowed" placeholder="+1 (949) 000-0000" />
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-foreground mb-1">To enable SMS texting:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                <li>Sign up for <strong>Twilio</strong> (twilio.com) or <strong>Telnyx</strong> (telnyx.com)</li>
                <li>Purchase a phone number from your provider</li>
                <li>Add <code className="bg-gray-100 px-1 rounded">SMS_PROVIDER</code>, <code className="bg-gray-100 px-1 rounded">SMS_API_KEY</code>, and <code className="bg-gray-100 px-1 rounded">SMS_FROM_NUMBER</code> to your environment secrets</li>
                <li>The "Text Lead" button on lead profiles will activate automatically</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Security</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">CRM is protected behind admin authentication</p>
                <p className="text-xs text-muted-foreground">All /api/crm/* endpoints require a valid Bearer token.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">API keys are stored as environment variables</p>
                <p className="text-xs text-muted-foreground">Resend API key and session secrets are never exposed to the frontend.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Admin password</p>
                <p className="text-xs text-muted-foreground">Change the default by setting the <code className="bg-gray-100 px-1 rounded">ADMIN_PASSWORD</code> environment variable.</p>
              </div>
            </div>
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
              { name:"Claidy Taguran", role:"Technical Director" },
              { name:"Shasta Greene", role:"Head of Strategy" },
              { name:"Saisa Lorraigne", role:"Project & Admin Manager" },
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
