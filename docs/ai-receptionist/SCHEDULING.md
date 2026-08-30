# Scheduling / Visual Availability Calendar

> Checkpoint B of the appointment-scheduling feature. Last updated: 2026-07-28.

## Phasing

| Checkpoint | Scope | Status |
|---|---|---|
| A | Visual calendar, availability settings, server-side availability engine, in-memory Development store, sanitized fixtures. No real calendar, no real appointments. | **Done** |
| B | Durable per-firm storage, read-only Google Calendar free/busy, public scheduling page. No calendar writes, no booked records, no messages sent. | **Done** |
| C | Create/reschedule/cancel Development appointments with authoritative provider confirmation and double-booking protection. | Not started — requires owner approval |
| D | Vapi Development assistant checks availability and books only after explicit caller confirmation. | Not started — requires owner approval |

Checkpoint B intentionally does **not**: create, update, or delete a Google Calendar event; mark any request `booked`; send SMS or email; send a scheduling link; touch Production; change Stripe; or request Google write access.

## Durable schema (Checkpoint B)

Five tables, versioned-migration-only, mirroring the voice-platform precedent
(`lib/db/src/schema/voice/`, ADR-05 in `DATABASE_STRATEGY.md`) — kept out of
the shared push-mode schema barrel so `drizzle-kit push` can never touch
them:

- `scheduling_availability_settings` — one row per firm (timezone, notice/
  advance-window/buffer/daily-limit defaults, opaque `public_slug`).
- `scheduling_weekly_hours` — firm + weekday rows. The schema supports
  multiple windows per weekday; the current admin UI and availability
  engine only read the **first enabled row per weekday** (known limitation —
  see below).
- `scheduling_appointment_types` — firm-scoped, with `active` (soft-delete)
  and `public` (selectable on the public page) flags.
- `scheduling_blocked_periods` — arbitrary start/end ranges (partial-day or
  all-day); `internal_label` is never exposed publicly. The Availability
  Settings "Blocked dates" list is backed by all-day rows here.
- `scheduling_appointment_requests` — `id` (serial) is internal-only and
  never sent to any client; `public_id` (uuid) is the only identifier ever
  exposed, admin or public. A CHECK constraint enforces
  `status <> 'booked' OR (provider_event_id IS NOT NULL AND provider_calendar_id IS NOT NULL)`
  — belt-and-suspenders on top of the fact that no Checkpoint B code path can
  ever set `status = 'booked'`.

Migration: `lib/db/drizzle/scheduling/0000_superb_rhodey.sql`, generated via
`drizzle.scheduling.config.ts` (`pnpm --filter @workspace/db run
generate:scheduling` / `migrate:scheduling`). Manual rollback SQL:
`lib/db/drizzle/scheduling-rollback/0000_superb_rhodey_rollback.sql` (drops
the five tables in dependency order; never auto-applied). No backfill — the
Checkpoint A in-memory sample data was fixture-only and was not migrated.

## Repository (replaces the Checkpoint A in-memory store)

`artifacts/api-server/src/lib/scheduling/schedulingRepository.ts` is the only
thing that reads/writes these tables. Every function requires an explicit
`firmId` and every query is scoped by it — no lookup by record id alone.
`buildAvailabilityConfig(firmId)` assembles the pure engine's
`AvailabilityConfig` from the durable tables on every call (no
process-memory cache), so a value read after a server restart came from
Postgres, not from anything left over in memory.

**Concurrency**: `createHold` and `submitAppointmentRequest` each run inside
one Postgres transaction that takes `pg_advisory_xact_lock(firmId, hash(slot
start))` before rechecking availability and inserting. Two concurrent
requests for the identical slot are serialized by Postgres itself; the
loser's recheck sees the winner's already-committed row and gets an honest
409, never a second silent booking. Verified under real concurrency (two
simultaneous submissions for the same slot via `Promise.all`) in
`schedulingRepository.dbcheck.ts`.

**Which statuses block availability** (documented rule, Step 7 of the
checkpoint spec): `held`, `pending_review`, and `booked` all reserve
capacity; `cancelled`, `failed`, and `expired` never do. `pending_review`
blocking was chosen (not just `held`) because that's the only way to prevent
two visitors from both getting a "Pending review" result for the same time —
the same rule Checkpoint A used, now enforced by a real transaction instead
of single-process memory.

**Known limitation**: `scheduling_weekly_hours` supports multiple windows
per weekday (e.g. a split morning/afternoon shift), but the current admin UI
only edits one window per day, and `buildAvailabilityConfig` only reads the
first enabled row per weekday. Extending both to multi-window is future work,
not needed by anything built so far.

## Read-only Google Calendar free/busy

`artifacts/api-server/src/lib/calendar/` defines a provider-neutral
`FreeBusyProvider` interface (mirroring `VoiceProvider`) with two
implementations:

- `NullFreeBusyProvider` — the default in every environment. Never throws,
  never blocks availability, returns `[]`. This is the **honest fallback**
  whenever no calendar is connected, exactly as required.
