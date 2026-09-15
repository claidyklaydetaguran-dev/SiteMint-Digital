# Google OAuth — current state and verification packet

Prepared 2026-09-15. Tracks Google verification separately from production
publishing: either can be finished while the other is still pending, and
neither implies the other.

## 1. What exists today (read from the Google Auth Platform, not assumed)

| Item | Value |
|---|---|
| Google Cloud project | `sitemint-staging` (957911641063) — the **only** project on either Google account |
| Project owner account | `sitemint.staging@gmail.com` |
| App name | SiteMint AI Receptionist (Staging) |
| User type / publishing status | External / **Testing** |
| Test users | 2 of 100 — `claidyklaydetaguran@gmail.com`, `sitemint.staging@gmail.com` |
| User support / developer contact | `sitemint.staging@gmail.com` |
| Application home page | **empty** |
| Privacy policy link | **empty** |
| Terms of service link | **empty** |
| Authorized domains | one entry (the staging Replit host) |
| Verification status | "Verification is not required since your app is in Testing status" |

Google will not let this app leave Testing until the Branding page has a home
page, privacy policy and terms link. No production OAuth client exists.

## 2. Scopes the product actually requests

From `artifacts/api-server/src/lib/calendar/googleOAuth.ts`, requested with
`access_type=offline`, `prompt=consent`, PKCE:

| Scope | Classification | Where it is used | What SiteMint does with it |
|---|---|---|---|
| `https://www.googleapis.com/auth/calendar.freebusy` | Sensitive | `PerFirmGoogleFreeBusyProvider.ts` | Reads busy/free intervals on the chosen calendar so offered appointment times never collide with existing commitments. No event titles, attendees or descriptions are read. |
| `https://www.googleapis.com/auth/calendar.events` | Sensitive | `eventWriter.ts` | Creates, moves and deletes only the events for appointments the business approves (each stamped with a SiteMint iCalUID), and looks one up by that iCalUID to resolve an uncertain write. |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | Sensitive | `calendarList.ts` | Lists the account's calendars so the business can choose which one receives appointments; read-only calendars are shown but cannot be selected. |

Full calendar access (`auth/calendar`) is never requested, and a committed
contract test (`calendarOauthSecurity.test.ts`) fails if it ever is.

## 3. Token lifetime and reconnect — what is and is not known

Google documents that a refresh token issued to an app in **Testing** status
with External user type, requesting scopes beyond name/email/profile, **expires
after seven days**. Two things follow, and one does not:

- A connection made or re-consented while the app is in Testing should be
  expected to stop working about a week later.
- The product already handles that outcome: the next use receives
  `invalid_grant`, the connection is marked withdrawn, and the Calendar page
  says access was withdrawn and offers the same reconnect button. Events
  already written stay where they are.
- **Not established:** the exact expiry moment of the current connection. A
  re-consent date shows a consent screen was completed; it is not proof that a
  replacement refresh token was issued or when. Expiry is therefore reported as
  "expected within about seven days of the last token issue" and is confirmed
  only by observing the withdrawn state, never predicted as a date.

Publishing the app to Production removes the seven-day Testing limit (tokens
then follow the normal rules: revocation, password change for Gmail scopes,
six months unused, the 100-refresh-token-per-client limit).

## 4. Verification packet — what must exist before submitting

Google's sensitive-scope verification requires all of the following. Items
marked **owner** need a decision or an account action SiteMint cannot take on
its own.

1. **A production OAuth app** (new project or the existing one renamed without
   "(Staging)"), with its OAuth client's redirect URI on the production host:
   `https://<production host>/api/receptionist/calendar/google/callback`.
   *Owner: which host is production — see the production-target decision in the
   ledger.*
2. **Verified domain ownership** of `sitemintdigital.com` in Google Search
   Console, added as an authorized domain. *Owner: Search Console access for the
   domain's DNS.*
3. **Home page** on that domain describing the AI Receptionist and linking to
   the privacy policy.
4. **Privacy policy** on that domain that states, specifically, what Google
   user data is accessed (free/busy intervals, SiteMint-created events, the
   calendar list), why, how it is stored (encrypted refresh token; no event
   contents stored beyond SiteMint's own appointment records), retention and
   deletion (disconnect removes the stored token), and that it is not sold or
   used for advertising — the Google API Services User Data Policy "Limited
   Use" disclosure. *Owner: `/privacy` and `/terms` are drafts awaiting legal
   sign-off.*
5. **Terms of service** on that domain.
6. **App branding**: name "SiteMint AI Receptionist", a logo (uploading one
   requires verification of the branding itself), support email on a monitored
   inbox.
7. **Scope justification** — the three rows in §2, submitted per scope.
8. **Demonstration video** (unlisted YouTube), showing on the production host:
   the consent screen with the app name and all three scopes; choosing a
   calendar (calendarlist.readonly); a test booking showing offered times
   avoiding a busy block (freebusy); approving it and the event appearing in
   Google Calendar, then cancelling it and the event disappearing (events);
   disconnecting.

## 5. Status tracking

| Track | Status | Next action | Who |
|---|---|---|---|
| Staging OAuth (Testing) | Working, 3 scopes granted, verified live 2026-09-15 | Reconnect when access is withdrawn | Business (you) |
| Production OAuth app | Not created | Create after the production host is decided | SiteMint + owner |
| Domain verification | Not started | Search Console for `sitemintdigital.com` | Owner |
| Privacy policy / terms | Drafts, legal sign-off pending | Approve wording, publish on domain | Owner |
| Demo video | Not recorded | Record on production host once 1–5 exist | SiteMint |
| Google verification submission | Not submitted | Submit after 1–8 | Owner (project owner account) |
| Google review | — | Google's review can take weeks; track in the Verification Center | Google |
