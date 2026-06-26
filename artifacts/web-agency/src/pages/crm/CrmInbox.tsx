import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  Phone, MessageSquare, Mail, Send, StickyNote, X,
  Building, Globe, Calendar, Tag, ChevronRight,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

const AVATAR_COLORS = [
  "bg-blue-500","bg-indigo-500","bg-purple-500","bg-pink-500",
  "bg-red-400","bg-orange-400","bg-yellow-500","bg-teal-500","bg-cyan-500","bg-emerald-500",
];
function initials(name: string) {
  return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
function avatarColor(name: string) {
  const i = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}
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
  return new Date(d).toLocaleDateString();
}

interface Lead {
  id: number; name: string; company?: string; email: string; phone?: string;
  status: string; assignedTo?: string; website?: string; source?: string;
  serviceInterest?: string; lastContactedAt?: string; updatedAt: string; tags: string[];
}
interface Activity {
  id: number; type: string; title: string; description?: string; createdAt: string;
}

const TEMPLATES = [
  { label: "Introduction", text: "Hi {{name}}, I'm reaching out from SiteMint Digital. We specialize in building high-converting websites and CRM systems for growing businesses. I'd love to learn more about your goals and see how we can help. Would you have 15 minutes this week for a quick call?" },
  { label: "Follow Up", text: "Hi {{name}}, just following up on our previous conversation. I wanted to check in and see if you had any questions or if there's anything else I can help clarify. Looking forward to connecting!" },
  { label: "Still Interested?", text: "Hi {{name}}, I wanted to touch base and see if you're still interested in exploring a partnership with SiteMint Digital. We have some exciting new packages that might be a great fit for your business." },
  { label: "Nurture Lead", text: "Hi {{name}}, I hope things are going well! I wanted to share some resources that might be helpful for your business. Our team has been working on some great new solutions and I think you'd find them valuable." },
];

const activityColors: Record<string, string> = {
  note_added: "bg-yellow-100 text-yellow-700 border-yellow-200",
  email_sent: "bg-blue-100 text-blue-700 border-blue-200",
  lead_created: "bg-green-100 text-green-700 border-green-200",
  lead_imported: "bg-purple-100 text-purple-700 border-purple-200",
  status_changed: "bg-gray-100 text-gray-600 border-gray-200",
  task_completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  default: "bg-gray-100 text-gray-600 border-gray-200",
};
const activityIcon: Record<string, string> = {
  note_added: "📝", email_sent: "📧", lead_created: "✨",
  lead_imported: "📥", status_changed: "🔄", task_completed: "✅",
  task_created: "📌", follow_up_changed: "📅",
};

