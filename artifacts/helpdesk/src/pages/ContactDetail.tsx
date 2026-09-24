/**
 * V5 PR-8 — `/contacts/:id`: one contact, with linked calls and
 * conversations. Reads `GET /receptionist/contacts/:id`
 * (`useContactDetail`), which resolves `undefined` on a 404 exactly the way
 * `voiceCallsApi.fetchRealCallDetail` does, so "not found" and "read failed"
 * stay distinct states.
 */

import { Link, useParams } from "wouter";
import { useSession } from "@/hooks/useSession";
import { useContactDetail } from "@/hooks/useContacts";
import { InlineError } from "@/components/common/InlineError";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/lib/routes";
import {
  DETAIL,
  INQUIRIES,
  NAME_FROM_INQUIRY_NOTE,
  callSummaryLabel,
  conversationSummaryLabel,
  dispositionLabel,
  resolvedContactName,
  sourceLabel,
} from "@/pages/contacts/contactsContract";
import { relativeTime } from "@/lib/conversationUi";
import { ContactFormDialog } from "@/pages/contacts/ContactFormDialog";
import { ContactTexts } from "@/pages/contacts/ContactTexts";
import { FORM } from "@/pages/contacts/contactsContract";
import "@/styles/v2-dashboard.css";

function BackLink() {
  return (
    <Link href="/contacts" className="sd-link">
      <span aria-hidden="true">&larr;</span> {DETAIL.back}
    </Link>
  );
}

export default function ContactDetail() {
  const params = useParams<{ id: string }>();
  const { data: me, isLoading: sessionLoading } = useSession();
  const query = useContactDetail(params.id);

  if (sessionLoading) {
    return (
      <div className="sd-page">
        <p className="sd-sr" role="status" aria-live="polite">Checking your session…</p>
      </div>
    );
  }
  if (!me) return null;

  if (query.isLoading) {
    return (
      <div className="sd-page sd-enter">
        <div className="mb-4"><BackLink /></div>
        <p className="sd-sr" role="status" aria-live="polite">{DETAIL.loading}</p>
      </div>
    );
  }

  const missing = query.isError && (query.error as { status?: number } | undefined)?.status === 404;

  if (query.isError && !missing) {
    return (
      <div className="sd-page sd-enter">
        <div className="mb-4"><BackLink /></div>
        <InlineError title={DETAIL.errorTitle} description={DETAIL.errorDetail} onRetry={() => query.refetch()} />
      </div>
    );
  }

  const data = query.data;
  if (!data) {
    return (
      <div className="sd-page sd-enter">
        <div className="mb-4"><BackLink /></div>
        <div className="sd-empty">
          <h1 className="sd-empty__title">{DETAIL.notFoundTitle}</h1>
          <p className="sd-empty__detail">{DETAIL.notFoundDetail}</p>
        </div>
      </div>
    );
  }

  const { contact, calls, conversations } = data;
  // A contact with no stored name may still have given one on a call. That
  // name is quoted from a saved message, never inferred, and is labelled.
  const resolved = resolvedContactName(contact, data.callerNameFromInquiry);
  const inquiries = data.inquiries ?? [];

  return (
    <div className="sd-page sd-enter">
      <div className="mb-4"><BackLink /></div>

      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">ACTIVITY</span>
          <h1 className="sd-page__title">{resolved.name}</h1>
          <p className="sd-page__meta">{contact.phone}</p>
          {resolved.fromInquiry && <p className="sd-page__meta">{NAME_FROM_INQUIRY_NOTE}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {contact.optedOut && <Badge variant="outline">{DETAIL.optedOutLabel}: {DETAIL.optedOutTrue}</Badge>}
          <ContactFormDialog
            mode="edit"
            contactId={String(contact.id)}
            initial={{ name: contact.name, email: contact.email ?? null, notes: contact.notes ?? null }}
          />
        </div>
      </div>

      <dl className="sd-figures">
        <div className="sd-figure">
          <span className="sd-figure__value">{sourceLabel(contact.source)}</span>
          <span className="sd-figure__label">{DETAIL.sourceLabel}</span>
        </div>
        <div className="sd-figure">
          <span className="sd-figure__value" data-empty={!contact.lastInteractionAt ? "true" : "false"}>
            {contact.lastInteractionAt ? relativeTime(contact.lastInteractionAt) : "None yet"}
          </span>
          <span className="sd-figure__label">{DETAIL.lastInteractionLabel}</span>
        </div>
        <div className="sd-figure">
          <span className="sd-figure__value">{dispositionLabel(contact.disposition)}</span>
          <span className="sd-figure__label">{DETAIL.dispositionLabel}</span>
        </div>
        <div className="sd-figure">
          <span className="sd-figure__value" data-empty={!contact.nextAppointmentAt ? "true" : "false"}>
            {contact.nextAppointmentAt ? relativeTime(contact.nextAppointmentAt) : "None yet"}
          </span>
          <span className="sd-figure__label">{DETAIL.nextAppointmentLabel}</span>
        </div>
      </dl>

      <section className="sd-section" aria-labelledby="contact-about-h">
        <h2 className="sd-h2" id="contact-about-h">{FORM.detailsHeading}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted-foreground">{FORM.emailLabelDetail}</dt>
          <dd>{contact.email ? contact.email : FORM.none}</dd>
          <dt className="text-muted-foreground">{FORM.notesLabelDetail}</dt>
          <dd className="whitespace-pre-wrap">{contact.notes ? contact.notes : FORM.none}</dd>
        </dl>
      </section>

      <section className="sd-section" aria-labelledby="contact-calls-h">
        <h2 className="sd-h2" id="contact-calls-h">{DETAIL.callsHeading}</h2>
        {calls.length === 0 ? (
          <p className="sd-empty__detail">{DETAIL.callsEmpty}</p>
        ) : (
          <ul className="sd-list">
            {calls.map((call) => (
              <li className="sd-list__item" key={call.callId}>
                <Link href={`/logs/${encodeURIComponent(call.callId)}`} className="sd-row">
                  <span className="sd-row__who">{callSummaryLabel(call)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ContactTexts contactId={params.id} />

      {/* Reached through this contact's own calls by foreign key — a saved
          message matches on (firm, call id), never on a caller's name. */}
      <section className="sd-section" aria-labelledby="contact-inquiries-h">
        <h2 className="sd-h2" id="contact-inquiries-h">{INQUIRIES.heading}</h2>
        {inquiries.length === 0 ? (
          <p className="sd-empty__detail">{INQUIRIES.empty}</p>
        ) : (
          <ul className="sd-list">
            {inquiries.map((inquiry) => (
              <li className="sd-list__item" key={inquiry.id}>
                <Link href={ROUTES.inquiries} className="sd-row">
                  <span className="sd-row__who">{inquiry.topic}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sd-section" aria-labelledby="contact-convos-h">
        <h2 className="sd-h2" id="contact-convos-h">{DETAIL.conversationsHeading}</h2>
        {conversations.length === 0 ? (
          <p className="sd-empty__detail">{DETAIL.conversationsEmpty}</p>
        ) : (
          <ul className="sd-list">
            {conversations.map((conversation) => (
              <li className="sd-list__item" key={conversation.id}>
                <Link href="/conversations" className="sd-row">
                  <span className="sd-row__who">{conversationSummaryLabel(conversation)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
