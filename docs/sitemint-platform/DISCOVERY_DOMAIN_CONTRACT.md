# Discovery Domain Contract — Phase 2C.2B Technical Note

> Implementation checkpoint. Governed by
> `docs/sitemint-platform/DISCOVERY_FORM_HARDENING_PRD.md`. Domain foundation
> only — no route, component, worker, email, CRM, AI provider, environment
> variable, or deployment action. The current `/discovery` form and
> `POST /api/discovery/submit` endpoint are unchanged.
>
> **Current-location update (Checkpoint 2C.2C1, implemented):** the three
> browser-safe files this document originally placed under
> `lib/db/src/schema/` — `discoveryContract.ts`, `discoveryCanonicalization.ts`,
> `discoveryResponses.ts` — and their two co-located tests have moved to the
> dedicated `@workspace/discovery-contract` package
> (`lib/discovery-contract/src/schemas.ts`, `canonicalization.ts`,
> `responses.ts`; tests at `lib/discovery-contract/test/schemas.test.ts`,
> `canonicalization.test.ts`), per
> `docs/sitemint-platform/DISCOVERY_SHARED_CONTRACT_BOUNDARY.md`. The File
> map and Export/reachability sections below are preserved as an accurate
> record of Phase 2C.2B's original placement; see the current-location note
> inline in each for where each file lives now.

## Scope of this checkpoint

Shared typed contract, additive persistence schema (three tables), one
hand-authored and reviewed-but-unapplied migration, server-only crypto
helpers, and tests. Nothing here is wired into any application code path.

## File map

| File | Role |
|---|---|
| `lib/db/src/schema/submissions.ts` | Existing `discoverySubmissions` table, evolved additively (see below) |
| `artifacts/api-server/src/routes/crmDiscovery.ts` | **Narrow, strictly type-only compatibility exception** — one helper parameter type narrowed and one overly broad variable type annotation removed; the full original runtime object literal is preserved unchanged (corrected in Checkpoint 2C.2B.1 — see "crmDiscovery.ts compatibility exception" below) |
| `lib/db/src/schema/discoveryDeliveryJobs.ts` | New `discovery_delivery_jobs` table |
| `lib/db/src/schema/discoveryAiBriefs.ts` | New `discovery_ai_briefs` table |
| `lib/db/src/schema/discoveryContract.ts` (Phase 2C.2B location; moved to `lib/discovery-contract/src/schemas.ts` in Checkpoint 2C.2C1) | Shared `DiscoverySubmissionContract` Zod DTO, `DiscoveryTransportMeta`, version constants |
| `lib/db/src/schema/discoveryCanonicalization.ts` (Phase 2C.2B location; moved to `lib/discovery-contract/src/canonicalization.ts` in Checkpoint 2C.2C1) | Pure `canonicalizeDiscoveryPayload` function |
| `lib/db/src/schema/discoveryResponses.ts` (Phase 2C.2B location; moved to `lib/discovery-contract/src/responses.ts` in Checkpoint 2C.2C1) | Typed safe response/error contracts, closed error-code union |
| `lib/db/src/schema/discovery/index.ts` | Internal-only migration barrel (not a package export) |
| `lib/db/drizzle.discovery.config.ts` | Isolated Drizzle Kit config for the discovery migration lane |
| `lib/db/drizzle/discovery/0000_discovery-domain-contract.sql` | The one hand-authored additive migration |
| `artifacts/api-server/src/lib/discoveryHmac.ts` | Server-only HMAC utilities |
| `lib/db/test/discoveryContract.test.ts` (Phase 2C.2B location; moved to `lib/discovery-contract/test/schemas.test.ts` in Checkpoint 2C.2C1) | Shared contract schema tests |
| `lib/db/test/discoveryCanonicalization.test.ts` (Phase 2C.2B location; moved to `lib/discovery-contract/test/canonicalization.test.ts` in Checkpoint 2C.2C1) | Canonicalization determinism tests |
| `lib/db/test/discoveryDatabaseContract.test.ts` | Static Drizzle table/constraint assertions |
| `artifacts/api-server/test/discoveryHmac.test.ts` | HMAC utility tests |

