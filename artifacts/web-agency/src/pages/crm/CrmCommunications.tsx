import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, Mail, Send, RefreshCw, AlertCircle, CheckCircle2, Plus,
  Edit2, Trash2, FileText, X, Search, ExternalLink, Clock, Inbox,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { ConversationInbox } from "@/components/crm/ConversationInbox";
import { normalizeLeadStatus } from "@/lib/crmTaxonomy";

// ── Types ─────────────────────────────────────────────────────────────────────

type CommTab = "conversations" | "email" | "templates";

interface EmailActivity {
  id: number; leadId: number | null; leadName: string; leadEmail: string;
  subject: string; description?: string | null; createdAt: string;
  metadata?: { testMode?: boolean } | null;
}
interface Template {
  id: number; name: string; type: string; subject: string; body: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Default templates (for seeding) ──────────────────────────────────────────

const DEFAULT_TEMPLATES: Omit<Template, "id">[] = [
  { name: "Initial Outreach", type: "initial_outreach", subject: "Hi {{name}}, let's talk about your website", body: "Hi {{name}},\n\nI came across your business and wanted to reach out about how SiteMint Digital can help you grow your online presence.\n\nWe specialize in building custom websites, CRM systems, and automation tools that help businesses like yours get more customers.\n\nWould you be open to a quick 15-minute call this week?\n\nBest,\nThe SiteMint Digital Team" },
  { name: "Follow-Up", type: "follow_up", subject: "Following up — SiteMint Digital", body: "Hi {{name}},\n\nI wanted to follow up on my previous message. I'd love to learn more about your business goals and see if we might be a good fit.\n\nIf you have any questions or would like to schedule a call, just reply to this email.\n\nLooking forward to hearing from you!\n\nBest,\nThe SiteMint Digital Team" },
  { name: "Discovery Call Reminder", type: "discovery_reminder", subject: "Your discovery call with SiteMint Digital — tomorrow", body: "Hi {{name}},\n\nJust a quick reminder that we have a discovery call scheduled for tomorrow. We're looking forward to learning more about your project.\n\nPlease feel free to prepare any questions you have about our process, pricing, or timeline.\n\nSee you then!\n\nBest,\nClaidy Taguran\nTechnical Director, SiteMint Digital" },
  { name: "Proposal Sent", type: "proposal_sent", subject: "Your SiteMint Digital Proposal is Ready", body: "Hi {{name}},\n\nThank you for meeting with us! I've prepared a custom proposal based on our conversation.\n\nPlease review it at your convenience. I'm happy to walk you through it on a call or answer any questions via email.\n\nWe're excited about the opportunity to work with you.\n\nBest,\nThe SiteMint Digital Team" },
  { name: "Checking In", type: "checking_in", subject: "Checking in — SiteMint Digital", body: "Hi {{name}},\n\nI wanted to check in and see how things are going. We're still here if you're ready to move forward with your project.\n\nFeel free to reach out whenever you're ready — no pressure at all.\n\nBest,\nThe SiteMint Digital Team" },
  { name: "Thank You", type: "thank_you", subject: "Thank you for choosing SiteMint Digital!", body: "Hi {{name}},\n\nThank you for trusting SiteMint Digital with your project. We're thrilled to get started and will be in touch shortly to kick things off.\n\nExpect a welcome email from our team within the next 24 hours with next steps.\n\nWe can't wait to build something great together!\n\nBest,\nThe SiteMint Digital Team" },
];

const EMPTY_FORM = { name: "", type: "Other", subject: "", body: "" };

// ── Component ─────────────────────────────────────────────────────────────────

export default function CrmCommunications() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<CommTab>("conversations");
  const [toast, setToast] = useState("");

  // Conversations live entirely in the shared <ConversationInbox>. The
  // thirty-odd pieces of state that used to sit here — threads, selection,
  // messages, polling refs, an unread map — were a second copy of what
  // CrmInbox.tsx already held, and maintaining two copies is exactly how
  // the two screens drifted apart.

