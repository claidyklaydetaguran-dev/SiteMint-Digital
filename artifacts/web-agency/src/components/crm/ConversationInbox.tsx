import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle, Check, ChevronLeft, Clock, Inbox as InboxIcon, Loader2,
  MessageSquare, Phone, RefreshCw, Search, Send, UserCheck, Users, X,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, failureReason, readAdminResource, responseFailureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure, dataOf, reasonOf } from "@/components/crm/LoadState";
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

// ── What a request has to produce to count as an answer ──────────────────────
//
// A body that is not the shape this component expects is a failure too, not a
// reason to render an empty inbox.

/** One page of the list, with the cursor and read-state flags that came with it. */
interface InboxPage {
  conversations: Conversation[];
  nextCursor: string | null;
  hasMore: boolean;
  readStateAvailable: boolean;
  readStateReason: string | null;
}

/** One opened conversation: its messages, and the draft reply held for it. */
interface Thread {
  conversation: Conversation | null;
  messages: Message[];
  draftBody: string | null;
  draftUpdatedAt: string | null;
}

function pickInboxPage(body: unknown): InboxPage | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as {
    conversations?: unknown; nextCursor?: unknown; hasMore?: unknown;
    readStateAvailable?: unknown; readStateReason?: unknown;
  };
  if (!Array.isArray(b.conversations)) return undefined;
  return {
    conversations: b.conversations as Conversation[],
    nextCursor: typeof b.nextCursor === "string" ? b.nextCursor : null,
    hasMore: b.hasMore === true,
    readStateAvailable: b.readStateAvailable !== false,
    readStateReason: typeof b.readStateReason === "string" ? b.readStateReason : null,
  };
}

function pickThread(body: unknown): Thread | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as { conversation?: unknown; messages?: unknown; draft?: unknown };
  if (!Array.isArray(b.messages)) return undefined;
  const draft = b.draft && typeof b.draft === "object"
    ? b.draft as { body?: unknown; updatedAt?: unknown }
    : null;
  return {
    conversation: (b.conversation ?? null) as Conversation | null,
    messages: b.messages as Message[],
    draftBody: typeof draft?.body === "string" ? draft.body : null,
    draftUpdatedAt: typeof draft?.updatedAt === "string" ? draft.updatedAt : null,
  };
}

function pickStaff(body: unknown): StaffOption[] | undefined {
  const list = body && typeof body === "object" ? (body as { staff?: unknown }).staff : undefined;
  if (!Array.isArray(list)) return undefined;
  return (list as StaffOption[]).filter(s => s.status !== "disabled");
}

