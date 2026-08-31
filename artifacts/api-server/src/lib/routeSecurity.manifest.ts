// R6 — the committed route-security manifest.
//
// Every mutating route (POST/PUT/PATCH/DELETE) the api-server exposes, with
// the protection class it is expected to keep. routeSecurity.test.ts re-derives
// this from source on every CI run and fails when the two disagree, so:
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
  "POST /api/public/schedule/:slug/requests": "unauthenticated",
  "POST /api/receptionist/account/members": "session",
  "POST /api/receptionist/account/members/accept": "token-proven",
  "POST /api/receptionist/account/password-reset/complete": "token-proven",
  "POST /api/receptionist/account/password-reset/request": "unauthenticated",
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
 * Routes that are deliberately reachable without authentication, signature,
 * credential or feature flag. This list is asserted EXACTLY: adding an open
 * route without adding it here fails CI, and removing one from the code
 * without removing it here fails too.
 *
 * Each entry must carry a reason. "It has a rate limiter" is not a reason —
 * rate limiting and honeypots bound abuse, they do not control access. That
 * distinction is why the AR-002B-R5 audit missed the scheduling writer below:
 * its inventory counted rate limiting as a guard.
 */
export const KNOWN_OPEN_ROUTES: Record<string, string> = {
  "POST /api/receptionist/account/password-reset/request":
    "Password-reset initiation is unauthenticated by design — the caller is proving nothing yet. " +
    "It is fixed-window rate limited, and the single-use token it issues is delivered to the " +
    "account owner's address, so the privileged half of the flow (password-reset/complete) is " +
    "token-proven.",
  "POST /api/public/schedule/:slug/requests":
    "AR-002B-R6 FINDING, awaiting an owner decision: the public booking page accepts an " +
    "appointment request from any caller who knows a firm's slug and writes it via " +
    "submitAppointmentRequest. It has an IP limiter and honeypot/timing checks but no " +
    "authentication, signature, credential or default-off flag. R6 authorized closing only the " +
    "discovery-submissions and ai-toolkit-checkout writers, so this one is recorded here rather " +
    "than gated unilaterally. It needs its own flag (a booking capability is not a lead form, so " +
    "PUBLIC_FORM_SUBMISSIONS_ENABLED must not be stretched to cover it).",
};
