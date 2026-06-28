# SiteMint Digital CRM — Architecture Guide

> Read this file before every development session.
> Last updated: 2026-06-28 (Phase 25 complete + Phase 26 campaign automation audit)

---

## Project Overview

SiteMint Digital CRM is an internal admin tool for `sitemintdigital.com`. It manages the full sales lifecycle: capturing leads from the Discovery Portal, tracking them through a pipeline, communicating via email/SMS, scoring them with DISC behavioral intelligence, generating proposals and SOWs, and running personalized email campaigns.

**There is no public-facing product.** All routes under `/admin` require a session token obtained from `POST /api/admin/login`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces, Node.js 24 |
| Language | TypeScript 5.9 (strict) |
| Frontend | React + Vite + wouter + shadcn/ui |
| Backend | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod (`zod/v4`), `drizzle-zod` |
| Email | Resend (`RESEND_API_KEY`) |
| Phone/SMS | Twilio (`TWILIO_*` env vars) |
| Auth | Session token in memory; `POST /api/admin/login` → Bearer token stored in `localStorage` as `adminToken` |
| Migration | `drizzle-kit push` only — **no migration files** |
| Build | esbuild (CJS bundle via `build.mjs`) |

---

## Repository Layout

```
artifacts/
  api-server/          — Express 5 API (port 8080, proxied to /api)
    src/
      routes/
        admin.ts       — Discovery portal admin, form submissions
        crm.ts         — All CRM endpoints (leads, tasks, email, campaigns, deals, pipeline, import)
        contact.ts     — Public contact form
        discovery.ts   — Public discovery portal submission
        health.ts      — Health check
        index.ts       — Route registration
        phone.ts       — Twilio SMS/voice + webhooks (LOCKED)
      middlewares/     — requireAdmin auth guard
      lib/             — Shared server-side helpers
  web-agency/          — React + Vite frontend (port varies, proxied to /)
    src/
      pages/crm/
        CrmLayout.tsx            — Shell: sidebar nav, global search, quick-add lead
        CrmDashboard.tsx         — Executive dashboard (stats, pipeline tiles)
        CrmExecutiveDashboard.tsx
        CrmLeads.tsx             — People list, filters
        CrmLeadDetail.tsx        — Lead Command Center (DISC, score, timeline, tasks)
        SalesWorkspace.tsx       — Full sales workspace per lead
        CrmPipeline.tsx          — Pipeline kanban
        CrmInbox.tsx             — Unified inbox (email + SMS threads)
        CrmDeals.tsx             — Deals kanban
        CrmCampaigns.tsx         — Campaign builder + history (ACTIVE)
        CrmReporting.tsx         — Reporting
        CrmTasks.tsx             — Task manager
        CrmCalendar.tsx          — Calendar view
        CrmImport.tsx            — CSV import + Discovery import
        CrmEmailTemplates.tsx    — Email template library
        CrmSettings.tsx          — Settings
        CrmAdminSettings.tsx     — Admin settings
      lib/
        campaignPersonalization.ts   — DISC-aware email personalization (ACTIVE)
        communicationIntelligence.ts — CI engine (LOCKED)
        discEngine.ts                — DISC scoring engine (LOCKED)
        leadScore.ts                 — Lead health score engine (LOCKED)
        workflowEngine.ts            — Workflow trigger engine (LOCKED)
        utils.ts                     — Shared helpers

lib/
  db/                  — Drizzle ORM schema + client (composite lib)
    src/schema/
      crmLeads.ts
      crmDeals.ts
      crmActivities.ts
      crmTasks.ts
      crmMessages.ts
      crmEmailTemplates.ts
      crmCampaigns.ts       — crm_campaigns + crm_campaign_recipients
      submissions.ts        — discovery_submissions
      formSubmissions.ts    — form_submissions
      index.ts              — barrel export (all tables)

scripts/               — Utility scripts (@workspace/scripts)
```

---

## Module Status

