# Discovery Shared Contract Boundary — Architecture Decision Record

> Checkpoint 2C.2C0. Documentation and architecture decision only. No
> application code, component, route, package, `package.json`,
> `pnpm-lock.yaml`, TypeScript/Vite configuration, schema, migration, or
> environment variable changed. No database was contacted. No file was
> moved. Nothing was pushed, deployed, or activated.
>
> **Corrected in Checkpoint 2C.2C0.1** (documentation-only correction, no
> code/package/schema/migration change): fixed an inaccurate claim that the
> shared `lib/db/src/schema/index.ts` barrel currently exports the three
> browser-safe Discovery files (it does not); removed the `lib/db →
> discovery-contract` arrow from the recommended initial dependency graph
> (a future, types-only dependency in that direction is unnecessary for the
> package move and is not approved by this or the prior checkpoint);
> replaced the "Zod v4 or downgrade to v3" framing with a verification
> requirement — the contract package standardizes on `zod/v4` internally,
> and Phase 2C.2C1 must verify resolution/dedup/type/runtime/bundle
> behavior rather than assuming either a catalog bump or a v3 downgrade;
> and removed the open question suggesting a new test framework, since the
> existing `tsx`-based plain-TypeScript testing pattern is the approved
> initial strategy. See the corresponding `## Checkpoint 2C.2C0.1` entry in
> `docs/sitemint-platform/IMPLEMENTATION_ROADMAP.md` for the full record.

## 1. Executive decision

Adopt **Option A**: a new, dedicated, browser-safe workspace package,
`@workspace/discovery-contract`, at `lib/discovery-contract/`. It will hold
only the Discovery submission Zod contract, its inferred types, version
constants, canonicalization utilities, and typed public response contracts —
nothing that touches Drizzle, `pg`, Node built-ins, secrets, or `process.env`.
This checkpoint defines the boundary; it does not create the package or move
any file. Implementation remains unapproved pending owner review.

## 2. Current state

Phase 2C.2B added the Discovery domain contract inside `@workspace/db`:

- `lib/db/src/schema/discoveryContract.ts` — `DiscoverySubmissionContract`,
  `DiscoveryTransportMeta`, `DiscoverySubmissionRequest` Zod schemas + inferred
  types, version constants, enum arrays. Imports only `zod/v4`. No Drizzle,
  no Node built-ins.
- `lib/db/src/schema/discoveryCanonicalization.ts` — `canonicalizeDiscoveryPayload`,
  deterministic, imports only types from the file above. No crypto, no
  Drizzle, no `process.env`.
- `lib/db/src/schema/discoveryResponses.ts` — safe error codes and typed
  response/error interfaces. Zero imports.
- `lib/db/src/schema/discoveryDeliveryJobs.ts` and `discoveryAiBriefs.ts` —
  Drizzle `pg-core` table definitions. Node/DB-only, correctly placed.
- `lib/db/src/schema/discovery/index.ts` — an internal migration-only barrel
  consumed solely by `drizzle.discovery.config.ts`; it re-exports only
  `../submissions`, `discoveryDeliveryJobs.ts`, and `discoveryAiBriefs.ts`
  (the two new Drizzle tables plus the existing submissions table) — **not**
  the three browser-safe contract files — and is itself deliberately not
  re-exported from `lib/db/src/schema/index.ts`.
- **`lib/db/src/schema/index.ts` (the shared application schema barrel)
  currently contains no export, direct or indirect, for any of
  `discoveryContract.ts`, `discoveryCanonicalization.ts`, or
  `discoveryResponses.ts`** (verified: `grep -n discovery
  lib/db/src/schema/index.ts` returns no matches). Phase 2C.2B intentionally
  kept all three files internal to `lib/db/src/schema/` and excluded from
  every barrel. Consequently, moving them into `discovery-contract` does not
  require removing any shared-barrel export — there is none to remove — and
  `lib/db/src/schema/index.ts` needs no edit at all for the move to happen.
- `artifacts/api-server/src/lib/discoveryHmac.ts` — `node:crypto`-based HMAC
  helpers for duplicate fingerprint and idempotency-payload hashing. Key
  material is always an explicit argument; no `process.env` read inside the
  file. Not exported from any shared package.
