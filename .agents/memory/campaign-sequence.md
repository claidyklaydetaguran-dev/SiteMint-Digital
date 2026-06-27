---
name: Campaign Sequence Rebuild (Phase 25)
description: Multi-step drip/nurture sequence campaigns — DB schema, routes, and frontend components added in Phase 25A–25G.
---

## What was built

### Phase 25A — Schema Foundation
- Extended `crm_campaigns`: added `type` (broadcast|nurture|drip), `objective`, `toneProfile`, `description`, `stopOnReply` bool, `autoSend` bool
- Extended `crm_campaign_recipients`: added `enrolledAt`, `enrollmentStatus` (active|paused|completed|stopped), `currentStep`
- New `crm_campaign_steps` table: `campaignId` FK, `stepNumber`, `dayOffset`, `channel` (email|sms|call_prompt|task), `subject`, `body`, `callPrompt`, `taskDescription`, `sendTime`, `businessDaysOnly`
- New `crm_campaign_scheduled_messages` table: `campaignId`, `recipientId`, `stepId`, `leadId` FKs; `channel`, `subject`, `body`, `status` (scheduled|queued|sent|failed|canceled|skipped), `scheduledAt`, `sentAt`, `resendEmailId`, `lastError`

### Phase 25B — API Routes (crm.ts)
Static routes ordered BEFORE /:id to avoid Express swallowing them:
- `GET /crm/campaigns/queue` — list scheduled messages (filterable by status, campaignId)
- `PATCH /crm/campaigns/queue/:messageId` — edit subject/body/scheduledAt
- `POST /crm/campaigns/queue/:messageId/send-now` — fire a scheduled message immediately
- `DELETE /crm/campaigns/queue/:messageId` — cancel (soft: sets status="canceled")
- `GET /crm/campaigns/:id/steps` — list steps ordered by stepNumber
- `POST /crm/campaigns/:id/steps` — add step
- `PATCH /crm/campaigns/:id/steps/:stepId` — edit step
- `DELETE /crm/campaigns/:id/steps/:stepId` — delete step
- `POST /crm/campaigns/:id/enroll` — enroll leads (creates recipient rows + schedules one message per step×lead)
- `PATCH /crm/campaigns/:id/recipients/:rid/status` — pause/stop/resume; cancels pending scheduled messages on stop
- `GET /crm/campaigns/:id/activity` — returns scheduled messages + campaign events

Also updated `POST /crm/campaigns` and `PATCH /crm/campaigns/:id` to accept: type, objective, toneProfile, description, stopOnReply, autoSend.

### Phases 25C–25G — Frontend
**New files:**
- `artifacts/web-agency/src/pages/crm/CrmCampaignSequence.tsx` — full sequence builder: step list (StepCard), step editor form (StepForm), LeadPicker for enrollment, enrolled recipients table with pause/stop/resume
- `artifacts/web-agency/src/pages/crm/CrmCampaignQueue.tsx` — global message queue: status filter tiles, per-message send-now/cancel/inline-edit, real-time status updates

**Changes to CrmCampaigns.tsx:**
- Campaign interface: added type, objective, toneProfile, description, stopOnReply, autoSend fields
- New state: `campaignType`, `sequenceCampaignId`, `sequenceCampaignName`, `sequenceCampaignType`
- New views: `"sequence"` (renders CrmCampaignSequence) and `"queue"` (renders CrmCampaignQueue)
- New functions: `openSequence(c)`, `openQueue(c?)`
- Builder Step 1: added campaign type selector (Broadcast/Nurture/Drip toggle cards)
- History rows: "Sequence" button for nurture/drip campaigns, "Queue" button for all campaigns
- History header: "Global Queue" button

## Key rules
- Route ordering: `/campaigns/queue` and `/campaigns/queue/:messageId` must appear BEFORE `/campaigns/:id` in crm.ts
- Enrollment creates scheduled messages synchronously; the scheduled messages table drives the queue UI
- `stopOnReply` and `autoSend` are stored but not yet wired to automation — future work
- All new columns have defaults; `db push` with drizzle-kit applied them non-destructively
