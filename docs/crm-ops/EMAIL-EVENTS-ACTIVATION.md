# Delivery and engagement events — activation

What to create in Resend, which variable holds which secret, and how to prove
it works. This covers mail the CRM **sends**; received mail is a different
endpoint with a different secret and its own document
(`INBOUND-EMAIL-ACTIVATION.md`).

Everything here is configuration and verification. The code is committed and
inert until the endpoint exists: with no secret set, `POST /api/crm/webhooks/resend`
answers **503**, no delivery state is ever recorded, and every engagement
figure reports "not measured" rather than zero.

---

## 1. What this turns on

| Before | After |
|---|---|
| A send recorded "the provider accepted this and returned an id" — the weakest true statement available. | Every message carries its provider state: Sent → Delivered, Delayed, Bounced, Marked as spam, Failed, Blocked. |
| A bounce ten seconds later left no trace on the record it belonged to. | A bounce or complaint suppresses the address **and** shows on the message, the ticket, the campaign and the reminder it came from. |
| An unknown send outcome waited for a person forever. | A `delivered` event resolves it automatically — the one thing that is evidence rather than inference. |
| Opens and clicks were reported as untracked, because nothing wrote one. | Opens and clicks are counted per recipient, with the links, wherever the provider is actually tracking them. |

---

## 2. Create the endpoint

**1. Deploy the API** and confirm it answers:

```bash
curl -s -o /dev/null -w '%{http_code}' https://<host>/api/readyz    # 200
```

**2. Resend → Webhooks → Add endpoint**

| Field | Value |
|---|---|
| URL | `https://<host>/api/crm/webhooks/resend` |
| Events | `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.opened`, `email.clicked` |

Subscribe to **all eight**. Each one is understood and recorded; the state a
message is shown in is derived from whichever of them have arrived, so leaving
one out only removes an answer. `email.suppressed` is also understood if the
account emits it. **Do not subscribe `email.received` here** — it belongs to
the inbound endpoint. If it arrives anyway it is stored, ignored, and the
reason says so rather than failing quietly.

**3. Copy that endpoint's signing secret** (`whsec_…`).

**4. Set it in the deployed environment's secret store** — never in a file,
never in the frontend build, never in chat:

| Variable | Holds |
|---|---|
| `RESEND_WEBHOOK_SECRET` | the signing secret of the **delivery/engagement** endpoint above |
| `RESEND_INBOUND_WEBHOOK_SECRET` | the signing secret of the **inbound** endpoint (`…/resend/inbound`) |
| `RESEND_RECEIVING_API_KEY` | a full-access key, used only to read received mail |
| `RESEND_API_KEY` | the sending key |
| `RESEND_FROM_EMAIL` | the sending identity; its **domain** is where tracking is configured |
| `CRM_EMAIL_TEST_MODE` | must be the exact string `false` before anything is really sent |

**A signing secret is per endpoint.** Two endpoints, two secrets: reusing one
for the other makes every request to it fail verification with a 400. The
delivery endpoint reads `RESEND_WEBHOOK_SECRET` and has **no fallback**.

Restart, then:

```bash
curl -s https://<host>/api/crm/email/events/status   # requires a CRM session
```

`configured: true` means the secret is present. It does not yet mean anything
has arrived — that is what `eventsReceived` and §4 are for.

---

## 3. Turn on open and click tracking

Tracking is configured **per sending domain** and needs a verified tracking
subdomain; without one, no `email.opened` or `email.clicked` event is ever
emitted, however the webhook is subscribed.

1. **Resend → Domains → your sending domain → Configuration**.
2. Under *Enable tracking metrics*, choose a tracking subdomain (for example
   `links.sitemintdigital.com`) and switch on open tracking and click tracking.
3. Publish the CNAME record Resend shows, and verify it.

What each one costs, stated plainly because both change what recipients get:

- **Open tracking** inserts a 1×1 transparent image. Apple Mail Privacy
  Protection and corporate scanners load it automatically, so opens are
  inflated and an open is never proof a person read anything. The CRM says this
  beside every open figure it shows.
- **Click tracking** rewrites every link in the HTML to point at the tracking
  subdomain. Links in sent mail therefore no longer read as your own domain.

The CRM never reports these as `0`. Until an open or a click has actually been
recorded for the sending domain, the figures read **"Not measured — open/click
tracking isn't enabled for this sending domain"**. That is deliberate: a zero
claims we looked.

