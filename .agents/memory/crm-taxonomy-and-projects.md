---
name: CRM canonical taxonomy & Project pipeline
description: Where the agency CRM's canonical lead statuses / project types live, the dual-source sync rule, and how the Project/Delivery pipeline reuses crm_tasks.
---

# Canonical taxonomy is DUAL-sourced — keep both in sync

The agency CRM lead statuses (12) and project/service types (13) are defined in **two**
places that must be kept identical:

- Frontend: `artifacts/web-agency/src/lib/crmTaxonomy.ts` (`LEAD_STATUSES`, `PROJECT_TYPES`,
  `PROJECT_STAGES`, style maps, `normalizeLeadStatus`).
- Backend / DB: `lib/db/src/schema/crmLeads.ts` (`CRM_STATUSES`, `PROJECT_TYPES`) and
  `lib/db/src/schema/crmProjects.ts` (`PROJECT_STAGES`).

**Why:** artifacts cannot import each other, and the api-server cannot import the
web-agency module. The server must import the canonical arrays from `@workspace/db`
(re-exported via `lib/db/src/index.ts` → `./schema`). So the same list is intentionally
duplicated across the frontend lib and the db lib — editing one without the other causes
silent drift (e.g. pipeline columns rendering empty because backend grouped by legacy
status strings while frontend rendered canonical ones).

**How to apply:** any time you add/rename a lead status, project type, or project stage,
edit BOTH `crmTaxonomy.ts` and the matching `lib/db/src/schema/*` arrays, then
`pnpm run typecheck:libs` before the leaf artifact checks.

## Legacy status migration

Legacy lead statuses map to canonical via: New→New Inquiry, Contacted/Follow-up→Follow-Up
Needed, Negotiating→Qualified, Nurture→On Hold. This map exists in both
`normalizeLeadStatus` (frontend) and the CSV-import `LEGACY_ST` map in
`artifacts/api-server/src/routes/crm.ts`. Default lead status everywhere is "New Inquiry".

# Project / Delivery pipeline reuses crm_tasks

There is **no** separate project-tasks table. `crm_tasks` has nullable `leadId` plus a
`projectId` column; project tasks set `projectId` (and inherit the project's leadId when
present). Project-task subroutes in `artifacts/api-server/src/routes/crmProjects.ts` must
scope by BOTH `projectId` and `taskId` (use `and(eq(id),eq(projectId))`) so tasks from
other projects can't be mutated/deleted. `PATCH /crm/projects/:id` validates `stage`
against `PROJECT_STAGES`.

# Proposal/SOW rendered HTML is XSS-sensitive

Generators interpolate user-controlled discovery fields into HTML; the previews render it
via `<iframe srcDoc=...>`. All such iframes use `sandbox="allow-same-origin"` (plus
`allow-modals` where print is needed) WITHOUT `allow-scripts` — this blocks script
execution while preserving print/copy (parent reads contentDocument). Do not add
`allow-scripts` to these iframes. Root-cause fix (escaping in `lib/generators.ts`) is
still outstanding.
