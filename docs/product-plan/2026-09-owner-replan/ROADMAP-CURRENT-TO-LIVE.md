# Roadmap — Current State to Live

> Planning document. Sequenced so that each step is independently reversible and each
> phase ends with the standard verification gates. Dates are deliberately absent; order and
> gates are the commitment.

## Phase R0 — Owner review (now)

Deliverable: this package. Exit: owner returns KEEP / CHANGE / REMOVE / ADD / UNCERTAIN per
page in OWNER-REVIEW-WORKBOOK.md and a visual/product direction. **No merge, deploy or flag
change until the review is complete.**

## Phase R1 — Merge the V4 frontend

- Merge PR #30 (`17a7056` → `7d84bcb`) on explicit owner authorisation. If main has moved,
  re-sync and re-run gates first (stop rule).
- Deploy nothing yet; production Replit keeps serving its older snapshot.

## Phase R2 — Honesty and orientation fixes (website + both shells)

- `/discovery` submits; `/about`, `/work` copy corrected; 404 pages; mobile nav group label;
  duplicate receptionist entry; `/services` anchors; V2-chrome pages retired or re-skinned.
- Helpdesk: capability-state for every gated path; rail scroll; breadcrumbs.
- CRM: `adminFetch` + guard + breadcrumbs + single scroll; nav cleanup.
- Gates: full verification + R1-style sweep. Exit: zero bare 404s for known features.

## Phase R3 — Calendar journey in the dashboard

1. Unbundle availability / types / calendar status from the voice build flag.
2. Calendar connection screen (start OAuth, status, disconnect, `?calendar=` handling).
3. Appointments lifecycle controls over the calendar router (approve, reschedule, cancel booked).
Exit: on staging with `CALENDAR_*` temporarily on, the owner connects the Sitemint Staging
calendar, books, reschedules, cancels from the UI; flags back off; DB parity restored.

## Phase R4 — Onboarding, overview, usage, issues, contacts, number

4. Onboarding hub + Overview status header.
5. Usage (voice minutes) + Issues page.
6. Contacts minimal read route + page.
7. Phone number page + guarded inventory insert (admin).
Exit: a new firm can go from signup to "assistant ready" using only the product.

## Phase R5 — Receptionist Ops in the CRM

Firms, Firm detail (diagnostics), Issues (new admin route), Usage (per-firm).
Exit: staff can see and support every beta firm without database access.

## Phase R6 — Staging activation for the beta (PILOT_ACTIVATION Stages 0–4)

Provider config → publish → browser test call → number + inbound call → alerts/reconciliation.
Each stage owner-executed with evidence; every flag independently reversible.
Exit: one scripted real inbound call books and then cancels into a test calendar with the
expected rows and no transcript.

## Phase R7 — Production promotion and first invited customer

Release checklist, preflight, backup, restore drill; production flags mirrored from staging;
first firm onboarded personally; manual invoicing. Exit: the firm takes real calls for a week
with daily issue review and a weekly restore drill.

## Phase R8 — Public launch preparation

Legal approval; password reset; billing catalog + Stripe test clocks; pricing posture;
integrations page; domain program; performance on the deployed origin.

## Phase R9 — Public launch

Registration open; forms open; marketing site cut over; monitoring and digest on.

## Post-launch

SMS for the voice product (policy), human transfer, team members, saved views, cost roll-up,
hero film, case studies, Insights.

## Recommended implementation order (single list)

1. Owner review → 2. Merge PR #30 → 3. R2 honesty/orientation → 4. Calendar unbundle →
5. Calendar connection screen → 6. Appointments lifecycle → 7. Onboarding + Overview →
8. Usage + Issues → 9. Contacts → 10. Phone number → 11. CRM Receptionist Ops →
12. Staging activation Stages 0–4 → 13. Production promotion → 14. First customer →
15. Legal + billing + domains → 16. Public launch.

## Blockers that only the owner can clear

Merge authorisation · Vapi production credentials · a voice-only phone number · Google
production OAuth client · Resend key · the plan catalog and pricing · legal approval of
privacy/terms · the retention decision · DNS for the domain program · any paid generation.