| Module | Status | Key Files | Notes |
|---|---|---|---|
| Discovery Portal | **LOCKED** | `routes/discovery.ts`, `routes/admin.ts` (submissions), `CrmImport.tsx` | Submission + proposal/SOW generation; do not modify |
| CRM Dashboard | STABLE | `CrmDashboard.tsx`, `CrmExecutiveDashboard.tsx` | Stats from `/api/crm/stats` |
| Leads | STABLE | `CrmLeads.tsx`, `crm.ts` lines 59–190 | CRUD, filtering, search |
| Lead Detail Command Center | STABLE | `CrmLeadDetail.tsx` | DISC, score, timeline, proposal/SOW |
| Sales Workspace | STABLE | `SalesWorkspace.tsx` | Full per-lead workspace with comms |
| Workflow Engine | **LOCKED** | `lib/workflowEngine.ts` | Trigger/action engine; do not modify |
| Lead Health Engine | **LOCKED** | `lib/leadScore.ts` | Scoring algorithm; do not modify |
| Communication Intelligence | **LOCKED** | `lib/communicationIntelligence.ts` | CI sidebar card, comms scoring; do not modify |
| DISC / Behavioral Intelligence | **LOCKED** | `lib/discEngine.ts` | DISC computation + DISC_META; do not modify |
| Campaigns | STABLE | `CrmCampaigns.tsx`, `CrmCampaignSequence.tsx`, `CrmCampaignQueue.tsx`, `lib/campaignPersonalization.ts`, `api lib/campaignScheduler.ts`, `api lib/sequenceReply.ts`, `crm.ts` campaign section, `schema/crmCampaigns.ts` | Broadcast + multi-step nurture/drip sequences, auto-send scheduler, queue, stop-on-reply, and funnel analytics all live — see Campaign Feature Inventory + SiteMint Campaign Automation Roadmap below. Do NOT rebuild. |
| Behavioral Intelligence | **ACTIVE** | `lib/behavioralIntelligence.ts` (engine), `schema/crmBehavioralEvents.ts` (data), `crm.ts` behavioral routes | Phase 24A+24B complete — data layer + DNA engine live; UI (24C) is next |
| Inbox | STABLE | `CrmInbox.tsx`, `phone.ts` (read paths) | Unified email + SMS inbox |
| Reporting | STABLE | `CrmReporting.tsx` | Read-only reporting |
| Import Leads | STABLE | `CrmImport.tsx`, `crm.ts` lines 587–757 | CSV + Discovery import |
| Twilio / Phone Routes | **LOCKED** | `routes/phone.ts` (entire file) | SMS, voice, webhooks; never touch |
| Email Templates | STABLE | `CrmEmailTemplates.tsx`, `crm.ts` lines 339–386 | Template CRUD |
| Deals / Pipeline | STABLE | `CrmDeals.tsx`, `CrmPipeline.tsx`, `crm.ts` lines 758–929 | Kanban + stats |
| Tasks | STABLE | `CrmTasks.tsx`, `crm.ts` lines 213–305 | Task CRUD |

---

## Frontend Route Map

All routes live in `artifacts/web-agency/src/App.tsx` and require the `adminToken` in `localStorage`.

| Path | Component |
|---|---|
| `/admin` | Admin login redirect |
| `/admin/crm` | CRM root (redirects to dashboard) |
| `/admin/crm/dashboard` | CrmDashboard |
| `/admin/crm/leads` | CrmLeads |
| `/admin/crm/leads/:id` | CrmLeadDetail |
| `/admin/crm/leads/:id/workspace` | SalesWorkspace |
| `/admin/crm/pipeline` | CrmPipeline |
| `/admin/crm/inbox` | CrmInbox |
| `/admin/crm/tasks` | CrmTasks |
| `/admin/crm/calendar` | CrmCalendar |
| `/admin/crm/deals` | CrmDeals |
| `/admin/crm/campaigns` | CrmCampaigns |
| `/admin/crm/reporting` | CrmReporting |
| `/admin/crm/admin` | CrmAdminSettings |
| `/admin/crm/settings` | CrmSettings |
| `/admin/crm/import` | CrmImport |
| `/admin/crm/email-templates` | CrmEmailTemplates |

---

## API Route Map

All CRM endpoints require `Authorization: Bearer <token>`. Base path: `/api`.

### Auth
| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/login` | Returns session token |

### Admin / Discovery
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/submissions` | List discovery submissions |
| GET | `/admin/submissions/:id` | Single submission |
| PATCH | `/admin/submissions/:id` | Update submission |
| POST | `/admin/submissions/:id/proposal` | Generate HTML proposal |
| POST | `/admin/submissions/:id/sow` | Generate HTML SOW |
| GET | `/admin/submissions/export/csv` | CSV export |
| GET | `/admin/form-submissions` | List contact form submissions |
| PATCH | `/admin/form-submissions/:id` | Update form submission |
| POST | `/discovery/submit` | Public: submit discovery form |

