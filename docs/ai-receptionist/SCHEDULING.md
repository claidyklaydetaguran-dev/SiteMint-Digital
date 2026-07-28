# Scheduling / Visual Availability Calendar

> Checkpoint A of the appointment-scheduling feature. Last updated: 2026-07-28.

## Phasing

| Checkpoint | Scope | Status |
|---|---|---|
| A | Visual calendar, availability settings, server-side availability engine, in-memory Development store, sanitized fixtures. No real calendar, no real appointments. | **Done** |
| B | Connect the authorized Development calendar provider; import free/busy; verify no private event data leaks. | Not started — requires owner approval to connect a calendar |
| C | Create/reschedule/cancel Development appointments with authoritative provider confirmation and double-booking protection. | Not started — requires owner approval |
| D | Vapi Development assistant checks availability and books only after explicit caller confirmation. | Not started — requires owner approval |

Checkpoint A intentionally does **not**: connect Google/Outlook/any live calendar, create a real appointment, send a scheduling link, send SMS/email, touch Production, or run a database migration.

## Why no migration

All scheduling data in Checkpoint A lives in an in-memory, per-firm `Map`
(`artifacts/api-server/src/lib/scheduling/availabilityStore.ts`). It resets on
server restart. This is deliberate: real persistence requires a reviewed,
versioned migration per `lib/db/MIGRATIONS.md`, which is out of scope until an
owner approves a checkpoint that needs durable storage (B/C). The store's
public functions are the seam — swapping the `Map` for real tables later
should not require changing the availability engine or the route contracts.

## Concurrency / double-booking prevention

Every mutating store function (`createHold`, `submitAppointmentRequest`,
`cancelAppointmentRequest`) is a single synchronous function body with no
`await` between reading existing bookings and writing the new one. Node's
single-threaded event loop makes each call atomic — no request can interleave
between the availability check and the write — giving the same check-then-write
guarantee a unique DB constraint would provide. This substitutes for real
persistence only; it does not survive a process restart or multiple server
instances, which is acceptable for a single-process Development preview.

## Availability engine

`artifacts/api-server/src/lib/scheduling/availabilityEngine.ts` is a pure,
dependency-free function library (no I/O) that computes day- and slot-level
availability from an `AvailabilityConfig` plus existing bookings. It is the
single source of truth both the visual calendar (now) and the voice assistant
(Checkpoint D) are meant to call — no separate "voice availability" logic
should ever be written.

Configurable inputs: business timezone, weekly hours, appointment types
(with per-type duration), buffers before/after, minimum scheduling notice,
maximum advance-booking window, blocked dates, slot interval, and an optional
daily appointment limit.

Timezone math (`zonedTime.ts`) is hand-rolled on Node's built-in
`Intl.DateTimeFormat` rather than a dependency — verified DST-correct with
dedicated tests (`zonedTime.test.ts`) including the 2026 spring-forward
boundary.

Server-side revalidation: the booking route re-checks the selected slot
against the authoritative engine immediately before writing
(`isSlotStillAvailable`), rather than trusting a slot the browser previously
saw as available. A slot taken between page load and submission returns a 409
and the UI refetches current availability.

## Appointment state model

`AppointmentRequestState = "held" | "pending_review" | "cancelled" | "expired"`.

`"booked"` does not exist in this type — Checkpoint A has no calendar
provider that can confirm event creation, so displaying "Booked" is a type-level
impossibility rather than a runtime convention. The full state model
(`requested / pending_review / held / booked / cancelled / rescheduled /
failed / expired`) will only gain `booked`/`rescheduled`/`failed` once a real
provider exists (Checkpoint C).

## What a customer sees vs. what's private

The public/customer-facing calendar only ever reveals: available, selected,
unavailable, fully booked, outside business hours, loading, no availability,
and temporarily-unavailable states. No private calendar event titles,
attendees, descriptions, addresses, or other customers' contact info are
computed or exposed anywhere in this checkpoint (there is no real calendar
connected yet, so there is nothing of that kind to leak — this remains a
requirement to verify again in Checkpoint B once free/busy import exists).

## Where things live

- Engine + store: `artifacts/api-server/src/lib/scheduling/`
- Routes: `artifacts/api-server/src/routes/receptionistAvailability.ts`
  (`/api/receptionist/availability/*`, behind `requireReceptionistAuth`,
  firm-scoped via `req.firmId`)
- Dashboard: `artifacts/helpdesk/src/pages/Appointments.tsx` (Booking preview /
  Requests / Availability settings tabs), `src/components/booking/*`,
  `src/hooks/useAvailability.ts`, `src/lib/availabilityApi.ts`
- Nav entry: `appointments` in `artifacts/helpdesk/src/lib/nav.ts`, gated by
  `voicePlatformEnabled` like the rest of the voice platform surfaces.

## Verified for Checkpoint A

- `pnpm run test`: 94/94 api-server tests pass, including 30 new scheduling
  tests (`zonedTime`, `availabilityEngine`, `availabilityStore`).
- `pnpm run typecheck` clean for both `api-server` and `helpdesk`.
- Manual browser walkthrough (desktop 1440×900 and mobile 390×844): month
  navigation, date/slot selection, contact form, review step, honest
  "Pending review — not yet booked" result, Requests list with cancel,
  Availability Settings edit/save. No console errors traceable to this
  feature (the only console errors seen are a pre-existing Google Fonts
  request unrelated to scheduling, reproducible on the Overview page too).
- No protected file listed in `CLAUDE.md` was touched; no database migration
  was created or run; no real calendar was connected; no real appointment was
  created; no scheduling link, SMS, or email was sent; no Production resource
  was touched.
