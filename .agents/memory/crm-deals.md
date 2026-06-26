---
name: CRM deals table
description: crm_deals is a separate table from crm_leads; route and nav structure for the deals board.
---

# CRM Deals Architecture

## DB table: crm_deals
- `id` serial PK, `leadId` integer nullable (FK to crm_leads.id — NOT UUID)
- `name` text, `value` decimal(10,2) default 0, `stage` text, `closeDate` date (mode: string)
- `notes` text nullable, `createdAt` / `updatedAt` timestamps
- Stages: Lead, Qualified, Proposal, Won, Lost

## API routes (in artifacts/api-server/src/routes/crm.ts)
- `GET /crm/deals` — list all, joins lead name from crm_leads
- `POST /crm/deals` — create
- `PATCH /crm/deals/:id` — update (including drag-and-drop stage change)
- `DELETE /crm/deals/:id` — delete
- `GET /crm/deals/stats` — executive dashboard stats (revenue, win rate, pipeline, monthly chart data)

## Frontend
- Kanban board: `CrmDeals.tsx` — HTML5 native drag-and-drop (no extra dep), 5 columns, create/edit modal
- Executive dashboard: `CrmExecutiveDashboard.tsx` at `/admin/crm/dashboard` — recharts BarChart + LineChart
- `/admin/crm/dashboard` is the CRM landing page; login redirects here; Dashboard nav item points here
- Old `/admin/crm` route still exists (points to old CrmDashboard)

**Why:** Separated deals from leads so pipeline tracking is independent of contact status. Integer leadId keeps FK consistent with rest of schema (no UUIDs).