- `GoogleFreeBusyProvider` — calls Google's `calendar/v3/freeBusy` REST
  endpoint directly (no new SDK dependency) for exactly one Development
  calendar, configured entirely by environment variables:
  `GOOGLE_CALENDAR_DEV_ACCESS_TOKEN`, `GOOGLE_CALENDAR_DEV_CALENDAR_ID`,
  `GOOGLE_CALENDAR_DEV_FIRM_ID`. Scope:
  `https://www.googleapis.com/auth/calendar.freebusy` — Google's narrowest
  available scope for this endpoint; it grants no read, create, update, or
  delete access to any actual event. Only `{ start, end }` busy ranges are
  ever read from the response (no titles, attendees, descriptions,
  locations, or calendar IDs), and the raw response is never logged.

`CALENDAR_PROVIDER=google` (env var) opts into the Google provider; anything
else — including unset, the default everywhere — uses
`NullFreeBusyProvider`. Selected once via `getFreeBusyProvider()` in
`lib/calendar/index.ts`, no auto-registration.

**No token storage**: credentials are read from environment variables at
request time only, the same convention this codebase already uses for every
other third-party credential (`VAPI_API_KEY`, `INTAKE_TWILIO_AUTH_TOKEN`,
etc.) — never written to a database table, never logged. No OAuth consent
flow, refresh-token handling, or token persistence is implemented; this
repository has no established secure-token-storage pattern to build on, and
the checkpoint's own instructions say to stop before storing tokens if one
can't be verified, so none was built.

**This environment specifically**: this checkpoint was carried out from a
Claude Code Remote container with this repository git-cloned, not an actual
Replit workspace — there is no Replit connector, and no
`GOOGLE_CALENDAR_DEV_*` variables are configured here. `isConnected()`
therefore honestly reports `false` in this environment (verified: see
"Google Calendar (read-only)" section of Availability Settings, which reads
"Not connected. Availability is calculated from the rules below only."). The
free/busy-merging code path, response parsing, and privacy filtering are
implemented and unit-tested (`FreeBusyProvider.test.ts`) against a
constructed response; a genuine live free/busy call was not exercised end to
end because no real Development Google Calendar credentials exist in this
environment. Connecting one for real (provisioning the OAuth consent and the
three env vars) is the next actionable step before Checkpoint C.

**Merging into availability**: Google busy ranges, durable manual blocked
periods, and durable appointment requests are all flattened into the same
`ExistingBooking { startUtc, endUtc }` shape the pure engine already accepted
in Checkpoint A (`getBookingsForAvailability` in `schedulingRepository.ts`)
— the engine itself never changed to support any of this.

## Public scheduling page

Route: `/schedule/:slug` (e.g.
`/ai-receptionist/dashboard/schedule/<32-hex-char-slug>` given this SPA is
only served under the `/ai-receptionist/dashboard` base path — see
`CLAUDE.md`; a bare root-level `/schedule/:slug` would need a separate static
entry point, which is out of scope here). No login, no session cookie, no
dashboard chrome. The slug is a server-generated 32-hex-character opaque
value (`newPublicSlug()`, `crypto.randomUUID()` with dashes stripped) — never
derived from the firm's internal id or name, and unresolvable slugs (bad
shape, unknown, or not yet enabled) all get the identical generic 404, so the
endpoint can't be used to enumerate firms.

Backend: `artifacts/api-server/src/routes/publicScheduling.ts`
(`/api/public/schedule/:slug/*`), unauthenticated, protected by its own
`SlidingWindowLimiter` (20/hour/IP, separate from every other limiter in this
codebase), a honeypot field, and a minimum-completion-time check — the same
pattern as `discoveryV1Protection.ts`. Every response is scoped to exactly
the firm resolved from the slug: firm name, timezone, and only `public: true,
active: true` appointment types — never an internal firm id, another firm's
data, or a private calendar-event field. Submission always lands as
`pending_review`; the response is the literal sentence *"Your appointment
request was received and is pending review. It is not booked yet."* — never
"confirmed," "scheduled," or "booked."

Frontend: `pages/PublicSchedule.tsx` +
`components/booking/PublicBookingCalendar.tsx` (same visual flow as the
admin Booking preview, reusing the same day/slot/review UI, wired to the
public unauthenticated hooks in `hooks/usePublicScheduling.ts` /
`lib/publicSchedulingApi.ts`).

**Consent**: `phoneConsent`/`smsConsent`/`emailConsent` all default `false`
and are only ever set by an explicit checkbox the visitor ticks — supplying
a phone number or email address alone never sets any consent flag, on either
the public or admin submission path. No SMS or email is sent by anything in
this checkpoint regardless of consent captured.

**Enabling it**: an admin toggles "Enable public link" in Availability
Settings (`PUT /api/receptionist/availability/public-link`), which
generates a fresh opaque slug; disabling clears it (a re-enable issues a
brand-new, unrelated slug, never reusing or predicting the old one).

