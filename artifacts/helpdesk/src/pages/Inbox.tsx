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
  ArrowLeft,
  ChevronDown,
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
  Disqualified:  "bg-muted text-foreground border-border",
  "Needs Review":"bg-yellow-100 text-yellow-700 border-yellow-300",
};

const TIER_CHIP_INACTIVE =
  "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-primary";

// ─── "Why this tier" card colors ────────────────────────────────────────────

const WHY_TIER_STYLES: Record<string, string> = {
  Hot:           "bg-rose-50 border-rose-200",
  Warm:          "bg-amber-50 border-amber-200",
  Cold:          "bg-blue-50 border-blue-200",
  Disqualified:  "bg-background border-border",
  "Needs Review":"bg-yellow-50 border-yellow-200",
};

const WHY_TIER_TEXT: Record<string, string> = {
  Hot:           "text-rose-700",
  Warm:          "text-amber-700",
  Cold:          "text-blue-700",
  Disqualified:  "text-muted-foreground",
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

// ─── TIER_ORDER ─────────────────────────────────────────────────────────────

const TIER_ORDER = ["Hot", "Warm", "Cold", "Needs Review", "Disqualified"] as const;

// ─── main ──────────────────────────────────────────────────────────────────

export default function Inbox() {
  const [activeCategory, setActiveCategory] = useState<CategoryView>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [showMobileDetails, setShowMobileDetails] = useState(false);

  const { data: conversations, isLoading } = useConversations();
  const { data: detail, isLoading: isLoadingDetail } = useConversationDetail(selectedId);

  const activeCount    = conversations?.filter((c) => c.status === "in_progress").length ?? 0;
  const completedCount = conversations?.filter((c) => c.status === "completed").length ?? 0;
  const optedOutCount  = conversations?.filter((c) => c.status === "opted_out").length ?? 0;

  const categoryFiltered = conversations
    ?.filter((c) => {
      if (activeCategory === "active")    return c.status === "in_progress";
      if (activeCategory === "completed") return c.status === "completed";
      if (activeCategory === "opted_out") return c.status === "opted_out";
      return true;
    })
    .filter((c) => !search || c.callerPhone.includes(search));

  const tierCounts = (categoryFiltered ?? []).reduce<Record<string, number>>((acc, c) => {
    if (c.tier) acc[c.tier] = (acc[c.tier] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = categoryFiltered?.filter((c) => !tierFilter || c.tier === tierFilter);

  const availableTiers = TIER_ORDER.filter((t) => (tierCounts[t] ?? 0) > 0);

  const handleCategorySelect = (v: CategoryView) => {
    setActiveCategory(v);
    setTierFilter(null);
  };

  const handleMobileSelect = (id: number) => {
    setSelectedId(id);
    setShowMobileDetails(false);
    setMobileView("thread");
  };

  return (
    <>
      {/* ── Mobile layout (<768 px) ──────────────────────────── */}
      <div className="flex md:hidden h-full w-full flex-col overflow-hidden bg-background font-sans text-foreground">
        {mobileView === "list" ? (
          <>
            <MobileFilterBar
              activeCategory={activeCategory}
              onCatChange={handleCategorySelect}
              totalCount={conversations?.length ?? 0}
              activeCount={activeCount}
              completedCount={completedCount}
              optedOutCount={optedOutCount}
              tierFilter={tierFilter}
              onTierFilter={setTierFilter}
              availableTiers={availableTiers}
              tierCounts={tierCounts}
              search={search}
              onSearch={setSearch}
            />
            <ConversationList
              conversations={filtered}
              isLoading={isLoading}
              selectedId={selectedId}
              onSelect={handleMobileSelect}
              activeCategory={activeCategory}
              tierFilter={tierFilter}
              onTierFilter={setTierFilter}
              tierCounts={tierCounts}
              hideTierChips
              fullWidth
            />
          </>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {isLoadingDetail && !detail ? (
              <>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-shrink-0">
                  <button
                    onClick={() => setMobileView("list")}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-label="Back to conversations list"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Conversations
                  </button>
                </div>
                <div className="flex-1 flex items-center justify-center bg-card">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              </>
            ) : detail ? (
              <ThreadPanel
                detail={detail}
                onBack={() => setMobileView("list")}
                showDetails={showMobileDetails}
                onToggleDetails={() => setShowMobileDetails((p) => !p)}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* ── Desktop layout (≥768 px) ─────────────────────────── */}
      <div className="hidden md:flex h-full w-full overflow-hidden bg-background font-sans text-foreground">
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
            <div className="flex-1 flex items-center justify-center bg-card">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <>
              <ThreadPanel detail={detail} />
              <DetailsPanel detail={detail} />
            </>
          ) : null
        ) : (
          <div className="flex-1 flex items-center justify-center bg-card">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Select a conversation to view</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── MobileFilterBar ────────────────────────────────────────────────────────

const MOBILE_CATS: { key: CategoryView; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "active",    label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "opted_out", label: "Opted Out" },
];

function MobileFilterBar({
  activeCategory,
  onCatChange,
  totalCount,
  activeCount,
  completedCount,
  optedOutCount,
  tierFilter,
  onTierFilter,
  availableTiers,
  tierCounts,
  search,
  onSearch,
}: {
  activeCategory: CategoryView;
  onCatChange: (v: CategoryView) => void;
  totalCount: number;
  activeCount: number;
  completedCount: number;
  optedOutCount: number;
  tierFilter: string | null;
  onTierFilter: (t: string | null) => void;
  availableTiers: readonly string[];
  tierCounts: Record<string, number>;
  search: string;
  onSearch: (s: string) => void;
}) {
  const counts: Record<CategoryView, number> = {
    all: totalCount,
    active: activeCount,
    completed: completedCount,
    opted_out: optedOutCount,
  };

  return (
    <div className="flex-shrink-0 bg-card border-b border-border px-3 pt-2 pb-2 space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by phone…"
          className="h-8 pl-8 bg-background border-border text-xs focus-visible:ring-ring"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search conversations"
        />
      </div>

      {/* Category pills */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Filter by status">
        {MOBILE_CATS.map((cat) => {
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => onCatChange(cat.key)}
              aria-pressed={isActive}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-primary"
              }`}
            >
              {cat.label}
              <span className="ml-1 opacity-70">{counts[cat.key]}</span>
            </button>
          );
        })}
      </div>

      {/* Tier chips (only when any tier has data) */}
      {availableTiers.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Filter by tier">
          {tierFilter !== null && (
            <button
              onClick={() => onTierFilter(null)}
              className="flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-card text-muted-foreground border-border hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                aria-pressed={isActive}
                className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? TIER_CHIP_ACTIVE[tier] : TIER_CHIP_INACTIVE
                }`}
              >
                {tier}
                <span className="ml-1 opacity-70">{tierCounts[tier]}</span>
              </button>
            );
          })}
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
    <div className="w-[210px] flex-shrink-0 border-r border-border bg-card flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by phone…"
            className="h-8 pl-8 bg-background border-border text-xs focus-visible:ring-ring"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search conversations"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        <div>
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-2">
            Conversations
          </h3>
          <div className="space-y-0.5" role="group" aria-label="Filter conversations by status">
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
      className={`flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        disabled
          ? "text-muted-foreground cursor-not-allowed"
          : active
          ? "bg-surface-muted text-primary font-semibold cursor-pointer"
          : "text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
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
              ? "text-primary font-medium"
              : "text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ─── ConversationList ───────────────────────────────────────────────────────

function ConversationList({
  conversations,
  isLoading,
  selectedId,
  onSelect,
  activeCategory,
  tierFilter,
  onTierFilter,
  tierCounts,
  hideTierChips,
  fullWidth,
}: {
  conversations: Conversation[] | undefined;
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  activeCategory: CategoryView;
  tierFilter: string | null;
  onTierFilter: (t: string | null) => void;
  tierCounts: Record<string, number>;
  hideTierChips?: boolean;
  fullWidth?: boolean;
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
    <div
      className={`${
        fullWidth ? "flex-1 min-w-0" : "w-[300px] flex-shrink-0"
      } border-r border-border bg-background flex flex-col`}
    >
      {/* List header */}
      <div className="border-b border-border bg-card px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-foreground text-sm">{label}</h2>
            {conversations !== undefined && (
              <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-medium">
                {conversations.length}
              </span>
            )}
          </div>
        </div>

        {/* Tier filter chips (desktop; hidden on mobile via hideTierChips prop) */}
        {!hideTierChips && availableTiers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5" role="group" aria-label="Filter by tier">
            {tierFilter !== null && (
              <button
                onClick={() => onTierFilter(null)}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-card text-muted-foreground border-border hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
              <div key={i} className="rounded-lg border border-border bg-card p-3 h-20 animate-pulse" />
            ))}
          </div>
        ) : !conversations?.length ? (
          <div className="text-center py-12 px-4">
            <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{emptyMessage}</p>
            <p className="text-xs text-muted-foreground mt-1">{emptyHelper}</p>
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
      className={`p-3 rounded-lg border cursor-pointer transition-all relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? "border-primary/50 bg-surface-muted/60 shadow-sm"
          : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
      }`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      {selected && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-surface-muted0 rounded-r-sm" />
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
              selected ? "font-semibold text-foreground" : "font-medium text-foreground"
            }`}
          >
            {c.callerPhone}
          </span>
        </div>
        <span
          className={`text-xs flex-shrink-0 ml-2 tabular-nums ${
            selected ? "text-primary font-medium" : "text-muted-foreground"
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
              ? "bg-muted text-muted-foreground"
              : "bg-muted text-muted-foreground"
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
              TIER_STYLES[c.tier] ?? "bg-muted text-muted-foreground"
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

function ThreadPanel({
  detail,
  onBack,
  showDetails,
  onToggleDetails,
}: {
  detail: ConversationDetail;
  onBack?: () => void;
  showDetails?: boolean;
  onToggleDetails?: () => void;
}) {
  const { conversation: c, messages } = detail;
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  const groups = groupMessagesByDate(messages);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-card">
      {/* Thread header */}
      <div className="border-b border-border px-4 md:px-5 py-3 md:py-4 flex-shrink-0">
        {/* Back button (mobile only) */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary mb-2.5 -ml-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label="Back to conversations list"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Conversations
          </button>
        )}
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-base font-semibold text-foreground truncate mb-2">
            {c.callerPhone}
          </h1>
          {/* Details toggle (mobile only) */}
          {onToggleDetails && (
            <button
              onClick={onToggleDetails}
              aria-expanded={showDetails}
              aria-label={showDetails ? "Hide details" : "Show details"}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
            >
              Details
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  showDetails ? "rotate-180" : ""
                }`}
              />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            className={`border-transparent rounded-full px-2 py-0 text-xs ${
              c.status === "in_progress"
                ? "bg-emerald-100 text-emerald-700"
                : c.status === "opted_out"
                ? "bg-muted text-muted-foreground"
                : "bg-muted text-muted-foreground"
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
                TIER_STYLES[c.tier] ?? "bg-muted text-muted-foreground"
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
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> SMS
          </span>
        </div>
      </div>

      {/* Message thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 md:px-5 py-4 space-y-1 bg-surface-muted/40">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">No messages yet</div>
        ) : (
          groups.map((group, gi) => (
            <div key={gi}>
              <div className="flex items-center gap-3 py-3">
                <div className="flex-1 h-px bg-muted" />
                <span className="text-[11px] text-muted-foreground font-medium flex-shrink-0">
                  {group.dateLabel}
                </span>
                <div className="flex-1 h-px bg-muted" />
              </div>
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
      <div className="border-t border-border bg-card flex-shrink-0 px-4 md:px-5 py-3.5">
        <div className="flex items-start gap-2.5">
          <Clock className="h-4 w-4 flex-shrink-0 text-amber-400 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Manual replies</span> are coming soon.
            Your AI Receptionist handles all responses automatically right now.
          </p>
        </div>
      </div>

      {/* Inline details panel (mobile: shown when Details is toggled open) */}
      {showDetails && onToggleDetails && (
        <div className="border-t border-border overflow-y-auto max-h-[45vh] flex-shrink-0 md:hidden">
          <DetailsPanel detail={detail} embedded />
        </div>
      )}
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
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card text-foreground rounded-tl-sm border border-border"
        }`}
      >
        <p className="leading-relaxed">{msg.body}</p>
        <p
          className={`text-[10px] mt-1.5 ${
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {formatDateTime(msg.createdAt)} · {isOutbound ? "AI Receptionist" : "Caller"}
        </p>
      </div>
    </div>
  );
}

// ─── DetailsPanel ────────────────────────────────────────────────────────────

function DetailsPanel({
  detail,
  embedded = false,
}: {
  detail: ConversationDetail;
  embedded?: boolean;
}) {
  const { conversation: c } = detail;

  return (
    <div
      className={
        embedded
          ? "bg-card flex flex-col"
          : "w-[260px] flex-shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto"
      }
    >
      <div className="px-4 py-4 border-b border-border flex-shrink-0">
        <h2 className="text-sm font-semibold text-foreground">Details</h2>
      </div>
      <div className="p-4 space-y-5">

        {/* Caller */}
        <section aria-label="Caller info">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
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
              <div className="text-sm font-medium text-foreground">{c.callerPhone}</div>
              <div className="text-xs text-muted-foreground">Via SMS</div>
            </div>
          </div>
        </section>

        {/* Lead tier + Why this tier */}
        {c.tier && (
          <section aria-label="Lead tier">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
              Lead Tier
            </p>
            <Badge
              className={`${TIER_STYLES[c.tier] ?? "bg-muted text-muted-foreground"} border-transparent`}
            >
              {c.tier}
            </Badge>

            {c.disqualifyReason ? (
              <div
                className={`mt-2.5 rounded-lg border p-3 ${
                  WHY_TIER_STYLES[c.tier] ?? "bg-background border-border"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <HelpCircle
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      WHY_TIER_TEXT[c.tier] ?? "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      WHY_TIER_TEXT[c.tier] ?? "text-muted-foreground"
                    }`}
                  >
                    Why this tier
                  </span>
                </div>
                <p
                  className={`text-xs leading-relaxed ${
                    WHY_TIER_TEXT[c.tier] ?? "text-muted-foreground"
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
            <div className="bg-background border border-border rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Caller Unsubscribed</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
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
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
            Timeline
          </p>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground flex-shrink-0">Started</span>
              <span className="text-right">{formatDateTime(c.createdAt)}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground flex-shrink-0">Last msg</span>
              <span className="text-right">{formatDateTime(c.lastMessageAt)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
