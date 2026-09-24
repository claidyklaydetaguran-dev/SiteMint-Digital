# SiteMint client-ready plan — 23 September 2026

## What the percentages mean
There is no defensible single percentage for the entire platform. Do not blend local tests, visual approval and live delivery into one number.

| Measure | Result | Evidence / limitation |
|---|---:|---|
| Historical CRM criteria | 132/150 = 88.0% | Existing criteria.json, dated 16 September; predominantly local/test evidence, not revalidated in this pass |
| Historical CRM page checks | 184/312 = 59.0% | Existing generated report, 16 September; not a current production score |
| Current SiteMint receptionist setup | 1/4 = 25% | Live Setup page on 23 September; optional capability step counts complete even with booking/transfer off |
| Recent public route/metadata checks | 16/16 = 100% | Release audit; measures page responses/SEO metadata only, not customer conversion or all functionality |
| Approved production calendar acceptance | Passed | Request -> approval -> Google event -> cancellation checked in prior release; no guests |
| Current design approval | Not passed | Owner rejected the previous match to the reference; new candidate requires review |

Live findings today: business description missing; owner email unconfirmed; no assistant, greeting or voice selected; no assigned phone; no browser/telephone acceptance call. Calendar settings and calendar create/cancel have passed, but the readiness screen still says booking is off. Code maps platform-disabled or unauthorized scheduling to the same off message as missing hours. Investigate capability configuration before asking the owner to recreate hours.

## Design specification
Reference: owner-provided Mint Clarity board. White content, pale mint rail, forest text and primary actions, fine green-gray borders. DM Sans. No navy workspace shell. Public hero is spacious and visual; workspaces are compact and task-first. Customer portal gets desktop sidebar and mobile tabs. CRM remains staff-only; client and receptionist sessions remain separate.

Candidate now implemented: light CRM chrome, desktop portal sidebar, refined discovery panels, receptionist overview spacing and removal of duplicate activity metrics when the voice dashboard is present, public navigation active states, 3D-perspective layered hero on home/receptionist, additional before/during/after call and onboarding explanations. The hero uses CSS transforms and native scroll timelines, with static mobile/reduced-motion/unsupported-browser fallback. This is a CSS 3D scene, not a rendered 3D video or model. No new animation dependency or paid asset service.

## Launch order
1. SiteMint is the pilot business. Verify owner email; set accurate business description. Preserve US Pacific weekday 09:00–17:00, Discovery consultation 30 minutes.
2. Prepare one assistant with a precise greeting, approved services and pricing boundaries. Make booking requests and confirmed bookings distinct. Configure fallback messages; do not invent transfer destinations.
3. Reconcile server capabilities and public production callbacks. Confirm provider sync and number ownership before changing routing. Do not repoint a number belonging to another environment/customer without a clear migration decision.
4. Owner makes one acceptance call: inquiry, availability, requested consultation, confirmed contact details, permitted email copy, fallback question. Verify persisted call, appointment, summary and delivery independently.
5. SMS: verify sender type/registration, consent capture, STOP handling and delivery callbacks. No real SMS until explicitly authorized.
6. Billing: sandbox subscription/usage calculation, invoice, retry/cancellation and tenant isolation. Agree pilot price/margin before a live charge. Keep public Request pricing.
7. Google: production consent branding/domain/policies/scopes and verification. Each customer connects their own Google account. Submission is not approval. No billing trial required just because a banner appears.
8. Customer acceptance: new business in a test environment, wrong-business access refusal, recovery, mobile checks, staff/customer portal journeys, rollback and monitoring. Then invite a small assisted pilot cohort.

Do not delay critical reception readiness for more decorative content. Do not launch paid promises for unverified SMS, billing or general Google access.

## Research and implementation techniques
- Animate transform/opacity and keep meaning visible without animation: https://web.dev/articles/animations-guide
- Native scroll-driven animation with feature detection: https://developer.chrome.com/docs/css-ui/scroll-driven-animations
- US SMS sender onboarding depends on number type; 10DLC registration applies to US application-to-person long-code traffic: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc
- Production OAuth must represent the app accurately and satisfy applicable verification requirements: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance

Use real product demonstrations and task outcomes as proof. No invented testimonials, conversion rates, customer logos or business results. Track inquiry completion, account activation and successful call outcomes once consent-appropriate measurement exists. Start with one US service-business segment and assisted setup rather than adding more modules.
