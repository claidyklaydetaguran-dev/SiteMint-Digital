# SiteMint Digital — Route and Navigation Architecture

> Documentation only — Checkpoint P0. No route in this repository is renamed,
> moved, or redirected by this document. All "recommended" routes are proposals
> for future, separately-approved checkpoints.

## 1. Existing Route Inventory

### web-agency (`artifacts/web-agency/src/App.tsx`) — public site + CRM, served at `/`

**Public (wrapped in `<Layout>` — Navbar + Footer):**
`/`, `/services`, `/pricing`, `/portfolio`, `/about`, `/contact`, 404 fallback.

**Public, standalone (no main layout):**
`/discovery`, `/thank-you`, `/ai-for-lawyers`, `/ai-for-realtors`,
`/ai-receptionist`, `/ai-receptionist/signup`.

**Legacy redirects** (`window.location.replace` into helpdesk SPA):
`/app`, `/app/login`, `/app/agent-config`, `/app/settings`,
`/app/conversations/:id`.

**Admin/no-layout:** `/admin`, `/admin/dashboard`, `/admin/submissions/:id`.

**CRM (`/admin/crm/*`, 25 routes):** `dashboard`, `crm` root redirect, `leads`,
`leads/:id`, `leads/:id/dna`, `communications`, `intelligence/behavioral`,
`intelligence/automation-queue`, `inbox`, `tasks`, `calendar`, `deals`,
`transactions`, `projects`, `pipeline`, `reporting`, `admin`, `workspace`,
`campaigns`, `campaign-builder`, `campaign-queue`, `discovery`, `intake-cases`,
`receptionist-accounts`, `email-templates`, `import`, `settings`.

### helpdesk (`artifacts/helpdesk/src/App.tsx`) — served at `/ai-receptionist/dashboard`

`/login` (no shell), `/` (Overview), `/conversations`, `/receptionist`,
`/contacts`, `/contacts/:id`, `/deploy` (in-SPA redirect → `/receptionist`),
`/settings`, `/billing`; flag-gated (`voicePlatformEnabled`):
`/assistants`, `/assistants/new`, `/assistants/new/:tab`, `/assistants/:id/:tab?`,
plus config-driven "coming soon" routes; 404 fallback.

### ai-toolkit (`artifacts/ai-toolkit/src/App.tsx`) — standalone, own deploy

`/`, `/thank-you`, `/cancel`, 404 fallback. **Not linked from web-agency nav or
footer today** — reachable only by direct URL.

### mockup-sandbox

Not a routed product; a `/preview/:componentPath` dev-tool pattern for internal
component previews. Excluded from all public/nav planning below.

## 2. Existing Route Ownership

| Tree | Owner (per CLAUDE.md) |
|---|---|
| `/`, `/services`, `/pricing`, `/portfolio`, `/about`, `/contact`, `/discovery` | SiteMint Digital marketing (web-agency) |
| `/ai-receptionist*` | AI Receptionist marketing (web-agency) |
| `/ai-receptionist/dashboard/*` | AI Receptionist product (helpdesk) |
| `/admin*` | Internal CRM (web-agency) |
| ai-toolkit routes | AI Toolkit product (own artifact) |

## 3. Existing Public/Private Boundaries

