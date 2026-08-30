# Implementation Plan — Frontend V2

Ten independently testable phases. Each is a separate authorised gate with its
own completion criteria and rollback boundary.

**Blueprint approved.** The owner's six decisions (`FRONTEND-V2-PRD.md` §0) are
incorporated and authoritative. **Phase 1 is authorised; Phases 2–10 are not —
each requires its own owner review.**

> **Verification environment (binding).** `pnpm-workspace.yaml` — a frozen config
> blob — prunes every non-Linux-x64 native binary for both `esbuild` and
> `rollup` (`esbuild>@esbuild/win32-x64: '-'`,
> `rollup>@rollup/rollup-win32-x64-msvc` absent from the retained set). The
> Vitest suite and the production build therefore **cannot run on Windows** in
> this worktree; `pnpm run typecheck` can. Bundle measurements and the
> test/build gates must be produced on a **Linux x64 candidate**, exactly as
> Gates 2A–2D were. Do not "fix" this by editing the frozen blob — that is a
> stop condition.
>
> `pnpm run <script>` also auto-runs `pnpm install`, which appends an
> `allowBuilds:` stub to `pnpm-workspace.yaml` and breaks the blob. Run every
> workspace script with `--config.verify-deps-before-run=false`, and verify the
> four blob hashes afterwards.

## Standing rules for every phase

- Branch `redesign/frontend-v2` in `C:\SiteMint-Digital-frontend-v2` only.
- **Never** touch `artifacts/api-server`, `lib/db`, migrations, seeds, auth
  contracts, provider integrations, billing, calendar, webhooks, Stripe,
  credentials, environment, or deployment config.
- The four config blobs stay unchanged: `package.json fd69b47a…`,
  `pnpm-lock.yaml dc119ea7…`, `pnpm-workspace.yaml fb0abf3e…`,
  `.npmrc 61e34c2e…`. Any change is a stop condition.
- No push, pull, fetch, PR, or deploy. The recovery branch is never modified.
- Every phase ends with `pnpm run typecheck`, `pnpm run test`, and the
  environment-qualified build, compared against the Gate 2D baseline:
  **0 type errors · 100/100 Vitest · 9/9 legacy files · all five packages built**.
- Every phase reports bundle deltas against `PERFORMANCE-ARCHITECTURE.md` §2.
- Accessibility verification per `ACCESSIBILITY-REQUIREMENTS.md` §9.

---

## Phase 1 — Foundations and routing (AUTHORISED)

Phase 1 is **foundations and routing only**. It does **not** redesign the
homepage, the AI Receptionist landing page, signup, dashboard surfaces, or the
Discovery UI — it establishes the architecture those later phases build on.

**Files:** `lib/design-tokens/*` (token export), a shared UI package
(consolidating the duplicate 56 + 55 shadcn files),
`artifacts/web-agency/src/App.tsx`, `artifacts/helpdesk/src/App.tsx`, a new
typed route/path module in both apps, `vite.config.ts` in both (chunk strategy
only), new shell / `ErrorBoundary` / `Skeleton` primitives, and the font
declarations in both apps' `index.html` and `index.css`.

**Preserved contracts:** every route path; all five `/app*` redirects;
signup-before-landing route specificity (`/ai-receptionist/signup` must stay
matched ahead of `/ai-receptionist`); Discovery routes; auth;
`/ai-receptionist/dashboard` behaviour; every backend API, request/response
schema, signup field contract, SMS behaviour, voice readiness logic, tenant
isolation, billing/trial enforcement, database schema, migration, provider,
credential, webhook, calendar, Stripe, and deployment configuration.

**Work:**

1. **Route-level code splitting** — major public, auth, Discovery, and dashboard
   pages become `lazy()`. The **26 CRM/admin pages leave the initial public
   bundle**. Lazy imports must **not** be funnelled through a barrel that
   recreates eager loading.
2. **Three explicit shells, and only three** — `PublicShell`, `AuthShell`,
   `DashboardShell`. No dashboard navigation or admin dependency may enter
   `PublicShell`; no promotional public-site section may enter `DashboardShell`.
   Each preserves existing behaviour while preparing for later visual
   replacement.
3. **One centralised typed route/path layer** for internal links and asset URLs:
   public routes work at `/`; configured deployment prefixes stay supported; no
   doubled base path; no root-relative asset failure; **`Start Your Project`
   resolves to `/discovery`**; dashboard paths stay distinguishable from public
   paths. Deployment configuration is **not** changed.
4. **Route recovery** for every major route group — a loading fallback plus an
   error-recovery boundary: no blank screen; loading UI never blocks
   already-available content; loading layout has stable dimensions; errors offer
   retry or safe navigation; **no stack traces shown to ordinary users**;
   reduced-motion honoured.
5. **Design-token foundation** covering colours, typography, spacing,
   containers, borders, radii, shadows, focus states, motion duration, motion
   easing, and layering/z-index, with the **light-forward palette as the public
   default**. **No broad mechanical replacement of the 670 inline styles** —
   establish the migration path and convert only the shared foundations Phase 1
   needs.
