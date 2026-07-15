import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mail,
  Phone,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Plus,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Settings,
  Trash2,
} from "lucide-react";

type Channel = "email" | "phone" | "chat" | null;

const CHANNELS = [
  {
    id: "email" as const,
    label: "Email",
    description: "Receive and reply to customer tickets via email",
    icon: Mail,
    color: "bg-purple-100 text-purple-600",
    borderColor: "border-purple-200",
    accentBg: "bg-purple-50",
    connected: 2,
  },
  {
    id: "phone" as const,
    label: "Phone",
    description: "Manage Twilio phone numbers, take calls and send SMS",
    icon: Phone,
    color: "bg-emerald-100 text-emerald-600",
    borderColor: "border-emerald-200",
    accentBg: "bg-emerald-50",
    connected: 1,
  },
  {
    id: "chat" as const,
    label: "Live Chat",
    description: "Embed real-time chat on your site to talk with customers",
    icon: MessageSquare,
    color: "bg-blue-100 text-blue-600",
    borderColor: "border-blue-200",
    accentBg: "bg-blue-50",
    connected: 0,
  },
];

export default function Deploy() {
  const [activeChannel, setActiveChannel] = useState<Channel>(null);

  if (activeChannel) {
    return (
      <ChannelDetail
        channelId={activeChannel}
        onBack={() => setActiveChannel(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-6 py-4 border-b border-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">Deploy</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Connect communication channels to your helpdesk
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-3 gap-5 max-w-3xl">
          {CHANNELS.map((ch) => (
            <button
              key={ch.id}
              className={`text-left rounded-xl border ${ch.borderColor} bg-white hover:shadow-md transition-all p-5 group`}
              onClick={() => setActiveChannel(ch.id)}
            >
              <div className={`w-12 h-12 rounded-xl ${ch.accentBg} flex items-center justify-center mb-4`}>
                <div className={`w-8 h-8 rounded-lg ${ch.color} flex items-center justify-center`}>
                  <ch.icon className="h-4 w-4" />
                </div>
              </div>
              <h3 className="font-semibold text-slate-900 mb-1 text-sm">{ch.label}</h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">{ch.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {ch.connected > 0 ? (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> {ch.connected} connected
                    </span>
                  ) : (
                    "Not configured"
                  )}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Channel Detail ───────────────────────────────────────────────────────────

function ChannelDetail({ channelId, onBack }: { channelId: NonNullable<Channel>; onBack: () => void }) {
  const channel = CHANNELS.find((c) => c.id === channelId)!;
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <button
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" /> Deploy
        </button>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-md ${channel.color} flex items-center justify-center`}>
            <channel.icon className="h-3.5 w-3.5" />
          </div>
          <h1 className="text-sm font-semibold text-slate-900">{channel.label}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {channelId === "email" && <EmailManagement />}
        {channelId === "phone" && <PhoneManagement />}
        {channelId === "chat" && <ChatManagement />}
      </div>
    </div>
  );
}

// ─── Email Management ─────────────────────────────────────────────────────────

const EMAIL_INBOXES = [
  { email: "support@sitemint.io", brand: "SiteMint", status: "Active", authType: "OAuth 2.0" },
  { email: "billing@sitemint.io", brand: "SiteMint Billing", status: "Active", authType: "SMTP" },
];

function EmailManagement() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900">Connected Inboxes</h2>
        <Button size="sm" className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Inbox
        </Button>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Auth Type</th>
              <th className="px-4 py-3 w-[80px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {EMAIL_INBOXES.map((inbox, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900 text-xs">{inbox.email}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">{inbox.brand}</td>
                <td className="px-4 py-3">
                  <Badge className="bg-emerald-100 text-emerald-700 border-transparent text-xs">{inbox.status}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{inbox.authType}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-rose-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 p-4 rounded-lg bg-slate-50 border border-slate-200">
        <div className="text-xs font-semibold text-slate-700 mb-2">Forwarding Address</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-slate-600 bg-white border border-slate-200 rounded px-3 py-1.5">
            support+inbox@inbound.sitemint.io
          </code>
          <Button variant="outline" size="sm" className="h-7 text-xs border-slate-200 gap-1">
            <Copy className="h-3 w-3" /> Copy
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Phone Management ─────────────────────────────────────────────────────────

const PHONE_NUMBERS = [
  { number: "+1 (415) 555-0192", assignedTo: "Support Team", status: "Active" },
];

function PhoneManagement() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900">Phone Numbers</h2>
        <Button size="sm" className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Number
        </Button>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Number</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned To</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 w-[80px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {PHONE_NUMBERS.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-slate-900 text-xs">{row.number}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">{row.assignedTo}</td>
                <td className="px-4 py-3">
                  <Badge className="bg-emerald-100 text-emerald-700 border-transparent text-xs">{row.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-rose-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-xs font-semibold text-amber-800 mb-0.5">Twilio credentials required</div>
          <div className="text-xs text-amber-700">
            Set <code className="font-mono bg-amber-100 px-1 rounded">TWILIO_ACCOUNT_SID</code> and{" "}
            <code className="font-mono bg-amber-100 px-1 rounded">TWILIO_AUTH_TOKEN</code> environment variables to enable phone features.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chat Management ──────────────────────────────────────────────────────────

const WIDGET_CODE = `<script>
  window.SiteMintChatConfig = {
    workspaceId: "ws_a1b2c3d4e5f6",
    primaryColor: "#4f46e5",
    position: "bottom-right"
  };
</script>
<script src="https://cdn.sitemint.io/chat-widget.js" async></script>`;

function ChatManagement() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(WIDGET_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Live Chat Widget</h2>
      <p className="text-xs text-slate-500 mb-5">
        Embed the chat widget on your website by pasting the snippet before the closing{" "}
        <code className="font-mono bg-slate-100 px-1 rounded text-slate-700">&lt;/body&gt;</code> tag.
      </p>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700">Embed Code</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-slate-200 gap-1"
            onClick={handleCopy}
          >
            {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre">
          {WIDGET_CODE}
        </pre>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
          <div className="text-xs font-semibold text-slate-700 mb-1">Widget Status</div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-slate-300" />
            Not yet active
          </div>
        </div>
        <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
          <div className="text-xs font-semibold text-slate-700 mb-1">Workspace ID</div>
          <code className="text-xs font-mono text-slate-600">ws_a1b2c3d4e5f6</code>
        </div>
      </div>
    </div>
  );
}
