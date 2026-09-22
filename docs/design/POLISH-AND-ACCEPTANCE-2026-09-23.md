# Mint Clarity polish and acceptance

## Owner decisions

Public website with an assisted receptionist pilot; staff-only CRM and a limited client portal. US small and medium service businesses first. Request pricing until actual subscription/usage economics are verified. Customers authorize their own calendars; the platform's OAuth-project owner is not the customer's calendar owner.

Visual storytelling on marketing pages; practical forms and application screens. Full-height opening scenes with normal scrolling now. Create the 3D animation later. Test emails authorized only to the two privately recorded owner/director addresses; no real calls, SMS or payments authorized in this pass. Test accounts/records belong in staging or disposable test environments.

## Design and engineering

- Keep DM Sans, forest #173f35, mint #e4f2e9, warm white #f9fbf8, muted #5a7066. Purposeful photography, readable copy, visible next actions.
- Major marketing heroes use minimum viewport height minus measured header height. Content can grow at small sizes or zoom. Never force a fixed height or hide overflow to make a screenshot fit.
- Header measurement uses ResizeObserver and cleans up on unmount. CSS has a fallback before measurement. No pinned scroll sections, negative section margins, autoplay video or WebGL added.
- Homepage adds a website-review chapter and an understanding/planning scene. Receptionist hero uses its own owner-at-work scene. Generated images are illustrative, not client endorsements or proof of results.
- Below-fold images are lazy-loaded, dimensioned WebP assets. Existing booking/transfer/message demonstrations remain explicitly fictional examples.
- Legal, pricing and intake forms stay concise and practical. Future animation must preserve keyboard navigation, reduced-motion stills, normal mobile scrolling and the same content/CTAs without JavaScript.

## Verified this pass

- Production staff bootstrap endpoint reports one staff account.
- Existing authenticated owner session opens `/admin/crm/dashboard`; Command Center data loads. This does not prove the technical-director account has been created.
- Production dashboard distinguishes pipeline, contracted value and cash received. Email-open tracking, visitor identification, e-signatures and video tracking visibly report unavailable.
- Existing production Sequences page loads its saved record. No sequence was saved or sent during inspection.
- CRM quick composer requires an existing contact. Improved its search label, no-match explanation and email-address display locally. No test contacts created in production.
- Local mobile homepage and receptionist have no horizontal overflow at 390px; homepage hero ends at viewport boundary. Receptionist hero grows naturally when content needs more space. Generated images load on scroll. Transfer example switches to its fallback scenario.

## CRM feature inventory, not end-to-end certification

The tutorial's feature list is a comparison checklist, not a mandate to change frameworks. Existing React/Express/Postgres modules are retained. Route presence proves an implementation surface, not correctness or provider readiness.

| Requested capability | Existing implementation surface | Acceptance still required |
|---|---|---|
| Contact management | `crmContacts.ts`, `crmCompanies.ts`, contact/detail screens | Staging create/edit/search and permissions |
| Leads | `crm.ts`, `crmDiscovery.ts`, `crmLeadAssignment.ts` | Intake-to-lead trace, assignment, duplicate handling |
| Pipeline | `crmSales.ts`, pipeline/deal screens | Stage changes, totals and activity history |
| Communication | `crmInbox.ts`, `crmEmailInbound.ts`, `crmEmailEvents.ts` | Authorized sends, reply threading, delivery evidence; no unapproved SMS/calls |
| Tasks/activity | `crm.ts`, tasks/My Day screens | Save, assignment, due dates and completion |
| Support | `crmSupport.ts`, ticket and knowledge-base screens | Ticket lifecycle, portal isolation, message delivery |
| Marketing | `crmMarketing.ts`, campaigns/queue screens | Consent, unsubscribe, deduplication, scheduling and send gates |
| Reporting | `crmReports.ts`, `crmCommandCenter.ts` | Reconcile figures with test records; never substitute zeros for unavailable data |
| Documents | `crmDocuments.ts`, documents/portal screens | Upload/download, access isolation and version behavior; no e-signature claim |
| Automation | `crmAutomation.ts`, automation queue | Approval, retries, idempotency and failed-action recovery |
| Roles | `crmStaff.ts`, staff administration | Owner verified in browser; director and lower-role denial checks pending |
| Interaction history | `crmHistory.ts`, lead timeline | Calls/emails/notes accurately linked to correct record |
| Calendar | `crmCalendar.ts`; separate receptionist calendar routes | Timezones, conflict handling, invitations and provider connection |
| Integrations | Email, phone, calendar, billing adapters | Verify each configured provider; no blanket ERP/accounting integration promise |
| Mobile | Responsive web application | Touch/keyboard journey checks; native apps/offline/push are not certified |
| Client portal | `crmPortal.ts`, portal pages | Invitation acceptance and cross-client isolation in staging |
| Security/recovery | Auth/role boundaries and guarded migration/recovery tooling | Dedicated security review, recovery drill evidence and MFA coverage; no compliance claims |
| Dashboard | Command Center and operational views | Authenticated read verified; reconcile all interactive drill-downs |

