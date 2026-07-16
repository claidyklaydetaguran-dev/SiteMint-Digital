import { Badge } from "@/components/ui/badge";
import { Globe2, Phone, Mail, MessageSquare } from "lucide-react";

const CHANNELS = [
  {
    label: "Phone / SMS",
    description: "Receive and qualify inbound calls via SMS",
    icon: Phone,
    color: "bg-emerald-100 text-emerald-600",
    status: "active",
  },
  {
    label: "Email",
    description: "Receive and reply to leads via email",
    icon: Mail,
    color: "bg-purple-100 text-purple-600",
    status: "coming-soon",
  },
  {
    label: "Web Chat",
    description: "Embed a chat widget on your website",
    icon: MessageSquare,
    color: "bg-blue-100 text-blue-600",
    status: "coming-soon",
  },
];

export default function Deploy() {
  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      <div className="px-6 py-4 border-b border-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">Deploy</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage channels where your AI Receptionist is active
        </p>
      </div>

      <div className="p-6 max-w-2xl">
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Active Channels</h2>
          <p className="text-xs text-slate-500">
            Your AI Receptionist is live on SMS. More channels are coming soon.
          </p>
        </div>

        <div className="space-y-3">
          {CHANNELS.map((ch) => (
            <div
              key={ch.label}
              className={`rounded-xl border p-4 flex items-center gap-4 ${
                ch.status === "active"
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-slate-200 bg-slate-50/60 opacity-70"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${ch.color}`}
              >
                <ch.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{ch.label}</span>
                  {ch.status === "active" ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-transparent text-xs">
                      Active
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-500 border-transparent text-xs">
                      Coming Soon
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{ch.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Globe2 className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-indigo-900 mb-1">
                Channel Configuration
              </h3>
              <p className="text-xs text-indigo-700">
                Advanced channel configuration — including custom phone numbers, email routing, and
                web widget embedding — is coming in a future update. Your SMS channel is managed
                automatically by SiteMint.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
