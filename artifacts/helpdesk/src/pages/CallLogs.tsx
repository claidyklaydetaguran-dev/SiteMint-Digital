import { Link } from "wouter";
import { PhoneCall, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DemoModeBanner } from "@/components/common/DemoModeBanner";
import {
  DEMO_CALLS,
  demoOutcomeTone,
  formatDemoDuration,
  formatDemoOutcome,
} from "@/lib/demoCallLog";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CallLogs() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Call Logs</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Calls your voice assistant answers, with transcripts and outcomes.
        </p>
        <div className="mt-3">
          <DemoModeBanner text="phone calls, transcripts, and appointment booking aren't connected to a live number yet — these are sample records showing what this screen will look like." />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[1fr,auto,auto,auto] gap-4 border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Caller</span>
            <span className="hidden sm:block">When</span>
            <span className="hidden sm:block">Duration</span>
            <span>Outcome</span>
          </div>
          {DEMO_CALLS.map((call) => (
            <Link
              key={call.id}
              href={`/logs/${call.id}`}
              className="grid min-h-11 grid-cols-[1fr,auto,auto,auto] items-center gap-4 border-b border-border px-4 py-3.5 last:border-0 hover:bg-surface-muted focus-visible:bg-surface-muted"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-muted text-primary">
                  <PhoneCall className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{call.callerName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{call.callerPhone}</span>
                </span>
              </span>
              <span className="hidden text-sm text-muted-foreground sm:block">{formatWhen(call.startedAt)}</span>
              <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">
                {formatDemoDuration(call.durationSec)}
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge label={formatDemoOutcome(call.outcome)} tone={demoOutcomeTone(call.outcome)} />
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