6. **Font foundation** — remove the need for the three render-blocking Google
   families. Use one approved variable font **only if already safely available**;
   otherwise a high-quality system font stack. **No new remote font request.**
7. **Deferred routes** — `/pricing`, `/ai-for-lawyers`, `/ai-for-realtors` leave
   the approved public navigation and IA. **Their source files are not deleted**;
   they are kept as rollback references.

**Completion:** all routes still resolve; meaningful separation of public and
dashboard bundles, with **no dashboard/admin module in the public initial
graph**; zero 404s at both `/` and a prefixed base.
**Tests:** full route smoke; existing suites green — **on a Linux x64 candidate**
(see the environment note above).
**Perf:** entry bundle, gzipped public initial JS, module counts, per-route chunk
names and sizes, CSS size, font requests, and build warnings — before and after,
against the 3,045 / 1,812.80 kB baseline.
**Rollback:** revert Phase 1 commits; no other phase depends on unmerged work.

---

## Phase 2 — Shared public shell

**Files:** new `Header`, `Nav`, `MobileDrawer`, `Footer`, `SectionHeader`,
`PageShell`; retire `PlatformPreviewPageShell` usage on rebuilt routes.

**Preserved:** nav destinations per IA §1; Sign In → dashboard login via
`dashboardUrl()`.

**Work:** global nav with Solutions dropdown; primary CTA **Start Your Project**
(never "Book a Call"); focus-trapped mobile drawer; footer; skip link.

**Completion:** keyboard-complete nav; hover has focus parity; no horizontal
overflow at 320/390/768/1024/1440; drawer traps and restores focus.
**Tests:** nav interaction tests; axe on the shell.
**Rollback:** shell is additive; old shell remains until a route is migrated.

---

## Phase 3 — Homepage

**Files:** new `pages/Home.tsx` + `components/home/*` (13 sections per IA §2);
`ConnectedSystem` diagram (inline SVG/CSS).

**Preserved:** `/` route; `Start Your Project` → `/discovery`.

**Work:** hero with fixed copy (Content §2), primary CTA **Start Your Project**
and secondary **View Our Work**; **light-forward surface plan** per IA §2 — navy
appears exactly twice (one feature section + footer); hero system composition in
HTML/CSS — **no device imagery, no generated imagery, no video, no WebGL**;
workflow animates once or on interaction then static; **"Selected work"** honest
presentation.

**Completion:** LCP < 2.5 s throttled mobile; CLS < 0.1; homepage chunk within
budget; **0 invisible sections** at 390/1440; readable with JS disabled; **no
unverified statistic, timeline, or availability claim rendered**; no page is
majority-dark.
**Tests:** section render tests; reduced-motion; axe.
**Rollback:** route-level swap back to `PlatformPreview`.

---

## Phase 4 — AI Receptionist landing

**Files:** new `pages/AiReceptionist.tsx` + `components/air/*`; retire
`LandingReceptionist` from routing (source retained for rollback, as Port 3/4
already establish as the pattern).

**Preserved:** `/ai-receptionist` route; CTA → `/ai-receptionist/signup`.

**Work:** nine sections per IA §3; approved headline *"Every lead deserves a
timely response."* with the approved supporting copy; **mandatory readiness
labelling** — SMS *available now*, voice *in development*, connected CRM and
automated follow-up *planned direction*, each future capability visibly labelled;
five core jobs **verification-gated per Content §4.2** (each verified against
repository code before being presented as shipped); call-workflow diagram;
**human-control section**; use cases as scenarios; **only repository-verified
integrations named**.

**Completion:** **no unverified claim shipped** — every statistic, availability
claim ("24/7", "every call"), industry count, and delivery timeline listed in
Content §9 is **removed**, not disclaimed; emoji iconography replaced with SVG;
no pricing figures.
**Tests:** content-contract test asserting no removed claim, placeholder
statistic, or unlabelled future capability renders.
**Rollback:** restore the previous component at the route.

---

## Phase 5 — Signup, login, and onboarding

**Files:** new `pages/Signup.tsx` (two-step), `pages/Login.tsx` (helpdesk),
shared form primitives.

**Preserved — frozen:** `POST /api/receptionist/auth/signup`; fields
`fullName, businessName, email, phone, industry, password`; 201 `{ firm }` +
session cookie; 400/409/429 `{ error }`; success continues into the existing
authenticated onboarding route.

**Work:** Step 1 *Your account* (full name, email, phone, password) → Step 2
*Your business* (business name, industry, review & create). **No request until
final submission.** Backward navigation preserves data. Field-level validation.
Visible password rules. Explicit submitting state. Understandable duplicate-email
and rate-limit errors. Correct focus movement. Correct mobile input types.
**No fake success path. No automatic submission.**

