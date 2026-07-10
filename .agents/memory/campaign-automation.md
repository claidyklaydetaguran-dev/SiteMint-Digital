---
name: SiteMint Campaign Automation
description: Current state of the Campaigns module + Phase 26 roadmap; what is built vs gap, and the do-not-rebuild boundary.
---

# SiteMint Campaign Automation — state & roadmap

The Campaigns module is STABLE and feature-rich. Do NOT rebuild Campaigns, the CRM, the
schema, or Twilio — extensions are additive only. Full detail lives in ARCHITECTURE.md
("Campaign Feature Inventory" + "SiteMint Campaign Automation Roadmap").

## Built (COMPLETE)
- Broadcast + multi-step nurture/drip sequences (`crm_campaign_steps`, `crm_campaign_scheduled_messages`).
- Sequence builder UI, enrollment (`/enroll` schedules one msg per step by `dayOffset`).
- Auto-send scheduler (60s tick, Resend/Twilio), message queue UI, stop-on-reply, funnel analytics.

## AI draft generator personalization (audit follow-up, complete)
- `ai-generate` route accepts optional `leadId`/`discStyle`/`healthBadge`; when leadId is
  present the route fetches name/company server-side and passes them into the prompt —
  client never sends raw lead PII beyond the id + precomputed disc style.
- Sign-off is always the literal placeholder `[Your name]`, never a hardcoded brand name,
  regardless of lead context.
- "Generate for this lead" entry point lives on Lead Detail and deep-links to
  `/admin/crm/campaigns?view=builder&leadId=...`; CrmCampaigns reads that query string
  directly (no route prop) and looks up discStyle from its existing discMap.
- Sequence-mode system prompt enforces per-step strategy variation (ack → reframe → short
  SMS check-in → new angle → low-friction close) so steps no longer repeat the same CTA.

## Deal revenue is transaction-backed, not stage-derived
- `crm_transactions` table (dealId, leadId, amount, method, stripePaymentIntentId, status,
  receivedAt) is the source of truth for "real money in." Deal `stage` (Won/Lost) is still a
  manual, independent field — flipping a deal to "Won" does NOT create a transaction and does
  NOT move Total Revenue; only a transaction with status='completed' does.
- Dashboard Total Revenue / monthly revenue sum `crm_transactions` where status='completed',
  not `crm_deals.value` of Won deals — check this file's route before re-deriving deal stats.
- Stripe checkout sessions for deals reuse `getUncachableStripeClient()`; the session id is
  stored in `stripePaymentIntentId` while pending (real payment_intent overwrites it once the
  webhook fires). Reconciliation piggybacks on the existing `/api/stripe/webhook` route/
  `WebhookHandlers` (via `getStripeWebhookSecret()`) rather than adding a second endpoint.

## Known PARTIAL gaps
- **Send-time windows are stored but ignored.** Steps carry `sendTime`
  (immediate/morning/afternoon/evening) and `businessDaysOnly`, but the scheduler sends on
  the calendar-day tick regardless. Roadmap phase 26F closes this.
- **Call-prompt / task steps don't create real work.** Scheduler marks them `skipped` with a
  note instead of creating a `crm_task` or call reminder.
- **No bulk reschedule** of a lead's future scheduled messages (only per-message queue edits).

## Built (COMPLETE) — Phase 26B
- SiteMint persona/topic/blueprint taxonomy is now real: `web-agency/src/lib/campaignTaxonomy.ts`
  (16 personas, 14 topics, 16 blueprints + helpers). Surfaced as optional dropdowns + strategy
  hints/topic-preview/blueprint cards in the Campaign Builder Step 1.
- Strategy metadata persists via EXISTING fields — no schema change. The campaign POST/PATCH
  routes already accept `objective`/`toneProfile`/`description`/`stopOnReply`; the builder maps
  blueprint goal→objective, tone→toneProfile, a summary→description (strategy notes), stopOnReply.
- "Apply blueprint" is an explicit action that confirms before replacing existing objective/tone/
  notes and NEVER touches subject/body. Persona/topic/blueprint dropdown selections are UI-only —
  not parsed back from persisted fields on reload (documented limitation).

## Built (COMPLETE) — Phase 26C
- Sequence builder (`CrmCampaignSequence.tsx`) upgraded into a nurture platform feel — NO AI added.
- **Per-step "Step Intelligence" has NO column.** `crm_campaign_steps` has no metadata field, so
  per-step strategy metadata (objective/desiredBehavior/targetSignal/expectedLift/routingHint/
  personaId/topicId) is embedded in the step `body` under a `[Step Intelligence]` marker line and
  round-tripped via `parseStepBody`/`serializeStepBody`. The marker MUST be alone on its own line
  (parser matches `line.trim() === marker`) so inline mentions in real copy aren't mis-parsed.
  **Why:** spec forbade schema changes; embedding keeps it persistable with zero migration.
- Blueprint→steps generator: appends DRAFT steps (or Replace, gated on `recipients.length===0`)
  by POSTing each step. No AI copy, no enroll, no send. `sendTime` forced to "morning" (09:00 has
  no exact window). Partial-failure leaves created steps in place + shows an error count.
- Sequence/Journey view toggle (Journey = read-only, grouped by week `floor(dayOffset/7)+1`).
  "Campaign ends when…" panel reads `stopOnReply`/`autoSend` from `GET /crm/campaigns/:id`.

## Built (COMPLETE) — Phase 27: AI Campaign Copilot
- OpenAI integration provisioned via Replit AI Integrations (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`).
- Lib: `lib/integrations-openai-ai-server` (copied from skill template; fixed `response.data` strict-null bug in `image/client.ts`).
- API route: `POST /api/crm/campaigns/copilot/generate` in `artifacts/api-server/src/routes/copilot.ts`. Streams SSE with `gpt-5.4`. System prompt encodes all SiteMint context. Never enrolls, sends, or queues anything.
- Frontend: `artifacts/web-agency/src/pages/crm/CrmCopilot.tsx`. Streams output in real-time, parses steps via regex from markdown blocks, hands off to `handleCopilotBuildSequence` in `CrmCampaignSequence.tsx` which POSTs each step (with embedded Step Intelligence) and switches to the Sequence tab on success.
- New `✨ AI Copilot` tab visible in every campaign's sequence view.
- `api-server/package.json` depends on `@workspace/integrations-openai-ai-server`; root `tsconfig.json` and `api-server/tsconfig.json` reference the new lib.

## MISSING (not built at all)
- Switch/routing (conditional branch) logic. Routing hints are strategy notes only.

**Why this matters:** earlier audits keep re-discovering these gaps. The personalization is
DISC-only and deterministic; do not assume any AI machinery exists.

## Gotcha — builder state reset
When adding any new Step-1 builder state to `CrmCampaigns.tsx`, you MUST also reset it inside
`newCampaign()`. It resets fields individually (no single form object), so new state silently
bleeds from a previously-opened campaign into a fresh one and gets persisted on save. This bit
Phase 26B (caught in review). Same applies to `openCampaign` rehydration.
