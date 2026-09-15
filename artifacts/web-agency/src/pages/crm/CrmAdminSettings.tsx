import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Zap, Bot, Mail, MessageSquare, Download, Globe,
  Settings, TestTube, ChevronRight, AlertCircle, CheckCircle2, Users,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { UnmappedOwnersPanel } from "@/components/crm/UnmappedOwnersPanel";

// Honest admin hub (2026-09-11): every card links to a screen that actually
// exists. Capabilities that are not built yet are listed as plain text in the
// "Not built yet" section instead of rendering as dead clickable tiles.

function AdminCard({ icon: Icon, title, description, color, href }: {
  icon: React.ElementType; title: string; description: string; color: string; href: string;
}) {
  return (
    <Link href={href}>
      <div className="h-full">
        <div className="bg-white rounded-xl border border-border p-4 hover:shadow-md transition-shadow cursor-pointer group h-full">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground group-hover:text-blue-600 transition-colors">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-500 transition-colors shrink-0 mt-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

const HUB_CARDS = [
  { icon: Zap, title: "Campaigns & Sequences", description: "Broadcasts, drip sequences, enrollment, and the send queue.", color: "bg-blue-500", href: "/admin/crm/campaigns" },
  { icon: Bot, title: "Automation Queue", description: "Workflow steps and scheduled campaign messages, org-wide.", color: "bg-teal-600", href: "/admin/crm/intelligence/automation-queue" },
  { icon: Mail, title: "Email Templates", description: "View & edit reusable email templates.", color: "bg-blue-600", href: "/admin/crm/email-templates" },
  { icon: Globe, title: "Discovery Inquiries", description: "Website Discovery form submissions and their pipeline status.", color: "bg-teal-500", href: "/admin/crm/discovery" },
  { icon: Download, title: "Import", description: "CSV lead import and Discovery-to-CRM import.", color: "bg-muted-foreground", href: "/admin/crm/import" },
  { icon: MessageSquare, title: "Phone & SMS (Twilio)", description: "Connection status, test SMS, webhooks, and phone data hygiene.", color: "bg-green-500", href: "/admin/crm/settings" },
  { icon: Users, title: "People & permissions", description: "Individual staff accounts, roles, per-person permissions and sessions.", color: "bg-blue-600", href: "/admin/crm/people" },
];

const NOT_BUILT = [
  "Text (SMS) template library",
  "API keys & lead-capture email",
  "Third-party integrations (Zapier, email marketing)",
  "Tag management",
  "Custom pipeline stages",
  "Custom lead sources",
];

export default function CrmAdminSettings() {
  // Live Twilio status — the old page showed a hardcoded "SMS not connected"
  // banner regardless of reality.
  const [smsConfigured, setSmsConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await adminFetch("/api/crm/phone/status");
        if (!r.ok) return;
        const d = await r.json() as { configured?: boolean };
        if (!cancelled) setSmsConfigured(!!d.configured);
      } catch { /* leave unknown */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <CrmLayout>
      <div className="max-w-screen-xl mx-auto p-5">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Admin</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Shortcuts to every configuration surface the CRM actually has.</p>
        </div>

        {/* SMS status — live, shown only when we know the answer */}
        {smsConfigured === false && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3 mb-6">
            <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-900">SMS not connected</p>
              <p className="text-xs text-yellow-700 mt-0.5">
                Twilio credentials are not configured. Until then, "Text" buttons open your device's default SMS app.
                Set them up from <Link href="/admin/crm/settings" className="underline">Settings</Link>.
              </p>
            </div>
          </div>
        )}
        {smsConfigured === true && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3 mb-6">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-900">SMS connected</p>
              <p className="text-xs text-green-700 mt-0.5">Twilio is configured — two-way texting with leads is available.</p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold text-foreground mb-3">Manage</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {HUB_CARDS.map(c => <AdminCard key={c.title} {...c} />)}
            </div>
          </div>

          {/* M6: owner names on contacts that do not yet belong to a person */}
          <UnmappedOwnersPanel />

          {/* Quick settings link */}
          <div className="border border-border rounded-xl p-4 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">CRM Settings</p>
                <p className="text-xs text-muted-foreground">System health, email mode, Twilio, webhooks, and phone data hygiene.</p>
              </div>
            </div>
            <Link href="/admin/crm/settings">
              <button className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors flex items-center gap-1">
                <TestTube className="w-3 h-3" /> Open Settings
              </button>
            </Link>
          </div>

          <div>
            <h2 className="text-sm font-bold text-foreground mb-2">Not built yet</h2>
            <p className="text-xs text-muted-foreground mb-3">
              These capabilities don't exist in the CRM today. They're listed here so nobody goes
              looking for a screen that isn't there.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
              {NOT_BUILT.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