### Leads
| Method | Path | Purpose |
|---|---|---|
| GET | `/crm/stats` | Dashboard KPI stats |
| GET | `/crm/leads` | List leads (with filters) |
| POST | `/crm/leads` | Create lead |
| GET | `/crm/leads/:id` | Lead detail |
| PATCH | `/crm/leads/:id` | Update lead |
| DELETE | `/crm/leads/:id` | Delete lead |
| POST | `/crm/leads/:id/notes` | Add note (creates activity) |
| POST | `/crm/leads/:id/email` | Send email via Resend |
| POST | `/crm/leads/:id/proposal/generate` | Generate proposal HTML |
| PATCH | `/crm/leads/:id/proposal` | Save proposal edits |
| POST | `/crm/leads/:id/sow/generate` | Generate SOW HTML |
| PATCH | `/crm/leads/:id/sow` | Save SOW edits |

### Tasks
| Method | Path | Purpose |
|---|---|---|
| GET | `/crm/tasks` | List all tasks |
| POST | `/crm/leads/:id/tasks` | Create task for lead |
| PATCH | `/crm/tasks/:id` | Update task |
| DELETE | `/crm/tasks/:id` | Delete task |

### Email Templates
| Method | Path | Purpose |
|---|---|---|
| GET | `/crm/email-templates` | List templates |
| POST | `/crm/email-templates` | Create template |
| PUT | `/crm/email-templates/:id` | Update template |
| DELETE | `/crm/email-templates/:id` | Delete template |

### Campaigns
| Method | Path | Purpose |
|---|---|---|
| GET | `/crm/campaigns` | List all campaigns (with recipient counts) |
| POST | `/crm/campaigns` | Create draft campaign |
| GET | `/crm/campaigns/:id` | Campaign detail + recipients |
| PATCH | `/crm/campaigns/:id` | Update campaign fields/status |
| DELETE | `/crm/campaigns/:id` | Delete campaign (cascades recipients) |
| POST | `/crm/campaigns/:id/recipients` | Replace recipients (with DISC personalization) |
| POST | `/crm/campaigns/test-send` | Test send from unsaved draft body |
| POST | `/crm/campaigns/:id/test-send` | Test send from persisted campaign |
| POST | `/crm/campaigns/:id/send` | Batch send to all pending recipients |
| POST | `/crm/campaigns/:id/recipients/:recipientId/resend` | Resend to a single failed recipient |
| GET | `/crm/campaigns/:id/analytics` | Analytics — sent/open/click/bounce rates, unique openers/clickers |
| POST | `/crm/webhooks/resend` | Resend event webhook (open, click, bounce, delivery failure) |

### Behavioral Intelligence
| Method | Path | Purpose |
|---|---|---|
| GET | `/crm/leads/:id/behavioral-events` | List all behavioral events for a lead (newest first) |
| POST | `/crm/leads/:id/behavioral-events` | Record a new behavioral event with optional DNA deltas |
| DELETE | `/crm/leads/:id/behavioral-events/:eventId` | Delete a single event (manual correction) |

### Deals / Pipeline
| Method | Path | Purpose |
|---|---|---|
| GET | `/crm/deals/stats` | Deal stage stats |
| GET | `/crm/deals` | List deals |
| POST | `/crm/deals` | Create deal |
| PATCH | `/crm/deals/:id` | Update deal |
| DELETE | `/crm/deals/:id` | Delete deal |
| GET | `/crm/pipeline` | Full pipeline view with leads + deals |

### Import
| Method | Path | Purpose |
|---|---|---|
| POST | `/crm/import` | CSV lead import |
| POST | `/crm/import-discovery` | Import discovery submissions to CRM |
| POST | `/crm/import-discovery/:id` | Import single discovery submission |

