---
name: SiteMint Discovery Portal
description: Architecture decisions for the discovery form, admin portal, lead scoring, and proposal generation system.
---

## Key Architecture Decisions

### Admin Auth
- Session token generated once at server startup with `crypto.randomBytes(32)`
- Stored in memory in `artifacts/api-server/src/lib/admin-session.ts`
- `POST /api/admin/login` checks `ADMIN_PASSWORD` env var (default: `sitemint2024`)
- Returns the session token; frontend stores in `localStorage` as `adminToken`
- Protected routes validate `Authorization: Bearer <token>` header
- Token resets on server restart (users must re-login after API restart)

**Why:** Simple, zero-dependency auth appropriate for an internal tool. No session middleware or JWT library needed.

### Form Data Storage
- Full 11-section form stored as JSONB in `form_data` column
- Key fields (budget, timeline, leadScore, tags, etc.) extracted as typed columns for querying/sorting
- Table: `discovery_submissions` in `lib/db/src/schema/submissions.ts`

**Why:** JSONB gives flexibility for future form changes without migrations; extracted fields enable efficient filtering in the admin list.

### Lead Scoring
- Formula: Budget (max 3) + Timeline urgency (max 3) + Decision maker (max 3) + Pain keywords (max 2) = max 11
- Normalized: `round((raw / 11) * 10)`, clamped to 1–10
- Hot Lead ≥ 8, Warm Lead ≥ 5, Cold Lead ≤ 4

### Proposal/SOW Generation
- Template-based HTML generation, no AI required
- `generateProposal()` and `generateSOW()` in `artifacts/api-server/src/lib/generators.ts`
- Returns full self-contained HTML document with embedded CSS
- Stored in `generated_proposal` / `generated_sow` text columns after generation
- Frontend displays in an `<iframe>` inside a full-screen modal
- PDF export: use browser `window.print()` from the iframe → Save as PDF

### Package Recommendation Logic
- Premium: budget 5k-10k or 10k-plus, OR selected premium services (web-app, crm, automation, ai-chatbot, workflow-automation, membership features)
- Growth: budget 2.5k-5k, OR selected growth features (seo, blog, crm-integration, appointment-scheduling, online-payments)
- Essential: everything else

### Frontend Routing
- Admin routes (`/admin`, `/admin/dashboard`, `/admin/submissions/:id`) are placed BEFORE the Layout-wrapped catch-all in App.tsx
- Discovery form (`/discovery`) also outside the main Layout
- Wouter Switch: admin + discovery routes render without Navbar/Footer

**How to apply:** When adding new admin or standalone pages, add their Routes before the final `<Route>` catch-all that wraps the Layout.

### Email Service
- Uses Resend SDK (`resend` package in api-server)
- `RESEND_API_KEY` stored as a Replit secret
- From address: `onboarding@resend.dev` (Resend's shared domain — works without a custom domain)
- Team notification goes to `info.sitemint@gmail.com`
- All email logic in `artifacts/api-server/src/lib/email.ts` — call `sendFormEmails(FormSubmissionData)` which returns `{teamSent, clientSent, errors}`
- Every form submission is also written to `form_submissions` table with `emailTeamSent`/`emailClientSent` status columns
- If email fails, submission is still saved to DB (non-blocking)

**Why:** Resend was chosen over SendGrid for simpler API key setup with no domain verification required on the shared domain.

### Thank You Page
- Route: `/thank-you` — outside Layout, no Navbar/Footer
- Accepts query params: `?form=<label>&email=<address>`
- Auto-redirects to `/` after 8 seconds
- Both Contact form and Discovery form redirect here on success

### CSV Export
- `GET /api/admin/submissions/export/csv` — requires admin Bearer token
- Returns all discovery submissions as downloadable CSV
