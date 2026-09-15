// R6/R7/R8 — the committed route-security manifest.
//
// Every mutating route (POST/PUT/PATCH/DELETE) the api-server exposes, with the
// protection class it is expected to keep. routeSecurity.test.ts re-derives this
// from source on every CI run and fails when the two disagree, so:
//   - a new mutating route cannot ship unclassified;
//   - an existing route cannot silently lose its guard;
//   - a new uncontrolled public writer cannot appear unnoticed.
//
// Generated from lib/routeSecurity.ts and reviewed by hand. To change it,
// change the route, re-run the test, and update the entry deliberately —
// never to make a red build green.

import type { Protection } from "./routeSecurity.js";

export const ROUTE_SECURITY_MANIFEST: Record<string, Protection> = {
  // ── M3: documents and the internal calendar ──────────────────────────────
  // All behind requireCrmAuth with a named permission.
  //
  // Note what is NOT here: `GET /api/crm/documents/shared/:token` is a read,
  // so it is outside this mutating-route contract. It is the one deliberately
  // unauthenticated document surface, and the token is its credential —
  // high-entropy, stored only as a sha256, expiring, download-counted and
  // revocable. See crmDocuments.ts.
  "POST /api/crm/documents": "admin",
  "DELETE /api/crm/documents/:id": "admin",
  "POST /api/crm/documents/:id/share": "admin",
  "POST /api/crm/documents/shares/:shareId/revoke": "admin",
  "POST /api/crm/document-requests": "admin",
  "PATCH /api/crm/document-requests/:id": "admin",

  // ── M5: quotes and invoices (routes/crmBilling.ts) ───────────────────────
  //
  // All behind requireCrmAuth with a named permission — `deals.write` for every
  // one of them, `deals.read` for the (non-mutating, therefore unlisted) reads.
  // They read "admin" while the legacy bearer fallback stands, like every other
  // CRM route.
  //
  // `deals.write` rather than `documents.write`, because a quote and an invoice
  // are sales records that happen to produce a document, not files that happen
  // to carry figures. The person allowed to change what the business is selling
  // is the person allowed to price it.
  //
  // Two of these deserve naming individually:
  //
  //   `.../invoices/:id/payments` writes a `crm_transactions` row with
  //   TRANSACTION_RECEIVED_STATUS. It is therefore a route that changes the
  //   "money received" figure on FOUR surfaces at once (Command Center,
  //   forecast, per-contact chain, customer portal), which is a heavier act
  //   than its neighbours and is audited with the transaction id. It is also
  //   strictly tighter than the older `POST /api/crm/deals/:id/transactions/
  //   manual`, which asserts no permission at all.
  //
  //   `.../quotes/:id/send` and `.../invoices/:id/issue` write into
  //   `crm_attachments` AND grant the customer sight of the result. Nothing is
  //   emailed by either — that line stays at `communications.send`.
  "POST /api/crm/quotes": "admin",
  "PATCH /api/crm/quotes/:id": "admin",
  "POST /api/crm/quotes/:id/send": "admin",
  "POST /api/crm/quotes/:id/status": "admin",
  "POST /api/crm/invoices": "admin",
  "PATCH /api/crm/invoices/:id": "admin",
  "POST /api/crm/invoices/:id/issue": "admin",
  "POST /api/crm/invoices/:id/payments": "admin",
  "POST /api/crm/invoices/:id/void": "admin",

  // ── The inbox ───────────────────────────────────────────────────────────
  // Read position records which conversations a person has opened; it sends
  // nothing, and the worst a caller can do is clear their own badge. Assign,
  // status and attach are heavier — they change who is answerable for a
  // customer, or which contact a conversation belongs to — and each is
  // audited.
  "POST /api/crm/inbox/conversations/:id/read": "admin",
  "POST /api/crm/inbox/conversations/:id/unread": "admin",
  "POST /api/crm/inbox/read": "admin",
  "POST /api/crm/inbox/conversations/:id/assign": "admin",
  "PATCH /api/crm/inbox/conversations/:id": "admin",
  "POST /api/crm/inbox/conversations/:id/attach": "admin",
  "PUT /api/crm/inbox/conversations/:id/draft": "admin",
  "DELETE /api/crm/inbox/conversations/:id/draft": "admin",
  "POST /api/crm/inbox/backfill": "admin",

  // ── Inbound email ───────────────────────────────────────────────────────
  // The webhook is authenticated by its svix signature, not by a session —
  // the signature IS the credential, and it is verified against the raw body
  // before anything is recorded. The operator surfaces are permission-gated;
  // releasing a suppression additionally requires settings.write, because
  // mailing somebody who reported us as spam affects every client.
  "POST /api/crm/webhooks/resend/inbound": "signature",
  "POST /api/crm/email/unmatched/:id/attach": "admin",
  "POST /api/crm/email/unmatched/:id/discard": "admin",
  "POST /api/crm/email/suppressions": "admin",
  "POST /api/crm/email/suppressions/release": "admin",
  "POST /api/crm/email/inbound/events/:id/retry": "admin",

  // ── Delivery and engagement events (routes/crmEmailEvents.ts) ───────────
  // The webhook carries its own credential: a Svix signature over the raw
  // body, verified before a row is written (lib/svixSignature.ts). Re-running
  // the interpretation of an already-verified event is an operator action and
  // is permission-gated — it can change a record's delivery state, so it is
  // `settings.write` rather than a read.
  "POST /api/crm/email/events/:id/retry": "admin",

  // ── The sales chain ─────────────────────────────────────────────────────
  // Closing and converting a deal both change what the business believes it
  // has sold, so both are permission-gated and audited. Conversion is
  // idempotent on crm_deals.converted_project_id.
  "POST /api/crm/deals/:id/close": "admin",
  "POST /api/crm/deals/:id/convert": "admin",
  "POST /api/crm/deals/:id/owner": "admin",
  "POST /api/crm/deals/:id/probability": "admin",
  "POST /api/crm/appointments": "admin",
  "PATCH /api/crm/appointments/:id": "admin",
  "DELETE /api/crm/appointments/:id": "admin",
  // Re-sends the current revision to every attendee. It contacts people
  // outside the company, so it carries the same `tasks.write` grant as the
  // booking itself — never a lesser one.
  "POST /api/crm/appointments/:id/invitations": "admin",

  // ── M4: Support (routes/crmSupport.ts) ───────────────────────────────────
  // All behind requireCrmAuth with a named permission — support.write for the
  // ticket and thread writes, support.assign for ownership, kb.write for the
  // knowledge base — so they read "admin" while the legacy bearer fallback
  // stands.
  //
  // Two of these carry a SECOND check inside the handler, and the difference
  // matters. `.../messages` asserts `communications.send` before it will record
  // a customer-visible reply, because contacting a client is a different act
  // from writing a note to yourself, and that boundary must already be right on
  // the day delivery is wired in. `POST /api/crm/support/tickets` asserts
  // `support.assign` when the create body also names an assignee, so creation
  // cannot be used to hand somebody work you are not allowed to hand them.
  //
  // Support DOES now email the client. It used to only record a reply, and
  // this note used to say so; leaving that standing would have understated
  // what these routes can do. A customer-visible message is handed to the mail
  // provider, and the three delivery routes below move real mail — a retry, a
  // deliberate duplicate, or an acknowledgement of an unknown outcome — so
  // they sit at the same level as the reminder-delivery recovery they mirror.
  // Each additionally asserts communications.send and requires a reason.
  "POST /api/crm/support/messages/:id/delivery-recovery": "admin",
  "POST /api/crm/support/deliveries/process": "admin",
  "POST /api/crm/support/inbound/ingest": "admin",

  // ── M4 Workflow automation ────────────────────────────────────────────
  //
  // Authoring a rule is an administrative act: a rule assigns work, creates
  // tasks and notifies people on its own afterwards, so writing one is more
  // consequential than any single record edit it performs. Running one by
  // hand is the same act done once, and it goes through the same brakes as
  // an automatic run rather than around them.
  //
  // Deciding an approval is gated by IDENTITY rather than permission — an
  // owner is refused on an approval addressed to somebody else — which the
  // route enforces and `crmAutomation.test.ts` asserts. "admin" here is the
  // floor, not the whole check.
  "POST /api/crm/automation/rules": "admin",
  "PATCH /api/crm/automation/rules/:id": "admin",
  "DELETE /api/crm/automation/rules/:id": "admin",
  "POST /api/crm/automation/rules/:id/run": "admin",
  "POST /api/crm/automation/approvals/:id/decide": "admin",

  // ── M6 Automation failure recovery ────────────────────────────────────
  //
  // The two verbs an operator has over an automation that did not happen, and
  // they are not the same act. `retry` re-runs it and is OFFERED ONLY where
  // re-running cannot repeat a side effect — never for a run whose step came
  // back unknown, never for one a loop brake stopped, never for anything a
  // worker will attempt by itself — and the refusal says which. `acknowledge`
  // records that a person decided nothing more is needed and re-runs nothing.
  // Both require `settings.write` and a reason, and both write a
  // `crm_automation_recovery_actions` row with the person on it; the listing
  // and detail reads beside them need only `settings.read`, because seeing why
  // an automation did not happen is not the authority to make it happen.
  "POST /api/crm/automation/failures/:kind/:id/retry": "admin",
  "POST /api/crm/automation/failures/:kind/:id/acknowledge": "admin",

  "POST /api/crm/support/tickets": "admin",
  "POST /api/crm/support/service-requests": "admin",
  "POST /api/crm/support/tickets/:id/assign": "admin",
  "POST /api/crm/support/tickets/:id/priority": "admin",
  "POST /api/crm/support/tickets/:id/status": "admin",
  "POST /api/crm/support/tickets/:id/messages": "admin",
  "POST /api/crm/support/tickets/:id/customer-messages": "admin",
  "POST /api/crm/support/tickets/:id/article": "admin",
  "POST /api/crm/support/kb": "admin",
  "PATCH /api/crm/support/kb/:id": "admin",
  "POST /api/crm/support/kb/:id/publish": "admin",

  // ── M4: Marketing (routes/crmMarketing.ts) ───────────────────────────────
  // All behind requireCrmAuth with a named permission, so they read "admin"
  // while the legacy bearer fallback stands. The permission is NOT uniform,
  // and the split is the point:
  //
  //   campaigns.write  writes copy, audiences and templates, and approves an
  //                    AI draft. None of it reaches a customer.
  //   campaigns.send   schedules, sends, pauses, resumes, cancels, and tests.
  //                    This is the line between composing a message and
  //                    putting it in somebody's inbox, and `campaigns.send` is
  //                    deliberately absent from the operations_manager role —
  //                    bulk customer contact is granted per person by the
  //                    owner.
  //
  // `POST /crm/marketing/segments/preview` is a POST that writes nothing: a
  // segment definition is too large and too structured for a query string.
  // It still requires campaigns.read.
  //
  // `POST /crm/marketing/unsubscribe` writes to the SHARED suppression list
  // (`crm_email_suppressions`), which is why it is here and not treated as a
  // marketing-local record.
  "POST /api/crm/marketing/segments": "admin",
  "POST /api/crm/marketing/segments/preview": "admin",
  // M5. `audience/preview` is the same idea for an audience built inline while
  // composing a campaign — the flow no longer forces somebody to save a segment
  // before they can see who they are writing to. It writes nothing and requires
  // campaigns.read, exactly like the segment preview above.
  //
  // `duplicate` creates a new campaign from an existing one, so it is a write
  // and takes campaigns.write. It deliberately does NOT copy the sent state:
  // a duplicate starts as a draft, or duplicating a completed campaign would
  // hand somebody something that looks ready to go out again.
  "POST /api/crm/marketing/audience/preview": "admin",
  "POST /api/crm/marketing/campaigns/:id/duplicate": "admin",
  "PATCH /api/crm/marketing/segments/:id": "admin",
  "DELETE /api/crm/marketing/segments/:id": "admin",
  "POST /api/crm/marketing/designs": "admin",
  "PATCH /api/crm/marketing/designs/:id": "admin",
  "DELETE /api/crm/marketing/designs/:id": "admin",
  "POST /api/crm/marketing/campaigns": "admin",
  "PATCH /api/crm/marketing/campaigns/:id": "admin",
  "POST /api/crm/marketing/campaigns/:id/exclusions": "admin",
  "DELETE /api/crm/marketing/campaigns/:id/exclusions/:leadId": "admin",
  "POST /api/crm/marketing/campaigns/:id/test-send": "admin",
  "POST /api/crm/marketing/campaigns/:id/schedule": "admin",
  "POST /api/crm/marketing/campaigns/:id/send": "admin",
  "POST /api/crm/marketing/campaigns/:id/pause": "admin",
  "POST /api/crm/marketing/campaigns/:id/resume": "admin",
  "POST /api/crm/marketing/campaigns/:id/cancel": "admin",
  // `retry` re-attempts, once each, only recipients the mail provider refused or
  // did not take — never one whose outcome is unknown — under the original
  // idempotency key. It puts mail in customers' inboxes, so campaigns.send.
  "POST /api/crm/marketing/campaigns/:id/retry": "admin",
  "POST /api/crm/marketing/campaigns/:id/ai-draft": "admin",
  "POST /api/crm/marketing/campaigns/:id/ai-draft/approve": "admin",
  "POST /api/crm/marketing/unsubscribe": "admin",

  // ── M4: Customer portal (routes/crmPortal.ts) ────────────────────────────
  // Two families, and the split is the security model rather than a naming
  // convention.
  //
  // `/api/crm/portal/*` are STAFF routes: requireCrmAuth with a named
  // permission, audited. They grant and revoke a customer's access and decide
  // which documents that customer may see. They read "admin" while the legacy
  // bearer fallback stands, like every other CRM route.
  //
  // `/api/portal/*` are CUSTOMER routes and carry a THIRD protection class,
  // "portal": the `crm_portal_session` cookie, its own CSRF header, and a
  // session that resolves to exactly ONE `crm_leads` row. It is deliberately
  // not "session" — that class means the receptionist product's firm-scoped
  // cookie, and conflating a customer of this agency with a customer of that
  // product is precisely the confusion this contract exists to prevent. A
  // portal holder cannot reach any route above: those resolve
  // `crm_staff_session`, which a customer does not have.
  //
  // The two open-by-necessity entries are the way in, and each is proven by
  // something the caller presents:
  //   accept → a single-use, expiring, hashed, revocable invitation token
  //            ("token-proven", via `acceptInvitation`)
  //   login  → the account's own password ("credential", via `verifyPassword`)
  "POST /api/crm/portal/invitations": "admin",
  "POST /api/crm/portal/invitations/:id/revoke": "admin",
  "POST /api/crm/portal/accounts/:leadId/revoke": "admin",
  "POST /api/crm/portal/document-grants": "admin",
  "DELETE /api/crm/portal/document-grants/:id": "admin",
  "POST /api/portal/invitations/accept": "token-proven",
  "POST /api/portal/login": "credential",
  "POST /api/portal/logout": "portal",
  "POST /api/portal/documents": "portal",
  "POST /api/portal/proposals/:dealId/accept": "portal",
  // M5. The same act as the line above, on the itemised document: a customer
  // accepting a quote. It is "portal" for the same reason, and it records the
  // same thing — `PORTAL_NOT_A_SIGNATURE`, never a signature. The quote's own
  // state machine and a `crm_quotes` check constraint additionally refuse an
  // acceptance that is not bound to a deal.
  "POST /api/portal/quotes/:id/accept": "portal",
  "POST /api/portal/tickets": "portal",
  "POST /api/portal/tickets/:id/messages": "portal",

  // ── M2: Operations, My Day, reminders (routes/crmOperations.ts) ───────────
  // All behind requireCrmAuth with a named permission, so they read "admin"
  // while the legacy bearer fallback stands.
  "POST /api/crm/operations/tasks": "admin",
  "PATCH /api/crm/operations/tasks/:id": "admin",
  "PATCH /api/crm/operations/projects/:id": "admin",
  "POST /api/crm/operations/projects/:id/milestones": "admin",
  "PATCH /api/crm/operations/milestones/:id": "admin",
  "POST /api/crm/operations/projects/:id/updates": "admin",
  "POST /api/crm/operations/comments": "admin",
  "POST /api/crm/operations/approvals": "admin",
  "POST /api/crm/operations/approvals/:id/decide": "admin",
  "POST /api/crm/operations/templates": "admin",
  "POST /api/crm/operations/projects/:id/apply-template": "admin",
  "POST /api/crm/notifications/read": "admin",
  "PATCH /api/crm/operations/reminder-preferences": "admin",
  "POST /api/crm/operations/jobs/run": "admin",
  "POST /api/crm/operations/jobs/:id/retry": "admin",

  // ── M4: reminder delivery recovery ───────────────────────────────────────
  // All three require settings.write, because all three decide what a person
  // outside this system does or does not receive. `resend` additionally
  // requires an explicit confirmation in the body — it is the one that can put
  // a second copy in somebody's inbox — and every one of them writes a
  // crm_delivery_recovery_actions row naming the actor and the reason.
  "POST /api/crm/operations/deliveries/:id/retry": "admin",
  "POST /api/crm/operations/deliveries/:id/resend": "admin",
  "POST /api/crm/operations/deliveries/:id/acknowledge": "admin",

  // ── M1: staff identity and authentication (routes/crmStaff.ts) ────────────
  // "staff" = crm_staff_session cookie + CSRF header + permission grant.
  // "credential" = a secret presented in the request itself (the deployment's
  // ADMIN_PASSWORD, a staff password, or a TOTP/recovery code).
  // "token-proven" = a single-use, expiring invite or reset token.
  "POST /api/crm/staff/bootstrap": "credential",
  "POST /api/crm/staff/recovery": "credential",
  "POST /api/crm/staff/login": "credential",
  "POST /api/crm/staff/login/mfa": "credential",
  "POST /api/crm/staff/activation": "token-proven",
  "POST /api/crm/staff/password-reset": "token-proven",
  "POST /api/crm/staff/logout": "staff",
  "PATCH /api/crm/staff/me": "staff",
  "DELETE /api/crm/staff/me/sessions/:id": "staff",
  "POST /api/crm/staff/me/sessions/revoke-all": "staff",
  "POST /api/crm/staff/me/mfa/start": "staff",
  // These three are step-up routes: `requireStaff()` in the chain AND a fresh
  // password / TOTP code in the body. detectProtection returns both classes
  // and the manifest records one, so they read as "credential" — the stronger
  // statement. crmStaffContract.test.ts separately pins that each still
  // carries requireStaff, so the session guard cannot vanish unnoticed.
  "POST /api/crm/staff/me/password": "credential",
  "POST /api/crm/staff/me/mfa/confirm": "credential",
  "POST /api/crm/staff/me/mfa/disable": "credential",
  "POST /api/crm/staff": "staff",
  "POST /api/crm/staff/:id/invite": "staff",
  "PATCH /api/crm/staff/:id": "staff",
  "POST /api/crm/staff/:id/password-reset": "staff",

  // ── M6: lead owners resolved to staff (routes/crmLeadAssignment.ts) ───────
  // "staff", not "admin": the route is requireStaff("staff.read") — the gate
  // PATCH /crm/staff/:id uses, because it appends the mapped name to a staff
  // record's legacy_names — and asserts leads.write in the handler for the
  // other half of what it does, a bulk update of contacts. The legacy shared
  // bearer is refused on purpose: every decision is recorded against the
  // person who made it (crm_lead_owner_mappings.decided_by_staff_id, and the
  // audit log).
  //
  // Not listed, because this contract covers mutating routes only:
  // `GET /api/crm/lead-assignment/unresolved` is a leads.read read.
  "POST /api/crm/lead-assignment/map": "staff",

  // ── M6: contact import and duplicate review (routes/crmContacts.ts) ───────
  // All behind requireCrmAuth with a named permission.
  //
  // `preview` writes nothing — it exists so the operator sees what an import
  // would do before it does it — but it still reads the whole contact book to
  // decide, so it is gated exactly as the commit is rather than left open as
  // "only a preview".
  //
  // `merge` carries `leads.write`, not `leads.delete`, and that is correct
  // BECAUSE a merge deletes nothing: the merged-away contact row is retained
  // and recorded in crm_contact_merges, and the contact list hides it with a
  // NOT EXISTS join. If a merge ever starts deleting the losing row it becomes
  // an owner-only act and this entry has to change with it.
  //
  // Not listed, because this contract covers mutating routes only:
  // `GET /api/crm/contacts/export.csv` is a read — but it is bulk egress of
  // customer data, so it is the one contact route gated on `data.export`
  // (owner and technical_admin), and every call is audited with its row count.
  "POST /api/crm/contacts/import/preview": "admin",
  "POST /api/crm/contacts/import/commit": "admin",
  "POST /api/crm/contacts/duplicates/dismiss": "admin",
  "POST /api/crm/contacts/duplicates/merge": "admin",

  "DELETE /api/crm/campaigns/:id": "admin",
  "DELETE /api/crm/campaigns/:id/steps/:stepId": "admin",
  "DELETE /api/crm/campaigns/queue/:messageId": "admin",
  "DELETE /api/crm/deals/:id": "admin",
  "DELETE /api/crm/discovery-submissions/:id": "admin",
  "DELETE /api/crm/email-templates/:id": "admin",
  "DELETE /api/crm/leads/:id": "admin",
  "DELETE /api/crm/leads/:id/behavioral-events/:eventId": "admin",
  "DELETE /api/crm/projects/:id": "admin",
  "DELETE /api/crm/projects/:id/tasks/:taskId": "admin",
  "DELETE /api/crm/tasks/:id": "admin",
  "DELETE /api/receptionist/account/members/:id": "session",
  "DELETE /api/receptionist/calendar/connection": "session",
  "DELETE /api/receptionist/voice/assistants/:id": "session",
  "DELETE /api/receptionist/voice/calls/:callId/review": "session",
  "DELETE /api/receptionist/voice/transfer-contacts/:id": "session",
  "DELETE /api/receptionist/voice/transfer-destinations/:id": "session",
  "PATCH /api/admin/form-submissions/:id": "admin",
  "PATCH /api/admin/submissions/:id": "admin",
  "PATCH /api/crm/campaigns/:id": "admin",
  "PATCH /api/crm/campaigns/:id/recipients/:rid/status": "admin",
  "PATCH /api/crm/campaigns/:id/steps/:stepId": "admin",
  "PATCH /api/crm/campaigns/queue/:messageId": "admin",
  "PATCH /api/crm/deals/:id": "admin",
  "PATCH /api/crm/discovery-submissions/:id": "admin",
  "PATCH /api/crm/leads/:id": "admin",
  "PATCH /api/crm/leads/:id/proposal": "admin",
  "PATCH /api/crm/leads/:id/sms-consent": "admin",
  "PATCH /api/crm/leads/:id/sow": "admin",
  "PATCH /api/crm/projects/:id": "admin",
  "PATCH /api/crm/projects/:id/tasks/:taskId": "admin",
  "PATCH /api/crm/tasks/:id": "admin",
  "PATCH /api/helpdesk/contacts/:id": "admin",
  "PATCH /api/helpdesk/tickets/:id": "admin",
  // Session AND the current password: the address is the login identity, so a
  // borrowed session alone must not be able to take the account over.
  "PATCH /api/receptionist/account/email": "session",
  // Business name, trade and timezone. Session only — unlike the address
  // above, none of these is the login identity, so changing one cannot take
  // the account over.
  "PATCH /api/receptionist/account/profile": "session",
  "PATCH /api/receptionist/agent-config": "session",
  "PATCH /api/receptionist/voice/assistants/:id": "session",
  "PATCH /api/receptionist/voice/messages/:id": "session",
  "PATCH /api/receptionist/voice/transfer-contacts/:id": "session",
  "PATCH /api/receptionist/voice/transfer-destinations/:id": "session",
  "POST /api/admin/login": "credential",
  "POST /api/admin/logout": "admin",
  "POST /api/admin/submissions/:id/proposal": "admin",
  "POST /api/admin/submissions/:id/sow": "admin",
  "POST /api/admin/voice/invites": "admin",
  "PATCH /api/admin/voice/beta-requests/:id": "admin",
  // Receptionist Ops (adminVoiceIssues.ts): requireOperator("settings.write") —
  // the grant for acknowledging any operational failure — behind the
  // admin_session-cookie fallback this route already accepted, which a live
  // staff session never reaches. "admin" while the legacy bearer stands.
  // The invite and beta-request routes above use the same gate
  // (settings.write for their mutations).
  "POST /api/admin/voice/issues/:id/resolve": "admin",
  "POST /api/ai-toolkit/checkout": "feature-flag",
  "POST /api/contact/submit": "feature-flag",
  "POST /api/crm/campaigns": "admin",
  "POST /api/crm/campaigns/:id/enroll": "admin",
  "POST /api/crm/campaigns/:id/recipients": "admin",
  "POST /api/crm/campaigns/:id/recipients/:recipientId/resend": "admin",
  "POST /api/crm/campaigns/:id/send": "admin",
  "POST /api/crm/campaigns/:id/steps": "admin",
  "POST /api/crm/campaigns/:id/test-send": "admin",
  "POST /api/crm/campaigns/ai-generate": "admin",
  "POST /api/crm/campaigns/copilot/generate": "admin",
  "POST /api/crm/campaigns/leads/:leadId/reschedule": "admin",
  "POST /api/crm/campaigns/queue/:messageId/send-now": "admin",
  "POST /api/crm/campaigns/scheduler/run": "admin",
  "POST /api/crm/campaigns/test-send": "admin",
  "POST /api/crm/deals": "admin",
  "POST /api/crm/deals/:id/transactions/manual": "admin",
  "POST /api/crm/deals/:id/transactions/stripe-checkout": "admin",
  "POST /api/crm/discovery-submissions": "admin",
  "POST /api/crm/discovery-submissions/:id/convert-to-project": "admin",
  "POST /api/crm/discovery-submissions/:id/generate-proposal": "admin",
  "POST /api/crm/email-templates": "admin",
  "POST /api/crm/import": "admin",
  "POST /api/crm/import-discovery": "admin",
  "POST /api/crm/import-discovery/:id": "admin",
  "POST /api/crm/leads": "admin",
  "POST /api/crm/leads/:id/activities": "admin",
  "POST /api/crm/leads/:id/behavioral-events": "admin",
  "POST /api/crm/leads/:id/call": "admin",
  "POST /api/crm/leads/:id/email": "admin",
  "POST /api/crm/leads/:id/notes": "admin",
  "POST /api/crm/leads/:id/proposal/generate": "admin",
  "POST /api/crm/leads/:id/sms": "admin",
  "POST /api/crm/leads/:id/sow/generate": "admin",
  "POST /api/crm/leads/:id/tasks": "admin",
  "POST /api/crm/phone/normalize": "admin",
  "POST /api/crm/phone/test-sms": "admin",
  "POST /api/crm/projects": "admin",
  "POST /api/crm/projects/:id/tasks": "admin",
  "POST /api/crm/webhooks/resend": "signature",
  "POST /api/crm/webhooks/twilio/sms": "signature",
  "POST /api/crm/webhooks/twilio/sms/status": "signature",
  "POST /api/crm/webhooks/twilio/voice": "signature",
  "POST /api/crm/webhooks/twilio/voice/bridge": "signature",
  "POST /api/crm/webhooks/twilio/voice/status": "signature",
  "POST /api/discovery/submit": "feature-flag",
  "POST /api/helpdesk/contacts": "admin",
  "POST /api/helpdesk/tickets": "admin",
  "POST /api/helpdesk/tickets/:ticketId/messages": "admin",
  "POST /api/intake/sms-webhook": "signature",
  "POST /api/landing-test/submit": "feature-flag",
  "POST /api/landing-test/view": "feature-flag",
  "POST /api/public/beta-requests": "feature-flag",
  "POST /api/public/demo/session": "feature-flag",
  "POST /api/public/schedule/:slug/requests": "feature-flag",
  // Operator-only telephone stock. A business can never name a number it does
  // not hold: assignment takes an explicit firm id behind
  // requireOperator("integrations.manage") — never a customer session.
  "POST /api/admin/voice/phone-numbers/:providerNumberId/assign": "admin",
  "POST /api/admin/voice/phone-numbers/:providerNumberId/release": "admin",
  "POST /api/receptionist/account/members": "session",
  "POST /api/receptionist/account/members/accept": "token-proven",
  "POST /api/receptionist/account/password-reset/complete": "token-proven",
  "POST /api/receptionist/account/password-reset/request": "feature-flag",
  "POST /api/receptionist/account/verify-email/confirm": "token-proven",
  "POST /api/receptionist/account/verify-email/request": "session",
  "POST /api/receptionist/auth/invite-signup": "feature-flag",
  "POST /api/receptionist/auth/login": "credential",
  "POST /api/receptionist/auth/logout": "session",
  "POST /api/receptionist/auth/signup": "feature-flag",
  "POST /api/receptionist/availability/hold": "session",
  "POST /api/receptionist/availability/requests": "session",
  "POST /api/receptionist/availability/requests/:publicId/cancel": "session",
  "POST /api/receptionist/billing/create-checkout-session": "session",
  "POST /api/receptionist/billing/webhook": "signature",
  "POST /api/receptionist/calendar/google/start": "session",
  "POST /api/receptionist/calendar/reconcile": "session",
  "POST /api/receptionist/calendar/requests/:publicId/approve": "session",
  "POST /api/receptionist/calendar/requests/:publicId/cancel": "session",
  "POST /api/receptionist/calendar/requests/:publicId/reschedule": "session",
  "POST /api/receptionist/voice/assistants": "session",
  "POST /api/receptionist/voice/assistants/:id/duplicate": "session",
  "POST /api/receptionist/voice/assistants/:id/publish": "session",
  "POST /api/receptionist/voice/assistants/:id/sync": "session",
  "POST /api/receptionist/voice/transfer-contacts": "session",
  "POST /api/receptionist/voice/transfer-contacts/:id/test": "session",
  "POST /api/receptionist/voice/issues/:id/resolve": "session",
  "POST /api/receptionist/voice/numbers/:id/assign": "session",
  "POST /api/receptionist/voice/numbers/:id/pause": "session",
  "POST /api/receptionist/voice/numbers/:id/unpause": "session",
  "POST /api/receptionist/voice/transfer-destinations": "session",
  "POST /api/stripe/webhook": "signature",
  "POST /api/v1/discovery-submissions": "feature-flag",
  "POST /api/voice/billing/webhook": "signature",
  "POST /api/voice/sms/inbound": "signature",
  "POST /api/voice/sms/status": "signature",
  "POST /api/voice/webhooks/vapi": "signature",
  // Receptionist Ops (adminVoiceDiagnostics.ts): requireOperator("billing.manage").
  // It sets a firm's plan, subscription state and the firm↔Stripe mapping that
  // billing events attach by, so it is OWNER_ONLY — no per-person grant can hand
  // it to anyone else. The shared admin reaches it by bearer or by its
  // persistent admin_session cookie (the same identity, surviving a restart).
  // "admin" while the legacy bearer stands.
  "PUT /api/admin/voice/firms/:id/subscription": "admin",
  "PUT /api/crm/email-templates/:id": "admin",
  // Which calendar future appointments are written to. Validated against the
  // live list, so a session cannot name a calendar the account does not have.
  "PUT /api/receptionist/calendar/selection": "session",
  "PUT /api/receptionist/availability/config": "session",
  "PUT /api/receptionist/availability/public-link": "session",
  "PUT /api/receptionist/onboarding": "session",
  "PUT /api/receptionist/voice/calls/:callId/review": "session",
};

