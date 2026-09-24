/**
 * Support — a request a business sends to SiteMint, with its state and thread.
 *
 * This used to be a contact card: an address and a promise. A customer could
 * not see that their request had arrived, what state it was in, or what was
 * said before. Requests are now recorded per business, keep a status, and can
 * be followed up or closed — and the screen still shows the email address, for
 * anyone who would rather write.
 *
 * What the screen refuses to claim: that somebody is reading it (only that
 * SiteMint holds it and owes a reply), that SiteMint's inbox was told when the
 * alert did not get through, and any promise about how quickly a reply comes.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import {
  closeSupportRequest,
  createSupportRequest,
  isSupportRequestError,
  listSupportRequests,
  readSupportRequest,
  replyToSupportRequest,
  type SupportRequest,
} from "@/lib/supportApi";
import {
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_COPY,
  SUPPORT_EMAIL,
  SUPPORT_STATUS,
  hasSupportFormErrors,
  sentMessage,
  supportMailto,
  validateSupportForm,
  type SupportCategoryKey,
  type SupportFormErrors,
  type SupportStatusKey,
} from "@/pages/support/supportContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-signin.css";

function whenText(iso: string): string {
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? at.toLocaleString() : "";
}

function StatusLine({ request }: { request: SupportRequest }): React.ReactElement {
  const status = SUPPORT_STATUS[request.status as SupportStatusKey] ?? SUPPORT_STATUS.open;
  return (
    <p className="sd-muted">
      <strong>{status.label}.</strong> {status.detail}
    </p>
  );
}

export default function Support() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<SupportCategoryKey>("question");
  const [errors, setErrors] = useState<SupportFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [reply, setReply] = useState("");

  const requests = useQuery({
    queryKey: ["support", "requests"],
    queryFn: listSupportRequests,
    retry: false,
  });

  const thread = useQuery({
    queryKey: ["support", "request", openId],
    queryFn: () => readSupportRequest(openId!),
    enabled: openId !== null,
    retry: false,
  });

  const send = useMutation({
    mutationFn: () => createSupportRequest({ subject: subject.trim(), body: body.trim(), category }),
    onSuccess: (result) => {
      setSubject("");
      setBody("");
      setErrors({});
      setFailure(null);
      // Said from what the server reported, never assumed.
      setSentNote(sentMessage(result.request.operatorNotified));
      setOpenId(result.request.id);
      void queryClient.invalidateQueries({ queryKey: ["support"] });
    },
    onError: (err) => {
      setSentNote(null);
      if (isSupportRequestError(err)) {
        const next: SupportFormErrors = {};
        for (const fieldError of err.fieldErrors) {
          if (fieldError.field === "subject") next.subject = fieldError.message;
          if (fieldError.field === "body") next.body = fieldError.message;
        }
        setErrors(next);
        setFailure(hasSupportFormErrors(next) ? null : err.message);
      } else {
        setFailure(SUPPORT_COPY.failedTitle);
      }
    },
  });

  const sendReply = useMutation({
    mutationFn: () => replyToSupportRequest(openId!, reply.trim()),
    onSuccess: () => {
      setReply("");
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ["support"] });
    },
    onError: (err) => setFailure(isSupportRequestError(err) ? err.message : SUPPORT_COPY.failedTitle),
  });

  const close = useMutation({
    mutationFn: () => closeSupportRequest(openId!),
    onSuccess: () => {
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ["support"] });
    },
    onError: (err) => setFailure(isSupportRequestError(err) ? err.message : SUPPORT_COPY.failedTitle),
  });

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    const found = validateSupportForm({ subject, body, category });
    setErrors(found);
    setSentNote(null);
    if (hasSupportFormErrors(found)) return;
    send.mutate();
  }

  const items = requests.data?.items ?? [];

  return (
    <div className="sd-page sd-enter">
      <PageHeader eyebrow="ACCOUNT" title={SUPPORT_COPY.heading} description={SUPPORT_COPY.description} />

      <section className="sd-subsection">
        <h2 className="sd-subsection__title">{SUPPORT_COPY.formTitle}</h2>
        <p className="sd-muted">{SUPPORT_COPY.formDetail}</p>

        <form className="si-form" onSubmit={submit} noValidate>
          <label className="si-label" htmlFor="support-subject">{SUPPORT_COPY.subjectLabel}</label>
          <input
            id="support-subject"
            className="si-input"
            value={subject}
            placeholder={SUPPORT_COPY.subjectPlaceholder}
            onChange={(e) => setSubject(e.target.value)}
            aria-invalid={errors.subject !== undefined}
            aria-describedby={errors.subject ? "support-subject-error" : undefined}
          />
          {errors.subject && <p className="sd-error__detail" id="support-subject-error" role="alert">{errors.subject}</p>}

          <label className="si-label" htmlFor="support-category">{SUPPORT_COPY.categoryLabel}</label>
          <select
            id="support-category"
            className="si-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategoryKey)}
          >
            {SUPPORT_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <label className="si-label" htmlFor="support-body">{SUPPORT_COPY.bodyLabel}</label>
          <textarea
            id="support-body"
            className="si-input"
            rows={5}
            value={body}
            placeholder={SUPPORT_COPY.bodyPlaceholder}
            onChange={(e) => setBody(e.target.value)}
            aria-invalid={errors.body !== undefined}
            aria-describedby={errors.body ? "support-body-error" : undefined}
          />
          {errors.body && <p className="sd-error__detail" id="support-body-error" role="alert">{errors.body}</p>}

          <Button type="submit" disabled={send.isPending}>
            {send.isPending ? SUPPORT_COPY.submitPending : SUPPORT_COPY.submit}
          </Button>
        </form>

        {sentNote !== null && (
          <div className="sd-note" role="status">
            <strong>{SUPPORT_COPY.sent}</strong>
            <p className="sd-muted">{sentNote}</p>
          </div>
        )}
        {failure !== null && (
          <div className="sd-error" role="alert">
            <div className="sd-error__body">
              <span className="sd-error__title">{SUPPORT_COPY.failedTitle}</span>
              <p className="sd-error__detail">{failure}</p>
            </div>
          </div>
        )}
      </section>

      <section className="sd-subsection">
        <h2 className="sd-subsection__title">{SUPPORT_COPY.listTitle}</h2>
        {requests.isLoading && <p className="sd-muted">{SUPPORT_COPY.loading}</p>}
        {requests.isError && <p className="sd-muted">{SUPPORT_COPY.loadFailed}</p>}
        {!requests.isLoading && !requests.isError && items.length === 0 && (
          <p className="sd-muted">{SUPPORT_COPY.listEmpty}</p>
        )}

        <ul className="sd-list">
          {items.map((request) => (
            <li key={request.id} className="sd-list__item">
              <button
                type="button"
                className="sd-link"
                aria-expanded={openId === request.id}
                onClick={() => { setOpenId(openId === request.id ? null : request.id); setReply(""); }}
              >
                #{request.id} · {request.subject}
              </button>
              <StatusLine request={request} />
              <p className="sd-muted">Last activity {whenText(request.lastMessageAt)}</p>

              {openId === request.id && (
                <div className="sd-subsection">
                  <h3 className="sd-subsection__title">{SUPPORT_COPY.threadTitle}</h3>
                  {thread.isLoading && <p className="sd-muted">{SUPPORT_COPY.loading}</p>}
                  {thread.isError && <p className="sd-muted">{SUPPORT_COPY.loadFailed}</p>}
                  {(thread.data?.messages ?? []).map((message) => (
                    <div key={message.id} className="sd-note">
                      <strong>{message.author === "business" ? SUPPORT_COPY.authorBusiness : SUPPORT_COPY.authorSiteMint}</strong>
                      <p className="sd-muted">{whenText(message.createdAt)}</p>
                      <p>{message.body}</p>
                    </div>
                  ))}

                  {/* si-form supplies the --v2-* properties the si-* field
                      styles read; without an ancestor carrying it, these
                      render with no border and no background. */}
                  <div className="si-form">
                    <label className="si-label" htmlFor={`support-reply-${request.id}`}>{SUPPORT_COPY.replyLabel}</label>
                    <textarea
                      id={`support-reply-${request.id}`}
                      className="si-input"
                      rows={3}
                      value={reply}
                      placeholder={SUPPORT_COPY.replyPlaceholder}
                      onChange={(e) => setReply(e.target.value)}
                    />
                  </div>
                  <Button type="button" onClick={() => sendReply.mutate()} disabled={sendReply.isPending || reply.trim() === ""}>
                    {sendReply.isPending ? SUPPORT_COPY.replyPending : SUPPORT_COPY.reply}
                  </Button>
                  {request.status !== "closed" && (
                    <Button type="button" variant="outline" onClick={() => close.mutate()} disabled={close.isPending}>
                      {close.isPending ? SUPPORT_COPY.closePending : SUPPORT_COPY.close}
                    </Button>
                  )}
                  <p className="sd-muted">{SUPPORT_COPY.reopenNote}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="sd-subsection">
        <p className="sd-muted">
          {SUPPORT_COPY.emailFallback.replace(SUPPORT_EMAIL, "")}
          <a href={supportMailto()} className="sd-link">{SUPPORT_EMAIL}</a>
        </p>
        <p>
          <Link href={ROUTES.issues} className="sd-link">{SUPPORT_COPY.issuesLink} &rarr;</Link>
        </p>
      </section>
    </div>
  );
}
