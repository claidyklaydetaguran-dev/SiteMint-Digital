import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle, Check, ChevronLeft, Clock, Inbox as InboxIcon, Loader2,
  MessageSquare, Phone, RefreshCw, Search, Send, UserCheck, Users, X,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { getSmsStatusInfo } from "@/lib/smsStatus";

// ── The one inbox ────────────────────────────────────────────────────────────
//
// This component IS the inbox. `/admin/crm/inbox` renders it, and so does the
// Conversations tab of the Communications Center — both entry points stay in
// the navigation because people have them bookmarked, but there is now exactly
// one implementation behind them.
//
// Before this there were two ~900-line pages calling the same three endpoints
// with their own copies of the polling, selection and unread logic. They had
// already diverged: delivery-status pills and SMS retry existed in only one of
// them, so the answer you got depended on which door you came through.
//
// Everything here reads from the durable conversation model, so three things
// that used to be conflated stay separate on screen:
//
//   read      you have looked at it            (yours alone)
//   assigned  somebody has taken it on         (the team's)
//   resolved  the team is finished with it     (the team's)

const POLL_INTERVAL_MS = 30_000;

// ── Types (the live API contract) ────────────────────────────────────────────

interface Contact {
  id: number; name: string; company?: string | null;
  email?: string | null; phone?: string | null; smsOptOut?: boolean | null;
}

export interface Conversation {
  id: number;
  channel: string;
  status: "unassigned" | "assigned" | "awaiting_customer" | "resolved";
  contactId?: number | null;
  contact?: Contact | null;
  externalAddress?: string | null;
  externalName?: string | null;
  subject?: string | null;
  assignedToStaffId?: number | null;
  assigneeName?: string | null;
  lastMessageAt?: string | null;
  lastInboundAt?: string | null;
  messageCount: number;
  needsReview: boolean;
  reviewReason?: string | null;
  unread: number;
  preview?: string | null;
  previewDirection?: string | null;
}

interface Message {
  id: number;
  createdAt: string;
  direction: string;
  channel: string;
  body?: string | null;
  status?: string | null;
  errorCode?: string | null;
  callStatus?: string | null;
  duration?: number | null;
  sentByStaffId?: number | null;
  sentByName?: string | null;
  origin?: string | null;
}

interface StaffOption { id: number; displayName: string; status: string }

type StatusFilter = "open" | "unassigned" | "assigned" | "awaiting_customer" | "resolved" | "all";

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Nobody has this",
  assigned: "Being handled",
  awaiting_customer: "Waiting on them",
  resolved: "Done",
};

