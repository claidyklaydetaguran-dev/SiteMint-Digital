import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, useConversations } from "@/hooks/useConversations";
import { useSession } from "@/hooks/useSession";
import { relativeTime, TIER_STYLES } from "@/lib/conversationUi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Flame,
  Activity,
  BarChart2,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  X,
  Bot,
} from "lucide-react";

// ─── Agent config type (for getting-started card) ─────────────────────────────

interface AgentConfig {
  greetingMessage: string | null;
  qualifyingQuestions: string[];
}

// ─── KPI helpers ──────────────────────────────────────────────────────────────

function countThisWeek(conversations: Conversation[]): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return conversations.filter((c) => new Date(c.createdAt).getTime() >= cutoff).length;
}

function countHot(conversations: Conversation[]): number {
  return conversations.filter((c) => c.tier === "Hot").length;
}

function countActive(conversations: Conversation[]): number {
  return conversations.filter((c) => c.status === "in_progress").length;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonState() {
  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto p-6 gap-6">
      <div className="h-7 w-48 bg-slate-100 rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 h-24 animate-pulse"
          />
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="h-10 border-b border-slate-200 px-4 flex items-center">
          <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0"
          >
            <div className="flex-1 h-4 bg-slate-100 rounded animate-pulse" />
            <div className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
        <AlertTriangle className="h-6 w-6 text-rose-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">Failed to load overview</p>
        <p className="text-xs text-slate-500 mt-1">Check your connection and try again.</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-slate-200 text-sm"
        onClick={onRetry}
      >
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900 leading-none">{value}</div>
        <div className="text-xs text-slate-500 mt-1.5">{label}</div>
      </div>
    </div>
  );
}

// ─── Getting-started card ──────────────────────────────────────────────────────

function GettingStartedCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
        <Bot className="h-5 w-5 text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-indigo-900">
          Finish setting up your AI Receptionist
        </p>
        <p className="text-xs text-indigo-700 mt-0.5">
          Add a greeting message and qualifying questions so your AI can start qualifying leads.
        </p>
        <Link href="/receptionist">
          <button className="mt-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900 flex items-center gap-1">
            Configure now <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </Link>
      </div>
      <button
        className="text-indigo-400 hover:text-indigo-600 flex-shrink-0 mt-0.5"
        onClick={onDismiss}
        aria-label="Dismiss getting-started card"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Overview() {
  const [dismissed, setDismissed] = useState(false);

  const {
    data: conversations,
    isLoading: isLoadingConvs,
    isError: isErrorConvs,
    refetch,
  } = useConversations();

  const { data: me, isLoading: isLoadingMe } = useSession();

  const { data: agentConfig } = useQuery<AgentConfig>({
    queryKey: ["agent-config"],
    queryFn: () => apiFetch<AgentConfig>("/receptionist/agent-config"),
  });

  if (isLoadingConvs || isLoadingMe) return <SkeletonState />;
  if (isErrorConvs) return <ErrorState onRetry={refetch} />;

  const convs  = conversations ?? [];
  const firm   = me?.firm;
  const isPaid = firm?.planTier === "paid";

  // KPI values
  const thisWeek  = countThisWeek(convs);
  const hotLeads  = countHot(convs);
  const activeNow = countActive(convs);
  const usedCount = me?.conversationCount ?? 0;
  const capCount  = firm?.trialConversationsLimit ?? 20;
  const trialLabel = isPaid ? "Paid plan" : `${usedCount} of ${capCount}`;

  // Recent 5 by lastMessageAt desc
  const recent5 = [...convs]
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 5);

  // Getting-started card: show when greeting empty AND no qualifying questions
  const needsSetup =
    !dismissed &&
    agentConfig !== undefined &&
    !(agentConfig.greetingMessage ?? "").trim() &&
    (agentConfig.qualifyingQuestions ?? []).length === 0;

  // Empty state
  if (convs.length === 0) {
    return (
      <div className="flex flex-col h-full bg-white overflow-y-auto p-6 gap-4">
        <h1 className="text-lg font-semibold text-slate-900">Overview</h1>
        {needsSetup && <GettingStartedCard onDismiss={() => setDismissed(true)} />}
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <MessageSquare className="h-7 w-7 text-indigo-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">No conversations yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Once callers reach your AI Receptionist, they'll appear here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto p-6 gap-6">
      {/* Header */}
      <h1 className="text-lg font-semibold text-slate-900">Overview</h1>

      {/* Getting-started card (conditional) */}
      {needsSetup && <GettingStartedCard onDismiss={() => setDismissed(true)} />}

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Conversations this week"
          value={thisWeek}
          icon={MessageSquare}
          iconColor="bg-indigo-50 text-indigo-600"
        />
        <KpiCard
          label="Hot leads"
          value={hotLeads}
          icon={Flame}
          iconColor="bg-rose-50 text-rose-500"
        />
        <KpiCard
          label="Active now"
          value={activeNow}
          icon={Activity}
          iconColor="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label={isPaid ? "Plan" : "Trial usage"}
          value={trialLabel}
          icon={BarChart2}
          iconColor="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Recent conversations */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="text-sm font-semibold text-slate-900">Recent conversations</span>
          <Link href="/conversations">
            <button className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {recent5.map((c) => (
            <Link key={c.id} href="/conversations">
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-900 truncate">
                    {c.callerPhone}
                  </span>
                </div>
                {c.tier && (
                  <Badge
                    className={`${TIER_STYLES[c.tier] ?? ""} border-transparent text-xs flex-shrink-0`}
                  >
                    {c.tier}
                  </Badge>
                )}
                <span className="text-xs text-slate-400 flex-shrink-0">
                  {relativeTime(c.lastMessageAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