**Completion:** request body byte-identical to today's contract, asserted by
test; every accessibility item in §4 of the a11y doc verified.
**Tests:** contract test on the submitted payload; validation and focus tests;
error-mapping tests for 409 and 429.
**Rollback:** restore the single-step page; contract untouched throughout.

---

## Phase 6 — Authenticated dashboard shell

**Files:** helpdesk `AppShell`, new dashboard nav, route error boundaries,
skeletons.

**Preserved:** every helpdesk route; session auth; base path.

**Work:** nav = Overview · Calls · Leads · Appointments · Receptionist ·
Knowledge · Integrations · Settings; restrained neutral layering; operational
tone; **voice-provider readiness moved to Integrations with a compact Overview
row**.

**Completion:** all 17 helpdesk routes reachable; dashboard split into route
chunks; readiness logic unchanged (verified by the existing tests).
**Rollback:** shell swap; pages unchanged.

---

## Phase 7 — Dashboard feature surfaces

**Files:** `Overview`, `Calls` (from `Inbox` + `CallLogs`), `Leads` (from
`Contacts`), `Appointments`, `Receptionist` (from `AgentConfig` + `Assistants`),
`Knowledge`, `Integrations` (from `Deploy`), `Settings`.

**Preserved:** all data hooks, query keys, and API calls exactly as they are.

**Work:** Overview priority order per IA §4.1; **four states on every data
surface**; **no decorative charts, no fabricated analytics** — a metric without
real data shows its empty state.

**Completion:** every surface demonstrates loading/empty/error/populated in
test; no placeholder number rendered as real.
**Tests:** state-matrix tests per surface.
**Rollback:** per-surface, independently revertible.

---

## Phase 8 — Discovery and voice-platform visual integration

**Files:** `components/platform-discovery/*` presentation only;
`VoiceProviderStatusCard` presentation only.

**Preserved — logic frozen:** `@workspace/discovery-contract` schemas, draft
persistence, validation, submission; `voicePlatformEnabled` and all provider
readiness logic across the nine helpdesk files.

**Work:** restyle Discovery to the V2 system — **presentation only, and not
before Phase 8**; it stays **public** at `/discovery` as the primary
*Start Your Project* flow, resolved through the centralised route helper, and is
**never moved into the authenticated dashboard**; `/discovery/__legacy` stays
unlinked; present voice readiness contextually.

**Completion:** Discovery submits an identical payload (contract test);
`lib/discovery-contract` tests still pass; voice readiness behaviour unchanged.
**Rollback:** presentation-only revert.

---

## Phase 9 — Performance and accessibility hardening

**Files:** image pipeline, font subset, chunk tuning, `<picture>` conversions.

**Work:** re-encode retained images to AVIF/WebP with `srcset` (**none above
300 KB**); delete `plant.png`, `devices-hero.png`,
`hero-devices-remove-bg-io.png`; tune chunk boundaries; close every axe finding.
**No image is generated to fill space, and no video is added** — Phase 9
optimises existing real assets only.

**Completion:** LCP < 2.5 s · CLS < 0.1 · INP < 200 ms; public entry
**≤ 250 KB gz**; `public/` far below today's 19.8 MB; axe zero critical/serious;
zero 404s at both bases.
**Rollback:** asset and config changes revert independently of UI.

---

## Phase 10 — Full acceptance testing

**Work:** the full gate discipline used in Gates 2A–2D — isolated Linux
candidate from the exact commit, frozen-lockfile install, typecheck, tests,
environment-qualified build, then a local preview reviewed by the owner.

**Completion criteria:**

1. `pnpm run typecheck` — 0 errors.
2. `pnpm run test` — 100/100 Vitest, 9/9 legacy files.
3. Build — all five packages.
4. Four config blobs unchanged.
5. Every preserved route verified working.
6. Performance budgets met.
7. Accessibility gates passed.
8. **No fabricated content anywhere** — no invented statistic, result,
   availability claim, customer count, performance claim, or delivery timeline;
   no unverified named integration; every future capability visibly labelled
   *in development* or *planned*.
9. **Light-forward confirmed** — no public page is majority-dark; navy limited
   to the footer plus at most one intentional feature section.
10. **No generated imagery and no video** anywhere in the V2 build.
11. Recovery branch untouched; V2 branch local and unpushed.

**Rollback:** the entire V2 branch is discardable — `9bc2694` on
`recovery/sitemint-integrated-2026-08-06` remains the validated fallback.

---

## Dependency order

```
1 Foundations
├─ 2 Public shell ─┬─ 3 Homepage
│                  └─ 4 AI Receptionist landing
├─ 5 Signup/login/onboarding
└─ 6 Dashboard shell ─ 7 Dashboard surfaces
                       └─ 8 Discovery + voice
3,4,5,7,8 ─ 9 Hardening ─ 10 Acceptance
```

Phases 3, 4, and 5 may proceed in parallel after Phase 2. Phase 9 requires all
UI phases complete.
