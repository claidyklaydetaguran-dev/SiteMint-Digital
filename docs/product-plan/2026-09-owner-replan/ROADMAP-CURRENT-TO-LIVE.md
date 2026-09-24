# Roadmap — Current State to Live (reconciled 2026-09-04)

> Supersedes the R0–R9 sequence of 2026-09-03. PR #30 is merged (main `57ea6c8`). The work
> is one integrated **SiteMint V5 Brand and Product Program** with three concurrent
> workstreams and eight owner-visible phases (A–H). Engineering gates, migrations,
> certifications and release boundaries remain mandatory; "one program" never means
> all-at-once deployment.

## Workstreams

| Workstream | Scope | Owner surface |
|---|---|---|
| A — Master brand + public website | mint design system, homepage expansion, page signatures, motion system, scroll-to-top, pricing, truthful copy, responsive performance | `artifacts/web-agency` public pages, tokens |
| B — AI Receptionist revenue product | product landing page, call theater, Try-the-AI architecture, onboarding, configuration, calendar + booking, phone number, calls/contacts/usage/safe failure, private-beta activation | `artifacts/helpdesk`, `api-server` additive routes, `/ai-receptionist` page |
| C — Customer application + operations | unified customer shell, navigation/orientation, receptionist health, Receptionist Ops, support visibility, secure Ops access | `artifacts/helpdesk` shell, `artifacts/web-agency` CRM |

## Phases (owner-visible checkpoints)

| Phase | Content | Preview checkpoint | Gate |
|---|---|---|---|
| **0 Blueprint** | V5-BLUEPRINT.md approved | this document set | owner approval |
| **A Launch integrity** | truthful copy; Discovery submission repaired; V2 pricing/contact/verticals retired (pricing rebuilt); 404s; nav/orientation; mint tokens applied site-wide; scroll-to-top; motion system | mode-A preview of the website | sweep 5 widths, keyboard, reduced motion, LCP budget |
| **B Customer foundation** | invite signup; password reset; persistent onboarding; redesigned Overview; approved sidebar + breadcrumbs; capability/error states | mode-B dashboard | contract suites, voice matrix |
| **C Receptionist setup** | one-assistant experience; structured prompt; voice samples; prerequisite-aware Test/Activate | mode-B builder | contract suites |
| **D Scheduling** | unbundle availability; Calendar screen; appointment lifecycle UI; Test Booking safety | mode-B + staging re-run (flags temporarily on, then off) | M4 UI evidence |
| **E Calls and control** | Calls; minimal Contacts; Phone Number UI + provisioning path; Usage + limits; customer Issues | mode-B | contract suites |
| **F Operations readiness** | secure admin auth; canonical statuses; Receptionist Ops; shared fetch/auth; essential responsive Ops views | mode-B CRM | route-security contract |
| **G Certification** | browser test call; number assignment; real inbound call; live availability/booking tool loop; safe failure + alerts; zero-retention verification | staging (resume authorised by owner) | PILOT_ACTIVATION Stages 0–4 |
| **H Invite-only launch** | production config review; private-beta legal docs; controlled flags; first customer; monitored activation + rollback | production | release checklist |

Phases A, B/C and F can run concurrently (different file owners); D depends on B's shell; E on D; G on B–F; H on G.

## Blockers only the owner can clear

Blueprint approval · Vapi production credentials · a voice-only phone number · Google production OAuth client · Resend key · two additive migrations (onboarding state, admin sessions) · voice-sample source · legal review · any paid generation (hero video 650–7,000 credits per take; see V5-BLUEPRINT §8) · DNS.
