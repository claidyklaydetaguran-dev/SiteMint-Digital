import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, Mail, Phone, Send, RefreshCw, AlertCircle, CheckCircle2,
  Plus, Edit2, Trash2, FileText, X, Search, ExternalLink, Clock, Inbox,
} from "lucide-react";

const tok = () => localStorage.getItem("adminToken") || "";
const POLL_MS = 30_000;

// ── Types ─────────────────────────────────────────────────────────────────────

type CommTab = "conversations" | "email" | "templates";

interface Msg {
  id: number; createdAt: string; leadId: number | null;
  direction: string; channel: string;
  body?: string | null; fromNumber?: string | null; toNumber?: string | null;
  status?: string | null; callStatus?: string | null; duration?: number | null;
}
interface ThreadLead {
  id: number; name: string; phone?: string | null; email: string;
  company?: string | null; smsOptOut?: boolean | null;
}
interface Thread {
  leadId: number | null; lead: ThreadLead | null;
  messages: Msg[]; lastAt: string; unread: number;
}
interface FullLead {
  id: number; name: string; company?: string; email: string;
  phone?: string; status: string; lastContactedAt?: string; tags: string[];
}
interface EmailActivity {
  id: number; leadId: number | null; leadName: string; leadEmail: string;
  subject: string; description?: string | null; createdAt: string;
  metadata?: { testMode?: boolean } | null;
}
interface Template {
  id: number; name: string; type: string; subject: string; body: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = [
  "bg-blue-500","bg-indigo-500","bg-purple-500","bg-pink-500",
  "bg-orange-400","bg-teal-500","bg-cyan-500","bg-emerald-500","bg-red-400","bg-yellow-500",
];
function av(name: string) { return COLORS[name.split("").reduce((a,c) => a+c.charCodeAt(0), 0) % COLORS.length]; }
function ini(name: string) { return name.trim().split(/\s+/).map(n => n[0]).slice(0,2).join("").toUpperCase(); }
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
function formatDuration(s: number) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }

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

  // ── Conversations state ──────────────────────────────────────────────────
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [selectedLead, setSelectedLead] = useState<FullLead | null>(null);
  const [convLoading, setConvLoading] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pollError, setPollError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [smsBody, setSmsBody] = useState("");
  const [sending, setSending] = useState(false);
  const [smsError, setSmsError] = useState("");
  const [viewedLeads, setViewedLeads] = useState<Set<number>>(new Set());
  const [newlyUpdated, setNewlyUpdated] = useState<Set<number>>(new Set());
  const threadRef = useRef<HTMLDivElement>(null);
  const knownLastAt = useRef<Map<number, string>>(new Map());
  const selectedRef = useRef<Thread | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isNearBottom = useRef(true);

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

  // ── Conversations logic ───────────────────────────────────────────────────

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => threadRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 80);
  }, []);

  const handleThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    isNearBottom.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 120;
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (!el || tab !== "conversations") return;
    el.addEventListener("scroll", handleThreadScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleThreadScroll);
  }, [handleThreadScroll, selected, tab]);

  const loadMessages = useCallback(async (leadId: number) => {
    setLoadingMsgs(true);
    try {
      const r = await fetch(`/api/crm/leads/${leadId}/messages`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (r.ok) {
        const d = await r.json() as { messages: Msg[] };
        setMessages((d.messages || []).slice().reverse());
        scrollToBottom();
      }
    } finally { setLoadingMsgs(false); }
  }, [scrollToBottom]);

  const loadFullLead = useCallback(async (leadId: number) => {
    const r = await fetch(`/api/crm/leads/${leadId}`, {
      headers: { Authorization: `Bearer ${tok()}` },
    });
    if (r.ok) {
      const d = await r.json() as { lead: FullLead };
      setSelectedLead(d.lead ?? null);
    }
  }, []);

  const loadThreads = useCallback(async (initial = false) => {
    if (!tok()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    if (initial) setConvLoading(true);
    try {
      const r = await fetch("/api/crm/conversations", { headers: { Authorization: `Bearer ${tok()}` } });
      if (r.status === 401) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
      if (!r.ok) return;
      const d = await r.json() as { conversations: Thread[] };
      const convs = d.conversations || [];
      setThreads(convs);
      setLastUpdated(new Date());
      for (const t of convs) {
        if (t.leadId != null) knownLastAt.current.set(t.leadId, t.lastAt);
      }
      if (initial && convs.length > 0) {
        const first = convs[0];
        setSelected(first);
        selectedRef.current = first;
        setMessages(first.messages.slice().reverse());
        scrollToBottom();
        if (first.leadId) {
          setViewedLeads(new Set([first.leadId]));
          loadMessages(first.leadId);
          loadFullLead(first.leadId);
        }
      }
    } finally { if (initial) setConvLoading(false); }
  }, [navigate, scrollToBottom, loadMessages, loadFullLead]);

  const silentRefresh = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setPollError("");
    try {
      const r = await fetch("/api/crm/conversations", { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error("fetch failed");
      const d = await r.json() as { conversations: Thread[] };
      const convs = d.conversations || [];
      const updatedIds: number[] = [];
      for (const t of convs) {
        if (t.leadId == null) continue;
        const prev = knownLastAt.current.get(t.leadId);
        if (prev !== undefined && t.lastAt > prev) updatedIds.push(t.leadId);
        knownLastAt.current.set(t.leadId, t.lastAt);
      }
      setThreads(convs);
      setLastUpdated(new Date());
      const selId = selectedRef.current?.leadId;
      if (selId != null && updatedIds.includes(selId)) {
        const r2 = await fetch(`/api/crm/leads/${selId}/messages`, { headers: { Authorization: `Bearer ${tok()}` } });
        if (r2.ok) {
          const d2 = await r2.json() as { messages: Msg[] };
          setMessages((d2.messages || []).slice().reverse());
          if (isNearBottom.current) scrollToBottom();
        }
      }
      if (updatedIds.length > 0) {
        setViewedLeads(prev => { const n = new Set(prev); updatedIds.forEach(id => n.delete(id)); return n; });
        setNewlyUpdated(prev => { const n = new Set(prev); updatedIds.forEach(id => n.add(id)); return n; });
        setTimeout(() => setNewlyUpdated(prev => { const n = new Set(prev); updatedIds.forEach(id => n.delete(id)); return n; }), 3000);
      }
    } catch { setPollError("Auto-refresh failed — retrying in 30s."); }
    finally { if (manual) setIsRefreshing(false); }
  }, [scrollToBottom]);

  useEffect(() => {
    if (tab !== "conversations") return;
    loadThreads(true);
    pollRef.current = setInterval(() => silentRefresh(false), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectThread = useCallback((thread: Thread) => {
    setSelected(thread);
    selectedRef.current = thread;
    setSelectedLead(null);
    setSmsBody(""); setSmsError("");
    isNearBottom.current = true;
    setMessages(thread.messages.slice().reverse());
    scrollToBottom();
    if (thread.leadId != null) {
      setViewedLeads(prev => new Set(prev).add(thread.leadId!));
      loadMessages(thread.leadId);
      loadFullLead(thread.leadId);
    }
  }, [scrollToBottom, loadMessages, loadFullLead]);

  const sendSms = async () => {
    if (!selected?.leadId || !smsBody.trim()) return;
    setSending(true); setSmsError("");
    try {
      const r = await fetch(`/api/crm/leads/${selected.leadId}/sms`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: smsBody.trim() }),
      });
      const data = await r.json() as { error?: string };
      if (r.ok) { setSmsBody(""); showToast("SMS sent."); loadMessages(selected.leadId); }
      else setSmsError(data.error ?? "Failed to send SMS.");
    } catch { setSmsError("Network error. Please try again."); }
    finally { setSending(false); }
  };

  const effectiveUnread = (t: Thread) =>
    t.leadId != null && viewedLeads.has(t.leadId) ? 0 : t.unread;

  const totalUnread = threads.reduce((s, t) => s + effectiveUnread(t), 0);

  // ── Email Activity logic ──────────────────────────────────────────────────

  const loadEmails = useCallback(async () => {
    setEmailLoading(true);
    try {
      const r = await fetch("/api/crm/communications/email-activity", {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (r.ok) {
        const d = await r.json() as { emails: EmailActivity[] };
        setEmails(d.emails || []);
      }
    } finally { setEmailLoading(false); }
  }, []);

  useEffect(() => { if (tab === "email") loadEmails(); }, [tab, loadEmails]);

  const filteredEmails = emails.filter(e =>
    !emailSearch ||
    e.leadName.toLowerCase().includes(emailSearch.toLowerCase()) ||
    e.leadEmail.toLowerCase().includes(emailSearch.toLowerCase()) ||
    e.subject.toLowerCase().includes(emailSearch.toLowerCase())
  );

  // ── Templates logic ───────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const r = await fetch("/api/crm/email-templates", { headers: { Authorization: `Bearer ${tok()}` } });
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
    await fetch(url, {
      method: editingTpl ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
      body: JSON.stringify(tplForm),
    });
    setSavingTpl(false); setShowForm(false); setEditingTpl(null); setTplForm(EMPTY_FORM);
    loadTemplates();
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/crm/email-templates/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok()}` } });
    loadTemplates();
  };

  const seedTemplates = async () => {
    setSeeding(true);
    for (const t of DEFAULT_TEMPLATES) {
      await fetch("/api/crm/email-templates", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify(t),
      });
    }
    setSeeding(false); loadTemplates();
  };

  // ── Tab config ────────────────────────────────────────────────────────────

  const TABS: { id: CommTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "conversations", label: "Conversations", icon: MessageSquare, badge: totalUnread || undefined },
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
        <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-6 flex-wrap shrink-0">
          <div>
            <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Inbox className="w-4 h-4 text-blue-500" />
              Communications Center
            </h1>
            <p className="text-xs text-muted-foreground">Conversations, email activity, and message templates</p>
          </div>
          <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5 bg-gray-50">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t.id
                    ? "bg-white text-foreground shadow-sm border border-gray-200"
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
        {tab === "conversations" && (
          <div className="flex flex-1 overflow-hidden">

            {/* Thread list */}
            <div className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
              <div className="px-4 py-3 border-b border-gray-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    SMS &amp; Calls
                    {!convLoading && (
                      <span className="text-muted-foreground font-normal">({threads.length})</span>
                    )}
                    {totalUnread > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {totalUnread > 99 ? "99+" : totalUnread}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => silentRefresh(true)}
                    disabled={isRefreshing || convLoading}
                    title="Refresh"
                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors text-muted-foreground disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>
                {!convLoading && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live · 30s
                    </span>
                    {lastUpdated && (
                      <span className="text-[10px] text-muted-foreground">{timeAgo(lastUpdated.toISOString())}</span>
                    )}
                  </div>
                )}
                {pollError && (
                  <p className="flex items-center gap-1 text-[10px] text-amber-600">
                    <AlertCircle className="w-3 h-3 shrink-0" />{pollError}
                  </p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                {convLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                  </div>
                ) : threads.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-25" />
                    <p className="text-sm font-medium">No conversations yet</p>
                    <p className="text-xs mt-1 opacity-70">SMS and calls appear here once Twilio is connected.</p>
                  </div>
                ) : (
                  threads.map((thread, idx) => {
                    const name = thread.lead?.name ?? "Unknown Contact";
                    const last = thread.messages[0] ?? null;
                    const unread = effectiveUnread(thread);
                    const isActive = thread.leadId != null
                      ? selected?.leadId === thread.leadId
                      : selected === thread;
                    const isNew = thread.leadId != null && newlyUpdated.has(thread.leadId);
                    const preview = last?.channel === "call"
                      ? (last.direction === "inbound" ? "📞 Incoming call" : "📞 Outgoing call")
                      : (last?.body?.substring(0, 55) ?? "—");

                    return (
                      <button
                        key={`${thread.leadId ?? "orphan"}-${idx}`}
                        onClick={() => selectThread(thread)}
                        className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                          isActive ? "bg-blue-50 border-blue-500"
                          : isNew ? "bg-emerald-50 border-emerald-400"
                          : "border-transparent hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full ${av(name)} flex items-center justify-center shrink-0 relative`}>
                            <span className="text-white text-xs font-semibold">{ini(name)}</span>
                            {unread > 0 && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                                {unread > 9 ? "9+" : unread}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-sm truncate ${unread > 0 ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                                {name}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {last ? timeAgo(last.createdAt) : ""}
                              </span>
                            </div>
                            <p className={`text-xs truncate mt-0.5 ${unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                              {preview}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Message view */}
            <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
              {!selected ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Select a conversation</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Thread header */}
                  <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-3 shrink-0">
                    <div className={`w-8 h-8 rounded-full ${av(selected.lead?.name ?? "")} flex items-center justify-center shrink-0`}>
                      <span className="text-white text-xs font-semibold">{ini(selected.lead?.name ?? "?")}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{selected.lead?.name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground truncate">{selected.lead?.phone ?? selected.lead?.email ?? ""}</p>
                    </div>
                    {selected.leadId && (
                      <Link href={`/admin/crm/leads/${selected.leadId}/workspace`}>
                        <a className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          Open Workspace <ExternalLink className="w-3 h-3" />
                        </a>
                      </Link>
                    )}
                  </div>

                  {/* Messages */}
                  <div
                    ref={threadRef}
                    className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3"
                  >
                    {loadingMsgs ? (
                      <div className="flex items-center justify-center py-10">
                        <div className="w-5 h-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                      </div>
                    ) : messages.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground py-10">No messages yet.</p>
                    ) : (
                      messages.map(msg => {
                        const isOut = msg.direction === "outbound";
                        if (msg.channel === "call") {
                          return (
                            <div key={msg.id} className="flex justify-center">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-white border border-gray-200 rounded-full px-3 py-1.5">
                                <Phone className="w-3.5 h-3.5" />
                                {msg.direction === "inbound" ? "Incoming call" : "Outgoing call"}
                                {msg.duration ? ` · ${formatDuration(msg.duration)}` : ""}
                                <span className="opacity-60">{timeAgo(msg.createdAt)}</span>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                              isOut
                                ? "bg-foreground text-background rounded-br-sm"
                                : "bg-white border border-gray-200 text-foreground rounded-bl-sm"
                            }`}>
                              <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                              <p className={`text-[10px] mt-1 ${isOut ? "text-white/60" : "text-muted-foreground"}`}>
                                {timeAgo(msg.createdAt)}
                                {msg.status && msg.status !== "delivered" && (
                                  <span className="ml-1.5 text-amber-400 capitalize">{msg.status}</span>
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* SMS Composer */}
                  <div className="px-5 py-4 bg-white border-t border-gray-200 shrink-0">
                    {selected.lead?.smsOptOut ? (
                      <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        SMS opt-out — cannot send to this contact.
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <textarea
                            rows={2}
                            placeholder="Type an SMS message…"
                            value={smsBody}
                            onChange={e => setSmsBody(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSms(); } }}
                            className="flex-1 resize-none text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                          />
                          <Button
                            onClick={sendSms}
                            disabled={!smsBody.trim() || sending}
                            size="sm"
                            className="self-end h-9 gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {sending ? "Sending…" : "Send"}
                          </Button>
                        </div>
                        {smsError && (
                          <p className="flex items-center gap-1 text-xs text-red-600 mt-1.5">
                            <AlertCircle className="w-3 h-3 shrink-0" />{smsError}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Lead panel */}
            <div className="w-60 border-l border-gray-200 bg-white flex flex-col shrink-0 overflow-y-auto">
              {selectedLead ? (
                <div className="p-4 space-y-4">
                  <div className="text-center pt-2">
                    <div className={`w-12 h-12 rounded-full ${av(selectedLead.name)} flex items-center justify-center mx-auto mb-2`}>
                      <span className="text-white font-semibold text-base">{ini(selectedLead.name)}</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{selectedLead.name}</p>
                    {selectedLead.company && (
                      <p className="text-xs text-muted-foreground">{selectedLead.company}</p>
                    )}
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      selectedLead.status === "Won" ? "bg-green-100 text-green-700"
                      : selectedLead.status === "Lost" ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                    }`}>{selectedLead.status}</span>
                  </div>
                  <div className="space-y-2">
                    {selectedLead.email && (
                      <div className="flex items-start gap-2 text-xs">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-foreground break-all">{selectedLead.email}</span>
                      </div>
                    )}
                    {selectedLead.phone && (
                      <div className="flex items-start gap-2 text-xs">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-foreground">{selectedLead.phone}</span>
                      </div>
                    )}
                    {selectedLead.lastContactedAt && (
                      <div className="flex items-start gap-2 text-xs">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">Last contact: {timeAgo(selectedLead.lastContactedAt)}</span>
                      </div>
                    )}
                  </div>
                  {selectedLead.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedLead.tags.map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                  <Link href={`/admin/crm/leads/${selectedLead.id}/workspace`}>
                    <a className="block">
                      <Button size="sm" variant="outline" className="w-full text-xs gap-1.5">
                        <ExternalLink className="w-3 h-3" /> Open Workspace
                      </Button>
                    </a>
                  </Link>
                </div>
              ) : selected ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-5 h-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  <p className="text-xs">No contact selected</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── EMAIL ACTIVITY TAB ────────────────────────────────────────── */}
        {tab === "email" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Controls */}
            <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-3 shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  placeholder="Search lead, email, subject…"
                  value={emailSearch}
                  onChange={e => setEmailSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
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
                  <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                    <tr className="text-left">
                      {["Contact", "Subject", "Mode", "Sent"].map(h => (
                        <th key={h} className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                      ))}
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredEmails.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50/60 transition-colors">
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
                            <Link href={`/admin/crm/leads/${e.leadId}/workspace`}>
                              <a className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                                Workspace <ExternalLink className="w-3 h-3" />
                              </a>
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
            <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-3 shrink-0">
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
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
                    <input
                      value={tplForm.subject}
                      onChange={e => setTplForm(p => ({ ...p, subject: e.target.value }))}
                      placeholder="Email subject"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
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
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white resize-none"
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
                    <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEdit(t)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-gray-100 rounded-md transition-colors"
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
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium capitalize">
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
