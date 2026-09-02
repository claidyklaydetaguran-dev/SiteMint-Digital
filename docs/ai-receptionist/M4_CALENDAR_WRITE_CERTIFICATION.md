# M4 — Calendar Write Certification

> Consolidated evidence for the calendar write milestone (SCHEDULING.md
> Checkpoint C). Certified 2026-09-02; final-state restoration completed
> 2026-09-03. Staging only — no customer production system was touched.

"Production" and "Development" below refer to the two Postgres databases of
the **staging** Replit App (`SiteMint-Voice-Staging`).

## 1. Scope and verdict

| Milestone | Scope | Verdict |
|---|---|---|
| M2 | Availability + read-only Google free/busy | **PASS** |
| M3 | Booking capture (`pending_review`, no provider write) | **PASS** |
| M4 | Authoritative calendar write: create / reschedule / cancel / reconcile | **PASS — CERTIFIED** |

## 2. Pull requests

| PR | Merge SHA | Change |
|---|---|---|
| [#27](https://github.com/claidyklaydetaguran-dev/SiteMint-Digital/pull/27) | `2fdce9a` | Wired the event lifecycle so the writer is reachable |
| [#28](https://github.com/claidyklaydetaguran-dev/SiteMint-Digital/pull/28) | `ab023e5` | Dropped the invalid Google `Event.source` block |
| [#29](https://github.com/claidyklaydetaguran-dev/SiteMint-Digital/pull/29) | `eb0d843` | Booked-row cancel and reschedule — the missing lifecycle exits |

### 2.1 The two defects certification found

**PR #28 — every insert was rejected.** The event body carried
`source={title}` with no `url`. Google validates `Event.source` whenever the
block is present and requires an `http(s)` url, so the API rejected the whole
insert with `400 "Invalid source url: ."`. The result was not a degraded
event, it was *no* event, on every approval, for the entire life of the write
path.

**PR #29 — `booked` was a terminal status.** No committed route, webhook,
worker or service could move a row out of `booked`:
`cancelAppointmentRequestByPublicId` is deliberately pending/held-only
(it is shared with the voice tool dispatcher), and **nothing anywhere wrote
`'rescheduled'`** — even though `reconcileCalendarForFirm` enumerates that
status and the helpdesk status enum lists it. A booked appointment and its
Google event were permanent.

The fix stays inside the existing architecture: `cancelBookedRequest` /
`rescheduleBookedRequest` in `calendarEventSync.ts` with the same injectable
`deps` shape as `approveRequestToBooked`, two status-guarded persisters, and
two firm-scoped session routes on the **calendar** router (the availability
router keeps its pinned ten-endpoint client contract; the voice tool keeps its
narrower cancel, so no AI capability was widened). Reschedule uses the
**replacement-request model**: a fully availability-validated replacement
first, the guarded `booked → rescheduled` transition second, best-effort event
removal last.

> **Lesson worth keeping:** a status enum plus a reconcile pass that *mentions*
> a status is not evidence that anything can produce it. Grep for the writer
> (`set({ status: ... })`), not for the name.

## 3. CI and test results

| Gate | PR #28 (`ab023e5`) | PR #29 (`eb0d843`) |
|---|---|---|
| `pnpm run typecheck` | clean | clean |
| api-server suite | 39 files / 996 tests | 39 files / **1009** tests |
| Aggregate `pnpm run test` | exit 0 (2281 PASS lines) | exit 0 (2281 PASS lines) |
| Protected-file zero diff | 16/16 | 16/16 |
| Secret scan | exit 0 | exit 0 |
| `gates` job | pass | pass (2m21s) |
| `voice-matrix` job | pass | pass (1m38s) |

Protected-file comparison on staging must be done **CR-stripped**
(`tr -d '\r'`) — several protected files are CRLF there while the committed
blobs are LF. Raw hashes differ; content does not.

PR #29 added 13 regression tests: reachability contract, idempotent repeat
cancel, cross-firm rejection with zero side effects, flag-off behaviour (the
database action still lands, the event waits for reconciliation), lost-race
handling on both paths, provider-failure degradation, and proof that a
reschedule never inserts an event itself.

## 4. Promotion and republish

Three republishes total, each carrying one hash-verified delta:

1. PR #28 delta — the two remaining test files, promoted by a fail-closed
   script that refused to write unless both post-image digests matched.
2. PR #29 delta — five files fetched straight from the public repo
   (`git fetch <url> main`, then `git checkout FETCH_HEAD -- <paths>`),
   landing on the exact committed digests.
3. Flag shutdown — no code change.

All promoted files verified byte-exact against their merge commits:
`26ef6745…`, `a55816fa…`, `eb51478b…` (PR #28) and `74ff864c…`, `815b5c17…`,
`3b30d8f1…`, `dd6ec959…`, `a0bfb6fe…` (PR #29). Staging `git status` showed
exactly the expected changed-file count each time.

**Cost:** Replit spend `$22.06 → $22.74` across this activation (+`$0.68`);
`$1.34` cumulative against the `$3` authorization, and the `$27` alert was
never approached.

## 5. Live lifecycle evidence

All steps ran through authenticated deployed routes against the dedicated
staging Google account and the synthetic firm — never through direct SQL.

| Step | Result |
|---|---|
| Create (approve) | `200 booked`; exactly one Google event |
| Event fields | only `summary`, `start`, `end`, `iCalUID` |
| Free/busy after create | 16 → 13 slots |
| Repeat approve | `200 booked`, **no** second event |
| Reschedule | old slot freed, new slot blocked, exactly one event remains |
| DB after reschedule | old row `rescheduled` + ids cleared; new row `booked` + one event id |
| Cancel | event deleted from Google; all 16 baseline slots restored |
| `provider_event_id` after cancel | `NULL` on both rows, per contract |
| Reconcile | `events_removed: 0, failures: 0` — no orphan |
| Repeat cancel / reschedule | `409 not_booked` — safe and idempotent |

**Privacy result:** no attendee, invitation, notification, email, conferencing
data, reminder override, location, attachment, description, or customer
contact detail was ever created. Confirmed both in the request-body contract
and visually in the Google Calendar UI.

The three-slot free/busy delta is expected, not a defect: the booked slot plus
its two 10-minute buffer neighbours.

## 6. Cleanup inventory

Removed from the staging Production database after evidence capture:

| Table | Rows removed |
|---|---|
| `scheduling_appointment_requests` | 6 |
| `scheduling_weekly_hours` | 5 |
| `scheduling_availability_settings` | 1 *(error — see §7, since corrected)* |
| `scheduling_appointment_types` | 1 |
| `provider_webhook_events` | 30 |
| `voice_issues` | 5 |
| `voice_usage_ledger` | 1 |
| `scheduling_calendar_oauth_states` | 0 |
| `scheduling_calendar_connections` | 1 (last, after all calendar verification) |

Ten sequences reset to pristine. Staging `/tmp` emptied and the workspace git
tree left clean.

## 7. The parity error and its correction

The synthetic-fixture cleanup deleted the firm's
`scheduling_availability_settings` row. That row was **not** an M4 fixture — it
is one of the four authorized baseline rows, created lazily by `getOrCreate`
on 2026-08-29, two days before any M4 fixture, with `public_slug` NULL and
`created_at = updated_at` (never edited).

A second error compounded it: an intermediate parity reading taken while a CDP
call was timing out reported the two databases as byte-identical when they
were not. The careful re-measurement is the trustworthy one.

**Correction performed 2026-09-03, database-only, no republish:**

1. The certification login was ended through the product's own **Sign out**
   control. The committed logout contract deleted the row itself —
   `receptionist_sessions` went `1 → 0` with no manual deletion needed.
2. The availability-settings row was restored in a single transaction by
   generating one `INSERT` from the untouched Development row, preserving firm
   ownership, timezone, notice window, advance window, both buffers, daily
   limit and both timestamps. `md5(row(...)::text)` is now **identical** in
   both databases (`aa09b55ba88d…`).
3. `scheduling_availability_settings_id_seq` was aligned to the Development
   position; all listed sequences now diff clean.

## 8. Final state

| Check | Result |
|---|---|
| Production vs Development inventory | **identical** — `ed2a40f503491581` (53 tables) |
| `intake_firms` / `voice_assistants` / `scheduling_availability_settings` / `form_submissions` | 1 / 1 / 1 / 1 in **both** |
| `receptionist_sessions` | 0 in both |
| Synthetic M2–M4 tables | 0 in both |
| Calendar connection + OAuth state | 0 in both |
| Journals (shared / voice / discovery / scheduling) | 5 / 7 / 1 / 2 in both |
| Sequences | diff clean between both databases |
| `CALENDAR_CONNECT_ENABLED` | `false` |
| `CALENDAR_WRITE_ENABLED` | `false` |
| Disabled posture live | authenticated approve + reconcile `503`, connect start `503`, calendar status `connected:false` |
| Google events / orphans | none |
| Vapi posture | unchanged — unsigned webhook `401`, `/api/metricz` `404` |
| Health / readiness | `200` / `200` |

### Fingerprint formula (stated, so it is reproducible)

The inventory fingerprint above is `sha256` over the sorted
`table_name|row_count` listing of every `public` base table, produced with
`query_to_xml(format('select count(*) as cnt from %I', table_name))`.

**Honest limitation:** the earlier approved baseline fingerprint string
(`cecb0556…`) was produced by `.ar002i/fp.mjs`, whose formula is committed
nowhere in this repository. That script still exists in the staging workspace,
but the tooling channel available in this session refused to display it, and
executing an unread script against a live database was not an acceptable risk.
The `cecb0556…` string was therefore **not** re-derived. Deliberately, no
attempt was made to search for a formula variant that reproduces it — fitting a
formula to a target proves nothing. What *is* proven is the substance of that
baseline: the two databases are byte-identical under the stated formula, and
every itemized baseline invariant above matches.

## 9. Evidence

`~/workspace/.ar002i/` in the staging workspace **survives** — 63 files,
368 KB, carried into the Replit publish snapshots (which is why the workspace
git tree reads clean). An earlier session note claiming this directory was lost
to a container recycle was **wrong** and is corrected here. Its `fp.mjs` is the
one artefact that could not be used, for the reason given in §8.

## 10. Owner actions

- **Revoke the Google grant.** Sign in as the *Sitemint Staging* account (the
  `u/1` Chrome profile, not the personal one) → Google Account → Security →
  *Your connections to third-party apps* → remove SiteMint. The stored token
  row is already deleted, so nothing dangles.
- `PROD_DB_AUDIT_URL` has been **deleted** from the staging Secrets store now
  that restoration is proven.
