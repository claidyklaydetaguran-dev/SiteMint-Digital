# SiteMint Project Discovery System — Product Requirements Document

> Documentation-only checkpoint. Phase 2C.2A. No application code, component,
> route, database schema, migration, package, lockfile, environment variable,
> or Privacy/Terms page was changed to produce this document. No real form was
> submitted, no real email was sent, no real CRM record was created, and no
> live AI provider was invoked. Implementation is **not approved** by this
> document; see §44.

Baseline: branch `claude/sitemint-phase-2c2a-audit-euthts`, HEAD
`489d6f332c3acbaf6f0a63296c53ce31f24485d6`, parent
`63e1f51a3b0d4fb54312b4dc11a827243bf06ea1`. Builds on
`PLATFORM_PREVIEW_RELEASE_AUDIT.md` §20/§23 (Checkpoint 2C.1) and
`ACTIVATION_READINESS_AUDIT.md`, which both identified the current Discovery
form as a Level 3/4 activation blocker.

> **Corrected by Checkpoint 2C.2A.1** (documentation-only). Owner review of
> the original database/reliability model (§18, §26–§29) found the
> two-table-plus-status-columns design too fragile to durably back the
> asynchronous, retried, duplicate-safe, operator-visible delivery this PRD
> promises. §16–§19, §24–§29, §34, §37, and §41–§43 were corrected in place
> to a three-table model (`discovery_submissions`, `discovery_delivery_jobs`,
> `discovery_ai_briefs`) backed by a transactional outbox and a separately-
> running delivery worker; the frontend-to-legacy-endpoint direction and the
> fingerprint-uniqueness direction were also corrected. The current-state
> audit (§8–§11) is unchanged evidence from Checkpoint 2C.2A and was not
> re-derived. No implementation occurred in either checkpoint.

> **Further corrected by Checkpoint 2C.2A.2** (documentation-only). Owner
> review found three remaining gaps in the 2C.2A.1 model: `discovery_ai_briefs`
> was still described as one row per provider attempt rather than one row
> per brief *version*, and its creation was not guaranteed to be
> transactional when AI generation is enabled; the same-idempotency-key,
> different-payload case returned a misleading ordinary-success response
> instead of a distinct conflict; and the HMAC duplicate fingerprint had no
> defined secret/rotation model. §18, §19, §22–§30, §34, §37, and §41–§43
> were corrected in place: `discovery_ai_briefs` now models one row per
> brief version with transactional enqueue; same-key/different-payload now
> returns `409 idempotency_conflict`; likely-duplicate submissions withhold
> downstream jobs under a conservative v1 policy until operator resolution;
> `DISCOVERY_FINGERPRINT_HMAC_KEY`/`DISCOVERY_FINGERPRINT_KEY_VERSION` are
> documented (not added); and fail-open/fail-closed language for missing
> config vs. runtime store outage vs. Turnstile unavailability was made
> precise and distinct. The three-table model and delivery-job architecture
> from 2C.2A.1 are unchanged. The current-state audit (§8–§11) remains the
> unchanged evidence from Checkpoint 2C.2A. No implementation occurred in
> any of the three checkpoints.

> **Further corrected by Checkpoint 2C.2A.3** (documentation-only). Owner
> review found three remaining implementation-contract gaps: the PRD
> defined different behavior for same-key/same-payload vs. same-key/
> different-payload but never defined how payload sameness is determined;
> rotation was described as using a "current and previous" HMAC key but
> only one key variable was ever documented, making rotation as described
> unimplementable; and `duplicateReviewStatus` did not distinguish a
> submission cleared as legitimate from one confirmed as a real duplicate
> — two outcomes with opposite downstream effects. §18, §19, §24–§26,
> §29, §30, §34, §37, §38, and §41–§43 were corrected in place: a
> canonical, HMAC-based idempotency-payload digest with explicit domain
> separation from the duplicate fingerprint now determines payload
> sameness; `DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY`/`DISCOVERY_
> FINGERPRINT_PREVIOUS_KEY_VERSION` (documented, not added) make key
> rotation actually configurable, with defined startup validation;
> `duplicateReviewStatus` now has four states (`none`/`pending`/`cleared`/
> `confirmed_duplicate`) with `cleared` triggering exactly-once withheld-
> job creation and `confirmed_duplicate` staying permanently suppressed;
> and a workable operator review path for pending duplicate reviews is
> now a documented precondition for public activation. The three-table
> model, delivery-job/AI-brief architecture, transactional outbox, and
> `409 idempotency_conflict` contract from 2C.2A.1/2C.2A.2 are unchanged
> except for their documented interaction with duplicate resolution. The
> current-state audit (§8–§11) remains the unchanged evidence from
> Checkpoint 2C.2A. No implementation occurred in any of the four
> checkpoints.

---

## 1. Executive Summary

The current `/discovery` form is a loosely-structured, 45-field, single
free-form React component with almost no server-side validation, no
anti-abuse controls, dead-link legal pages, and unreliable delivery
semantics. It cannot safely receive public or paid traffic. This PRD defines
its replacement: the **SiteMint Project Discovery System**, a public-facing
"Start Your Project" experience built as a deterministic, conditionally
branching, multi-step intake with a shared typed contract, safe server-side
validation, staged anti-spam protection, a reliable storage-first submission
model, and an optional, strictly non-blocking AI-generated internal brief
that is always subordinate to the client's original answers. This document
is planning only — no code changes result from it.

## 2. Product Decision

Replace the ad hoc Discovery form with a structured, schema-driven,
multi-step Project Discovery System, publicly labeled **Start Your Project**,
implemented across five future checkpoints (2C.2B–2C.2F). The existing
`/discovery` route and `POST /api/discovery/submit` endpoint remain live and
unmodified until the new system is validated end-to-end and explicitly
approved to replace them (see §12, §17 transition plan).

## 3. Problem Statement

The current form collects broad, low-structure data that cannot reliably
support estimation, technical scoping, or a future AI-assisted brief; it
lacks required-field enforcement past step 1, has no bot/spam defense, has a
dead success-screen code path, does not gate success on a stored record, and
links to Privacy/Terms destinations that do not exist. These gaps block
Level 3 (public homepage) and Level 4 (paid traffic) activation per the
Checkpoint 2C.1.1 release-readiness classification.

## 4. Goals

- Replace unstructured free text with a typed, versioned, conditionally
  branching intake covering business qualification, technical discovery,
  scoping, workflow analysis, and decision context.
- Make storage of the client's original answers the sole definition of
  submission success; make every downstream step (email, CRM, AI) optional
  and non-blocking.
- Add staged, accessible, privacy-respecting anti-abuse protection.
- Keep the system fully usable with zero AI dependency.
- Produce a shared contract reusable by future PRD generation and
  discovery-call prep tooling.

## 5. Non-Goals (this checkpoint)

No code, schema, migration, route, component, environment variable, package,
or legal page is created or modified. No pricing is finalized. No AI
provider is selected or invoked. No file-upload feature is designed for v1
(see §First-version exclusions). No receptionist/voice work is included.

## 6. User Experience Principles

Guided, not conversational-first; deterministic branching over chat; 3–6
substantial questions visible at once; visible progress; editable review
before submission; safe loading/retry/duplicate-click handling; works with
AI fully unavailable; plain-language review summary; no internal
scoring/labels shown to the prospect.

## 7. Ethical Decision-Context Principles

