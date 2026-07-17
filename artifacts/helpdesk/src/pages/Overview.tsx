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
  CheckCircle2,
} from "lucide-react";

// ─── Agent config type ─────────────────────────────────────────────────────

interface AgentConfig {
  greetingMessage: string | null;
  businessDescription: string | null;
  qualifyingQuestions: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

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

// ─── Skeleton ──────────────────────────────────────────────────────────────

function SkeletonState() {
  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto p-6 gap-6">
      <div className="h-7 w-56 bg-slate-200 rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 h-28 animate-pulse" />
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="h-12 border-b border-slate-100 px-4 flex items-center gap-2">
          <div className="h-4 w-40 bg-slate-100 rounded animate-pulse" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 last:border-0">
            <div className="flex-1 h-4 bg-slate-100 rounded animate-pulse" />
            <div className="h-5 w-14 bg-slate-100 rounded-full animate-pulse" />
            <div className="h-4 w-10 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Error state ───────────────────────────────────────────────────────────

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

// ─── KPI card ──────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  href?: string;
}) {
  const inner = (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-3 shadow-sm transition-all duration-150 ${
        href ? "hover:shadow-md hover:border-slate-300 cursor-pointer" : ""
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div>
        <div className="text-[30px] font-bold text-slate-900 leading-none tabular-nums">
          {value}
        </div>
        <div className="text-xs text-slate-500 mt-2 leading-snug">{label}</div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}

// ─── Getting-started checklist ─────────────────────────────────────────────

function GettingStartedChecklist({
  agentConfig,
  dismissed,
  onDismiss,
}: {
  agentConfig: AgentConfig;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const steps = [
    {
      label: "Add a business description",
      done: Boolean(agentConfig.businessDescription?.trim()),
    },
    {
      label: "Write a greeting message",
      done: Boolean(agentConfig.greetingMessage?.trim()),
    },
    {
      label: "Add qualifying questions",
      done: (agentConfig.qualifyingQuestions ?? []).length > 0,
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone || dismissed) return null;

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-indigo-900">
            Set up your AI Receptionist
          </p>
          <p className="text-xs text-indigo-600 mt-0.5">
            {doneCount} of {steps.length} steps completed
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-indigo-300 hover:text-indigo-500 transition-colors mt-0.5 flex-shrink-0"
          aria-label="Dismiss setup checklist"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1">
        {steps.map((step) => (
          <Link key={step.label} href="/receptionist">
            <div
              className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-indigo-100/60 transition-colors ${
                step.done ? "opacity-55" : ""
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center border ${
                  step.done
                    ? "bg-emerald-500 border-emerald-500"
                    : "border-indigo-300 bg-white"
                }`}
              >
                {step.done && <CheckCircle2 className="h-3 w-3 text-white" />}
              </div>
              <span
                className={`text-xs leading-snug ${
                  step.done
                    ? "text-indigo-400 line-through"
                    : "text-indigo-800 font-medium"
                }`}
              >
                {step.label}
              </span>
              {!step.done && (
                <ChevronRight className="h-3.5 w-3.5 text-indigo-400 ml-auto flex-shrink-0" />
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

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

  const convs   = conversations ?? [];
  const firm    = me?.firm;
  const isPaid  = firm?.planTier === "paid";

  const thisWeek  = countThisWeek(convs);
  const hotLeads  = countHot(convs);
  const activeNow = countActive(convs);
  const usedCount = me?.conversationCount ?? 0;
  const capCount  = firm?.trialConversationsLimit ?? 20;
  const trialLabel = isPaid ? "Pro" : `${usedCount} / ${capCount}`;

  const recent5 = [...convs]
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 5);

  const needsSetup =
    !dismissed &&
    agentConfig !== undefined &&
    !(
      Boolean(agentConfig.greetingMessage?.trim()) &&
      Boolean(agentConfig.businessDescription?.trim()) &&
      (agentConfig.qualifyingQuestions ?? []).length > 0
    );

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Page header */}
      <div className="px-6 pt-6 pb-5 flex-shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">
          {greeting()}{firm?.name ? `, ${firm.name}` : ""}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">{todayLabel()}</p>
      </div>

      <div className="px-6 pb-6 flex flex-col gap-5">
        {/* Getting-started checklist */}
        {needsSetup && agentConfig && (
          <GettingStartedChecklist
            agentConfig={agentConfig}
            dismissed={dismissed}
            onDismiss={() => setDismissed(true)}
          />
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label="Conversations this week"
            value={thisWeek}
            icon={MessageSquare}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
            href="/conversations"
          />
          <KpiCard
            label="Hot leads"
            value={hotLeads}
            icon={Flame}
            iconBg="bg-rose-50"
            iconColor="text-rose-500"
            href="/conversations"
          />
          <KpiCard
            label="Active now"
            value={activeNow}
            icon={Activity}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            href="/conversations"
          />
          <KpiCard
            label={isPaid ? "Plan" : "Trial usage"}
            value={trialLabel}
            icon={BarChart2}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            href="/billing"
          />
        </div>

        {/* Recent conversations */}
        {convs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 flex flex-col items-center justify-center gap-3 text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">No conversations yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Once callers reach your AI Receptionist, they'll appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-900">Recent conversations</span>
              <Link href="/conversations">
                <button className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                  View all <ChevronRight className="h-3 w-3" />
                </button>
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {recent5.map((c) => (
                <Link key={c.id} href="/conversations">
                  <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-900 truncate block">
                        {c.callerPhone}
                      </span>
                    </div>
                    {c.tier && (
                      <Badge
                        className={`${TIER_STYLES[c.tier] ?? ""} border-transparent text-xs flex-shrink-0 rounded-full`}
                      >
                        {c.tier}
                      </Badge>
                    )}
                    <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                      {relativeTime(c.lastMessageAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
