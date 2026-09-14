# E-signature — what we would need from a provider

**Status: DEFERRED, not done.** Nothing in this repository signs anything, and
nothing in it should be read as signing anything. This document exists so the
owner can choose a provider against a list of requirements rather than against
a sales page. It describes work that has **not** been started.

Written alongside M5 (quotes and invoices). Read with
`COMPLETENESS-2026-09-14.md` area 9, which records the same gap.

---

## 1. What the product does today, stated exactly

| Act | What is recorded | What it is not |
|---|---|---|
| A customer accepts a proposal in the portal | `crm_portal_proposal_acceptances`: the deal, a typed name, an IP, a timestamp, and a copy of the value and name **as they stood at that moment** | Not a signature |
| A customer accepts a quote in the portal | `crm_quotes.accepted_at` / `accepted_typed_name` / `accepted_from_ip` / `accepted_by_portal_account_id`, plus the deal it is bound to. The line items are frozen at `sent`, so what was agreed is recoverable | Not a signature |
| Staff record an acceptance taken by phone or email | The same columns, with `Recorded by <staff member>` in place of a typed name | Not a signature |
| Anyone uploads a file | `crm_attachments` + `crm_attachment_blobs`, with a sha256 of the bytes and an uploader label | Not a signature |

Every payload describing any of the above carries
`signatureStatus: "not_a_signature"` and `acceptanceIsNotASignature: true`,
from the single helper `portalSignatureDisclosure()` in
`lib/db/src/schema/crmPortal.ts`. The literal lives in one constant,
`PORTAL_NOT_A_SIGNATURE`, so no route can quietly start claiming something
stronger. `crmPortal.test.ts` and `crmBilling.test.ts` both scan whole response
bodies for the word family and fail on any occurrence that is not one of the
approved forms — including the rendered quote document itself.

**Why the distinction is worth this much machinery.** A typed name proves that
somebody who held a session typed a name. It does not establish *who* they
were (we verified an email address, once, at invitation time), it does not bind
the agreement to a specific immutable version of a document, and it produces no
evidence a third party would accept if the agreement were disputed. Calling it
a signature would be the CRM asserting something it cannot support, on the one
record where being wrong is most expensive.

---

## 2. What a provider has to give us

A provider is adequate for this product only if it supplies all five. They are
listed in the order they would be integrated.

### 2.1 Envelope creation from a document we generate

- Accept a document **we** produce, not one composed in the provider's editor.
  M5 renders quotes and invoices deterministically
  (`artifacts/api-server/src/routes/crmBilling.ts`), so the same quote produces
  the same bytes; the provider must sign *those* bytes.
- Accept one or more named signers with an email address and a role, and let us
  set the order when there is more than one.
- Return an envelope id we can store, and a signer-specific URL we can put in
  the portal (not one emailed by the provider under its own branding — the
  customer is already authenticated with us, and bouncing them out to a
  third-party email is where completion rates go to die).
- Support voiding an envelope, because a quote gets superseded.

**What we would store:** an `envelope_id`, a `provider`, a per-signer status,
and the sha256 of the bytes we submitted — so "what did they actually sign" is
answerable from our own database without asking the provider.

### 2.2 Webhook events, signed

- Events for at least: sent, delivered, viewed, signed/completed, declined,
  voided, expired.
- **Signed with a shared secret over the raw body**, verified before anything
  is recorded. This repo already does exactly this for Resend (svix), Stripe
  and Vapi, and `routeSecurity.manifest.ts` classifies such routes as
  `"signature"` — the signature *is* the credential. A provider that only
  offers unsigned callbacks, or IP allowlisting, is not acceptable.
- A replay window. The Vapi integration timestamps with **milliseconds** and an
  hour-old replay is refused; whatever the provider does, the timestamp
  semantics must be documented by them rather than inferred by us. That
  inference has already cost this project one production defect.
- Delivery retries, and an event id we can deduplicate on. We would write the
  event row first and drain it with a worker — the pattern
  `crm_automation_events` already uses — so a process that dies mid-handler
  does not lose the fact that a customer signed.

### 2.3 An audit trail we can retrieve and keep

- A per-envelope certificate or audit record listing, for each signer: identity
  presented, authentication method, IP, user agent, and the timestamp of every
  event.
- Retrievable as a file we can store in `crm_attachments` **beside** the signed
  document. A trail that only exists in the provider's web console is a trail
  we lose when the contract with the provider ends.
- The trail must be retrievable for the full retention period, and the provider
  must state that period.

### 2.4 Tamper-evidence

- The completed document must carry a cryptographic seal (a PAdES/CAdES-style
  digital signature, or the provider's own certificate chain) that can be
  validated **without** calling the provider's API.
- We must be able to re-verify a stored document years later against the
  original hash we recorded at submission.
- If the provider's only integrity claim is "it is in our database", the
  tamper-evidence requirement is not met.

### 2.5 Signer identity, at a stated level

- At minimum: possession of the email address the envelope was sent to.
- Preferably available as an option: SMS one-time code, or knowledge-based
  authentication, per envelope.
- Whatever level is used **must be recorded per envelope and surfaced in our
  UI**, because "signed" at email-only assurance and "signed" with SMS
  verification are different claims and must not be shown identically.

---

## 3. Legal and jurisdictional questions for the owner, not for engineering

These are decisions, not implementation details. None of them can be answered
by reading a provider's documentation.

1. Which regime the agreements must satisfy — ESIGN/UETA (US), eIDAS (EU), or
   both — and whether a **qualified** electronic signature is ever needed or
   whether a simple/advanced one is sufficient for web-build contracts.
2. Consent-to-electronic-records disclosure: the wording, and where it is shown
   before the first signature.
3. Retention period, and who holds the record of the agreement if the provider
   relationship ends.
4. Whether counter-signature by SiteMint is required, which makes the envelope
   multi-party and changes the flow.
5. Data residency, if any client requires it.

---

## 4. What the integration would touch

Scoped so the size of the change is visible before it is agreed. This is an
estimate of surface area, not a commitment or a schedule.

| Area | Change |
|---|---|
| Schema | One new table (envelopes) plus a nullable `envelope_id` on `crm_quotes`. Additive, push-mode, with reviewed DDL in `docs/crm-ops/schema/`, like `M5-billing.sql`. |
| Provider boundary | A `SignatureProvider` abstraction with the provider's SDK, URLs and credentials confined to one adapter — the shape `artifacts/api-server/src/lib/voice/` already uses, and for the same reason. |
| Routes | Create-envelope (staff, `deals.write`), a signed webhook (`"signature"` in the route-security manifest), and a portal route returning the signer URL. |
| Secrets | An API key (server-only) and a webhook signing secret. Both documented in `.env.example` and in the staging secret-name profile. |
| Flag | Default-off (`SIGNATURE_PROVIDER_ENABLED`), fail-closed, exactly like `VOICE_PUBLISH_ENABLED`. |
| The honesty machinery | `PORTAL_NOT_A_SIGNATURE` stops being universal: it stays the answer for uploads and for an acceptance taken without an envelope, and a **separate** status appears for a genuinely sealed document. The word "signed" may only ever be produced from a verified provider event — never from a local state change. |

---

## 5. Until then

Nothing changes. An accepted quote remains an agreement in writing, labelled as
such, with `not_a_signature` on every payload and on the rendered document.
Where a signed contract is genuinely required, it is produced and signed outside
this system and the resulting PDF is uploaded as an ordinary document — which is
what the business does today.
