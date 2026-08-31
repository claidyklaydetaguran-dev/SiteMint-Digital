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
  "PATCH /api/receptionist/agent-config": "session",
  "PATCH /api/receptionist/voice/assistants/:id": "session",
  "PATCH /api/receptionist/voice/transfer-destinations/:id": "session",
  "POST /api/admin/login": "credential",
  "POST /api/admin/submissions/:id/proposal": "admin",
  "POST /api/admin/submissions/:id/sow": "admin",
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
  "POST /api/public/schedule/:slug/requests": "feature-flag",
  "POST /api/receptionist/account/members": "session",
  "POST /api/receptionist/account/members/accept": "token-proven",
  "POST /api/receptionist/account/password-reset/complete": "token-proven",
  "POST /api/receptionist/account/password-reset/request": "feature-flag",
  "POST /api/receptionist/account/verify-email/confirm": "token-proven",
  "POST /api/receptionist/account/verify-email/request": "session",
  "POST /api/receptionist/auth/login": "credential",
  "POST /api/receptionist/auth/logout": "session",
  "POST /api/receptionist/auth/signup": "feature-flag",
  "POST /api/receptionist/availability/hold": "session",
  "POST /api/receptionist/availability/requests": "session",
  "POST /api/receptionist/availability/requests/:publicId/cancel": "session",
  "POST /api/receptionist/billing/create-checkout-session": "session",
  "POST /api/receptionist/billing/webhook": "signature",
  "POST /api/receptionist/calendar/google/start": "session",
  "POST /api/receptionist/voice/assistants": "session",
  "POST /api/receptionist/voice/assistants/:id/duplicate": "session",
  "POST /api/receptionist/voice/assistants/:id/publish": "session",
  "POST /api/receptionist/voice/assistants/:id/sync": "session",
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
  "PUT /api/admin/voice/firms/:id/subscription": "admin",
  "PUT /api/crm/email-templates/:id": "admin",
  "PUT /api/receptionist/availability/config": "session",
  "PUT /api/receptionist/availability/public-link": "session",
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
