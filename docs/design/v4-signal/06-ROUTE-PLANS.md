# V4 Route-by-Route Design Plan

Shared rules (apply to every route; per-route entries list only deltas):

- **Location indicator:** marketing = mono kicker breadcrumb + active nav underline + scroll-spy
  rail on chaptered pages; customer app = sidebar group/item active state + page header;
  operations = dark ops sidebar active state + "Operations" watermark. All set `aria-current`
  and `<title>`.
- **States:** every data surface defines empty (illustrated, one primary action, honest copy),
  loading (skeletons that reserve space, no spinners >400ms alone), error (inline retry + plain
  language), and disabled (visible reason, not just grey). Marketing pages: loading = text-first
  render, media deferred.
- **Mobile:** single column, media-first reflow, 44×44 targets, no horizontal overflow; app
  tables become card lists with the 2–3 highest-value fields.
- **Motion:** grammar tokens from 03-MOTION-GRAMMAR; one chapter reveal per section max;
  dashboards animate state changes only.
- **Proof/content:** no invented clients, metrics, or testimonials. Until verified case studies
  exist, Proof Architecture slots render "in progress" states.

---

## A. Public company site

### `/` Homepage
- Goal: understand what SiteMint builds and start a project. Primary action: **Start a Project**.
- Hierarchy: full-viewport cinematic hero (storyboard doc) → 01 Signal Map (lead journey diagram)
  → 02 What We Build (4 pillar cards assemble) → 03 Before/After Operations →
  04 Proof Architecture (honest coming-soon) → 05 How It Works preview → final CTA band.
- Components: progress rail 01–05, signal thread connectors, pillar cards, comparison slider,
  CTA band. Motion: hero scrub, thread draw, card assembly.
- Content required: real service descriptions, real process; no metrics until verifiable.

### `/what-we-build` Overview
- Goal: choose the right pillar. Primary: enter a pillar. Hierarchy: intro statement → Signal Map
  (interactive: click a stage highlights contributing pillars) → four pillar sections with
  editorial 5/7 splits → Build Your System selector → CTA.
- Motion: map stage transitions; selector morphs recommendation list.

### `/what-we-build/{websites|web-apps|crm-automation|ai-receptionist-systems}` (4 pillars)
- Goal: judge fit for a specific need. Primary: Start a Project (contextualized).
- Hierarchy: kicker breadcrumb → promise H1 → what it includes (deliverable list) → how it
  connects to the other pillars (mini signal map with this pillar lit) → process excerpt →
  honest proof slot → next-step band (Work / How It Works).
- Content: concrete deliverables and tooling; pillar 4 links to the AI Receptionist product page.

### `/work` Case studies index
- Goal: see evidence. Primary: open a case study (when real ones exist).
- Hierarchy: standards statement ("we publish only verified results, with client consent") →
  case study grid → empty state today: "Case studies in progress — ask us for references" +
  contact CTA. Hover depth on cards (scale 1.02 + shadow).

### `/work/{slug}` Case study detail (template)
- Hierarchy: client context → problem → system built (signal map instance) → verified outcomes
  (each with measurement method) → next-step band. Disabled until real content exists.

### `/how-it-works` Process
- Goal: trust the delivery process. Primary: Start a Project.
- Hierarchy: numbered process chapters (Discover → Design → Build → Connect → Operate) drawn
  along one continuous signal thread; each chapter: what happens, what you get, how long.
- Motion: thread draws between chapters; optional pinned step-sequence is **not** used (pin
  budget spent on homepage hero).

### `/about` About/team
- Goal: know who builds it. Primary: contact. Hierarchy: mission statement (editorial pull-quote
  voice) → how we work values → team (real people only; no stock faces) → CTA.

### `/contact` · `/start-a-project` Intake
- Goal: start a conversation with low friction. Primary: submit intake.
- Components: 3-step progressive form (about you → what you need [Build Your System selector
  reused] → context), visible labels, inline validation near fields, error summary on submit,
  success state states response expectation honestly. States: submit disabled only while
  in-flight; network error keeps input.

### `/ai-receptionist` Product marketing page
- Goal: evaluate the product; try the demo. Primary: Start (demo) / secondary Sign In + pricing
  CTA. Hierarchy: split hero — focused messaging left, **Receptionist Theater** right (states doc
  05) → how it answers/qualifies/books (conversation walkthrough, simulated + labeled) → SMS +
  voice together → pricing → FAQ → CTA. Motion: waveform states; walkthrough steps.

### `/privacy` · `/terms`
- Goal: read policy. Hierarchy: sticky in-page section nav, last-updated date, plain-language
  summaries per section. No motion.

### 404
- Broken-thread illustration; exits to Home / What We Build / Start a Project; search omitted.

## B. Customer application (`/ai-receptionist/dashboard`)

