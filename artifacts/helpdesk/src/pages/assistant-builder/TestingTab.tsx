import { Mic, MessageCircle, ScrollText, Wrench, Gauge, AlertCircle, History } from "lucide-react";
import { UnavailableActionButton } from "@/components/common/UnavailableActionButton";
import type { BuilderTabProps } from "@/pages/AssistantBuilder";

function InactivePanel({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Mic;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-muted p-5 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export default function TestingTab(_props: BuilderTabProps) {
  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Testing</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Try this assistant before sharing a number with customers.
          </p>
        </div>
        <div className="flex gap-1.5">
          <UnavailableActionButton
            icon={Mic}
            label="Browser call"
            availability="Browser test calling available in Checkpoint F"
          />
          <UnavailableActionButton
            icon={MessageCircle}
            label="Text test"
            availability="Text testing available in Checkpoint F"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-muted px-4 py-2.5 text-xs text-muted-foreground">
        Connection state: <span className="font-semibold text-foreground">Not connected</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InactivePanel icon={ScrollText} title="Live transcript" description="Appears here once a test call is running." />
        <InactivePanel icon={Wrench} title="Tool-call history" description="Tool calls made during a test will be listed here." />
        <InactivePanel icon={Gauge} title="Cost & latency" description="Per-test estimates will appear here once available." />
        <InactivePanel icon={AlertCircle} title="Errors" description="Any issues during a test call will be surfaced here." />
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          Test history
        </p>
        <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          No tests have been run yet.
        </div>
      </div>
    </div>
  );
}