Public: everything in web-agency except `/admin*`; all of ai-toolkit. Private:
`/admin*` (Bearer token) and all of `/ai-receptionist/dashboard/*` (cookie
session). No route currently sits in between (no "logged-out preview of a
product dashboard," etc.).

## 4. Recommended Final Sitemap

```
/
/products/
/products/ai-receptionist/        (marketing — reuses existing /ai-receptionist content, new URL is a RECOMMENDATION not a rename in P0)
/products/ai-toolkit/             (new)
/services/
/services/websites/
/services/web-apps/
/services/crm-automation/
/services/seo-growth/
/services/maintenance/
/work/                            (renamed-in-recommendation from /portfolio; no rename executes in P0)
/pricing/
/contact/
/discovery/
/about/
/login/                           (recommended alias pointing at AI Receptionist login; see §19)
/admin/
```

`/solutions/` is intentionally **not** in this sitemap — see Blueprint §15/§24.1.
Any URL shown as "renamed-in-recommendation" keeps its current path working via a
redirect when and if that phase is approved (§11 below); nothing changes in P0.

## 5. Recommended Route Hierarchy

Two top-level trees on the public site: **Products** (things SiteMint sells as
software) and **Services** (things SiteMint builds for a customer). Work,
Pricing, Contact/Discovery, About sit as siblings, not nested under either.
`/admin` remains a fully separate, unindexed tree.

## 6. Route Purpose

| Route | Purpose |
|---|---|
| `/` | Company-level pitch, entry to every other section |
| `/products/` | Overview of AI Receptionist + AI Toolkit |
| `/products/ai-receptionist/` | Convert visitors to trial/signup |
| `/products/ai-toolkit/` | Convert visitors to purchase |
| `/services/` | Overview of the six service lines |
| `/services/<slug>/` | Convert visitors to Discovery for that service |
| `/work/` | Credibility via past projects |
| `/pricing/` | Transparent packages (existing content) |
| `/discovery/` | Structured lead qualification |
| `/contact/` | Low-friction general inquiry |
| `/about/` | Company/team credibility |
| `/login/` | Fast path to the AI Receptionist dashboard |
| `/admin/` | Staff CRM/ops entry |

## 7. Route Audience

Public/prospect: everything except `/admin*` and authenticated dashboard routes.
Existing customer: `/login`, `/ai-receptionist/dashboard/*`. Staff: `/admin*`.

## 8. Route Authentication Requirement

Unchanged from §3. No new authenticated route is introduced by this checkpoint.

## 9. Route Indexability

Indexable: all public marketing routes above. Non-indexable (`noindex`, excluded
from sitemap): `/admin*`, `/ai-receptionist/dashboard/*`, ai-toolkit's
`/thank-you` and `/cancel` (transactional, not landing pages).

## 10. Route Canonical Behavior

Each indexable route gets one canonical self-referencing URL. No query-string
variants should be indexed. `web-agency` already sets a canonical link in
`index.html` today (static, single value) — per-route canonical tags are a Phase 8
requirement (PRD §23), not implemented today.

## 11. Redirect Recommendations

None execute in this checkpoint. If `/portfolio` → `/work` is approved in a future
phase, add a server or client redirect and keep `/portfolio` alive indefinitely
(SEO equity) rather than a hard 404. Same pattern for any other future rename:
old path redirects, never disappears silently.

## 12. Backward-Compatibility Requirements

- `/app/*` legacy redirects (already implemented) must keep working exactly as-is.
- Any future rename must preserve the old URL as a redirect, not a broken link.
- `/ai-receptionist` and `/ai-receptionist/dashboard` must never collide in
  meaning — the first is marketing, the second is product (existing, correct;
  must stay this way).

## 13. Navigation Model

Two navigation surfaces exist today and should continue to exist independently:
web-agency's public `Navbar`/`Footer`, and helpdesk's authenticated `AppShell`
sidebar. They are not merged. They share only brand mark and typography (Design
doc).

## 14. Desktop Navigation

Recommended top-level (see §Recommended Navigation Direction below for full
per-item rationale): **Products, Services, Work, Pricing, Company, Client Login,
Start a Project.** Five content items + two actions — trimmed from the task
brief's eight-item list (see rationale, §Recommended Navigation Direction).

## 15. Mobile Navigation

Hamburger drawer reusing the same nav config as desktop, matching the pattern
already proven in helpdesk's `MobileNavDrawer` (`VOICE_PLATFORM_UI_UX.md` §3) —
conceptually reused, not code-shared across artifacts.

## 16. Products Mega Menu

Two entries only at MVP (AI Receptionist, AI Toolkit) — too few to justify a true
mega menu. Recommendation: simple dropdown, not a mega menu, until a third product
exists. Revisit mega-menu treatment when there are 3+ products.

## 17. Services Mega Menu

Six entries — a simple dropdown list is sufficient; a mega menu with previews is
over-engineering for six short, similar items. Plain dropdown recommended for MVP.

## 18. Solutions Navigation

Not present in top-level nav (Blueprint §24.1). If solution-style messaging is
needed, it lives inside the homepage narrative and/or as anchor sections on
Products/Services pages, not as its own nav item or route tree.

## 19. Login Behavior

"Client Login" in nav should point at the **AI Receptionist login**
(`/ai-receptionist/dashboard/login`) since that is the only product with a real
customer login today. A generic `/login` route on the main site is recommended as
a thin redirect/chooser only once a second product has its own login — premature
in MVP. For MVP, "Client Login" links directly to the receptionist login.

## 20. Admin-Route Protection

Unchanged: `requireAdmin` server middleware + client-side token-redirect pattern
in `AdminDashboard.tsx`. Not linked from public nav or footer (already true today
— `/admin` is reachable only by direct URL, which is correct and should remain so).

## 21. Footer Navigation

Recommended footer sections: Company (About, Work, Contact), Products (AI
Receptionist, AI Toolkit), Services (six lines, now with real links replacing
today's link-less list), Legal (Privacy Policy, Terms — currently unlinked
placeholder spans; need real pages or removal, flagged as an open content gap, not
fixed in P0).

## 22. Breadcrumb Rules

Not required for a flat, shallow public IA (max depth 2: `/services/<slug>`).
Breadcrumbs are recommended only inside the CRM's deeper trees (e.g.
`/admin/crm/leads/:id/dna`) if usability testing shows it's needed — not an MVP
requirement.

## 23. Product-Dashboard Navigation

Unchanged — helpdesk's own `AppShell`/sidebar per `VOICE_PLATFORM_UI_UX.md` §3.
Not modified by this platform work.

## 24. Cross-Product Navigation

New requirement: every product's marketing page (on web-agency) must link to that
product's own app; the product's own app should link back to
`sitemintdigital.com` via the shared brand mark (already true in helpdesk's
`SiteMintLogo`/`AppFooterBrand` components per the voice-platform blueprint).
AI Toolkit currently has **no** link back to the main site — a gap to close
alongside FR5 in the PRD.

