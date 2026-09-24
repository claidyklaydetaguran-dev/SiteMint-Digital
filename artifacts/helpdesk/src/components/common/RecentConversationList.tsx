import { Link } from "wouter";
import { MessageSquare, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import type { Conversation } from "@/hooks/useConversations";
import { relativeTime, TIER_STYLES } from "@/lib/conversationUi";

interface RecentConversationListProps {
  conversations: Conversation[];
}

/** Real recent-conversation preview for the Overview daily briefing. */
export function RecentConversationList({ conversations }: RecentConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-xs">
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Once callers reach your AI Receptionist, they'll appear here."
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Recent conversations</span>
        <Link href="/conversations">
          <button className="text-xs text-primary hover:underline font-medium flex items-center gap-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded">
            View all <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </Link>
      </div>
      <div className="divide-y divide-border">
        {conversations.map((c) => (
          <Link key={c.id} href="/conversations">
            <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-muted cursor-pointer transition-colors">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground truncate block">{c.callerPhone}</span>
              </div>
              {c.tier && (
                <Badge className={`${TIER_STYLES[c.tier] ?? ""} border-transparent text-xs flex-shrink-0 rounded-full`}>
                  {c.tier}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
                {relativeTime(c.lastMessageAt)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
