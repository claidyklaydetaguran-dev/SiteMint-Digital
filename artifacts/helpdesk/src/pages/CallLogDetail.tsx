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

interface TranscriptTurn {
  speaker: string;
  text: string;
}

const TRANSCRIPT_LINE_PATTERN = /^([A-Za-z][A-Za-z ]{0,19}):\s*(.+)$/;

/**
 * Splits a raw Vapi transcript string into speaker turns when every non-empty
 * line matches a `Speaker: text` shape. Falls back to `undefined` (render as
 * one block) for anything else — never guesses at a shape the transcript
 * doesn't actually have.
 */
function parseTranscriptTurns(transcript: string): TranscriptTurn[] | undefined {
  const lines = transcript.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return undefined;
  const turns: TranscriptTurn[] = [];
  for (const line of lines) {
    const match = TRANSCRIPT_LINE_PATTERN.exec(line);
    if (!match) return undefined;
    turns.push({ speaker: match[1]!.trim(), text: match[2]!.trim() });
  }
  return turns;
}

function isAssistantSpeaker(speaker: string): boolean {
  const s = speaker.toLowerCase();
  return s === "ai" || s.includes("assistant") || s.includes("receptionist");
}

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

function RealCallDetailView({ call }: { call: RealCallDetail }) {
  const startedAt = new Date(call.startedAt);
  const outcome = call.analysisAvailability === "available" ? call.structuredOutcome : null;
  const transcriptTurns = call.transcript ? parseTranscriptTurns(call.transcript) : undefined;

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
              transcriptTurns ? (
                <ol className="space-y-3">
                  {transcriptTurns.map((turn, i) => (
                    <li key={i} className="flex gap-3">
                      <span
                        className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase ${
                          isAssistantSpeaker(turn.speaker)
                            ? "bg-surface-muted text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                        aria-hidden="true"
                      >
                        {isAssistantSpeaker(turn.speaker) ? "AI" : "C"}
                      </span>
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">{turn.speaker}</div>
                        <p className="mt-0.5 text-sm text-foreground">{turn.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-foreground">{call.transcript}</p>
              )
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
              {outcome ? (
                <div className="space-y-2.5 text-sm">
                  <dl className="space-y-2.5">
                  {outcome.caller.name && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Caller name</dt>
                      <dd className="text-foreground">{outcome.caller.name}</dd>
                    </div>
                  )}
                  {outcome.caller.companyOrBusiness && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Company / business</dt>
                      <dd className="text-foreground">{outcome.caller.companyOrBusiness}</dd>
                    </div>
                  )}
                  {outcome.inquiry.businessType && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Business type</dt>
                      <dd className="text-foreground">{outcome.inquiry.businessType}</dd>
                    </div>
                  )}
                  {outcome.inquiry.reason && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Reason for calling</dt>
                      <dd className="text-foreground">{outcome.inquiry.reason}</dd>
                    </div>
                  )}
                  {outcome.inquiry.serviceInterest.length > 0 && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Services of interest</dt>
                      <dd className="text-foreground">{outcome.inquiry.serviceInterest.join(", ")}</dd>
                    </div>
                  )}
                  {outcome.inquiry.pricingQuestion && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Pricing question</dt>
                      <dd className="text-foreground">Yes</dd>
                    </div>
                  )}
                  {outcome.inquiry.urgency && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Urgency</dt>
                      <dd className="text-foreground capitalize">{outcome.inquiry.urgency}</dd>
                    </div>
                  )}
                  {outcome.disposition.summary && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Call summary</dt>
                      <dd className="text-foreground">{outcome.disposition.summary}</dd>
                    </div>
                  )}
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    Extracted by the assistant during the call — caller-stated details, not
                    independently confirmed facts.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Structured analysis unavailable for this call.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
                Appointment / follow-up
              </h2>
              {outcome ? (
                <div className="space-y-3 text-sm">
                  {outcome.appointmentRequest.requested ? (
                    <div className="space-y-2.5">
                      <dl className="space-y-2.5">
                        {outcome.appointmentRequest.preferredDateText && (
                          <div>
                            <dt className="text-xs text-muted-foreground">Preferred date</dt>
                            <dd className="text-foreground">{outcome.appointmentRequest.preferredDateText}</dd>
                          </div>
                        )}
                        {outcome.appointmentRequest.preferredTimeText && (
                          <div>
                            <dt className="text-xs text-muted-foreground">Preferred time</dt>
                            <dd className="text-foreground">{outcome.appointmentRequest.preferredTimeText}</dd>
                          </div>
                        )}
                        {outcome.appointmentRequest.timezone && (
                          <div>
                            <dt className="text-xs text-muted-foreground">Timezone</dt>
                            <dd className="text-foreground">{outcome.appointmentRequest.timezone}</dd>
                          </div>
                        )}
                      </dl>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge label="Pending review" tone="warning" />
                        <StatusBadge label="Not booked" tone="neutral" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A calendar isn't connected — this is the request as the assistant captured
                        it, not a confirmed booking.
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No appointment was requested on this call.</p>
                  )}

                  <div className="border-t border-border pt-3">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Consent
                    </h3>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li>Phone follow-up: {outcome.followUp.phoneConsent ? "Permitted" : "Not given"}</li>
                      <li>SMS: {outcome.followUp.smsConsent ? "Consented" : "Not given"}</li>
                      <li>Email: {outcome.followUp.emailConsent ? "Consented" : "Not given"}</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Structured analysis unavailable for this call.
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Delivery state: No message sent.
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
