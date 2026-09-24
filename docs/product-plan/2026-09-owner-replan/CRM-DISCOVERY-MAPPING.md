# Discovery → CRM mapping (2026-09-05)

> Owner directive: discovery submissions become structured CRM records using the
> EXISTING payload and contracts; no schema migration without authorization.
> Investigation result (wp/discovery2): `discovery_submissions.form_data` is JSONB
> and both apps consume `@workspace/discovery-contract` live, so the v1.1.0
> additive contract (projectStage + optional `growth` section) reaches the CRM
> with **zero database changes**. No migration is needed or requested.

## Field mapping (submission → CRM record)

| Owner-required CRM support | Source in the existing payload | CRM surface today |
|---|---|---|
| Lead identity | `contact.name/email/phone/title` | `crm_leads` row created on submission (existing pipeline); lead detail page |
| Project type | `projectDirection.primaryType` + `secondaryInterests` | submission detail (`/admin/crm/discovery-submissions/:id`) |
| New vs redesign status | `projectDirection.projectStage` (new, v1.1.0) | submission detail JSON view (renders from form_data) |
| Business and audience | `business.*` | submission detail |
| Goals | `decisionContext.desiredOutcome/primaryGoal/secondaryGoals` | submission detail |
| Visual direction | `readiness.designPreferences/designDislikes/referenceSites`, logo/brand status | submission detail |
| Requested features | `projectScope.features[]` (key+priority) | submission detail |
| Systems and integrations | `readiness.integrations/currentPlatform/migrationNeeds` | submission detail |
| Growth requirements | `growth.*` (new: platform, budget range, objective, audience, landing page, pixels, analytics/consent, creatives, past results, reporting cadence) | submission detail (form_data) |
| Estimated scope | `projectScope` + pricing configurator hand-off | proposal generation (existing `generate-proposal` route) |
| Timeline | `commercial.launchWindow/targetDate/dateFlexibility` | submission detail + lead fields |
| Budget range | `commercial.investmentRange` | lead `estimatedValue`/detail |
| Qualification status | CRM-side (`discoveryFormStatus`, lead scoring fields — locked engine) | leads list/detail |
| Follow-up task | existing CRM tasks (`crm_tasks`) | Command Center "Leads needing follow-up" |
| Proposal / SOW preparation | existing `generate-proposal` / SOW routes | submission detail actions |
| Project conversion | existing `convert-to-project` route | submission detail action |
| Client relationship history | `crm_leads` + conversations/notes | lead detail |

## Workflow (unchanged, now better fed)

Submission (201 + reference) → `discovery_submissions` row (form_data JSONB, v1.1.0)
→ lead created/linked → qualification (locked scoring engine, untouched) → follow-up
task → proposal/SOW generation → project conversion. Advertising-interest leads carry
their `growth` block for the separately-scoped campaign-management conversation.

## Explicitly NOT needed (and not done)

- No new columns, no migration, no change to `crm_*` or `intake_*` tables.
- No CRM UI redesign for the new fields: the submission detail renders form_data;
  a dedicated "Growth" panel on the submission page is a cheap later enhancement
  (flagged, not built — owner can approve separately).