  // ── Email activity state ─────────────────────────────────────────────────
  const [emails, setEmails] = useState<EmailActivity[]>([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSearch, setEmailSearch] = useState("");

  // ── Templates state ──────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [tplForm, setTplForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [savingTpl, setSavingTpl] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  // ── Email Activity logic ──────────────────────────────────────────────────

  const loadEmails = useCallback(async () => {
    setEmailLoading(true);
    try {
      const r = await adminFetch("/api/crm/communications/email-activity");
      if (r.ok) {
        const d = await r.json() as { emails: EmailActivity[] };
        setEmails(d.emails || []);
      }
    } finally { setEmailLoading(false); }
  }, []);

  useEffect(() => { if (tab === "email") loadEmails(); }, [tab, loadEmails]);

  const filteredEmails = emails.filter(e =>
    !emailSearch ||
    (e.leadName ?? "").toLowerCase().includes(emailSearch.toLowerCase()) ||
    (e.leadEmail ?? "").toLowerCase().includes(emailSearch.toLowerCase()) ||
    (e.subject ?? "").toLowerCase().includes(emailSearch.toLowerCase())
  );

  // ── Templates logic ───────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const r = await adminFetch("/api/crm/email-templates");
      if (r.ok) { const d = await r.json() as { templates: Template[] }; setTemplates(d.templates || []); }
    } finally { setTemplatesLoading(false); }
  }, []);

  useEffect(() => { if (tab === "templates") loadTemplates(); }, [tab, loadTemplates]);

  const openCreate = () => { setEditingTpl(null); setTplForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (t: Template) => { setEditingTpl(t); setTplForm({ name: t.name, type: t.type, subject: t.subject, body: t.body }); setShowForm(true); };

  const saveTemplate = async () => {
    if (!tplForm.name || !tplForm.subject || !tplForm.body) return;
    setSavingTpl(true);
    const url = editingTpl ? `/api/crm/email-templates/${editingTpl.id}` : "/api/crm/email-templates";
    await adminFetch(url, {
      method: editingTpl ? "PUT" : "POST",
      body: JSON.stringify(tplForm),
    });
    setSavingTpl(false); setShowForm(false); setEditingTpl(null); setTplForm(EMPTY_FORM);
    loadTemplates();
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm("Delete this template?")) return;
    await adminFetch(`/api/crm/email-templates/${id}`, { method: "DELETE" });
    loadTemplates();
  };

  const seedTemplates = async () => {
    setSeeding(true);
    for (const t of DEFAULT_TEMPLATES) {
      await adminFetch("/api/crm/email-templates", {
        method: "POST",
        body: JSON.stringify(t),
      });
    }
    setSeeding(false); loadTemplates();
  };

  // ── Tab config ────────────────────────────────────────────────────────────

  const TABS: { id: CommTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "conversations", label: "Conversations", icon: MessageSquare, badge: 0 || undefined },
    { id: "email",         label: "Email Activity", icon: Mail },
    { id: "templates",    label: "Templates",      icon: FileText },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <CrmLayout>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-foreground text-background px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {toast}
        </div>
      )}

      <div className="flex flex-col h-[calc(100vh-48px)]">

        {/* ── Product header ─────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-b border-border/60 bg-white flex items-center gap-6 flex-wrap shrink-0">
          <div>
            <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Inbox className="w-4 h-4 text-blue-500" />
              Communications Center
            </h1>
            <p className="text-xs text-muted-foreground">Conversations, email activity, and message templates</p>
          </div>
          <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t.id
                    ? "bg-white text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {t.badge != null && (
                  <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {t.badge > 99 ? "99+" : t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── CONVERSATIONS TAB ─────────────────────────────────────────── */}
        {/*
          The shared inbox. This tab used to be ~285 lines duplicating
          CrmInbox.tsx: the same three endpoints, the same polling, the same
          selection logic, kept in two places and already drifting apart. Both
          entry points now render the same component, so they cannot answer
          differently about the same customer.
        */}
        {tab === "conversations" && (
          <div className="flex flex-1 min-h-0">
            <ConversationInbox compact />
          </div>
        )}

        {/* ── EMAIL ACTIVITY TAB ────────────────────────────────────────── */}
        {tab === "email" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Controls */}
            <div className="px-6 py-3 border-b border-border/60 bg-white flex items-center gap-3 shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  placeholder="Search lead, email, subject…"
                  value={emailSearch}
                  onChange={e => setEmailSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
              <Button size="sm" variant="outline" onClick={loadEmails} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                {emailLoading ? "Loading…" : `${filteredEmails.length} email${filteredEmails.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {emailLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                  <Mail className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No email activity found.</p>
                  <p className="text-xs">Emails sent from the Sales Workspace or Campaign sender will appear here.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-border/60 z-10">
                    <tr className="text-left">
                      {["Contact", "Subject", "Mode", "Sent"].map(h => (
                        <th key={h} className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                      ))}
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredEmails.map(e => (
                      <tr key={e.id} className="hover:bg-accent/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-medium text-foreground">{e.leadName}</p>
                          <p className="text-xs text-muted-foreground">{e.leadEmail}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm text-foreground">{e.subject}</p>
                          {e.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-xs">{e.description}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {e.metadata?.testMode ? (
                            <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Test</span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Sent</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(e.createdAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          {e.leadId && (
                            <Link href={`/admin/crm/leads/${e.leadId}/workspace`} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                              Workspace <ExternalLink className="w-3 h-3" />
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── TEMPLATES TAB ────────────────────────────────────────────── */}
        {tab === "templates" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Controls */}
            <div className="px-6 py-3 border-b border-border/60 bg-white flex items-center gap-3 shrink-0">
              <Button size="sm" onClick={openCreate} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> New Template
              </Button>
              {templates.length === 0 && !templatesLoading && (
                <Button size="sm" variant="outline" onClick={seedTemplates} disabled={seeding} className="gap-1.5">
                  {seeding ? "Seeding…" : "Seed Default Templates"}
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {templatesLoading ? "Loading…" : `${templates.length} template${templates.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            {/* Template form (inline) */}
            {showForm && (
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {editingTpl ? "Edit Template" : "New Template"}
                  </h3>
                  <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                    <input
                      value={tplForm.name}
                      onChange={e => setTplForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Template name"
                      className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
                    <input
                      value={tplForm.subject}
                      onChange={e => setTplForm(p => ({ ...p, subject: e.target.value }))}
                      placeholder="Email subject"
                      className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Body</label>
                  <textarea
                    rows={6}
                    value={tplForm.body}
                    onChange={e => setTplForm(p => ({ ...p, body: e.target.value }))}
                    placeholder="Email body… Use {{name}} for personalization."
                    className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveTemplate} disabled={savingTpl || !tplForm.name || !tplForm.subject || !tplForm.body}>
                    {savingTpl ? "Saving…" : "Save Template"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Template grid */}
            <div className="flex-1 overflow-auto p-6">
              {templatesLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                  <FileText className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No templates yet.</p>
                  <p className="text-xs">Create a template or seed the default set to get started.</p>
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {templates.map(t => (
                    <div key={t.id} className="bg-white border border-border rounded-xl p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEdit(t)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteTemplate(t.id)}
                            className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{t.body}</p>
                      <div className="mt-3 pt-3 border-t border-border/60">
                        <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-full font-medium capitalize">
                          {t.type.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
