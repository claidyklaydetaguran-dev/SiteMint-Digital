# Signed-in workspaces — Mint Clarity design release (2026-09-24/25)

Owner directive of 2026-09-24: bring the AI Receptionist workspace, then the
staff CRM, onto the approved Mint Clarity identity; rework hierarchy rather
than recolour; preserve routes, data, permissions and working actions; test
with the owner's existing sessions; publish after checks with a rollback point.

Branch `claude/workspace-mint-design-0924` (PR #35) from
`design/mint-clarity-public-release` @ cbdbdc47.

## What changed

**Shared design system.** Two scoped layers built on the same tokens as the
public site (forest `#173f35` actions, ink `#203c34` text, mint `#e4f2e9`
surfaces, paper `#f9fbf8` canvas, DM Sans):

- `artifacts/helpdesk/src/styles/workspace.css` — authoritative for every
  dashboard class family (sd/sa/sb/sg/sr/sc/dash) plus new `ws-*` patterns
  (status card, progress, connection list, stat strip, next step, section
  tabs, breadcrumb). Replaces the stacked V3/V4/V5/mint colour layers; the
  earlier files stay imported only because contract tests read them.
- `artifacts/web-agency/src/styles/crm-workspace.css` — scoped to the staff
  shell (and to `body` while it is mounted, so portalled dialogs match).
  Re-points the Tailwind colour variables so decorative hues fold into four
  families: mint (brand/positive), sage (informational), amber (attention),
  red (danger), with brand green-grey neutrals.

**AI Receptionist workspace.**
- Shell: document scrolling (the nested rail + content scrollbars are gone),
  brand mark, live setup status in the rail, 7 section entries with the
  current section expanded (the 21-link rail no longer overflows a 900px
  screen), "Section / Page" trail on desktop, section tabs on phones and
  tablets, current page name in the mobile top bar.
- Overview answers the owner's four questions in order: one status card
  (plain headline, setup progress, the single next step named as an action,
  every connection with its real state), a Today strip, activity feed, calls
  card with an honest empty state, usage line.
- Setup: real next action, finished steps collapse, readable step numbers.
- Assistant summary card with one primary action (the duplicate "Open" link
  is gone); Team roster grid (its layout classes had never been styled — the
  header rendered as "EmailRoleStatusInvited"); calendar fact tiles and
  buttons; scheduling sections as cards; plain-language scheduling copy.
- Appointment types has its own address, nav highlight and title (it was a
  `?tab=types` redirect onto a page titled "Availability").

**Honesty fixes (functional).**
- Overview/Setup next step said "Published" for a step not yet done; it now
  names the action ("Publish your receptionist").
- Readiness (api-server): booking, transfers and message saving said "Add an
  appointment type and opening hours" etc. when the real reason is that
  SiteMint has not switched the capability on for the workspace. The checks
  now say so (additive optional fact; no schema, auth, provider or billing
  change).
- Google Calendar is shown as connected when it is, separately from booking
  by phone (off) — previously one row read "Calendar and booking: Off".

**Staff CRM.** Legible brand (the ops logo printed an invisible wordmark on
the light header), light sidebar built from real links with `aria-current`
(it nested a button inside a link), group toggles with `aria-expanded`,
calmer palette across all 42 screens, pipeline chart on the brand palette,
emoji removed from headings and dialog titles, sign-in/activation on the
light treatment, one left edge and maximum width for every page.

## Verification

- CI green on the release head: run 36028045498 (gates + 20-variant voice
  matrix). Local: root typecheck, full contract chain, api/helpdesk/web-agency
  builds, secret scan, built-output scan, voice matrix 20/20.
- Layout harness (real app, real API data): receptionist 21 routes × phone
  390 / tablet 820 / desktop 1440 from captured production payloads — 0
  horizontal overflow, 0 nested scrollbars, 0 console errors. CRM 26 routes ×
  3 widths against the real API with a local staff session and TEST records —
  0 overflow, 0 console errors; the only flagged scroll regions are the CRM's
  intended `main` scroller and the Documents record list.
- Published (Web Asset Builder) at 7dd0b854; rollback point 0f880cc4 (and
  0d91bb42 before the workspace release).

### Route matrix (live, owner's sessions)

| Receptionist route | Visual | Functional (live) |
|---|---|---|
| Overview | New system | Loads; status, next step and connections match readiness; 0 errors |
| Setup | New system | Loads; next step is the real action |
| Assistant | New system | Loads; builder not exercised (no publish) |
| Availability | New system | Loads; blocked-date save persisted and reverted exactly |
| Appointment types | New system | Loads at its own address with correct nav/title |
| Calendar | New system | Loads; Google Calendar connected (not modified) |
| Appointments, Test booking | New system | Load; no booking created |
| Calls, Inquiries, Conversations, Contacts | New system | Load with honest empty states |
| Phone number, Transfer contacts, SMS replies | New system | Load; nothing requested or changed |
| Usage, Billing, Team, Support, Issues | New system | Load; nothing submitted |
| Settings | New system | Loads; profile save persisted and reverted exactly |

| CRM route | Visual | Functional (live) |
|---|---|---|
| Command Center, My Day, Operations | New layer | Load, correct active nav, 0 alerts |
| Contacts, Companies, Deals, Pipeline | New layer | Load; company create/edit/delete persisted (TEST record, removed) |
| Tasks, Calendar, Projects | New layer | Load; task create/complete/delete persisted (TEST record, removed) |
| Communications, Inbox, Support | New layer | Load under the staff session (no send tested) |
| Discovery | New layer | Discovery id 9 present and matches the persisted acceptance inquiry |
| Documents, Reporting, People, Settings, Account, Transactions, Workspace | New layer | Load, correct active nav, 0 alerts; no writes |

## Remaining limitations

- CRM page layouts and record-detail hierarchy are restyled, not restructured;
  the per-page information architecture of the 42 CRM screens is unchanged.
- Dark appearance of the receptionist workspace uses the new dark tokens but
  was not reviewed screen by screen.
- The in-app browser pane was hidden during verification, so live checks are
  DOM-level; visuals come from the harness running the identical build.
- Not exercised: publishing an assistant, browser/phone calls, SMS, billing,
  sending email, support requests, transfer-contact creation (may contact the
  person), contact creation (contacts cannot be deleted).
