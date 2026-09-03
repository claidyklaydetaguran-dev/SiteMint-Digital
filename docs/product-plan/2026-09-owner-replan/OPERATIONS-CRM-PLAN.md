# Operations CRM Plan

> Planning document. The CRM is a stable, daily-use internal tool with locked engines
> (`discEngine`, `leadScore`, `communicationIntelligence`, `workflowEngine`) and a protected
> Twilio route file. This plan adds a receptionist-operations area and fixes orientation
> defects; it does not rebuild the CRM.

## 1. Goals

1. Give SiteMint staff one place to see every receptionist customer: status, usage, open
   issues, and the support actions that already exist as admin routes.
2. Fix the wayfinding defects found in the audit (no breadcrumbs, three scroll regions,
   dead "Soon" items, duplicate entries, no client-side auth gate, inconsistent 401 handling).
3. Standardise loading / empty / error / permission-denied states across pages.

## 2. New area: Receptionist Ops

| Screen | Route (proposed) | Backend today | Backend needed |
|---|---|---|---|
| Firms | `/admin/ops/firms` | `GET /api/admin/receptionist-accounts` (unbounded) | pagination + search on the same route |
| Firm detail | `/admin/ops/firms/:id` | `GET /api/admin/voice/firms/:id/diagnostics` (subscription, usage, cap, open issues, numbers); `PUT …/subscription` | admin read of assistants, calls (metadata), appointments for the firm; audit-log read |
| Usage | `/admin/ops/usage` | per-firm usage via diagnostics | cross-firm roll-up route; cost model (rate card) — owner decision |
| Issues | `/admin/ops/issues` | `/metricz` single integer; per-firm count | `GET /api/admin/voice/issues` (+ resolve) |
| Number inventory | `/admin/ops/numbers` | assign/pause/unpause exist per firm | guarded inventory insert (owner-gated activation) |

States: loading skeleton rows; empty ("no firms yet"); error with retry; permission-denied
(401 → login with return path, never a blank chrome).

## 3. Wayfinding fixes (existing CRM)

| Defect | Fix |
|---|---|
| Three stacked scroll regions (sidebar nav, main, mobile drawer) | one page scroll; sidebar groups collapse; sticky header |
| No breadcrumbs | breadcrumb component (shadcn primitive exists) on every page under CrmLayout |
| Six "Soon" nav items with no href | remove, or one "Roadmap" page |
| Duplicate "Lead DNA" → `/admin/crm/leads` | remove; DNA reached from lead detail |
| Two dashboards (Discovery Portal, Command Center) | Command Center is home; Discovery Portal becomes a section |
| No client-side auth gate | route guard reading `adminToken`; chrome never renders unauthenticated |
| 401 handling inconsistent (Lead DNA none; pollers swallow) | shared `adminFetch` helper with one 401 path |
| 404 under `/admin/*` outside CrmLayout | render inside CrmLayout with sidebar |
| Legacy vs canonical lead statuses | call `normalizeLeadStatus()` at the boundary; smart lists use canonical values |
| Unguarded `.toLowerCase()` / `.tags.length` | null-safe filters |
| Calendar day/week toggles inert; `.slice(0,10)` timezone shift | either implement or remove toggles; format dates in local time |

## 4. Saved views, filters and search

Saved views do not exist. Proposal: query-param-backed filters on Firms / Leads / Issues
(state, plan, owner, date range) with a "save this view" that persists to localStorage first
(no schema change), promoted to a table later if used.

## 5. Order of work

1. Shared `adminFetch` + route guard + breadcrumbs + single scroll region (one PR, CRM-wide, no engine changes).
2. Receptionist Ops → Firms + Firm detail over existing routes.
3. Admin issues route + Issues screen.
4. Nav cleanup (Soon items, duplicates, two dashboards).
5. Lead-status normalisation and null-safety fixes.
6. Usage roll-up + cost model (after the owner decides the rate card).

Change-budget note: DEVELOPMENT_RULES.md's per-session budget (5 files / 300 lines) applies
to CRM sessions; items 1 and 4 exceed it and need explicit owner approval as "large refactor".
