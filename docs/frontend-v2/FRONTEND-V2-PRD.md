# SiteMint Frontend V2 — Product Requirements

> Status: **approved blueprint.** The owner's final decisions are incorporated
> and authoritative; this document supersedes the pre-review draft.
> Branch `redesign/frontend-v2`, forked from the validated recovery commit
> `9bc2694181aab9c35414352e723bd4f1f8054b13`.

## 0. Owner decisions (binding)

These six decisions were issued at blueprint approval and override anything
elsewhere in this document set that predates them.

1. **No unverified claims.** Every invented statistic, result, availability
   claim, customer count, performance figure, delivery timeline, and unverified
   named integration is **removed** — not retained behind a disclaimer.
2. **Readiness is stated accurately.** SMS Receptionist: *available now*. Voice
   experience: *in development*. Connected CRM and automated follow-up:
   *planned direction*. See §8.1.
3. **Discovery stays public at `/discovery`** and remains the primary
   *Start Your Project* flow, resolved through the centralised route helper.
4. **`/ai-for-lawyers`, `/ai-for-realtors`, and `/pricing` leave the approved
   public navigation and information architecture.** Their source files are
   retained during Phase 1 as rollback references only.
5. **The public site is light-forward.** Warm white and soft off-white dominate;
   navy is reserved for the footer plus at most one intentional feature or
   product-demonstration section. See `DESIGN-SYSTEM.md` §2 and §4.
6. **No Magnific image and no video are authorised for Phase 1.** No image is
   generated, downloaded, or added to fill space.

## 1. Why this exists

Gate 3 confirmed the recovered application **works**: typecheck clean, 100/100
Vitest + 9/9 legacy tests, all five packages building, and every recovered
journey reachable in a local preview. The owner reviewed that preview and
rejected the frontend.

The decision is therefore **not** "fix the current UI". The current
implementation becomes a **protected functional reference**: its business logic,
backend contracts, authentication, and data flows are authoritative; its layouts,
section order, card designs, animations, hierarchy, copy, and decorative graphics
are not.

## 2. Objectives

1. Rebuild the public website, the AI Receptionist marketing journey, the
   signup/login experience, onboarding, and the authenticated dashboard.
2. Preserve every working contract: API routes, auth, Discovery, AI Receptionist
   behaviour, voice-platform functionality.
3. Make performance, stability, accessibility, and clear product communication
   first-class requirements rather than post-launch cleanup.
4. Communicate what SiteMint actually does, without fabricated proof.

## 3. Non-goals for V2

- No API, schema, migration, auth, provider, billing, calendar, webhook, Stripe,
  credential, environment, or deployment change.
- No new product features. V2 is a presentation-layer rebuild.
- No pricing table until package scope and pricing are approved. `/pricing` also
  leaves the approved public navigation and IA (owner decision 4).
- No blog.
- **No video, of any kind, anywhere.**
- **No Magnific-generated or otherwise generated imagery in Phase 1.** No image
  is produced merely to fill space.
- No vertical landing pages in the public journey — `/ai-for-lawyers` and
  `/ai-for-realtors` are deferred (owner decision 4).

## 4. Audience

| Audience | Need | Where served |
|---|---|---|
| Small-business owner evaluating SiteMint | Understand quickly what is built and what it costs them in effort | Public site |
| Owner evaluating the AI Receptionist specifically | Understand what is available now (SMS), what is in development (voice), and what is planned direction (connected CRM, automated follow-up) | AI Receptionist landing |
| New customer signing up | Create an account without friction or confusion | Signup → onboarding |
| Existing operator | Run the receptionist: see calls, leads, appointments, and problems needing action | Authenticated dashboard |
| SiteMint internal staff | CRM and admin operations | `/admin/*` (out of V2 visual scope, see §7) |

## 5. What is preserved (protected functional reference)

These are **contracts**, not suggestions. V2 must not alter them.

| Contract | Detail |
|---|---|
| Signup endpoint | `POST /api/receptionist/auth/signup`, fields `fullName, businessName, email, phone, industry, password`; 201 `{ firm }` + session cookie; 400/409/429 `{ error }` |
| Auth model | httpOnly cookie `receptionist_session`, 30-day TTL, `receptionist_sessions` table |
| Dashboard base path | Helpdesk SPA at `/ai-receptionist/dashboard` |
| Legacy redirects | `/app`, `/app/login`, `/app/conversations/:id`, `/app/agent-config`, `/app/settings` |
| Discovery | `/discovery` (structured form), `/discovery/__legacy` rollback route, `@workspace/discovery-contract` schemas |
| Voice platform | `voicePlatformEnabled` flag, `VoiceProviderStatusCard`, provider readiness logic across 9 helpdesk files |
| Intake SMS pipeline | Untouched — separate Twilio credentials, protected per CLAUDE.md |

