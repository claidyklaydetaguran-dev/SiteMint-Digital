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
          {/* Desktop header row — hidden below sm, where cards replace the table */}
          <div className="hidden grid-cols-[minmax(0,1fr)_9rem_5rem_11rem_1.5rem] items-center gap-4 border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Caller</span>
            <span>When</span>
            <span>Duration</span>
            <span>Outcome</span>
            <span className="sr-only">Open</span>
          </div>

          {DEMO_CALLS.map((call) => (
            <Link
              key={call.id}
              href={`/logs/${call.id}`}
              className="block border-b border-border px-4 py-3.5 last:border-0 hover:bg-surface-muted focus-visible:bg-surface-muted sm:grid sm:min-h-11 sm:grid-cols-[minmax(0,1fr)_9rem_5rem_11rem_1.5rem] sm:items-center sm:gap-4"
            >
              {/* Caller */}
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-muted text-primary">
                  <PhoneCall className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{call.callerName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{call.callerPhone}</span>
                </span>
              </span>

              {/* When / Duration — inline meta row on mobile, own columns on desktop */}
              <span className="mt-2 flex items-center gap-3 pl-10 text-xs text-muted-foreground sm:mt-0 sm:contents sm:pl-0 sm:text-sm">
                <span className="sm:block">{formatWhen(call.startedAt)}</span>
                <span className="tabular-nums sm:block">{formatDemoDuration(call.durationSec)}</span>
              </span>

              {/* Outcome + open indicator */}
              <span className="mt-2 flex items-center gap-2 pl-10 sm:mt-0 sm:pl-0">
                <StatusBadge label={formatDemoOutcome(call.outcome)} tone={demoOutcomeTone(call.outcome)} />
              </span>
              <ChevronRight
                className="mt-2 hidden h-4 w-4 flex-shrink-0 text-muted-foreground sm:mt-0 sm:block sm:justify-self-end"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
