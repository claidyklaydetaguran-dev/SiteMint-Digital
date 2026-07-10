---
name: Campaign sequence recipients endpoint
description: CrmCampaignSequence.tsx recipient loading — where the data actually comes from
---

There is no `GET /crm/campaigns/:id/recipients` route in `artifacts/api-server/src/routes/crm.ts`. Recipients are embedded in the `GET /crm/campaigns/:id` response as `{ campaign, recipients }` (joined with `crmLeads` for name/email/company).

**Why:** the sequence builder (`CrmCampaignSequence.tsx`) previously fetched a separate `/recipients` sub-route that never existed, so every drip/nurture campaign's sequence view failed to load with a generic "Failed to load sequence data" error (the 404 HTML response failed to parse as JSON, throwing inside `Promise.all`).

**How to apply:** if you need a campaign's recipients client-side, fetch `GET /crm/campaigns/:id` and read `.recipients`, not a nonexistent nested route. Before assuming a REST sub-resource route exists, grep the router file for the literal path.