- Current importers of the three browser-safe files are **only**
  `lib/db/test/discoveryContract.test.ts` and
  `lib/db/test/discoveryCanonicalization.test.ts` (verified by repository
  grep). No `api-server` or `web-agency` code imports them yet, because the
  guided form and versioned endpoint do not exist yet.
- `lib/db/package.json` exports `.`, `./schema`, and `./schema/voice` — there
  is no `./schema/discovery` export, so `web-agency` cannot reach these files
  today without importing the entire `@workspace/db` package (which would
  also pull in `drizzle-orm`, `drizzle-zod`, and `pg`).
- The workspace catalog currently resolves the `zod` package version used by
  consumers (`web-agency`'s catalog-pinned entry is `^3.25.76`), and the
  existing `discoveryContract.ts` already successfully imports from
  `zod/v4` today — this is not a proven incompatibility, only an unverified
  detail of how the new package's imports will resolve once
  `discovery-contract` becomes a dependency of `web-agency`. Phase 2C.2C1
  must verify the exact resolved package version, pnpm deduplication,
  TypeScript compatibility, runtime identity, and Vite bundle behavior
  before treating this as settled (see §24/§25).

## 3. Problem

The guided "Start Your Project" frontend (a future phase) needs to validate
Discovery answers client-side using the *same* rules the server enforces, so
frontend and backend never drift. The only contract that exists today lives
inside `@workspace/db`, a package whose primary purpose is shipping Drizzle
table definitions and a Postgres client to Node processes. Importing
`@workspace/db` from `web-agency` would put Drizzle, `drizzle-zod`, and `pg`
in the browser bundle — none of which the browser needs, and some of which
(`pg`) cannot run there at all.

## 4. Goals

- Give `web-agency` a way to import Discovery validation logic without
  depending on any database, Drizzle, or Node-only code.
- Keep exactly one source of truth for the Discovery submission schema,
  consumed identically by frontend and backend.
- Keep persistence (Drizzle tables, migrations) and secrets (HMAC keys)
  strictly server-side, with no path by which they become browser-reachable.
- Fit the existing monorepo conventions (`lib/*` raw-TS-source packages, no
  build step, `@workspace/*` naming) rather than inventing a new pattern.

## 5. Non-goals

- Not implementing the guided form, the versioned endpoint, or any UI.
- Not moving, copying, deleting, or renaming any file in this checkpoint.
- Not creating `lib/discovery-contract/`, its `package.json`, or any export.
- Not touching `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or any existing
  `package.json`.
- Not performing the Phase 2C.2C1 zod/v4 resolution, deduplication,
  TypeScript-compatibility, runtime-identity, or Vite-bundle verification —
  a required step of the next implementation checkpoint, not this one.
- Not assuming a workspace-catalog major-version bump, and not downgrading
  the contract package's internal schema imports to a v3-style API.
- Not editing `lib/db/src/schema/index.ts` — it requires no change, since it
  does not export any of the three files being relocated.
- Not applying the Phase 2C.2B migration or touching any database.

## 6. Evaluated options

**Option A — Dedicated workspace package `@workspace/discovery-contract`.**
A new `lib/*` package, following the exact convention already used by
`@workspace/api-zod`, `@workspace/api-client-react`, and `@workspace/db`
itself (raw-TS-source `exports`, no build step, `"private": true"`,
`"type": "module"`). Holds only the three already-browser-safe files.

**Option B — A browser-safe subpath under an existing shared package.**
Considered attaching a new export subpath to `@workspace/api-zod` or
`@workspace/api-client-react`. Rejected: `@workspace/api-zod` exists solely
as the target of the Orval codegen chain for the *generated* API client
schemas — it is not a hand-authored domain-contract home, and mixing
hand-written Discovery schemas into a generated-code package risks a codegen
run overwriting or conflicting with them. `@workspace/api-client-react` is
React-Query-specific plumbing, an unrelated concern. Neither package is a
"genuinely shared" browser-safe home for a new domain contract; grafting one
on conflates unrelated responsibilities and complicates ownership boundaries.

**Option C — Export the files from `@workspace/db/schema`.**
Rejected: `@workspace/db`'s `dependencies` include `drizzle-orm`,
`drizzle-zod`, and `pg`. Even though the three target files themselves don't
import these, `web-agency` would still declare a `workspace:*` dependency on
the whole package, and bundlers/type-checkers resolve the *package's*
dependency graph, not just the files actually imported at runtime — this
risks pulling `pg` into a Vite browser build or at minimum forces an
unnecessary, confusing dependency edge from a marketing/CRM frontend onto a
database package. It also does not fix the "no `./schema/discovery` export"
gap — it would require adding one anyway, which is functionally Option C
merging into a worse version of Option A.

**Option D — Duplicate the schema in frontend and backend.**
Rejected outright per the task's own constraints: this is exactly the
schema-drift risk the boundary decision exists to prevent, and duplicated
validation rules are explicitly forbidden.

**Recommendation: Option A.** It is the only option that gives `web-agency`
a dependency-light, Drizzle-free, single-source-of-truth import target
without forcing a new export onto an already-overloaded package or
duplicating logic.

## 7. Recommended architecture

`@workspace/discovery-contract` (Option A) is the recommended architecture: a small, dependency-light, zod-only workspace package that both `web-agency` and `api-server` can depend on directly, with no Drizzle, no Node built-ins, and no server secrets ever reachable from it. It requires no new export surface on an already-multi-purpose package (unlike Option C), no conflation with generated or React-Query-specific code (unlike Option B), and no duplicated validation logic (unlike Option D). It fits the monorepo's existing `lib/*` raw-TS-source convention exactly, so it introduces no new tooling pattern.

## 8. Dependency direction

```
web-agency
    |
    v
discovery-contract

api-server
    |
    +--> discovery-contract
    +--> lib/db (@workspace/db)         (separate sibling dependency)
    +--> server-local discoveryHmac.ts  (stays in api-server, not shared)

discovery-contract
    |
    v
zod/v4 only

lib/db (@workspace/db)
    (no dependency on discovery-contract initially)
```

This is the initial target graph for the package move: `web-agency` depends
only on `discovery-contract`; `api-server` depends on `discovery-contract`,
`lib/db`, and its own local `discoveryHmac.ts` as three independent
siblings; `discovery-contract` depends on nothing but `zod/v4`; `lib/db` has
no dependency on `discovery-contract` at all in this initial architecture.
No cycle is created or possible under this graph.

A future, types-only dependency from `lib/db` to `discovery-contract` (e.g.
for `drizzle-zod` insert-schema alignment against
`DiscoverySubmissionContract`'s inferred type) is **not required, not
approved for Phase 2C.2C1, and unnecessary for the clean package move**. It
may be proposed later, but only as its own, separately owner-reviewed
checkpoint — it is not part of the recommended initial architecture and
must not be implemented alongside the package move.

## 9. Proposed package layout (not created in this checkpoint)

```
lib/discovery-contract/
  package.json
  src/
    index.ts              (public entry point, re-exports below)
    schemas.ts             (DiscoverySubmissionContract, DiscoveryTransportMeta,
                             DiscoverySubmissionRequest, version constants, enums)
    canonicalization.ts     (canonicalizeDiscoveryPayload, CanonicalDiscoveryPayload)
    responses.ts            (safe error codes, response/error interfaces)
  test/
    schemas.test.ts
    canonicalization.test.ts
```

- Package name: `@workspace/discovery-contract`.
- `package.json`: `{"name": "@workspace/discovery-contract", "version": "0.0.0", "private": true, "type": "module", "exports": {".": "./src/index.ts"}, "dependencies": {"zod": "catalog:"}}` — matching `@workspace/api-zod`'s minimal shape exactly. The package's *internal* runtime schema code standardizes on the `zod/v4` import path (matching the already-working `discoveryContract.ts`); consumers import the package's exported schemas and inferred types from `@workspace/discovery-contract` itself, not from `zod` directly. Phase 2C.2C1 must verify the exact resolved `zod` package version under the workspace catalog, pnpm deduplication behavior, TypeScript type compatibility, runtime identity, and Vite bundle behavior for both `web-agency` and `api-server` before this is considered settled — see §24/§25. A catalog major-version bump is not assumed, and downgrading the contract package's internal imports to a v3-style API is not recommended or approved; if evidence from that verification shows a catalog change is actually required, Phase 2C.2C1 must stop and return to owner review rather than making the change unilaterally.
- No build step: consumed as raw TypeScript source, resolved by each
  consuming app's own toolchain (Vite for `web-agency`, `tsx`/`tsc` for
  `api-server`), identical to every other `lib/*` package today.
- Browser-safe entry point: `src/index.ts` re-exports only `schemas.ts`,
  `canonicalization.ts`, and `responses.ts` — no conditional exports needed
  since nothing server-only ever enters the package.
- TypeScript configuration: extend the same base `tsconfig` every other
  `lib/*` package extends; no new compiler options required since the code
  is plain, dependency-light Zod/TS.
- Dependency list: `zod` only (via the workspace catalog), with its
  resolved version and `zod/v4` compatibility verified per above.
- Testing command: mirror `lib/db`'s pattern — run via `tsx` (already an
  installed dependency, since no test framework exists in this repo), e.g.
  a `test` script in the new package's `package.json` invoking the two
  moved test files directly.
- Consumers: `web-agency` (frontend validation/canonicalization-preview),
  `api-server` (request validation, canonicalization, response typing).
- Forbidden imports *into* this package: `drizzle-orm`, `drizzle-zod`, `pg`,
  `node:crypto` or any `node:*` built-in, `@workspace/db`, any Express route
  or controller, `process.env` reads of any kind.
- Tree-shaking: since exports are plain named Zod schemas/functions/types
  with no side effects, bundlers can tree-shake unused pieces normally; no
  barrel-induced side effects to guard against.
- CommonJS/ESM: `"type": "module"`, ESM-only, matching the rest of the
  workspace (`pnpm-workspace.yaml` packages are all ESM already).
- Monorepo resolution: resolved via pnpm workspace protocol
  (`"@workspace/discovery-contract": "workspace:*"`) exactly like every
  other internal `lib/*` dependency in `web-agency`/`api-server`.

## 10. Proposed exports

- Discovery submission Zod schemas (`DiscoverySubmissionContract`,
  `DiscoveryTransportMeta`, `DiscoverySubmissionRequest`).
- Inferred TypeScript types for each schema.
- Submission/form/canonicalization version constants
  (`DISCOVERY_SCHEMA_VERSION`, `DISCOVERY_FORM_VERSION`,
  `DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION`).
- Canonicalization utilities (`canonicalizeDiscoveryPayload`,
  `CanonicalDiscoveryPayload`).
- Typed public response contracts (`DiscoverySafeResponse` and its member
  interfaces).
- Public-safe error codes (`DISCOVERY_SAFE_ERROR_CODES`,
  `DiscoverySafeErrorCode`).
- Deterministic option/enum arrays (`PROJECT_PRIMARY_TYPES`,
  `BUSINESS_STAGES`, etc.).
- Test fixtures containing no real personal information.

## 11. Forbidden exports

- Drizzle table definitions or any `drizzle-orm`/`drizzle-zod` object.
- Database clients or database column types.
- Migrations or migration metadata.
- `node:crypto` or any HMAC generation.
- Secrets or anything that reads `process.env`.
- Express routes, controllers, or services.
- Email, CRM, AI-provider, or worker code.
- Server-only logging.
- Internal duplicate-review details or operator/database IDs that are not
  public-safe.

## 12. File-movement strategy

Recommendation: **move**, not copy-then-remove and not a permanent
compatibility re-export. Because grep confirms the only current importers of
`discoveryContract.ts`, `discoveryCanonicalization.ts`, and
`discoveryResponses.ts` are their own co-located test files
(`lib/db/test/discoveryContract.test.ts`,
`lib/db/test/discoveryCanonicalization.test.ts`), there is no external
consumer to break. At the implementation checkpoint that creates
`lib/discovery-contract/`:

1. Move the three source files into `lib/discovery-contract/src/`.
2. Move the two test files into `lib/discovery-contract/test/`, updating
   their relative imports.
3. Delete the moved files from `lib/db/src/schema/` (not left behind, not
   re-exported) so there is exactly one source of truth going forward.
4. `lib/db/src/schema/discoveryDeliveryJobs.ts`, `discoveryAiBriefs.ts`, and
   the `discovery/index.ts` migration barrel stay in `lib/db` unchanged —
   only the three Drizzle-free files move.
5. **`lib/db/src/schema/index.ts` (the shared barrel) is not touched by this
   move.** It currently contains no export for `discoveryContract.ts`,
   `discoveryCanonicalization.ts`, or `discoveryResponses.ts` (per §2), so
   there is no shared-barrel export to remove, update, or redirect — the
   move only deletes the three physical files from `lib/db/src/schema/` and
   recreates them under `lib/discovery-contract/src/`. `lib/db/src/schema/
   index.ts` must remain unchanged during Phase 2C.2C1.

A temporary compatibility re-export is unnecessary here (unlike a
widely-consumed public API) precisely because nothing outside `lib/db/test/`
depends on the current path yet — the "phased migration to avoid breaking
external consumers" concern that would normally justify a shim does not
apply. This is intentionally the **narrowest** safe strategy: a clean cut,
not a phased deprecation.

## 13. Compatibility strategy

No compatibility shim is planned or needed, per §12. If a consumer is added
to `lib/db`-based imports before the move happens (which owner review should
watch for), the move should still happen atomically in one commit —
introducing a temporary re-export at that point would create exactly the
"two long-lived sources of truth" this decision is meant to prevent, and
should instead trigger updating that new consumer's import path in the same
commit as the move.

## 14. Canonicalization ownership

- `canonicalizeDiscoveryPayload` may live in the browser-safe package for
  predictable draft/review UI behavior (e.g. showing a user a stable preview
  of their submission before sending it).
- Browser canonicalization is **advisory only**. The server independently
  re-runs validation and canonicalization on the raw submitted answers; it
  never trusts a client-provided canonical string or digest.
- Idempotency HMAC generation (`hmacDigest`, `computeIdempotencyPayloadHash`,
  `computeDuplicateFingerprint`) remains server-only, in
  `artifacts/api-server/src/lib/discoveryHmac.ts` — never moved into
  `discovery-contract`.
- Canonicalization versions must match between what the client claims
  (`DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION`) and what the server
  computes; a mismatch must fail safe — the server rejects/re-derives rather
  than trusting the client's version tag or digest.

## 15. HMAC boundary

`artifacts/api-server/src/lib/discoveryHmac.ts` stays server-only; this
checkpoint does not move it and does not recommend moving it into any shared
package, since doing so would make HMAC helpers importable by a browser
bundle by construction (any package `web-agency` depends on is browser-
reachable). Current, already-correct properties, restated for the record:

- HMAC inputs: a domain-separation string (`DISCOVERY_FINGERPRINT_HMAC_DOMAIN`
  or `DISCOVERY_IDEMPOTENCY_PAYLOAD_HMAC_DOMAIN`) concatenated with the
  normalized input or canonical payload string, keyed by an explicit
  argument.
- Canonical string ownership: produced by `canonicalizeDiscoveryPayload`
  (destined for `discovery-contract`), consumed only by
  `discoveryHmac.ts` (stays in `api-server`) — a clean producer/consumer
  split across the package boundary.
- Server-only secret handling: key material is always passed as an explicit
  function argument; the pure helper contains no `process.env` read.
- Domain separation: fingerprint and idempotency-payload-hash use distinct
  domain strings so the same underlying value can never collide across uses.
- Constant-time comparison: `safeDigestEquals` uses `timingSafeEqual` and
  fails closed (returns `false`) rather than throwing/leaking timing.
- Later configuration injection point: the eventual route handler reads
  `DISCOVERY_FINGERPRINT_HMAC_KEY`/`_KEY_VERSION`/`_PREVIOUS_KEY`/
  `_PREVIOUS_KEY_VERSION` from `process.env` and passes them into these pure
  functions — the env read happens at the call site, never inside the helper
  itself, and never inside `discovery-contract`.

## 16. Database boundary

Drizzle tables and migrations remain under `lib/db`:
`discovery_submissions` (existing, additively evolved in 2C.2B),
`discovery_delivery_jobs`, `discovery_ai_briefs`, and the migration-only
`discovery/index.ts` barrel. `discovery-contract` must never export
`discoverySubmissions`, `discoveryDeliveryJobs`, `discoveryAiBriefs`,
any Drizzle schema, migration metadata, database constraints, or worker
indexes. The future API server route composes three independent pieces:
(1) the browser-safe validated contract from `discovery-contract` for
request parsing, (2) `lib/db`'s persistence schema for reads/writes, and
(3) `discoveryHmac.ts`'s server-only helpers for fingerprint/idempotency —
each imported directly by `api-server`, with no piece depending on another
except `discovery-contract` supplying types.

## 17. Frontend import boundary

The future `web-agency` guided form should import only from
`@workspace/discovery-contract` — never `@workspace/db`, never Drizzle,
never any `api-server` source file, never `node:crypto`, never server
environment configuration. Recommended usage:

- Step-specific schema projections (e.g. `DiscoverySubmissionContract.shape.projectDirection`)
  for per-step client-side validation across the guided form's multi-step UI.
- The full `DiscoverySubmissionContract` for final pre-submit validation.
- Safe option/enum constants for populating selects/radio groups.
- Inferred form types for component prop typing.
- Response contracts (`DiscoverySafeResponse`) for typing the fetch result.

## 18. API import boundary

The future versioned endpoint in `api-server` should import:

- The shared request schema and response contracts from
  `discovery-contract` for parsing/validating the incoming request and
  typing what it sends back.
- Canonicalization from `discovery-contract` to compute the canonical
  payload server-side (authoritative, independent of any client-sent value).
- Persistence tables from `lib/db` for reads/writes.
- HMAC helpers from its own local `discoveryHmac.ts` for fingerprint and
  idempotency-payload-hash computation, with key material sourced from
  `process.env` at the route/call-site level only.

Shared validation (what shape is acceptable) is strictly separated from
server authority (what actually gets persisted, deduplicated, and
delivered) — the contract package answers the former; `api-server` alone
answers the latter.

## 19. Testing strategy

The two existing Phase 2C.2B test files
(`lib/db/test/discoveryContract.test.ts`,
`lib/db/test/discoveryCanonicalization.test.ts`) move with their source
files into `lib/discovery-contract/test/` at implementation time, updating
only their relative import paths — their assertions and plain-TypeScript
style are unchanged. The new package gets its own test-run script (via
`tsx`, matching the existing no-framework convention) so it can be tested
in isolation from `lib/db`; Phase 2C.2C1 verifies the exact package-local
command. This checkpoint introduces no Vitest, Jest, Playwright, Supertest,
or other new test framework. Adopting one later would require its own,
separately approved package/lockfile checkpoint — it is not bundled into
the package move.

## 20. Package and lockfile impact (future, not performed now)

- New file: `lib/discovery-contract/package.json`.
- `pnpm-workspace.yaml`: no change needed — its `lib/*` glob already covers
  the new package directory.
- `pnpm-lock.yaml`: regenerated to add the new package and its `zod`
  dependency edge, plus new `workspace:*` edges from `web-agency` and
  `api-server`.
- `web-agency/package.json` and `api-server/package.json`: each gains one new
  `"@workspace/discovery-contract": "workspace:*"` dependency line.
- `lib/db/package.json`: no change required — it never exported
  `./schema/discovery` or any subpath for the three moved files, so there is
  no export to remove. `lib/db/src/schema/index.ts` (the shared barrel)
  itself needs **zero edits**, since it never referenced the three files
  being moved; only the physical `.ts` files under `lib/db/src/schema/` are
  deleted as part of the move.
- No TypeScript project-reference changes are anticipated beyond what pnpm
  workspace resolution already provides; no build configuration changes,
  since the new package follows the existing no-build convention.
- None of the above happens in this checkpoint.

## 21. Migration impact

This boundary decision requires none of the following, and none were
performed: applying the existing Phase 2C.2B Discovery migration, modifying
the migration SQL, contacting a database, modifying schema constraints,
changing table exports, or exposing the migration-only `discovery/index.ts`
barrel. The migration file
`lib/db/drizzle/discovery/0000_discovery-domain-contract.sql` is untouched
by this checkpoint.

## 22. Implementation sequence (recommended, not started)

1. Verify baseline and current consumers (re-confirm §2's grep result that
   only the two `lib/db/test/` files import the three target files).
2. Create `lib/discovery-contract/package.json` and the source/test layout
   per §9.
3. Move the three browser-safe source files into the new package.
4. Move the two associated tests and update only their imports as needed.
5. Do not leave duplicate source files or compatibility re-exports behind.
6. Add the new package dependency to `web-agency` and `api-server`.
7. Regenerate `pnpm-lock.yaml` using the approved package-management
   workflow.
8. Verify `zod/v4` resolution, deduplication, type compatibility, runtime
   behavior, and Vite bundle safety (§9, §24).
9. Run package tests, workspace typechecks, builds, and protected-file
   checks.
10. Confirm `lib/db/src/schema/index.ts` and the Discovery migration are
    unchanged (per §5/§12/§20 — no edit to that barrel is expected or
    permitted as part of this move).
11. Stop before any guided-form or endpoint implementation.

No application consumer needs to import the package merely to prove the
move; actual frontend/API use (per §17/§18) remains a later checkpoint
unless explicitly included and approved separately.

## 23. Stop conditions

Stop and return to owner review if: any application code needs to change to
make this boundary work (it shouldn't — the three files are already
Drizzle-free); a cycle would be introduced between `discovery-contract`,
`lib/db`, or `api-server`; the Phase 2C.2C1 zod/v4 verification (§9, §24)
turns out to require a workspace-catalog major-version change to an
already-shipped package; or `lib/db/src/schema/index.ts` would need any
edit to complete the move (it should not — see §2/§12/§20).

## 24. Risks

- **Zod resolution unverified**: the workspace catalog currently resolves
  the `zod` package version used by consumers, and the existing
  `discoveryContract.ts` already successfully imports from `zod/v4` today —
  this is a verification requirement, not a proven incompatibility. The
  contract package should standardize its internal runtime schema imports
  on `zod/v4`, with consumers importing the package's exported schemas and
  inferred types rather than `zod` directly. Phase 2C.2C1 must verify the
  exact resolved package version, pnpm deduplication, TypeScript
  compatibility, runtime identity, and Vite bundle behavior. A
  catalog major-version bump is not assumed, and downgrading the contract
  to a v3-style API is not recommended or approved. If evidence from that
  verification shows a catalog change is actually required, the checkpoint
  performing it must stop and return to owner review rather than making the
  change unilaterally.
- **Missing `lib/db/MIGRATIONS.md`**: both `DISCOVERY_FORM_HARDENING_PRD.md`
  and `DISCOVERY_DOMAIN_CONTRACT.md` reference this file for migration
  convention, but it does not exist in the repository today. Not a blocker
  for this boundary decision, but a pre-existing documentation gap worth
  closing before or alongside the next implementation checkpoint.
- **Premature consumer creep**: if any code starts importing the current
  `lib/db/src/schema/discoveryContract.ts` path before the move happens, the
  move becomes a breaking change instead of a clean cut — mitigated by doing
  the move as the very first step of the next implementation checkpoint.

## 25. Open questions

1. During Phase 2C.2C1's zod/v4 resolution verification (§9, §24), what
   exactly does pnpm resolve for `web-agency` and `api-server` once
   `discovery-contract` is a dependency — a single deduplicated `zod`
   install compatible with the `zod/v4` import path, or something requiring
   further action? This is a verification item to close out during that
   checkpoint, not a choice to make now.
2. Should `lib/db/MIGRATIONS.md` be authored now (documentation-only) as a
   separate, unrelated checkpoint, given both PRD documents already cite it?
3. Should a future, types-only `lib/db → discovery-contract` dependency
   (§8) ever be proposed, and if so, is it worth its own owner-reviewed
   checkpoint, or should `lib/db`'s Drizzle insert schemas simply stay
   independently defined indefinitely?

Adopting a new testing framework (Vitest, Jest, Playwright, Supertest, or
similar) is explicitly **not** an open question for Phase 2C.2C1: the
existing plain-TypeScript, `tsx`-based testing pattern (§19) is the
approved initial strategy. Introducing a different framework would require
its own, separately approved package/lockfile checkpoint.

## 26. Recommended next checkpoint

Phase 2C.2C1 (implementation): create `lib/discovery-contract/` and perform
the file move described in §12 and the implementation sequence in §22,
contingent on owner approval of this document. `lib/db/src/schema/index.ts`
is not edited as part of that checkpoint (§2, §12, §20), and the zod/v4
resolution/deduplication/bundle verification in §9/§24 is performed as part
of that same checkpoint rather than treated as a precondition to starting
it.

## 27. Explicit no-implementation decision

This checkpoint is a decision record only. No package was created, no file
was moved, no dependency was added, and no code changed as a result of this
document. Implementation is explicitly **not** approved by this checkpoint
and requires a separate owner-approved checkpoint to begin.
