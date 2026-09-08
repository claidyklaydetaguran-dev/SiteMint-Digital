# SiteMint — Business-Owner Content Audit (2026-09-08)

Owner directive: "BUSINESS-OWNER COMMUNICATION REDESIGN AND
PRODUCTION-SUBMISSION REPAIR". Audience: small/medium business owners.
Language hierarchy applied everywhere: 1) outcome → 2) plain explanation →
3) technical proof behind explicit disclosure.

Verification for every row: rendered in the prerendered build and passed
the plain-language guard (`qa-plainlang.mjs`, 16 public routes, 17-term
prohibited list, allowlist of exactly one documented false positive).

## 1. Rewritten copy (current wording → replacement, with reason)

### Navigation & chrome
| Where | Was | Now | Why |
|---|---|---|---|
| Header dropdown | What We Build | **Services** | audience label |
| Header link | Work | **Our Work** | audience label |
| Header link | Process | **How It Works** | audience label |
| Header link | Company | **About** | audience label |
| Footer column | What We Build | **Services** | consistency |
| Panel card | CRM & Internal Systems / "See every deal in one place" | **Business Systems** / "Keep everything in one place" | CRM translated |
| Panel card | AI Systems & Automation / "Never lose a follow-up" | **AI & Automation** / "Less repetitive work" | outcome-first |
| Panel card | SEO, Analytics & Growth / "Know what actually converts" | **Growth & Advertising** / "Know what's working" | jargon-free |
| 404 quick link | What We Build | **Services** | consistency |

### Homepage
| Element | Was | Now |
|---|---|---|
| Hero H1 | "Digital systems built to move your business forward." | **"Websites and business systems built to help you grow."** |
| Hero support | "SiteMint designs websites, web applications, CRM systems, AI automation, and custom software…" | **"SiteMint helps you attract customers, organize inquiries, follow up faster, and reduce repetitive work—all through one carefully planned digital experience."** |
| Primary CTA | Build Your SiteMint System | **Plan My Project** |
| Secondary CTA | Explore What We Build | **See What We Build** |
| Capability heading | "Nine capabilities. One connected system." | **"Everything your business needs to grow and stay organized."** |
| Capability lede | "…draws from the same nine capabilities…" | **"Start with one service or connect everything—from your website and customer inquiries to follow-up, daily operations, and AI-assisted support."** |
| Capability layout | 9 numbered rows (Strategy & Discovery … Ongoing Support) | **4 owner-goal groups** (Attract customers · Organize the business · Follow up consistently · Improve over time), every original capability preserved inside a group, each with a "View details" link to its full service page |
| Journey stages | Website · Capture · CRM record · Automation · AI conversation · Resolved outcome | **Customer visits · Inquiry received · Details organized · Follow-up assigned · Routine handled · Customer helped** |
| Journey heading | "…from first click to resolved outcome." | **"…from first visit to a customer helped."** |
| Journey tech layer | (inline) | **"What happens behind the scenes" `<details>` panel** holding the original component vocabulary (`data-tech-detail`, guard-allowlisted by design) |
| CRM section lede | "pipeline, tasks, and records" | **"customer details, tasks, and records"** (formData-preserving copy edits also on /about, /work, /pricing) |
| Team bio (Technical Director) | "Leads the architecture and engineering…" | **"Leads the design and engineering…"** |

### Service pages (above-the-fold pattern: who it's for → problem → deliverable → what improves → next action; all four heroes already carry eyebrow → H1 → lede → CTA)
| Page | Was | Now |
|---|---|---|
| /websites-apps | "A website that knows what happens next." | **"A website that turns attention into action."** |
| /ai-systems | "Less handoff. Less busywork. More momentum." | **"Keep your customers, tasks, and team in one organized place."** |
| /automation | "Less handoff. Less busywork. More momentum." (duplicate) | **"Spend less time on repetitive work."** |
| /services H1 | "Nine capabilities. One connected SiteMint build." | **"Everything your business needs to grow and stay organized."** |
| /services growth entry | "The tracking that has to work before ad spend does." + pixels/webhooks/attribution desc | **"Know where your leads come from and what is working."** + plain measurement description |
| /ai-receptionist H1 | "Missed calls shouldn't mean missed opportunities." | **"Help every caller, even when your team is busy."** + plain six-point supporting line |
| /discovery-systems | "Turn first contact into a useful brief." | unchanged (already plain, scores 6/6) |

