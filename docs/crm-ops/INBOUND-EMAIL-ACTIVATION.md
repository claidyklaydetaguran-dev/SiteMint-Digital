# Inbound email activation — what was established, and what is blocked

Owner authorised configuring Resend inbound on `reply.sitemintdigital.com`.
This records what was verified against the live systems on 2026-09-12, what
could not be obtained and why, and the exact remaining actions.

**Status: not activated. One hard blocker, one access blocker.**

---

## 1. What was verified against the live systems

All read-only. Nothing was written to DNS or to any provider.

| Fact | How it was established | Result |
|---|---|---|
| Authoritative DNS | `nslookup -type=NS sitemintdigital.com 8.8.8.8` | **name.com** — `ns1cny`, `ns2ckr`, `ns3jkl`, `ns4hny.name.com` |
| Apex mail routing | `nslookup -type=MX sitemintdigital.com 8.8.8.8` | **No MX records exist.** The query returns only the SOA. |
| Apex TXT | `nslookup -type=TXT sitemintdigital.com 8.8.8.8` | One record only: `replit-verify=…`. **No SPF record.** |
| Target subdomain | `nslookup -type=MX reply.sitemintdigital.com 8.8.8.8` | `NXDOMAIN` — does not exist yet |
| CRM API deployed? | `GET https://sitemintdigital.com/api/readyz` | **404.** `GET /` returns 200, so the site is up but the API is not reachable at that host. |

### Two of these change the plan

**There is no existing mail routing on this domain to preserve.** The
instruction was to protect the company's primary mail, and the honest finding is
that the apex carries no MX at all — so no mailbox anywhere is currently
receiving at `@sitemintdigital.com`. The dedicated subdomain is still the right
design and is what Resend requires when MX might ever be added to the apex, but
the risk this was guarding against does not presently exist. Worth knowing
before anyone plans company email separately.

**There is also no SPF record.** That is outside this task, but it means
outbound mail from this domain is currently unauthenticated. Flagging it rather
than fixing it, since it touches sending rather than receiving.

---

## 2. The blockers, precisely

### Blocker A — there is no deployed webhook destination (hard)

The instruction was explicit: *confirm the necessary application route is
deployed before activating delivery to it.* It is not.

The route exists in the code — `POST /api/crm/webhooks/resend/inbound` — but
`https://sitemintdigital.com/api/readyz` returns **404**, so the api-server is
not serving at that host. Pointing an MX record and a Resend subscription at a
destination that does not exist would mean mail is accepted by the provider and
then dropped, with the 30-day retention window running the whole time.

**Nothing about inbound email should be configured until the API is deployed and
`GET /api/readyz` returns 200 at a known URL.** That deployment is the
integration owner's, and is the same one the release package covers.

### Blocker B — provider and DNS credentials are not available here (access)

- No `RESEND_API_KEY` in this environment (checked by name; no value was read or
  printed).
- No name.com credentials.

### Blocker C — the MX target is dashboard-only

Resend does not publish the inbound MX value. Its own documentation says to
*"copy the MX record"* shown in the dashboard's Records tab, and the published
pages deliberately do not contain the value
([custom receiving domains](https://resend.com/docs/dashboard/receiving/custom-domains),
[avoiding MX conflicts](https://resend.com/docs/knowledge-base/how-do-i-avoid-conflicting-with-my-mx-records)).

**It was therefore not guessed.** A plausible-looking MX target that is wrong
fails silently — mail is accepted by whoever does own that host, or bounces —
which is exactly the outcome the "do not guess DNS targets" instruction exists
to prevent. The value must be read from the dashboard by whoever holds the
account.

---

## 3. The exact remaining actions

In order. Steps 2–4 are one sitting; step 1 gates all of them.

**1. Deploy the API.** Any host is fine; record the base URL. Confirm with
`curl -s -o /dev/null -w '%{http_code}' https://<host>/api/readyz` → `200`.

**2. In Resend → Domains, add the receiving domain** `reply.sitemintdigital.com`.
Resend shows one MX record. Copy it exactly — host, target and priority.

**3. In name.com DNS for `sitemintdigital.com`, add that one MX record** with
host `reply`. Do not touch the apex, and do not add MX to the apex.

Verify before going further:

```bash
nslookup -type=MX reply.sitemintdigital.com 8.8.8.8
```

It must return the Resend target. Propagation is usually minutes; the zone's
default TTL is 3600s. Re-check the apex is still MX-free (or unchanged, if mail
has been set up by then):

```bash
nslookup -type=MX sitemintdigital.com 8.8.8.8
```

**4. In Resend → Webhooks, add an endpoint** at
`https://<host>/api/crm/webhooks/resend/inbound` subscribed to **`email.received`**.
Copy the signing secret that endpoint is given.

> A webhook endpoint gets **its own** signing secret. If the existing
> `RESEND_WEBHOOK_SECRET` (used for sending events) is reused here, every
> inbound request fails verification. The code reads
> `RESEND_INBOUND_WEBHOOK_SECRET` first and only falls back to the sending
> secret, so set the inbound-specific one.

**5. Set three variables** in the deployed environment's secret store — never in
a file, never in the frontend build, never in chat:

| Variable | Value |
|---|---|
| `CRM_INBOUND_EMAIL_DOMAIN` | `reply.sitemintdigital.com` |
| `RESEND_INBOUND_WEBHOOK_SECRET` | the secret from step 4 |
| `RESEND_API_KEY` | the existing Resend key (already required for outbound) |

Restart, then check the application's own readiness report:

```bash
curl -s https://<host>/api/crm/email/inbound/status
```

It returns `configured: true` only when all three are present, and otherwise
names the one that is missing.

---

## 4. Verification once it is live

The controlled test mailbox is **claidyklaydetaguran@gmail.com**, which the
owner nominated for this purpose. No customer address is used.

1. **Signature enforcement first.** POST unsigned JSON to the webhook path; it
   must be rejected. Then POST with a tampered signature; also rejected. Only
   then trust anything that arrives.
2. **Send** a message from the CRM to the test mailbox. Confirm the `Reply-To`
   is a `c-<token>@reply.sitemintdigital.com` address — correlation is on that
   minted token, never on the `From` header, because Resend exposes no SPF/DKIM
   verdict and `From` is an unauthenticated claim.
3. **Reply** from the test mailbox.
4. Confirm the reply appears on the **same conversation**, attributed inbound,
   with no invented sender.
5. Reply again from a *different* mailbox with no token; confirm it lands in the
   unmatched queue for review rather than being guessed onto a thread.
6. Confirm nothing auto-replies — loop protection.

---

## 5. What is already done and needs nothing further

- Ingestion, two-key deduplication (delivery id and message id), body persisted
  at ingest because Resend retains content only 30 days, reply-token
  correlation, the unmatched queue, bounce and complaint suppression, and
  reply-loop protection — all implemented and covered by
  `crmEmailInbound.test.ts`.
- `CRM_INBOUND_EMAIL_DOMAIN` and `RESEND_INBOUND_WEBHOOK_SECRET` are now
  registered in `envContract.ts`, so a deployment missing them is reported at
  boot rather than discovered when a client's reply vanishes.

The code is ready. What is missing is a deployed destination and two
credentials.
