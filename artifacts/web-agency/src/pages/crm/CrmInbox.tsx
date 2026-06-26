import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  Phone, MessageSquare, Mail, Send, AlertCircle, CheckCircle2,
  Building, Globe, Tag, Calendar, ChevronRight,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

const AVATAR_COLORS = [
  "bg-blue-500", "bg-indigo-500", "bg-purple-500", "bg-pink-500",
  "bg-red-400", "bg-orange-400", "bg-yellow-500", "bg-teal-500",
  "bg-cyan-500", "bg-emerald-500",
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
function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface CrmMessage {
  id: number;
  createdAt: string;
  leadId: number | null;
  direction: string;
  channel: string;
  body?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  status?: string | null;
  errorCode?: string | null;
  callStatus?: string | null;
  duration?: number | null;
}

interface ThreadLead {
  id: number;
  name: string;
  phone?: string | null;
  email: string;
  company?: string | null;
  smsOptOut?: boolean | null;
}

interface ConversationThread {
  leadId: number | null;
  lead: ThreadLead | null;
  messages: CrmMessage[];
  lastAt: string;
  unread: number;
}

interface FullLead {
  id: number; name: string; company?: string; email: string; phone?: string;
  status: string; assignedTo?: string; website?: string; source?: string;
  serviceInterest?: string; lastContactedAt?: string; updatedAt: string;
  tags: string[]; smsOptOut?: boolean; smsConsent?: boolean;
}

export default function CrmInbox() {
  const [, navigate] = useLocation();
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [selected, setSelected] = useState<ConversationThread | null>(null);
  const [selectedLead, setSelectedLead] = useState<FullLead | null>(null);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [sending, setSending] = useState(false);
  const [smsError, setSmsError] = useState("");
  const [toast, setToast] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const scrollToBottom = () => {
    setTimeout(() => threadRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 80);
  };

  // Load all conversation threads
  const loadThreads = useCallback(async (keepSelected?: ConversationThread) => {
    if (!token()) {
      navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    try {
      const r = await fetch("/api/crm/conversations", {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.status === 401) {
        navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!r.ok) throw new Error("fetch failed");
      const d = await r.json() as { conversations: ConversationThread[] };
      const convs = d.conversations || [];
      setThreads(convs);
      if (!keepSelected && convs.length > 0) {
        const first = convs[0];
        setSelected(first);
        setMessages(first.messages.slice().reverse());
        scrollToBottom();
      }
    } catch {
      setError("Failed to load inbox. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { loadThreads(); }, []);

  // Load full lead detail (for right panel + smsOptOut flag)
  const loadFullLead = useCallback(async (leadId: number) => {
    const r = await fetch(`/api/crm/leads/${leadId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (r.ok) {
      const d = await r.json() as { lead: FullLead };
      setSelectedLead(d.lead ?? null);
    }
  }, []);

  // Refresh messages for selected thread
  const loadMessages = useCallback(async (leadId: number) => {
    setLoadingMsgs(true);
    try {
      const r = await fetch(`/api/crm/leads/${leadId}/messages`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) {
        const d = await r.json() as { messages: CrmMessage[] };
        const msgs = (d.messages || []).slice().reverse(); // oldest first for display
        setMessages(msgs);
        scrollToBottom();
      }
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const selectThread = (thread: ConversationThread) => {
    setSelected(thread);
    setSelectedLead(null);
    setSmsBody("");
    setSmsError("");
    const msgs = thread.messages.slice().reverse();
    setMessages(msgs);
    scrollToBottom();
    if (thread.leadId) {
      loadMessages(thread.leadId);
      loadFullLead(thread.leadId);
    }
  };

  const sendSms = async () => {
    if (!selected?.leadId || !smsBody.trim()) return;
    setSending(true);
    setSmsError("");
    try {
      const r = await fetch(`/api/crm/leads/${selected.leadId}/sms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: smsBody.trim() }),
      });
      const d = await r.json() as { error?: string; success?: boolean };
      if (r.ok) {
        setSmsBody("");
        showToast("SMS sent.");
        if (selected.leadId) loadMessages(selected.leadId);
      } else {
        setSmsError(d.error ?? "Failed to send SMS.");
      }
    } catch {
      setSmsError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const smsOptOut = selectedLead?.smsOptOut ?? selected?.lead?.smsOptOut ?? false;
  const displayName = (t: ConversationThread) => t.lead?.name ?? "Unknown Contact";
  const lastMsg = (t: ConversationThread) => t.messages[0] ?? null;

  return (
    <CrmLayout>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-foreground text-background px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {toast}
        </div>
      )}

      <div className="flex h-[calc(100vh-48px)]">

        {/* ── LEFT — Thread list ─────────────────────────────────────────────── */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground">
                Inbox
                {!loading && (
                  <span className="ml-1.5 text-muted-foreground font-normal">({threads.length})</span>
                )}
              </h2>
              <span className="text-[10px] text-muted-foreground bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-full font-medium">
                SMS &amp; Calls
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="p-5 text-center">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-400" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : threads.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-25" />
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="text-xs mt-1 opacity-70">
                  SMS and calls will appear here once Twilio is connected.
                </p>
              </div>
            ) : (
              threads.map((thread, idx) => {
                const name = displayName(thread);
                const last = lastMsg(thread);
                const isActive = selected?.leadId === thread.leadId && selected?.leadId !== null
                  ? true
                  : selected === thread;
                const preview = last?.channel === "call"
                  ? (last.direction === "inbound" ? "📞 Incoming call" : "📞 Outgoing call")
                  : (last?.body?.substring(0, 55) ?? "—");

                return (
                  <button
                    key={`${thread.leadId ?? "orphan"}-${idx}`}
                    onClick={() => selectThread(thread)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      isActive ? "bg-blue-50 border-l-2 border-blue-500" : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full ${avatarColor(name)} flex items-center justify-center shrink-0 relative`}>
                        <span className="text-white text-xs font-semibold">{initials(name)}</span>
                        {thread.unread > 0 && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                            {thread.unread > 9 ? "9+" : thread.unread}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-sm truncate ${thread.unread > 0 ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                            {name}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(thread.lastAt)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {last && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                              last.channel === "sms"
                                ? "bg-sky-100 text-sky-700"
                                : "bg-gray-100 text-gray-600"
                            }`}>
                              {last.channel === "sms" ? "SMS" : "Call"}
                            </span>
                          )}
                          {last?.direction === "inbound" && (
                            <span className="text-[10px] text-emerald-600 font-bold shrink-0">↓</span>
                          )}
                          {last?.direction === "outbound" && (
                            <span className="text-[10px] text-blue-500 font-bold shrink-0">↑</span>
                          )}
                          <p className="text-xs text-muted-foreground truncate">{preview}</p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── CENTER — Message thread ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              {/* Thread header */}
              <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 shrink-0">
                <div className={`w-9 h-9 rounded-full ${avatarColor(displayName(selected))} flex items-center justify-center shrink-0`}>
                  <span className="text-white text-sm font-bold">{initials(displayName(selected))}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{displayName(selected)}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.lead?.phone ?? selected.lead?.email ?? "Unknown number"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selected.lead?.phone && (
                    <a href={`tel:${selected.lead.phone}`}
                      className="w-7 h-7 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors"
                      title="Call">
                      <Phone className="w-3.5 h-3.5 text-white" />
                    </a>
                  )}
                  {selected.lead?.email && (
                    <a href={`mailto:${selected.lead.email}`}
                      className="w-7 h-7 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors"
                      title="Email">
                      <Mail className="w-3.5 h-3.5 text-white" />
                    </a>
                  )}
                  {selected.lead?.id && (
                    <Link href={`/admin/crm/leads/${selected.lead.id}`}>
                      <button className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5 ml-1 font-medium">
                        Full Profile <ChevronRight className="w-3 h-3" />
                      </button>
                    </Link>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div ref={threadRef} className="flex-1 overflow-y-auto p-5 space-y-3 bg-gray-50">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-16">
                    <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No messages in this conversation yet.
                  </div>
                ) : (
                  messages.map(msg => {
                    const isOut = msg.direction === "outbound";
                    const isCall = msg.channel === "call";
                    const hasError = !!msg.errorCode;

                    if (isCall) {
                      const statusColor =
                        msg.callStatus === "completed" ? "text-green-600 bg-green-100" :
                        msg.callStatus === "no-answer" || msg.callStatus === "busy" || msg.callStatus === "failed" ? "text-red-500 bg-red-100" :
                        "text-gray-500 bg-gray-100";

                      return (
                        <div key={msg.id} className="flex justify-center">
                          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 max-w-xs shadow-sm w-full">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${statusColor}`}>
                              <Phone className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {isOut ? "Outbound" : "Inbound"} Call
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {msg.callStatus && (
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor}`}>
                                    {msg.callStatus}
                                  </span>
                                )}
                                {msg.duration != null && msg.duration > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatDuration(msg.duration)}
                                  </span>
                                )}
                                <span className="text-[11px] text-muted-foreground">{timeAgo(msg.createdAt)}</span>
                              </div>
                              {msg.body && <p className="text-xs text-muted-foreground mt-1 truncate">{msg.body}</p>}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // SMS bubble
                    return (
                      <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-sm rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                          hasError
                            ? "bg-red-50 border border-red-200 text-red-700"
                            : isOut
                              ? "bg-foreground text-background"
                              : "bg-white border border-gray-200 text-foreground"
                        }`}>
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                          <div className={`flex items-center gap-1.5 mt-1 ${isOut ? "justify-end" : "justify-start"}`}>
                            <span className={`text-[10px] ${isOut ? "text-background/50" : "text-muted-foreground"}`}>
                              {timeAgo(msg.createdAt)}
                            </span>
                            {isOut && !hasError && msg.status && msg.status !== "delivered" && msg.status !== "sent" && (
                              <span className={`text-[10px] ${isOut ? "text-background/50" : "text-muted-foreground"}`}>
                                · {msg.status}
                              </span>
                            )}
                            {isOut && msg.status === "delivered" && (
                              <CheckCircle2 className="w-2.5 h-2.5 text-background/50" />
                            )}
                            {hasError && (
                              <span className="text-[10px] text-red-500 font-medium">
                                · Failed {msg.errorCode ? `(${msg.errorCode})` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* ── SMS Compose panel ── */}
              {selected.leadId ? (
                <div className="bg-white border-t border-gray-200 p-4 shrink-0">
                  {smsOptOut ? (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>SMS disabled — this lead has opted out (STOP received).</span>
                    </div>
                  ) : !selected.lead?.phone ? (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>No phone number on this lead. Add a phone number to enable SMS.</span>
                    </div>
                  ) : (
                    <>
                      {smsError && (
                        <div className="mb-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {smsError}
                        </div>
                      )}
                      <div className="flex gap-2 items-end">
                        <MessageSquare className="w-4 h-4 text-muted-foreground mb-2.5 shrink-0" />
                        <textarea
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                          rows={3}
                          placeholder={`Message ${selected.lead.phone}…`}
                          value={smsBody}
                          onChange={e => setSmsBody(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendSms();
                          }}
                        />
                        <Button
                          size="sm"
                          className="self-end gap-1.5 mb-0.5"
                          disabled={sending || !smsBody.trim()}
                          onClick={sendSms}
                        >
                          <Send className="w-3.5 h-3.5" />
                          {sending ? "Sending…" : "Send"}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5 pl-6">
                        ⌘+Enter to send · SMS via Twilio
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-white border-t border-gray-200 p-4 text-center text-sm text-muted-foreground shrink-0">
                  This conversation has no linked CRM lead — SMS unavailable.
                </div>
              )}
            </>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
          ) : threads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-10">
              <MessageSquare className="w-14 h-14 mb-4 opacity-15" />
              <p className="font-semibold text-foreground text-base">Your inbox is empty</p>
              <p className="text-sm mt-2 max-w-xs">
                SMS and call records will appear here once your Twilio number is connected and receiving messages.
              </p>
              <Link href="/admin/crm/leads">
                <Button variant="outline" size="sm" className="mt-5">Browse CRM Leads</Button>
              </Link>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a conversation to view messages
            </div>
          )}
        </div>

        {/* ── RIGHT — Contact profile ────────────────────────────────────────── */}
        {selected?.lead && (
          <div className="w-64 bg-white border-l border-gray-200 overflow-y-auto shrink-0">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full ${avatarColor(displayName(selected))} flex items-center justify-center shrink-0`}>
                  <span className="text-white font-bold">{initials(displayName(selected))}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{displayName(selected)}</p>
                  {selected.lead.company && (
                    <p className="text-xs text-muted-foreground truncate">{selected.lead.company}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                {selected.lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a href={`tel:${selected.lead.phone}`} className="text-xs text-foreground hover:text-blue-600 truncate">
                      {selected.lead.phone}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <a href={`mailto:${selected.lead.email}`} className="text-xs text-blue-600 hover:text-blue-800 truncate">
                    {selected.lead.email}
                  </a>
                </div>
                {selected.lead.company && (
                  <div className="flex items-center gap-2">
                    <Building className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground truncate">{selected.lead.company}</span>
                  </div>
                )}
                {selectedLead?.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a href={selectedLead.website} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 truncate">
                      {selectedLead.website}
                    </a>
                  </div>
                )}
              </div>

              {smsOptOut && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                  <AlertCircle className="w-3 h-3 shrink-0" /> SMS opted out
                </div>
              )}
            </div>

            {/* Thread stats */}
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">This Thread</h3>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Messages</span>
                  <span className="font-medium">{messages.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Inbound</span>
                  <span className="font-medium">{messages.filter(m => m.direction === "inbound").length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Outbound</span>
                  <span className="font-medium">{messages.filter(m => m.direction === "outbound").length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Calls</span>
                  <span className="font-medium">{messages.filter(m => m.channel === "call").length}</span>
                </div>
              </div>
            </div>

            {/* CRM details from full lead */}
            {selectedLead && (
              <div className="p-4 border-b border-gray-100 space-y-1.5">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">CRM Details</h3>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Stage</span>
                  <span className="font-medium">{selectedLead.status}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Agent</span>
                  <span className="font-medium">{selectedLead.assignedTo || "Unassigned"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-medium truncate ml-2">{selectedLead.source || "—"}</span>
                </div>
                {selectedLead.serviceInterest && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Interest</span>
                    <span className="font-medium truncate ml-2">{selectedLead.serviceInterest}</span>
                  </div>
                )}
              </div>
            )}

            {/* Tags */}
            {(selectedLead?.tags?.length ?? 0) > 0 && (
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1">
                  {selectedLead?.tags?.map(t => (
                    <span key={t} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 rounded-full text-muted-foreground">
                      <Tag className="w-2.5 h-2.5" />{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-4">
              {selected.lead?.id && (
                <Link href={`/admin/crm/leads/${selected.lead.id}`}>
                  <button className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors">
                    <Calendar className="w-3.5 h-3.5" /> Full Profile &amp; Timeline
                  </button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
