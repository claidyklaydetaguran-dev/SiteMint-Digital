/**
 * AI Receptionist V5 — Request Beta Access form (§beta).
 *
 * All states: idle, inline validation, submitting, honeypot-silent (treated
 * as a no-op success, no request sent), 503 (flag off — points to the real
 * inbox), 429 (rate limited), network error, and success. Field names and
 * status handling come from `betaRequestContract.ts`, the pure module a
 * fresh reader should check first for the actual contract.
 */

import { useId, useRef, useState } from "react";
import {
  BETA_REQUEST_ENDPOINT,
  BETA_REQUEST_METHOD,
  BETA_REQUEST_NETWORK_ERROR,
  EMPTY_BETA_REQUEST_FORM,
  HONEYPOT_FIELD,
  buildBetaRequestPayload,
  isLikelyBot,
  mapBetaRequestError,
  validateBetaRequest,
  type BetaRequestFormValues,
} from "./betaRequestContract";
import { CONTACT_EMAIL } from "@/pages/receptionist-v5/sections";

type Status = "idle" | "submitting" | "error" | "success";

export function BetaRequestForm() {
  const [form, setForm] = useState<BetaRequestFormValues>(EMPTY_BETA_REQUEST_FORM);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formStartedAt = useRef(Date.now());

  const nameId = useId();
  const businessId = useId();
  const emailId = useId();
  const phoneId = useId();
  const messageId = useId();
  const honeypotId = useId();

  function set<K extends keyof BetaRequestFormValues>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const validation = validateBetaRequest(form);
    if (!validation.ok) {
      setFormError(validation.formError);
      setFieldErrors(validation.fieldErrors as Record<string, string>);
      setStatus("error");
      const el = validation.focusField && document.getElementById(fieldIdFor(validation.focusField));
      el?.focus();
      return;
    }

    setFormError("");
    setFieldErrors({});

    // Silent bot handling: a tripped honeypot or an implausibly fast fill
    // never reaches the network — the visitor still sees the success state.
    if (isLikelyBot(honeypot, formStartedAt.current, Date.now())) {
      setStatus("success");
      return;
    }

    setStatus("submitting");
    try {
      const payload = buildBetaRequestPayload(form, new Date(formStartedAt.current).toISOString());
      const res = await fetch(BETA_REQUEST_ENDPOINT, {
        method: BETA_REQUEST_METHOD,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 202) {
        setStatus("success");
        return;
      }
      let serverError: string | undefined;
      try {
        const body = (await res.json()) as { error?: string };
        serverError = body?.error;
      } catch {
        // no JSON body — fall through to the generic mapping
      }
      const mapped = mapBetaRequestError(res.status, serverError, CONTACT_EMAIL);
      setFormError(mapped.message);
      setStatus("error");
    } catch {
      setFormError(BETA_REQUEST_NETWORK_ERROR);
      setStatus("error");
    }
  }

  function fieldIdFor(key: keyof BetaRequestFormValues): string {
    return { name: nameId, businessName: businessId, workEmail: emailId, phone: phoneId, message: messageId }[key];
  }

  if (status === "success") {
    return (
      <div className="smv5-beta__success" role="status">
        <h3>Request received</h3>
        <p>Thanks — the SiteMint team will follow up by email to walk through onboarding.</p>
      </div>
    );
  }

  return (
    <form className="smv5-beta__form" onSubmit={submit} noValidate>
      {formError && (
        <p className="smv5-beta__error" role="alert">
          {formError}
        </p>
      )}

      <div className="smv5-field">
        <label htmlFor={nameId}>Your name</label>
        <input
          id={nameId}
          type="text"
          autoComplete="name"
          value={form.name}
          onChange={set("name")}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? `${nameId}-err` : undefined}
          required
        />
        {fieldErrors.name && (
          <p id={`${nameId}-err`} className="smv5-field__error">
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div className="smv5-field">
        <label htmlFor={businessId}>Business name</label>
        <input
          id={businessId}
          type="text"
          autoComplete="organization"
          value={form.businessName}
          onChange={set("businessName")}
          aria-invalid={Boolean(fieldErrors.businessName)}
          aria-describedby={fieldErrors.businessName ? `${businessId}-err` : undefined}
          required
        />
        {fieldErrors.businessName && (
          <p id={`${businessId}-err`} className="smv5-field__error">
            {fieldErrors.businessName}
          </p>
        )}
      </div>

      <div className="smv5-field">
        <label htmlFor={emailId}>Work email</label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          value={form.workEmail}
          onChange={set("workEmail")}
          aria-invalid={Boolean(fieldErrors.workEmail)}
          aria-describedby={fieldErrors.workEmail ? `${emailId}-err` : undefined}
          required
        />
        {fieldErrors.workEmail && (
          <p id={`${emailId}-err`} className="smv5-field__error">
            {fieldErrors.workEmail}
          </p>
        )}
      </div>

      <div className="smv5-field">
        <label htmlFor={phoneId}>Phone <span className="smv5-field__optional">Optional</span></label>
        <input id={phoneId} type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
      </div>

      <div className="smv5-field">
        <label htmlFor={messageId}>What should we know? <span className="smv5-field__optional">Optional</span></label>
        <textarea id={messageId} rows={3} value={form.message} onChange={set("message")} />
      </div>

      {/* Honeypot: visually hidden, never reachable by keyboard tab order, left blank by a human. */}
      <div className="smv5-honeypot" aria-hidden="true">
        <label htmlFor={honeypotId}>Company fax</label>
        <input
          id={honeypotId}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <button type="submit" className="smv5-btn smv5-btn--primary" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Request Beta Access"}
      </button>
    </form>
  );
}

export default BetaRequestForm;
