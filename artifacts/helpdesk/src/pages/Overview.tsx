import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { apiFetch } from "@/lib/api";
import { Conversation, useConversations } from "@/hooks/useConversations";
import { useSession } from "@/hooks/useSession";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineError } from "@/components/common/InlineError";
import { KpiTile } from "@/components/common/KpiTile";
import { RecentConversationList } from "@/components/common/RecentConversationList";
import { GettingStartedChecklist, type ChecklistStep } from "@/components/common/GettingStartedChecklist";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  MessageSquare,
  Flame,
  Activity,
  BarChart2,
  PhoneCall,
  CalendarCheck,
  Clock3,
} from "lucide-react";

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

/** Real 7-day activity trend derived from conversation createdAt timestamps. */
function buildWeekTrend(conversations: Conversation[]): { day: string; count: number }[] {
  const days: { day: string; count: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const count = conversations.filter((c) => {
      const t = new Date(c.createdAt).getTime();
      return t >= d.getTime() && t < next.getTime();
    }).length;
    days.push({ day: d.toLocaleDateString("en-US", { weekday: "short" }), count });
  }
  return days;
}

// ─── Loading state ─────────────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto p-6 gap-6">
      <div className="h-7 w-56 bg-muted rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 h-28 animate-pulse" />
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-12 border-b border-border px-4 flex items-center gap-2">
          <div className="h-4 w-40 bg-muted rounded animate-pulse" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
            <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
            <div className="h-5 w-14 bg-muted rounded-full animate-pulse" />
            <div className="h-4 w-10 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Weekly activity trend (real timestamps only) ──────────────────────────

function WeekTrend({ conversations }: { conversations: Conversation[] }) {
  const data = buildWeekTrend(conversations);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">This week's activity</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total > 0 ? `${total} conversation${total === 1 ? "" : "s"} started` : "No activity yet this week"}
          </p>
        </div>
      </div>
      {total > 0 ? (
        <div className="h-32" role="img" aria-label="Conversations started per day over the last 7 days">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--surface-muted))" }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
          Activity trends will appear once conversations start coming in.
        </div>
      )}
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

  const { data: me, isLoading: isLoadingMe, isError: isErrorMe } = useSession();

  const {
    data: agentConfig,
    isError: isErrorAgentConfig,
  } = useQuery<AgentConfig>({
    queryKey: ["agent-config"],
    queryFn: () => apiFetch<AgentConfig>("/receptionist/agent-config"),
  });

  if (isLoadingConvs || isLoadingMe) return <OverviewSkeleton />;
  if (isErrorConvs || isErrorMe) {
    return (
      <div className="flex h-full flex-col bg-background">
        <InlineError
          title="Failed to load your overview"
          description="Check your connection and try again."
          onRetry={refetch}
          className="flex-1"
        />
      </div>
    );
  }

  const convs = conversations ?? [];
  const firm = me?.firm;
  const isPaid = firm?.planTier === "paid";

  const thisWeek = countThisWeek(convs);
  const hotLeads = countHot(convs);
  const activeNow = countActive(convs);
  const usedCount = me?.conversationCount ?? 0;
  const capCount = firm?.trialConversationsLimit ?? 20;
  const trialLabel = isPaid ? "Pro" : `${usedCount} / ${capCount}`;

  const recent5 = [...convs]
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 5);

  // agentConfig is partial data — its own failure never blanks the rest of the page.
  const hasAgentConfig = agentConfig !== undefined && !isErrorAgentConfig;
  const checklistSteps: ChecklistStep[] = hasAgentConfig
    ? [
        {
          label: "Add a business description",
          done: Boolean(agentConfig!.businessDescription?.trim()),
          href: "/receptionist",
        },
        {
          label: "Write a greeting message",
          done: Boolean(agentConfig!.greetingMessage?.trim()),
          href: "/receptionist",
        },
        {
          label: "Add qualifying questions",
          done: (agentConfig!.qualifyingQuestions ?? []).length > 0,
          href: "/receptionist",
        },
      ]
    : [];
  const needsSetup = hasAgentConfig && !dismissed && checklistSteps.some((s) => !s.done);

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Page header */}
      <div className="px-6 pt-6 pb-5 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-xl font-semibold text-foreground">
            {greeting()}
            {firm?.name ? `, ${firm.name}` : ""}
          </h1>
          <StatusBadge label="Live on SMS" tone="success" />
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{todayLabel()}</p>
      </div>

      <div className="px-6 pb-6 flex flex-col gap-5">
        {/* Getting-started checklist */}
        {needsSetup && (
          <GettingStartedChecklist
            title="Set up your AI Receptionist"
            steps={checklistSteps}
            onDismiss={() => setDismissed(true)}
          />
        )}

        {/* KPI row — real data only; voice-only metrics show honest empty states */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiTile
            label="Conversations this week"
            value={thisWeek}
            icon={MessageSquare}
            href="/conversations"
          />
          <KpiTile label="Hot leads" value={hotLeads} icon={Flame} href="/conversations" />
          <KpiTile label="Active now" value={activeNow} icon={Activity} href="/conversations" />
          <KpiTile
            label={isPaid ? "Plan" : "Trial usage"}
            value={trialLabel}
            icon={BarChart2}
            href="/billing"
          />
        </div>

        {/* Voice-platform metrics — never fabricated, honest "no data yet" */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <KpiTile label="Calls answered" value="" icon={PhoneCall} unavailable unavailableLabel="Connect voice to enable" />
          <KpiTile label="Appointments booked" value="" icon={CalendarCheck} unavailable unavailableLabel="Connect voice to enable" />
          <KpiTile label="Hours saved" value="" icon={Clock3} unavailable unavailableLabel="Available after voice setup" />
        </div>

        {/* This week's activity trend — derived from real timestamps */}
        <WeekTrend conversations={convs} />

        {/* Recent conversations */}
        {convs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={MessageSquare}
              title="No conversations yet"
              description="Once callers reach your AI Receptionist, they'll appear here."
            />
          </div>
        ) : (
          <RecentConversationList conversations={recent5} />
        )}
      </div>
    </div>
  );
}
