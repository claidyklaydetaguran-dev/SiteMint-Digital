---
name: Communications Center product
description: Architecture decisions and gotchas for the Communications Center product (Product 1 of 7 in the SiteMint SaaS roadmap).
---

## What was built

`CrmCommunications.tsx` at `/admin/crm/communications` — tabbed product shell with 3 tabs:
1. **Conversations** — SMS + Calls thread view (30s poll, unread badges, SMS composer)
2. **Email Activity** — full table of all sent emails (from crm_activities type=email_sent)
3. **Templates** — inline template CRUD (create/edit/delete/seed defaults)

## Key API

`GET /crm/communications/email-activity` — added to crm.ts (NOT a new route file).
- Queries `crm_activities` WHERE type='email_sent', then batch-fetches leads by ID set.
- Uses `inArray(crmLeads.id, leadIds)` — NOT a SQL JOIN.
- **Why:** `leftJoin` is not imported in crm.ts. Batch fetch is clean and avoids import changes.
- Returns: `{ emails: Array<{id, leadId, leadName, leadEmail, subject, description, createdAt, metadata}>, total }`

## Nav changes

`CrmLayout.tsx` — added COMMUNICATIONS NavGroup (id: "communications") between home and sales:
- Communications Center → /admin/crm/communications
- Inbox (SMS & Calls) → /admin/crm/inbox (existing CrmInbox still works)
- Email Templates → /admin/crm/email-templates (still works independently)
- Scheduled Messages → /admin/crm/campaign-queue

`detectGroup` updated to map `/admin/crm/communications`, `/admin/crm/inbox`, `/admin/crm/email-templates` → "communications".

## What was preserved (not rebuilt)

- `CrmInbox.tsx` still lives at `/admin/crm/inbox` — untouched, fully stable
- `CrmEmailTemplates.tsx` still lives at `/admin/crm/email-templates` — untouched
- All phone.ts routes (LOCKED) — untouched

## What's still missing for full Communications Center product

- Unified thread view showing BOTH email + SMS in one timeline per lead
  (emails are in crm_activities, SMS in crm_messages — need DB unification or client merge)
- Email compose from Conversations tab (currently SMS-only composer)
- Voicemail, attachments, drafts, outbox
- Open/click/reply tracking per email in the activity view
- Conversation health score surface

## QA pass items (before freeze)

- Verify Conversations tab loads correctly with real Twilio data
- Verify Email Activity shows emails sent from SalesWorkspace
- Verify Templates CRUD works end-to-end (create/edit/delete/seed)
- Verify nav COMMUNICATIONS group auto-expands on /admin/crm/communications
- No React key warnings in browser console
