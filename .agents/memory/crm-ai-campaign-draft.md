---
name: AI campaign draft generator
description: How Phase 26G's AI campaign/sequence draft generation was built and its draft-only safety pattern — reference before adding more AI generation features to the CRM.
---

## What exists

- `artifacts/api-server/src/lib/aiCampaign.ts` — `generateCampaignDraft()` (single email) and `generateSequenceDraft()` (multi-step nurture sequence), both pure functions returning structured JSON, grounded by persona/topic/objective/tone fields passed in from the caller (no DB reads).
- `artifacts/api-server/src/routes/aiCampaignGenerate.ts` — `POST /crm/campaigns/ai-generate`, `requireAdmin`-gated, `mode: "single" | "sequence"`. Returns the draft only; never writes to the DB.
- UI hooks: `CrmCampaigns.tsx` (single-campaign builder) and `CrmCampaignSequence.tsx` (sequence builder) both call this route and show an "AI-drafted, review before saving" badge.

## Why the design looks this way

**Why:** the task's safety requirement was "drafts only, no persistence, explicit human Save click required" — stricter than the existing non-AI blueprint generator, which already auto-POSTs steps once the user clicks a confirm button. To stay consistent with that established codebase convention (blueprint generator, Copilot's "Build Sequence") while still meeting the stricter requirement, the sequence flow generates into a **local preview state first**, and only POSTs the steps when the user clicks a second, explicit "Add these draft steps" button — nothing is created by generation alone. The single-campaign flow is simpler: it only fills form fields (subject/body), never calls a save endpoint itself.

**Why a separate route/lib file instead of extending `crm.ts` or `copilot.ts`:** `crm.ts` is large and dense; isolating new functionality in its own file minimizes risk to a stable, heavily-used route file. This mirrors the existing `copilot.ts` pattern.

## How to apply

- If adding more AI-generation entry points to this CRM, keep the "preview → explicit confirm → persist" flow rather than auto-saving on generation, and keep new generator logic in its own lib/route file rather than growing `crm.ts`.
- Manual edits to AI-filled fields should clear the "AI-drafted" badge (implemented via `onChange` handlers that reset the drafted flag), so review-state accurately reflects whether content is still purely AI output.
