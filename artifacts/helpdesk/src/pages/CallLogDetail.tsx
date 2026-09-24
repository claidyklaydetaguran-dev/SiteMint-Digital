/**
 * Frontend V2 Phase 14 — one stored call record.
 *
 * Mounted at `ROUTES.logDetail` (`/logs/:id`, base-relative) and registered
 * only when `VITE_VOICE_PLATFORM_ENABLED` is true, exactly as before.
 *
 * ── Product classification ────────────────────────────────────────────────
 * A stored record from `GET /api/receptionist/voice/calls/:callId`, with
 * on-demand replay of retained audio. Replay reauthorizes the business and
 * policy on the server; it never starts or records a new conversation.
 *
 * The fabricated demo record this page used to render (a made-up caller,
 * phone number, transcript and booked-looking outcome, resolved from
 * `lib/demoCallLog.ts` *before* the API was consulted) is removed along with
 * the fixture module.
 *
 * ── The four outcomes of one read ─────────────────────────────────────────
 * `fetchRealCallDetail` resolves to `undefined` on 404 and rejects on anything
 * else, so the states stay distinct and a failure can never be mistaken for a
 * missing record:
 *   loading      → an accessible loading line
 *   data.call    → the record
 *   undefined    → not found
 *   isError      → read failure, with an explicit Try again
 */

import { Link, useParams } from "wouter";
import { useCallback, useState, type ReactNode } from "react";
import { useSession } from "@/hooks/useSession";
import { useRealCallDetail } from "@/hooks/useVoiceCalls";
import { useInquiriesForCall } from "@/hooks/useInquiries";
import { useContactForCall } from "@/hooks/useContacts";
import { CallRecording } from "@/pages/call-logs/CallRecording";
import { ROUTES } from "@/lib/routes";
import type { RealCallDetail, StructuredOutcome } from "@/lib/voiceCallsApi";
import {
  ANALYSIS_UNAVAILABLE,
  CONTROLS,
  DETAIL,
  LINKED,
  LIST_PATH,
  NOT_PROVIDED,
  PAGE,
  TRANSFER,
  analysisIsAvailable,
  callCategory,
  callCategoryLabel,
  callerNumberText,
  channelLabel,
  consent,
  dispositionLabel,
  formatDuration,
  formatFullTime,
  isRecordMissing,
  listOrMissing,
  machineTime,
  requestStatusLabel,
  retentionDetail,
  stateAccessibleName,
  stateLabel,
  stateTone,
  textOrMissing,
  transcriptIsShown,
  transferBadge,
  transferDetail,
  transferStateLabel,
  urgencyLabel,
  yesNo,
} from "@/pages/call-logs/callLogsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-call-logs.css";

function BackLink() {
  return (
    <Link href={LIST_PATH} className="sc-back">
      <span aria-hidden="true">&larr;</span> {DETAIL.back}
    </Link>
  );
}

/**
 * `wide` marks a field whose value is prose rather than a token. It spans the
 * grid and keeps a reading measure, so a long reason or summary is not forced
 * down a column built for "Yes" and "High".
 */
function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide === true ? "sc-fact sc-fact--wide" : "sc-fact"}>
      <dt className="sc-fact__label">{label}</dt>
      <dd className="sc-fact__value">{children}</dd>
    </div>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="sc-group">
      <h3 className="sc-group__heading">{heading}</h3>
      <dl className="sc-facts">{children}</dl>
    </div>
  );
}