### Phone / SMS / Voice (LOCKED — `routes/phone.ts`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/crm/phone/status` | Twilio config status |
| POST | `/crm/phone/test-sms` | Test SMS |
| GET | `/crm/conversations` | SMS conversation list |
| GET | `/crm/leads/:id/messages` | Lead SMS thread |
| POST | `/crm/leads/:id/sms` | Send SMS |
| POST | `/crm/leads/:id/call` | Initiate call |
| PATCH | `/crm/leads/:id/sms-consent` | Update SMS consent |
| POST | `/crm/webhooks/twilio/sms` | **Twilio webhook** |
| POST | `/crm/webhooks/twilio/sms/status` | **Twilio webhook** |
| POST | `/crm/webhooks/twilio/voice` | **Twilio webhook** |
| POST | `/crm/webhooks/twilio/voice/bridge` | **Twilio webhook** |
| POST | `/crm/webhooks/twilio/voice/status` | **Twilio webhook** |

---

## Database Table Map

All schema lives in `lib/db/src/schema/`. Migration: `pnpm --filter @workspace/db run push`.

| Table | Schema File | Purpose |
|---|---|---|
| `crm_leads` | `crmLeads.ts` | Core lead/contact records |
| `crm_deals` | `crmDeals.ts` | Deals linked to leads; pipeline stages |
| `crm_activities` | `crmActivities.ts` | Activity timeline (notes, emails, calls) |
| `crm_tasks` | `crmTasks.ts` | Tasks linked to leads |
| `crm_messages` | `crmMessages.ts` | SMS/email message thread per lead |
| `crm_email_templates` | `crmEmailTemplates.ts` | Reusable email templates |
| `crm_campaigns` | `crmCampaigns.ts` | Campaign records (name, subject, body, status) |
| `crm_campaign_recipients` | `crmCampaigns.ts` | Per-recipient DISC-personalized email data; FK → crm_leads (cascade) |
| `crm_campaign_events` | `crmCampaigns.ts` | Per-recipient email events (opened, clicked, bounced); FK → crm_campaign_recipients (cascade) |
| `crm_behavioral_events` | `crmBehavioralEvents.ts` | Lead behavioral events with per-dimension DNA score deltas; FK → crm_leads (cascade) |
| `discovery_submissions` | `submissions.ts` | Discovery portal form submissions |
| `form_submissions` | `formSubmissions.ts` | Public contact form submissions |

---

## Locked Engines — Do Not Modify Without Explicit Request

These files are compute engines with complex, tested logic. Touching them risks breaking lead scoring, DISC analysis, and communication intelligence across the entire CRM.

| File | What it does |
|---|---|
| `lib/discEngine.ts` | `computeSimplifiedDisc`, `getCommunicationStyle`, `DISC_META` — DISC behavioral typing |
| `lib/leadScore.ts` | `computeLeadHealthScore` — multi-factor lead health scoring |
| `lib/communicationIntelligence.ts` | `buildCommunicationIntelligence` — activity-based CI signals |
| `lib/workflowEngine.ts` | Trigger/action workflow execution engine |
| `routes/phone.ts` | All Twilio SMS, voice, and webhook handlers |

---

## Campaign Feature Inventory

### Complete
| Feature | Notes |
|---|---|
| Campaign builder | Name, subject, body editor |
| Draft persistence | `crm_campaigns` table; `status: draft\|ready\|archived` |
| Recipient persistence | `crm_campaign_recipients` with DISC-personalized subject + body |
| Manual send execution | `POST /crm/campaigns/:id/send` — sends to all `selected`/`failed` recipients |
| Test send | Both persisted (`/:id/test-send`) and unsaved-draft (`/test-send`) variants |
| Per-recipient status tracking | `status: selected\|test_previewed\|sent\|skipped\|failed` + `lastError` |
| Resend failed | `POST /crm/campaigns/:id/recipients/:recipientId/resend` |
| Analytics view | `GET /crm/campaigns/:id/analytics` — sent, skipped, failed counts |
| Event tracking table | `crm_campaign_events` — `sent\|failed\|skipped\|opened\|clicked\|bounced\|replied_estimated` |
| Resend webhook endpoint | `POST /crm/webhooks/resend` — receives open/click/bounce events from Resend |
| Unique open/click tracking | Deduplication via Set on `campaignRecipientId` in analytics query |
| Performance insights | `openRate`, `clickRate`, `bounceRate` computed in analytics route |
| Campaign list polish | Recipient counts, status badges, history view |
| Multi-step sequences (nurture/drip) | `crm_campaign_steps` + `crm_campaign_scheduled_messages`; per-step email/SMS/call-prompt/task; Phase 25 |
| Sequence builder UI | `CrmCampaignSequence.tsx` — add/edit/reorder steps, day offset, channel, send-time window |
| Enrollment | `POST /crm/campaigns/:id/enroll` — schedules one message per step per lead by `dayOffset` |
| Auto-send scheduler | `lib/campaignScheduler.ts` — 60s tick, sends due messages via Resend/Twilio, completion detection |
| Message Queue UI | `CrmCampaignQueue.tsx` + queue routes — view/reschedule/cancel/send-now scheduled messages |
| Stop-on-reply enforcement | `lib/sequenceReply.ts` + scheduler guard; SMS inbound + Resend complaint stamp `enrollmentStatus: stopped` |
| Sequence funnel analytics | `GET /crm/campaigns/:id/funnel` — enrollment breakdown + per-step reach/drop-off |