## Export/reachability status (accurate as of Phase 2C.2B; see Checkpoint 2C.2C1 update below for the three moved files' current status)

**All five new Project Discovery files were internal to `lib/db/src/schema/`
as of this checkpoint (Phase 2C.2B).**
None was exported from `lib/db/src/schema/index.ts` (the shared,
application-facing barrel) — that file had **zero diff** in this checkpoint,
and still has zero diff after the Checkpoint 2C.2C1 move described below.
Concretely, as of Phase 2C.2B:

- `discoveryContract.ts`, `discoveryCanonicalization.ts`, `discoveryResponses.ts`
  — reachable only via a plain relative import from another file physically
  inside `lib/db/src` (e.g. the tests). Zero Node-only imports (verified:
  `discoveryContract.ts` imports only `zod/v4`; `discoveryCanonicalization.ts`
  imports only `zod/v4`-derived types from `discoveryContract.ts`), so they
  would be portable to a browser bundle in principle — but `web-agency`
  cannot import them yet, both because `artifacts/web-agency/package.json`
  has no dependency on `@workspace/db` at all, and because no package export
  exposes them regardless. The final browser-safe package boundary (stay in
  `lib/db` vs. extract to a dedicated package/subpath) is an explicit,
  separately-reviewed decision for the future frontend-wiring checkpoint
  (2C.2C+), not made here.

  **Update (Checkpoint 2C.2C1, implemented):** these three files (and their
  two tests) have moved to the new `@workspace/discovery-contract` package
  at `lib/discovery-contract/`, per the Option A decision in
  `DISCOVERY_SHARED_CONTRACT_BOUNDARY.md`. They are no longer present under
  `lib/db/src/schema/` or `lib/db/test/`. Both `web-agency` and `api-server`
  now declare a `workspace:*` dependency on `@workspace/discovery-contract`,
  though neither's application source imports it yet — no guided form, no
  new endpoint, and no consumer activation occurred in Checkpoint 2C.2C1.
- `discoveryDeliveryJobs.ts`, `discoveryAiBriefs.ts` — reachable only through
  the internal `lib/db/src/schema/discovery/index.ts` barrel, itself used
  solely as the `schema:` target of `drizzle.discovery.config.ts`. Not an
  application-facing import path. No current frontend or API runtime imports
  either table. A future approved checkpoint must create an explicit
  import/export path before any runtime wiring occurs.
- `artifacts/api-server/src/lib/discoveryHmac.ts` — server-only by
  construction: it lives inside `api-server`, which is never bundled to a
  browser, and is not re-exported from any shared package.

## `discovery_submissions` — field mapping (existing → PRD role)

Reused, not duplicated:

| PRD concept | Existing column | Notes |
|---|---|---|
| Overall intake status | `status` (text, default `"New"`) | Already read/written by `admin.ts`, `crm.ts`, `AdminSubmissionDetail.tsx`. Free text today, not the PRD's exact eight-value enum — no rewrite performed; a future checkpoint may layer stricter enum validation at the application layer for new writes only, without touching existing rows or other applications' reads. |
| Linked CRM lead ID | `leadId` (integer, nullable) | No new FK constraint added — no evidence needed, avoids constraint-violation risk on existing rows. |
| Original structured answers | `formData` (jsonb, not null) | Already holds the full submitted payload. |

New additive columns (all nullable except noted):

