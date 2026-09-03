# SiteMint — Information Architecture (proposed)

> Planning document. Current routes are recorded in CURRENT-STATE.md; this file states the
> target IA and the delta. Nothing here changes product source.

## 1. Orientation contract (applies to every screen on every surface)

Each screen must answer, visibly:

| Question | Marketing | Customer app | Operations CRM |
|---|---|---|---|
| Where am I? | mono kicker breadcrumb + `<title>` + H1 | page header H1 + breadcrumb on nested screens | breadcrumb + "Operations" watermark |
| What area am I in? | header underline + `aria-current` | sidebar group label stays visible; rail highlight | dark ops sidebar highlight |
| What can I do next? | exactly one primary CTA per page | one primary action in the page header | primary action per table/detail |
| How do I go back? | logo = home; footer next-step band | breadcrumb + "Back to {parent}" on detail screens; browser back always works | breadcrumb + browser back |
| What is complete? | n/a | setup progress on Overview; status chips (Draft / Published / Connected) | firm status chips |
| What is disabled? | n/a | visible reason, not just grey; capability-state page, never a bare 404 | same |
| What requires setup? | n/a | "Needs setup" tile with a deep link | same |

Global rules: one page-level scroll region only (no nested sidebar scrollbar); overlays never
push history; Escape closes and restores focus; no hover-only menus; skip link first in tab
order; 44×44 touch targets; no horizontal overflow at 360 px.

## 2. Company website — target nav

```
[SiteMint]  What We Build ▾   Work   Process   Company   [AI Receptionist]   |   Client Sign In   [Start a Project]
```

Delta from current:
- Remove the duplicate: AI Receptionist stays as the product pill; drop it from the "What We Build" panel or keep it in the panel and drop the pill (owner decision W-3).
- Mobile sheet: rename the second group from "Company" to "About SiteMint" or split into Work / Process / Company rows so the group label does not repeat an item.
- `/services` gains `id=` anchors that match the header's section links, and the "What We Build" trigger gets `aria-current` when a pillar page is open.
- `/pricing`, `/contact`, `/ai-for-*` either move onto the V4 chrome or are retired; nothing ships on the V2 prototype chrome.
- 404: broken-thread illustration with three exits (Home, What We Build, Start a Project).

Routes (target): `/`, `/services` (What We Build overview), `/websites-apps`, `/discovery-systems`,
`/automation`, `/ai-receptionist`, `/work`, `/process`, `/about`, `/start`, `/discovery`,
`/contact` (V4), `/privacy`, `/terms`, `/thank-you`. Optional later: `/work/{slug}`, `/insights`.

## 3. AI Receptionist application — target nav

```
OVERVIEW      Overview
SETUP         Onboarding (until complete)
ASSISTANT     Assistant · Prompt · Voice & model · Test call
SCHEDULING    Availability · Appointment types · Appointments · Calendar
ACTIVITY      Calls · Conversations · Contacts
CHANNELS      Phone number · Transfers (coming later) · SMS (coming later) · Integrations
ACCOUNT       Usage & limits · Billing · Issues · Settings
```

Delta from current (`Overview / Build / Operate / Observe / Manage`):
- Availability and appointment types leave the voice flag (they are calendar features).
- "Current SMS Receptionist" and the voice assistant prompt are presented as one Assistant
  with two channels, or the SMS receptionist is clearly labelled as the SMS channel (owner
  decision A-4).
- Calls (voice logs) and Conversations (SMS) sit side by side under Activity; a single
  Contacts list links both.
- Calendar connection becomes a real screen (connect / disconnect / status), reachable from
  Onboarding, Appointments and Integrations.
- "Coming later" items render the capability-state page in every build (no 404s).
- Breadcrumb on every nested screen: `Assistant / Front Desk / Prompt`.
- Rail: no nested scroll; groups collapse instead.
- Mobile: bottom nav with five groups (Overview, Assistant, Scheduling, Activity, Account),
  deep screens push with a visible back control.

## 4. Operations CRM — target nav

```
OPS  Command Center · People & Pipeline · Communications · Projects · Discovery
     Receptionist Ops (Firms · Usage · Issues) · Marketing · Settings
```

Delta from current:
- Remove the six "Soon" items (Content Hub, Landing Pages, Facebook/Instagram Leads, Meta
  Diagnostics, Relationship Intelligence) or move them to a single "Roadmap" page.
- Remove the duplicate "Lead DNA → /admin/crm/leads" entry (DNA is reached from a lead).
- Add **Receptionist Ops** with three screens over existing routes: Firms
  (`/api/admin/receptionist-accounts` + `/api/admin/voice/firms/:id/diagnostics`), Usage
  (per-firm usage; cross-firm roll-up needs a new route), Issues (needs a new admin route).
- Breadcrumbs everywhere; one scroll region; a client-side auth gate so the chrome never
  renders unauthenticated; 401 handling in every fetch.
- 404 under `/admin/*` renders inside the CRM layout with the sidebar.

## 5. Cross-surface transitions

- Marketing → app: "Client Sign In" and "Create an account" are full context switches (own chrome).
- App → marketing: only via the logo menu ("Back to sitemintdigital.com").
- CRM is never linked from a customer surface.
- Every 401 in the app returns to `/login` with a return path; every 401 in the CRM returns
  to `/admin?redirect=`.

## 6. Route consistency rules

- URL reflects state (tabs and filters in query params).
- Hostnames per PRODUCT-VISION §5 when the domain program runs; until then path-based.
- No route silently redirects to a different feature; missing pages are recorded as missing.