---

## 4. Verification checklist

Run these in order. Each one fails loudly if the previous step is wrong.

**1. A signed test event is accepted.** Resend → Webhooks → your endpoint →
*Send test event* (or replay any past event). Then:

```bash
curl -s "https://<host>/api/crm/email/events?limit=5"
```

The event appears with its type, `state: "processed"`, and a `matchStatus`.
`unmatched` is the expected answer for a test event — it is about a message the
CRM never sent — and is not an error.

**2. A tampered request is refused.** Any unsigned or altered request must be
refused before anything is written:

```bash
curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H 'svix-id: msg_fake' -H 'svix-timestamp: 1789567890' \
  -H 'svix-signature: v1,bm90LWEtcmVhbC1zaWduYXR1cmU=' \
  -d '{"type":"email.delivered","data":{}}' \
  https://<host>/api/crm/webhooks/resend          # 400
```

`GET /api/crm/email/events` must show **no new row** afterwards.

**3. A replay is ignored.** Replay the same event from the Resend dashboard.
The response is `200` with `duplicate: true`, and the event list still shows
**one** row for it. (200, not 4xx: a duplicate is the provider's retry working
as designed, and refusing it makes the provider keep retrying.)

**4. A real send moves Sent → Delivered.** With `CRM_EMAIL_TEST_MODE=false`,
send one email to a mailbox you control — the CRM's contact composer is the
simplest. In the Inbox thread the message shows **Sent**, and within a minute
or two it becomes **Delivered** with the provider's timestamp. Same message in
`GET /api/crm/email/events`: an `email.sent` and an `email.delivered`, each
`matched` to `{"kind":"message","id":…}`.

**5. An open and a click appear.** Open that email in the test mailbox and
click a link in it. `email.opened` and `email.clicked` arrive within seconds.
For a marketing campaign the same two events reach
`GET /api/crm/marketing/campaigns/:id/results`, where `engagement.tracked`
becomes true, and the clicked link appears with its count. In **Reporting**,
"Campaign emails opened" and the open rate stop reading *not measured*.

**6. A bounce suppresses the address.** Send to Resend's own bounce simulator,
`bounced@resend.dev`. The message shows **Bounced**, and the address appears in
`GET /api/crm/email/suppressions` — after which the CRM refuses to mail it
again.

**7. Nothing is stuck.** `GET /api/crm/email/events/status` shows
`processing.failed: 0`. An event whose interpretation failed keeps its payload
and is retried by the scheduler; `POST /api/crm/email/events/:id/retry` runs it
again immediately, with no signature involved.

---

## 5. What to expect afterwards

- **`unmatched` events are normal.** Mail sent from another system on the same
  domain, or a record deleted since, produces events nobody here owns. The
  count is on the status endpoint so "412 received, 408 matched" is answerable.
- **Delivery state is derived from the events, never stored beside them.** A
  late `email.sent` arriving after its `email.delivered` changes nothing, and
  an asynchronous bounce after a delivery correctly reads as bounced.
- **An unknown send outcome is only ever improved.** A `delivered` event
  resolves it; nothing an event says turns an unknown outcome into a failure or
  starts an automatic retry. `DELIVERY-GUARANTEE.md` is the authority and is
  unchanged by this.
- **Events are stored before they are interpreted.** Resend retries a failed
  delivery eight times over roughly a day and then the event is gone, so the
  webhook's only job is to verify and write; everything else is retried from
  the stored row by this server.

---

## 6. Where this is implemented

| | |
|---|---|
| Signature verification | `artifacts/api-server/src/lib/svixSignature.ts` |
| Intake, matching, processing | `artifacts/api-server/src/lib/emailProviderEvents.ts` |
| Delivery state and engagement wording | `artifacts/api-server/src/lib/emailDeliveryState.ts` |
| The record tag on every outbound email | `artifacts/api-server/src/lib/emailRefs.ts` |
| Routes | `artifacts/api-server/src/routes/crmEmailEvents.ts` |
| Schema and reviewed DDL | `lib/db/src/schema/crmEmailEvents.ts`, `docs/crm-ops/schema/M6-email-provider-events.sql` |
| Tests | `artifacts/api-server/src/routes/crmEmailEvents.test.ts`, `src/lib/svixSignature.test.ts`, `src/lib/emailDeliveryState.test.ts` |