function Analysis({ outcome }: { outcome: StructuredOutcome }) {
  const appointment = outcome.appointmentRequest;
  const followUp = outcome.followUp;

  return (
    <div className="sc-analysis">
      <Group heading={DETAIL.callerHeading}>
        <Fact label={DETAIL.callerName}>{textOrMissing(outcome.caller.name)}</Fact>
        <Fact label={DETAIL.callerEmail}>{textOrMissing(outcome.caller.email)}</Fact>
        <Fact label={DETAIL.callerCompany} wide>{textOrMissing(outcome.caller.companyOrBusiness)}</Fact>
      </Group>

      <Group heading={DETAIL.inquiryHeading}>
        <Fact label={DETAIL.inquiryReason} wide>{textOrMissing(outcome.inquiry.reason)}</Fact>
        <Fact label={DETAIL.inquiryServices} wide>{listOrMissing(outcome.inquiry.serviceInterest)}</Fact>
        <Fact label={DETAIL.inquiryBusinessType}>{textOrMissing(outcome.inquiry.businessType)}</Fact>
        <Fact label={DETAIL.inquiryPricing}>{yesNo(outcome.inquiry.pricingQuestion)}</Fact>
        <Fact label={DETAIL.inquiryUrgency}>{urgencyLabel(outcome.inquiry.urgency)}</Fact>
      </Group>

      <Group heading={DETAIL.appointmentHeading}>
        <Fact label={DETAIL.appointmentRequested}>{yesNo(appointment.requested)}</Fact>
        <Fact label={DETAIL.appointmentDate}>{textOrMissing(appointment.preferredDateText)}</Fact>
        <Fact label={DETAIL.appointmentTime}>{textOrMissing(appointment.preferredTimeText)}</Fact>
        <Fact label={DETAIL.appointmentTimezone}>{textOrMissing(appointment.timezone)}</Fact>
        <Fact label={DETAIL.appointmentStatus}>{requestStatusLabel(appointment.status)}</Fact>
      </Group>

      <Group heading={DETAIL.followUpHeading}>
        <Fact label={DETAIL.followUpRequested}>{yesNo(followUp.requested)}</Fact>
        <Fact label={DETAIL.followUpPhone}>{consent(followUp.phoneConsent)}</Fact>
        <Fact label={DETAIL.followUpSms}>{consent(followUp.smsConsent)}</Fact>
        <Fact label={DETAIL.followUpEmail}>{consent(followUp.emailConsent)}</Fact>
        <Fact label={DETAIL.followUpStatus}>{requestStatusLabel(followUp.status)}</Fact>
      </Group>

      <Group heading={DETAIL.dispositionHeading}>
        <Fact label={DETAIL.dispositionCategory}>{dispositionLabel(outcome.disposition.outcome)}</Fact>
        <Fact label={DETAIL.dispositionSummary} wide>{textOrMissing(outcome.disposition.summary)}</Fact>
      </Group>

      <p className="sc-note">{DETAIL.note}</p>
    </div>
  );
}

/**
 * What is known about handing this caller to a person — levels of evidence,
 * not steps in a progress bar. The wording never upgrades an acknowledgement
 * into someone answering, and a blind handover says plainly that nothing
 * after it is observable rather than leaving a business wondering.
 */
function TransferSection({ call }: { call: RealCallDetail }) {
  const state = call.transfer?.state;
  // `transferBadge` returns null only for "none", which is exactly the case
  // the plain "No transfer" label covers.
  const label = transferBadge(state) ?? transferStateLabel("none");

  return (
    <section className="sc-doc" aria-labelledby="sc-transfer">
      <h2 className="sc-doc__heading" id="sc-transfer">
        {TRANSFER.heading}
      </h2>
      <dl className="sc-facts">
        <Fact label={TRANSFER.evidenceLabel}>{label}</Fact>
        <Fact label={TRANSFER.destinationLabel}>{textOrMissing(call.transfer?.destinationMasked)}</Fact>
      </dl>
      <p className="sc-note">{transferDetail(state)}</p>
      {call.transfer?.connectionKnowable === false && <p className="sc-note">{TRANSFER.blindNote}</p>}
    </section>
  );
}

/**
 * The records this call actually produced, reached by real foreign keys the
 * server resolves — a saved message on (firm, call id), a contact through the
 * call-link row. Nothing here matches on a caller's name.
 *
 * Appointment requests are named and deliberately not listed: the request row
 * carries no key back to the call that produced it, so any list would be a
 * guess. Saying that is more useful than an empty heading.
 */
