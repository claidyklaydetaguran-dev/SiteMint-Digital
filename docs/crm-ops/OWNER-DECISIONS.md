# Decisions only the owner can make

Written 2026-09-16. Each item below is blocked on a judgement or a recurring
cost, not on work. Everything else in the release continues without them.

Where a price is quoted it was checked on 2026-09-16 and the source is named;
prices move, so confirm before committing.

---

## 1. Whether reminders fire on time — a recurring cost

**The situation.** The reminder engine, the signup worker and the delivery
queues run inside the api-server process. Web Asset Builder is an **Autoscale**
deployment (2 vCPU / 4 GiB, max 3, read from its own settings), and Autoscale
scales to zero. While nothing is serving traffic, nothing fires; the work
arrives late, in a burst, when something next wakes the process. No amount of
code fixes this.

| Option | Cost | What it means |
|---|---|---|
| **Reserved VM** (recommended) | from ~$15/month, smallest shared machine | Always on. Reminders fire when they are due. Changing deployment type needs an unpublish and publish, so it is a deliberate step, not a toggle. |
| Stay on Autoscale, drive the queue from outside | free to a few $/month | Something outside this deployment calls `POST /api/crm/operations/jobs/run` on a schedule. The route already exists and is permission-gated. A second system to maintain and to notice when it stops. |
| Accept late reminders | nothing | Then the product should say so where reminders are set, rather than implying a time it cannot keep. |

**Recommendation: the Reserved VM.** It is the only option that makes the
reminder engine's promise true without adding a second system, and $15/month is
small against one missed client follow-up.

## 2. E-signature provider — a recurring cost

Nothing in the CRM is a signature today, and every accepted proposal is
labelled `not_a_signature` on purpose. `docs/crm-ops/E-SIGNATURE-REQUIREMENTS.md`
has the full requirements: embedded signing inside the customer portal, webhooks
signed over the raw body, a downloadable audit trail, and a tamper-evident seal.

At SiteMint's volume (roughly 5–30 agreements a month):

| Provider | Entry cost | Notes |
|---|---|---|
| **SignWell** (recommended) | 25 API documents/month free, then ~$0.56 per document; Light plan $10/month | Embedded signing, webhooks, white-labelling. Cheapest at this volume by a wide margin. |
| **BoldSign** (runner-up) | from ~$30/month, 25 free envelopes/month, free sandbox | Stronger SDK/sandbox story; worth it if signing becomes central. |
| Dropbox Sign | from ~$75/month for 50 requests | Excellent docs; priced for higher volume than this. |
| Documenso (self-hosted) | free software | You own hosting, uptime and compliance. Cheapest in licence, dearest in attention. |

**Recommendation: SignWell**, reviewed again if volume passes ~50/month.
Sources: [SignWell's own API comparison](https://www.signwell.com/resources/best-esignature-api/),
[embedded e-signature API cost breakdown](https://signb.ee/blog/embedded-esignature-api-cost-calculator).

## 3. Where team notifications should go — free, but a choice

| Option | Requirement |
|---|---|
| **Slack** (recommended) | Incoming webhooks work on every plan including the free tier. Create them through a Slack app rather than the legacy custom integration, which is deprecated. Rate limit about one message per second. |
| Microsoft Teams | Classic incoming webhooks are retired; notifications now go through the Workflows (Power Automate) app, which needs the licensing that comes with. |
| Google Chat | Needs a Google Workspace account; each webhook is scoped to one space and cannot receive replies. |

**Recommendation: Slack**, with the CRM side built provider-neutral — a chat
destination is a URL plus a message shape — so Teams or Google Chat can be added
later without rework. Sources:
[Slack webhooks guide](https://hookdeck.com/webhooks/platforms/guide-to-slack-webhooks-features-and-best-practices),
[Teams Workflows webhooks](https://support.microsoft.com/en-us/teams/apps-service/create-incoming-webhooks-with-workflows-for-microsoft-teams),
[Google Chat webhooks](https://developers.google.com/workspace/chat/quickstart/webhooks).

## 4. Accounting — defer the connector, ship the export

QuickBooks Online and Xero both require a developer app review before a
production connection, which is weeks of calendar time for a feature nobody has
asked to use yet. Both import invoices and payments from CSV.

**Recommendation: ship a CSV export shaped for both**, and revisit a live
connector only if the manual step actually becomes a burden.

## 5. Two things that are simply yours to enter

Neither is a judgement; they are credentials and personal details that must not
pass through anyone else.

- **`SNAPSHOT_SOURCE`** and **`ADMIN_PASSWORD`** in Web Asset Builder's Secrets —
  see `DEPLOYMENT-BLOCKED.md` §3. The production backup and rehearsal cannot
  start without the first, and no owner account can be created without the
  second. Still absent as of 12:30 (Manila) on 2026-09-16.
- **Shasta's and Saisa's real email addresses**, when they are available. Their
  accounts are created by invitation from Settings once you have them; nothing
  else in the release waits on this, and their onboarding is tracked as pending
  rather than blocking.

Also yours, after the deploy: enrol two-step verification and confirm your
timezone at `/admin/crm/account`, and — for inbound email — create a Resend key
with **Full Access** (a sending-access key cannot read received mail) plus the
webhook signing secrets.