## Appointment state model

Full enum now (durable, via `scheduling_appointment_requests.status`):
`requested | pending_review | held | booked | cancelled | rescheduled |
failed | expired`. Only `held`, `pending_review`, `cancelled`, and `expired`
are reachable by any Checkpoint B code path — `booked`, `rescheduled`, and
`failed` are modeled in the schema and the admin UI's status badges so
Checkpoint C doesn't need another migration, but nothing in this checkpoint
can produce them. `providerEventId`/`providerCalendarId` stay `NULL` for
every row created in Checkpoint B.

## What a customer sees vs. what's private

Unchanged from Checkpoint A: available, selected, unavailable, fully booked,
outside business hours, loading, no availability, temporarily unavailable —
no private calendar event titles, attendees, descriptions, addresses, or
other customers' contact info anywhere in a public or admin response. This
was re-verified for the Google free/busy path specifically:
`GoogleFreeBusyProvider` only ever surfaces `{ startUtc, endUtc }`, asserted
directly in `FreeBusyProvider.test.ts` ("Only start/end are ever read from
the response").

## Mobile navigation fix

The Appointments tab bar (`pages/Appointments.tsx`) previously relied on
`overflow-x-auto`, which centered its content and clipped the first/last tab
label off-screen with no visible scroll affordance on narrow viewports. Fixed
by switching to a non-scrolling `grid-cols-3` layout on mobile (full `flex`
row restored at the `sm:` breakpoint) with short mobile labels ("Preview" /
"Settings") that expand to their full text on desktop — every tab is always
fully visible, no horizontal scroll is ever needed, and the desktop
appearance is unchanged.

## Where things live

- Engine (unchanged since Checkpoint A): `lib/scheduling/availabilityEngine.ts`, `zonedTime.ts`
- Durable repository: `lib/scheduling/schedulingRepository.ts`
- Free/busy providers: `lib/calendar/`
- Public-page abuse protection: `lib/scheduling/publicSchedulingProtection.ts`
- Admin routes: `routes/receptionistAvailability.ts` (`/api/receptionist/availability/*`)
- Public routes: `routes/publicScheduling.ts` (`/api/public/schedule/:slug/*`)
- Schema + migration: `lib/db/src/schema/scheduling.ts`, `drizzle.scheduling.config.ts`, `drizzle/scheduling/`, `drizzle/scheduling-rollback/`
- Dashboard: `pages/Appointments.tsx`, `pages/PublicSchedule.tsx`, `components/booking/*`

## Verified for Checkpoint B

- `pnpm run test` (no `DATABASE_URL` needed): all existing suites still pass,
  plus new pure-unit tests for the free/busy providers and public-page
  bot-protection helpers. Nothing that requires a live database is part of
  this default suite — it must keep working for anyone without a
  provisioned Development database.
- `pnpm --filter @workspace/api-server run test:scheduling-db` (requires a
  real `DATABASE_URL`): 20/20 real-Postgres integration checks — settings
  and appointment-request persistence across re-query, firm-isolation
  (cross-firm read/cancel blocked), `pending_review`/`booked`/`providerEventId`
  invariants, cancelled-never-blocks, held-blocks-until-expiry, a genuine
  concurrent double-submission race (exactly one of two simultaneous
  identical-slot requests succeeds), and public-slug resolution/enumeration
  resistance.
- Migration applied to the local Development Postgres database; tables,
  indexes, and constraints confirmed via `\d` and `\dt`.
- Real process restart performed (`pkill` + relaunch): two appointment
  requests submitted through the public page before the restart were still
  present, still `pending_review`, still `provider_event_id IS NULL`,
  visible in the admin Requests list afterward.
- Manual browser walkthrough (desktop 1440×900, mobile 390×844): admin
  Booking preview, Requests, and Availability Settings (weekly hours,
  appointment type, public-link toggle, Google Calendar status); the public
  `/schedule/:slug` page end to end (browse → slot → contact → review →
  honest "Pending review — not booked" result) on both viewports; mobile
  tab bar no longer clips any label. No console errors traceable to this
  feature (the only console errors seen are a pre-existing Google Fonts
  request unrelated to scheduling, reproducible on the Overview page too,
  and only visible at all because this sandbox's outbound proxy was bypassed
  for local testing).
- `pnpm run typecheck` (workspace-wide) and both `api-server`/`helpdesk`
  production builds clean.
- No protected file listed in `CLAUDE.md` was touched. No Google Calendar
  event was created, changed, or deleted (no code path in this checkpoint
  can call anything but the read-only FreeBusy endpoint). No SMS or email
  was sent. No Production resource was touched.

## Next checkpoint (C) needs explicit approval for

- Provisioning real `GOOGLE_CALENDAR_DEV_*` credentials and exercising a
  genuine live free/busy call end to end (not yet done — no credentials
  exist in this environment).
- Any Google Calendar **write** scope or event creation.
- Marking any request `booked` (requires an authoritative provider write).
- Sending a scheduling link, SMS, or email.