Decision-context questions ("why now," "what happens if not solved," "what
would success feel like") are collected as ordinary business-qualification
questions with neutral, non-manipulative labels — never "Emotional Driver,"
"Pain Manipulation," "Buyer Psychology," or "Fear Analysis," publicly or in
code identifiers exposed to the client. Any AI-inferred motivation is stored
separately, labeled `AI-generated interpretation — requires human review`,
never presented as diagnosis, never used to auto-reject, auto-price, or
auto-pressure a prospect, and never allowed to override what the client
actually said. See §29.

## 8. Current Implementation (audit)

| # | Item | File / Location | Classification | Evidence | Blocks |
|---|---|---|---|---|---|
| 1 | Public form component | `artifacts/web-agency/src/pages/Discovery.tsx` | verified implemented | 11-step, `TOTAL_STEPS=11`, ~45 fields | — |
| 2 | Form route | `/discovery`, no main `Layout`, `App.tsx:123` | verified implemented | own top bar | — |
| 3 | Visible fields | `Discovery.tsx:33-48` `FormData` interface | verified implemented | business, project type, site feedback, goals, decision drivers, audience, features, content/branding, timeline, budget, free text | — |
| 4 | Hidden fields | none found | not applicable | no honeypot/hidden inputs | Level 3/4 |
| 5 | Required fields | `companyName`, `contactName`, `email`, `industry` (step 0), `services` (step 1) | partially implemented | `validate()` lines 549-562 | Level 3 |
| 6 | Optional fields | remaining ~40 fields | verified implemented | no enforcement steps 2-10 | — |
| 7 | Client-side validation | ad hoc `.trim()`/`includes("@")`/array length | partially implemented | not schema-based, unlike `Contact.tsx` (zod) | Level 3 |
| 8 | Submission handler | `handleSubmit`, `Discovery.tsx:577-593` | verified implemented | `fetch POST /api/discovery/submit` | — |
| 9 | API endpoint | `artifacts/api-server/src/routes/discovery.ts`, registered `routes/index.ts:3,26` | verified implemented | — | — |
| 10 | HTTP method | `POST` | verified implemented | — | — |
| 11 | Request payload | full `FormData` JSON, no envelope/versioning | verified implemented | — | Level 3 |
| 12 | Server-side schema validation | manual truthy checks only (3 fields) | placeholder | `discovery.ts:13-16`; `insertDiscoverySubmissionSchema` (drizzle-zod, `lib/db/src/schema/submissions.ts:57`) exists but **unused** | Level 3 (dead code) |
| 13 | Normalization | `String()` coercion only | missing | no email/phone/URL normalization | Level 3 |
| 14 | Body-size handling | Express default 100kb, uncustomized | partially implemented | `app.ts:60` | Level 4 |
| 15 | Database persistence | two tables written redundantly | verified implemented (redundant) | `discovery_submissions` + `form_submissions`, `lib/db/src/schema/submissions.ts:5-55` | Level 3 (architecture debt) |
| 16 | CRM persistence | none on public submit | missing (by design — manual only) | `crmDiscovery.ts`, `requireAdmin`-gated, admin-triggered only | Open question §41 |
| 17 | Email acknowledgment | sent synchronously via Resend | verified implemented | `email.ts:93-153` | Level 3 (failure semantics) |
| 18 | Internal notification email | sent synchronously, hardcoded recipient | verified implemented | `TEAM_EMAIL = "info.sitemint@gmail.com"`, `email.ts:14` | Level 3 (should be env var) |
| 19 | Success response | `201 {success:true, id}` | verified implemented | `discovery.ts:89` | — |
| 20 | Failure response | generic `400`/`500`, no leak | verified implemented | `discovery.ts:14`; stack logged server-side only | — |
| 21 | Logging | `req.log.warn/error` | verified implemented | no redaction policy documented | Level 4 |
| 22 | Retry behavior | none client or server | missing | — | Level 4 |
| 23 | Duplicate-submission handling | none | missing | no dedupe key | Level 3/4 |
| 24 | Idempotency | none | missing | — | Level 3/4 |
| 25 | Rate limiting | none on this route | missing | `authRateLimit.ts` wired to auth only | Level 4 (Level 3 recommended) |
| 26 | Honeypot | none | missing | — | Level 3 |
| 27 | Time trap | none | missing | — | Level 3 |
| 28 | CAPTCHA/Turnstile | none | missing | — | Level 4 |
| 29 | Bot classification | none | missing | — | Level 4 |
| 30 | Privacy disclosure near form | none | missing | — | Level 3 |
| 31 | Privacy link | dead `<span>`, no route | dead code | `Footer.tsx:64-65`; no `/privacy` route | Level 3 |
| 32 | Terms link | dead `<span>`, no route | dead code | `Footer.tsx:64-65`; no `/terms` route | Level 3 |
| 33 | Communication consent | none | missing | — | Level 3 |
| 34 | Analytics events | none fired | missing | no `gtag`/`fbq`/`dataLayer` calls found | Level 4 |
| 35 | Environment variables | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | verified implemented | `email.ts` | — |
| 36 | Raw-error exposure | none observed | verified implemented (safe) | generic messages only | — |
| 37 | Dead code | `SuccessScreen()` never reached | dead code | `Discovery.tsx:486-521`; app always navigates to `/thank-you` instead | cleanup, non-blocking |
| 38 | Unreachable code | same as above | dead code | — | — |
| 39 | Placeholder behavior | Privacy/Terms links | placeholder | — | Level 3 |
| 40 | Deployment assumptions | none documented for this flow | verification pending | no release-engineering plan exists (per 2C.1.1) | Level 3/4 |

Contact form (`Contact.tsx` / `POST /api/contact/submit`) shares the same
backend weaknesses (no rate limit, only 2 truthy-field server checks despite
client-side zod) and is noted for parity awareness but is out of scope for
this PRD's redesign; it is not part of the Project Discovery System.

## 9. Current Data Flow

`Discovery.tsx` (client state, no schema) → `fetch POST /api/discovery/submit`
→ `discovery.ts` (3-field truthy check) → **synchronous** dual DB insert
(`discovery_submissions`, `form_submissions`) → **synchronous** Resend calls
(internal + client ack, failures swallowed into a status flag but do not
affect the HTTP response) → `201` → client navigates to `/thank-you`. CRM
lead creation is a separate, later, manual admin action against
`discovery_submissions`, not part of this flow.

## 10. Current Field Inventory

See §8 items 3–7 for the qualitative summary; the full quantitative
field-by-field table (all ~45 existing `FormData` keys mapped to type,
required/optional, and destination table/column) is produced as
`current-field-inventory.txt` in the owner-review package (§ Owner-Review
Package) rather than reproduced here, to keep this document navigable. The
proposed field set is in §11/§16 (Data Inventory) and `proposed-field-
inventory.txt`.

## 11. Current Gap Analysis

Highest-severity gaps, ranked:

1. No real server-side schema validation (dead zod schema exists but unused).
2. No anti-spam/anti-bot controls of any kind on a public POST endpoint.
3. Dead Privacy/Terms destinations — cannot legally activate publicly.
4. No duplicate/idempotency protection — retries or double-clicks create
   duplicate leads across two tables.
5. Redundant dual-table writes — no clear source of truth.
6. Hardcoded internal notification recipient (should be environment-driven).
7. No rate limiting — a public endpoint is currently abuse-exposed.
8. Unstructured single-object payload — cannot safely support future AI
   processing or PRD generation without redesign.
9. Dead `SuccessScreen` component — low severity, cosmetic/maintainability.
10. No tests anywhere in the submission path.

## 12. Target Information Architecture

Seven categories, deliverable as seven visible steps (may combine 2 closely
related steps if UX testing supports it, per task direction — no category
may be dropped):

1. **Project direction** — one primary type (see options list in the
   original task brief: new website, redesign, web application, customer
   portal, internal CRM, business operations system, AI receptionist,
   workflow automation, SEO/AI-search visibility, maintenance/support,
   multiple connected systems, not sure yet) + optional secondary interests.
   Primary type drives conditional branching in step 4.
2. **Business and audience** — org name, industry, current website,
   service area, description, primary/secondary audience, business stage
   (preparing to launch / newly operating / established / growing /
   rebranding / replacing an existing system / expanding into a new
   market), team size range, business model, products/services. No
   sensitive financial records.
3. **Problem, impact, urgency, desired outcome** — current situation,
   primary problem, customer impact, team impact, current manual work,
   missed opportunities, why-now, urgency trigger, consequence of delay
   (framed neutrally, never fear-based), desired business/customer/
   operational outcome, success definition, one required primary goal +
   multiple optional secondary goals from the goal-choice list in the task
   brief.
4. **Features, users, workflows** — branches by project-type selected in
   step 1: website/redesign question set, web-application question set,
   CRM/automation question set, or AI-receptionist question set (all
   enumerated in the task brief; AI-receptionist branch must not describe
   unimplemented voice capability as available). Every selected feature
   gets a priority: Must have for launch / Important after launch /
   Exploring / Not sure — modeled without duplicating the feature across
   fields (see §16 shared contract `projectScope`).
5. **Content, design, technical readiness** — logo/brand/content/photo/
   video status, reference sites, design preferences/dislikes, domain/
   hosting/current-platform/CRM/email/scheduling status, migration needs,
   integrations, accessibility/language/privacy/regulatory needs,
   technical/content owner, reference links (not file uploads — see §First-
   version exclusions).
6. **Timeline, investment, decision process** — launch window, target
   date, firm/flexible, deadline reason, investment range (configurable
   Starter/Growth/Premium/Custom/Not sure — see §41 open question on
   approved ranges), investment-approved flag, decision makers, final
   approver, vendor/procurement involvement, support-model preference,
   discovery availability, preferred start period. No auto-rejection by
   investment range.
7. **Contact, consent, final review** — name, title, business email,
   phone, preferred contact method/time, time zone, referral source,
   required privacy acknowledgment, required operational-contact consent,
   separate optional marketing consent, editable plain-language review
   summary with per-section edit links (example format per task brief),
   submission agreement. No internal scores/AI interpretations/spam
   classification ever shown here.

## 13. Conditional Branching Model

Branching is driven by two fields: `projectDirection.primaryType` (selects
the step-4 question set) and step-4 answers that unlock narrower follow-ups
(e.g., selecting "payments" in the website branch reveals a payment-provider
preference question). Branching configuration is data-driven (see §17
`stepConfig`/branching config), not embedded in component conditionals, so
new project types can be added without new step components. Full branching
map is produced as `conditional-branching-map.txt` in the owner-review
package.

## 14. Target Shared Data Contract

Directional `DiscoverySubmission` type (per task brief), refined to this
repo's existing conventions — mirrors how `lib/db/src/schema/submissions.ts`
already pairs a Drizzle table with a drizzle-zod insert schema
(`insertDiscoverySubmissionSchema`), and how `Contact.tsx` already uses zod
for a form schema. The refined direction:

- Single source of truth for the shape lives in a shared package location
  (candidate: `lib/api-zod/` or a new `lib/discovery-schema/`, decided in
  2C.2B against the existing Orval codegen chain — see §17) — **not**
  duplicated between `artifacts/web-agency` and `artifacts/api-server`.
  Frontend and backend both import the same zod schema; TypeScript types
  are inferred (`z.infer<...>`), never hand-duplicated.
- Every field in the task brief's directional type is kept, grouped by the
  same seven-category namespacing (`projectDirection`, `business`,
  `decisionContext`, `projectScope`, `readiness`, `commercial`, `contact`,
  `consent`, `antiAbuse`), avoiding a single flat `answers: any` blob.
  `selfReportedMotivations` (client-stated) stays distinct from any future
  AI-inferred motivation field, which lives in a **separate** brief record
  (§29), never inside `decisionContext`.
- No `any` types; enums use zod `z.enum` matched to the option lists in
  §12; free-text fields get explicit `min`/`max` length constraints (§21).
- `schemaVersion` is a required top-level field (§15).

## 15. Schema and Versioning Strategy

- `schemaVersion` (e.g., `"1.0.0"`) stamped on every submission at creation;
  incremented on any field addition, removal, or semantic change to the
  contract.
- `formVersion` tracks the UI question set independently from the schema
  (copy/order changes without a data-shape change bump `formVersion` only).
- AI-brief prompts get their own `aiBriefPromptVersion` (§29), independent
  of both.
- Historical submissions render using the schema version they were stored
  with; the admin UI must be able to display older versions without
  crashing on missing newer fields (additive-only migrations, matching the
  root `CLAUDE.md` rule for `intake_*`/`crm_*` tables and the voice-table
  migration convention in `lib/db/MIGRATIONS.md`).
- No destructive migration is ever applied to stored submissions;
  compatibility is handled in the read/render layer, not by rewriting old
  rows.

## 16. Target Frontend Architecture (documented only, not created)

| Path (proposed) | Responsibility |
|---|---|
| `artifacts/web-agency/src/pages/StartProjectPage.tsx` | Route shell, mounts `DiscoveryFormShell`, owns nothing else |
| `artifacts/web-agency/src/components/discovery/DiscoveryFormShell.tsx` | Step sequencing, progress, back/continue, draft save/restore orchestration |
| `artifacts/web-agency/src/components/discovery/steps/*.tsx` (7 files) | One component per category, own only their own field rendering + local validation display |
| `artifacts/web-agency/src/components/discovery/stepConfig.ts` | Declarative step list + branching rules (data, not JSX) |
| `artifacts/web-agency/src/components/discovery/fields/*.tsx` | Shared field primitives (text, select, multiselect, priority-picker) with built-in label/error/aria wiring |
| `artifacts/web-agency/src/components/discovery/ReviewSummary.tsx` | Read-only plain-language summary + per-section edit links; no business logic |
| `artifacts/web-agency/src/components/discovery/useDiscoveryDraft.ts` | Draft persistence hook (storage choice decided in 2C.2C — see privacy evaluation below) |
| `artifacts/web-agency/src/lib/discoverySchema.ts` (or shared package per §14) | Single validation source, imported by shell + field components |

Ownership boundaries: step components own field rendering only; `stepConfig`
owns branching; `discoverySchema` owns validation; `DiscoveryFormShell` owns
step-sequencing state and submission lifecycle (loading/error/duplicate-
click-guard/success), not field data itself (each step owns its own slice,
lifted only at review/submit time). No single component holds the entire
form as one giant state blob with inline business rules in JSX, correcting
the current `Discovery.tsx` anti-pattern. Draft autosave: evaluate
`sessionStorage` (cleared on tab close, lower persistence-privacy risk) as
the default recommendation over `localStorage` (persists indefinitely,
higher risk of stale PII sitting on a shared/public machine); recommend
`sessionStorage` with an explicit user-visible "save and resume" opt-in
before ever using `localStorage`, and recommend excluding highly sensitive
free-text fields (none are collected per §First-version exclusions, so this
is a smaller risk than typical, but business-description text is still PII-
adjacent and should be considered for redaction-on-persist evaluation in
2C.2C).

**Correction (2C.2A.1):** the 2C.2C frontend must **not** submit to the
legacy `POST /api/discovery/submit` endpoint — that endpoint accepts the
old unstructured payload and lacks the required server-side validation and
security controls this redesign exists to fix. During 2C.2C, the shell
uses a local typed mock adapter or an intentionally disabled submit action
(kept behind the inactive preview gate). It connects to the real
`POST /api/v1/discovery-submissions` endpoint only once that endpoint
exists and is hardened (2C.2D). No production submission may occur before
then.

## 17. Target Backend Architecture (documented only, not created)

| Path (proposed) | Responsibility |
|---|---|
| `artifacts/api-server/src/routes/v1/discoverySubmissions.ts` | Thin route: parse, call controller, map result to HTTP |
| `artifacts/api-server/src/controllers/discoverySubmissionController.ts` | Orchestrates validation → service → response mapping |
| `artifacts/api-server/src/services/discoverySubmissionService.ts` | Business logic: normalize, dedupe/idempotency check, **one database transaction that inserts the submission row and its required `discovery_delivery_jobs` rows together** (transactional outbox — see §18/§26) |
| shared schema (per §14) | Request/DTO validation, imported by controller, not redefined |
| `artifacts/api-server/src/lib/discoveryAntiSpam.ts` | Honeypot + time-trap + rate-limit + fingerprint evaluation, isolated from business logic |
| `artifacts/api-server/src/workers/discoveryDeliveryWorker.ts` (corrected 2C.2A.1, replaces the earlier `jobs/discoveryDelivery.ts` fire-and-forget direction) | Durable processor that polls/claims `pending`/`retry_scheduled` rows in `discovery_delivery_jobs` and executes each job type (client acknowledgment, internal notification, CRM upsert) independently, with locking and bounded retry. Runs as a separate process/scheduled task from the request path — never invoked synchronously inside the submission request. |
| `artifacts/api-server/src/jobs/discoveryAiBrief.ts` | AI-brief generation, async, isolated, never in the request's critical path |

**Correction (2C.2A.1):** the previous direction described delivery as an
"async job triggered post-commit" inside the request lifecycle. That is
not durable — a process restart, deployment, or crash between commit and
job execution would silently lose the notification/CRM work while the
submission itself still shows as received. The corrected direction is a
transactional outbox: the submission and its required delivery-job rows
are committed together in the same transaction (§18/§26), and a
separately-running worker picks up pending jobs afterward. If no worker is
running, jobs simply remain `pending` in the database rather than being
lost — they are recovered whenever a worker (or an operator's manual
retry) next runs. Smallest viable worker options for this stack — a
dedicated worker process, a scheduled database poller, a deployment-
platform scheduled task, or a controlled admin manual-retry action as a
temporary fallback — are compared in 2C.2B/2C.2E without committing to one
until verified against the actual deployment environment; no worker is
implemented in this checkpoint.

Endpoint direction: `POST /api/v1/discovery-submissions`. Transition plan
for the existing `POST /api/discovery/submit`: keep it live and unmodified
through 2C.2B–2C.2E; introduce the new versioned endpoint alongside it
behind the same platform-preview-style safe gate used for the frontend
(§19); once the new frontend is validated in controlled preview (Level 2)
and the new endpoint has parity plus improvements, deprecate the old route
with a documented sunset checkpoint — do not remove it in the same
checkpoint that introduces the replacement. This mirrors the existing
protected-file/back-compat discipline already used for `intakeAgent.ts`-
style routes in root `CLAUDE.md`.

## 18. Target Database Model

**Corrected in 2C.2A.1.** The original recommendation (two tables, with
delivery state as status columns on `discovery_submissions`) is too
fragile for the reliability behavior this PRD promises: asynchronous,
independently-retried, duplicate-safe, provider-tracked, operator-visible
delivery for two separate emails plus CRM handoff cannot be represented by
a handful of enum columns on the submission row. A single `emailStatus`
column cannot distinguish "client acknowledgment sent, internal
notification still retrying" from the reverse, cannot hold a provider
message ID for either message independently, and cannot hold attempt
counts or next-retry times at all.

Recommendation: **three tables**, not two and not the maximal four from
the original task brief:

- `discovery_submissions` — immutable source of truth for the client's
  original structured answers, plus the searchable operational record.
  Normal columns: submission ID, `schemaVersion`, `formVersion`,
  normalized contact fields (name, email, phone), normalized business
  fields (name, industry, etc.), project type, launch window, investment
  range, consent records + timestamps, privacy-policy version, anti-spam
  classification, idempotency key (unique), duplicate fingerprint
  (indexed, not unique — see below), **`fingerprintKeyVersion`** (added
  2C.2A.2, non-secret — records which HMAC key version produced the
  stored fingerprint, see the fingerprint-secret documentation below),
  **`idempotencyPayloadHash`, `idempotencyPayloadHashKeyVersion`,
  `idempotencyCanonicalizationVersion`** (added 2C.2A.3 — see the
  canonical idempotency payload documentation below), high-level intake
  status (§19), **`duplicateReviewStatus`** (**corrected 2C.2A.3 — four
  states, not three: `none`/`pending`/`cleared`/`confirmed_duplicate`,
  see §24 Correction 4**), **`duplicateOfSubmissionId`,
  `duplicateResolvedAt`, `duplicateResolvedBy`, optionally
  `duplicateResolutionReasonCode`** (added 2C.2A.3 — see §24), an
  optional linked CRM lead ID, created/updated timestamps. JSONB for the
  full structured answers (`projectScope`, `readiness`, `decisionContext`
  detail, etc.). This single table replaces both current
  `discovery_submissions` and `form_submissions` for this flow —
  eliminates the redundant write. AI interpretations are never stored
  inside this row or its JSONB (§29).

- `discovery_delivery_jobs` (**not** `discovery_delivery_attempts`) —
  one row represents one durable downstream processing obligation, not
  one attempt-event. Job types for v1: `client_acknowledgment_email`,
  `internal_notification_email`, `crm_lead_upsert` — kept as three
  distinct job types (and three distinct rows per submission) rather than
  merged into a single email status, because the two emails have separate
  recipients, provider IDs, attempt histories, and failure states. Fields:
  `id`, `submissionId` (FK), `jobType`, `status`, `idempotencyKey`,
  `attemptCount`, `maxAttempts`, `nextAttemptAt`, `lockedAt`, `lockedBy`,
  `providerMessageId`, `lastErrorCode`, `lastErrorAt`, `createdAt`,
  `updatedAt`, `completedAt`. Statuses: `pending`, `processing`,
  `retry_scheduled`, `completed`, `permanently_failed`, `cancelled`. Only
  a sanitized failure classification/code is stored in `lastErrorCode` —
  never a raw provider response body, secret, stack trace, or the full
  form payload. Uniqueness: a unique constraint on `(submissionId,
  jobType)` — chosen over a separate deterministic per-job idempotency key
  because each submission needs at most one row per job type by
  construction (the transaction that creates the submission also creates
  exactly one job row per required job type, §26), so the compound key is
  sufficient to prevent duplicate job creation without an extra generated
  value. The row's own `idempotencyKey` field exists for the *delivery
  attempt itself* (e.g. passed to the email/CRM provider as their
  idempotency token where supported), distinct from the `(submissionId,
  jobType)` uniqueness that prevents duplicate job rows. A future
  `discovery_delivery_events` table (immutable, attempt-by-attempt audit
  log) is explicitly deferred — added only when SiteMint's operational
  history needs genuinely require it beyond what `attemptCount` +
  `lastErrorCode` + `lastErrorAt` already provide.

- `discovery_ai_briefs` — **corrected in 2C.2A.2: one row per brief
  *version*, not one row per provider attempt.** Retries for the same
  brief version update the same row (via `attemptCount`); a deliberate
  regeneration creates a new versioned row (`briefVersion + 1`) and never
  overwrites an older generated or reviewed brief. FK to
  `discovery_submissions.id`. Fields: `id`, `submissionId`,
  `briefVersion`, `promptVersion` (renamed from `aiBriefPromptVersion` for
  consistency with `briefVersion`), `provider`, `model`, `status`,
  `attemptCount`, `maxAttempts`, `nextAttemptAt`, `lockedAt`, `lockedBy`,
  `lastErrorCode`, `lastErrorAt`, `structuredOutput`, `humanReviewStatus`,
  `reviewedBy`, `reviewedAt`, `createdAt`, `updatedAt`, `completedAt`.
  Statuses: `pending`, `processing`, `retry_scheduled`, `generated`,
  `permanently_failed`, `cancelled`. Human-review statuses:
  `pending_review`, `approved`, `changes_requested`, `rejected`,
  `superseded` (set on an older version when a newer one is generated).
  Uniqueness: a unique constraint on `(submissionId, briefVersion)` —
  chosen for the same reason as the delivery-job compound key (§ above):
  the process that creates a brief version does so exactly once per
  version by construction. Only a sanitized failure code is stored in
  `lastErrorCode` — never a raw provider response body. Kept structurally
  separate from the submission row specifically so AI content can never be
  written into the same JSON blob as client-supplied answers (§29
  requirement).

  **Durable AI enqueue (corrected 2C.2A.2):** when AI brief generation is
  enabled for accepted submissions, the transaction that creates
  `discovery_submissions` and its required `discovery_delivery_jobs` rows
  (§26) also creates one `pending` `discovery_ai_briefs` row for
  `briefVersion 1`, in the **same transaction** — not a separate step
  after commit. This closes the same durability gap already fixed for
  email/CRM in 2C.2A.1: without a transactional enqueue, an AI-generation
  intent could be lost on a crash between commit and the (previously
  undefined) point where an AI row would have been created. AI generation
  itself remains non-blocking and is processed later by its own worker
  path (§29) — only the *record* of the intent to generate is durable and
  transactional, not the generation itself. When AI brief generation is
  disabled, no AI row is required during submission and submission
  acceptance is unaffected; an authorized operator may later create a
  `pending` brief-version row through a separately-approved workflow (not
  defined in this checkpoint). AI generation is **not** modeled as a
  fourth `discovery_delivery_jobs` job type — `discovery_ai_briefs` itself
  is the durable work record for AI generation, distinct from delivery
  obligations.

`discovery_status_events` remains out of scope for v1, as in the original
recommendation — the per-job `discovery_delivery_jobs` row already carries
enough retry/failure state for v1 operations; a full immutable event log
is deferred alongside `discovery_delivery_events` above.

**Idempotency and fingerprint correction (2C.2A.1):** the original
"unique index on submission fingerprint scoped to a rolling dedupe window"
is not a coherent database mechanism — an index is either unique
(permanently, rejecting any future match) or not unique (not a dedupe
mechanism by itself); it cannot be scoped to a rolling time window on its
own. Corrected approach:
  - a **unique constraint on the client-generated `idempotencyKey`** on
    `discovery_submissions` — this is what actually prevents duplicate
    rows for the *same* client action (e.g. a retried network request);
  - an **ordinary (non-unique) index on a duplicate fingerprint**, which
    is an HMAC of normalized fields (never raw email/phone/IP stored in
    plain text) — this supports fast lookups, not uniqueness;
  - a **transactional query for recent matching submissions** within the
    chosen duplicate window (e.g. 15 minutes), run inside the same
    transaction as the insert, to flag likely-duplicate *distinct*
    submissions for operator review without ever blocking or silently
    discarding them.
  Documented behavior — **the same-key/different-payload scenario is
  corrected in 2C.2A.2; see the full corrected five-scenario list in
  §24.** Summary of the correction: (2) same idempotency key + *different*
  payload no longer returns an ordinary success — it is now a distinct
  `409 idempotency_conflict` response (§24, §30); it never overwrites the
  original row and never inserts the changed payload under the reused
  key. Scenarios (1), (3), (4), (5) are unchanged from 2C.2A.1. This
  preserves the property the original two-table draft was trying to
  protect (retries and near-duplicates don't silently multiply) while
  never permanently blocking a prospect who genuinely submits an updated
  project later, and never silently accepting a materially different
  submission under a reused key as if it were the original.

**Fingerprint HMAC secret and rotation (documented 2C.2A.2, corrected to
be actually implementable in 2C.2A.3; not added this checkpoint):** the
duplicate fingerprint (above) requires a server-side HMAC key to be
non-reversible — this was left undefined in 2C.2A.1, and the 2C.2A.2
rotation description referenced a "previous key" that was never actually
documented as configuration, making rotation as described impossible to
implement. Corrected proposed configuration:
  - `DISCOVERY_FINGERPRINT_HMAC_KEY` — the current server-side HMAC key
    used to derive the fingerprint from normalized fields. Requirements:
    secret; server-only; never exposed to Vite/client-side code; never
    logged; distinct from the database, email, CRM, AI, session, and
    signing secrets; validated at startup before the public submission
    endpoint is enabled; the endpoint fails closed (stays disabled) if
    this value is missing in production; a test-only value is mocked/
    supplied during automated tests.
  - `DISCOVERY_FINGERPRINT_KEY_VERSION` — a non-secret configuration
    value recording which key version generated a given stored
    fingerprint (stored per-row as `discovery_submissions.
    fingerprintKeyVersion`, added above). Supports deliberate key
    rotation without silently invalidating historical duplicate data.
  - **`DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY`** (added 2C.2A.3) — the
    immediately previous approved HMAC secret, temporarily retained
    during a controlled rotation window. Requirements: secret;
    server-only; **optional outside an active rotation**; never exposed
    to Vite; never logged; never stored in the database.
  - **`DISCOVERY_FINGERPRINT_PREVIOUS_KEY_VERSION`** (added 2C.2A.3) — the
    non-secret version identifier for the previous key. Required when the
    previous key is configured.
  - **Startup validation (added 2C.2A.3)**, enforced before the public
    endpoint is enabled: current key and current version must both be
    present in production; previous key and previous version must be
    either both present or both absent (never one without the other);
    current and previous versions must be different; any malformed or
    incomplete rotation configuration disables the new public endpoint
    safely (true fail-closed, §22 Correction 7) rather than proceeding
    with ambiguous key state.
  - Rotation direction: new submissions use only the current key/version;
    recent duplicate lookups may temporarily compute fingerprints using
    both the current and the immediately-previous approved key during a
    controlled rotation window (so in-flight duplicate detection doesn't
    break mid-rotation); idempotency-payload comparison (below) uses the
    recorded key version for that submission specifically; the previous
    key remains available for at least the duplicate window, the
    idempotency retry window, and an approved operational grace period;
    previous-key removal occurs only after no records requiring it still
    need comparison under the active retry policy; old raw PII is never
    reconstructed from a fingerprint; no key value is ever stored in the
    database, only the version identifier; the actual rotation procedure
    is a separately reviewed operational process, not defined by this
    PRD.
  - None of these four variables is added to the environment in this
    checkpoint — see §34 for the environment-variable inventory entry.

**Canonical idempotency payload and payload-hash comparison (added
2C.2A.3).** The PRD previously stated that "same idempotency key,
different payload" returns `409 idempotency_conflict` (§24) without
defining how payload sameness is determined. Corrected mechanism:

  - **Canonical payload definition.** A deterministic server-side
    representation of the *validated and normalized* submission payload,
    derived from the shared validated DTO (§14) — never from raw request
    JSON. It includes the client-provided business and project-intake
    data that defines the intended submission (the seven-category answer
    set, §12). It explicitly **excludes** ephemeral or transport-only
    fields: `idempotencyKey` itself, the honeypot value, `formStartedAt`,
    client-generated submission timestamps, analytics identifiers,
    request correlation IDs, IP address, user agent, rate-limit metadata,
    server-generated fields, database-generated IDs, and delivery/AI
    statuses.
  - **Serialization requirements:** stable property ordering (not
    dependent on ordinary JavaScript object insertion order); normalized
    strings (matching the §21 normalization rules already applied before
    comparison); normalized enum values; deterministic array handling
    (e.g. sorted where order is not semantically meaningful); exactly one
    documented canonicalization version, tracked as
    `idempotencyCanonicalizationVersion` (recommended initial value
    `v1`). Canonicalization itself is **not implemented in this
    checkpoint** — this is a documentation-only contract.
  - **Payload hash fields** (added to `discovery_submissions` above):
    `idempotencyPayloadHash` — an HMAC of the canonical validated
    payload, **not** a plain hash of raw user data; `idempotencyPayloadHashKeyVersion`
    — which key version produced the stored hash; `idempotencyCanonicalizationVersion`
    — which canonicalization version produced the canonical form that was
    hashed.
  - **Domain separation (added 2C.2A.3):** the idempotency-payload hash
    must use a distinct HMAC domain from the duplicate-fingerprint hash,
    even though the same underlying key material may be used. Conceptual
    domain strings: duplicate fingerprint domain `discovery-fingerprint:v1`;
    idempotency-payload domain `discovery-idempotency-payload:v1`. The
    PRD recommends either explicit domain-separated HMAC construction
    (e.g. domain string prepended/mixed into the HMAC input) or separately
    derived subkeys from the same root secret — the concrete choice is an
    implementation detail for 2C.2D, not fixed here.
  - **Do not store:** the canonical payload string itself merely for
    comparison (only its hash); raw request JSON in logs; contact data in
    the hash fields; any secret or key value in the database.
  - **Same-idempotency-key comparison procedure:** (1) load the original
    submission; (2) recreate the incoming canonical payload after
    validation and normalization; (3) calculate its HMAC using the key
    version recorded with the original submission, when that approved
    key remains available; (4) compare in constant time when supported by
    the runtime; (5) matching hash → `submission_already_received`; (6)
    different hash → `409 idempotency_conflict`; (7) the coarse duplicate
    fingerprint must **never** be used to decide whether the complete
    payload is identical — it is a lookup aid for distinct-submission
    duplicate review (§24 scenario 3), not a payload-equality mechanism.
  - **Verification key unavailable:** if the key needed to verify an
    existing idempotency payload hash is no longer available (e.g.
    outside the rotation grace period), the system must not assume the
    payload matches, must not overwrite the original, and must return a
    safe conflict or temporary-retry response according to the finalized
    implementation policy (decided in 2C.2D) — while raising an
    operational signal and never exposing key-version or cryptographic
    details publicly.

Keys/constraints: UUID primary keys on all three tables; unique constraint
on `discovery_submissions.idempotencyKey`; ordinary index on the
duplicate fingerprint (not unique, per above); indexes on `email`,
`status`, `createdAt` on `discovery_submissions`; unique constraint on
`discovery_delivery_jobs(submissionId, jobType)`; unique constraint on
`discovery_ai_briefs(submissionId, briefVersion)`; FK from
`discovery_delivery_jobs.submissionId` and `discovery_ai_briefs.submissionId`
to `discovery_submissions.id`. All future database changes use Drizzle Kit
versioned migrations with committed rollback SQL, per root `CLAUDE.md` and
`lib/db/MIGRATIONS.md` convention — never push/sync in production.

## 19. Submission and Delivery Statuses

Lead/business status (internal only, never shown to client, lives on
`discovery_submissions`): `received`, `processing`, `under_review`,
`needs_information`, `qualified`, `proposal_preparation`, `not_a_fit`,
`spam`, `archived`.

**Corrected (2C.2A.1):** delivery status is **not** modeled as status
columns on `discovery_submissions`. `discovery_submissions` may carry
high-level summary fields when operationally useful (e.g. "all delivery
jobs completed" as a convenience flag), but `discovery_delivery_jobs`
(§18) is the sole authoritative record for each individual delivery
obligation's status: `pending`, `processing`, `retry_scheduled`,
`completed`, `permanently_failed`, `cancelled` — one row and one status
per job type (client acknowledgment, internal notification, CRM upsert),
not one shared column per channel. `discovery_ai_briefs` similarly remains
authoritative for AI generation and human-review state, never mirrored
onto the submission row — **corrected (2C.2A.2):** status there is
per-*brief-version* (`pending`, `processing`, `retry_scheduled`,
`generated`, `permanently_failed`, `cancelled`), with a separate
`humanReviewStatus` (`pending_review`, `approved`, `changes_requested`,
`rejected`, `superseded`) tracked per version, not per submission.

**Added (2C.2A.2), corrected (2C.2A.3):** `discovery_submissions.
duplicateReviewStatus` has **four** states, not three —
`none`, `pending`, `cleared`, `confirmed_duplicate` — distinguishing a
submission cleared as legitimate (process normally, exactly once) from
one confirmed as a real duplicate (stays suppressed, never processed). It
is a high-level field on the submission row — not a delivery status —
used by the duplicate-handling policy (§24 Correction 4) to gate whether
delivery jobs and an AI-brief row have been created yet for a likely-
duplicate submission. Accompanying fields `duplicateOfSubmissionId`
(nullable self-reference to `discovery_submissions.id`, populated only
when `confirmed_duplicate`), `duplicateResolvedAt`, `duplicateResolvedBy`,
and optionally `duplicateResolutionReasonCode` record the resolution
outcome (§18, §24).

## 20. Validation Requirements

Single shared zod schema (§14) enforces: required vs. optional per §16 data
inventory, min/max length on every free-text field, enum membership for all
choice fields, email format, phone format (E.164-normalized), URL format
(https/http only — see §22 protocol restriction), array length caps on
multi-select fields, and nested-object depth matching the fixed seven-
category shape (no arbitrary nesting accepted). Server re-validates
everything the client validates; client validation is UX convenience only,
never trusted as the security boundary.

## 21. Normalization Requirements

Email lowercased/trimmed; phone normalized to E.164 where determinable, else
stored as submitted with a `phoneNormalized: false` flag; URLs trimmed,
protocol-restricted, and rejected if scheme is not `http`/`https`; free text
trimmed and length-capped server-side even when the client already enforces
it; no HTML/script normalization needed if input is always rendered as text
(never `dangerouslySetInnerHTML`) — enforced by a rule that no discovery
field is ever rendered as raw HTML anywhere downstream (dashboard, email
templates, AI prompt).

## 22. Security Requirements

Server-side schema validation on every field (§20); request-body size limit
(explicit, smaller than Express default, sized to the largest legitimate
payload plus margin); per-field length limits; array-length caps; nested-
depth caps; ORM parameterization only (Drizzle, no raw SQL string building);
safe HTTP errors (no stack trace, no SQL text/params, no raw provider error,
no secret/env value, no internal table name, no internal email address, no
internal CRM route) — matching the existing safe-error precedent already in
`discovery.ts` (§8 item 20); email-header-injection protection on any
user-supplied value placed into email subject/headers; structured
correlation IDs in logs, PII redacted from ordinary logs (no full request
body logged); origin/CORS tightened from the current `origin: true` reflect-
all (§8 backend audit) to an explicit allowlist for this endpoint at
minimum; URL protocol restriction (§21); protection against oversized
arrays/excessively nested payloads (§20); rate limiting and duplicate/
repeated-submission protection (§23/§24); the duplicate-fingerprint HMAC
secret requirement documented in §18 (`DISCOVERY_FINGERPRINT_HMAC_KEY`,
not added this checkpoint).

**Precise fail-open/fail-closed language (corrected 2C.2A.2, Correction
7)** — three distinct failure modes must not be described with the same
"fail closed" language:
1. **Required security configuration missing in production** (e.g. the
   fingerprint HMAC key) — true fail-closed: the new public endpoint
   fails safely and stays **disabled** until the configuration is present.
2. **Runtime distributed rate-limit store failure** (the store itself
   goes down, not a missing config value) — for ordinary public traffic,
   fall back to a conservative in-process limiter when technically safe,
   raise an operational alert, and document that protection is degraded
   rather than absent; for paid-traffic mode, fail closed or pause paid
   campaign traffic until protection is restored — never silently operate
   without the required anti-abuse layer under paid traffic.
3. **Turnstile unavailable** — never described as "fail closed." Document
   it as one of two named policies instead: "degraded fallback to Stage 1
   protections when risk policy permits," or "temporary submission
   unavailability when paid-traffic policy requires the challenge." Which
   of the two applies must be an explicit choice made before paid-traffic
   activation (§41), not assumed.
None of these three mechanisms is implemented in this checkpoint.

## 23. Anti-Spam Strategy

Compared per task brief criteria (protection level / accessibility impact /
privacy impact / friction / operational burden / infra compatibility / env
requirements / dev behavior / failure behavior / bypass risk):

| Option | Protection | Accessibility | Privacy | Friction | Notes |
|---|---|---|---|---|---|
| Honeypot | low-medium | none | none | none | trivial to add, bypassed by targeted bots, still worth it as baseline |
| Server-side completion-time check | low-medium | none | none | none | cheap, catches naive bots, no infra dependency |
| IP-based rate limiting | medium | none | low (IP retained briefly) | none for legit users | reuse pattern from `authRateLimit.ts`; needs a store decision (in-memory fine for single instance, else Redis — open question §41) |
| Session-based rate limiting | low-medium | none | none | none | weaker alone, complements IP-based |
| Payload/email fingerprinting | medium | none | low | none | good duplicate-suppression signal, doubles as idempotency aid |
| Duplicate-window suppression | medium | none | none | none | required regardless of spam strategy (§24) |
| Idempotency keys | n/a (reliability, not spam) | none | none | none | required (§24) |
| Cloudflare Turnstile | high | must provide accessible fallback | low | small | needs Cloudflare availability (open question §41), env var, and graceful local-dev bypass |
| Traditional CAPTCHA | high | poor unless carefully implemented | low | high | not recommended — worse accessibility than Turnstile for equivalent protection |
| Provider-level filtering | medium | none | varies | none | depends on Resend/hosting capabilities, secondary layer only |
| Operational spam review | n/a | none | none | none | always recommended as a backstop regardless of automated layer |

**Stage 1 (ordinary public homepage)**: server-side validation, explicit
body-size limit, hidden honeypot, server-side completion-time check,
reasonable IP-based rate limit, duplicate-window suppression, idempotency
keys, safe errors, safe logging, visible privacy disclosure, working
Privacy/Terms destinations.

**Stage 2 (paid traffic)**: add Cloudflare Turnstile (or equivalent) with an
accessible path, stricter adaptive rate limiting, campaign-source
monitoring, spam-classification logging, delivery monitoring, conversion
analytics, operational alerts, and a documented abuse-response procedure.
Do not add a third-party challenge (Turnstile or otherwise) at Stage 1
merely because it is common — friction should match actual traffic risk.

## 24. Duplicate-Submission Strategy

**Corrected (2C.2A.1, further corrected 2C.2A.2).** Client generates an
`idempotencyKey` (UUID) once per form session; the server enforces it with
a **unique constraint** on `discovery_submissions.idempotencyKey`.
Independently, an **HMAC-based duplicate fingerprint** (never raw email/
phone/IP stored in plain text, keyed by `DISCOVERY_FINGERPRINT_HMAC_KEY`,
§18) gets an **ordinary, non-unique index**, and a **transactional query
for recent matches** within the chosen duplicate window (e.g. 15 minutes)
flags likely-duplicate *distinct* submissions for operator review.

The five scenarios, fully corrected — **scenarios 1 and 2 now use the
canonical idempotency payload hash defined in §18, closing the 2C.2A.2 gap
where "same payload" vs. "different payload" was never actually defined:**

1. **Same idempotency key + same payload** — determined via the
   canonical-payload-hash comparison procedure (§18): load the original
   submission, recreate the incoming canonical payload post-validation,
   compute its HMAC with the recorded key version, compare in constant
   time where supported, and on a match return the original submission
   result; do not insert another row. `200` (or the previously stored
   success representation). Safe public code:
   `submission_already_received`. The coarse duplicate fingerprint is
   never used for this comparison (§18).

2. **Same idempotency key + different payload — corrected 2C.2A.2,
   comparison mechanism finalized 2C.2A.3.** A hash mismatch in the
   canonical-payload-hash comparison above (rather than an undefined
   notion of "different payload") triggers this path. Do **not** return
   an ordinary success; do **not** overwrite the original submission; do
   **not** insert the changed payload under the reused key. Return
   **HTTP 409**, safe public code `idempotency_conflict`, safe public
   message *"This submission session has already been used. Please
   refresh the form and try again."* The client preserves the user's form
   values locally so nothing is lost from their perspective. A new
   idempotency key is generated only after an explicit retry or a new
   form session — never automatically reused. Only a sanitized
   discrepancy signal is logged (e.g. "key reuse with payload mismatch");
   the full submitted payload is never logged. If the key needed to
   verify the existing hash is no longer available (§18 "verification key
   unavailable"), never assume a match, never overwrite, return a safe
   conflict or temporary-retry response per the finalized 2C.2D policy,
   and raise an operational signal. See §30 for the safe-error matrix
   entry.

3. **Different key but a fingerprint match within the window.** Store the
   new submission — never silently discard it. Set
   `duplicateReviewStatus = pending` (§19). Do not automatically send a
   client acknowledgment, internal notification, or create a CRM lead for
   this submission until the duplicate is resolved — see the conservative
   v1 policy and the **corrected four-state resolution model** below.

4. **Different key and a meaningfully changed submission** (new
   fingerprint) — store normally, `duplicateReviewStatus = none`, all
   delivery jobs (and the AI-brief row, if enabled) created transactionally
   as usual.

5. **A legitimate resubmission after the duplicate window has elapsed** —
   store normally, same as scenario 4.

**Conservative v1 duplicate-job policy (added 2C.2A.2, unchanged
mechanism).** When a submission is flagged as a likely duplicate
(scenario 3), the system must not both store it for human review *and*
automatically fire duplicate emails and create a duplicate CRM lead —
that would defeat the point of flagging it. The same transaction that
creates the `discovery_submissions` row for a flagged submission creates
the row with `duplicateReviewStatus = pending` and **withholds** creation
of its `discovery_delivery_jobs` rows (and its `discovery_ai_briefs` row,
if AI generation is enabled) until an authorized operator resolves the
duplicate review. This remains compatible with the one-transaction
reliability model (§26) — the transaction still commits atomically, it
simply omits the job-creation step for flagged submissions.

**Corrected 2C.2A.3 — duplicate-review outcome model.** The 2C.2A.2
`duplicateReviewStatus` (`none`/`pending`/`resolved`) did not distinguish
two outcomes with opposite downstream behavior. Corrected to four states:
`none`, `pending`, `cleared`, `confirmed_duplicate`.

- **`cleared` outcome** — an authorized operator determines the flagged
  submission is legitimate. Transactionally: transition
  `pending` → `cleared`; record `duplicateResolvedAt` and
  `duplicateResolvedBy`; create the previously withheld
  `discovery_delivery_jobs` rows exactly once; create the `pending`
  `discovery_ai_briefs` row exactly once when AI brief generation is
  enabled. The resolution service relies on the existing
  `(submissionId, jobType)` / `(submissionId, briefVersion)` unique
  constraints (§18) to prevent duplicate job or brief creation even if
  the resolution action is attempted more than once — it treats a
  uniqueness conflict idempotently, not as an error.

- **`confirmed_duplicate` outcome** — an authorized operator confirms the
  submission is genuinely a duplicate. Transactionally: transition
  `pending` → `confirmed_duplicate`; set `duplicateOfSubmissionId` to the
  original submission's ID; record `duplicateResolvedAt` and
  `duplicateResolvedBy`. Do **not** create the withheld delivery jobs. Do
  **not** create an AI-brief row. Preserve the submitted record for audit
  and retention purposes (never deleted merely for being a duplicate). Do
  **not** create a duplicate CRM lead. Do **not** send a second client
  acknowledgment unless a later policy explicitly approves it. This
  internal duplicate classification is never exposed to the prospect.

Neither resolution outcome, nor the resolution action itself (the
authorized-operator workflow that triggers it), is implemented or further
designed in this checkpoint — see §41 for the remaining open item on the
resolution workflow/authorization model, and §38/Correction 5 below for
the operator-visibility requirement this policy depends on.

**Operator visibility requirement (added 2C.2A.3, documented future
requirement, not implemented).** A `pending` likely duplicate must not
become an invisible stored record — if the duplicate-withholding policy
above is enabled, authorized SiteMint operators must have at least one
reliable way to identify pending duplicate reviews before the public
endpoint is activated (§38). Acceptable future approaches: an internal
CRM/admin review queue, an operator dashboard query, a scheduled
operational report, or a separate alerting mechanism — the exact
operational UI is deliberately left open for a later checkpoint. While a
submission is `pending` duplicate review, the ordinary internal-
notification email job must not be sent for it (consistent with the
job-withholding policy above). The final implementation must provide, at
minimum: a pending count, submission timestamp, a safe business/contact
summary, a possible original-submission reference, clear/confirm actions,
exactly-once resolution behavior, authorization, and audit fields. No
admin queue is implemented in this checkpoint.

## 25. Idempotency Strategy

See §24/§18 — the idempotency key (enforced via a real unique database
constraint) is the mechanism for safe retries of the *same* client action
(e.g., a network timeout followed by an automatic client retry) and
returns the original result unchanged **when the canonical-payload-hash
comparison (§18, finalized 2C.2A.3) confirms the resubmitted payload is
identical to the original.** It is distinct from (a) the same-key-
different-payload conflict case, which is corrected in 2C.2A.2 to return
`409 idempotency_conflict` rather than silently returning the original
result, and whose payload-sameness determination is now precisely defined
by the canonical-hash comparison rather than left implicit (§24 scenario
2), and (b) the fingerprint-based spam/duplicate-review signal, which
flags but never blocks near-duplicate distinct submissions under
different keys (§24 scenario 3) and is never used to decide payload
equality (§18).

## 26. Reliability and Partial-Failure Model

**Corrected (2C.2A.1) — transactional outbox, not in-request fire-and-
forget.** A submission is **received** the moment one database transaction
commits (a) the `discovery_submissions` row, (b) its required
`discovery_delivery_jobs` rows (`client_acknowledgment_email`,
`internal_notification_email`, and — pending the CRM decision recorded in
§28 — `crm_lead_upsert`), all created `pending`, and (c) — **corrected
2C.2A.2** — one `pending` `discovery_ai_briefs` row for `briefVersion 1`
when AI brief generation is enabled. The HTTP response is returned only
after that transaction commits. A **separately-running worker** (§17),
not a callback started inside the request, later claims and processes
pending/`retry_scheduled` delivery jobs; a separate AI worker path (§29)
does the same for pending AI-brief rows. If no worker happens to be
running at that moment, the jobs and the AI-brief row simply remain
`pending` in the database — nothing is lost to a deployment restart,
process crash, or request-lifecycle interruption, because the durable
record already exists before the response is sent.

**Correction 2C.2A.2 — this replaces the prior 2C.2A.1 text, which said
the AI-brief row was created "after (not inside) the same transaction."**
That left the same durability gap already fixed for email/CRM: an
AI-generation intent recorded only after commit could be silently lost on
a crash between commit and that later step. The corrected model puts the
AI-brief row's *creation* inside the same transaction as the submission
(when AI generation is enabled); only the AI *generation work itself*
(the provider call) remains outside the transaction and outside the
request's critical path, processed asynchronously by the AI worker (§29).
When AI generation is disabled, no AI row is created during submission,
and an operator may later create one through a separately-approved
workflow (not defined in this checkpoint).

**Interaction with the duplicate-review policy (added 2C.2A.2, §24):**
when a submission is flagged as a likely duplicate
(`duplicateReviewStatus = pending`), the same transaction still creates
the `discovery_submissions` row, but **withholds** creation of its
`discovery_delivery_jobs` rows and its `discovery_ai_briefs` row (if AI
generation is enabled) until an operator resolves the duplicate review.
This stays compatible with the one-transaction model — the transaction
still commits atomically, it simply omits certain inserts for flagged
submissions rather than running a second, separate transaction later.

**Corrected 2C.2A.3 — resolution transactions reuse the same pattern.**
The `cleared`/`confirmed_duplicate` resolution transaction (§24 Correction
4) is not a new reliability mechanism — it reuses the same "insert,
relying on unique constraints to prevent double-creation" pattern
described throughout this section: on `cleared`, the resolution service
attempts to insert the withheld `discovery_delivery_jobs` rows and (if
enabled) the `discovery_ai_briefs` row exactly as the original submission
transaction would have, and the existing `(submissionId, jobType)` /
`(submissionId, briefVersion)` unique constraints (§18) make a repeated
resolution attempt idempotent rather than an error condition.

Explicit scenario (per task brief): *DB succeeds, internal notification
fails, client acknowledgment fails, CRM handoff fails, AI brief fails.*

- **API response**: `201` with the stored submission ID — unchanged from
  today's behavior in this scenario, since today's code already doesn't
  gate the HTTP response on email success (§8 item 17-18); the new system
  keeps that property and extends it to CRM/AI, now backed by durable job
  rows instead of status columns.
- **Client sees**: the existing success state (confirmation, no client-
  visible email/CRM/AI status).
- **Statuses stored**: `discovery_submissions.status = received`;
  `discovery_delivery_jobs` rows for `client_acknowledgment_email`,
  `internal_notification_email`, and `crm_lead_upsert` each independently
  reach `permanently_failed` (or `retry_scheduled` if attempts remain),
  each with its own `attemptCount`, `lastErrorCode`, `lastErrorAt`;
  `discovery_ai_briefs` row reaches its own failure state.
- **Retried**: each delivery job via its own bounded-attempt, exponential-
  backoff schedule (`nextAttemptAt`), independent of the other jobs; AI
  brief via its own capped retry policy, never blocking.
- **Requires operator attention**: yes — `permanently_failed` jobs surface
  in the admin review queue (existing `/admin/crm/discovery` pattern
  extended, not rebuilt), with a manual-retry action available per job.
- **Never exposed publicly**: which specific downstream system failed,
  provider error text, retry counts, internal statuses.

AI processing is explicitly outside the critical path required for
submission acceptance, matching the task brief's binding requirement.

## 27. Email Reliability

Current: Resend, synchronous, hardcoded internal recipient
(`info.sitemint@gmail.com`), failures logged but non-blocking.

**Corrected target (2C.2A.1):** client acknowledgment and internal
notification are modeled as **two independent `discovery_delivery_jobs`
rows** (`client_acknowledgment_email`, `internal_notification_email`), not
one shared email status — each has its own `status`, `attemptCount`,
`nextAttemptAt`, `providerMessageId`, and failure state, because they are
different messages to different recipients that can succeed or fail
independently. Both are created transactionally alongside the submission
row (§26) — except when the submission is flagged as a likely duplicate,
in which case job creation is withheld until operator resolution (§24
Correction 5) — and executed later by the delivery worker (§17), never
inline in the request. Duplicate sends are prevented by the job's own status
(`completed` jobs are never re-sent) plus the job's `idempotencyKey`
passed to the provider where supported. Internal recipient: the *value*
`info.sitemint@gmail.com` is recorded as the current recipient (§28
owner-decision table), but making it configuration-driven is implemented
in the checkpoint that actually wires the email jobs (2C.2D/2C.2E — see
§34 reconciliation), not earlier. Provider errors are sanitized before any
surfacing to operator tooling. The "smallest reliable option compatible
with the existing stack" principle still applies to the *worker*
implementation choice (§17), but the mechanism is now a durable job table
processed by a separately-running worker, not an in-request async
callback — that in-process direction is retracted as not durable.

## 28. CRM Reliability

Current: no automatic CRM record on public submission; conversion is a
manual, admin-triggered action (`crmDiscovery.ts`).

**Recorded owner decision (2C.2A.1, resolves the prior open question):**
every accepted, non-spam submission automatically creates or updates a
SiteMint CRM lead, asynchronously, via a `crm_lead_upsert`
`discovery_delivery_jobs` row created in the same transaction as the
submission (§26) — except when withheld under the duplicate-review policy
(§24 Correction 5) until an operator resolves the flag. SiteMint's internal CRM is the ongoing lead-management
source of truth once handoff succeeds; `discovery_submissions` remains the
immutable intake source of truth regardless of CRM state. CRM failure must
never fail, delete, or otherwise affect the already-accepted submission —
it only leaves the `crm_lead_upsert` job `retry_scheduled` or
`permanently_failed` for operator follow-up. The CRM upsert uses the
submission ID as its external/idempotency key on the CRM side specifically
to prevent duplicate-lead creation across retries.

## 29. AI-Generated Brief Workflow

**Corrected (2C.2A.2) — one row per brief version, durably enqueued.**
The intent to generate `briefVersion 1` is recorded transactionally
alongside the submission when AI generation is enabled (§18, §26); the
generation work itself runs strictly non-blocking, after the source
submission is durably stored, via a separate AI worker path. Retries for
the same brief version update the same `discovery_ai_briefs` row
(`attemptCount`); a deliberate regeneration creates a new row
(`briefVersion + 1`) and never overwrites an older `generated` or
reviewed brief — the superseded version's `humanReviewStatus` may be set
to `superseded`. Separate table (`discovery_ai_briefs`, §18) so AI output
can never overwrite, obscure, or be confused with the client's original
answers. AI generation is not modeled as a `discovery_delivery_jobs` job
type — `discovery_ai_briefs` itself is the durable work record. Brief may
include: project summary, business context, primary problem, customer/
team impact, desired outcome, decision context, likely self-reported
motivations (restated, not invented), required modules, user roles,
permissions, workflows, integrations, risks, unknowns, contradictions,
missing information, discovery-call questions, preliminary complexity,
suggested phases, initial PRD outline, recommended human follow-up.
Always labeled `AI-generated draft — requires human review`.

**Corrected 2C.2A.3:** the `pending` `briefVersion 1` row created on a
`cleared` duplicate-review resolution (§24 Correction 4) is created by
attempting the same insert as any other enqueue path, subject to the same
`(submissionId, briefVersion)` uniqueness (§18) — no special-case AI
enqueue logic is needed for the resolution path.

**AI worker reliability requirements (added 2C.2A.2, documented only —
no worker selected or implemented this checkpoint):** the AI processor
must use atomic row claiming (`lockedAt`/`lockedBy`, matching the
delivery-job locking pattern, §18), stale-lock recovery, bounded retries
with exponential backoff (`attemptCount`/`maxAttempts`/`nextAttemptAt`),
sanitized failure codes only (`lastErrorCode`, never a raw provider
response body), an operator-visible `permanently_failed` state, no raw
provider error storage, no contact PII sent to the provider by default,
`promptVersion` tracking per generated version, and response-schema
validation before a `structuredOutput` is accepted as `generated`. The
concrete worker runtime (dedicated process, scheduled poller, platform
scheduled task, or another mechanism) remains pending technical
investigation alongside the delivery-job worker decision (§17) and is not
selected in this checkpoint.

**Recorded owner decision (2C.2A.1):** the AI provider does not receive
contact name, email, or phone by default — only the business/project-
scoping fields actually needed for the brief. Every generated brief
requires review by an authorized SiteMint administrator or team member
before any downstream use. AI failure never affects submission acceptance
(§26).

Definitions required before implementation (2C.2E scope): exact source
fields sent to the AI provider (excluding anything not needed for the
brief, per the PII-exclusion decision above), provider boundary (single
abstraction point, matching the existing `VoiceProvider` isolation pattern
precedent in root `CLAUDE.md` for the voice platform), `promptVersion`
per brief version, response schema + validation, storage location
(`discovery_ai_briefs`), failure status, bounded retry strategy,
human-review status field, audit history, deletion behavior. AI must
never promise price, timeline, or feasibility; never reject a lead; never
score protected characteristics; never infer medical/psychological
diagnoses; never invent requirements; never rewrite original answers;
never trigger a contract or send an unreviewed proposal; never expose an
interpretation to the client as fact.

## 30. Safe Error Model

| Category | HTTP | Public code | Public message | Retry | Stored? | Operator action | Logged |
|---|---|---|---|---|---|---|---|
| Validation failure | 400 | `validation_error` | generic field-error summary | yes, after fix | no | no | yes |
| Malformed request | 400 | `malformed_request` | generic | yes | no | no | yes |
| Oversized request | 413 | `payload_too_large` | generic | no | no | no | yes |
| Suspected bot | 200 (silent accept) or 400 per policy decision | `submission_review` | neutral | no | policy decision | yes (review queue) | yes |
| Honeypot triggered | as above | as above | neutral | no | no | yes | yes |
| Completion-time violation | as above | as above | neutral | no | no | yes | yes |
| Rate limit exceeded | 429 | `rate_limited` | generic, retry-after | yes, after delay | no | monitor only | yes |
| Same idempotency key + same payload | 200/201 (returns original) | `submission_already_received` | neutral | n/a | yes (original) | no | yes |
| Same idempotency key + different payload — **added 2C.2A.2** | **409** | `idempotency_conflict` | "This submission session has already been used. Please refresh the form and try again." | yes, only with a fresh submission session/key | yes (original only) | no | yes, sanitized discrepancy signal only — never the full payload |
| Accepted submission | 201 | `received` | confirmation | n/a | yes | no | yes |
| Accepted, downstream pending | 201 | `received` | confirmation | n/a | yes | if downstream permanently fails | yes |
| Database unavailable | 503 | `temporarily_unavailable` | generic, retry later | yes | no | yes (alert) | yes |
| Temporary server failure | 500 | `server_error` | generic | yes | unknown/no | yes | yes |
| Email-provider failure | 201 (unaffected) | n/a (internal only) | n/a | internal retry | yes | if permanent | yes, sanitized |
| CRM-provider failure | 201 (unaffected) | n/a | n/a | internal retry | yes | if permanent | yes, sanitized |
| AI-provider failure | 201 (unaffected) | n/a | n/a | internal retry | yes | if permanent | yes, sanitized |

No response category ever exposes raw error message, stack trace, SQL,
provider response body, API key, environment value, internal table name,
internal email address, or internal CRM route — extending the safe
precedent already present in the current `discovery.ts` implementation.

**Added 2C.2A.3 — internal conditions from the idempotency-hash and
duplicate-resolution mechanisms.** These do not necessarily require new
public error codes distinct from the ones above; the PRD requires only
that they are handled safely and do not leak internals:

- **Idempotency verification key unavailable** (§18) — maps to a safe
  conflict or temporary-retry response per the finalized 2C.2D policy
  (either reuses `idempotency_conflict` or a generic `temporarily_
  unavailable`-style response); raises an operational signal; never
  exposes which key version was needed or why it's unavailable.
- **Duplicate resolution already completed** (a resolution action
  attempted on a submission no longer `pending`) — treated idempotently
  by the resolution service (§24/§26), not surfaced as an error to the
  operator beyond a neutral "already resolved" indication.
- **Duplicate resolution conflict** (e.g. concurrent resolution attempts)
  — resolved via the same transactional/unique-constraint mechanism as
  other double-submission protection; never exposes raw database
  conflict details.
- **Duplicate original-reference invalid** (a `duplicateOfSubmissionId`
  that fails to resolve) — internal-only signal for operator/engineering
  attention; never surfaces an internal submission ID or link publicly.
- **Duplicate resolution transaction failure** — treated like any other
  transaction failure (§26): the underlying submission record is
  unaffected, the operator sees a generic failure indication, and no raw
  database error is exposed.

None of these internal conditions may disclose duplicate classifications,
database IDs, cryptographic versions, key availability, internal
submission links, operator identity, or SQL/provider details to any
public-facing surface.

## 31. Privacy and Legal UX

Minimum: short privacy disclosure adjacent to the form; a working `/privacy`
destination (currently dead, §8 item 31); a working `/terms` destination
when shown (currently dead, §8 item 32); required operational-contact
consent, kept separate from optional marketing consent (never bundled);
consent timestamp + privacy-policy-version recorded per submission;
AI-processing disclosure when the brief workflow is active; retention-
language and third-party-provider disclosure. All specific legal copy in
this PRD and its implementation is **placeholder**, labeled
`Owner/legal review required before public activation` — this document does
not constitute legal advice.

## 32. Accessibility Requirements

Programmatic labels; clear instructions; required-state semantics;
`aria-describedby` error association; error summary; focus movement on
failed step validation and failed submission; screen-reader announcements
for loading/success/conditional-question changes; no color-only meaning;
full keyboard completion and step navigation; visible focus; touch-friendly
targets; meaningful progress semantics; data preserved on back-navigation;
accessible review/edit controls; accessible CAPTCHA alternative if Stage 2
Turnstile is added; no focus loss on step transition; no forced timing that
harms accessibility. Required test matrix: 320px, 375px, 390px, tablet,
desktop, 200% zoom, reduced motion, keyboard-only, screen reader.

## 33. Analytics Event Plan

Defined, not implemented (analytics vendor itself remains an open decision
per `PRODUCT_REQUIREMENTS_DOCUMENT.md` §24/§41): `start_project_view`,
`discovery_form_start`, `discovery_step_view`, `discovery_step_complete`,
`discovery_form_validation_error`, `discovery_form_review`,
`discovery_form_submit`, `discovery_form_success`, `discovery_form_failure`,
`discovery_form_duplicate`, `discovery_form_rate_limited`,
`discovery_form_spam_blocked`, `discovery_form_abandonment` (only if
privacy-safe and technically appropriate). No event may carry name, email,
phone, free-text content, private URLs, credentials, IP address, or
AI-generated interpretation. Consent requirement and environment behavior
(dev/staging/production) to be finalized alongside the vendor decision.

## 34. Environment Variables

| Variable | Purpose | Local | Test | Preview | Prod | Secret | Fail behavior |
|---|---|---|---|---|---|---|---|
| `RESEND_API_KEY` (existing) | email send | required for real send | mocked | required | required | yes | fail closed on email job only, not submission |
| `RESEND_FROM_EMAIL` (existing) | sender identity | optional (fallback) | mocked | required | required | no | falls back to hardcoded default today; recommend making required |
| `DATABASE_URL` (existing) | persistence | required | required | required | required | yes | fail closed, submission cannot succeed without DB |
| `DISCOVERY_INTERNAL_NOTIFY_EMAIL` (proposed) | replace hardcoded `info.sitemint@gmail.com` | optional | mocked | required | required | no | falls back to a documented default if unset |
| `DISCOVERY_FINGERPRINT_HMAC_KEY` (proposed, **added 2C.2A.2**) | server-side HMAC key for the non-reversible duplicate fingerprint (§18) | required for real duplicate detection | test-only mocked value | required | required | yes | true fail-closed — the new public submission endpoint stays disabled if missing in production (§22 Correction 7) |
| `DISCOVERY_FINGERPRINT_KEY_VERSION` (proposed, **added 2C.2A.2**) | records which HMAC key version produced a stored fingerprint, supports rotation (§18) | optional (defaults to version 1) | optional | required | required | no | non-secret; defaults to the current approved version if unset |
| `DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY` (proposed, **added 2C.2A.3**) | the immediately previous approved HMAC secret, temporarily retained during a controlled rotation window (§18) | unset outside rotation | unset or test-only value | optional | optional — required only during an active rotation window | yes | optional; if set, `DISCOVERY_FINGERPRINT_PREVIOUS_KEY_VERSION` must also be set and differ from the current version, or the endpoint fails closed (§18 startup validation) |
| `DISCOVERY_FINGERPRINT_PREVIOUS_KEY_VERSION` (proposed, **added 2C.2A.3**) | version identifier for the previous HMAC key, required when the previous key is configured (§18) | unset outside rotation | unset | optional | optional — required only during an active rotation window | no | non-secret; must be present whenever the previous key is present, and absent whenever it is absent (§18 startup validation) |
| `DISCOVERY_RATE_LIMIT_WINDOW`/`_MAX` (proposed) | Stage 1 rate limiting | optional (sane default) | disabled or high limit | required | required | no | **corrected 2C.2A.2** — distinguish missing config (true fail-closed, endpoint disabled) from a runtime store outage (ordinary traffic: degrade to an in-process fallback limiter + alert; paid traffic: fail closed / pause campaign traffic) — see §22 Correction 7 |
| `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (proposed, Stage 2) | paid-traffic bot protection | unset (feature off) | unset | optional | required at Stage 2 | secret (server key) | **corrected 2C.2A.2** — never described as "fail closed" when merely unavailable; the policy is explicitly one of "degraded fallback to Stage 1 protections when risk policy permits" or "temporary submission unavailability when paid-traffic policy requires the challenge," chosen before paid-traffic activation (§22 Correction 7) |
| `PRIVACY_POLICY_VERSION` (proposed) | consent-record versioning | optional | optional | required | required | no | defaults to a documented initial version |
| `VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED` (existing, unrelated flag reused as gating pattern) | gates the new frontend behind the same safe-preview mechanism during rollout | off | off | on | off until approved | no | fails closed (confirmed unchanged this checkpoint) |

No variable is added or changed by this checkpoint — table is a planning
inventory for 2C.2B–2C.2D. **Note (added 2C.2A.3):**
`idempotencyCanonicalizationVersion` (§18) is a per-row data-versioning
value, not an environment variable — it does not appear in this table.

**Correction 7 reconciliation (2C.2A.1):** the original text recommended
resolving `DISCOVERY_INTERNAL_NOTIFY_EMAIL` "at the start of Phase 2C.2B"
while also scoping 2C.2B to exclude email integration and environment
changes — a direct contradiction. Resolved: the *desired configuration
name and behavior* for the internal recipient (`DISCOVERY_INTERNAL_NOTIFY_
EMAIL`, current value `info.sitemint@gmail.com`, config-driven rather than
hardcoded, falls back to a documented default if unset) is recorded here,
in this planning document, as of 2C.2B. The actual environment-variable
addition and the email-job wiring that reads it are deferred to the
checkpoint that implements delivery (2C.2D for the secure API route,
2C.2E for the delivery worker/jobs) — not implemented or added in 2C.2B or
in this correction checkpoint.

## 35. Testing Strategy

Full matrix per task brief is adopted as the implementation-phase
requirement: frontend (step/progress/branching/back-nav/validation/review/
loading/duplicate-click/draft/accessibility/success/retry/offline), backend
(valid/invalid/missing/unexpected fields/malformed JSON/oversized/nested/
array-length/script-HTML-injection/URL-protocol/email-header-injection/
honeypot/time-trap/rate-limit/duplicate-fingerprint/duplicate-idempotency/
DB success-failure/transaction-failure/safe-serialization/log-redaction/no-
leakage), integration (each partial-failure combination from §26, retry
success/permanent-failure, no-duplicate-delivery, AI-brief isolation from
client data, cross-schema-version rendering), and accessibility (full list
per §32). No automated test may create a real production email, CRM
record, or AI-provider request — all provider calls are mocked/faked in
tests (mirroring the existing `VOICE_PROVIDER=fake` precedent in root
`CLAUDE.md`).

## 36. AI-Vibe-Coding Implementation Rules

Adopted verbatim for all future checkpoints in this initiative: start from
the approved PRD; one small checkpoint per module; inspect existing
architecture before creating files; define shared contracts before UI;
reuse repository patterns; one shared validation source, never duplicated
frontend/backend; no silently invented requirements; no package installs
without explicit approval; no changes to unrelated applications; no
protected-file changes without specific approval; no automatic production
schema sync — Drizzle Kit migrations only; email/AI provider success is
never the definition of form success; no raw provider/database errors
exposed; no secret collection; tests + rollback notes required per
checkpoint; full diff shown before commit; exactly one commit per approved
checkpoint; no push/deploy/preview-activation without separate approval.

## 37. Implementation Phases

**Phase 2C.2B — Domain model and backend contract (corrected 2C.2A.1,
clarified 2C.2A.2, further clarified 2C.2A.3).** Scope: shared zod schema,
DTO, request/response contracts, submission/delivery statuses,
`discovery_submissions` (redesigned, including `fingerprintKeyVersion` —
**clarified 2C.2A.3: also `idempotencyPayloadHash`,
`idempotencyPayloadHashKeyVersion`, `idempotencyCanonicalizationVersion`,
`duplicateOfSubmissionId`, `duplicateResolvedAt`, `duplicateResolvedBy`,
optionally `duplicateResolutionReasonCode`, and `duplicateReviewStatus`
using the four values `none`/`pending`/`cleared`/`confirmed_duplicate`,
not the three-value 2C.2A.2 set** — in its schema) + `discovery_delivery_jobs`
(added 2C.2A.1) + `discovery_ai_briefs` schema and Drizzle migration —
**clarified 2C.2A.2: `discovery_ai_briefs` is modeled as one row per
brief version** (unique `(submissionId, briefVersion)`, with AI-worker
state fields — `attemptCount`, `maxAttempts`, `nextAttemptAt`, `lockedAt`,
`lockedBy`, `lastErrorCode`, `lastErrorAt` — part of the schema contract,
matching the delivery-job pattern), idempotency model (unique
`idempotencyKey` constraint + indexed fingerprint, per §18/§24 —
**clarified 2C.2A.2: the same-key/different-payload case maps to the
`409 idempotency_conflict` contract, §30**, not an ordinary-success path
— **clarified 2C.2A.3: same-key comparison must use the canonical
idempotency-payload-hash mechanism (§18), not an undefined notion of
"payload sameness"**), safe-error contract (including the 409 entry and
the internal conditions added 2C.2A.3, §30), versioning.
`DISCOVERY_FINGERPRINT_HMAC_KEY`, `DISCOVERY_FINGERPRINT_KEY_VERSION`,
and — **added 2C.2A.3** — `DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY` /
`DISCOVERY_FINGERPRINT_PREVIOUS_KEY_VERSION` are documented in this
phase's PRD reference (§18/§34) but **not added** as environment
variables here. **Added 2C.2A.3:** schema and contract tests cover all
new fields (idempotency-hash fields, duplicate-resolution fields, the
four-state `duplicateReviewStatus`). No email/CRM/AI integration, no
route wiring, and no worker execution in this phase — the transactional-
outbox insert logic and the delivery/AI workers are 2C.2D/2C.2E scope.
Files: shared schema location (§14), migration files for all three
tables, no route wiring yet or minimal route stub only. Stop condition:
schema + migration reviewed and typechecked; no UI. Tests: schema
validation unit tests. Requires separate approval prompt before starting.

**Phase 2C.2C — Guided frontend experience (corrected 2C.2A.1).** Scope:
`StartProjectPage`, `DiscoveryFormShell`, step components, branching
config, progress, field components, feature prioritization UI, draft
recovery (sessionStorage, per §16), accessible validation, review screen,
loading/retry states — built against the 2C.2B contract. **Correction:**
must **not** submit to the legacy `POST /api/discovery/submit` endpoint
(§16/§17) — that endpoint's unstructured payload and missing validation
are incompatible with the new contract. Use a local typed mock adapter or
an intentionally disabled submit action instead. Kept behind an inactive
preview/safe gate; no production submission occurs in this phase. Requires
separate approval prompt.

**Phase 2C.2D — Secure API and public-form hardening (corrected 2C.2A.1,
retitled from "Security, privacy, anti-spam").** Scope: `POST /api/v1/
discovery-submissions`, server-side shared-schema validation, normalization,
request-size limits, origin handling, honeypot, completion-time check, rate
limiting, duplicate-window check (§24), idempotency enforcement — **clarified
2C.2A.2: the production endpoint validates that
`DISCOVERY_FINGERPRINT_HMAC_KEY` is present and stays disabled if it is
not (§22 Correction 7); duplicate-review behavior (§24) is enforced
transactionally, with delivery-job (and AI-brief) creation withheld for
flagged submissions until operator resolution** — **clarified 2C.2A.3:**
implement canonical payload construction (§18) from the shared validated
DTO; implement idempotency-payload HMAC comparison (§18) as the mechanism
for the same-key scenarios (§24); implement current/previous key parsing
and the startup validation rules (§18 — current required in prod,
previous key+version both-present-or-both-absent, versions differ,
malformed config disables the endpoint); enforce transactional duplicate
detection and job withholding (unchanged mechanism, §24/§26); implement
or clearly gate the authorized duplicate-resolution service (§24
Correction 4 outcomes) behind an explicit approval boundary — this
service is complex enough that 2C.2D may choose to implement only the
detection/withholding half and defer the resolution service itself to
2C.2E, a decision left to the phase's own scoping; ensure public
activation remains blocked (§38) whenever the duplicate-withholding
policy is enabled and no operator review path (§24 operator-visibility
requirement) is yet available — the transactional submission-plus-
delivery-job insert (§26), safe logging, sanitized HTTP errors, privacy
disclosure, working `/privacy` and `/terms` destinations, controlled-
preview integration with the 2C.2C frontend (which now has a real
endpoint to call instead of its mock adapter). Does not remove the legacy
endpoint. Requires separate approval prompt.

**Phase 2C.2E — Delivery worker, CRM, email, and AI brief (corrected
2C.2A.1, clarified 2C.2A.2, further clarified 2C.2A.3).** Scope: the
durable `discovery_delivery_jobs` processor/worker (§17), bounded retry
policy, locking and stale-lock recovery, client-acknowledgment job
execution, internal-notification job execution (recipient made
configuration-driven here, per the §34 reconciliation — not in 2C.2B),
automatic SiteMint CRM lead upsert (§28 owner decision), operator-visible
permanently-failed jobs, manual retry capability, AI-brief generation
workflow — **clarified 2C.2A.2: when AI brief generation is enabled, the
`pending` `briefVersion 1` row is created transactionally in 2C.2D's
submission flow (§18/§26); this phase's AI worker processes existing
`discovery_ai_briefs` rows directly (claims via `lockedAt`/`lockedBy`,
executes the provider call, validates the response schema); a retry
updates the same brief-version row; a regeneration request creates a new
version row** — human-review state, downstream partial-failure behavior
per §26. **Clarified 2C.2A.3:** if not already completed in 2C.2D, this
phase surfaces `pending` duplicate reviews to authorized operators (§24
operator-visibility requirement — pending count, timestamp, safe summary,
possible original-submission reference, clear/confirm actions,
authorization, audit fields); executes the `cleared`/`confirmed_duplicate`
resolution outcomes (§24 Correction 4); creates the withheld delivery
jobs and AI-brief row transactionally on `cleared`, relying on the
existing unique constraints for exactly-once behavior (§18/§26); keeps
`confirmed_duplicate` submissions permanently suppressed from downstream
processing. Requires separate approval prompt; explicitly requires
provider credentials/config decisions first.

**Phase 2C.2F — Automated and controlled verification.** Scope: full test
matrix (§35), accessibility audit, security review, spam tests, duplicate
tests, controlled (non-production) email/CRM/AI verification, private-
preview review. Requires separate approval prompt.

Each phase: exact scope, expected files, schema/migration/package/env/
provider impact, stop conditions, tests, build verification, owner-review
artifacts, deployment risk, rollback approach (revert the phase's single
commit), and confirmation that a separate prompt is required before the
next phase begins — all per §36.

## 38. Release Gates

**Level 1 — Local development review.** Typecheck clean, builds pass, no
console errors, tests for the module exist and pass locally.

**Level 2 — Controlled private preview.** Level 1 plus: privacy disclosure
present, safe-error model verified, no real provider calls triggered by
casual review, feature gated behind the existing preview-flag pattern.

**Level 3 — Public homepage / ordinary public form traffic.** Level 2 plus:
working `/privacy` and `/terms`, Stage 1 anti-spam (§23) live, rate limiting
live, duplicate/idempotency protection live, accessibility test matrix
(§32) passed, no known Level-3-blocking defect from §8/§11 remaining open.
**Added 2C.2A.3:** whenever the duplicate-withholding policy (§24) is
enabled, a workable operator review path for `pending` duplicate reviews
(§24 operator-visibility requirement) must exist — public activation is
explicitly blocked without one, since a `pending` submission otherwise
never receives its client acknowledgment, internal notification, or CRM
handoff.

**Level 4 — Paid traffic.** Level 3 plus: Stage 2 anti-spam (§23), verified
email/CRM delivery in a controlled test, analytics live, operational alerts
for permanent delivery failures, documented abuse-response procedure.

**Level 5 — AI-assisted brief generation.** Level 3 minimum (brief
generation must not be the reason a form is exposed to more traffic than
its own readiness supports) plus: AI provider selected and approved (§41),
prompt/response schema validated, human-review workflow live, PII
minimization confirmed, all "AI must never" constraints (§29) verified.

**Level 6 — AI receptionist product workflows.** Out of scope for this PRD;
tracked separately per root `CLAUDE.md` voice-platform rules and the
existing receptionist auth/session concern, which stays explicitly
separate from this initiative.

Each gate requires: capabilities, security, privacy, accessibility, testing,
provider verification, owner approval, and a rollback requirement, as
enumerated above per gate.

## 39. Rollback Considerations

Every implementation checkpoint is one commit; rollback is reverting that
commit. The old `/discovery` route and `/api/discovery/submit` endpoint
remain untouched and fully functional throughout 2C.2B–2C.2E, so the new
system can be abandoned or delayed at any point without any period of zero
working intake form. Database migrations are additive-only with committed
rollback SQL (§18), so a migration revert never destroys already-collected
submissions. No phase deletes the old form/endpoint; that removal is itself
a separate, explicitly approved future checkpoint after the new system is
verified (§17).

## 40. Risks

Building a seven-category branching form is materially more complex than
the current flat form — risk of scope creep into a form builder; mitigated
by the phase boundaries in §37. AI-brief feature risks reliability coupling
if not kept strictly async — mitigated by §26's binding non-blocking rule.
Legal-copy placeholders (§31) risk being mistaken for final language if not
carried forward clearly into implementation — every checkpoint touching
Privacy/Terms copy must repeat the "Owner/legal review required" label.
Rate-limiting/Turnstile need infra decisions (Redis? Cloudflare?) not yet
confirmed available — tracked as open questions (§41) rather than assumed.

## 41. Open Questions

**Recorded decisions (2C.2A.1 — moved out of "open," per owner review):**

| Topic | Recorded decision |
|---|---|
| Original intake source of truth | `discovery_submissions` (§18) |
| Ongoing lead-management source of truth | SiteMint internal CRM (§28) |
| Auto-create CRM lead | Yes, asynchronously after accepted, non-spam storage (§28) |
| CRM failure effect on submission | None — must never fail or delete the submission (§28) |
| Client acknowledgment mechanism | Separate durable `discovery_delivery_jobs` job, created immediately after persistence (§26/§27) |
| Internal notification mechanism | Separate durable `discovery_delivery_jobs` job (§27) |
| Current internal recipient | `info.sitemint@gmail.com`, to be made configuration-driven (not hardcoded) in the delivery checkpoint, not 2C.2B (§34) |
| Phone | Optional (§18, §41 prior) |
| SMS consent | Separate and optional; shown only when SMS follow-up is offered |
| Draft recovery | `sessionStorage` for v1, not `localStorage`; clear after confirmed success; define a stale-draft expiration; no anonymous server-side draft sync in v1 (§16) |
| File uploads | Excluded from v1 (task brief First-Version Exclusions) |
| AI access to contact PII | No by default — only business/project-scoping fields (§29) |
| AI brief reviewer | Authorized SiteMint administrator or team member (§29) |
| AI failure effect on submission | None — durable failure state + bounded retry, never affects acceptance (§26/§29) |
| Pricing/packages | Configuration-driven; no public numeric ranges hard-coded until approved (§12 Step 6) |
| Industry-specific branching | General v1 branching only; nonprofit/real-estate specialization deferred |
| Turnstile timing | Before paid traffic (Stage 2), or earlier if real abuse is observed (§23) |
| Retention | Proposed 24-month default for intake data, **subject to owner/legal review before public activation** — not yet a final decision |

**Recorded decisions (2C.2A.2 — moved out of "open"):**

| Topic | Recorded decision |
|---|---|
| AI-brief record granularity | One `discovery_ai_briefs` row per brief *version*, not per provider attempt; retries update the same row, regeneration creates a new version (§18/§29) |
| AI-brief enqueue durability | The `pending` `briefVersion 1` row is created in the same transaction as the submission when AI generation is enabled — closes the same durability gap already fixed for email/CRM (§18/§26) |
| Same idempotency key + different payload | Returns `409 idempotency_conflict`, not an ordinary success; original submission is never overwritten (§24, §30) |
| Likely-duplicate downstream jobs | Conservative v1 policy: store the submission with `duplicateReviewStatus = pending`, withhold delivery jobs and the AI-brief row until an authorized operator resolves the flag (§24) |
| Duplicate-fingerprint secret requirement | `DISCOVERY_FINGERPRINT_HMAC_KEY` (secret, server-only) and `DISCOVERY_FINGERPRINT_KEY_VERSION` (non-secret) are required for the fingerprint mechanism to be safely implementable; documented, not added this checkpoint (§18/§34) |
| Rate-limit/Turnstile failure language | Precise, distinct wording for missing-config (true fail-closed), runtime store outage (degrade + alert for ordinary traffic, fail closed/pause for paid traffic), and Turnstile unavailability (explicit "degraded fallback" vs. "temporary unavailability" policy choice, not "fail closed") (§22 Correction 7) |

**Recorded decisions (2C.2A.3 — moved out of "open"):**

| Topic | Recorded decision |
|---|---|
| Same-key payload comparison mechanism | A canonical, HMAC-based payload digest (`idempotencyPayloadHash`), not the coarse duplicate fingerprint, determines same- vs. different-payload for the idempotency-key scenarios (§18/§24) |
| HMAC domain separation | The idempotency-payload hash and the duplicate fingerprint use explicitly separated HMAC domains, even when derived from the same root key material (§18) |
| Key rotation configuration | Current-plus-previous key configuration (`DISCOVERY_FINGERPRINT_HMAC_KEY`/`_KEY_VERSION` plus optional `DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY`/`_PREVIOUS_KEY_VERSION`) is required to make the previously-described rotation actually implementable; documented, not added this checkpoint (§18/§34) |
| Previous-key retention window | Must cover at least the duplicate window, the idempotency retry window, and an approved operational grace period before removal (§18) |
| Duplicate-review outcomes | `duplicateReviewStatus` has four states — `none`/`pending`/`cleared`/`confirmed_duplicate` — not three; `cleared` and `confirmed_duplicate` have opposite downstream effects (§18/§24) |
| Cleared-submission processing | A `cleared` submission receives its withheld delivery jobs and AI-brief row exactly once, transactionally, relying on existing unique constraints (§24/§26) |
| Confirmed-duplicate processing | A `confirmed_duplicate` submission never receives delivery jobs or an AI-brief row, is preserved for audit/retention, and is never exposed to the prospect as a duplicate (§24) |
| Operator visibility precondition | A pending duplicate-review queue or equivalent operational path is required before public activation whenever duplicate-withholding is enabled; the exact operational UI design remains open for a later checkpoint (§24, §38) |

**Still owner-decision required:**
- Should acknowledgment email send immediately after persistence, or wait
  for some validation/review step (beyond "job created immediately," does
  the *send* itself need a delay)?
- Approved sender domain for outbound email — remains pending
  verification.
- Which investment ranges are owner-approved for public display?
- Which SiteMint packages should appear publicly, and with what labels?
- Which AI provider should generate the brief (and does this interact with
  the existing `integrations-openai-ai-server` package already in the
  repo)?
- Who receives delivery-failure alerts (which operator/role)?
- Which exact Privacy and Terms page content/routes will be used (net-new
  pages are needed regardless — §8 items 31-32)?
- Final confirmation of the 24-month retention default above.
- What is the authorized-operator resolution workflow and authorization
  model for a flagged likely-duplicate submission (§24)? This checkpoint
  defines the `cleared`/`confirmed_duplicate` outcomes and that jobs must
  be created "exactly once" on `cleared`, but does not design the
  resolution UI or the authorization mechanism itself.
- What does the operator review path/admin queue for pending duplicate
  reviews look like (§24 operator-visibility requirement, §38)? Approach
  (CRM queue, dashboard query, scheduled report, alerting) is deliberately
  left open.
- Which named policy applies when Turnstile is unavailable — "degraded
  fallback to Stage 1" or "temporary submission unavailability"? (§22
  Correction 7) — must be decided before paid-traffic activation.

Legal review required: all Privacy/Terms/consent copy (§31); the
retention-period default above.

Technical investigation required:
- Is Cloudflare available for future Turnstile and edge rate limiting?
- Is Redis (or another distributed store) available for rate limiting
  across multiple server instances, or is in-memory sufficient at current
  scale?
- Current hosting's support for background job/worker execution (affects
  which of the worker options in §17 — dedicated process, scheduled
  poller, platform scheduled task, or manual-retry fallback — is viable);
  this must be resolved before 2C.2E can select a concrete worker
  mechanism (applies to both the delivery-job worker and the AI worker,
  §29).
- The fingerprint HMAC key **rotation procedure** itself (distinct from
  the current/previous key *configuration*, which is now defined, §18) is
  explicitly a separately-reviewed operational process, not defined by
  this PRD — remains open.

Safe default available (recommended, pending owner override): the
corrected three-table database model (§18) over both the original two-
table and the maximal four-table options; `sessionStorage` over
`localStorage` for drafts (§16); idempotency key + fingerprint duplicate
strategy (§18/§24) over CAPTCHA-first anti-spam; staged anti-spam (§23)
with Stage 2 additions deferred until paid traffic is actually planned.

## 42. Recommended Decisions

Adopt the corrected **three-table** database model — `discovery_
submissions`, `discovery_delivery_jobs`, `discovery_ai_briefs` (§18) —
over both the original two-table draft and the maximal four-table option;
adopt the transactional-outbox + separately-running-worker delivery
mechanism (§17/§26) over in-process fire-and-forget; adopt `sessionStorage`
-based draft recovery with explicit opt-in (§16); adopt idempotency-key-
uniqueness + indexed HMAC fingerprint + transactional recent-match lookup
as the duplicate/reliability mechanism (§18/§24), never a permanent or
"rolling" unique index on the fingerprint; adopt automatic, asynchronous
CRM lead upsert after accepted, non-spam submissions, with CRM failure
never affecting the submission (§28); keep the AI brief strictly non-
blocking and structurally separated from client answers regardless of
which AI provider is chosen (§29); keep the existing `/discovery` route
**and** the existing `POST /api/discovery/submit` endpoint live and
unmodified until the new system is independently verified (§17/§39); the
2C.2C frontend must never connect to the legacy endpoint (§16/§17);
document (but do not implement) the internal-recipient configuration
variable in 2C.2B, deferring its actual addition and wiring to 2C.2D/2C.2E
(§34). **Added 2C.2A.2:** adopt one-row-per-brief-version for
`discovery_ai_briefs`, with transactional enqueue of `briefVersion 1`
alongside the submission when AI generation is enabled (§18/§26/§29);
adopt `409 idempotency_conflict` for the same-key/different-payload case,
never an ordinary success (§24/§30); adopt the conservative v1 policy of
withholding delivery jobs and the AI-brief row for flagged likely-
duplicate submissions until operator resolution (§24 Correction 5); adopt
`DISCOVERY_FINGERPRINT_HMAC_KEY` + `DISCOVERY_FINGERPRINT_KEY_VERSION` as
the documented (not yet added) requirement for the fingerprint mechanism
to be safely implementable (§18/§34); adopt the precise, distinct fail-
open/fail-closed language for missing config vs. runtime store outage vs.
Turnstile unavailability (§22 Correction 7), never using "fail closed" for
a soft-degradation case. **Added 2C.2A.3:** adopt a canonical, HMAC-based
idempotency-payload digest (with explicit domain separation from the
duplicate fingerprint) as the mechanism for same-key payload comparison,
never the coarse fingerprint (§18/§24); adopt current-plus-previous HMAC
key configuration as a requirement for implementable rotation, with
previous-key retention covering at least the duplicate/idempotency retry
windows plus an operational grace period (§18/§34); adopt the four-state
`duplicateReviewStatus` model (`cleared` → exactly-once withheld
processing; `confirmed_duplicate` → permanently suppressed, audit-only)
over the three-state 2C.2A.2 model (§18/§24); require a workable operator
review path for pending duplicate reviews as a precondition for public
activation whenever duplicate-withholding is enabled, while leaving the
exact operational UI open for a later checkpoint (§24/§38).

## 43. Recommended Next Checkpoint

**Phase 2C.2B — Domain model and backend contract** (§37, corrected
2C.2A.1, clarified 2C.2A.2, further clarified 2C.2A.3), scoped exactly as
described there: shared schema, DTO, database schema + migration for all
**three** tables (`discovery_submissions` with `fingerprintKeyVersion`,
the canonical idempotency-payload-hash fields, and the four-state
`duplicateReviewStatus` plus its resolution audit fields;
`discovery_delivery_jobs`; `discovery_ai_briefs` modeled per brief
version), statuses, idempotency model (unique key + indexed fingerprint,
with the same-key comparison mapped to the canonical-payload-hash
mechanism and the mismatch case mapped to the `409 idempotency_conflict`
contract), safe-error contract, versioning — no email, CRM, AI
integration, route wiring, or worker execution. Requires a separate,
explicit approval prompt before any code is written, per the
AI-vibe-coding rules (§36) and the task brief's binding instruction not
to bundle phases into one prompt.

## 44. Explicit No-Implementation Decision

This document is planning and documentation only. No frontend component,
API route, database schema, migration, environment variable, package, or
legal page was created or modified to produce it. Implementation of any
phase in §37 requires a separate, explicit owner-approved prompt. This PRD
does not itself authorize Phase 2C.2B or any later phase to begin.