| Column | Type | Notes |
|---|---|---|
| `schema_version` | text | |
| `form_version` | text | |
| `idempotency_key` | text | Unique index; Postgres allows any number of `NULL`s under `UNIQUE`, so legacy rows never conflict. |
| `idempotency_payload_hash` | text | |
| `idempotency_payload_hash_key_version` | text | |
| `idempotency_canonicalization_version` | text | |
| `duplicate_fingerprint` | text | Ordinary (non-unique) index — lookup aid only, never a uniqueness mechanism. |
| `fingerprint_key_version` | text | |
| `duplicate_review_status` | text | **NOT NULL DEFAULT `'none'`** — CHECK-constrained to the four PRD states. `'none'` means "not currently flagged," never "validated by the new anti-spam system" — no legacy row is misrepresented. |
| `duplicate_of_submission_id` | integer | Self-FK → `discovery_submissions.id`, `ON DELETE SET NULL`. |
| `duplicate_resolved_at` | timestamptz | |
| `duplicate_resolved_by` | text | |
| `duplicate_resolution_reason_code` | text | |
| `privacy_policy_version` | text | |

No column here is ever fabricated for legacy rows — every field beyond the
`duplicate_review_status` default stays `NULL` until a future,
separately-approved checkpoint actually writes to it.

## Table responsibilities

- **`discovery_submissions`** — immutable source of truth for a client's
  original structured answers plus the searchable operational record.
  Existing primary key (`serial`) preserved unchanged.
- **`discovery_delivery_jobs`** — one row per durable downstream delivery
  obligation (not per attempt-event). UUID primary key (`defaultRandom()`).
- **`discovery_ai_briefs`** — one row per AI brief *version* (not per
  provider attempt). UUID primary key (`defaultRandom()`).

## Constraints and indexes