### Partial / Gaps (see SiteMint Campaign Automation Roadmap)
| Feature | Notes |
|---|---|
| Send-time windows | `sendTime` (immediate/morning/afternoon/evening) + `businessDaysOnly` stored on steps but scheduler does NOT honor them — sends on the calendar-day tick regardless |
| Call-prompt / task steps | Scheduler marks them `skipped` with a note; does not create a real `crm_task` or call reminder |
| Reschedule enrolled contacts | Per-message queue reschedule exists; no bulk "shift all of a lead's future steps" action |

### Not Yet Built
| Feature | Notes |
|---|---|
| AI campaign generator | No OpenAI/LLM integration anywhere — all copy is rule-based DISC personalization |
| Persona taxonomy | No SiteMint persona model; only DISC styles drive personalization |
| Topic library | No reusable campaign-topic/template taxonomy |
| Switch logic / routing rules | No conditional branching (opened → path A, ignored → path B) |
| A/B testing | Subject/body variant testing |
| Segment automation | Auto-enroll leads by filter/tag |
| Live send progress | Real-time browser progress bar during batch send |
| Deduplicated webhook DB index | Dedup currently in-memory (Set); no unique DB constraint on `(campaign_recipient_id, event_type)` |

---

## SiteMint Campaign Automation Roadmap

> Adapted from a real-estate campaign reference spec into SiteMint Digital's existing CRM.
> **Do-not-rebuild note:** the sequence/queue/scheduler/stop-on-reply stack is already built and STABLE.
> Do NOT rebuild Campaigns, the CRM, the schema, or Twilio. Each phase below is additive.

| Phase | Goal | Files likely touched | Schema? | Risk | Sequencing rationale |
|---|---|---|---|---|---|
| 26A — Sequence/queue safety audit | Verify enrollment → schedule → send → stop-on-reply loop end-to-end; document gaps | none (audit) + docs | No | Low | Must confirm current system is sound before extending it |
| 26B — SiteMint personas + topic taxonomy | Add persona + topic constants (data only, no schema) used to label/seed campaigns | new `lib/campaignTaxonomy.ts`, `CrmCampaigns.tsx` | No | Low | Pure additive metadata; nothing else depends on it |
| 26C — Campaign objective + step intelligence metadata | Surface `objective`/`toneProfile`/persona on campaign + per-step intent labels | `CrmCampaigns.tsx`, `CrmCampaignSequence.tsx`, campaign routes | Maybe (nullable cols) | Low-Med | Builds on 26B taxonomy |
| 26D — Stop-on-reply hardening | Add reply-detection for email replies (not just complaints) + audit coverage | `lib/sequenceReply.ts`, scheduler | No | Med | Independent; strengthens an existing guarantee |
| 26E — Switch logic / routing rules | Conditional next-step (opened → A, ignored → B) | scheduler, `crm_campaign_steps` (+ branch cols), builder UI | Yes | High | Needs 26C metadata + behavioral events as branch inputs |
| 26F — Send-window enforcement | Make scheduler honor `sendTime` + `businessDaysOnly` (currently ignored) | `lib/campaignScheduler.ts`, `/enroll` route | No | Med | Closes a known PARTIAL; isolated to scheduler |
| 26G — AI campaign generator | LLM-assisted subject/body/sequence drafting (via Replit AI integration) | new `lib/aiCampaign.ts`, builder UI, new route | No | High | Last because it depends on personas/topics/objectives being defined |
| 26H — Reschedule enrolled contacts | Bulk shift a lead's future scheduled messages | queue routes, `CrmCampaignQueue.tsx` | No | Med | Builds on send-window logic (26F) for correct re-timing |
| 26I — Campaign performance learning loop | Feed funnel + behavioral outcomes back into recommended next campaign | reporting/dashboard, analytics routes | Maybe | High | Requires history accumulated from all prior phases |