export function ConversationInbox({ compact = false }: { compact?: boolean }) {
  // The list, its cursor and its read-state flags are one answer, and that
  // answer is either data or a stated failure. `conversations.length` on a
  // failed load is 0, and "0 shown" over "No conversations in this view" was a
  // claim about the customer's messages that nobody had checked.
  const [listLoad, setListLoad] = useState<Load<InboxPage>>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);

  const [selected, setSelected] = useState<Conversation | null>(null);
  // The opened thread is its own answer too: "No messages yet." must never
  // stand in for a thread that could not be read.
  const [threadLoad, setThreadLoad] = useState<Load<Thread>>({ status: "loading" });

  // The picker's options. An empty picker with no explanation says "there is
  // nobody to hand this to", which is a different thing from "we could not ask
  // who there is".
  const [staffLoad, setStaffLoad] = useState<Load<StaffOption[]>>({ status: "loading" });

  const [status, setStatus] = useState<StatusFilter>("open");
  const [assignee, setAssignee] = useState<"all" | "me" | "unassigned">("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** What actually loaded, or null. Never an empty list standing in for a failure. */
  const page = dataOf(listLoad);
  const conversations = page?.conversations ?? null;
  const messages = threadLoad.status === "ready" ? threadLoad.data.messages : null;
  const staff = dataOf(staffLoad) ?? [];

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
    const next = await readAdminResource(listUrl(), pickInboxPage);
    setRefreshing(false);
    if (next.status === "ready") { setListLoad(next); setError(null); return; }
    // A background refresh that failed must not wipe a list that is on screen
    // and known to be real — but it must not pass for a quiet success either.
    setListLoad(prev => (silent && prev.status === "ready" ? prev : next));
    if (silent) setError(`The list could not be refreshed. ${reasonOf(next) ?? ""}`);
  }, [listUrl]);

  /**
   * Loads the next page and appends it. This is the whole reason the list is
   * keyset-paginated: an older conversation is further down, never absent.
   *
   * A refused page used to `return` in silence, which read as "there are no
   * older conversations" — the exact opposite of what had happened.
   */
  const loadMore = useCallback(async () => {
    const current = listLoad.status === "ready" ? listLoad.data : null;
    if (!current?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    const next = await readAdminResource(listUrl(current.nextCursor), pickInboxPage);
    setLoadingMore(false);
    if (next.status !== "ready") {
      setError(`Older conversations were not loaded. ${reasonOf(next) ?? ""}`);
      return;
    }
    const older = next.data;
    setListLoad(prev => {
      if (prev.status !== "ready") return prev;
      const seen = new Set(prev.data.conversations.map(c => c.id));
      return {
        status: "ready",
        data: {
          ...older,
          conversations: [...prev.data.conversations, ...older.conversations.filter(c => !seen.has(c.id))],
        },
      };
    });
  }, [listLoad, loadingMore, listUrl]);

  const openConversation = useCallback(async (c: Conversation) => {
    setSelected(c);
    selectedRef.current = c;
    setThreadLoad({ status: "loading" });
    setReply("");
    setDraftSavedAt(null);
    const next = await readAdminResource(`/api/crm/inbox/conversations/${c.id}`, pickThread);
    setThreadLoad(next);
    if (next.status !== "ready") return;
    if (next.data.conversation) {
      setSelected(next.data.conversation);
      selectedRef.current = next.data.conversation;
    }
    if (next.data.draftBody) {
      setReply(next.data.draftBody);
      setDraftSavedAt(next.data.draftUpdatedAt);
    }
    setTimeout(() => threadRef.current?.scrollTo({ top: 99999 }), 60);

    // Reading is recorded on the server, so it survives a reload and stays
    // this person's own. It deliberately does not assign or resolve.
    await adminFetch(`/api/crm/inbox/conversations/${c.id}/read`, { method: "POST" });
    setListLoad(prev => (prev.status === "ready"
      ? {
          status: "ready",
          data: {
            ...prev.data,
            conversations: prev.data.conversations.map(x => x.id === c.id ? { ...x, unread: 0 } : x),
          },
        }
      : prev));
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  // The staff list drives the assignment picker. It needs staff.read, which a
  // legacy-token session does not have — so it is not fatal to the inbox, but
  // it is said out loud rather than shown as "nobody works here".
  useEffect(() => {
    let cancelled = false;
    void readAdminResource("/api/crm/staff", pickStaff).then(next => {
      if (!cancelled) setStaffLoad(next);
    });
    return () => { cancelled = true; };
  }, []);

  // Polling keeps the list live without wiping what is on screen.
  useEffect(() => {
    if (listLoad.status === "loading") return;
    const t = setInterval(() => {
      if (document.hidden) return;
      void loadList(true);
      const current = selectedRef.current;
      if (current) {
        // A poll that fails leaves the messages already on screen exactly as
        // they are — they are real — and the next tick retries.
        void readAdminResource(`/api/crm/inbox/conversations/${current.id}`, pickThread).then(next => {
          if (next.status === "ready" && selectedRef.current?.id === current.id) setThreadLoad(next);
        });
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [listLoad.status, loadList]);

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
      // This route keeps its own bearer-only guard (TRANSITIONAL_FOREIGN_AUTH
      // in adminFetch), so its 401 opens no session dialog — the refusal has
      // to be stated right here or it is stated nowhere.
      if (!res.ok) { setError(`The message was not sent. ${await responseFailureReason(res)}`); return; }
      setReply("");
      await adminFetch(`/api/crm/inbox/conversations/${current.id}/draft`, { method: "DELETE" });
      setDraftSavedAt(null);
      await openConversation(current);
      await loadList(true);
    } catch {
      setError(`The message was not sent. ${failureReason(null)}`);
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
      setError(`That change was not saved. ${await responseFailureReason(res)}`);
      return;
    }
    const data = await res.json().catch(() => ({})) as { conversation?: Conversation };
    setSelected(prev => prev && prev.id === c.id ? { ...prev, ...(data.conversation ?? {}) } : prev);
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
      setError(`That assignment was not saved. ${await responseFailureReason(res)}`);
      return;
    }
    const data = await res.json().catch(() => ({})) as { conversation?: Conversation };
    setSelected(prev => prev && prev.id === c.id ? { ...prev, ...(data.conversation ?? {}) } : prev);
    setNotice(staffId ? "Assigned." : "Put back as unassigned.");
    await loadList(true);
  }

  // Null, not 0, when the list never arrived: an unread badge reading 0 — or
  // no badge at all — is a claim that nothing is waiting.
  const totalUnread = useMemo(
    () => (conversations === null ? null : conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0)),
    [conversations],
  );

  if (listLoad.status === "loading") {
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
        <div role="alert" className="flex items-start gap-2 mx-3 sm:mx-4 mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 mx-3 sm:mx-4 mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
          <Check className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <p className="text-xs text-teal-800 flex-1">{notice}</p>
          <button onClick={() => setNotice(null)} className="text-teal-700 hover:text-teal-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {page?.readStateReason && (
        <p className="mx-3 sm:mx-4 mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 break-words">
          {page.readStateReason}
        </p>
      )}
      {/*
        Name the part that is unavailable rather than showing a picker with
        nobody in it. The assignment control still works — "Unassigned" is a
        real choice — but it cannot offer people it could not read.
      */}
      {staffLoad.status === "error" && (
        <p role="alert" className="mx-3 sm:mx-4 mt-2 min-w-0 break-words rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">The staff list is unavailable,</span>{" "}
          so nobody can be picked to handle a conversation. {staffLoad.reason}
        </p>
      )}

      <div className="flex flex-1 min-h-0">

        {/* ── List ───────────────────────────────────────────────────────── */}
        <div className={`${selected ? "hidden md:flex" : "flex"} w-full ${compact ? "md:w-72" : "md:w-80"} border-r border-border flex-col shrink-0 min-h-0`}>
          <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
            {/* The count exists only when the list behind it loaded. */}
            <span className="text-xs font-semibold text-foreground">
              {conversations
                ? `${conversations.length} shown`
                : <><Figure value={null} /> shown</>}
            </span>
            {page?.readStateAvailable && totalUnread !== null && totalUnread > 0 && (
              <span title="Messages that arrived since you last opened the conversation. Yours, not the team's."
                className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {conversations === null ? (
              /*
                Deliberately NOT the "No conversations in this view" line
                below: an empty view is a fact about the business, this is a
                fact about the request, and a customer waiting for a reply is
                exactly what would be hidden by confusing the two.
              */
              <div className="p-3">
                <LoadFailure
                  what="Conversations"
                  reason={reasonOf(listLoad) ?? ""}
                  onRetry={() => { void loadList(); }}
                  retrying={refreshing}
                >
                  <p className="mt-2 text-xs text-muted-foreground">
                    No count and no unread badge are shown while this is unavailable — there may well be messages waiting.
                  </p>
                </LoadFailure>
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                {debouncedQuery ? "Nothing matches that search." : "No conversations in this view."}
              </p>
            ) : null}

            {(conversations ?? []).map(c => {
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

            {page?.hasMore && (
              <button onClick={() => void loadMore()} disabled={loadingMore}
                className="w-full px-4 py-3 text-xs text-teal-700 hover:bg-accent transition-colors disabled:opacity-50">
                {loadingMore ? "Loading…" : "Load older conversations"}
              </button>
            )}
            {/* "That is every conversation" is a promise only a loaded list can make. */}
            {page && !page.hasMore && conversations !== null && conversations.length > 0 && (
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
                {threadLoad.status === "loading" && (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                )}
                {threadLoad.status === "error" && (
                  <LoadFailure
                    what="This conversation"
                    reason={threadLoad.reason}
                    onRetry={() => { if (selected) void openConversation(selected); }}
                  >
                    <p className="mt-2 text-sm text-muted-foreground">
                      This is not an empty conversation — it is one that could not be read.
                    </p>
                  </LoadFailure>
                )}
                {(messages ?? []).map(m => {
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
                {messages !== null && messages.length === 0 && (
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