/**
 * Routes deliberately reachable without authentication AND proven incapable of
 * persisting data or initiating an external action.
 *
 * The bar is deliberately high: an entry must have no detectable side effect in
 * its own source *and* must not delegate to an imported function, because a
 * source scan cannot see across a module boundary. A route that fails either
 * check cannot be called safe and does not belong here.
 *
 * EMPTY as of R8. The two exception lists are kept — not deleted — precisely so
 * that emptiness is an asserted fact rather than an absent mechanism. Deleting
 * them would make the count zero by construction and prove nothing.
 */
export const KNOWN_OPEN_ROUTES: Record<string, string> = {};

/**
 * Unauthenticated mutating routes that DO persist data or take an external
 * action and remain open because closing them has not been authorized.
 *
 * EMPTY as of R8: every public writer is now behind a default-off capability
 * flag. R7 closed the public booking writer; R8 closed password-reset
 * initiation, which persisted a token row, wrote an audit row and sent mail.
 *
 * If an entry ever reappears here it must state precisely what the route does,
 * so the decision to gate it can be made on evidence rather than a route name.
 * Rate limiting is never a reason to sit here instead of behind a flag —
 * limiters and honeypots bound abuse, they do not control access. Treating them
 * as guards is what let the AR-002B-R5 inventory miss the scheduling writer.
 */
export const OPEN_WRITERS_PENDING_AUTHORIZATION: Record<string, string> = {};
