# SiteMint — Current-State Product Ledger

> Source of truth for the September 2026 owner replan. Generated 2026-09-03 from a
> read-only audit of PR #30 head `17a7056` (branch `feature/sitemint-v4-implementation`,
> base = protected main `7d84bcb`). Every row was verified against the code on that SHA,
> not against memory or earlier reports. Where a claim rests on a staging certification
> rather than on code, the certification document is named.

## 0. Source identities (verified 2026-09-03)

| Item | Value |
|---|---|
| Protected `main` | `7d84bcb23d530a13ca24c1c0212a383843f855d7` (PR #31 merge, docs-only) — has NOT advanced since the last report |
| PR #30 | OPEN, `MERGEABLE` / `CLEAN`, head `17a7056ef065827fcc02426275ec522f8abdf3b5`, base `main`, 13 commits ahead / 0 behind |
| Required checks on `17a7056` | `gates` SUCCESS, `voice-matrix` SUCCESS (run 33665601459, 2026-09-02) |
| Fresh Linux build of `17a7056` | web-agency dist and helpdesk dist are **byte-identical** (`diff -rq`) to the R1-synced builds in `/opt/sitemint-v4-sync` and `/opt/sitemint-v4-r1`. The accepted R1 digests (`0b0b3f53…` / `7b23f4f0…`) were produced by an earlier session's formula; this session's formula gives `c532199a35229456` / `034cce682346a260` on both the fresh build and the R1 tree, which is the equivalence that matters. V4 R1 evidence therefore carries by hash equivalence. |
| Review worktree | `C:/SiteMint-Digital/.claude/worktrees/owner-review-pr30-e34491` (detached at `17a7056`, never modified) |
| Planning docs | this directory, on branch `claude/sitemint-owner-review-e34491` (based on `main`), product source untouched |

## 1. Status vocabulary

| Status | Meaning |
|---|---|
| LIVE AND CERTIFIED | Frontend + backend exist, and the behaviour was proven on staging with a written certification |
| IMPLEMENTED BUT DISABLED | Code exists on both sides but a default-off flag (build-time `VITE_*` or runtime `*_ENABLED`) keeps it dark |
| FRONTEND ONLY | A screen exists but has no backend to talk to |
| BACKEND ONLY | A route/service exists with no screen calling it |
| PARTIALLY IMPLEMENTED | Both sides exist but the journey is incomplete or wired wrong |
| PLANNED | Concept only (design doc, nav placeholder, or "Soon" item) |
| BLOCKED | Waits on an owner/legal/provider decision, not on code |
| NOT IN LAUNCH SCOPE | Deliberately excluded from the private beta and public launch |

Priority scale: **P0** = blocks the invite-only private beta · **P1** = required before public launch · **P2** = post-launch · **P3** = not planned.

## 2. Company website (`artifacts/web-agency`, served at `/`)

Chrome: V4 "Signal" (`PublicShell chrome="v4"`), all static, no API dependency unless noted. Audience: public.

| Route | Page | Frontend | Backend | Provider | Flag | Certified? | Missing work | Launch blocker | Status | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | HomeV4 | Built, R1-verified (CLS 0.000, a11y 100) | none needed | — | — | R1 evidence | Mobile LCP 2.8–3.0 s vs 2.5 target; hero film not produced (400-credit keyframes only) | No | LIVE AND CERTIFIED (static) | P1 polish |
| `/services` | ServicesV3 under V4 skin | Built | — | — | — | R1 | No `id=` anchors although header links to sections; "What We Build" trigger never shows active state | No | PARTIALLY IMPLEMENTED | P1 |
| `/websites-apps` | WebsitesAppsV3 | Built | — | — | — | R1 | Combined page; no separate "web applications" route | No | LIVE AND CERTIFIED (static) | P2 |
| `/discovery-systems` | DiscoverySystemsV3 | Built | — | — | — | R1 | — | No | LIVE AND CERTIFIED (static) | P2 |
| `/automation` | AutomationV3 | Built | — | — | — | R1 | Nearest thing to "AI systems"; no dedicated AI-systems page | No | PARTIALLY IMPLEMENTED | P2 |
| "CRM systems" page | — | **MISSING** (legacy nav item points at `/services`) | — | — | — | — | Decide whether it is a pillar or folded into automation | No | PLANNED | P2 |
| `/work` (+ `/portfolio` alias) | WorkV3 | Built; honest "no invented proof" | — | — | — | R1 | Copy claims the discovery flow delivers a brief "the moment it's submitted" — contradicted by `/discovery` (see below) | **Yes (honesty)** | PARTIALLY IMPLEMENTED | P0 copy fix |
| `/process` | ProcessV3 | Built | — | — | — | R1 | — | No | LIVE AND CERTIFIED (static) | P2 |
| `/about` (Company) | AboutV3 | Built | — | — | — | R1 | Claims "the discovery flow on this site is our actual intake" and "answers real calls" — both currently untrue | **Yes (honesty)** | PARTIALLY IMPLEMENTED | P0 copy fix |
| `/insights` | InsightsV3 | Built, permanent empty state, unlinked | — | — | — | — | Content; re-entry criterion = first approved article | No | NOT IN LAUNCH SCOPE | P2 |
| `/start` | StartV3 | Built; CTAs → `/discovery` and `/contact` | — | — | — | R1 | — | No | LIVE AND CERTIFIED (static) | P1 |
| `/discovery` | DiscoveryPage / PlatformDiscoveryShell | Built, **never submits** (localStorage draft only, states "Nothing was submitted or saved") | `POST /api/discovery/submit` and `/api/v1/discovery-submissions` exist, gated by `PUBLIC_FORM_SUBMISSIONS_ENABLED` (off) | — | `PUBLIC_FORM_SUBMISSIONS_ENABLED` | No | Wire the form to the endpoint; flip the flag; every "Start a Project" CTA lands here so this is a total conversion loss today | **Yes** | FRONTEND ONLY | **P0** |
| `/contact` | PlatformContactPreview (V2 prototype chrome) | Built, own V2 nav, no shared V4 chrome | `POST /api/contact/submit` gated off | Resend (notification) | `PUBLIC_FORM_SUBMISSIONS_ENABLED` | No | Re-skin into V4 or retire; flip flag | Yes | PARTIALLY IMPLEMENTED | P0 |
| `/pricing` | PlatformPricingPreview (V2 prototype chrome) | Built, ungated (its `platformPreviewEnabled` flag is dead code), hard-coded "$2,995 / $5,995 / $9,995", nav carries a "24/7" receptionist claim | — | — | dead flag | No | Owner decision: keep off-IA, retire, or rebuild | Yes (claims) | PARTIALLY IMPLEMENTED | P1 |
| `/privacy`, `/terms` | LegalPrivacyV3 / LegalTermsV3 | Built, honest drafts | — | — | — | — | **Legal/owner approval** (LAUNCH-CHECKLIST blocking item) | **Yes** | BLOCKED | **P0 for public launch** |
| `/thank-you` | ThankYou | Built; hard-codes phone/email | — | — | — | — | — | No | LIVE AND CERTIFIED (static) | P2 |
| `/ai-for-lawyers`, `/ai-for-realtors` | Legacy verticals, unlinked | Built, V2 chrome, unsourced statistics ("87% …", "Studies show …") | landing-test submit/view gated off | — | `PUBLIC_FORM_SUBMISSIONS_ENABLED`, `PUBLIC_ANALYTICS_WRITES_ENABLED` | No | Retire or rewrite with sources | Yes if reachable | NOT IN LAUNCH SCOPE | P1 (retire) |
| 404 | not-found.tsx | Developer placeholder: "Did you forget to add the page to the router?", **no links** | — | — | — | — | Real 404 page with exits | Yes | PARTIALLY IMPLEMENTED | P0 |
| Desktop nav | SiteHeaderV4 | What We Build ▾ · Work · Process · Company · AI Receptionist (pill) · Client Sign In · Start a Project | — | — | — | R1 keyboard contract | AI Receptionist appears twice (panel card + pill); mega-panel trigger never active | No | LIVE AND CERTIFIED | P2 |
| Mobile nav | SiteHeaderV4 sheet | Focus-trapped dialog, Escape restores focus | — | — | — | R1 | Group labelled "Company" contains Work/Process/Company (mislabelled) | No | PARTIALLY IMPLEMENTED | P1 |
| Footer | SiteFooterV4 | Built | — | — | — | — | No active-state styling | No | LIVE AND CERTIFIED | P3 |

Unrouted dead weight in the lazy graph: HomeV3, HomeV2, PlatformPreview, PlatformServicesPreview, PlatformPortfolioPreview, PlatformAboutPreview, AiReceptionistV3, AiReceptionist, LandingReceptionist (nine `lazy()` imports never rendered) plus eight unreferenced page files.

## 3. AI Receptionist marketing (`/ai-receptionist`)

| Surface | Frontend | Backend | Provider | Flag | Certified? | Missing | Blocker | Status | Priority |
|---|---|---|---|---|---|---|---|---|---|
| Landing page (hero, theater, capabilities, how it works, outcomes, safety line, CTA) | AiReceptionistV4 built; theater is a labelled simulation ("Is this a live demo? Not yet."); capability-honest copy (no SMS / autonomous-booking / live claims) | — | — | — | R1 | Pricing posture absent (no pricing section, `/pricing` is off-IA V2 page); no FAQ | No | LIVE AND CERTIFIED (static) | P1 (pricing posture) |
| Conversion into signup | "Create an account" → `/ai-receptionist/signup`; "Client Sign In" header link → `/ai-receptionist/dashboard/login` | see §4 | — | — | R1 | No sign-in link in page body | No | LIVE AND CERTIFIED | P2 |
| Live demo call from the page | not built | Vapi web-call path not certified (AR-002C: dashboard Talk widget broken provider-side) | Vapi | `VITE_VOICE_BROWSER_TEST_ENABLED` | No | Own PRD (design doc 05) | No | PLANNED | P2 |

## 4. Customer application (`artifacts/helpdesk`, served at `/ai-receptionist/dashboard`)

Auth: httpOnly cookie `receptionist_session`; `AppShell` redirects to `/login` when `GET /api/receptionist/auth/me` fails. There is **no role model and no permission-denied UI** anywhere in the SPA. Build flags: `VITE_VOICE_PLATFORM_ENABLED`, `VITE_VOICE_PUBLISH_ENABLED`, `VITE_VOICE_BROWSER_TEST_ENABLED`, `VITE_VOICE_SYNC_ENABLED` — all `false` in the committed canonical build; staging runs only `VITE_VOICE_PLATFORM_ENABLED=true`.

| Route | Page | Frontend | Backend | Provider | Flag (build / runtime) | Certified? | Missing work | Blocker | Status | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| `/ai-receptionist/signup` (web-agency) | LandingReceptionistSignup | Built (field errors, 409 → "Sign in instead", success → dashboard root) | `POST /api/receptionist/auth/signup` | — | `PUBLIC_REGISTRATION_ENABLED` (off) | Signup was used to create the staging firm (auth identity gap note) | Flip flag for beta | No | IMPLEMENTED BUT DISABLED | **P0** |
| `/login` | Login | Built; deliberately no "Forgot password" link | `POST /api/receptionist/auth/login`, rate-limited (10×401 → 429) | — | — | SMS regression gate | Password-reset UI (backend exists: `/account/password-reset/*`, flag `PASSWORD_RESET_REQUESTS_ENABLED`) | No | LIVE AND CERTIFIED | P1 (reset UI) |
| Onboarding | **none** — signup lands on Overview | no onboarding persistence anywhere | — | — | — | Guided onboarding (business info → prompt → voice → hours → types → calendar → test call) | **Yes for beta** | PLANNED | **P0** |
| `/` Overview | Overview | Built: skeleton, empty, error+retry, StatusRail readiness checklist (3 SMS-config steps) | `/auth/me`, `/conversations`, `/agent-config` | — | — | SMS product live | Readiness only covers the SMS receptionist, not voice/calendar/number; no "needs attention" from voice issues | No | LIVE AND CERTIFIED (SMS scope) | P1 |
| `/conversations` | Inbox | Built (master/detail, polling, filters, opt-out badge) | `/conversations`, `/conversations/:id` | Twilio (intake SMS pipeline, protected) | — | SMS product live | Voice conversations are on `/logs`, not here — two "conversation" concepts | No | LIVE AND CERTIFIED | P1 (merge concept) |
| `/receptionist` | AgentConfig ("Current SMS Receptionist") | Built (greeting, description, ≤6 questions, reorder, save) | `GET/PATCH /agent-config` | — | — | SMS product live | Naming: this is the SMS prompt, distinct from the voice assistant prompt | No | LIVE AND CERTIFIED | P1 (IA) |
| `/contacts`, `/contacts/:id` | Contacts / ContactDetail | Capability-state page only; issues no request | **No contacts route exists** (only server-side contact linking; admin helpdesk contacts are a different product) | — | — | No | Contacts list/detail API + UI | Yes for beta | FRONTEND ONLY | **P0** |
| `/assistants` | Assistants | Built (grid/table, search, filter, duplicate, delete) | `GET/POST/PATCH/DELETE /voice/assistants` | — | `VITE_VOICE_PLATFORM_ENABLED` | AR-001 staging: create/save/publish once proven | — | No | IMPLEMENTED BUT DISABLED | **P0** |
| `/assistants/new`, `/assistants/new/:tab` | AssistantCreate / AssistantBuilderNew | Built (template pick, unsaved preview banner) | same | — | same | — | Flag-off renders bare 404 instead of the capability state | No | IMPLEMENTED BUT DISABLED | P1 |
| `/assistants/:id/setup` | AssistantBuilder → SetupTab | Built | same | — | same | — | Orphaned tabs (Advanced, Analysis, Knowledge, Tools, Testing) exist as files with zero imports | No | IMPLEMENTED BUT DISABLED | P0 |
| `/assistants/:id/prompt` | PromptTab | Built | same | — | same | — | — | No | IMPLEMENTED BUT DISABLED | P0 |
| `/assistants/:id/voice-model` | VoiceModelTab + PresetSelector | Built (SUPPORTED_VOICE_PRESET_IDS) | same | Vapi catalog via `VOICE_RUNTIME_CATALOG_JSON` | same | Runtime catalog verified on staging | Voice sample playback not present | No | IMPLEMENTED BUT DISABLED | P0 |
| Publish | BuilderShell action row | Control **absent** from build when flag off (not a disabled button) | `POST /voice/assistants/:id/publish` (`VOICE_PUBLISH_ENABLED`, `VOICE_ARTIFACT_POLICY=none` mandatory) | Vapi | `VITE_VOICE_PUBLISH_ENABLED` / `VOICE_PUBLISH_ENABLED` | AR-002 staging publish proven (assistant v2 = SiteMint publish) | — | No | IMPLEMENTED BUT DISABLED | **P0** |
| Browser test call | BrowserTestPanel + Vapi web SDK | Built, fails closed without `VITE_VAPI_PUBLIC_KEY` | `GET …/browser-test-session` (`VOICE_BROWSER_TEST_ENABLED`) | Vapi | `VITE_VOICE_BROWSER_TEST_ENABLED` | **Not certified** — AR-002C blocked at the call step (provider Talk widget error); SiteMint's own path never exercised end to end | One paid web call under owner authorization | **Yes for beta** | IMPLEMENTED BUT DISABLED | **P0** |
| Sync | SyncAssistantControls | Built | `POST …/sync` (`VOICE_SYNC_ENABLED`) | Vapi | `VITE_VOICE_SYNC_ENABLED` | AR-002 | — | No | IMPLEMENTED BUT DISABLED | P1 |
| `/appointments` → Availability tab | AvailabilitySettingsForm | Built (timezone, weekly hours, buffers, notice, window, daily limit, blocked dates) | `GET/PUT /availability/config` | — | `VITE_VOICE_PLATFORM_ENABLED` | **M2 PASS** | Reachable only under the voice flag although it has no voice dependency | No | LIVE AND CERTIFIED (behind voice flag) | **P0** (unbundle from voice flag) |
| Appointment types | same form (add/remove, 5–480 min, max 20) | Built | wholesale via `PUT /availability/config`; no per-type CRUD | — | same | M2 | Fine for beta | No | LIVE AND CERTIFIED | P1 |
| `/appointments` → Requests tab | AppointmentRequestsList | Built; cancel only for `pending_review`/`held`; `booked` rows render a muted chip with **no action** | availability router (10 endpoints) + calendar router approve/cancel/reschedule/reconcile (PR #29) | Google Calendar | `CALENDAR_WRITE_ENABLED` (off) | **M4 CERTIFIED** on backend (create/reschedule/cancel lifecycle, 2026-09-02) | **Frontend calls none of the calendar router** — approve, cancel-booked, reschedule, reconcile are all frontend-dark; page comment still says "no endpoint" | **Yes for beta** | BACKEND ONLY (lifecycle) / PARTIALLY IMPLEMENTED (page) | **P0** |
| `/appointments` → Booking preview tab | AvailabilityPreview | Built; **real writes** (creates pending_review rows) with disclosure | `/availability/days`, `/slots`, `/hold`, `/requests` | Google free/busy | `CALENDAR_CONNECT_ENABLED` for real free/busy | M2/M3 PASS | — | No | LIVE AND CERTIFIED | P1 |
| Calendar connection | status line only (`{connected,provider}`) | Built read-only | `POST /calendar/google/start`, `GET …/callback`, `DELETE /calendar/connection` exist | Google OAuth | `CALENDAR_CONNECT_ENABLED` (off) | M2 (connection proven on staging via direct route call) | **No connect/disconnect UI**; callback redirects to `/settings?calendar=connected` which the Settings page does not read | **Yes for beta** | BACKEND ONLY | **P0** |
| `/schedule/:slug` public booking | PublicSchedule | Built (config/days/slots/request, honeypot, timing check) | `/api/public/schedule/:slug/*`; write gated | Google free/busy | `PUBLIC_SCHEDULING_REQUESTS_ENABLED` (off) | M3 PASS | Public-link toggle exists (`PUT /availability/public-link`) but no GET, so the UI cannot show the current slug | No | IMPLEMENTED BUT DISABLED | P1 |
| `/logs`, `/logs/:id` | CallLogs / CallLogDetail | Built (list, detail, transcript/summary/structuredOutcome honouring artifact policy) | `GET /voice/calls`, `/voice/calls/:id` | Vapi webhooks (HMAC, ms-timestamp fix PR #22) | `VITE_VOICE_PLATFORM_ENABLED` | AR-002B: 13-case HMAC matrix, events persisted | Inbound-call state proven only via synthetic webhook posts, not a real inbound phone call | No | IMPLEMENTED BUT DISABLED | **P0** |
| Inbound calling | — | no UI beyond logs | `assistant-request` answered from number inventory; `PhoneNumberProvider` production impl throws | Vapi + Twilio voice number | number activation is owner-gated (Stage 3) | **Not certified** (no number ever assigned) | Number acquisition + inventory row insert (no code path inserts `voice_numbers`) | **Yes for beta** | BACKEND ONLY | **P0** |
| `/phone-numbers` | ComingSoon (flag-on only; 404 flag-off) | placeholder | `GET /voice/numbers`, assign/pause/unpause exist | Vapi/Twilio | — | No | Numbers UI + provisioning path | Yes for beta | BACKEND ONLY | **P0** |
| Transfers | **no route, no nav item** | — | transfer-destinations CRUD + webhook transfer branch exist | Vapi | — | No | UI; live transfer certification | Not required for beta (may stay "coming later") | BACKEND ONLY | P1 |
| `/integrations` | ComingSoon (flag-on only) | placeholder | **no backend** (calendar connect is the only integration and lives elsewhere) | — | — | No | Decide: fold calendar into an Integrations page | No | PLANNED | P1 |
| Usage | trial meter in rail + Billing → Usage tab (from `/auth/me` only) | Built for SMS conversations | `GET /voice/usage` (minutes, calls, includedMinutes) is **uncalled** | — | `VOICE_USAGE_INCLUDED_MINUTES` unset | P7 metering proven by webhook (usage ledger row) | Voice minutes surface; cap → pause_requested surfacing | Yes for beta | PARTIALLY IMPLEMENTED | **P0** |
| `/billing` | Billing | Built (Plan/Usage tabs, 80 % attention, limit reached, Stripe checkout) | `POST /billing/create-checkout-session` (needs `STRIPE_RECEPTIONIST_PRICE_ID`); P8 subscription state machine + `GET /account/subscription` uncalled | Stripe | `STRIPE_BOOT_SYNC_ENABLED` off; `VOICE_BILLING_WEBHOOK_SECRET` unset | No | Plan catalog / pricing decisions (FINAL_REPORT §7); entitlement enforcement semantics | Not for invite-only beta (manual invoicing acceptable) | PARTIALLY IMPLEMENTED | P1 |
| Issues / monitoring | nav item `issues` state `later` (never routed) | — | `GET /voice/issues`, resolve, call reviews exist | — | — | P7 | Customer-facing issues page | Yes for beta ("safe failure handling") | BACKEND ONLY | **P0** (minimal) |
| `/settings` | Settings | Read-only account fields, links, sign-out | `/auth/me`; members/verify-email backends uncalled | — | — | — | No editable workspace fields; no team; ignores `?calendar=connected` | No | PARTIALLY IMPLEMENTED | P1 |
| `/tools`, `/voice-library`, `/knowledge`, `/analytics`, `/testing`, `/structured-outputs`, `/settings/api-keys` | ComingSoon (flag-on only) | placeholders | none | — | — | — | Owner decision: keep as "coming later" or remove from nav | No | PLANNED | P2/P3 |
| 404 | not-found.tsx | Bare page | — | — | — | — | — | No | PARTIALLY IMPLEMENTED | P1 |
| Sidebar | AppShell RailNav | Active state, focus trap, Escape, scrim, reduced motion | — | — | — | R1 | **Nested scroll region** (`.sd-rail__nav overflow-y:auto`), no breadcrumbs, back links ad hoc | No | PARTIALLY IMPLEMENTED | P1 |

Dead code worth deleting in the cleanup phase: `DemoModeBanner` (ready-made preview banner, zero consumers), `GettingStartedChecklist`, `MetricEstimate`, `KpiTile`, `RecentConversationList`, `VoiceProviderStatusCard` (+ the never-called `/voice/provider-status`), orphaned builder tabs, `ui/breadcrumb.tsx`, `ui/sidebar.tsx`.

## 5. Operations CRM (`/admin/*`, web-agency, `DashboardShell` + `CrmLayout`)

Auth: password-only `POST /api/admin/login` → bearer token in `localStorage.adminToken`; resets on server restart; **no client-side guard** — full chrome renders until the first 401; redirect target `/admin?redirect=…`. Audience: SiteMint staff only.

| Route | Page | Frontend | Backend | Provider | Certified? | Missing / defect | Status | Priority |
|---|---|---|---|---|---|---|---|---|
| `/admin` | AdminLogin | Built (loading, wrong password, connection error) | `POST /api/admin/login` (`ADMIN_PASSWORD` required, timing-safe) | — | R8 route-security contract | — | LIVE AND CERTIFIED | — |
| `/admin/dashboard`, `/admin/submissions/:id` | Discovery portal | Built | `/api/admin/submissions*` | — | — | Two "dashboards" (this and CRM Command Center) | LIVE AND CERTIFIED | P2 |
| `/admin/crm/dashboard` | Command Center | Built, no empty state | leads/tasks/deals/stats/conversations | — | — | — | LIVE AND CERTIFIED | P2 |
| `/admin/crm/leads` | Contacts table | Built (smart lists, filters, create, import) | `/api/crm/leads` | — | — | **Status taxonomy mismatch**: smart lists filter on legacy `New/Contacted/Follow-up/Negotiating/Nurture` while canonical statuses are `New Inquiry/…`; unguarded `.toLowerCase()` on null email; `NaN days ago` on missing `updatedAt` | PARTIALLY IMPLEMENTED | P1 |
| `/admin/crm/leads/:id` | Lead detail (+ SalesWorkspace, activity timeline, tasks, calls, SMS, email) | Built, dense | `/api/crm/leads/:id` + activities/messages/notes/tasks/email/sms/call | Twilio (CRM creds, protected `phone.ts`), Resend (test mode by default) | — | Activity timeline is a panel here, not a route; 401 handled on load only | LIVE AND CERTIFIED | P2 |
| `/admin/crm/leads/:id/dna` | Lead DNA | Built | leads + behavioral-events | — | — | **No 401 redirect** (strands user) | PARTIALLY IMPLEMENTED | P1 |
| `/admin/crm/tasks`, `/calendar` | Tasks / Calendar | Built | tasks, leads | — | — | Calendar day/week toggles non-functional; `.slice(0,10)` timezone shift; no error states | PARTIALLY IMPLEMENTED | P2 |
| `/admin/crm/communications`, `/inbox` | Communications Center / Inbox | Built (30 s polling) | conversations, messages, email-activity, templates | Twilio, Resend | — | Poll swallows 401 silently; unguarded `tags.length` and search `.toLowerCase()` | PARTIALLY IMPLEMENTED | P1 |
| `/admin/crm/pipeline`, `/deals`, `/transactions`, `/projects`, `/reporting` | Sales & delivery | Built | crm routes | Stripe (deal checkout) | — | Pipeline has no empty/error branch | LIVE AND CERTIFIED | P2 |
| `/admin/crm/campaigns`, `/campaign-builder`, `/campaign-queue`, `/email-templates` | Marketing | Built (STABLE per ARCHITECTURE.md) | campaigns routes | Resend, OpenAI | — | — | LIVE AND CERTIFIED | P3 |
| `/admin/crm/discovery` | Discovery submissions | Built | `/api/crm/discovery-submissions` | OpenAI (proposal gen) | — | Upstream `/discovery` form never submits, so this queue only receives V1 API posts | LIVE AND CERTIFIED | P1 (upstream) |
| `/admin/crm/intake-cases` | AI Intake Scoring | Built | `GET /api/intake/cases` | — | — | No empty state | LIVE AND CERTIFIED | P2 |
| `/admin/crm/receptionist-accounts` | Receptionist Accounts | Flat table (plan, conversationCount, limit, twilioNumber) | `GET /api/admin/receptionist-accounts` (unbounded, no search) | — | — | No per-firm status/health page; no link to diagnostics | PARTIALLY IMPLEMENTED | **P0 (admin visibility for beta)** |
| Receptionist status (per firm) | **MISSING** | — | `GET /api/admin/voice/firms/:id/diagnostics` exists (subscription, usage, cap, open issues, numbers) | — | — | UI over the diagnostics route | BACKEND ONLY | **P0** |
| Usage and cost | **MISSING** | — | per-firm usage only; **no cost anywhere**; no cross-firm roll-up | — | — | Cross-firm usage list + cost model | BACKEND ONLY / PLANNED | P1 |
| Issues (ops) | **MISSING** | — | `/metricz` gives one platform integer; no `GET /admin/voice/issues` | — | — | Cross-firm issues feed + resolve | PLANNED | **P0 (minimal support view)** |
| Clients / workspaces | **MISSING** (`/admin/crm/workspace` is a sales workspace) | — | `intake_firms` is the only tenant entity | — | — | Decide whether "client" = firm | PLANNED | P1 |
| Saved views | **MISSING** | — | — | — | — | Design-doc concept only | PLANNED | P2 |
| Sidebar | CrmLayout NAV_GROUPS | 8 groups, 6 "Soon" dead items, duplicate "Lead DNA" href, **three stacked scroll regions**, no breadcrumbs | — | — | — | IA cleanup | PARTIALLY IMPLEMENTED | P1 |
| 404 under `/admin/*` | not-found in DashboardShell, no CRM nav | — | — | — | — | Real 404 | PARTIALLY IMPLEMENTED | P1 |
| Loading / empty / error / denied | Per page, inconsistent (see rows) | — | — | — | — | Standardise | PARTIALLY IMPLEMENTED | P1 |

## 6. Backend capability summary (api-server, all on `17a7056`)

49 registered env entries (21 exact-`"true"` flags, 12 secrets, 14 configs, 2 identifiers) — **every flag off, every provider secret absent in the committed contract**. Zero open public writers (`KNOWN_OPEN_ROUTES` and `OPEN_WRITERS_PENDING_AUTHORIZATION` both empty and asserted). Non-production Twilio signature bypass exists in `intakeTwilio.ts` / `lib/twilio.ts` (`NODE_ENV !== "production"`), which is fine for staging but must be remembered.

| Domain | Backend | Certified evidence |
|---|---|---|
| Receptionist auth/session | complete | SMS regression gate (login 10×401→429), staging signup |
| SMS intake receptionist | complete, protected | production product (~85 %) |
| Voice assistants publish/sync/browser-test | complete | AR-002 publish v2, AR-002C attach/HMAC; browser call **not** proven |
| Vapi webhooks, call state, tools loop | complete | AR-002B 13-case HMAC matrix; ms-timestamp fix PR #22 |
| Calendar (OAuth, free/busy, write, reconcile, booked lifecycle) | complete | **M2/M3/M4 PASS** (2026-09-02) |
| Contacts (voice side) | linker only, **no CRUD route** | — |
| Numbers / transfers / call policy | rows + routes; **no provisioning path** (provider throws) | — |
| Metering / issues / alerts / digest | complete, flags off | P7 ledger row via webhook |
| Billing / entitlements / accounts | complete, flags off | — (Stripe test clocks not run) |
| Ops / admin | roster + per-firm diagnostics + subscription mapping | — |
| Deploy / recovery | preflight, backup, restore drill, runbooks | AR-002A/B |

## 7. Dependency map

| Surface | Depends on | Notes |
|---|---|---|
| Company website | Static build only; `PUBLIC_FORM_SUBMISSIONS_ENABLED` + Resend for contact/discovery; legal approval for `/privacy` `/terms` | Hosting cutover to `sitemintdigital.com` is a separate program |
| AI Receptionist application | api-server + Postgres (intake_* / voice_* / scheduling_*); Vapi (publish, calls, webhooks); Google Calendar (OAuth per firm, free/busy, event write); Twilio voice number (inbound); Stripe (checkout, voice billing webhook); Resend (alerts, digest, account mail); `VITE_VOICE_*` build flags; 14 runtime flags | `VOICE_ARTIFACT_POLICY=none` is the only approved retention posture |
| Operations CRM | api-server admin bearer; crm_* tables (push mode); Twilio CRM credentials (protected `phone.ts`); Resend (`CRM_EMAIL_TEST_MODE`); OpenAI (copilot, proposals); Stripe (deal checkout) | Separate auth system from the customer app — never merge |
| Vapi | `VAPI_API_KEY` (server only), `VAPI_WEBHOOK_SECRET`, `VAPI_WEBHOOK_CREDENTIAL_ID`, `VOICE_SERVER_URL`, `VITE_VAPI_PUBLIC_KEY` (browser), runtime catalog | Signs with millisecond timestamps; server URL attachment is owner-gated |
| Google Calendar | `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`, `CALENDAR_TOKEN_KEY` (not silently rotatable), `CALENDAR_CONNECT_ENABLED`, `CALENDAR_WRITE_ENABLED` | Staging grant on the "Sitemint Staging" Google account; revocation is an owner action |
| Replit | Staging App `SiteMint-Voice-Staging` (Autoscale 2 vCPU / 4 GiB / 1 max) at `site-mint-voice-staging.replit.app`; production Replit still serves an older snapshot | Only Secrets reach the deployment; `.replit` run-line env is inert |
| Stripe | Replit connector credentials; three webhook secrets (CRM, receptionist, voice) | `STRIPE_BOOT_SYNC_ENABLED=false`; plan catalog undecided |
| Email (Resend) / SMS (Twilio) | Resend only, no SMTP; three Twilio credential sets (intake, CRM, voice) structurally kept apart | Intake SMS number must never be imported into Vapi |

## 8. Cost posture (Phase 0, 2026-09-03)

- Replit account spend this period (Aug 12 – Sep 11): **$24.57**, extra usage $4.54, "total remaining" $0.00 on the plan allowance. The owner's last report implied about $23.59, so roughly $1 accrued since — cost was still accumulating while idle (Autoscale cold start of 6.8 s on first probe confirms the instance was scaled to zero between requests).
- Pre-pause read-only verification: `CALENDAR_CONNECT_ENABLED=false`, `CALENDAR_WRITE_ENABLED=false` (read from the Secrets pane, values revealed for those two rows only); `/api/readyz` 200 and `/api/healthz` 200; signup 503, voice SMS inbound 503, unsigned Vapi webhook 401, `/api/metricz` 404; no customer traffic (staging holds one synthetic firm, zero sessions per the M4 certification §8); database parity restored 2026-09-03 (M4 §7–8).
- Action taken: **Publishing → Manage → Pause** on the staging deployment only. Replit's own label on that control reads "Your billing will continue, but all users will lose access to your app"; "Shut down" (which cancels billing) was **not** used because it destroys the deployment. Post-pause probe: `/api` and `/api/readyz` now return 404 from the edge.
- Nothing else touched: App, database, Secrets, phone number, Vapi assistants, credentials and tools are all intact. Resume is one click; note that Resume brings back the previous revision first (AR-002B lesson).
- Manual owner action if further savings are wanted: decide whether the staging deployment should be shut down entirely (destructive, re-publish required later) — not authorised in this session.

## 9. Known defects (code-verified on `17a7056`)

1. `/discovery` never submits — every "Start a Project" CTA ends in a form that saves to localStorage only, while `/work` and `/about` claim otherwise.
2. `booked` appointments have no cancel/reschedule control; the entire calendar router (approve, cancel, reschedule, reconcile, Google connect/disconnect) has zero frontend callers.
3. Flag-off asymmetry: `/assistants`, `/appointments`, `/logs` show the capability state, but `/assistants/new*`, `/assistants/:id/*`, `/logs/:id` and all ComingSoon paths 404.
4. Availability/appointment types are reachable only under the voice build flag although they have no voice dependency.
5. Calendar OAuth callback redirects to `/settings?calendar=connected`; Settings ignores the query.
6. `not-found.tsx` (both apps) is a developer placeholder; public one has no links.
7. `/pricing` and `/contact` ship the V2 prototype with its own nav and a "24/7" claim, behind a dead flag.
8. CRM lead-status taxonomy split (legacy vs canonical) breaks smart lists and the "new lead" notification; several unguarded `.toLowerCase()` / `.tags.length` crashes on null data.
9. CRM: no client-side auth guard, Lead DNA has no 401 redirect, pollers swallow 401.
10. Nested scroll regions: helpdesk rail (1) and CRM (3 stacked).
11. Mobile nav group "Company" contains Work / Process / Company.
12. AI Receptionist pill duplicates the mega-panel card.
13. Contacts page issues no request; no contacts backend for the receptionist product.
14. Perf: home mobile TBT 272 ms, mobile LCP 2.77–2.99 s (SPA bootstrap; prerender needs hosting rewrite config).

## 10. Deferred features (recorded, not lost)

Integrations marketplace · human transfer UI · SMS for voice product (Stage 6, owner policy) · Vapi tools/knowledge/squads/outbound/analytics/testing/structured outputs · API keys · saved views · multi-user login (roster exists, auth change unauthorised) · entitlement enforcement · transcript retention beyond `none` · hero film (8,400 credits, gated) · Insights content · case studies.

## 11. Verification run (2026-09-03, fresh Linux tree of `17a7056`)

| Gate | Result |
|---|---|
| Workspace typecheck | exit 0 |
| Full test suite (`pnpm run test`) | exit 0 — api-server 39 files / 1,009 tests; 2,290 PASS lines across the contract suites |
| Production builds | web-agency + helpdesk (canonical) byte-identical to the R1 dists; helpdesk voice-platform variant built for mode B (91 files) |
| Built-output boundary scan | helpdesk canonical 73 files / 0 leaks; voice variant 91 files / 0 leaks (the CI rule targets the helpdesk dist; the CRM legitimately mentions Twilio) |
| Secret scan | 1,266 tracked files, 0 findings |
| Protected files | 0 lines of diff vs main across all 16 |
| Route sweep, mode A | 34 routes × 5 widths (360/768/1024/1440/1920) = 170 combinations; 0 horizontal overflow; 0 nested scroll regions; only console entries are the expected 401s from the unattached backend |
| Route sweep, mode B dashboard | 19 routes × 5 widths = 95 combinations, 0 overflow, 0 console errors; **nested scroll region `.sd-rail__nav` present at 360, 1024 and 1440 on every dashboard page**, plus a second region (`main#sd-main`, or the builder's `div.min-w-0.flex-1`) on Overview, SMS receptionist, Settings, 404 and all builder tabs; no breadcrumbs anywhere; `aria-current` correct on every sidebar route, absent on coming-soon pages |
| Route sweep, mode B dashboard states | fresh / empty / locked / error / denied / slow at 360 + 1440 — 0 overflow, 0 console errors in fresh/empty/locked (error/denied/slow captured for the workbook) |
| Route sweep, mode B CRM | 28 routes × 3 widths = 84 combinations captured, 0 console errors (probe metrics re-run separately) |
| Keyboard / focus / Escape / anchors / reduced motion (site) | 26 checks, 0 failures |
| CI on the exact head | `gates` ✔ and `voice-matrix` ✔ (20/20 variants) — reused as durable evidence |

## 12. Legal blockers

- Privacy Policy and Terms: honest drafts, **no counsel review** — blocking for public production (LAUNCH-CHECKLIST.md).
- Recording/transcript posture: `none` is the only approved policy; any change is an owner + legal decision.
- Google OAuth verification for a production client id (consent screen, scopes) is an owner task not yet started.
