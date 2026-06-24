import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Zap, Bot, Mail, MessageSquare, Download, Key, Globe,
  Tag, Layers, BarChart2, Users, Settings, TestTube,
  ChevronRight, AlertCircle,
} from "lucide-react";

const TABS = ["Overview","Action Plans","Automations","Email Templates","Text Templates","Import","Tags","Integrations","API"];

function AdminCard({ icon: Icon, title, description, color, href }: {
  icon: React.ElementType; title: string; description: string; color: string; href?: string;
}) {
  const Inner = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer group h-full">
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
  );

  if (href) {
    return <Link href={href}><div className="h-full"><Inner /></div></Link>;
  }
  return <div className="h-full"><Inner /></div>;
}

const FOLLOW_UP = [
  { icon: Zap, title: "Action Plans", description: "Send personalized drip emails, setup tasks, change stages & more.", color: "bg-blue-500" },
  { icon: Bot, title: "Automations", description: "Trigger action plans & quick actions when a stage changes or other trigger events.", color: "bg-purple-500" },
  { icon: Mail, title: "Email Templates", description: "View & edit email templates, see opens & click-through rates.", color: "bg-blue-600", href: "/admin/crm/email-templates" },
  { icon: MessageSquare, title: "Text Templates", description: "View & edit text templates, track effectiveness based on reply rates.", color: "bg-sky-500" },
];

const ACCOUNT = [
  { icon: Download, title: "Import", description: "Bring your old CRM over? Use our quick import tool.", color: "bg-gray-500", href: "/admin/crm/import" },
];

const INTEGRATIONS = [
  { icon: Key, title: "API Keys & Lead Email", description: "Access your API keys for integrations & your unique CRM lead-capture email.", color: "bg-yellow-500" },
  { icon: Globe, title: "Website Forms", description: "Track all your website activity and Discovery form submissions.", color: "bg-teal-500" },
  { icon: Mail, title: "Resend Email", description: "Configure your email sender domain and manage Resend API integration.", color: "bg-blue-500" },
  { icon: MessageSquare, title: "SMS Provider", description: "Connect Twilio or Telnyx to enable two-way text messaging with leads.", color: "bg-green-500" },
  { icon: BarChart2, title: "All Integrations", description: "Email marketing, Zapier, and all other third-party integrations.", color: "bg-indigo-500" },
];

const CUSTOMIZE = [
  { icon: Tag, title: "Tags", description: "See all your tags — auto-created & delete unwanted ones.", color: "bg-orange-500" },
  { icon: Layers, title: "Stages", description: "Customize your pipeline stages to match your sales process.", color: "bg-purple-500" },
  { icon: Globe, title: "Lead Sources", description: "Manage your lead sources and track where your business comes from.", color: "bg-teal-500" },
  { icon: Users, title: "Users & Roles", description: "Manage team members, roles, and permissions.", color: "bg-blue-500" },
];

export default function CrmAdminSettings() {
  const [, navigate_] = useLocation();

  return (
    <CrmLayout>
      <div className="max-w-screen-xl mx-auto p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-foreground">Admin</h1>
          <button className="text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            Admin Overview →
          </button>
        </div>

        {/* Sub-nav tabs */}
        <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar">
          {TABS.map((t, i) => (
            <button key={t}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors relative shrink-0 ${
                i === 0
                  ? "text-blue-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* SMS notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-900">SMS not connected</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Connect Twilio or Telnyx below to enable two-way text messaging with your leads. Until then, the "Text" buttons will open your device's default SMS app.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Follow Up */}
          <div>
            <h2 className="text-sm font-bold text-foreground mb-3">Follow Up</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FOLLOW_UP.map(c => <AdminCard key={c.title} {...c} />)}
            </div>
          </div>

          {/* Account */}
          <div>
            <h2 className="text-sm font-bold text-foreground mb-3">Account</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ACCOUNT.map(c => <AdminCard key={c.title} {...c} />)}
            </div>
          </div>

          {/* Integrations */}
          <div>
            <h2 className="text-sm font-bold text-foreground mb-3">Integrations</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {INTEGRATIONS.map(c => <AdminCard key={c.title} {...c} />)}
            </div>
          </div>

          {/* Customize */}
          <div>
            <h2 className="text-sm font-bold text-foreground mb-3">Customize</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CUSTOMIZE.map(c => <AdminCard key={c.title} {...c} />)}
            </div>
          </div>

          {/* Quick settings link */}
          <div className="border border-gray-200 rounded-xl p-4 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">CRM Settings</p>
                <p className="text-xs text-muted-foreground">Email test mode, notifications, and other CRM configuration.</p>
              </div>
            </div>
            <Link href="/admin/crm/settings">
              <button className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors flex items-center gap-1">
                <TestTube className="w-3 h-3" /> Open Settings
              </button>
            </Link>
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