### SiteMint Personas (recommended taxonomy — data only)
New Website Inquiry · Website Redesign Lead · CRM / Automation Lead · SEO Lead · Local Business Owner · Nonprofit Organization · Real Estate Agent · Attorney / Law Firm · Homecare Business · Coach / Consultant · E-commerce Lead · Cold Prospect · Past Client · Referral Partner · Hot Discovery Form Lead · Non-responsive Discovery Lead

### SiteMint Campaign Topics (recommended taxonomy — data only)
Why your website is losing leads · What a CRM should automate · Website redesign checklist · SEO basics for local businesses · How AI automation saves admin time · Discovery call preparation · Proposal follow-up · Case study campaign · Maintenance plan nurture · Website launch checklist · Conversion-focused homepage tips · Booking system automation · Lead routing automation · Before/after website audit

---

## Suggested Future Phases

1. **Phase 24C — Behavioral Timeline UI** — Behavior Timeline card in SalesWorkspace; Lead DNA score panel; Intent Stage badge; event feed with score impact labels
2. **Phase 24D — Intent Stage System** — replace raw stage field with 10-bucket intent stage; dashboard panel showing distribution
3. **Phase 24E — Campaign Intelligence** — email objectives, desired behaviors, conditional routing (opened → path A, ignored → path B)
4. **Phase 24F — Sales Intelligence Recommendations** — "Call John today — Intent rose 38% this week" panel in CrmDashboard
5. **SMS Consent Management UI** — admin view for opt-in/opt-out status, consent history
6. **Campaign Scheduling** — schedule a campaign to send at a specific date/time
7. **Drip Sequence Builder** — multi-step email flows triggered by lead actions
8. **AI Copilot Drafting** — AI-assisted subject/body suggestions in the campaign builder
9. **Client Portal** — lead-facing status page for proposals and SOWs
10. **Executive Forecasting Dashboard** — revenue forecast, pipeline velocity, win-rate trends

---

## Which Modules Future Prompts May Touch

- **Campaigns** (`CrmCampaigns.tsx`, `crm.ts` campaign section, `campaignPersonalization.ts`, `crmCampaigns.ts` schema) — STABLE; future work: scheduling, drip sequences, A/B testing
- **Reporting** (`CrmReporting.tsx`) — additional metrics, charts
- **Dashboard** (`CrmDashboard.tsx`, `CrmExecutiveDashboard.tsx`) — new KPI tiles
- **Deals / Pipeline** (`CrmDeals.tsx`, `CrmPipeline.tsx`) — new stages or fields
- **Inbox** (`CrmInbox.tsx`) — read-side; do not touch send paths in `phone.ts`
- **Email Templates** (`CrmEmailTemplates.tsx`) — new template fields

## Which Modules Future Prompts Must NOT Touch (Unless Explicitly Requested)

- `routes/phone.ts` — entire file (Twilio webhooks)
- `lib/discEngine.ts` — DISC engine
- `lib/leadScore.ts` — Lead health engine
- `lib/communicationIntelligence.ts` — CI engine
- `lib/workflowEngine.ts` — Workflow engine


---

## Known Constraints

- **Email test mode**: if `CRM_EMAIL_TEST_MODE` env var is not set to `"false"`, all Resend sends are simulated (`testMode: true` in response).
- **Campaign send is synchronous**: `POST /campaigns/:id/send` sends all recipients in a single async loop; there is no real-time progress stream. Large lists may take several seconds.
- **Auth token is in-memory**: the session token changes on every API server restart. Frontend must re-login after a server restart.
- **Default admin password**: `sitemint2024` (overridable via `ADMIN_PASSWORD` env var).
- **Route ordering in `crm.ts`**: static routes (e.g. `/campaigns/test-send`) must appear BEFORE parameterized routes (e.g. `/campaigns/:id`) to avoid Express matching conflicts.