export default function CrmInbox() {
  const [, navigate] = useLocation();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [tab, setTab] = useState<"note" | "email" | "sms">("note");
  const [message, setMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => {
        const sorted = (d.leads || []).slice().sort(
          (a: Lead, b: Lead) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setLeads(sorted);
        if (sorted.length > 0) setSelected(sorted[0]);
      })
      .finally(() => setLoadingLeads(false));
  }, [navigate]);

  const loadActivities = useCallback(async (leadId: number) => {
    setLoadingActivities(true);
    setActivities([]);
    const r = await fetch(`/api/crm/leads/${leadId}/activities`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const d = await r.json();
    setActivities(d.activities || []);
    setLoadingActivities(false);
    setTimeout(() => threadRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 100);
  }, []);

  useEffect(() => {
    if (selected) {
      loadActivities(selected.id);
      setMessage("");
      setEmailSubject("");
    }
  }, [selected, loadActivities]);

  const send = async () => {
    if (!selected || !message.trim()) return;
    setSending(true);
    if (tab === "note") {
      await fetch(`/api/crm/leads/${selected.id}/notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note: message }),
      });
    } else if (tab === "sms") {
      await fetch(`/api/crm/leads/${selected.id}/sms`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: message }),
      });
    } else {
      await fetch(`/api/crm/leads/${selected.id}/email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subject: emailSubject || `Message from SiteMint Digital`, body: message }),
      });
    }
    setSending(false);
    setMessage("");
    setEmailSubject("");
    loadActivities(selected.id);
  };

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    const text = tpl.text.replace(/\{\{name\}\}/g, selected?.name.split(" ")[0] || "there");
    setMessage(text);
    if (tab === "email") setEmailSubject(`Following up — ${selected?.name || ""}`);
  };

  return (
    <CrmLayout>
      <div className="flex h-[calc(100vh-48px)]">

        {/* LEFT — Conversation list */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-sm text-foreground">
              My Inbox <span className="text-muted-foreground font-normal">({leads.length})</span>
            </h2>
            <div className="flex gap-2 mt-2">
              {(["all", "unread"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    filter === f ? "bg-blue-100 text-blue-700" : "text-muted-foreground hover:bg-gray-100"
                  }`}>
                  {f === "all" ? "All" : "Unread"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {loadingLeads ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
              </div>
            ) : leads.map(lead => (
              <button
                key={lead.id}
                onClick={() => setSelected(lead)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                  selected?.id === lead.id ? "bg-blue-50 border-l-2 border-blue-500" : ""
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full ${avatarColor(lead.name)} flex items-center justify-center shrink-0`}>
                    <span className="text-white text-xs font-semibold">{initials(lead.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-foreground truncate">{lead.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{timeAgo(lead.updatedAt)}</span>
                    </div>
                    {lead.phone && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <Phone className="w-2.5 h-2.5" /> {lead.phone}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CENTER — Conversation thread */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              {/* Thread header */}
              <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full ${avatarColor(selected.name)} flex items-center justify-center shrink-0`}>
                  <span className="text-white text-sm font-bold">{initials(selected.name)}</span>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{selected.phone || selected.email}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {selected.phone && <>
                    <a href={`tel:${selected.phone}`}
                       className="w-7 h-7 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors" title="Call">
                      <Phone className="w-3.5 h-3.5 text-white" />
                    </a>
                    <a href={`sms:${selected.phone}`}
                       className="w-7 h-7 bg-sky-500 hover:bg-sky-600 rounded-full flex items-center justify-center transition-colors" title="Text">
                      <MessageSquare className="w-3.5 h-3.5 text-white" />
                    </a>
                  </>}
                  <a href={`mailto:${selected.email}`}
                     className="w-7 h-7 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors" title="Email">
                    <Mail className="w-3.5 h-3.5 text-white" />
                  </a>
                  <Link href={`/admin/crm/leads/${selected.id}`}>
                    <button className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 ml-1">
                      Full Profile <ChevronRight className="w-3 h-3" />
                    </button>
                  </Link>
                </div>
              </div>

              {/* Activity thread */}
              <div ref={threadRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                {loadingActivities ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                  </div>
                ) : activities.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-12">
                    No activity yet. Send a note or email to start the conversation.
                  </div>
                ) : activities.map(a => (
                  <div key={a.id} className={`flex gap-3 ${a.type === "note_added" || a.type === "email_sent" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-md rounded-xl px-4 py-2.5 border text-sm ${activityColors[a.type] || activityColors.default}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span>{activityIcon[a.type] || "•"}</span>
                        <span className="font-semibold text-xs">{a.title}</span>
                        <span className="text-xs opacity-60 ml-auto">{timeAgo(a.createdAt)}</span>
                      </div>
                      {a.description && <p className="text-xs opacity-80 whitespace-pre-wrap">{a.description}</p>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Compose */}
              <div className="bg-white border-t border-gray-200 p-4">
                {/* Quick templates */}
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {TEMPLATES.map(tpl => (
                    <button key={tpl.label} onClick={() => applyTemplate(tpl)}
                      className="text-xs px-2.5 py-1 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors text-muted-foreground hover:text-foreground">
                      {tpl.label}
                    </button>
                  ))}
                </div>

                {/* Tab toggle */}
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setTab("note")}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      tab === "note" ? "bg-yellow-100 text-yellow-800" : "text-muted-foreground hover:bg-gray-100"
                    }`}>
                    <StickyNote className="w-3 h-3" /> Note
                  </button>
                  <button onClick={() => setTab("email")}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      tab === "email" ? "bg-blue-100 text-blue-800" : "text-muted-foreground hover:bg-gray-100"
                    }`}>
                    <Mail className="w-3 h-3" /> Email
                  </button>
                  {selected?.phone && (
                    <button onClick={() => setTab("sms")}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        tab === "sms" ? "bg-sky-100 text-sky-800" : "text-muted-foreground hover:bg-gray-100"
                      }`}>
                      <MessageSquare className="w-3 h-3" /> SMS
                    </button>
                  )}
                  {message && (
                    <button onClick={() => setMessage("")} className="ml-auto text-xs text-muted-foreground hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {tab === "email" && (
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    placeholder="Subject…"
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                  />
                )}

                <div className="flex gap-2">
                  <textarea
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                    rows={3}
                    placeholder={tab === "note" ? "Add a note…" : "Write your email…"}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="self-end gap-1.5"
                    disabled={sending || !message.trim()}
                    onClick={send}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a contact to start
            </div>
          )}
        </div>

        {/* RIGHT — Lead profile */}
        {selected && (
          <div className="w-72 bg-white border-l border-gray-200 overflow-y-auto shrink-0">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full ${avatarColor(selected.name)} flex items-center justify-center`}>
                  <span className="text-white font-bold">{initials(selected.name)}</span>
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">Last active {timeAgo(selected.updatedAt)}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                {selected.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="flex items-center gap-2 flex-1">
                      <a href={`tel:${selected.phone}`} className="text-xs text-foreground hover:text-blue-600">{selected.phone}</a>
                      <a href={`tel:${selected.phone}`} className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                        <Phone className="w-2.5 h-2.5 text-white" />
                      </a>
                      <a href={`sms:${selected.phone}`} className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center">
                        <MessageSquare className="w-2.5 h-2.5 text-white" />
                      </a>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <a href={`mailto:${selected.email}`} className="text-xs text-blue-600 hover:text-blue-800 truncate">{selected.email}</a>
                </div>
                {selected.company && (
                  <div className="flex items-center gap-2">
                    <Building className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground">{selected.company}</span>
                  </div>
                )}
                {selected.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 truncate">{selected.website}</a>
                  </div>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="p-4 border-b border-gray-100 space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Details</h3>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Stage</span>
                <span className="font-medium text-foreground">{selected.status}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Agent</span>
                <span className="font-medium text-foreground">{selected.assignedTo || "Unassigned"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium text-foreground">{selected.source || "—"}</span>
              </div>
              {selected.serviceInterest && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Interest</span>
                  <span className="font-medium text-foreground">{selected.serviceInterest}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {selected.tags?.length > 0 && (
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1">
                  {selected.tags.map(t => (
                    <span key={t} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 rounded-full text-muted-foreground">
                      <Tag className="w-2.5 h-2.5" />{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-4">
              <Link href={`/admin/crm/leads/${selected.id}`}>
                <button className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors">
                  <Calendar className="w-3.5 h-3.5" /> Full Profile & Timeline
                </button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
