# Google Calendar for ordinary customers — what is ready, and the one thing that is not

Written 2026-09-18. Every value below was read from the live deployment or the
live Google Cloud console, not from an earlier report. Nothing here has been
applied: the console refuses every write until §4 is done.

## 1. The project, confirmed

The OAuth client the deployed staging app actually uses was read back from the
authorize URL the running app generates (`POST /api/receptionist/calendar/
google/start`), so it is the client in use, not the one a document claims:

| | |
| --- | --- |
| Client id | `957911641063-777tpn5fl8...apps.googleusercontent.com` |
| Google Cloud project | **`sitemint-staging`** (number **957911641063**) |
| Project owner account | **sitemint.staging@gmail.com** |
| Staging redirect URI | `https://site-mint-voice-staging.replit.app/api/receptionist/calendar/google/callback` |
| `access_type` / `prompt` | `offline` / `consent` — a refresh token is requested |

Console state, re-read 2026-09-18:

| Setting | Value |
| --- | --- |
| User type | External |
| Publishing status | **Testing** |
| OAuth user cap | 2 test users / 100 |
| Test users | claidyklaydetaguran@gmail.com, sitemint.staging@gmail.com |
| Branding | app name, logo, home page, privacy link, terms link, authorized domain — **all empty** |
| Verification | "not required since your app is in Testing" |

**`claidytaguran2@gmail.com` is not a test user.** That, and only that, is why
the owner's connection attempt was refused. It is not an application defect.

## 2. Scopes — already minimal, and why each is needed

Read from the running app (`lib/calendar/googleOAuth.ts`), unchanged by this
work. These are the justifications to paste into the verification form; each
names a Calendar operation the product actually performs.

| Scope | Why it is needed | What it does NOT allow |
| --- | --- | --- |
| `calendar.freebusy` | Read busy/free windows on the calendar the business picks, so the receptionist never offers a time the business is already booked for. | Reading any event's title, guests, location or description. |
| `calendar.events` | Create the event when the business accepts an appointment, and update or remove it when the appointment is moved or cancelled. | Reading or changing events SiteMint did not create, on any other calendar. |
| `calendar.calendarlist.readonly` | List the calendars the account holds, so the business can choose which one appointments land in. Without it the product can only ever write to `primary`. | Event content of any kind — it returns calendar names and access roles only. |

No broader scope (`calendar`, `calendar.readonly`) is requested, and none
should be added to clear an error.

## 3. Branding values — real pages only

Every URL below returns 200 on the live site today (checked 2026-09-18). None
of this is drafted or aspirational, and none of it asserts that a lawyer has
reviewed anything.

| Field | Value to enter |
| --- | --- |
| App name | `SiteMint AI Receptionist` |
| User support email | `sitemint.staging@gmail.com` (owner may prefer a support address on the domain) |
| Application home page | `https://sitemintdigital.com` |
| Application privacy policy link | `https://sitemintdigital.com/privacy` |
| Application terms of service link | `https://sitemintdigital.com/terms` |
| Authorized domain | `sitemintdigital.com` |
| Developer contact | `sitemint.staging@gmail.com` |
| App logo | not yet supplied — see the note below |

**Logo.** Uploading one forces verification even while in Testing, so it should
be uploaded in the same pass as publishing, not before. Needs a square
120×120 PNG/JPG/BMP under 1 MB.

**A caution the console states itself:** the privacy policy must be reachable
at a URL on the authorized domain and must describe what is done with Google
user data. `https://sitemintdigital.com/privacy` exists and is public; whether
its wording covers Calendar data specifically is an owner/legal decision, not
something this document certifies.

## 4. The blocker — one owner action, no codes to share

Reads of the project succeed. The first **write** — adding a test user —
redirected to:

```
console.cloud.google.com/enable-mfa
"Google Cloud access blocked. Effective September 16, 2026, Google Cloud has
 begun to enforce 2-step verification (2SV) ... Go to your security settings
 to turn on 2-step verification."
```

Re-tested 2026-09-18: still blocking. Until 2SV is enabled on
**sitemint.staging@gmail.com**, nothing in the Google configuration can be
changed — not a test user, not branding, not publishing, not a new client.

**What the owner does:** sign in as sitemint.staging@gmail.com → Google Account
→ Security → 2-Step Verification → turn on. Then say so. Nobody needs to send
anyone a password, a one-time code, or a recovery code, and this session will
never ask for one.

## 5. What happens the moment 2SV is on — in order

1. **Add `claidytaguran2@gmail.com` as a test user** (staging aid, 30 seconds).
   This alone unblocks the owner's own calendar connection on staging, which
   in turn unblocks the "booking actually reaches a calendar" test. It is not
   the public-launch answer.
2. **Complete Branding** with §3's values.
3. **Publish app** → status becomes *In production*. External + published means
   any Google account can start the flow. It does **not** mean verified.
4. **Submit verification** for the three sensitive scopes in §2, with a demo
   video against labelled test data. Google reviews this; submission is not
   approval, and the timeline is Google's.
5. **Create the production OAuth client** (separate from staging's, which stays
   exactly as it is):
   - Authorized redirect URI:
     `https://sitemintdigital.com/api/receptionist/calendar/google/callback`
   - JavaScript origins: **none** — the flow is a server-side redirect; the
     browser never holds the client secret or calls Google directly.
6. **Set production secrets** on Web Asset Builder: `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`,
   `CALENDAR_CONNECT_ENABLED=true`, `CALENDAR_WRITE_ENABLED=true`.
   **`CALENDAR_TOKEN_KEY` is already set and must not be rotated** — it
   decrypts tokens already stored; a new key silently breaks every existing
   connection.

## 6. Production must not depend on approval it does not have

Until step 4 is approved, an unverified published app shows Google's
"unverified app" interstitial to ordinary customers. Two honest options, and
the product already behaves correctly in both:

- **Leave `CALENDAR_CONNECT_ENABLED` unset in production.** The dashboard says
  the calendar is not connected, appointments become requests, and the
  receptionist tells callers "requested, not confirmed" — all true, all already
  implemented. Nothing misleads anyone.
- **Turn it on while unverified.** Customers reach a Google warning screen.
  They must never be coached past it.

The product must not be released in a state where a customer is told their
calendar is connected when it is not. It currently cannot be: connection state
is read from `scheduling_calendar_connections`, not from a flag.
