# Route and Feature Inventory — as-built audit

> Read-only audit of commit `9bc2694181aab9c35414352e723bd4f1f8054b13`.
> No runtime code was changed to produce this document.

Legend — **Preserve**: route must keep working. **Rebuild UI**: presentation is
replaced in V2. **Deprecated / Deferred**: out of the approved public journey by
owner decision 4; source retained as a rollback reference, not deleted in
Phase 1.

## 1. web-agency — public routes

| Route | User | Purpose | Component | Data | Auth | Loading | Errors | Preserve | Rebuild UI | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | Public | Marketing home | `PlatformPreview` (lazy) | none | no | `Suspense` | none | ✔ | ✔ | Section order replaced per IA |
| `/services` | Public | Services | `PlatformServicesPreview` (lazy) | none | no | `Suspense` | none | ✔ | ✔ | Folds into **Solutions** |
| `/portfolio` | Public | Work | `PlatformPortfolioPreview` (lazy) | none | no | `Suspense` | none | ✔ | ✔ | Becomes **Work** |
| `/pricing` | Public | Pricing | `PlatformPricingPreview` (lazy) | none | no | `Suspense` | none | ⚠ | ✖ | **Deferred** — out of nav and IA; source kept as rollback reference; **no pricing table** until real scope and prices approved |
| `/about` | Public | About | `PlatformAboutPreview` (lazy) | none | no | `Suspense` | none | ✔ | ✔ | Absorbs Team |
| `/contact` | Public | Contact | `PlatformContactPreview` (lazy) | form POST | no | `Suspense` | inline | ✔ | ✔ | 70 kB chunk today |
| `/ai-receptionist` | Public | AI Receptionist landing | `LandingReceptionist` (**eager**) | none | no | none | none | ✔ | ✔ | 80 KB source; must become lazy |
| `/ai-receptionist/signup` | Public | Signup | `LandingReceptionistSignup` (**eager**) | `POST /api/receptionist/auth/signup` | no | button state | inline `{error}` | ✔ | ✔ | Contract frozen; becomes 2-step |
| `/discovery` | Public | Structured discovery | `DiscoveryPage` (lazy) | `discovery-contract`, draft persistence | no | `Suspense` | validation summary | ✔ | ✔ | Placement decision — §5 |
| `/discovery/__legacy` | Internal | Rollback | `Discovery` (lazy) | legacy submit | no | `Suspense` | none | ✔ | ✖ | Keep as-is, unlinked |
| `/thank-you` | Public | Post-submit | `ThankYou` (eager) | none | no | none | none | ✔ | ✔ | Trivial |
| `/ai-for-lawyers` | Public | Vertical landing | `LandingLawyers` (**eager**) | none | no | none | none | ⚠ | ✖ | **Deprecated** — out of nav and IA; source kept as rollback reference, not deleted in Phase 1 |
| `/ai-for-realtors` | Public | Vertical landing | `LandingRealtors` (**eager**) | none | no | none | none | ⚠ | ✖ | **Deprecated** — out of nav and IA; source kept as rollback reference, not deleted in Phase 1 |
| `*` | Public | Not found | `NotFound` (eager) | none | no | none | none | ✔ | ✔ | Needs real design |

## 2. web-agency — compatibility redirects (preserve exactly)

| Route | Target |
|---|---|
| `/app` | `/ai-receptionist/dashboard/` |
| `/app/login` | `/ai-receptionist/dashboard/login` |
| `/app/conversations/:id` | `/ai-receptionist/dashboard/` |
| `/app/agent-config` | `/ai-receptionist/dashboard/` |
| `/app/settings` | `/ai-receptionist/dashboard/` |

All five **preserve, no UI**. Implemented via `LegacyRedirect`.

## 3. web-agency — internal admin/CRM (out of visual scope)

`/admin`, `/admin/dashboard`, `/admin/submissions/:id`, plus **26** `/admin/crm/*`
routes (`dashboard, leads, leads/:id, leads/:id/dna, communications,
intelligence/behavioral, intelligence/automation-queue, inbox, tasks, calendar,
deals, transactions, projects, pipeline, reporting, admin, workspace, campaigns,
campaign-builder, campaign-queue, discovery, intake-cases, receptionist-accounts,
email-templates, import, settings`).

- User: internal staff. Auth: CRM Bearer token (separate system — never merged
  with receptionist auth).
- **Preserve: ✔ all. Rebuild UI: ✖ (internal tool).**
- **Every one is an eager import today.** This is the primary bundle defect.

## 4. helpdesk — authenticated dashboard (base `/ai-receptionist/dashboard`)

| Route | Purpose | Component | Auth | Preserve | Rebuild UI |
|---|---|---|---|---|---|
| `/login` | Sign in | `Login` | public | ✔ | ✔ |
| `/schedule/:slug` | Public booking | `PublicSchedule` | public | ✔ | ✔ |
| `/` | Overview | `Overview` | session | ✔ | ✔ |
| `/conversations` | Inbox | `Inbox` | session | ✔ | ✔ |
| `/receptionist` | Agent config | `AgentConfig` | session | ✔ | ✔ |
| `/contacts`, `/contacts/:id` | Contacts | `Contacts`, `ContactDetail` | session | ✔ | ✔ |
| `/deploy` | Deployment | inline | session | ✔ | ✔ |
| `/settings` | Settings | `Settings` | session | ✔ | ✔ |
| `/billing` | Billing | `Billing` | session | ✔ | ✔ (no billing logic change) |
| `/assistants`, `/assistants/new`, `/assistants/new/:tab`, `/assistants/:id/:tab?` | Voice assistants | `Assistants`, `AssistantCreate`, `AssistantBuilderNew`, `AssistantBuilder` | session + `voicePlatformEnabled` | ✔ | ✔ |
| `/logs`, `/logs/:id` | Call logs | `CallLogs`, `CallLogDetail` | session + flag | ✔ | ✔ |
| `/appointments` | Appointments | `Appointments` | session | ✔ | ✔ |