function LinkedRecords({ callId }: { callId: string }) {
  const inquiries = useInquiriesForCall(callId);
  const contact = useContactForCall(callId);
  const messages = inquiries.data?.items ?? [];
  const linked = contact.data;

  return (
    <section className="sc-doc" aria-labelledby="sc-linked">
      <h2 className="sc-doc__heading" id="sc-linked">
        {LINKED.heading}
      </h2>

      <h3 className="sc-group__heading">{LINKED.messagesHeading}</h3>
      {inquiries.isLoading ? (
        <p className="sc-note">{LINKED.messagesLoading}</p>
      ) : inquiries.isError ? (
        <p className="sc-absent">{LINKED.messagesFailed}</p>
      ) : messages.length === 0 ? (
        <p className="sc-absent">{LINKED.messagesEmpty}</p>
      ) : (
        <ul className="sd-list">
          {messages.map((message) => (
            <li className="sd-list__item" key={message.id}>
              <Link href={ROUTES.inquiries} className="sc-link">
                <span className="sc-link__text">{message.topic}</span>
                <span className="sd-sr"> — {LINKED.openMessages}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h3 className="sc-group__heading">{LINKED.contactHeading}</h3>
      {contact.isLoading ? (
        <p className="sc-note">{LINKED.contactLoading}</p>
      ) : contact.isError ? (
        <p className="sc-absent">{LINKED.contactFailed}</p>
      ) : !linked ? (
        <p className="sc-absent">{LINKED.contactEmpty}</p>
      ) : (
        <Link href={ROUTES.contactDetail.replace(":id", encodeURIComponent(linked.id))} className="sc-link">
          <span className="sc-link__text">{linked.name ?? linked.phone}</span>
          <span className="sd-sr"> — {LINKED.openContact}</span>
        </Link>
      )}

      <p className="sc-note">{LINKED.appointmentsNote}</p>
    </section>
  );
}

function Record({ call }: { call: RealCallDetail }) {
  const label = stateLabel(call);
  const outcome = analysisIsAvailable(call.analysisAvailability) ? call.structuredOutcome : null;

  return (
    <div className="sd-page sc-page--doc sd-enter">
      <div className="sc-nav">
        <BackLink />
      </div>

      {/* The record's left rule carries the state's tone, matching the row the
          reader came from. The state is also spelled out beside the title. */}
      <header className="sc-record" data-tone={stateTone(call.state)}>
        <div className="sc-record__head">
          <div className="sc-record__id">
            <span className="sd-eyebrow">{DETAIL.factsHeading}</span>
            <h1 className="sc-record__title">{callerNumberText(call)}</h1>
          </div>
          <span className="sc-state sc-state--lg">
            <span className="sc-state__text">{label}</span>
            <span className="sd-sr">{stateAccessibleName(label)}</span>
          </span>
        </div>
        <span className="sd-chip">{callCategoryLabel(callCategory(call))}</span>
        {/* How the call arrived. A browser test and a customer call were
            previously indistinguishable on this page. */}
        <span className="sd-chip">{channelLabel(call)}</span>

        <dl className="sc-facts sc-facts--record">
          <Fact label={DETAIL.started}>
            <time className="sc-fig" dateTime={machineTime(call.startedAt)}>
              {formatFullTime(call.startedAt)}
            </time>
          </Fact>
          <Fact label={DETAIL.ended}>
            {call.endedAt ? (
              <time className="sc-fig" dateTime={machineTime(call.endedAt)}>
                {formatFullTime(call.endedAt)}
              </time>
            ) : (
              <span className="sc-absent-inline">{formatFullTime(null)}</span>
            )}
          </Fact>
          <Fact label={DETAIL.duration}>
            {typeof call.durationSec === "number" ? (
              <span className="sc-fig">{formatDuration(call.durationSec)}</span>
            ) : (
              <span className="sc-absent-inline">{formatDuration(null)}</span>
            )}
          </Fact>
        </dl>
      </header>

      <CallRecording key={`${call.callId}:${call.artifactPolicy}`} callId={call.callId} policy={call.artifactPolicy} isFinal={call.isFinal} />

      <section className="sc-doc" aria-labelledby="sc-retention">
        <h2 className="sc-doc__heading" id="sc-retention">
          {DETAIL.retentionHeading}
        </h2>
        {/* The account's CONFIGURED policy, carried on this record by the
            server — not a retention claim this page makes on its own. */}
        <p className="sc-note">{retentionDetail(call.artifactPolicy)}</p>
      </section>

      {/* Stored words are shown only under a policy that actually keeps them.
          Under the approved policy nothing is retained, so this section is not
          rendered at all rather than rendered empty. The server withholds the
          field under the same policy, so this is the second of two locks. */}
      {transcriptIsShown(call.artifactPolicy) && (
        <section className="sc-doc" aria-labelledby="sc-transcript">
          <h2 className="sc-doc__heading" id="sc-transcript">
            {DETAIL.transcriptHeading}
          </h2>
          {call.transcript && call.transcript.trim() !== "" ? (
            <p className="sc-prose">{call.transcript}</p>
          ) : (
            <p className="sc-absent">{NOT_PROVIDED}</p>
          )}
        </section>
      )}

      <section className="sc-doc" aria-labelledby="sc-summary">
        <h2 className="sc-doc__heading" id="sc-summary">
          {DETAIL.summaryHeading}
        </h2>
        {call.summary && call.summary.trim() !== "" ? (
          <p className="sc-prose">{call.summary}</p>
        ) : (
          <p className="sc-absent">{NOT_PROVIDED}</p>
        )}
      </section>

      <section className="sc-doc" aria-labelledby="sc-analysis">
        <h2 className="sc-doc__heading" id="sc-analysis">
          {DETAIL.analysisHeading}
        </h2>
        {outcome ? <Analysis outcome={outcome} /> : <p className="sc-absent">{ANALYSIS_UNAVAILABLE}</p>}
      </section>

      <TransferSection call={call} />

      <LinkedRecords callId={call.callId} />
    </div>
  );
}

export default function CallLogDetail() {
  const params = useParams<{ id: string }>();
  const { data: me, isLoading: sessionLoading } = useSession();
  const detail = useRealCallDetail(params.id);
  const [announcement, setAnnouncement] = useState("");

  const retry = useCallback(() => {
    setAnnouncement(DETAIL.announceRetrying);
    void detail
      .refetch()
      .then((result) => {
        setAnnouncement(result.isError ? DETAIL.announceFailed : DETAIL.announceLoaded);
      })
      .catch(() => setAnnouncement(DETAIL.announceFailed));
  }, [detail]);

  if (sessionLoading) {
    return (
      <div className="sd-page sc-page--doc">
        <p className="sc-loading" role="status" aria-live="polite">
          {PAGE.sessionLoading}
        </p>
      </div>
    );
  }

  if (!me) return null;

  if (detail.isLoading) {
    return (
      <div className="sd-page sc-page--doc">
        <div className="sc-nav">
          <BackLink />
        </div>
        <p className="sc-loading" role="status" aria-live="polite">
          {DETAIL.loading}
        </p>
      </div>
    );
  }

  // A 404 arrives as a settled query with no data (see `isRecordMissing`), so
  // it is separated out before the read-failure branch: a record that is not
  // there is not a failure, and must not offer a Try again that cannot help.
  const missing = detail.isError && isRecordMissing(detail.error);

  if (detail.isError && !missing) {
    return (
      <div className="sd-page sc-page--doc sd-enter">
        <div className="sc-nav">
          <BackLink />
        </div>
        <p className="sd-sr" role="status" aria-live="polite">
          {announcement}
        </p>
        <div className="sc-error" role="alert">
          <h1 className="sc-error__title sc-error__title--h1">{DETAIL.errorTitle}</h1>
          <p className="sc-error__detail">{DETAIL.errorDetail}</p>
          <button type="button" className="sc-retry" onClick={retry} disabled={detail.isRefetching}>
            {detail.isRefetching ? DETAIL.retryPendingLabel : DETAIL.retryLabel}
          </button>
        </div>
      </div>
    );
  }

  const call = detail.data?.call;
  if (!call) {
    return (
      <div className="sd-page sc-page--doc sd-enter">
        <div className="sc-nav">
          <BackLink />
        </div>
        <div className="sc-empty sc-empty--notfound">
          <h1 className="sc-empty__title sc-empty__title--h1">{DETAIL.notFoundTitle}</h1>
          <p className="sc-empty__detail">{DETAIL.notFoundDetail}</p>
        </div>
      </div>
    );
  }

  return <Record call={call} />;
}
