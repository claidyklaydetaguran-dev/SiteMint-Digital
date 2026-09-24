/**
 * V5 PR-8 — a compact usage indicator for the navigation rail, exported for
 * the lead to mount in `AppShell`. Minutes (voice usage, `useUsage`) is
 * primary; SMS (conversation usage, already on the session response —
 * `SessionData.conversationCount` / `SessionFirm.trialConversationsLimit`,
 * see `hooks/useSession.ts`) is secondary. Neither query is new: this
 * component only composes two reads the app already makes.
 */

import { useSession } from "@/hooks/useSession";
import { useUsage } from "@/hooks/useUsage";
import { railMinutesLabel, railSmsLabel } from "@/pages/usage/usageContract";

export function UsageRailIndicator() {
  const { data: session } = useSession();
  const usageQuery = useUsage();

  if (!session) return null;

  return (
    <div className="sd-usage" aria-label="Usage summary">
      <div className="sd-usage__row">
        <span className="sd-usage__plan">
          {usageQuery.data ? railMinutesLabel(usageQuery.data) : "Minutes —"}
        </span>
      </div>
      <div className="sd-usage__row">
        <span className="sd-usage__count">
          {railSmsLabel(session.conversationCount, session.firm.trialConversationsLimit)}
        </span>
      </div>
    </div>
  );
}

export default UsageRailIndicator;