Named `CHECK` constraints (not native Postgres `enum` types) enforce every
status/type-like text column's allowed values at the database level:
`ck_discovery_submissions_duplicate_review_status`,
`ck_discovery_delivery_jobs_job_type`, `ck_discovery_delivery_jobs_status`,
`ck_discovery_ai_briefs_status`, `ck_discovery_ai_briefs_human_review_status`.
`CHECK` was chosen over a native `pgEnum` to match the existing, more recent
repository convention for status-like columns (`voiceAssistants.ts`'s
`ck_voice_assistants_status`, `voiceIssues.ts`'s `ck_voice_issues_level`) and
because it stays additive-friendly: extending a `CHECK`'s allowed set later
is an ordinary `DROP CONSTRAINT` + `ADD CONSTRAINT` in one transaction,
whereas Postgres historically restricts `ALTER TYPE ... ADD VALUE` inside a
transaction.

Uniqueness: `discovery_submissions.idempotency_key` (unique, nullable);
`discovery_delivery_jobs(submission_id, job_type)`;
`discovery_ai_briefs(submission_id, brief_version)`.

Worker-polling indexes: `discovery_delivery_jobs(status, next_attempt_at)`,
`discovery_ai_briefs(status, next_attempt_at)`. Additional indexes:
`discovery_submissions.duplicate_fingerprint`,
`discovery_submissions.duplicate_review_status`,
`discovery_submissions.created_at`, `discovery_ai_briefs.human_review_status`,
and a plain `submission_id` index on both new tables.

## Canonicalization behavior

`canonicalizeDiscoveryPayload(answers: DiscoverySubmissionContract): string`
(`discoveryCanonicalization.ts`) is pure and deterministic:

- Object keys sorted alphabetically at every level — never dependent on
  caller insertion order.
- Arrays preserve original element order by default (order is semantically
  meaningful for most array fields, e.g. `projectScope.features`,
  `readiness.referenceSites`). Only `projectDirection.secondaryInterests`,
  `decisionContext.secondaryGoals`, and `readiness.integrations` are treated
  as order-insensitive sets and sorted.
- An explicit `null` (only possible on the contract's `.nullable()` fields:
  `decisionContext.consequenceOfDelay`, `commercial.targetDate`) is
  preserved as `null` in canonical output, distinct from an absent/optional
  key (simply not present).
- Strings are trimmed defensively (idempotent given the contract already
  trims on validation).
- Input type is `DiscoverySubmissionContract` (validated answers only, never
  `DiscoverySubmissionRequest`), so transport metadata and every
  server/database-generated field are structurally excluded — there is no
  code path for them to leak into the canonical form.
- Output is tagged with `DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION`
  (`"v1"`).
- The canonical string itself is never stored — only its HMAC digest is
  (see below).

## HMAC domain separation

`artifacts/api-server/src/lib/discoveryHmac.ts` implements HMAC-SHA-256 with
explicit domain separation: the domain string is mixed into the HMAC input
(`${domain} ${input}`), not merely concatenated with the key, so a
domain/input boundary can never be confused with ordinary content. Two
approved domains: `discovery-fingerprint:v1` and
`discovery-idempotency-payload:v1` — the same root key material produces
different digests for each use case. `safeDigestEquals` uses
`crypto.timingSafeEqual` and fails safely (returns `false`, never throws) on
malformed or mismatched-length input. All key material is an explicit
function argument; the file contains no `process.env` reference.

## Foreign-key behavior

- `discovery_delivery_jobs.submission_id`, `discovery_ai_briefs.submission_id`
  → `ON DELETE CASCADE`. Both are pure operational metadata about a
  submission's downstream processing with no independent meaning once their
  submission is gone; cascading avoids silent orphans and lets a future
  retention purge clean up its own dependents without a separate step.
- `discovery_submissions.duplicate_of_submission_id` (self-reference) →
  `ON DELETE SET NULL`. Deleting an original submission that other rows
  point to as their "duplicate of" target must not delete or corrupt those
  other, still-valid, audit-retained submissions.

## Migration strategy and known limitations

**Strategy.** `discovery_submissions` has never been migration-tracked (it
is push-only, via `lib/db/drizzle.config.ts`). An earlier draft of this
checkpoint proposed bootstrapping a baseline migration (a full
`CREATE TABLE discovery_submissions` snapshot, labeled "never applied")
before the real additive migration — **rejected on review**: a runnable
migration directory must not contain a file that `drizzle-kit migrate` would
treat as pending and attempt to execute against a database where the table
already exists. **Corrected approach:** `drizzle-kit generate --custom
--name=discovery-domain-contract` against `drizzle.discovery.config.ts` —
a mode that performs no diff against any prior state at all, producing a
single empty SQL file that was then hand-authored to contain only the
approved additive statements (`ALTER TABLE discovery_submissions ADD COLUMN`,
the two `CREATE TABLE`s, and their indexes/constraints/FKs). This is the
**only** runnable Discovery migration produced this checkpoint — there is no
baseline file. Migration filename:
`lib/db/drizzle/discovery/0000_discovery-domain-contract.sql`. **Application
status: not applied to any database.**

**Known limitation 1.** This isolated Discovery migration lane will continue
using reviewed custom additive migrations until a separately approved future
checkpoint establishes a safe database-backed baseline strategy for
`discovery_submissions` — not solved by this checkpoint.

**Known limitation 2.** The two brand-new tables are fully isolated from
`pnpm --filter @workspace/db run push` (reachable only via the internal
`discovery/index.ts` barrel). The Phase 2C.2B additive columns on the
*existing* `discovery_submissions` table are **not** similarly isolated —
that table is already exported from the shared, push-scanned barrel,
unchanged, so a future `pnpm --filter @workspace/db run push` invocation
would see and could attempt to sync those new columns/indexes/constraints
too. Mitigations in place: no `push` is run this checkpoint; the
hand-authored migration is the approved, reviewed change mechanism; and per
standing project rules, automatic schema synchronization remains prohibited
for any real deployment regardless of this residual reachability.

## Legacy-row compatibility

Every new field on `discovery_submissions` beyond `duplicate_review_status`
stays `NULL` for all existing rows — no synthetic idempotency key,
fingerprint, or hash is ever fabricated for historical data.
`duplicate_review_status` defaults to `'none'`, which asserts only "not
currently flagged as a likely duplicate," never "validated by the new
anti-spam system that did not exist when this row was created."

## crmDiscovery.ts compatibility exception

Adding any new column to `discoverySubmissions` — however nullable —
necessarily changes `DiscoverySubmission` (`typeof discoverySubmissions.
$inferSelect`), because Drizzle's inferred select type always includes every
column as a required key (a nullable column still produces a required key
whose *value* type includes `null`, not an optional key). This broke
`artifacts/api-server/src/routes/crmDiscovery.ts`, which built a full
`DiscoverySubmission`-typed object literal (`partial`) purely as a synthetic
scratch input to a local helper, `buildDeterministicSummary` (also defined
in that file), to compute an AI summary/complexity/budget-tier
classification without touching the database.

`crmDiscovery.ts` is on this checkpoint's explicit "do not change" list.
This is a narrowly approved, **strictly type-only** compatibility exception
(owner decision during implementation), corrected in Checkpoint 2C.2B.1 after
an initial Checkpoint 2C.2B pass over-corrected by also trimming the
`partial` object literal's runtime properties — that trim is reverted.
Final, correct scope is exactly two type-level changes, with **zero runtime
change**:

- `buildDeterministicSummary`'s parameter type narrowed from
  `DiscoverySubmission` to a new local type,
  `DeterministicSummaryInput = Pick<DiscoverySubmission, "formData" |
  "budget" | "timeline" | "companyName" | "contactName" | "leadScore">` —
  exactly the six fields the function body actually reads (verified by
  inspection: `sub.formData`, `sub.budget`, `sub.timeline`,
  `sub.companyName`, `sub.contactName`, `sub.leadScore`). Only the helper's
  *compile-time dependency* was narrowed — its body, logic, and return value
  are byte-for-byte unchanged.
- The `partial` object literal **keeps its complete original runtime
  construction**, exactly as it existed before Checkpoint 2C.2B (all
  twenty-eight properties: `id`, `createdAt`, `updatedAt`, `contactName`,
  `companyName`, `email`, `phone`, `industry`, `serviceInterest`, `budget`,
  `timeline`, `decisionMaker`, `leadScore`, `tags`, `status`,
  `recommendedPackage`, `formData`, `generatedProposal`, `generatedSow`,
  `internalNotes`, `leadId`, `aiSummary`, `estimatedComplexity`,
  `estimatedBudgetTier`, `suggestedScope`, `crmStatus`,
  `preferredContactMethod`, `convertedProjectId` — same values, same
  construction order). Only its overly broad `: DiscoverySubmission` type
  annotation was removed; TypeScript now infers the literal's shape, and
  that inferred (wider) shape is passed structurally to the narrowed
  `buildDeterministicSummary` parameter — TypeScript permits passing a named
  variable with extra properties wherever a narrower `Pick<>` is expected
  (excess-property checking only applies to fresh object literals at a call
  site, not to a variable reference). **No Phase 2C.2B Discovery field
  (`schemaVersion`, `idempotencyKey`, etc.) was ever inserted into this
  legacy object**, as a null placeholder or otherwise.

**Runtime-equivalence verification (2C.2B.1):** the corrected file's emitted
JavaScript was compared against the Phase 2C.2A.3 parent commit's version
(`1a7514560af1e73f3aff4a92de27c44dfc30d65d`) via `tsc` with matching
`target`/`module`/`moduleResolution` settings. The only difference in the
entire emitted output is one erased section-header comment that TypeScript's
emitter drops because it sits directly above a type-only `type` alias
declaration (a well-known comment-attachment artifact of type erasure, not a
code difference) — every statement, expression, property, value, function
body, and return is identical.

**Explicitly unaffected**: the function's return value, every database
read/write in the route (both the `crmLeads` upsert and the
`discoverySubmissions` insert below it), the route path, `requireAdmin`
gating, request validation, status handling, CRM conversion behavior, and
every other route in the file. No CRM behavior of any kind changed.

## Next-phase boundaries

Not in scope for this checkpoint, deferred to 2C.2C+ per the PRD's phase
sequence (§37): guided frontend, `POST /api/v1/discovery-submissions` route,
transactional-outbox insert logic, delivery/AI workers, email/CRM/AI provider
integration, rate limiting/Turnstile, the browser-safe shared-contract
package boundary, and any environment variable addition
(`DISCOVERY_FINGERPRINT_HMAC_KEY` and related — documented in the PRD,
still not added).
