import { Link, useParams } from "wouter";
import { ArrowLeft, User, CalendarClock, MessageSquareText } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DemoModeBanner } from "@/components/common/DemoModeBanner";
import { EmptyState } from "@/components/common/EmptyState";
import {
  findDemoCall,
  demoOutcomeTone,
  formatDemoDuration,
  formatDemoOutcome,
} from "@/lib/demoCallLog";

export default function CallLogDetail() {
  const params = useParams<{ id: string }>();
  const call = params.id ? findDemoCall(params.id) : undefined;

  if (!call) {
    return (
      <div className="flex h-full flex-col bg-background">
        <EmptyState
          icon={MessageSquareText}
          title="Call not found"
          description="This sample call record doesn't exist. Go back to Call Logs."
          action={
            <Link href="/logs" className="text-sm font-medium text-primary hover:underline">
              Back to Call Logs
            </Link>
          }
          className="flex-1"
        />
      </div>
    );
  }

  const startedAt = new Date(call.startedAt);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <Link
          href="/logs"
          className="inline-flex min-h-11 items-center gap-1.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Call Logs
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{call.callerName}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {call.callerPhone} &middot;{" "}
              {startedAt.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              &middot; {formatDemoDuration(call.durationSec)}
            </p>
          </div>
          <StatusBadge label={formatDemoOutcome(call.outcome)} tone={demoOutcomeTone(call.outcome)} />
        </div>
        <div className="mt-3">
          <DemoModeBanner text="this is a sample transcript, not a recording of a real call." />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
          {/* Transcript */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Transcript</h2>
            <ol className="space-y-3">
              {call.transcript.map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase ${
                      line.speaker === "assistant"
                        ? "bg-surface-muted text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                    aria-hidden="true"
                  >
                    {line.speaker === "assistant" ? "AI" : "C"}
                  </span>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      {line.speaker === "assistant" ? call.assistantName : call.callerName}
                    </div>
                    <p className="mt-0.5 text-sm text-foreground">{line.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Extracted info + outcome */}
          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <User className="h-4 w-4 text-primary" aria-hidden="true" />
                Extracted information
              </h2>
              <dl className="space-y-2.5 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Name</dt>
                  <dd className="text-foreground">{call.extracted.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Phone</dt>
                  <dd className="text-foreground">{call.extracted.phone}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reason for calling</dt>
                  <dd className="text-foreground">{call.extracted.reason}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
                Appointment / follow-up
              </h2>
              {call.appointment ? (
                <div className="space-y-2.5 text-sm">
                  <dl className="space-y-2.5">
                    <div>
                      <dt className="text-xs text-muted-foreground">Service</dt>
                      <dd className="text-foreground">{call.appointment.service}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Requested time</dt>
                      <dd className="text-foreground">{call.appointment.requestedTime}</dd>
                    </div>
                  </dl>
                  <StatusBadge label="Requested — not yet booked" tone="warning" />
                  <p className="text-xs text-muted-foreground">
                    Appointment booking isn't connected to a calendar yet. This shows the
                    request the assistant would hand off to your front desk.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No appointment or follow-up was requested on this call.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
