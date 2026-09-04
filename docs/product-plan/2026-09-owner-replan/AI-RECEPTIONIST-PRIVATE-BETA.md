# AI Receptionist — Invite-Only Private Beta (scope approved 2026-09-04, P-1)

> Reconciled to the owner decisions. The 2026-09-03 matrix is superseded by the P-1 scope
> below; rows the owner removed from the beta are listed under "Not required".

## 1. Beta definition

- **Who:** 1–3 invited service businesses, one location and one Google Calendar each, onboarded personally by SiteMint. Manual invoicing (U-4, D-6).
- **What they get:** an assigned SiteMint-provisioned number; a voice receptionist that answers, handles routine questions, checks real availability and books / reschedules / cancels against the customer's Google Calendar; Calls, minimal Contacts, usage and limit states; safe failure handling; a browser test call before go-live.
- **Visibly "coming later":** SMS follow-up from the voice product (existing SMS stays a channel), human transfer, integrations marketplace, self-serve billing, team members, analytics, knowledge base, API keys, multiple assistants, public booking link. No audio or transcript retention, ever, in beta.

## 2. Required for the private beta (P-1)

| # | Requirement | Code state today | Work | Certification |
|---|---|---|---|---|
| 1 | Invitation-based signup | signup exists, flag off; tokens table exists (P8) | invite mechanism (signed invitation or invite code); S-1 field set; "Set up your AI Receptionist" | — |
| 2 | Login + password reset | login live; reset backend only | reset request + complete screens; `PASSWORD_RESET_REQUESTS_ENABLED` | drill on a test account |
| 3 | Persistent onboarding (10 steps) | none | onboarding state persistence (additive migration, owner-approved) + Setup hub | — |
| 4 | One assistant per firm | list + builder behind flag | status card; hide create-another | — |
| 5 | Guided structured prompt + previews | PromptTab | structured sections, generated preview, "how callers hear this", Advanced | — |
| 6 | Curated voices with samples | two presets, no samples | sample playback assets (owner-approved source) | — |
| 7 | Availability + appointment types | certified M2, behind voice flag | unbundle from voice flag; Advanced grouping | M2 ✔ |
| 8 | Google Calendar connection screen | backend ✔ M2, UI none | Scheduling → Calendar screen; `?calendar=` handling | staging re-run with flags temporarily on |
| 9 | Certified browser test call | built, flag off, **not certified** | prerequisite-aware Test control | **Stage 2: one authorised paid web call** |
| 10 | Phone-number assignment | routes exist, no provisioning path | Channels → Phone Number UI + guarded inventory insert (admin) | **Stage 3: owner-acquired voice-only number** |
| 11 | Certified inbound call | backend routing from inventory | — | **Stage 3: scripted real call** |
| 12 | Appointment lifecycle (create/approve/reschedule/cancel) | backend ✔ M4; UI dark | wire calendar router; drawer; confirmations | M4 ✔ + UI re-run |
| 13 | Calls | logs behind flag | rename, statuses, in-progress chip, policy explanation | AR-002B ✔ |
| 14 | Minimal Contacts | none | read route over voice_contacts + intake; page | — |
| 15 | Usage and limit states | SMS meter only | Usage page over `GET /voice/usage`; paused copy | P7 ✔ |
| 16 | Safe failure handling | issues backend ✔ | customer Issues surface + per-page error states | Stage 4 alerts |
| 17 | Receptionist Ops visibility | roster + diagnostics routes | Firms / Firm detail / Usage / Issues / Numbers screens | — |
| 18 | Secure Ops access | password + localStorage bearer | httpOnly session, logout, rate limit, audit (O-1) | before real customer data |
| 19 | Zero-retention verification | policy `none` | — | Stage 2/3 evidence: no transcript/audio rows |

## 3. Go / no-go gates

1. Every row above green on the deployed origin.
2. PILOT_ACTIVATION.md Stages 0–4 executed with evidence; Stages 5–6 explicitly deferred.
3. Protected files 0-diff; secret scan; contract suites; voice matrix; route sweep; keyboard contract; reduced motion.
4. One real inbound call by the owner books into a test calendar and is cancelled, with the expected rows and no transcript.
5. Legal documents for the private beta reviewed (public-launch approval remains separate).

## 4. Readiness estimate (2026-09-04)

| Milestone | Estimate | Basis |
|---|---|---|
| Blueprint approval | now | V5-BLUEPRINT.md |
| Private beta | not ready — 8 implementation PRs (V5-BLUEPRINT §14) + 4 certification runs; 2 additive migrations need owner approval | each PR is contract-aware; no new runtime dependency expected beyond a video/asset pipeline for the site |
| Public launch | after beta — legal, billing catalog, domains, performance on the deployed origin | owner-driven items |
