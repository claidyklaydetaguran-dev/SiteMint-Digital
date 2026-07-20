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
  (indexed, not unique — see below), high-level intake status (§19), an
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

- `discovery_ai_briefs` — one row per AI-brief attempt, FK to
  `discovery_submissions.id`, holding only AI-generated content: source
  submission ID, `aiBriefPromptVersion`, provider/model metadata (once
  approved), generation status, retry count/processing metadata,
  structured AI output, human-review status, reviewer, review timestamp,
  created/updated timestamps. Kept structurally separate from the
  submission row specifically so AI content can never be written into the
  same JSON blob as client-supplied answers (§29 requirement).

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
  Documented behavior: (1) same idempotency key + same payload → return
  the original stored result, no new row; (2) same idempotency key +
  different payload → treated as a client bug/replay, original result
  returned, discrepancy logged for review, no data loss; (3) different key
  but a fingerprint match within the window → flagged for operator review
  as a likely duplicate, but still stored as its own row (never silently
  dropped); (4) different key and a meaningfully changed submission → a
  new fingerprint, stored normally, no flag; (5) a legitimate resubmission
  after the duplicate window has elapsed → stored normally as a new
  submission, no special handling. This preserves the property the
  original two-table draft was trying to protect (retries and near-
  duplicates don't silently multiply) while never permanently blocking a
  prospect who genuinely submits an updated project later.

Keys/constraints: UUID primary keys on all three tables; unique constraint
on `discovery_submissions.idempotencyKey`; ordinary index on the
duplicate fingerprint (not unique, per above); indexes on `email`,
`status`, `createdAt` on `discovery_submissions`; unique constraint on
`discovery_delivery_jobs(submissionId, jobType)`; FK from
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
onto the submission row.

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
repeated-submission protection (§23/§24).

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

**Corrected (2C.2A.1)** — see the full correction and the five documented
scenarios in §18. Summary: client generates an `idempotencyKey` (UUID)
once per form session; the server enforces it with a **unique constraint**
on `discovery_submissions.idempotencyKey`, so a retry with the same key
returns the original stored result rather than creating a new row.
Independently, an **HMAC-based duplicate fingerprint** (never raw email/
phone/IP stored in plain text) gets an **ordinary, non-unique index**, and
a **transactional query for recent matches** within the chosen duplicate
window (e.g. 15 minutes) flags likely-duplicate *distinct* submissions for
operator review — it never blocks, rejects, or silently discards them (a
legitimate second inquiry, or a genuinely updated resubmission after the
window, must never be lost). The prior direction ("unique index on
fingerprint scoped to a rolling window") was not a coherent database
mechanism and is retracted.

## 25. Idempotency Strategy

See §24/§18 — the idempotency key (enforced via a real unique database
constraint) is the mechanism for safe retries of the *same* client action
(e.g., a network timeout followed by an automatic client retry); it is
distinct from the fingerprint-based spam/duplicate-review signal, which
flags but never blocks near-duplicate distinct submissions.

## 26. Reliability and Partial-Failure Model

**Corrected (2C.2A.1) — transactional outbox, not in-request fire-and-
forget.** A submission is **received** the moment one database transaction
commits both (a) the `discovery_submissions` row and (b) its required
`discovery_delivery_jobs` rows (`client_acknowledgment_email`,
`internal_notification_email`, and — pending the CRM decision recorded in
§28 — `crm_lead_upsert`), all created `pending`. The HTTP response is
returned only after that transaction commits. A **separately-running
worker** (§17), not a callback started inside the request, later claims
and processes pending/`retry_scheduled` jobs. If no worker happens to be
running at that moment, the jobs simply remain `pending` in the database —
nothing is lost to a deployment restart, process crash, or request-
lifecycle interruption, because the durable record already exists before
the response is sent. AI brief generation (§29) is enqueued the same way
but is not a `discovery_delivery_jobs` row — it is its own record in
`discovery_ai_briefs`, created after (not inside) the same transaction and
processed by its own async path, since it is not a "delivery" obligation
in the client-facing sense.

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
row (§26) and executed later by the delivery worker (§17), never inline
in the request. Duplicate sends are prevented by the job's own status
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
submission (§26). SiteMint's internal CRM is the ongoing lead-management
source of truth once handoff succeeds; `discovery_submissions` remains the
immutable intake source of truth regardless of CRM state. CRM failure must
never fail, delete, or otherwise affect the already-accepted submission —
it only leaves the `crm_lead_upsert` job `retry_scheduled` or
`permanently_failed` for operator follow-up. The CRM upsert uses the
submission ID as its external/idempotency key on the CRM side specifically
to prevent duplicate-lead creation across retries.

## 29. AI-Generated Brief Workflow

Runs only after the source submission is durably stored; strictly
non-blocking; separate table (`discovery_ai_briefs`, §18) so AI output can
never overwrite, obscure, or be confused with the client's original
answers. Brief may include: project summary, business context, primary
problem, customer/team impact, desired outcome, decision context, likely
self-reported motivations (restated, not invented), required modules, user
roles, permissions, workflows, integrations, risks, unknowns,
contradictions, missing information, discovery-call questions, preliminary
complexity, suggested phases, initial PRD outline, recommended human
follow-up. Always labeled `AI-generated draft — requires human review`.

**Recorded owner decision (2C.2A.1):** the AI provider does not receive
contact name, email, or phone by default — only the business/project-
scoping fields actually needed for the brief. Every generated brief
requires review by an authorized SiteMint administrator or team member
before any downstream use. AI failure never affects submission acceptance
(§26).

Definitions required before implementation (2C.2E scope): exact source
fields sent to the AI provider (excluding anything not needed for the
brief, per the PII-exclusion decision above), provider boundary (single abstraction
point, matching the existing `VoiceProvider` isolation pattern precedent in
root `CLAUDE.md` for the voice platform), `aiBriefPromptVersion`, response
schema + validation, storage location (`discovery_ai_briefs`), failure
status, bounded retry strategy, human-review status field, audit history,
deletion behavior, regeneration behavior (creates a new versioned row,
never overwrites a prior brief). AI must never promise price, timeline, or
feasibility; never reject a lead; never score protected characteristics;
never infer medical/psychological diagnoses; never invent requirements;
never rewrite original answers; never trigger a contract or send an
unreviewed proposal; never expose an interpretation to the client as fact.

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
| Duplicate submission (idempotency key) | 200/201 (returns original) | `duplicate_of_existing` | neutral | n/a | yes (original) | no | yes |
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
| `DISCOVERY_RATE_LIMIT_WINDOW`/`_MAX` (proposed) | Stage 1 rate limiting | optional (sane default) | disabled or high limit | required | required | no | fail open to a conservative default, never fail closed and block all traffic |
| `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (proposed, Stage 2) | paid-traffic bot protection | unset (feature off) | unset | optional | required at Stage 2 | secret (server key) | fails closed to "challenge unavailable, fall back to Stage 1 controls," never fails closed to blocking all submissions |
| `PRIVACY_POLICY_VERSION` (proposed) | consent-record versioning | optional | optional | required | required | no | defaults to a documented initial version |
| `VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED` (existing, unrelated flag reused as gating pattern) | gates the new frontend behind the same safe-preview mechanism during rollout | off | off | on | off until approved | no | fails closed (confirmed unchanged this checkpoint) |

No variable is added or changed by this checkpoint — table is a planning
inventory for 2C.2B–2C.2D.

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

**Phase 2C.2B — Domain model and backend contract (corrected 2C.2A.1).**
Scope: shared zod schema, DTO, request/response contracts, submission/
delivery statuses, `discovery_submissions` (redesigned) +
**`discovery_delivery_jobs`** (added in this correction) +
`discovery_ai_briefs` schema and Drizzle migration, idempotency model
(unique `idempotencyKey` constraint + indexed fingerprint, per §18/§24),
safe-error contract, versioning. No email/CRM/AI integration, no route
wiring, and no worker execution in this phase — the transactional-outbox
insert logic and the delivery worker are 2C.2D/2C.2E scope. Files: shared
schema location (§14), migration files for all three tables, no route
wiring yet or minimal route stub only. Stop condition: schema + migration
reviewed and typechecked; no UI. Tests: schema validation unit tests.
Requires separate approval prompt before starting.

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
limiting, duplicate-window check (§24), idempotency enforcement, **the
transactional submission-plus-delivery-job insert (§26)**, safe logging,
sanitized HTTP errors, privacy disclosure, working `/privacy` and `/terms`
destinations, controlled-preview integration with the 2C.2C frontend (which
now has a real endpoint to call instead of its mock adapter). Does not
remove the legacy endpoint. Requires separate approval prompt.

**Phase 2C.2E — Delivery worker, CRM, email, and AI brief (corrected
2C.2A.1, retitled from "Delivery and AI workflow").** Scope: the durable
`discovery_delivery_jobs` processor/worker (§17), bounded retry policy,
locking and stale-lock recovery, client-acknowledgment job execution,
internal-notification job execution (recipient made configuration-driven
here, per the §34 reconciliation — not in 2C.2B), automatic SiteMint CRM
lead upsert (§28 owner decision), operator-visible permanently-failed jobs,
manual retry capability, AI-brief generation workflow, human-review state,
downstream partial-failure behavior per §26. Requires separate approval
prompt; explicitly requires provider credentials/config decisions first.

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
  mechanism.

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
(§34).

## 43. Recommended Next Checkpoint

**Phase 2C.2B — Domain model and backend contract** (§37, corrected),
scoped exactly as described there: shared schema, DTO, database schema +
migration for all **three** tables (`discovery_submissions`,
`discovery_delivery_jobs`, `discovery_ai_briefs`), statuses, idempotency
model (unique key + indexed fingerprint), safe-error contract, versioning
— no email, CRM, AI integration, route wiring, or worker execution.
Requires a separate, explicit approval prompt before any code is written,
per the AI-vibe-coding rules (§36) and the task brief's binding
instruction not to bundle phases into one prompt.

## 44. Explicit No-Implementation Decision

This document is planning and documentation only. No frontend component,
API route, database schema, migration, environment variable, package, or
legal page was created or modified to produce it. Implementation of any
phase in §37 requires a separate, explicit owner-approved prompt. This PRD
does not itself authorize Phase 2C.2B or any later phase to begin.
