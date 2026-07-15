import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListHelpdeskTickets,
  useGetHelpdeskTicket,
  useGetHelpdeskStats,
  useCreateHelpdeskMessage,
  useUpdateHelpdeskTicket,
  getGetHelpdeskTicketQueryKey,
  getListHelpdeskTicketsQueryKey,
  getGetHelpdeskStatsQueryKey,
} from "@workspace/api-client-react";
import type { HelpdeskTicket, HelpdeskMessage, HelpdeskTicketDetail } from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  ChevronDown,
  LayoutGrid,
  List,
  Mail,
  MessageSquare,
  Phone,
  MessageCircle,
  Clock,
  AlertCircle,
  Paperclip,
  Lock,
  Bold,
  Italic,
  Link as LinkIcon,
  Smile,
  Plus,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function slaRemaining(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m remaining`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const cls = className || "h-3 w-3";
  switch (channel) {
    case "email": return <Mail className={cls} />;
    case "chat": return <MessageSquare className={cls} />;
    case "sms": return <MessageCircle className={cls} />;
    case "voice": return <Phone className={cls} />;
    default: return <Mail className={cls} />;
  }
}

type CategoryView = "all-open" | "assigned-to-me" | "unassigned" | "snoozed" | "closed";

// ─── main component ──────────────────────────────────────────────────────────

export default function Inbox() {
  const [activeCategory, setActiveCategory] = useState<CategoryView>("all-open");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const ticketParams = {
    status: activeCategory === "snoozed" ? "snoozed" : activeCategory === "closed" ? "closed" : "open",
    view: activeCategory === "unassigned" ? "unassigned" : activeCategory === "assigned-to-me" ? "assigned-to-me" : undefined,
    search: search || undefined,
  };

  const { data: tickets, isLoading: isLoadingTickets } = useListHelpdeskTickets(ticketParams);
  const { data: stats } = useGetHelpdeskStats();
  const { data: detail, isLoading: isLoadingDetail } = useGetHelpdeskTicket(
    selectedTicketId as number,
    { query: { enabled: !!selectedTicketId, queryKey: getGetHelpdeskTicketQueryKey(selectedTicketId as number) } }
  );

  const invalidate = () => {
    if (selectedTicketId) {
      queryClient.invalidateQueries({ queryKey: getGetHelpdeskTicketQueryKey(selectedTicketId) });
    }
    queryClient.invalidateQueries({ queryKey: getListHelpdeskTicketsQueryKey(ticketParams) });
    queryClient.invalidateQueries({ queryKey: getGetHelpdeskStatsQueryKey() });
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 font-sans text-slate-900">
      {/* Pane 1: Category Rail */}
      <CategoryRail
        active={activeCategory}
        onSelect={setActiveCategory}
        stats={stats}
        search={search}
        onSearch={setSearch}
      />

      {/* Pane 2: Ticket List */}
      <TicketList
        tickets={tickets}
        isLoading={isLoadingTickets}
        selectedId={selectedTicketId}
        onSelect={setSelectedTicketId}
        activeCategory={activeCategory}
      />

      {/* Pane 3: Thread + Pane 4: Details */}
      {selectedTicketId && detail ? (
        <>
          <ThreadPanel detail={detail} onInvalidate={invalidate} />
          <DetailsPanel detail={detail} onInvalidate={invalidate} />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm bg-white">
          {isLoadingDetail ? (
            <RefreshCw className="h-5 w-5 animate-spin" />
          ) : (
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-slate-200" />
              <p className="font-medium text-slate-400">Select a ticket to view conversation</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CategoryRail ─────────────────────────────────────────────────────────────

function CategoryRail({
  active,
  onSelect,
  stats,
  search,
  onSearch,
}: {
  active: CategoryView;
  onSelect: (v: CategoryView) => void;
  stats: { allOpen?: number; assignedToMe?: number; unassigned?: number; snoozed?: number; closed?: number } | undefined;
  search: string;
  onSearch: (s: string) => void;
}) {
  return (
    <div className="w-[210px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="p-3 border-b border-slate-200">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search tickets…"
            className="h-8 pl-8 bg-slate-50 border-slate-200 text-xs focus-visible:ring-indigo-500"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">Inbox</h3>
          <div className="space-y-0.5">
            <NavItem label="All Open" count={stats?.allOpen} active={active === "all-open"} onClick={() => onSelect("all-open")} />
            <NavItem label="Assigned to Me" count={stats?.assignedToMe} active={active === "assigned-to-me"} onClick={() => onSelect("assigned-to-me")} />
            <NavItem label="Unassigned" count={stats?.unassigned} active={active === "unassigned"} countHighlight onClick={() => onSelect("unassigned")} />
            <NavItem label="Snoozed" count={stats?.snoozed} active={active === "snoozed"} onClick={() => onSelect("snoozed")} />
            <NavItem label="Closed" count={stats?.closed} active={active === "closed"} onClick={() => onSelect("closed")} />
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">Views</h3>
          <div className="space-y-0.5">
            <NavItem label="VIP Customers" />
            <NavItem label="Billing Issues" />
            <NavItem label="Technical Support" />
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">Teams</h3>
          <div className="space-y-0.5">
            <NavItem label="Support" count={5} countSuffix="members" />
            <NavItem label="Engineering" count={3} countSuffix="members" />
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  label,
  count,
  active,
  onClick,
  countHighlight,
  countSuffix,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  countHighlight?: boolean;
  countSuffix?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
        active ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
      onClick={onClick}
    >
      <span className={active ? "font-semibold" : "font-medium"}>{label}</span>
      {count !== undefined && (
        <span
          className={`text-xs rounded-full px-1.5 ${
            countHighlight && count > 0
              ? "bg-rose-500 text-white font-semibold px-2"
              : active
              ? "text-indigo-500 font-medium"
              : "text-slate-400"
          }`}
        >
          {count}
          {countSuffix ? ` ${countSuffix}` : ""}
        </span>
      )}
    </div>
  );
}

// ─── TicketList ───────────────────────────────────────────────────────────────

function TicketList({
  tickets,
  isLoading,
  selectedId,
  onSelect,
  activeCategory,
}: {
  tickets: HelpdeskTicket[] | undefined;
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  activeCategory: CategoryView;
}) {
  const label = {
    "all-open": "All Open",
    "assigned-to-me": "Assigned to Me",
    unassigned: "Unassigned",
    snoozed: "Snoozed",
    closed: "Closed",
  }[activeCategory];

  return (
    <div className="w-[300px] flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
      <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-900 text-sm">{label}</h2>
          {tickets && (
            <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-transparent rounded-full px-2 py-0 text-xs h-5">
              {tickets.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <button className="flex items-center gap-1 text-xs font-medium hover:text-slate-900">
            Newest <ChevronDown className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-1 border-l border-slate-200 pl-2 ml-1">
            <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900">
              <List className="h-4 w-4" />
            </button>
            <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900">
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : !tickets?.length ? (
          <div className="text-center py-12 text-sm text-slate-400">No tickets</div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              selected={selectedId === ticket.id}
              onClick={() => onSelect(ticket.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TicketCard({
  ticket,
  selected,
  onClick,
}: {
  ticket: HelpdeskTicket;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      data-testid={`card-ticket-${ticket.id}`}
      className={`p-3 rounded-lg border cursor-pointer transition-all relative ${
        selected
          ? "border-indigo-300 bg-indigo-50/40 shadow-sm"
          : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm"
      }`}
      onClick={onClick}
    >
      {selected && (
        <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r-md" />
      )}

      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback
              style={{ backgroundColor: ticket.contactAvatarColor }}
              className="text-white text-[10px] font-bold"
            >
              {ticket.contactInitials}
            </AvatarFallback>
          </Avatar>
          <span className={`text-sm ${selected ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
            {ticket.contactName}
          </span>
        </div>
        <span className={`text-xs ${selected ? "text-indigo-600 font-medium" : "text-slate-400"}`}>
          {relativeTime(ticket.updatedAt)}
        </span>
      </div>

      <div className={`text-sm font-medium truncate mb-1 pr-2 ${selected ? "text-slate-900" : "text-slate-800"}`}>
        {ticket.subject}
      </div>
      <div className="text-xs text-slate-500 truncate mb-3 pr-2">{ticket.snippetText}</div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-slate-100 text-slate-500">
            <ChannelIcon channel={ticket.channel} />
          </div>
          {ticket.priority === "urgent" && (
            <Badge variant="outline" className="text-[10px] uppercase font-bold border-rose-200 text-rose-600 px-1 py-0 h-5 bg-rose-50">
              Urgent
            </Badge>
          )}
          {ticket.priority === "high" && (
            <Badge variant="outline" className="text-[10px] uppercase font-bold border-amber-200 text-amber-600 px-1 py-0 h-5 bg-amber-50">
              High
            </Badge>
          )}
          {ticket.firstReplySlaBreached && (
            <div className="w-2 h-2 rounded-full bg-rose-500" title="SLA Breached" />
          )}
        </div>
        <Avatar className="h-5 w-5">
          <AvatarFallback className="bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200">
            {ticket.assigneeInitials ?? "UN"}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

// ─── ThreadPanel ──────────────────────────────────────────────────────────────

function ThreadPanel({ detail, onInvalidate }: { detail: HelpdeskTicketDetail; onInvalidate: () => void }) {
  const [activeTab, setActiveTab] = useState<"reply" | "note" | "forward">("reply");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const createMessage = useCreateHelpdeskMessage();
  const updateTicket = useUpdateHelpdeskTicket();

  const { ticket } = detail;

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [detail.messages.length]);

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    await createMessage.mutateAsync({
      ticketId: ticket.id,
      data: {
        body: body.trim(),
        authorType: "agent",
        authorName: "Sam Avery",
        isInternalNote: activeTab === "note",
      },
    });
    setBody("");
    setSending(false);
    onInvalidate();
  };

  const handleResolve = async () => {
    await updateTicket.mutateAsync({ id: ticket.id, data: { status: "resolved" } });
    onInvalidate();
  };

  const handleSnooze = async () => {
    await updateTicket.mutateAsync({ id: ticket.id, data: { status: "snoozed" } });
    onInvalidate();
  };

  const isResolved = ticket.status === "resolved";

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white">
      {/* Thread Header */}
      <div className="border-b border-slate-200 px-5 py-4 flex-shrink-0 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900 truncate mb-2">{ticket.subject}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`border-transparent rounded-full px-2 py-0 text-xs hover:bg-opacity-80 ${
              isResolved ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}>
              {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
            </Badge>
            {ticket.priority === "urgent" && (
              <Badge variant="outline" className="text-xs border-slate-200 font-medium text-rose-600 px-2 py-0">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 inline-block" />
                Urgent
              </Badge>
            )}
            {ticket.priority === "high" && (
              <Badge variant="outline" className="text-xs border-slate-200 font-medium text-amber-600 px-2 py-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 inline-block" />
                High
              </Badge>
            )}
            <Badge variant="outline" className="text-xs border-slate-200 font-medium text-slate-600 px-2 py-0">
              <ChannelIcon channel={ticket.channel} className="h-3 w-3 mr-1" />
              {ticket.channel.charAt(0).toUpperCase() + ticket.channel.slice(1)}
            </Badge>
            <span className="text-xs text-slate-400 font-medium">{ticket.ticketNumber}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isResolved && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-medium border-slate-200 text-slate-700"
                onClick={handleSnooze}
                disabled={updateTicket.isPending}
              >
                Snooze
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-medium border-slate-200 text-slate-700"
              >
                Assign <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800"
                onClick={handleResolve}
                disabled={updateTicket.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Resolve
              </Button>
            </>
          )}
          {isResolved && (
            <Badge className="bg-emerald-100 text-emerald-700 border-transparent">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolved
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={threadRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
        {detail.messages.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">No messages yet</div>
        ) : (
          detail.messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white flex-shrink-0">
        <div className="flex border-b border-slate-200 px-4">
          {(["reply", "note", "forward"] as const).map((tab) => (
            <button
              key={tab}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? tab === "note"
                    ? "border-amber-400 text-amber-700"
                    : "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className={`p-4 ${activeTab === "note" ? "bg-amber-50/30" : ""}`}>
          <Textarea
            placeholder={activeTab === "note" ? "Type an internal note…" : "Type your reply…"}
            className={`h-24 resize-none mb-3 text-sm focus-visible:ring-1 ${
              activeTab === "note"
                ? "bg-amber-50/50 border-amber-200 focus-visible:ring-amber-400"
                : "bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
            }`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-slate-400">
              <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors">
                <Bold className="h-4 w-4" />
              </button>
              <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors">
                <Italic className="h-4 w-4" />
              </button>
              <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors">
                <LinkIcon className="h-4 w-4" />
              </button>
              <div className="w-px h-4 bg-slate-200 mx-1" />
              <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors">
                <Paperclip className="h-4 w-4" />
              </button>
              <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors">
                <Smile className="h-4 w-4" />
              </button>
            </div>
            <Button
              size="sm"
              className={activeTab === "note" ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"}
              onClick={handleSend}
              disabled={sending || !body.trim()}
            >
              {sending ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {activeTab === "note" ? "Add Note" : "Send Reply"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: HelpdeskMessage }) {
  if (msg.isInternalNote) {
    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-4">
        <div className="flex items-center gap-1.5 mb-3 text-amber-700">
          <Lock className="h-3.5 w-3.5" />
          <span className="text-xs font-bold uppercase tracking-wider">Internal Note</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback
              style={{ backgroundColor: msg.authorAvatarColor }}
              className="text-white text-[10px] font-bold"
            >
              {msg.authorInitials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium text-sm text-slate-900">{msg.authorName}</div>
            <div className="text-xs text-slate-400">{relativeTime(msg.createdAt)}</div>
          </div>
        </div>
        <div className="text-sm text-amber-900/80 leading-relaxed font-medium">{msg.body}</div>
      </div>
    );
  }

  const isAgent = msg.authorType === "agent";
  return (
    <div className={`rounded-lg p-4 ${isAgent ? "bg-indigo-50/20 border-l-4 border-indigo-400 rounded-r-lg" : "bg-slate-50 border border-slate-200"}`}>
      <div className="flex items-center gap-3 mb-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback
            style={{ backgroundColor: msg.authorAvatarColor }}
            className="text-white text-[10px] font-bold"
          >
            {msg.authorInitials}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="font-medium text-sm text-slate-900">
            {msg.authorName}
            {isAgent && <span className="text-slate-400 font-normal"> (You)</span>}
          </div>
          <div className="text-xs text-slate-400">{relativeTime(msg.createdAt)}</div>
        </div>
      </div>
      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{msg.body}</div>
      {msg.attachmentName && (
        <div className="mt-3 inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 cursor-pointer transition-colors">
          <Paperclip className="h-3.5 w-3.5" />
          {msg.attachmentName}
        </div>
      )}
    </div>
  );
}

// ─── DetailsPanel ─────────────────────────────────────────────────────────────

function DetailsPanel({ detail, onInvalidate: _onInvalidate }: { detail: HelpdeskTicketDetail; onInvalidate: () => void }) {
  const { ticket, contact } = detail;
  const remaining = slaRemaining(ticket.resolutionSlaDeadline ?? undefined);

  const priorityColor = { urgent: "#ef4444", high: "#f59e0b", normal: "#6366f1", low: "#94a3b8" }[ticket.priority] ?? "#6366f1";

  return (
    <div className="w-[280px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Contact */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-12 w-12 mb-3">
              <AvatarFallback
                style={{ backgroundColor: contact.avatarColor }}
                className="text-white text-lg font-semibold"
              >
                {contact.initials}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-base font-semibold text-slate-900">{contact.name}</h2>
            <p className="text-sm text-slate-500 mb-3">{contact.email}</p>
            <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-transparent rounded-full px-2.5 mb-4 text-xs font-medium capitalize">
              {contact.tier}
            </Badge>
            <div className="w-full space-y-2 mt-1">
              {contact.phone && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Phone</span>
                  <span className="text-slate-900 font-medium">{contact.phone}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Tickets</span>
                <span className="text-slate-900 font-medium">{contact.totalTickets ?? 0} total</span>
              </div>
              <div className="flex justify-center pt-1">
                <button className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                  View Contact
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Ticket Details */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 text-sm">Ticket Details</h3>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-3">
            <DetailRow label="Assignee">
              {ticket.assigneeName ? (
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                      {ticket.assigneeInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-slate-900">{ticket.assigneeName}</span>
                </div>
              ) : (
                <span className="text-sm text-slate-400 italic">Unassigned</span>
              )}
            </DetailRow>
            {ticket.teamName && <DetailRow label="Team" value={ticket.teamName} />}
            <DetailRow label="Priority">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: priorityColor }} />
                <span className="capitalize">{ticket.priority}</span>
              </div>
            </DetailRow>
            <DetailRow label="Status">
              <span className="text-sm font-medium text-slate-900 capitalize">{ticket.status}</span>
            </DetailRow>
            <DetailRow label="Channel">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                <ChannelIcon channel={ticket.channel} className="h-3.5 w-3.5 text-slate-400" />
                <span className="capitalize">{ticket.channel}</span>
              </div>
            </DetailRow>
            <DetailRow label="Created" value={formatDate(ticket.createdAt)} />
            <DetailRow label="First Reply SLA">
              {ticket.firstReplySlaBreached ? (
                <div className="flex items-center gap-1.5 text-sm font-medium text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Breached
                </div>
              ) : (
                <span className="text-sm font-medium text-emerald-600">OK</span>
              )}
            </DetailRow>
            <DetailRow label="Resolution SLA">
              {remaining ? (
                <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
                  <Clock className="h-3.5 w-3.5" />
                  {remaining}
                </div>
              ) : ticket.resolutionSlaDeadline ? (
                <div className="flex items-center gap-1.5 text-sm font-medium text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Breached
                </div>
              ) : (
                <span className="text-sm text-slate-400">—</span>
              )}
            </DetailRow>
          </div>
        </div>

        {/* Tags */}
        {(ticket.tags?.length ?? 0) > 0 && (
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm mb-3">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {ticket.tags?.map((tag) => (
                <Badge
                  key={tag}
                  className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-transparent rounded px-2 py-0.5 text-xs font-medium"
                >
                  {tag}
                </Badge>
              ))}
              <button className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 border border-dashed border-slate-300 rounded px-2 py-0.5 transition-colors">
                <Plus className="h-3 w-3" /> Add tag
              </button>
            </div>
          </div>
        )}

        {/* Conversation History */}
        <div className="p-5">
          <h3 className="font-semibold text-slate-900 text-sm mb-1">Conversation History</h3>
          <p className="text-xs text-slate-500 mb-3">
            {(contact.totalTickets ?? 1) - 1} previous ticket{(contact.totalTickets ?? 1) - 1 !== 1 ? "s" : ""}
          </p>
          {(contact.totalTickets ?? 0) <= 1 ? (
            <p className="text-xs text-slate-400 italic">No previous tickets</p>
          ) : (
            <p className="text-xs text-slate-400">
              {contact.totalTickets! - 1} other ticket{contact.totalTickets! - 1 !== 1 ? "s" : ""} from this contact
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start">
      <div className="w-[95px] text-sm text-slate-500 flex-shrink-0 pt-0.5">{label}</div>
      <div className="flex-1 min-w-0">
        {value ? <span className="text-sm font-medium text-slate-900">{value}</span> : children}
      </div>
    </div>
  );
}
