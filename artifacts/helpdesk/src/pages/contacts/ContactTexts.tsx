/**
 * J4 — the texts between the business's voice number and one contact.
 *
 * Every outbound text says what actually happened to it (queued, sent,
 * delivered, not delivered, not sent and why); a caller's reply is shown as
 * they wrote it. Opening the thread marks the caller's texts as read. There
 * is deliberately no reply box: SiteMint does not send free-form texts from
 * the dashboard, and the page says so rather than implying it does.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useContactTexts } from "@/hooks/useContacts";
import { markContactTextsRead, type ContactText } from "@/lib/contactsApi";
import { InlineError } from "@/components/common/InlineError";
import { TEXTS, textStatusLabel } from "@/pages/contacts/contactsContract";

function formatAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

function Message({ m }: { m: ContactText }) {
  const outbound = m.direction === "out";
  const status = textStatusLabel(m);
  return (
    <li className="sd-list__item" data-direction={m.direction}>
      <div className="sd-row" style={{ display: "block" }}>
        <p className="text-sm text-muted-foreground">
          {outbound ? TEXTS.fromBusiness : TEXTS.fromCaller} · <time dateTime={m.at}>{formatAt(m.at)}</time>
          {m.unread && <strong> · {TEXTS.newLabel}</strong>}
        </p>
        <p className="whitespace-pre-wrap">{m.body}</p>
        {status && <p className={status.tone === "problem" ? "sc-absent" : "text-sm text-muted-foreground"}>{status.text}</p>}
      </div>
    </li>
  );
}

export function ContactTexts({ contactId }: { contactId: string }) {
  const query = useContactTexts(contactId);
  const qc = useQueryClient();
  const marked = useRef(false);

  // Opening the thread is what "read" means. Best-effort: a failure leaves the
  // texts marked new, which is the safe direction.
  useEffect(() => {
    if (marked.current || !query.data || query.data.unread === 0) return;
    marked.current = true;
    void markContactTextsRead(contactId)
      .then(() => qc.invalidateQueries({ queryKey: ["contacts"] }))
      .catch(() => {
        marked.current = false;
      });
  }, [contactId, query.data, qc]);

  return (
    <section className="sd-section" aria-labelledby="contact-texts-h">
      <h2 className="sd-h2" id="contact-texts-h">{TEXTS.heading}</h2>
      {query.isLoading ? (
        <p className="sd-sr" role="status" aria-live="polite">{TEXTS.loading}</p>
      ) : query.isError ? (
        <InlineError title={TEXTS.failedTitle} description={TEXTS.failed} onRetry={() => void query.refetch()} />
      ) : !query.data || query.data.items.length === 0 ? (
        <p className="sd-empty__detail">{TEXTS.empty}</p>
      ) : (
        <ul className="sd-list" aria-live="polite">
          {query.data.items.map((m, i) => (
            <Message key={`${m.at}-${m.direction}-${i}`} m={m} />
          ))}
        </ul>
      )}
      <p className="sc-note">{TEXTS.noReplyNote}</p>
    </section>
  );
}
