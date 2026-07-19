# SiteMint Digital — Platform Product Requirements Document

> Master PRD for the SiteMint Digital platform. Companion to
> `MASTER_PLATFORM_BLUEPRINT.md`. Documentation only — Checkpoint P0. Feature-level
> PRDs for AI Receptionist voice telephony and deep CRM work remain separate
> documents (`docs/ai-receptionist/*`) and are out of scope here.

## 1. Product Summary

SiteMint Digital's public platform is the marketing, product-discovery, and
lead-capture surface for a technology company that sells websites, web
applications, CRM/automation services, and owned software products (AI
Receptionist, AI Toolkit). This PRD defines requirements for that public platform,
its shared design system, and its relationship to the existing internal CRM and
product dashboards — not for rebuilding any of those existing systems.

## 2. Problem Statement

The current public site presents SiteMint primarily as a website-design shop. It
does not represent the AI Receptionist or AI Toolkit as products of the company,
has no unified Products/Services navigation, uses a different visual identity than
the AI Receptionist dashboard, and has no analytics to measure any of it. Prospects
cannot discover AI Toolkit at all from the main site. This limits growth of the
higher-margin product lines and undermines credibility ("looks like three
different companies").

## 3. Business Goals

- Represent SiteMint as one connected technology company, not a single-service shop.
- Increase inbound interest in AI Receptionist and AI Toolkit via real discoverability.
- Reduce cost of adding a new product/service page (shared design system + IA
  pattern instead of one-off builds).
- Preserve 100% of existing revenue-generating functionality (Discovery pipeline,
  AI Receptionist billing, CRM) with zero regression risk during rollout.

## 4. User Goals

- Prospects: quickly understand what SiteMint offers and find the right
  product/service/contact path.
- Existing AI Receptionist customers: reach their dashboard without friction.
- SiteMint staff: manage the whole business (leads, clients, products) from one CRM.

## 5. Target Audiences

1. Service-business owners (clinics, law firms, real estate, trades, salons) — the
   AI Receptionist audience, consistent with `VOICE_PLATFORM_UI_UX.md` positioning.
2. Small/mid businesses wanting a new website, web app, or CRM build.
3. Existing SiteMint clients returning for support, billing, or a new project.
4. SiteMint staff operating the CRM.

## 6. Primary User Personas

- **The Owner-Operator** — runs a service business, time-poor, wants "make my phone
  stop being a bottleneck" (AI Receptionist fit) or "make my website actually work
  for me" (Services fit).
- **The Referral Prospect** — arrives via word of mouth, needs fast credibility
  signals (portfolio, clear pricing, simple contact path).
- **The Returning Client** — needs a fast path to login or to start a new project,
  not a full re-sell of the brand.
- **The SiteMint Staff Member** — needs the CRM to reflect every inbound touch
  regardless of which product/service page it came from.

## 7. Jobs to Be Done

- "Help me see if SiteMint does what I need before I contact anyone."
- "Let me try or buy an AI Receptionist without talking to a salesperson."
- "Let me start a website/CRM project with a low-friction first step."
- "Let me get back into my product dashboard or admin CRM quickly."

## 8. Core Value Proposition

SiteMint Digital builds and operates the digital infrastructure — websites, AI
customer experience, and connected business systems — that let service businesses
capture more leads, respond faster, and run on less manual admin work.

## 9. Scope

In scope for this PRD: public marketing site IA and content requirements, shared
design system requirements, product/service landing page requirements, navigation,
SEO/analytics requirements, and the MVP platform release definition (§MVP Platform
Scope below). Out of scope: any code implementation (this checkpoint), AI
Receptionist voice telephony, deep CRM feature work beyond what already exists.

## 10. Out of Scope

- Rebuilding the CRM, campaigns engine, DISC/lead-scoring engines, or Twilio
  integration (all locked/stable per root `ARCHITECTURE.md`).
- Rebuilding the AI Receptionist SMS pipeline or voice platform.
- Merging authentication systems.
- Building `/solutions` as a routed IA section (messaging-only per Blueprint §15).
- Any database migration.

## 11. Functional Requirements

- FR1: A public homepage represents SiteMint as a multi-product company (see
  Homepage Concept in Blueprint's companion Route doc / this doc's §Homepage).
- FR2: A Products overview page lists AI Receptionist and AI Toolkit (only real
  products — no fabricated entries).
- FR3: A Services overview page lists the six existing service lines with real
  content, replacing the current unlinked footer list.
- FR4: AI Receptionist keeps its existing marketing page and signup flow, reachable
  from primary nav.
- FR5: AI Toolkit gains a discoverable entry point from the main site (a new
  `/products/ai-toolkit` page linking out to the standalone app) — MVP-eligible,
  owner-decision pending (Blueprint §24.2).
- FR6: Client Login and Start a Project remain the two primary conversion actions
  in navigation.
- FR7: Private admin entry point (`/admin`) remains reachable but not promoted in
  public nav/footer beyond what exists today.
- FR8: All existing forms (Contact, Discovery, AI Receptionist signup) continue to
  submit to their existing endpoints unchanged.

## 12. Non-Functional Requirements

- NFR1: No regression to any locked/protected file listed in root `CLAUDE.md`.
- NFR2: All new pages meet WCAG AA contrast in both light and dark themes where
  dark mode applies (currently only `helpdesk` has dark mode; `web-agency` is
  light-only today — see Design doc).
- NFR3: No new page adds more than the agreed motion budget (Design doc §Motion).
- NFR4: No fabricated metrics, testimonials, or claims anywhere in new copy.
- NFR5: Every new marketing page must have real, distinct `<title>`/meta content
  (current static-per-app title is a known gap this PRD requires closing — see
  SEO Requirements).

## 13. Public-Site Requirements

Homepage, Products overview, Services overview, Work/portfolio, Pricing, Contact,
Discovery — all must share the new design system (Doc 4) and navigation (Doc 3).
Existing content (portfolio case studies, pricing tiers, FAQ) is preserved and
re-themed, not rewritten from scratch, unless explicitly marked "proposed copy."

## 14. Product-Page Requirements

Each product page (AI Receptionist, AI Toolkit, future products) must state: what
it does, who it's for, pricing/trial path, and a single primary CTA to the
product's own signup/app. Product pages never claim functionality the product
doesn't have (e.g. AI Toolkit has no login area today — its page must not imply one).

## 15. Service-Page Requirements

Each of the six service lines needs: a one-paragraph description, example
deliverables, and a CTA to Discovery. No per-service case-study requirement in
MVP — reuse the existing Portfolio page instead of duplicating content.

## 16. Customer-Dashboard Requirements

Out of scope to rebuild. Requirement is preservation only: helpdesk dashboard
behavior, routes, and auth must be byte-for-byte unaffected by this platform work
(binding — see CLAUDE.md protected files and voice-platform locks).

## 17. Internal-CRM Requirements

Out of scope to rebuild. Requirement is preservation only, plus the standing
principle (Blueprint §17) that the CRM must remain the single system of record for
every lead regardless of which new marketing page originates it — any new form
added in future phases must post into the existing CRM ingestion paths, never a
parallel store.

## 18. Authentication Requirements

No change in this checkpoint. Two systems remain: CRM/Admin Bearer-token
(`localStorage`), and AI Receptionist httpOnly cookie session. Future products may
introduce a third distinct auth boundary if needed (e.g. AI Toolkit, if it ever
grows a logged-in area) — never reuse or merge with the other two (see Blueprint
§18, §24 open decision on hybrid auth strategy for the platform long-term).

## 19. Authorization Requirements

No change. `/admin/*` requires `requireAdmin` middleware server-side (existing).
Product dashboards require their own session validation (existing, per product).

## 20. Tenant-Isolation Requirements

No change to existing tenant isolation (`firm_id`-scoped queries in the
receptionist product, per `docs/ai-receptionist/DATABASE_STRATEGY.md`). Not
applicable to the public marketing site (no tenant concept there).

## 21. Lead-Capture Requirements

- Existing Contact (`/api/contact/submit`) and Discovery (`/api/discovery/submit`)
  forms are preserved unchanged.
- Any new lead-capture surface added in a future phase (e.g. a Products page inline
  CTA) must reuse one of these existing endpoints or route into `crm_leads` — never
  invent a new, disconnected submission path.

## 22. Form and Notification Requirements

Existing Resend email notification behavior (discovery submissions, campaign
sends) is preserved unchanged. No new notification channel is introduced in this
checkpoint.

## 23. SEO Requirements

- Public marketing pages: indexable, canonical URL, unique per-route `<title>`
  and meta description (current gap: all `web-agency` routes currently share one
  static title/meta — closing this is Phase 8 work, not P0).
- Product marketing pages: indexable, structured data eligible (e.g. `Product` or
  `SoftwareApplication` schema) — proposed copy, not yet implemented.
- Customer dashboards (`helpdesk`) and `/admin/*`: `noindex`, never in sitemap.
- `sitemap.xml`/`robots.txt`: web-agency has both today; `ai-toolkit` and
  `helpdesk` need review (helpdesk has `robots.txt` only, appropriately restrictive
  since the whole app should be non-indexable).

## 24. Analytics Requirements

No analytics tool is installed anywhere today (confirmed by repo inspection).
Requirements for a future phase (not this checkpoint): homepage CTA clicks,
product-card opens, service-page opens, discovery form start/complete, contact
submit, client-login click, pricing view, AI Receptionist/AI Toolkit demo starts
(see Blueprint's Analytics and Conversion section for the full event list).
Vendor selection is an open owner decision (Blueprint §24.3).

## 25. Accessibility Requirements

WCAG AA minimum contrast, full keyboard navigation, visible focus states,
`prefers-reduced-motion` honored, semantic landmarks and ARIA labeling consistent
with the pattern already established in `VOICE_PLATFORM_UI_UX.md` §13 for helpdesk
— applied to `web-agency` as well going forward.

## 26. Performance Requirements

No framework changes. New pages must not add render-blocking third-party scripts.
Motion must be GPU-cheap (transform/opacity only, per Design doc). Analytics
script (once chosen) must load async/deferred.

## 27. Responsive Requirements

Breakpoints match the existing helpdesk convention (375 / 768 / 1024 / 1280+),
adopted platform-wide for consistency. No horizontal page scroll at any
breakpoint (existing repo-wide rule, carried over).

## 28. Security Requirements

No new credentials, no new third-party embeds without review, no secrets in
frontend code or Vite `VITE_` vars beyond existing patterns (see
`VOICE_PLATFORM_UI_UX.md` §22 feature-flag precedent for how public/boolean-only
values are exposed safely).

## 29. Content-Management Requirements

No CMS is introduced. Marketing copy remains hand-authored in React components, as
today. This PRD does not propose a CMS migration.

## 30. Error-State Requirements

Every new page needs a real 404 and a real form-submission error state (pattern
already established in helpdesk's `EmptyState`/`InlineError` components — reused
conceptually, not code-shared, for `web-agency`).

## 31. Loading-State Requirements

Any new async content (e.g. a future Products page pulling live data) needs a
skeleton state; static marketing content needs none.

## 32. Empty-State Requirements

Not generally applicable to static marketing pages. Applies to any future
authenticated surface only.

## 33. Motion Requirements

See `DESIGN_SYSTEM_DIRECTION.md` §Motion Direction for the explicit motion budget.
Summary requirement here: purposeful, restrained, reduced-motion-safe: no
continuous idle animation, no motion whose sole purpose is decoration.

## 34. Theme Requirements

`web-agency` is light-only today. Whether it gains dark mode is a design-system
decision (Doc 4), not required for MVP. `helpdesk` keeps its existing Light/Dark/
System toggle unchanged.

## 35. Browser-Support Expectations

Current two evergreen major versions of Chrome, Safari, Firefox, Edge — matching
implicit current support (no explicit browserslist config found; this PRD
formalizes the expectation without changing build tooling).

## 36. Acceptance Criteria

- Zero diff on any protected/locked file after any implementation phase.
- `pnpm run typecheck` clean workspace-wide after each phase.
- No console errors on any new or modified route, light and dark where applicable.
- Every new nav item resolves to a real page or an explicit "Coming soon" state —
  never a dead link.

## 37. Success Metrics

Cannot be defined numerically yet — no analytics exist (§24). Once analytics ship,
candidate metrics: Discovery form completion rate, AI Receptionist signup
conversion from `/ai-receptionist`, Products page → product-page click-through.
No target numbers are set in this document (would be fabricated without data).

## 38. Dependencies

- Design system (Doc 4) must ship before broad page re-theming (Blueprint decision
  #10).
- Analytics vendor decision (owner) blocks measurable success metrics.
- AI Toolkit main-site integration (FR5) depends on owner approval (Blueprint §24.2).

## 39. Risks

See `MASTER_PLATFORM_BLUEPRINT.md` §22 (Key Risks) — carried by reference, not
duplicated here.

## 40. Assumptions

- The existing CRM, campaigns, and receptionist backend remain untouched throughout
  this program.
- `sitemintdigital.com` is and remains the single public domain for all products.
- No near-term plan to consolidate `web-agency`/`helpdesk`/`ai-toolkit` into one
  codebase.

## 41. Open Owner Decisions

Carried from `MASTER_PLATFORM_BLUEPRINT.md` §24 — see that section for the full
numbered list (solutions IA, AI Toolkit integration, analytics vendor, nav set,
CRM route reorganization, final color palette).

---

## MVP vs. Post-MVP vs. Future Platform Capabilities

### MVP Platform Scope (Phase 0–4 in `IMPLEMENTATION_ROADMAP.md`)

- Main SiteMint homepage (redesigned narrative, real content only)
- Shared navigation and footer (new IA, see Route doc)
- Products overview page (AI Receptionist + AI Toolkit)
- Services overview page (six service lines, real copy)
- AI Receptionist landing page (existing page, retokenized to shared design system)
- AI Toolkit landing page (**new** — closes the current orphan gap, pending owner
  approval per Blueprint §24.2)
- Web & App service page (part of Services overview or a dedicated page — decided
  in Phase 3 planning, not this checkpoint)
- Work/portfolio page (existing page, retokenized)
- Contact/Discovery flow (existing, preserved)
- Client login entry point (existing helpdesk login, linked clearly from nav)
- Private admin entry point (existing `/admin`, unchanged)
- Shared design system (tokens, typography, spacing, motion — Doc 4)
- Responsive and accessible behavior (platform-wide baseline)
- Basic SEO (per-route titles/meta) and analytics (vendor + core events)

### Post-MVP

- `/solutions` as a routed IA section (if owner approves)
- Products mega-menu with rich previews
- AI Toolkit logged-in customer area
- CRM route reorganization (if owner approves)
- Dark mode for `web-agency`

### Future Platform Capabilities

- Additional SiteMint products beyond AI Receptionist/AI Toolkit
- Shared component library published as an internal package consumed by all
  artifacts (today each artifact is fully independent — see Blueprint §10)
- Unified analytics dashboard blending marketing + product usage data

**Note**: AI Receptionist telephony/voice work and deep CRM feature work are
separate, already-existing PRDs (`docs/ai-receptionist/*`) and are not redefined
here.