**17 direct page imports, zero lazy.** Whole dashboard ships as one chunk.

## 5. Discovery — placement decision

Discovery is a **pre-sale, high-intent intake form** ("Tell us what you're
building… we'll prepare a personalised scope and proposal"). It is not a
receptionist-operator tool.

**Decided (owner decision 3).** Discovery **stays public at `/discovery`** and
remains SiteMint's **primary *Start Your Project* flow**, reached from every
public primary CTA and from Contact — resolved through the centralised route
helper. It is **not** moved into the authenticated dashboard and is not in
dashboard navigation. Its existing contracts and behaviour are preserved; its
visual presentation may be redesigned in Phase 8, not Phase 1.
`/discovery/__legacy` remains an unlinked rollback.

## 6. Voice platform — surfaces to preserve

Nine helpdesk files: `App.tsx`, `components/common/VoiceProviderStatusCard.tsx`,
`components/layout/AppShell.tsx`, `hooks/useAssistants.ts`,
`lib/browserVoice/context.tsx`, `lib/featureFlags.ts`, `pages/AssistantBuilder.tsx`,
`pages/CallLogs.tsx`, `pages/Overview.tsx`.

Readiness logic is **preserved**; V2 changes only *where and how prominently* it
renders (see IA §4).

## 7. Defects found (evidence-based)

### Bundle and loading
1. **26 CRM pages eagerly imported into the public bundle** — ~1.13 MB of source.
   Root cause of the ~1.81 MB main chunk.
2. **35 direct page imports vs 8 lazy** in `web-agency/App.tsx`.
3. `LandingReceptionist` (80 KB source), `LandingReceptionistSignup`,
   `LandingLawyers`, `LandingRealtors` all eager.
4. **Helpdesk: 17 eager page imports, zero code splitting.**
5. Two shadcn UI kits duplicated: 56 files (web-agency) + 55 (helpdesk).

### Assets
6. **`public/` is 19.8 MB across 19 files; 14 images exceed 300 KB.** Largest:
   `portfolio-shasta.png` 2.38 MB, `plant.png` 2.37 MB, `devices-hero.png`
   2.34 MB, `portfolio-herlinda.png` 1.85 MB, `team-claidy.png` 1.77 MB.
   All PNG; no AVIF/WebP; no responsive `srcset`.
7. **`hero-devices-remove-bg-io.png` 404s under a base path** — root-relative
   reference not base-aware (observed live in Gate 3).

### Fonts
8. **Three Google Fonts families loaded from `fonts.googleapis.com`**: Inter,
   Plus Jakarta Sans, Playfair Display — render-blocking third-party requests.
   V2 targets **one** self-hosted variable family.

### Motion
9. `framer-motion` imported in **15** web-agency files.
10. **3 infinite/repeating animations** — prohibited by the motion system.
11. 11 `whileInView` on the production side vs 11 `animate="show"` preserved on
    the recovery side (Gate 2D). V2 replaces both with a single CSS-first entrance.

### Resilience
12. Only **3** error-boundary references in web-agency, **2** in helpdesk —
    no per-route boundaries. A failed lazy chunk yields a blank screen.
13. Lazy routes use bare `Suspense` with no stable skeleton — layout jump risk.

### Presentation / structure
14. **670 inline `style={{ … }}` usages** in web-agency — presentation hardcoded
    per component, no shared token layer; the direct cause of the purple/indigo
    drift that required Ports 3–4 to correct.
15. Business logic and presentation are combined in page components
    (`LandingReceptionistSignup` owns fetch + validation + layout).
16. Duplicated layouts: `PlatformPreviewPageShell` vs `CrmLayout` vs helpdesk
    `AppShell` — three unrelated shells.

### Accessibility
17. **21 `onClick` handlers on non-interactive `div`/`span`** — not keyboard
    reachable.
18. Only 74 `aria-label`s across the whole app.
19. Hover-dependent nav interactions with no focus equivalent (observed in
    `ReceptionistNav`).

### Honesty
20. Unverified claims on the AI Receptionist landing — inbound-call percentage,
    SMS response time, qualified-lead value, industry count, setup duration, and
    unnamed-but-unverified integrations, plus `$500`/`$99` pricing figures in
    `LandingReceptionist.tsx`. **All removed by owner decision 1** (PRD §8,
    Content §9) — removed outright, not retained behind a disclaimer.
21. 172 `placeholder` occurrences and 5 `mock` references to review before reuse.
22. Readiness is currently overstated: the landing page implies a production
    voice capability. Only **SMS is available now**; voice is **in development**;
    connected CRM and automated follow-up are **planned direction** (PRD §8.1).

## 8. Obsolete / deferred — decided

| Item | Reason | Decision |
|---|---|---|
| `/ai-for-lawyers`, `/ai-for-realtors` | Not linked from any nav; overlap the AI Receptionist story | **Deprecated** — out of the approved public nav and IA. **Source files preserved in Phase 1 as rollback references; not deleted.** Deletion is a later, separate owner decision |
| `/pricing` | No approved package scope or prices | **Deferred** — out of the approved public nav and IA. Source preserved as a rollback reference. **No pricing table is created until real scope and prices are approved** |
| `/discovery/__legacy` | Rollback only | Keep, stay unlinked |
| `Discovery` vs `DiscoveryPage` | Two implementations | Keep both until rollback window closes |
| Duplicate UI kits (56 + 55) | Two shadcn copies | Extract a shared package in Phase 1 |

None of these three routes is part of Frontend V2's active public journey.
