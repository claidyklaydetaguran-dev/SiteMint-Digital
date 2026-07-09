---
name: Lead DNA composite page
description: How the per-lead "Lead DNA" page fuses the four scoring engines without adding new API surface or touching locked engine files.
---

The Lead DNA page (`/admin/crm/leads/:id/dna`) is a pure aggregation view: it calls
the existing `GET /crm/leads/:id` (which already returns `{ lead, activities, tasks }`)
and `GET /crm/leads/:id/behavioral-events`, then runs the results through the four
existing scoring engines (`leadScore.ts`, `communicationIntelligence.ts`,
`discEngine.ts`, `behavioralIntelligence.ts`) entirely client-side.

**Why:** there is no separate `GET /crm/leads/:id/activities` route — activities
ship as part of the lead detail payload. A page that tries to fetch that path
separately will 404 (silently, if error-handled) and produce a page with
empty-activity scoring, which looks fine but is wrong.

**How to apply:** any new page that needs a lead's activities should read them
off the `/crm/leads/:id` response, not assume a dedicated activities endpoint
exists. When composing multiple engines into a single view, keep engine files
untouched and duplicate only the minimal glue/threshold constants (e.g. the
hot-spike 3-events/7-days threshold lives in `CrmBehavioralIntelligence.tsx`
and should be referenced/copied as a named constant, not redefined with a
different value).
