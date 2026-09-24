# SiteMint — Information Architecture (approved 2026-09-04)

> Reconciled to the owner decisions (D-2, D-8, D-9, W-3, W-6, W-12, W-13, W-17, W-18, O-7)
> and the amendment (§9, §10, §11, §12). Superseded proposals are marked.

## 1. Orientation contract (every screen, every surface)

| Question | Marketing | Customer app | Operations CRM |
|---|---|---|---|
| Where am I? | kicker breadcrumb (no "Signal") + `<title>` + H1 | H1 + breadcrumb on nested screens | breadcrumb + "Operations" watermark |
| What area? | header underline + `aria-current`; mega-panel trigger active on pillar pages | sidebar group label + rail highlight | dark ops sidebar highlight |
| What next? | one primary CTA per page | one primary action per page header | primary action per table/detail |
| How back? | logo = home; footer next-step band | breadcrumb + visible back; browser back always works | breadcrumb + browser back |
| Complete / disabled / needs setup? | n/a | status chips; capability-state page with visible reason; setup pointers | firm status chips |

Global rules: one page-level scroll region (no nested sidebar scrollbar); overlays never push
history; Escape closes and restores focus; no hover-only menus; skip link first; 44×44 targets;
no horizontal overflow at 360 px; **route changes open at the top of the destination** (only
an explicit section-anchor click targets a lower position).

## 2. Company website

```
[SiteMint]  What We Build ▾   Work   Process   Company   [AI Receptionist]   |   Client Sign In   [Build Your SiteMint System]
```

- Mega panel: four service categories only — Websites & Web Apps · Discovery Systems · AI Systems & Automation · (CRM & internal systems lives inside AI Systems & Automation for now). **No AI Receptionist card in the panel** (W-3); the pill is the product entry.
- Mobile sheet: groups "What We Build" and "Explore" (Work / Process / Company), then AI Receptionist, Client Sign In, CTA (W-17).
- Routes (target): `/` · `/services` (anchors: #websites-apps, #discovery-systems, #ai-systems, #crm-systems, #pricing-estimates) · `/websites-apps` · `/discovery-systems` · `/ai-systems` (renamed from `/automation`, old path 301) · `/ai-receptionist` (product page, product-only actions) · `/work` · `/process` · `/about` · `/start` (project intake + contact) · `/discovery` (submitting) · `/pricing` (rebuilt V5 page) · `/privacy` · `/terms` · `/thank-you` · 404.
- Retired: `/contact` → redirect to `/start#contact`; `/ai-for-lawyers`, `/ai-for-realtors` → redirect to `/ai-receptionist#use-cases`; `/portfolio` alias → `/work`; V2 preview components removed from the lazy graph; `/insights` stays routed but hidden.
- Homepage order (amendment §8): hero and connected signal → what SiteMint builds → interactive connected-system explanation → Websites & Web Apps → CRM & internal systems → AI Systems & Automation → AI Receptionist spotlight → Discovery & lead capture → selected work / capability demonstrations → how SiteMint works → pricing estimates → why SiteMint → team → FAQ → final CTA.

## 3. AI Receptionist landing page (product-only)

Header on this route swaps the company CTA for product actions: **Request Beta Access** (primary), **Explore the Interactive Preview** (secondary), "Already a client? Sign in". No "Start a Project". Section anchors: #preview, #what-it-does, #scheduling, #examples, #dashboard, #configuration, #outcomes, #safe-failure, #privacy, #use-cases, #setup, #beta, #faq.

## 4. Customer application (approved D-2)

```
OVERVIEW      Overview
SETUP         Setup (persistent onboarding; shown until complete, then "Setup ✓")
ASSISTANT     Configuration · Prompt · Voice
SCHEDULING    Availability · Appointment Types · Calendar · Appointments
ACTIVITY      Calls · Conversations · Contacts
CHANNELS      Phone Number · SMS · (Transfers — only when implemented)
ACCOUNT       Usage · Billing · Settings · Support
```

- Removed from nav until functional: Tools, Voice Library, Knowledge, Analytics, Testing, Structured Outputs, Integrations, API Keys (D-8). Their paths render the capability-state page in every build.
- Breadcrumbs on every nested screen (`Assistant / Ava / Prompt`); rail has no nested scroll (groups collapse); mobile = drawer (D-9); tables → cards below 768 px.
- Availability, Appointment Types, Calendar and Appointments are calendar features, not voice-flag features (B-1).
- Booking preview renamed "Test Booking" with explicit "Create test request" (B-5); public Booking Link deferred (B-6).

## 5. Operations CRM (approved O-6, O-7, O-8)

```
OPS  Command Center · People & Pipeline · Communications · Projects · Discovery
     Receptionist Ops (Firms · Firm detail · Usage · Issues · Numbers) · Marketing · Settings
```

- One Command Center; Discovery a distinct workflow (the second dashboard merges in).
- Six "Soon" items and the duplicate Lead DNA entry removed.
- Breadcrumbs everywhere; one scroll region; client-side route guard; shared `adminFetch` with one 401 path; 404 inside the CRM layout.
- Mobile: essential workflows only (urgent issues, receptionist health, lead detail, tasks, calls, appointments).

## 6. Cross-surface transitions

Marketing → app: "Client Sign In" and "Request Beta Access" are full context switches.
App → marketing only via the logo menu. CRM never linked from a customer surface. Every app
401 → `/login` with return path; every CRM 401 → `/admin?redirect=`.