### Auth: sign in
- Goal: get in fast. Primary: sign in. Components: email+password, paste allowed, password
  manager friendly (accessible-authentication rule), rate-limit error state ("try again in X"),
  reset link. No marketing chrome; signal mark only. Error: inline, non-enumerating.

### Signup
- Goal: create firm account. 2 steps max (account → firm basics); everything else deferred to
  onboarding. States: server validation inline; duplicate email handled without enumeration.

### Onboarding / readiness
- Goal: reach "assistant ready" confidently. Primary: complete next step.
- Components: readiness checklist (number, greeting, hours, calendar) with per-item status
  (done/pending/blocked), each row deep-links to its screen. Progress = signal thread filling.
  Empty (new firm): checklist is the screen. This route is the app's orientation hub.

### Overview
- Goal: "is my receptionist healthy, what needs me". Primary: review flagged items.
- Components: status header (assistant state chip, number, hours), today's activity (calls,
  conversations, appointments), needs-attention list (amber), recent conversations preview.
  Loading: skeleton tiles. Empty: onboarding pointer. Motion: counters animate on change only.

### Assistants (list) · Assistant builder (detail)
- Goal: manage the assistant('s) config safely. Primary: edit → publish.
- Builder hierarchy: header (name, status Draft/Published, Publish button with confirm),
  tabbed sub-nav: **Prompt** · **Voice & Model** · behavior. Breadcrumb: Assistants / {name}.
  States: publish in-flight (button busy, disabled with reason), publish error (provider message
  humanized), unsaved-changes guard. Version note row (auto-versioning is provider behavior).

### Prompt
- Goal: shape what the assistant says. Components: structured prompt editor (greeting, business
  facts, boundaries), preview pane ("how a caller hears this", simulated + labeled), length/cost
  hint. Disabled while publish in-flight.

### Voice & model
- Goal: pick voice + model tier. Components: voice cards with play sample (user-initiated audio
  only), model tier selector with plain-language tradeoffs, live cost implication line.

### Appointments
- Goal: see what got booked. Components: list + calendar toggle (deep-linked), booking detail
  drawer, sync status per calendar integration. Empty: "no bookings yet" + check integrations.

### Conversations
- Goal: audit what the receptionist said. Components: filterable list (channel, outcome, date),
  transcript view honoring artifact policy (if policy = none, show metadata-only with explicit
  explanation — never pretend transcripts exist), opt-out badge on STOP conversations.

### Contacts
- Goal: see captured people. Components: table (name, number, source, last activity), detail
  drawer with conversation history links, CSV export. Mobile: card list.

### Integrations
- Goal: connect calendar/CRM. Components: provider cards with status (connected/error/available),
  scoped-permission explanation before OAuth, disconnect with consequence text. Error state per
  card with retry.

### Numbers & transfers
- Goal: manage phone number + human-escalation rules. Components: number card (provisioned
  number, capabilities), transfer rules list (hours-aware), test-call helper. Guard copy around
  SMS webhook sanctity (platform rule) surfaces as "managed by SiteMint" lock state.

### Usage / billing / limits
- Goal: understand consumption + pay. Components: current-period usage meters (minutes,
  conversations) with plan limits, invoice list, payment method, plan change with proration
  preview. States: payment failure banner (amber, action-first).

### Issues / monitoring
- Goal: see problems before customers do. Components: incident list (open/resolved), per-issue
  timeline, notification prefs. Empty: "all clear" state with last-checked time.

### Settings
- Goal: firm profile, hours, team, security. Grouped single page with anchored sections;
  destructive actions isolated at bottom with confirm pattern.

## C. Internal operations (CRM)

### Ops login wall
- Bearer-token login, dark ops skin from the first screen; failure states rate-limited.

### CRM overview
- Goal: today's pipeline + tasks at a glance. Components: pipeline funnel summary, task list due
  today, recent activity stream, lead-score movers. Dense (density-7 spacing).

### Leads & firms
- Goal: work the pipeline. Components: saved-view table (score, stage, last touch), row drawer
  (DISC/communication panels fed by locked engines — read-only consumers), stage kanban toggle.
  Deep-linked filters.

### Projects
- Goal: track delivery. Components: project table w/ health chips, milestone timeline detail.

### Forms & discovery
- Goal: review intake/discovery submissions. Components: submission queue with triage actions,
  link-to-lead.

### Voice operations
- Goal: monitor receptionist fleet across firms. Components: per-firm assistant status board,
  error-rate sparklines, publish audit trail. Strictly internal styling; no customer data
  leakage between firm rows beyond ops entitlement.

### Issues (ops)
- Goal: triage platform issues. Components: queue with severity, assignment, linked firm.

### Internal settings
- Goal: manage ops users/tokens. Minimal; destructive actions confirmed.
