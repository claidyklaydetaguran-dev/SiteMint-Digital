import { Link, useParams } from "wouter";
import { ArrowLeft, User, CalendarClock, MessageSquareText, PhoneCall } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { DemoModeBanner } from "@/components/common/DemoModeBanner";
import { EmptyState } from "@/components/common/EmptyState";
import {
  findDemoCall,
  demoOutcomeTone,
  formatDemoDuration,
  formatDemoOutcome,
} from "@/lib/demoCallLog";
import { useRealCallDetail } from "@/hooks/useVoiceCalls";
import type { RealCallDetail, InternalCallState } from "@/lib/voiceCallsApi";

function NotFound() {
  return (
    <div className="flex h-full flex-col bg-background">
      <EmptyState
        icon={MessageSquareText}
        title="Call not found"
        description="This call record doesn't exist. Go back to Call Logs."
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

function realStateTone(state: InternalCallState): StatusTone {
  switch (state) {
    case "completed": return "success";
    case "in_progress": case "ringing": case "connecting": case "queued": return "info";
    case "no_answer": case "busy": case "canceled": return "warning";
    case "failed": case "provider_error": return "destructive";
  }
}

function formatRealDuration(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Best-effort, defensive read of Vapi's optional structured-output analysis — never assumed to have any particular shape. */
function readAnalysisField(analysis: unknown, key: string): string | undefined {
  if (typeof analysis !== "object" || analysis === null) return undefined;
  const record = analysis as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === "string" && direct.trim()) return direct;
  const nested = record["structuredData"];
  if (typeof nested === "object" && nested !== null) {
    const value = (nested as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function RealCallDetailView({ call }: { call: RealCallDetail }) {
  const startedAt = new Date(call.startedAt);
  const callerName = readAnalysisField(call.analysis, "callerName");
  const requestedService = readAnalysisField(call.analysis, "requestedService");
  const appointmentRequest = readAnalysisField(call.analysis, "appointmentRequest");

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
            <h1 className="text-lg font-semibold text-foreground">{call.callerNumberDisplay}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {startedAt.toLocaleString(undefined, {
                month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
              })}{" "}
              &middot; {formatRealDuration(call.durationSec)}
            </p>
          </div>
          <StatusBadge label={call.stateLabel} tone={realStateTone(call.state)} />
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-statusbadge-info-bg bg-statusbadge-info-bg/40 px-3 py-2 text-xs font-medium text-statusbadge-info-text">
          <PhoneCall className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span>Vapi + Twilio (Development) — a real webhook-verified call, not a simulation.</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Transcript</h2>
            {call.transcript ? (
              <p className="whitespace-pre-wrap text-sm text-foreground">{call.transcript}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {call.isFinal
                  ? "No transcript was provided for this call."
                  : "This call is still in progress — a transcript will appear once it ends."}
              </p>
            )}
            {call.summary && (
              <>
                <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Summary
                </h3>
                <p className="text-sm text-foreground">{call.summary}</p>
              </>
            )}
          </section>

          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <User className="h-4 w-4 text-primary" aria-hidden="true" />
                Extracted information
              </h2>
              {callerName || requestedService ? (
                <dl className="space-y-2.5 text-sm">
                  {callerName && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Caller-provided name</dt>
                      <dd className="text-foreground">{callerName}</dd>
                    </div>
                  )}
                  {requestedService && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Requested service</dt>
                      <dd className="text-foreground">{requestedService}</dd>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Extracted by the assistant during the call — a caller-stated detail, not an
                    independently confirmed fact.
                  </p>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No structured caller information was extracted for this call.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
                Appointment / follow-up
              </h2>
              {appointmentRequest ? (
                <div className="space-y-2.5 text-sm">
                  <p className="text-foreground">{appointmentRequest}</p>
                  <StatusBadge label="Requested — not yet booked" tone="warning" />
                  <p className="text-xs text-muted-foreground">
                    Appointment booking isn't connected to a calendar yet — this is the request as
                    the assistant captured it, not a confirmed booking.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No appointment or follow-up was requested on this call.
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                SMS and email follow-up are not yet connected — no message was sent for this call.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoCallDetailView({ call }: { call: NonNullable<ReturnType<typeof findDemoCall>> }) {
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
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
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

export default function CallLogDetail() {
  const params = useParams<{ id: string }>();
  const demoCall = params.id ? findDemoCall(params.id) : undefined;

  // Only look up a real call when no demo fixture matched — demo ids
  // (`demo-1`, etc.) never collide with a real Vapi call id, but this order
  // guarantees a demo record is never shadowed by a slow/failed API call.
  const realCallQuery = useRealCallDetail(demoCall ? undefined : params.id);

  if (demoCall) {
    return <DemoCallDetailView call={demoCall} />;
  }

  if (realCallQuery.isLoading) {
    return <div className="flex h-full flex-col bg-background" aria-hidden="true" />;
  }

  if (realCallQuery.data?.call) {
    return <RealCallDetailView call={realCallQuery.data.call} />;
  }

  return <NotFound />;
}