### Discovery planner (presentation only; validation/fields/submission untouched)
| Was | Now |
|---|---|
| Project Starting Point | **Where are you starting?** |
| System or Service Needed | **What would you like us to build?** |
| Business and Audience | **Tell us about your business and customers** |
| Brand and Visual Direction | **How should it look and feel?** |
| Content and Functionality | **What should customers be able to do?** |
| Systems and Integrations | **What tools do you already use?** |
| Growth, Advertising, and Tracking | **Would you like help attracting more customers?** |
| Delivery, Budget, and Contact | **Timeline, investment, and contact** |
| Review | **Review your project plan** |
| Welcome: "Tell us what you're building" | **"Let's plan your project together"** + "you describe the outcome you want — we choose the right way to build it" |
| "An internal CRM or lead management system" | **"One place to track customers and follow-up (a CRM)"** — term defined beside itself |
| "Do you have ad pixels or conversion tracking configured?" | **"Can you already see which ads bring you customers?"** with the term defined in-line |
| placeholder "…webhooks to your CRM" | **"…Google Calendar"**; label adds "just name them; we'll figure out the how" |

### Customer dashboard
| Was | Now |
|---|---|
| "Sending this configuration to the voice provider." | **"Applying your receptionist settings to the phone system."** |
| "There is nothing to send to the voice provider right now." | **"Your receptionist settings are already up to date."** |
| (rest of the dashboard) | already business-toned (Calls, Conversations, Contacts, Appointments, Availability, Business hours, Billing) — verified by screenshot audit; internal error CODES retained (not user-visible) |

## 2. Plain-language guard results
21 prohibited-term hits found on the first run across 11 routes
(webhook ×4, pipeline ×10, architecture ×3, trigger, provider ×2,
deployment); 20 rewritten (inventory above), 1 documented allowlist entry
("local service **providers**" on /pricing = the audience, not a vendor).
Final run: **0 hits across all 16 guarded routes** (see verification log).
/privacy and /terms are exempt as legal documents.

## 3. Section scoring (5-second understanding · problem clear · outcome clear · next action clear · no unexplained jargon · visual supports · truthful)
All public sections re-scored after the rewrite: **every section ≥ 5/6,
headline sections 6/6.** Pre-rewrite failures (home ledger 3/6 — jargon +
9-way scan burden; services hero 4/6; receptionist hero 4/6 — feature-first;
discovery rail 3/6 — requirements-form tone) are the rows rewritten above.

## 4. Operations CRM (staff-only)
Kept operationally detailed per the directive. This pass verified labels
already lean on business tasks (Command Center, My Day / Tasks, Leads
Needing Follow-Up, Hot Leads to Review) after the 2026-09-08 mint
discipline pass. Follow-up backlog (documented, not blocking): fold the
Receptionist-Ops diagnostics pages behind an explicit Diagnostics group,
and reorder the sidebar to the directive's queue-first priority list.

## 5. Production Discovery repair (P0) — see PRODUCTION-DISCOVERY-REPAIR.sql
Root cause chain, all proven:
1. The visible "Submissions are not open yet." page is the frontend's
   honest submit-time 503 state — the nine-step planner itself always
   renders; there is no version mismatch, cache, service-worker, or
   apex-vs-Replit divergence (all three hosts answer identically).
2. The deployed backend's `/api/v1/discovery-submissions` fail-closes
   because `DISCOVERY_FINGERPRINT_HMAC_KEY` was never provisioned — and
   even provisioned, the deployed v1 route only queues delivery jobs for
   a worker that was never built (no acknowledgment email, no CRM lead),
   and the deployed Operations views read the legacy tables.
3. The deployed **legacy** `/api/discovery/submit` is open and complete
   (validate → lead score → tags → discovery + form records → team AND
   client acknowledgment emails, inline) — but its insert fails with
   `column "schema_version" of relation "discovery_submissions" does not
   exist`: the reviewed additive migration was never applied to the
   production database (the known shared-journal skip).
Repair shipped in this branch: the planner now submits through the legacy
route via a lossless bridge (`buildLegacyDiscoverySubmitBody` — full
structured answers preserved in the record's formData; 201 + id maps to
the reference the visitor sees). Remaining production step: apply the
15-statement idempotent SQL (owner action; the session was
permission-blocked from executing production DDL), then the controlled
synthetic end-to-end test completes the acceptance list.