## Receptionist acceptance sequence

1. Sign in to the intended staging business; verify tenant and role.
2. Inspect readiness and provider configuration. Local configuration and provider configuration must match.
3. Connect that business's calendar, choose its calendar/timezone, verify availability and booking fallback.
4. Verify webhook schema, final-call processing and durable notification retries without replaying real customer events.
5. Send authorized tests only to recorded owner/director addresses; record queued, provider-accepted and delivered separately. A CRM test email does not certify post-call email.
6. Ask for separate authorization before live calls, SMS or charge tests. Enable each pilot business only after its acceptance record passes.

## Release boundary

This pass produces a local candidate until an exact artifact is published and checked on the public domain. Do not infer live state from a local preview, source commit or successful Vite build. Run prerender after the final build; retain canonical URLs, private-route noindex and sitemap coverage. Record the actual release identifier and rollback path when deployed.

## Additional live findings

- Staging receptionist session opened successfully. Calendar page explicitly says not connected. Overview has historical completed calls and pending appointment requests; that is not current booking acceptance.
- Google sign-in was being completed in the staging tab and showed a password error. Agent left that tab untouched. No OAuth grant/connection confirmed.
- One authorized production CRM test-send to the owner address returned **simulated; no email actually sent**. Settings independently confirms `CRM_EMAIL_TEST_MODE` is on. No campaign was saved and no customer was contacted. The second test was deferred because it would exercise the same blocked path.
- Production CRM Settings displays Twilio callbacks on a `.replit.dev` workspace URL. Presence of a configured URL does not verify provider routing. Verify the intended production callback base and the provider console before changing it, because signature validation also depends on the external URL.
- Candidate removes stale shared-login/static-directory claims, distinguishes simulated tests from provider acceptance, removes the unconditional SMS reply promise, and separates confirmed email identity from notification delivery.
- Do not globally turn off mail test mode until queued work, provider sender verification and recipient scope are reviewed. Authorization for two test messages does not authorize sending existing campaigns or queued customer notifications.

## Asset direction

Three generated illustrative business photographs, converted to 1536x1024 WebP: `understanding.webp` (111,794 bytes), `business-focus.webp` (156,550 bytes), `website-review.webp` (135,754 bytes). Art direction: natural daylight, warm oak, forest green and soft mint, working business owners, clean believable settings; no logos, readable generated text, sci-fi effects or invented endorsements. Reuse this direction for future imagery; keep the actual interface as the proof of functionality.

## Validation evidence

- Web-agency TypeScript check passes; 17 test files / 161 tests pass after the CRM copy and test-result fixes.
- Helpdesk build passes after the SMS/assisted-pilot wording changes; existing sign-in contract suite passes.
- Readiness and the two environment-affected backend suites pass on targeted rerun: 30 tests. An inadvertently broad local backend run reported 1,717 passing / 599 database-dependent skipped, one cold-import timeout and one Git safe-directory setup failure. Both failures passed with the proper Git environment and targeted rerun. This is not a fresh full database-backed certification.
- Generated-scene mobile checks were performed in the browser, including lazy image loading and the transfer example. No real calls, SMS or payments were initiated.

- Final web-agency, helpdesk and API builds pass. Clean prerender completes 22 documents plus SPA fallback. Fourteen canonical public routes pass HTML title/description/canonical/H1 checks and have no missing referenced local assets. The local preview was restarted against this final output and visually rechecked.
- Fixed the prerender browser-port collision by using a private ephemeral debugging port per run and a bounded startup check. Build and prerender must still run serially when sharing the same output directory.
- Final candidate preview: http://127.0.0.1:8772/. This pass has not been published to production. Full receptionist/provider acceptance and the rest of the CRM staging write journeys remain open.
