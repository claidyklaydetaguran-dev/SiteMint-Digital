# SiteMint — Product Vision (September 2026 replan)

> Planning document. Nothing here is implemented by virtue of being written down.
> Status labels follow CURRENT-STATE.md. Owner decisions are collected in
> OWNER-REVIEW-WORKBOOK.md.

## 1. What SiteMint is

SiteMint Digital is a small agency that builds connected digital systems for service
businesses (websites, web applications, CRM and workflow automation) and now sells one
software product of its own: the **SiteMint AI Receptionist**, a voice-and-SMS
receptionist that answers, qualifies and routes callers, and books time against the
business's real calendar.

Three surfaces, one codebase:

| Surface | Audience | Job |
|---|---|---|
| Company website | prospects for agency work | explain what SiteMint builds, prove it honestly, start a project |
| AI Receptionist application | paying business customers | configure, run and monitor the receptionist |
| Operations CRM | SiteMint staff | run the agency pipeline and support every receptionist customer |

## 2. The revenue priority

The AI Receptionist is the highest-priority revenue product. The agency website exists to
sell projects and to carry the product landing page; the CRM exists to run the business and
to support product customers. Every planning trade-off in this replan resolves in favour of
getting an invite-only private beta of the receptionist live, honestly, as soon as possible.

## 3. Product principles (carried from V4 decisions D1–D10 and the backend program)

1. **Honest by construction.** No invented clients, metrics, testimonials or "24/7" claims. A
   capability is described as live only after it is certified on the customer's own account.
2. **Safe by default.** Every provider capability is behind an exact-`"true"` flag, off by
   default; recordings and transcripts are never retained (`VOICE_ARTIFACT_POLICY=none`);
   the intake SMS number never touches Vapi.
3. **One product story per surface.** Marketing has no app chrome, the app has no marketing,
   the CRM is visibly internal. The user always knows which surface they are on.
4. **Contract-pinned frontend.** Every screen has a committed contract test; retheming is
   override-only; protected backend files are never edited.
5. **Certify, then expose.** Backend milestones (M2–M4, AR-002B) are proven on staging before
   the UI for them ships to customers.

## 4. Vision by surface

### Company website
An editorial, signal-themed site whose only conversion is "Start a Project" into a working
discovery intake, plus a canonical AI Receptionist landing page with a labelled simulated
demo until a live demo path is certified. Case studies appear only when real and consented.

### AI Receptionist application
A calm operations console for a business owner who is not technical:
"Is my receptionist healthy, what needs me, what did it do today." Guided onboarding to a
first successful browser test call; a single assistant per firm for the beta; availability,
appointment types and Google Calendar as first-class setup steps; appointments with the full
create / reschedule / cancel lifecycle; conversations and contacts in one place; usage and
limits visible before they bite; issues surfaced in plain language. SMS and human transfer
are "coming later" tiles until certified.

### Operations CRM
The existing agency CRM stays (it is stable and in daily use) and gains a **Receptionist
Operations** area: per-firm status, usage, open issues and support actions, backed by the
admin diagnostics routes that already exist. Dead "Soon" nav items go; breadcrumbs and one
scroll region come in.

## 5. Recommended domain model (not implemented)

| Host | Surface | Notes |
|---|---|---|
| `sitemintdigital.com` | company website | canonical |
| `sitemintdigital.com/ai-receptionist` | canonical product landing page | already the route |
| `ai-receptionist.sitemintdigital.com` | optional marketing redirect → the path above | DNS only |
| `app.sitemintdigital.com` | customer application (today `/ai-receptionist/dashboard`) | needs `BASE_PATH`, cookie scope, CORS allowlist changes (DESIGN-SPEC §9) |
| `ops.sitemintdigital.com` | Operations CRM (today `/admin/*`) | edge gating recommended |
| `api.sitemintdigital.com` | backend API | `CORS_ALLOWED_ORIGINS` must list the three web origins |

Cutover is a separate program after the private beta proves the product; the current
path-based layout is acceptable for invite-only customers.

## 6. What "done" means for the next two milestones

- **Owner preview accepted** — the owner has reviewed every surface in OWNER-REVIEW-WORKBOOK.md
  and returned KEEP / CHANGE / REMOVE / ADD decisions.
- **Invite-only private beta live** — AI-RECEPTIONIST-PRIVATE-BETA.md "required for private
  beta" column fully green on a deployed origin with one real paying firm.
- **Public launch** — PUBLIC-LAUNCH-CHECKLIST.md closed, legal approved, domains cut over.
