import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, useConversations } from "@/hooks/useConversations";
import { relativeTime, TIER_STYLES, phoneInitials, phoneColor, PHONE_COLORS } from "@/lib/conversationUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  LayoutGrid,
  List,
  MessageSquare,
  MessageCircle,
  RefreshCw,
  AlertTriangle,
  Clock,
} from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number;
  createdAt: string;
  conversationId: number;
  direction: "inbound" | "outbound";
  body: string;
}

interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
}

type CategoryView = "all" | "active" | "completed" | "opted_out";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── hooks ────────────────────────────────────────────────────────────────────

function useConversationDetail(id: number | null) {
  return useQuery<ConversationDetail>({
    queryKey: ["conversation", id],
    queryFn: () => apiFetch<ConversationDetail>(`/receptionist/conversations/${id}`),
    enabled: !!id,
    refetchInterval: 15_000,
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function Inbox() {
  const [activeCategory, setActiveCategory] = useState<CategoryView>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { data: conversations, isLoading } = useConversations();
  const { data: detail, isLoading: isLoadingDetail } = useConversationDetail(selectedId);

  const activeCount    = conversations?.filter((c) => c.status === "in_progress").length ?? 0;
  const completedCount = conversations?.filter((c) => c.status === "completed").length ?? 0;
  const optedOutCount  = conversations?.filter((c) => c.status === "opted_out").length ?? 0;

  const filtered = conversations
    ?.filter((c) => {
      if (activeCategory === "active")    return c.status === "in_progress";
      if (activeCategory === "completed") return c.status === "completed";
      if (activeCategory === "opted_out") return c.status === "opted_out";
      return true;
    })
    .filter((c) => !search || c.callerPhone.includes(search));

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 font-sans text-slate-900">
      <CategoryRail
        active={activeCategory}
        onSelect={setActiveCategory}
        totalCount={conversations?.length ?? 0}
        activeCount={activeCount}
        completedCount={completedCount}
        optedOutCount={optedOutCount}
        search={search}
        onSearch={setSearch}
      />
      <ConversationList
        conversations={filtered}
        isLoading={isLoading}
        selectedId={selectedId}
        onSelect={setSelectedId}
        activeCategory={activeCategory}
      />
      {selectedId ? (
        isLoadingDetail && !detail ? (
          <div className="flex-1 flex items-center justify-center bg-white">
            <RefreshCw className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : detail ? (
          <>
            <ThreadPanel detail={detail} />
            <DetailsPanel detail={detail} />
          </>
        ) : null
      ) : (
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 text-slate-200" />
            <p className="text-sm font-medium text-slate-400">Select a conversation to view</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CategoryRail ─────────────────────────────────────────────────────────────

function CategoryRail({
  active,
  onSelect,
  totalCount,
  activeCount,
  completedCount,
  optedOutCount,
  search,
  onSearch,
}: {
  active: CategoryView;
  onSelect: (v: CategoryView) => void;
  totalCount: number;
  activeCount: number;
  completedCount: number;
  optedOutCount: number;
  search: string;
  onSearch: (s: string) => void;
}) {
  return (
    <div className="w-[210px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="p-3 border-b border-slate-200">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by phone…"
            className="h-8 pl-8 bg-slate-50 border-slate-200 text-xs focus-visible:ring-indigo-500"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">
            Conversations
          </h3>
          <div className="space-y-0.5">
            <NavItem
              label="All"
              count={totalCount}
              active={active === "all"}
              onClick={() => onSelect("all")}
            />
            <NavItem
              label="Active"
              count={activeCount}
              active={active === "active"}
              countHighlight={activeCount > 0}
              onClick={() => onSelect("active")}
            />
            <NavItem
              label="Completed"
              count={completedCount}
              active={active === "completed"}
              onClick={() => onSelect("completed")}
            />
            <NavItem
              label="Opted Out"
              count={optedOutCount}
              active={active === "opted_out"}
              onClick={() => onSelect("opted_out")}
            />
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">
            Coming Soon
          </h3>
          <div className="space-y-0.5">
            <NavItem label="By Tier" disabled />
            <NavItem label="Saved Filters" disabled />
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
  disabled,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  countHighlight?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${
        disabled
          ? "text-slate-300 cursor-not-allowed"
          : active
          ? "bg-indigo-50 text-indigo-700 font-semibold cursor-pointer"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <span className={active ? "font-semibold" : "font-medium"}>{label}</span>
      {count !== undefined && (
        <span
          className={`text-xs rounded-full px-1.5 ${
            countHighlight
              ? "bg-rose-500 text-white font-semibold px-2"
              : active
              ? "text-indigo-500 font-medium"
              : "text-slate-400"
          }`}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ─── ConversationList ─────────────────────────────────────────────────────────

function ConversationList({
  conversations,
  isLoading,
  selectedId,
  onSelect,
  activeCategory,
}: {
  conversations: Conversation[] | undefined;
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  activeCategory: CategoryView;
}) {
  const label =
    activeCategory === "active"    ? "Active"      :
    activeCategory === "completed" ? "Completed"   :
    activeCategory === "opted_out" ? "Opted Out"   :
    "All Conversations";

  return (
    <div className="w-[300px] flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
      <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-900 text-sm">{label}</h2>
          {conversations && (
            <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-transparent rounded-full px-2 py-0 text-xs h-5">
              {conversations.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
          <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900">
            <List className="h-4 w-4" />
          </button>
          <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900">
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : !conversations?.length ? (
          <div className="text-center py-12 text-sm text-slate-400">No conversations</div>
        ) : (
          conversations.map((c) => (
            <ConversationCard
              key={c.id}
              conversation={c}
              selected={selectedId === c.id}
              onClick={() => onSelect(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ConversationCard({
  conversation: c,
  selected,
  onClick,
}: {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
}) {
  const initials = phoneInitials(c.callerPhone);
  const color = phoneColor(c.callerPhone);

  return (
    <div
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
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-6 w-6 flex-shrink-0">
            <AvatarFallback
              style={{ backgroundColor: color }}
              className="text-white text-[10px] font-bold"
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <span
            className={`text-sm truncate ${
              selected ? "font-semibold text-slate-900" : "font-medium text-slate-700"
            }`}
          >
            {c.callerPhone}
          </span>
        </div>
        <span
          className={`text-xs flex-shrink-0 ml-2 ${
            selected ? "text-indigo-600 font-medium" : "text-slate-400"
          }`}
        >
          {relativeTime(c.lastMessageAt)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge
          className={`border-transparent rounded-full px-2 py-0 text-xs h-4 ${
            c.status === "in_progress"
              ? "bg-emerald-100 text-emerald-700"
              : c.status === "opted_out"
              ? "bg-slate-200 text-slate-600"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {c.status === "in_progress" ? "Active" : c.status === "opted_out" ? "Opted out" : "Completed"}
        </Badge>
        {c.tier && (
          <Badge
            className={`border-transparent rounded-full px-2 py-0 text-xs h-4 ${
              TIER_STYLES[c.tier] ?? "bg-slate-100 text-slate-500"
            }`}
          >
            {c.tier}
          </Badge>
        )}
        {c.isOverCap && (
          <span title="Trial conversation cap reached">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ThreadPanel ──────────────────────────────────────────────────────────────

function ThreadPanel({ detail }: { detail: ConversationDetail }) {
  const { conversation: c, messages } = detail;
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white">
      <div className="border-b border-slate-200 px-5 py-4 flex-shrink-0">
        <h1 className="text-base font-semibold text-slate-900 truncate mb-2">
          {c.callerPhone}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            className={`border-transparent rounded-full px-2 py-0 text-xs ${
              c.status === "in_progress"
                ? "bg-emerald-100 text-emerald-700"
                : c.status === "opted_out"
                ? "bg-slate-200 text-slate-600"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {c.status === "in_progress" ? "Active" : c.status === "opted_out" ? "Opted out" : "Completed"}
          </Badge>
          {c.tier && (
            <Badge
              className={`border-transparent rounded-full px-2 py-0 text-xs ${
                TIER_STYLES[c.tier] ?? "bg-slate-100 text-slate-500"
              }`}
            >
              {c.tier}
            </Badge>
          )}
          {c.isOverCap && (
            <Badge className="border-transparent rounded-full px-2 py-0 text-xs bg-amber-100 text-amber-700">
              <AlertTriangle className="h-3 w-3 mr-1" /> Trial cap reached
            </Badge>
          )}
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> SMS
          </span>
        </div>
      </div>

      <div ref={threadRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">No messages yet</div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </div>

      {/* Composer — disabled, coming soon */}
      <div className="border-t border-slate-200 bg-slate-50 flex-shrink-0 px-5 py-4">
        <div className="flex items-start gap-2.5">
          <Clock className="h-4 w-4 flex-shrink-0 text-amber-400 mt-0.5" />
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Manual replies</span> are coming soon.
            Your AI Receptionist handles all responses automatically right now.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isOutbound = msg.direction === "outbound";
  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm ${
          isOutbound
            ? "bg-indigo-600 text-white rounded-tr-sm"
            : "bg-slate-100 text-slate-900 rounded-tl-sm"
        }`}
      >
        <p className="leading-relaxed">{msg.body}</p>
        <p
          className={`text-[10px] mt-1.5 ${
            isOutbound ? "text-indigo-200" : "text-slate-400"
          }`}
        >
          {formatDateTime(msg.createdAt)} · {isOutbound ? "AI Receptionist" : "Caller"}
        </p>
      </div>
    </div>
  );
}

// ─── DetailsPanel ─────────────────────────────────────────────────────────────

function DetailsPanel({ detail }: { detail: ConversationDetail }) {
  const { conversation: c } = detail;

  return (
    <div className="w-[260px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Details</h2>
      </div>
      <div className="p-4 space-y-5">
        {/* Caller */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Caller
          </p>
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8">
              <AvatarFallback
                style={{ backgroundColor: phoneColor(c.callerPhone) }}
                className="text-white text-xs font-bold"
              >
                {phoneInitials(c.callerPhone)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-sm font-medium text-slate-900">{c.callerPhone}</div>
              <div className="text-xs text-slate-400">Via SMS</div>
            </div>
          </div>
        </div>

        {/* Lead tier */}
        {c.tier && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Lead Tier
            </p>
            <Badge
              className={`${
                TIER_STYLES[c.tier] ?? "bg-slate-100 text-slate-500"
              } border-transparent`}
            >
              {c.tier}
            </Badge>
            {c.disqualifyReason && (
              <p className="text-xs text-slate-500 mt-1.5">{c.disqualifyReason}</p>
            )}
          </div>
        )}

        {/* Opted-out notice */}
        {c.status === "opted_out" && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-slate-600 mb-1">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Caller Unsubscribed</span>
            </div>
            <p className="text-xs text-slate-500">
              This caller unsubscribed via SMS. The AI will not reply unless they text START.
            </p>
          </div>
        )}

        {/* Trial cap warning */}
        {c.isOverCap && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-amber-700 mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Trial Cap Reached</span>
            </div>
            <p className="text-xs text-amber-600">
              This conversation hit your trial limit. Upgrade to keep receiving leads.
            </p>
          </div>
        )}

        {/* Timeline */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Timeline
          </p>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400 flex-shrink-0">Started</span>
              <span className="text-right">{formatDateTime(c.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400 flex-shrink-0">Last message</span>
              <span className="text-right">{formatDateTime(c.lastMessageAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
