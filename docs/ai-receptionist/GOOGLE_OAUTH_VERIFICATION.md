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

1. **A production OAuth app.** The production host is decided (2026-09-16):
   `sitemintdigital.com`, served by the Web Asset Builder deployment. So the
   OAuth client's redirect URI is exactly
   `https://sitemintdigital.com/api/receptionist/calendar/google/callback`,
   and the app is a NEW Google Cloud project, leaving `sitemint-staging`
   untouched. **Blocked**: creating a project under
   `claidyklaydetaguran@gmail.com` stops at Google Cloud's Terms of Service,
   which only the owner may accept. *Owner: accept the terms, or name the
   Google account that should own the production app.*
2. **Verified domain ownership** of `sitemintdigital.com` in Google Search
   Console, added as an authorized domain. A domain property was added under
   `claidyklaydetaguran@gmail.com` on 2026-09-16, and its
   `google-site-verification` TXT record is saved in the domain's Replit-managed
   zone alongside the existing `replit-verify` TXT (nine records; nothing else
   changed). Google had not confirmed it at the time of writing — DNS changes
   take time to spread — so the check is re-run until it passes. The same
   account must own the OAuth project, or be added to the property, for the
   authorized-domain check to see the verification.
3. **Home page** on that domain describing the AI Receptionist and linking to
   the privacy policy.
4. **Privacy policy** on that domain that states, specifically, what Google
   user data is accessed (free/busy intervals, SiteMint-created events, the
   calendar list), why, how it is stored (encrypted refresh token; no event
   contents stored beyond SiteMint's own appointment records), retention and
   deletion (disconnect removes the stored token), and that it is not sold or
   used for advertising — the Google API Services User Data Policy "Limited
   Use" disclosure. A section saying exactly that was drafted on 2026-09-16
   (`artifacts/web-agency/src/pages/LegalPrivacyV3.tsx`, written from the code:
   the three scopes, AES-256-GCM token storage, tokens cleared on disconnect).
   It is NOT published: the marketing site ships from its own release.
   *Owner: `/privacy` and `/terms` are drafts awaiting legal sign-off.*
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

**Publishing status and verification status are separate**, and neither implies
the other. An app can be moved from Testing to In production without being
verified; what verification adds is the removal of the unverified-app warning
and of the user cap that applies to sensitive scopes. Both tracks are listed
separately below and neither is reported as done because the other is.

| Track | Status | Next action | Who |
|---|---|---|---|
| Staging OAuth (Testing) | Working, 3 scopes granted, verified live 2026-09-15 | Reconnect when access is withdrawn | Business (you) |
| Production OAuth app | Not created — blocked on Google Cloud Terms of Service for the owner's account | Accept the terms, or name the owning Google account | Owner |
| Production publishing status (Testing → In production) | Not applicable yet; no production app exists | Decide once the app exists; independent of verification | Owner |
| Domain verification | Property added; TXT record saved in the zone 2026-09-16; Google has not confirmed it yet | Re-run the check until it passes | SiteMint |
| Privacy policy / terms | Google Calendar and Limited Use section drafted in source, not published; legal sign-off pending | Approve wording, then a marketing release publishes it | Owner |
| Demo video | Not recorded | Record on production host once 1–5 exist | SiteMint |
| Google verification submission | Not submitted | Submit after 1–8 | Owner (project owner account) |
| Google review | — | Google's review can take weeks; track in the Verification Center | Google |
