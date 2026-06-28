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

## Known PARTIAL gaps
- **Send-time windows are stored but ignored.** Steps carry `sendTime`
  (immediate/morning/afternoon/evening) and `businessDaysOnly`, but the scheduler sends on
  the calendar-day tick regardless. Roadmap phase 26F closes this.
- **Call-prompt / task steps don't create real work.** Scheduler marks them `skipped` with a
  note instead of creating a `crm_task` or call reminder.
- **No bulk reschedule** of a lead's future scheduled messages (only per-message queue edits).

## MISSING (not built at all)
- No AI/LLM anywhere — all copy is rule-based DISC personalization (`campaignPersonalization.ts`).
- No SiteMint persona taxonomy, no topic library, no switch/routing (conditional branch) logic.

**Why this matters:** earlier audits keep re-discovering these gaps. The personalization is
DISC-only and deterministic; do not assume any persona/topic/AI machinery exists. Recommended
persona + topic taxonomies are listed in ARCHITECTURE.md as data-only constants (no schema yet).