## 6. Success criteria

V2 is complete when all of the following hold:

1. Every route in `ROUTE-AND-FEATURE-INVENTORY.md` marked *preserve* still
   functions, verified by the same gate discipline used in Gates 2A–2D.
2. Public-route initial JS is **under 250 KB gzipped** (today: a single
   ~1.81 MB / ~476 KB gzipped main bundle).
3. LCP < 2.5 s on a mid-range mobile connection; CLS < 0.1; INP < 200 ms.
4. Every data surface has loading, empty, error, and populated states.
5. No blank-screen failure mode on any route.
6. WCAG 2.2 AA for all public and dashboard surfaces (see
   `ACCESSIBILITY-REQUIREMENTS.md`).
7. No fabricated proof anywhere in the product (see §8).
8. `pnpm run typecheck`, `pnpm run test`, and the environment-qualified build all
   pass, matching the Gate 2D baseline.

## 7. Scope boundary — the internal CRM

`/admin/*` contains 26 CRM pages (≈1.13 MB of source, ~71% of all web-agency page
source). It is an **internal tool**, not customer-facing, and is therefore
**out of scope for V2 visual redesign**.

It is emphatically **in scope for the performance work**: today every CRM page is
an eager import in the public bundle, which is the single largest cause of the
1.81 MB payload. V2 moves the entire CRM behind route-level lazy boundaries
without changing its UI.

## 8. Honesty requirements

The product must not present anything it cannot substantiate.

**Forbidden:** fake awards, fake customer logos, fabricated testimonials,
invented revenue numbers, fake live-user counters, meaningless statistics,
auto-playing carousels, infinite logo marquees, generic blog, premature pricing
tables.

**Removed by owner decision 1 — not deferred, not disclaimed.** Every unverified
inbound-call statistic, response-time figure, lead-value figure, setup-duration
claim, and unverified named integration that appeared in the current build is
**deleted from the V2 interface and content specification**. Numbers are not
retained with a caveat, a footnote, or a source label. A claim ships only if
repository code or owner-supplied evidence substantiates it.

This applies to any invented statistic, result, availability claim, customer
count, performance claim, or delivery timeline — including ones not individually
enumerated here.

Where verified case-study data is unavailable, the case-study component ships as
an honest **"Selected work"** presentation with no invented results.

### 8.1 Product readiness (binding)

Public content must distinguish these three tiers, and every future capability
must be **visibly labelled**:

| Capability | Status shown publicly |
|---|---|
| **SMS Receptionist** | **Available now** |
| **Voice experience** | **In development** |
| **Connected CRM and automated follow-up** | **Planned direction** |

SiteMint must **not** say or imply that it currently answers every voice call
24/7. The page may demonstrate the future connected product vision, provided each
future capability carries a visible *in development* or *planned* label.

Only capabilities proven by repository code may be presented as presently
available. **Scheduling, escalation, qualification, recording, and every other
function must be verified individually** before being presented as shipped.

Approved AI Receptionist headline:

> Every lead deserves a timely response.

Approved supporting direction:

> SiteMint's AI Receptionist helps businesses respond to inquiries, qualify
> leads, organize conversations, and keep opportunities from being forgotten.
> SMS is available now, with voice and deeper CRM connections being developed.

## 9. Constraints inherited from the repository

- pnpm 10.26.1 workspace, Node v24.2.0, four config blobs frozen.
- Build requires `PORT` and `BASE_PATH`; three of four Vite front-ends throw at
  config load without them.
- Base-path handling must be centralised — see `PERFORMANCE-ARCHITECTURE.md` §6.
- `lib/db`, `intake_*`, `crm_*` schemas and the protected backend files listed in
  `CLAUDE.md` are untouchable.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Redesign silently breaks a preserved contract | Phase gates with the same blob/patch-id/validation discipline as Gates 2A–2D |
| Bundle work changes behaviour | Lazy-loading is mechanical; each phase validated independently |
| Scope creep into backend | Explicit non-goals; no phase touches `artifacts/api-server` |
| Owner sees "another template" | Design character is specified concretely in `DESIGN-SYSTEM.md` with explicit anti-patterns |
