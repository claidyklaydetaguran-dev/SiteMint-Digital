import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, useConversations } from "@/hooks/useConversations";
import { relativeTime, TIER_STYLES, phoneInitials, phoneColor } from "@/lib/conversationUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  MessageSquare,
  MessageCircle,
  RefreshCw,
  AlertTriangle,
  Clock,
  HelpCircle,
} from "lucide-react";

// ─── types ─────────────────────────────────────────────────────────────────

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

// ─── tier chip styling ──────────────────────────────────────────────────────

const TIER_CHIP_ACTIVE: Record<string, string> = {
  Hot:           "bg-rose-100 text-rose-700 border-rose-300",
  Warm:          "bg-amber-100 text-amber-700 border-amber-300",
  Cold:          "bg-blue-100 text-blue-700 border-blue-300",
  Disqualified:  "bg-slate-200 text-slate-700 border-slate-300",
  "Needs Review":"bg-yellow-100 text-yellow-700 border-yellow-300",
};

const TIER_CHIP_INACTIVE =
  "bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600";

// ─── "Why this tier" card colors ────────────────────────────────────────────

const WHY_TIER_STYLES: Record<string, string> = {
  Hot:           "bg-rose-50 border-rose-200",
  Warm:          "bg-amber-50 border-amber-200",
  Cold:          "bg-blue-50 border-blue-200",
  Disqualified:  "bg-slate-50 border-slate-200",
  "Needs Review":"bg-yellow-50 border-yellow-200",
};

const WHY_TIER_TEXT: Record<string, string> = {
  Hot:           "text-rose-700",
  Warm:          "text-amber-700",
  Cold:          "text-blue-700",
  Disqualified:  "text-slate-600",
  "Needs Review":"text-yellow-700",
};

// ─── helpers ───────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateSeparatorLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function groupMessagesByDate(
  messages: Message[],
): Array<{ dateLabel: string; messages: Message[] }> {
  const map = new Map<string, Message[]>();
  for (const msg of messages) {
    const key = new Date(msg.createdAt).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(msg);
  }
  return Array.from(map.entries()).map(([, msgs]) => ({
    dateLabel: dateSeparatorLabel(msgs[0].createdAt),
    messages: msgs,
  }));
}

// ─── hooks ─────────────────────────────────────────────────────────────────

function useConversationDetail(id: number | null) {
  return useQuery<ConversationDetail>({
    queryKey: ["conversation", id],
    queryFn: () => apiFetch<ConversationDetail>(`/receptionist/conversations/${id}`),
    enabled: !!id,
    refetchInterval: 15_000,
  });
}

// ─── main ──────────────────────────────────────────────────────────────────

export default function Inbox() {
  const [activeCategory, setActiveCategory] = useState<CategoryView>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string | null>(null);

  const { data: conversations, isLoading } = useConversations();
  const { data: detail, isLoading: isLoadingDetail } = useConversationDetail(selectedId);

  const activeCount    = conversations?.filter((c) => c.status === "in_progress").length ?? 0;
  const completedCount = conversations?.filter((c) => c.status === "completed").length ?? 0;
  const optedOutCount  = conversations?.filter((c) => c.status === "opted_out").length ?? 0;

  // Category + search filtered (before tier filter — used for tier chip counts)
  const categoryFiltered = conversations
    ?.filter((c) => {
      if (activeCategory === "active")    return c.status === "in_progress";
      if (activeCategory === "completed") return c.status === "completed";
      if (activeCategory === "opted_out") return c.status === "opted_out";
      return true;
    })
    .filter((c) => !search || c.callerPhone.includes(search));

  // Tier counts from category-filtered set
  const tierCounts = (categoryFiltered ?? []).reduce<Record<string, number>>((acc, c) => {
    if (c.tier) acc[c.tier] = (acc[c.tier] ?? 0) + 1;
    return acc;
  }, {});

  // Final filtered list (also applies tier filter)
  const filtered = categoryFiltered?.filter((c) => !tierFilter || c.tier === tierFilter);

  // Reset tier filter when category changes
  const handleCategorySelect = (v: CategoryView) => {
    setActiveCategory(v);
    setTierFilter(null);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 font-sans text-slate-900">
      <CategoryRail
        active={activeCategory}
        onSelect={handleCategorySelect}
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
        tierFilter={tierFilter}
        onTierFilter={setTierFilter}
        tierCounts={tierCounts}
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

// ─── CategoryRail ───────────────────────────────────────────────────────────

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
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search by phone…"
            className="h-8 pl-8 bg-slate-50 border-slate-200 text-xs focus-visible:ring-indigo-500"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search conversations"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        <div>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">
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
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={active}
      className={`flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${
        disabled
          ? "text-slate-300 cursor-not-allowed"
          : active
          ? "bg-indigo-50 text-indigo-700 font-semibold cursor-pointer"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
      }`}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) onClick?.();
      }}
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