const STATUS_STYLE: Record<string, string> = {
  unassigned: "bg-amber-50 text-amber-800 border-amber-200",
  assigned: "bg-teal-50 text-teal-800 border-teal-200",
  awaiting_customer: "bg-sky-50 text-sky-800 border-sky-200",
  resolved: "bg-green-50 text-green-800 border-green-200",
};

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function titleOf(c: Conversation): string {
  return c.contact?.name || c.externalName || c.externalAddress || `Conversation ${c.id}`;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

export function ConversationInbox({ compact = false }: { compact?: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [readStateAvailable, setReadStateAvailable] = useState(true);
  const [readStateReason, setReadStateReason] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusFilter>("open");
  const [assignee, setAssignee] = useState<"all" | "me" | "unassigned">("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<Conversation | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Debounce the search box so typing does not fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const listUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams({ limit: "25" });
    if (status !== "all") params.set("status", status);
    if (assignee !== "all") params.set("assignee", assignee);
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (cursor) params.set("cursor", cursor);
    return `/api/crm/inbox/conversations?${params.toString()}`;
  }, [status, assignee, debouncedQuery]);

  const loadList = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const res = await adminFetch(listUrl());
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `The inbox could not be loaded (${res.status}).`);
      }
      const data = await res.json();
      setConversations(data.conversations ?? []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.hasMore);
      setReadStateAvailable(data.readStateAvailable !== false);
      setReadStateReason(data.readStateReason ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The inbox could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listUrl]);

  /**
   * Loads the next page and appends it. This is the whole reason the list is
   * keyset-paginated: an older conversation is further down, never absent.
   */
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await adminFetch(listUrl(nextCursor));
      if (!res.ok) return;
      const data = await res.json();
      setConversations(prev => {
        const seen = new Set(prev.map(c => c.id));
        return [...prev, ...(data.conversations ?? []).filter((c: Conversation) => !seen.has(c.id))];
      });
      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, listUrl]);

  const openConversation = useCallback(async (c: Conversation) => {
    setSelected(c);
    selectedRef.current = c;
    setLoadingThread(true);
    setReply("");
    setDraftSavedAt(null);
    try {
      const res = await adminFetch(`/api/crm/inbox/conversations/${c.id}`);
      if (!res.ok) { setError("That conversation could not be opened."); return; }
      const data = await res.json();
      setMessages(data.messages ?? []);
      setSelected(data.conversation ?? c);
      selectedRef.current = data.conversation ?? c;
      if (data.draft?.body) {
        setReply(data.draft.body);
        setDraftSavedAt(data.draft.updatedAt ?? null);
      }
      setTimeout(() => threadRef.current?.scrollTo({ top: 99999 }), 60);

      // Reading is recorded on the server, so it survives a reload and stays
      // this person's own. It deliberately does not assign or resolve.
      await adminFetch(`/api/crm/inbox/conversations/${c.id}/read`, { method: "POST" });
      setConversations(prev => prev.map(x => x.id === c.id ? { ...x, unread: 0 } : x));
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  // The staff list drives the assignment picker. It needs staff.read, which a
  // legacy-token session does not have, so failure is quiet rather than fatal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await adminFetch("/api/crm/staff").catch(() => null);
      if (cancelled || !res?.ok) return;
      const data = await res.json().catch(() => ({}));
      setStaff((data.staff ?? []).filter((s: StaffOption) => s.status !== "disabled"));
    })();
    return () => { cancelled = true; };
  }, []);

  // Polling keeps the list live without wiping what is on screen.
  useEffect(() => {
    if (loading) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      void loadList(true);
      const current = selectedRef.current;
      if (current) {
        void adminFetch(`/api/crm/inbox/conversations/${current.id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.messages) setMessages(d.messages); })
          .catch(() => { /* the next tick retries */ });
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [loading, loadList]);

  // ── Writes ─────────────────────────────────────────────────────────────────

  /** Saves the half-written reply so switching conversations does not lose it. */
  const saveDraft = useCallback((conversationId: number, body: string) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      void adminFetch(`/api/crm/inbox/conversations/${conversationId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      }).then(() => setDraftSavedAt(new Date().toISOString()))
        .catch(() => { /* a draft that fails to save is not worth an alarm */ });
    }, 800);
  }, []);

  async function send() {
    const current = selected;
    if (!current || !reply.trim()) return;
    if (!current.contactId) {
      setError("This conversation is not attached to a contact yet, so there is nobody to reply to. Attach it first.");
      return;
    }
    setSending(true);
    try {
      const res = await adminFetch(`/api/crm/leads/${current.contactId}/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `The message was not sent (${res.status}).`); return; }
      setReply("");
      await adminFetch(`/api/crm/inbox/conversations/${current.id}/draft`, { method: "DELETE" });
      setDraftSavedAt(null);
      await openConversation(current);
      await loadList(true);
    } catch {
      setError("The message could not be sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function setConversationStatus(c: Conversation, next: Conversation["status"]) {
    const res = await adminFetch(`/api/crm/inbox/conversations/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "That change was refused.");
      return;
    }
    const data = await res.json();
    setSelected(prev => prev && prev.id === c.id ? { ...prev, ...data.conversation } : prev);
    setNotice(next === "resolved" ? "Marked done." : `Moved to “${STATUS_LABEL[next] ?? next}”.`);
    await loadList(true);
  }

  async function assign(c: Conversation, staffId: number | null) {
    const res = await adminFetch(`/api/crm/inbox/conversations/${c.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "That assignment was refused.");
      return;
    }
    const data = await res.json();
    setSelected(prev => prev && prev.id === c.id ? { ...prev, ...data.conversation } : prev);
    setNotice(staffId ? "Assigned." : "Put back as unassigned.");
    await loadList(true);
  }

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0),
    [conversations],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border bg-background">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search messages, names, subjects…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)}
          className="px-2 py-1.5 text-xs border border-input rounded-lg bg-background">
          <option value="open">Open</option>
          <option value="unassigned">Nobody has this</option>
          <option value="assigned">Being handled</option>
          <option value="awaiting_customer">Waiting on them</option>
          <option value="resolved">Done</option>
          <option value="all">Everything</option>
        </select>

        <select value={assignee} onChange={e => setAssignee(e.target.value as typeof assignee)}
          className="px-2 py-1.5 text-xs border border-input rounded-lg bg-background">
          <option value="all">Anyone</option>
          <option value="me">Mine</option>
          <option value="unassigned">Unassigned</option>
        </select>

        <button onClick={() => void loadList(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 mx-3 sm:mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 mx-3 sm:mx-4 mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
          <Check className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <p className="text-xs text-teal-800 flex-1">{notice}</p>
          <button onClick={() => setNotice(null)} className="text-teal-700 hover:text-teal-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {readStateReason && (
        <p className="mx-3 sm:mx-4 mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          {readStateReason}
        </p>
      )}

      <div className="flex flex-1 min-h-0">

        {/* ── List ───────────────────────────────────────────────────────── */}
        <div className={`${selected ? "hidden md:flex" : "flex"} w-full ${compact ? "md:w-72" : "md:w-80"} border-r border-border flex-col shrink-0 min-h-0`}>
          <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              {conversations.length} shown
            </span>
            {readStateAvailable && totalUnread > 0 && (
              <span title="Messages that arrived since you last opened the conversation. Yours, not the team's."
                className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {conversations.length === 0 && (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                {debouncedQuery ? "Nothing matches that search." : "No conversations in this view."}
              </p>
            )}

            {conversations.map(c => {
              const name = titleOf(c);
              const isSel = selected?.id === c.id;
              return (
                <button key={c.id} onClick={() => void openConversation(c)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${isSel ? "bg-teal-50" : "hover:bg-accent"}`}>
                  <div className="flex items-start gap-2">
                    <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {initials(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs truncate ${c.unread > 0 ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                          {name}
                        </span>
                        {c.unread > 0 && (
                          <span className="ml-auto bg-red-500 text-white text-[9px] font-bold px-1.5 rounded-full shrink-0">
                            {c.unread > 9 ? "9+" : c.unread}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {c.previewDirection === "outbound" ? "You: " : ""}{c.preview ?? "No messages"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[c.status] ?? ""}`}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                        {c.assigneeName && (
                          <span className="text-[9px] text-muted-foreground truncate">· {c.assigneeName}</span>
                        )}
                        {c.needsReview && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">
                            needs review
                          </span>
                        )}
                        <span className="text-[9px] text-muted-foreground ml-auto shrink-0">{timeAgo(c.lastMessageAt)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {hasMore && (
              <button onClick={() => void loadMore()} disabled={loadingMore}
                className="w-full px-4 py-3 text-xs text-teal-700 hover:bg-accent transition-colors disabled:opacity-50">
                {loadingMore ? "Loading…" : "Load older conversations"}
              </button>
            )}
            {!hasMore && conversations.length > 0 && (
              <p className="px-4 py-3 text-center text-[10px] text-muted-foreground">
                That is every conversation in this view.
              </p>
            )}
          </div>
        </div>

        {/* ── Thread ─────────────────────────────────────────────────────── */}
        <div className={`${selected ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0 min-h-0`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <InboxIcon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Pick a conversation.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-3 sm:px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-2">
                <button onClick={() => setSelected(null)}
                  className="md:hidden p-1 -ml-1 text-muted-foreground hover:text-foreground">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{titleOf(selected)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {selected.contact?.company ? `${selected.contact.company} · ` : ""}
                    {selected.externalAddress ?? ""}
                  </p>
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {selected.contactId && (
                    <Link href={`/admin/crm/leads/${selected.contactId}`}>
                      <span className="text-[11px] text-teal-700 hover:underline cursor-pointer">Open contact</span>
                    </Link>
                  )}

                  <select
                    value={selected.assignedToStaffId ?? ""}
                    onChange={e => void assign(selected, e.target.value === "" ? null : Number(e.target.value))}
                    title="Who is answering this. Separate from who has read it."
                    className="px-2 py-1 text-[11px] border border-input rounded-lg bg-background">
                    <option value="">Unassigned</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}
                  </select>

                  <select
                    value={selected.status}
                    onChange={e => void setConversationStatus(selected, e.target.value as Conversation["status"])}
                    className="px-2 py-1 text-[11px] border border-input rounded-lg bg-background">
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              {selected.needsReview && (
                <p className="mx-3 sm:mx-4 mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                  {selected.reviewReason ?? "This conversation could not be matched to a contact automatically."}
                </p>
              )}

              {/* Messages */}
              <div ref={threadRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-2.5">
                {loadingThread && messages.length === 0 && (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                )}
                {messages.map(m => {
                  const mine = m.direction === "outbound";
                  const statusInfo = m.status ? getSmsStatusInfo(m.status, m.errorCode ?? undefined) : null;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                        mine ? "bg-teal-600 text-white" : "bg-muted text-foreground"
                      }`}>
                        {m.channel === "call" ? (
                          <p className="text-xs flex items-center gap-1.5">
                            <Phone className="w-3 h-3" /> {m.body}
                            {m.duration ? ` · ${Math.floor(m.duration / 60)}:${String(m.duration % 60).padStart(2, "0")}` : ""}
                          </p>
                        ) : (
                          <p className="text-xs whitespace-pre-wrap break-words">{m.body}</p>
                        )}
                        <div className={`flex items-center gap-1.5 mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted-foreground"}`}>
                          <Clock className="w-2.5 h-2.5" />
                          {timeAgo(m.createdAt)}
                          {/* Who sent it. `origin` distinguishes a person from
                              automation from history that never recorded one —
                              a blank here is never guessed into a name. */}
                          {mine && m.sentByName && <span>· {m.sentByName}</span>}
                          {mine && !m.sentByName && m.origin === "automated" && <span>· automated</span>}
                          {mine && !m.sentByName && m.origin === "legacy" && <span>· sender not recorded</span>}
                          {statusInfo && <span>· {statusInfo.label}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!loadingThread && messages.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-8">No messages yet.</p>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-border px-3 sm:px-4 py-2.5">
                {selected.contact?.smsOptOut ? (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
                    This person sent STOP. The CRM will not text them, and that is deliberate.
                  </p>
                ) : !selected.contactId ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    Attach this conversation to a contact before replying.
                  </p>
                ) : (
                  <>
                    <div className="flex items-end gap-2">
                      <textarea
                        value={reply}
                        rows={2}
                        onChange={e => {
                          setReply(e.target.value);
                          saveDraft(selected.id, e.target.value);
                        }}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
                        }}
                        placeholder="Write a reply…"
                        className="flex-1 px-3 py-2 text-xs border border-input rounded-lg bg-background resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <button onClick={() => void send()} disabled={sending || !reply.trim()}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Send
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      SMS via Twilio · ⌘+Enter to send
                      {draftSavedAt && " · draft saved"}
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConversationInbox;
