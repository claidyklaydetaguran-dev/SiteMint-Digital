# Information Architecture — Frontend V2

Adopted structure. No alternatives are presented.

## 1. Global public navigation

```
Home
Solutions ▾
  ├ Websites & Apps
  ├ CRM & Automation
  └ AI Receptionist
Work
Process
About
Contact
─────────────
Sign In            (secondary, text)
Start Your Project (primary CTA)
```

- Primary CTA is **Start Your Project** everywhere. **"Book a Call" is not used.**
  The homepage secondary CTA is **View Our Work** → `/work`.
- *Start Your Project* resolves to `/discovery` **through the centralised route
  helper** — no component composes this path by hand.
- **Not in this navigation** (owner decision 4): `/pricing`, `/ai-for-lawyers`,
  `/ai-for-realtors`. See §1.1.
- *Sign In* routes to `/ai-receptionist/dashboard/login` — must be emitted
  base-aware (Gate 3 observed a doubled prefix from a hardcoded absolute href).
- Mobile: single drawer, focus-trapped, closes on route change, no hover
  dependency.

### Route mapping

| Nav item | Route | Status |
|---|---|---|
| Home | `/` | existing |
| Solutions › Websites & Apps | `/solutions/websites-apps` | **new**, from `/services` content |
| Solutions › CRM & Automation | `/solutions/crm-automation` | **new**, from `/services` content |
| Solutions › AI Receptionist | `/ai-receptionist` | existing |
| Work | `/work` | from `/portfolio`; keep `/portfolio` redirecting |
| Process | `/process` | **new** — extracted from the homepage process section |
| About | `/about` | existing |
| Contact | `/contact` | existing |
| Sign In | `/ai-receptionist/dashboard/login` | preserved |
| Start Your Project | `/discovery` | preserved |

`/services` and `/portfolio` remain as permanent redirects so no existing link
breaks.

## 1.1 Deprecated and deferred routes (owner decision 4)

| Route | Status | Phase 1 handling |
|---|---|---|
| `/pricing` | **Deferred** — not part of the active public journey | Source file preserved as a rollback reference. Removed from nav and IA. **No pricing table is created until real package scope and prices are approved.** |
| `/ai-for-lawyers` | **Deprecated** — not part of the active public journey | Source file preserved as a rollback reference |
| `/ai-for-realtors` | **Deprecated** — not part of the active public journey | Source file preserved as a rollback reference |

Rules:

- These three are **removed from the approved public navigation and from this
  information architecture**. `navConfig`'s `pricingHref` entry leaves
  `primaryNavItems`.
- **Their source files are not deleted during Phase 1.** They are retained
  temporarily as rollback references and may be lazily routed without appearing
  in any navigation surface.
- Deletion is a separate, later, owner-approved decision — not Phase 1 work.

## 2. Homepage section order

1. Header
2. Hero
3. Connected-system statement
4. Business outcomes
5. What SiteMint builds
6. Interactive system workflow
7. AI Receptionist feature
8. Real work / case studies — honest **"Selected work"** if unverified
9. SiteMint process
10. Team
11. Frequently asked questions
12. Final project CTA
13. Footer

**Light-forward surface plan** (owner decision 5; see `DESIGN-SYSTEM.md` §4).
The earlier plan (navy at §6–7 *and* §12 *and* §13) is withdrawn — it made too
much of the page dark.

| Sections | Surface |
|---|---|
| 1–5 Header, hero, thesis, outcomes, what we build | Warm white / soft off-white |
| **6 Interactive system workflow** | **Deep navy — the single intentional feature / product-demonstration section** |
| 7–11 AI Receptionist feature, selected work, process, team, FAQ | Warm white, with **pale mint / mint mist** used sparingly for restrained section differentiation |
| 12 Final project CTA | Light, with a mint primary action |
| 13 Footer | Deep navy |

Navy appears **exactly twice**: one feature section and the footer. Mint is
reserved for important actions and small accents, never a full-page background.

## 3. AI Receptionist landing order

1. Hero
2. Five core jobs — **Answer · Qualify · Schedule · Record · Escalate**
3. Visual call workflow
4. Human-control explanation
5. Business use cases
6. Integration explanation
7. Setup process
8. FAQ
9. Signup CTA

Readiness labelling is mandatory on this page: **SMS Receptionist — available
now**, **voice experience — in development**, **connected CRM and automated
follow-up — planned direction**. The page may demonstrate the future connected
vision, with every future capability visibly labelled.

No integration, response-time, availability, business-result, industry-count, or
delivery-timeline claim ships without repository verification or owner supply.
The five core jobs are verification-gated per `CONTENT-SPECIFICATION.md` §4.2.

## 4. Dashboard information architecture

Primary navigation, in order:

```
Overview
Calls
Leads
Appointments
Receptionist
Knowledge
Integrations
Settings
```

### Mapping to preserved routes

| V2 nav | Existing route(s) | Note |
|---|---|---|
| Overview | `/` | rebuilt per §4.1 |
| Calls | `/conversations`, `/logs`, `/logs/:id` | unified surface; both preserved |
| Leads | `/contacts`, `/contacts/:id` | renamed for operator language |
| Appointments | `/appointments`, `/schedule/:slug` | public booking page stays public |
| Receptionist | `/receptionist`, `/assistants*` | config + voice assistants |
| Knowledge | *new grouping* over existing agent-config knowledge fields | no new backend |
| Integrations | `/deploy` + provider readiness | absorbs voice-provider status |
| Settings | `/settings`, `/billing` | billing behaviour untouched |

The dashboard is **operational, not promotional** — no marketing language, no
decorative hero.

### 4.1 Overview priority order

1. **Receptionist readiness** — is it live and answering?
2. **Setup checklist** — only while incomplete, then it disappears
3. **Recent calls**
4. **Leads requiring attention**
5. **Upcoming appointments**
6. **Real performance summaries — only when real data exists**
7. **Problems requiring action**

No decorative charts. No fabricated analytics. A metric with no real data shows
its empty state, never a placeholder number.

### 4.2 Voice-provider readiness placement

The readiness logic is preserved exactly. Presentation changes:

- **Overview**: one compact readiness row inside *Receptionist readiness*.
- **Integrations**: the full `VoiceProviderStatusCard` detail lives here.
- **Everywhere else**: not rendered.

Today it renders prominently on Overview and competes with operational content;
V2 makes it contextual without weakening the signal.

### 4.3 Required states

Every data surface ships four states: **loading** (stable skeleton, no layout
jump), **empty** (explains what will appear and how to make it appear),
**error** (what failed, what to do, retry), **populated**.

## 5. Discovery placement

**Confirmed by owner decision 3 — settled.**

Discovery is pre-sale intake, not an operator tool. It stays **public** at
`/discovery` and remains SiteMint's **primary *Start Your Project* flow**,
reached from every public primary CTA and from Contact.

- Every public *Start Your Project* CTA resolves to `/discovery` **through the
  centralised route helper**.
- Discovery is **not** moved into the authenticated dashboard and is **not** in
  dashboard navigation.
- Its existing contracts and behaviour are preserved
  (`@workspace/discovery-contract` schemas, draft persistence, validation,
  submission). Its **visual presentation may be redesigned in a later phase**
  (Phase 8) — not in Phase 1.
- `/discovery/__legacy` remains unlinked for rollback.

## 6. Cross-app boundary

`web-agency` (public, base `/`) and `helpdesk` (dashboard, base
`/ai-receptionist/dashboard`) stay separate applications. Navigation between them
is a full document navigation, not client routing. All cross-app links must be
built from the centralised base-path helper — never a hardcoded absolute path.