## 25. Deep-Link Behavior

No change required — all current deep links (e.g. `/admin/crm/leads/:id`,
`/contacts/:id`) already work independent of navigation state.

## 26. 404 Behavior

Each artifact keeps its own 404 (`NotFound` in web-agency, helpdesk, ai-toolkit —
all exist today). No shared 404 component across artifacts is required; visual
consistency comes from the shared design system, not shared code.

## 27. Unauthorized Behavior

Unchanged: web-agency's admin pattern redirects to `/admin` on 401; helpdesk
redirects to `/login` when `useSession()` errors. Both preserved.

## 28. Route Implementation Phases

New/changed routes are **not** part of this checkpoint. When approved, they land
in `IMPLEMENTATION_ROADMAP.md` Phase 3 (Products/Services overview + nav) and
Phase 4 (individual product/service pages) — see that document.

---

## Recommended Navigation Direction

Evaluating the task brief's proposed set — **Products, Services, Solutions, Work,
Pricing, Resources, Company, Client Login, Start a Project** — against the actual
content volume in this repo today:

| Item | Needed? | Underneath | MVP? | Treatment |
|---|---|---|---|---|
| Products | Yes | AI Receptionist, AI Toolkit | Yes | Simple dropdown (2 items — not a mega menu, §16) |
| Services | Yes | 6 service lines | Yes | Simple dropdown (§17) |
| Solutions | **No** (trimmed) | — | No | Fold into homepage/Products/Services copy — 2 real products can't support a third parallel nav tree without thin, duplicate-feeling content |
| Work | Yes | Portfolio case studies (existing content) | Yes | Direct link |
| Pricing | Yes | Existing pricing page | Yes | Direct link |
| Resources | **No** (trimmed) | — | No | No blog/resource content exists in the repo today; adding this item to nav with nothing under it is a dead-end. Revisit only once real content exists (footer-only later, if ever) |
| Company | Yes (renamed from "Company" as proposed, kept) | About, Contact | Yes | Direct link or 2-item dropdown |
| Client Login | Yes | — | Yes | Direct link (§19) |
| Start a Project | Yes | — | Yes | Primary CTA button, not a nav link — routes to Discovery |

**Recommended trimmed set**: **Products · Services · Work · Pricing · Company ·
Client Login · Start a Project** (5 content items + 2 actions). Rationale: the
task brief's full 8-item set includes two items (Solutions, Resources) with no
real content behind them today; shipping them as live nav items would produce
either empty pages or thin restatement of Products/Services, which the brand
principles explicitly warn against ("avoid making every section look like a
different product," avoid clutter). The current navbar (`Home, Services, Pricing,
Portfolio, About` + CTA) is evaluated and evolved here, not discarded: Services
and Pricing are retained as-is; Portfolio becomes "Work" (label change only, no
route rename in P0); Home and About fold into the implicit `/` and a "Company"
grouping; Products is genuinely new and necessary since AI Receptionist/AI
Toolkit have no shared home today.

## Admin/CRM Structure Evaluation

Comparing the task brief's suggested `/admin/crm/*` list against what already
exists:

| Suggested | Actual state |
|---|---|
| `/admin/dashboard/` | Exists as `/admin/crm/dashboard` |
| `/admin/crm/leads/` | Exists |
| `/admin/crm/clients/` | **Missing** — no dedicated post-deal "clients" view; leads/deals cover this today |
| `/admin/crm/discovery/` | Exists |
| `/admin/crm/deals/` | Exists |
| `/admin/crm/proposals/` | **Missing as a standalone route** — proposal generation lives inside Lead Detail, not its own list view |
| `/admin/crm/projects/` | Exists |
| `/admin/crm/campaigns/` | Exists (plus `campaign-builder`, `campaign-queue` — more granular than proposed) |
| `/admin/crm/inbox/` | Exists (legacy) alongside newer `communications` |
| `/admin/crm/automation/` | Exists as `intelligence/automation-queue` |
| `/admin/crm/support/` | **Missing** — no dedicated support ticketing route in the CRM tree (a `helpdesk.ts` API exists server-side but has no CRM-side UI route found) |
| `/admin/crm/content/` | **Missing** — no CMS/content route |
| `/admin/crm/portfolio/` | **Missing** — portfolio content is hardcoded in `Portfolio.tsx`, not CRM-managed |
| `/admin/crm/analytics/` | Exists as `reporting` |
| `/admin/crm/settings/` | Exists |

**Recommendation**: do not rename existing, working CRM routes to match the
brief's naming (`analytics` vs `reporting`, `automation` vs
`intelligence/automation-queue`) — these are cosmetic differences on a stable,
locked-adjacent system; renaming has real regression risk for no user-facing
benefit (see Blueprint §22 risk, and DEVELOPMENT_RULES.md "no scope creep"). The
"missing" items (`clients`, `proposals` standalone, `support`, `content`,
`portfolio`-as-CRM-content) are genuine gaps but are **CRM feature work**, not
platform-navigation work, and belong in a future CRM-specific PRD — not this
checkpoint or `IMPLEMENTATION_ROADMAP.md` Phase 7's scope beyond flagging them.
