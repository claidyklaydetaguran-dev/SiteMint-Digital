import type { ReactNode } from "react";
import { Link } from "wouter";
import { PhoneCall, ChevronRight, PhoneOff } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { DemoModeBanner } from "@/components/common/DemoModeBanner";
import { EmptyState } from "@/components/common/EmptyState";
import {
  DEMO_CALLS,
  demoOutcomeTone,
  formatDemoDuration,
  formatDemoOutcome,
} from "@/lib/demoCallLog";
import { useRealCallsList } from "@/hooks/useVoiceCalls";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import type { RealCallSummary } from "@/lib/voiceCallsApi";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRealDuration(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function realStateTone(state: RealCallSummary["state"]): StatusTone {
  switch (state) {
    case "completed":
      return "success";
    case "in_progress":
    case "ringing":
    case "connecting":
    case "queued":
      return "info";
    case "no_answer":
    case "busy":
    case "canceled":
      return "warning";
    case "failed":
    case "provider_error":
      return "destructive";
  }
}

function CallRow({
  href,
  name,
  subtitle,
  when,
  duration,
  badgeLabel,
  badgeTone,
}: {
  href: string;
  name: string;
  subtitle: string;
  when: string;
  duration: string;
  badgeLabel: string;
  badgeTone: StatusTone;
}) {
  return (
    <Link
      href={href}
      className="block border-b border-border px-4 py-3.5 last:border-0 hover:bg-surface-muted focus-visible:bg-surface-muted sm:grid sm:min-h-11 sm:grid-cols-[minmax(0,1fr)_9rem_5rem_11rem_1.5rem] sm:items-center sm:gap-4"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-muted text-primary">
          <PhoneCall className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </span>

      <span className="mt-2 flex items-center gap-3 pl-10 text-xs text-muted-foreground sm:mt-0 sm:contents sm:pl-0 sm:text-sm">
        <span className="sm:block">{when}</span>
        <span className="tabular-nums sm:block">{duration}</span>
      </span>

      <span className="mt-2 flex items-center gap-2 pl-10 sm:mt-0 sm:pl-0">
        <StatusBadge label={badgeLabel} tone={badgeTone} />
      </span>
      <ChevronRight
        className="mt-2 hidden h-4 w-4 flex-shrink-0 text-muted-foreground sm:mt-0 sm:block sm:justify-self-end"
        aria-hidden="true"
      />
    </Link>
  );
}

function CallTableHeader() {
  return (
    <div className="hidden grid-cols-[minmax(0,1fr)_9rem_5rem_11rem_1.5rem] items-center gap-4 border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
      <span>Caller</span>
      <span>When</span>
      <span>Duration</span>
      <span>Outcome</span>
      <span className="sr-only">Open</span>
    </div>
  );
}

function Section({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {badge}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </div>
  );
}

export default function CallLogs() {
  const { data: realCalls, isLoading: realCallsLoading } = useRealCallsList();
  const items = realCalls?.items ?? [];

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Call Logs</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Calls your voice assistant answers, with transcripts and outcomes.
        </p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {voicePlatformEnabled && (
          <Section
            title="Real calls"
            badge={<StatusBadge label="Vapi + Twilio" tone="info" />}
          >
            {realCallsLoading ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <EmptyState
                icon={PhoneOff}
                title="No real calls yet"
                description="Once a Development phone number is connected to Vapi and verified end to end, real inbound calls will appear here."
                className="py-10"
              />
            ) : (
              <>
                <CallTableHeader />
                {items.map((call) => (
                  <CallRow
                    key={call.callId}
                    href={`/logs/${call.callId}`}
                    name={call.callerNumberDisplay}
                    subtitle="Vapi + Twilio (Development)"
                    when={formatWhen(call.startedAt)}
                    duration={formatRealDuration(call.durationSec)}
                    badgeLabel={call.stateLabel}
                    badgeTone={realStateTone(call.state)}
                  />
                ))}
              </>
            )}
          </Section>
        )}

        <Section
          title="Demo Mode"
          badge={<StatusBadge label="Sample data" tone="neutral" />}
        >
          <div className="border-b border-border bg-surface-muted px-4 py-2">
            <DemoModeBanner text="phone calls, transcripts, and appointment booking aren't connected to a live number yet — these are sample records showing what this screen will look like." />
          </div>
          <CallTableHeader />
          {DEMO_CALLS.map((call) => (
            <CallRow
              key={call.id}
              href={`/logs/${call.id}`}
              name={call.callerName}
              subtitle={call.callerPhone}
              when={formatWhen(call.startedAt)}
              duration={formatDemoDuration(call.durationSec)}
              badgeLabel={formatDemoOutcome(call.outcome)}
              badgeTone={demoOutcomeTone(call.outcome)}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}