// ─── ConversationList ───────────────────────────────────────────────────────

const TIER_ORDER = ["Hot", "Warm", "Cold", "Needs Review", "Disqualified"] as const;

function ConversationList({
  conversations,
  isLoading,
  selectedId,
  onSelect,
  activeCategory,
  tierFilter,
  onTierFilter,
  tierCounts,
}: {
  conversations: Conversation[] | undefined;
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  activeCategory: CategoryView;
  tierFilter: string | null;
  onTierFilter: (t: string | null) => void;
  tierCounts: Record<string, number>;
}) {
  const label =
    activeCategory === "active"    ? "Active"      :
    activeCategory === "completed" ? "Completed"   :
    activeCategory === "opted_out" ? "Opted Out"   :
    "All Conversations";

  const availableTiers = TIER_ORDER.filter((t) => (tierCounts[t] ?? 0) > 0);

  const emptyMessage =
    tierFilter
      ? `No ${tierFilter} conversations`
      : activeCategory === "active"
      ? "No active conversations"
      : activeCategory === "completed"
      ? "No completed conversations"
      : activeCategory === "opted_out"
      ? "No opted-out conversations"
      : "No conversations found";

  const emptyHelper =
    tierFilter
      ? "Try a different tier filter or clear the filter."
      : activeCategory === "opted_out"
      ? "Callers who text STOP will appear here."
      : "Conversations will appear here as calls come in.";

  return (
    <div className="w-[300px] flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
      {/* List header */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900 text-sm">{label}</h2>
            {conversations !== undefined && (
              <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 font-medium">
                {conversations.length}
              </span>
            )}
          </div>
        </div>

        {/* Tier filter chips */}
        {availableTiers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {tierFilter !== null && (
              <button
                onClick={() => onTierFilter(null)}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-white text-slate-500 border-slate-200 hover:border-slate-300 transition-colors"
                aria-label="Clear tier filter"
              >
                All ×
              </button>
            )}
            {availableTiers.map((tier) => {
              const isActive = tierFilter === tier;
              return (
                <button
                  key={tier}
                  onClick={() => onTierFilter(isActive ? null : tier)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                    isActive ? TIER_CHIP_ACTIVE[tier] : TIER_CHIP_INACTIVE
                  }`}
                  aria-pressed={isActive}
                >
                  {tier}
                  <span className="ml-1 opacity-70">{tierCounts[tier]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* List content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="space-y-2 pt-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 h-20 animate-pulse" />
            ))}
          </div>
        ) : !conversations?.length ? (
          <div className="text-center py-12 px-4">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="h-5 w-5 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600">{emptyMessage}</p>
            <p className="text-xs text-slate-400 mt-1">{emptyHelper}</p>
          </div>
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
      role="button"
      tabIndex={0}
      aria-selected={selected}
      className={`p-3 rounded-lg border cursor-pointer transition-all relative focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        selected
          ? "border-indigo-300 bg-indigo-50/50 shadow-sm"
          : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm"
      }`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      {selected && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-indigo-500 rounded-r-sm" />
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
          className={`text-xs flex-shrink-0 ml-2 tabular-nums ${
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
          {c.status === "in_progress"
            ? "Active"
            : c.status === "opted_out"
            ? "Opted out"
            : "Completed"}
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

// ─── ThreadPanel ────────────────────────────────────────────────────────────

function ThreadPanel({ detail }: { detail: ConversationDetail }) {
  const { conversation: c, messages } = detail;
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  const groups = groupMessagesByDate(messages);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white">
      {/* Thread header */}
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
            {c.status === "in_progress"
              ? "Active"
              : c.status === "opted_out"
              ? "Opted out"
              : "Completed"}
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

      {/* Message thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-1 bg-slate-50/40">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">No messages yet</div>
        ) : (
          groups.map((group, gi) => (
            <div key={gi}>
              {/* Date separator */}
              <div className="flex items-center gap-3 py-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[11px] text-slate-400 font-medium flex-shrink-0">
                  {group.dateLabel}
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              {/* Messages in this group */}
              <div className="space-y-3">
                {group.messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer — coming soon notice */}
      <div className="border-t border-slate-200 bg-white flex-shrink-0 px-5 py-3.5">
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
        className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isOutbound
            ? "bg-indigo-600 text-white rounded-tr-sm"
            : "bg-white text-slate-900 rounded-tl-sm border border-slate-200"
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

// ─── DetailsPanel ───────────────────────────────────────────────────────────

function DetailsPanel({ detail }: { detail: ConversationDetail }) {
  const { conversation: c } = detail;

  return (
    <div className="w-[260px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-slate-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-900">Details</h2>
      </div>
      <div className="p-4 space-y-5">

        {/* Caller */}
        <section aria-label="Caller info">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
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
        </section>

        {/* Lead tier + Why this tier */}
        {c.tier && (
          <section aria-label="Lead tier">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Lead Tier
            </p>
            <Badge
              className={`${TIER_STYLES[c.tier] ?? "bg-slate-100 text-slate-500"} border-transparent`}
            >
              {c.tier}
            </Badge>

            {c.disqualifyReason ? (
              <div
                className={`mt-2.5 rounded-lg border p-3 ${
                  WHY_TIER_STYLES[c.tier] ?? "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <HelpCircle
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      WHY_TIER_TEXT[c.tier] ?? "text-slate-500"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      WHY_TIER_TEXT[c.tier] ?? "text-slate-500"
                    }`}
                  >
                    Why this tier
                  </span>
                </div>
                <p
                  className={`text-xs leading-relaxed ${
                    WHY_TIER_TEXT[c.tier] ?? "text-slate-600"
                  }`}
                >
                  {c.disqualifyReason}
                </p>
              </div>
            ) : null}
          </section>
        )}

        {/* Opted-out notice */}
        {c.status === "opted_out" && (
          <section>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-slate-600 mb-1">
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Caller Unsubscribed</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                This caller unsubscribed via SMS. The AI will not reply unless they text START.
              </p>
            </div>
          </section>
        )}

        {/* Trial cap warning */}
        {c.isOverCap && (
          <section>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-amber-700 mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Trial Cap Reached</span>
              </div>
              <p className="text-xs text-amber-600 leading-relaxed">
                This conversation hit your trial limit. Upgrade to keep receiving leads.
              </p>
            </div>
          </section>
        )}

        {/* Timeline */}
        <section aria-label="Timeline">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            Timeline
          </p>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex items-start justify-between gap-2">
              <span className="text-slate-400 flex-shrink-0">Started</span>
              <span className="text-right">{formatDateTime(c.createdAt)}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-slate-400 flex-shrink-0">Last msg</span>
              <span className="text-right">{formatDateTime(c.lastMessageAt)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
