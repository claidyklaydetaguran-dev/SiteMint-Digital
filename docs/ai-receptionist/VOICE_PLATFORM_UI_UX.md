# SiteMint Voice Platform — Revised Product & UI/UX Blueprint

> **Status:** Approved
> **Approved scope:** Checkpoints B1, B2, B3 (UI-only, under Milestone 1)
> **Existing SMS receptionist must remain operational** — the `/receptionist` AgentConfig
> route stays fully accessible and is not replaced, redirected, or hidden (see §23).
> **Production voice feature flag defaults off** — `VITE_VOICE_PLATFORM_ENABLED` defaults to
> `false` in production; no secrets are exposed through it (see §22).

## Context

SiteMint is turning its shipped **SMS AI Receptionist** into a full **voice + messaging
platform** for business owners. Today the product is SMS-only: `intake_firms` (per-firm
agent config), `intake_conversations`/`intake_messages`, `intake_cases` (scored leads),
cookie auth, and Stripe billing — rendered by a React 18 + wouter + Tailwind v4 +
shadcn/Radix SPA at `/ai-receptionist/dashboard`. Everything voice (assistants, tools,
phone numbers, voice library, appointments, call logs, analytics, knowledge base) is
**greenfield**.

The existing docs define Milestone 1 as Checkpoints A–G, where **Checkpoint B** is a
one-line scope — *"dark/light design system + collapsible grouped shell + global error
boundary"* — with **no detailed PRD**. This blueprint fills that vacuum: it re-establishes
the whole product direction (Vapi-inspired IA, original SiteMint branding) and specifies a
concrete, buildable Checkpoint B.

**Intended outcome:** a premium, mint-branded, light-first (with polished dark mode)
foundation that ships a real, visible product surface — shell + Overview + Assistants
list/builder — without pretending unbuilt features work or fabricating metrics.

**Constraints carried from repo docs (binding):**
- Backend/SMS files remain absolutely locked (intakeAgent, intakeTwilio, intakeOptOut,
  intakeScoring, receptionistAuth/Conversations/AgentConfig/Billing, phone.ts, CRM engines,
  `schema/intakeAgent.ts`). Checkpoint B is **UI-only**.
- `opted_out` behavior in Inbox must not regress.
- Vapi never surfaces in UI/branding. `VOICE_PLATFORM_ENABLED` off in production.
- Never fabricate customer metrics; cost/latency shown as clearly-labeled **estimates**.
- Don't import the SMS intake number into Vapi or change its Messaging webhook.

**Locked design decisions (from owner):**
- Checkpoint B = tokens + shell + error boundary + redesigned Overview + Assistants list +
  template picker + builder shell (8 tabs) + cost/latency UI as labeled estimates. No
  backend, DB, Vapi, phone, tools, or fake performance data.
- Typography: **Plus Jakarta Sans** (UI/body) + **Playfair Display** (display headings).
- Color: **deep evergreen = primary action**; **bright mint `#34D399` = accent/highlight/glow/data**.

---

## 1. Product Positioning

**SiteMint AI Receptionist** — a premium AI receptionist that answers calls, books
appointments, qualifies leads, and never misses a customer moment.

- **Audience:** owners of service businesses (clinics, law firms, real estate, trades,
  salons) — not developers.
- **Promise:** Vapi-level capability delivered through a calmer, business-friendly,
  outcome-oriented experience. The dashboard talks in *calls answered, appointments booked,
  hours saved* — never in tokens, clusters, or provider jargon.
- **Personality:** premium, expensive, modern, technical, trustworthy, interactive. Light
  and spacious by default; an equally polished green-charcoal dark mode. Strongly and
  tastefully SiteMint-branded (mint accent, diamond mark, editorial serif headings).
- **Differentiators vs. Vapi/Solvea:** business language over engineering language;
  appointment-first workflow; honest metrics; a guided assistant builder with templates and
  advisory cost/latency; provider complexity hidden behind "Advanced."
- **Brand voice:** "We build business tools, not art projects." Plain, confident,
  outcome-focused. Never miss a customer moment.

Vapi/Solvea inform **information architecture and interaction patterns only** — all copy,
components, layouts, and visuals are original SiteMint.

---

## 2. Information Architecture

Four functional pillars matching how an owner thinks: **BUILD** (configure the receptionist),
**OPERATE** (run the business day-to-day), **OBSERVE** (see what happened), **MANAGE**
(account plumbing). Overview sits above the pillars as the home.

```
Overview  (home / daily briefing)

BUILD      → Assistants ▸ Tools ▸ Phone Numbers ▸ Voice Library ▸ Knowledge Base ▸ [Squads·later]
OPERATE    → Appointments ▸ Conversations ▸ Contacts ▸ [Outbound·later]
OBSERVE    → Call Logs ▸ Analytics ▸ Testing ▸ Structured Outputs ▸ [Issues·later]
MANAGE     → Integrations ▸ Billing ▸ Settings ▸ [API Keys·advanced]
```

- **Assistants** is the center of gravity; most journeys start or end there.
- **Integration ≠ Tool:** an *Integration* is a connected account/credential (Manage →
  Integrations); a *Tool* is an action assigned to an assistant (Build → Tools, and the
  Tools tab inside a builder). This separation is enforced in nav, copy, and data model.
- **Call Logs** is a consolidated logs hub with sub-tabs: **Calls · Chat · Sessions ·
  Webhooks**.
- Deferred items are visible but disabled with a "Later" chip (discoverability without dead
  ends). API Keys lives under an "Advanced" reveal.

---

## 3. Final Navigation

**Sidebar structure** (collapsible, grouped, with usage + account controls):

| Group | Item | Icon (lucide) | Route | State in Checkpoint B |
|---|---|---|---|---|
| — | Overview | LayoutDashboard | `/` | **Live** |
| BUILD | Assistants | Bot | `/assistants` | **Live (UI shell)** |
| BUILD | Tools | Wrench | `/tools` | Placeholder page |
| BUILD | Phone Numbers | Phone | `/phone-numbers` | Placeholder page |
| BUILD | Voice Library | AudioLines | `/voice-library` | Placeholder page |
| BUILD | Knowledge Base | BookOpen | `/knowledge` | Placeholder page |
| BUILD | Squads · Later | Users | — | Disabled + "Later" chip |
| OPERATE | Appointments | CalendarDays | `/appointments` | Placeholder page |
| OPERATE | Conversations | MessageSquare | `/conversations` | **Live (retokenized)** |
| OPERATE | Contacts | Contact | `/contacts` | **Live (retokenized stub)** |
| OPERATE | Outbound · Later | PhoneOutgoing | — | Disabled + "Later" chip |
| OBSERVE | Call Logs | ScrollText | `/logs` | Placeholder page |
| OBSERVE | Analytics | BarChart3 | `/analytics` | Placeholder page |
| OBSERVE | Testing | FlaskConical | `/testing` | Placeholder page |
| OBSERVE | Structured Outputs | Braces | `/structured-outputs` | Placeholder page |
| OBSERVE | Issues · Later | AlertTriangle | — | Disabled + "Later" chip |
| MANAGE | Integrations | Plug | `/integrations` | Placeholder page |
| MANAGE | Billing | CreditCard | `/billing` | **Live (retokenized)** |
| MANAGE | Settings | Settings | `/settings` | **Live (retokenized)** |
| MANAGE | API Keys · Advanced | KeyRound | `/settings/api-keys` | Under Advanced reveal |

**Sidebar behaviors (all in Checkpoint B):**
- **Expanded (default ≥1024px, 248px):** brand mark + wordmark at top; grouped sections with
  uppercase labels; active item = mint left-rail indicator + evergreen text + pale-mint pill;
  hover elevate. Bottom: **usage meter** (trial conversations / plan), **theme toggle**,
  **account menu** (firm avatar/initials → Settings, Billing, Sign out).
- **Collapsed (72px, user-toggled, persisted in localStorage):** icon-only rail; group labels
  become thin dividers; every item shows a Radix tooltip on hover/focus; brand collapses to the
  diamond mark; usage becomes a compact ring.
- **Mobile (<768px):** sidebar hidden; 56px top bar with hamburger + page title + account
  avatar; hamburger opens a Radix/vaul drawer reusing the same nav; drawer closes on route
  change; focus-trapped.
- **Tablet (768–1023px):** collapsed rail by default, expandable.
- Active state derived from route (wouter `useLocation`), including nested builder routes
  (`/assistants/:id/*` keeps Assistants active).

---

## 4. Feature Priority Matrix

| Feature | Priority | Checkpoint B (UI) | Backend milestone | Notes |
|---|---|---|---|---|
| Design system + shell + error boundary | P0 | ✅ Full | — | Foundation |
| Overview (real data + honest empties) | P0 | ✅ Full | Existing intake data | No fabricated metrics |
| Assistants list | P0 | ✅ UI shell | M1 CRUD later | Empty/loading/mock-free |
| Assistant templates picker | P0 | ✅ UI | M1 | 8 templates |
| Assistant builder (8 tabs) | P0 | ✅ Shell + forms | M1 persist later | Local state only in B |
| Cost/latency estimate components | P0 | ✅ Labeled estimates | Real data later | Advisory ranges |
| Conversations (retokenized) | P0 | ✅ Preserve behavior | Exists | opted_out must not regress |
| Billing / Settings / Contacts (retokenized) | P1 | ✅ Reskin | Exists/stub | — |
| Voice Library | P1 | Placeholder | M1/M2 | Curated ElevenLabs later |
| Phone Numbers | P1 | Placeholder | M2 | Get/Connect flows later |
| Tools | P1 | Placeholder | M4 | 7 first tools |
| Appointments Calendar | P1 | Placeholder | M2/M3 | Full calendar later |
| Call Logs (Calls/Chat/Sessions/Webhooks) | P1 | Placeholder | M2 | — |
| Analytics | P1 | Placeholder | M5 | Business metrics |
| Testing (browser call) | P1 | Placeholder | M1 F | — |
| Structured Outputs | P2 | Placeholder | M3 | — |
| Knowledge Base | P2 | Placeholder | M4 | — |
| Integrations | P2 | Placeholder | M4/M5 | — |
| Squads / Outbound / Issues / Boards / Evals | Deferred | Disabled chips | Post-M5 | See §20 |

---

## 5. Screen-by-Screen Specifications

Every screen shares the app-shell chrome (§3) and a standard **PageHeader** (Playfair display
title, sub-line, right-aligned primary action). Screens marked *Placeholder* in Checkpoint B
render a branded "Coming soon" scaffold: PageHeader + illustrated EmptyState describing the
feature + a disabled primary CTA, so the IA is navigable and demoable without faking function.

**5.1 Overview (Live).** Daily briefing. Greeting ("Good morning, {firm}") + date + assistant
status pill. **KPI row** of business metrics that map to real data today, with honest empty
states for voice metrics not yet available (see §14). A "This week" trend area (recharts) driven
by real conversation timestamps. Getting-started checklist (dismissible). Recent conversations
list. Any metric without real data shows a muted "No data yet" tile, never a fabricated number.

**5.2 Assistants — List (Live UI).** Search field; "New Assistant" primary CTA; view toggle
(cards default / table). Each assistant row/card: name, template badge, **status** (Draft /
Published), **sync status** (Not synced / Synced / Syncing — shown as neutral chips, provider
name hidden), assigned phone number, voice name, calls (count), appointments (count), success
rate, last updated; row actions: **Test**, **Duplicate**, **Delete (guarded — type-to-confirm)**.
In Checkpoint B the list renders from local/empty state with a strong empty state ("Create your
first assistant") — no fabricated rows.

**5.3 Assistants — Create / Template Picker (Live UI).** Modal or full page. Grid of 8 template
cards, each with icon, name, one-line outcome, and "what it does" preview: **AI Receptionist,
Appointment Setter, Lead Qualification, Customer Support, After-Hours Receptionist, Real Estate
Inquiry Assistant, Law Firm Intake Assistant, Blank Assistant.** Selecting a template opens the
builder pre-filled (locally). "Start from blank" for Blank.

**5.4 Assistant — Builder (Live UI shell).** See §6.

**5.5 Tools (Placeholder).** Will list assignable actions grouped by integration; "Integration
vs Tool" explainer banner. First tools listed in copy: Google Calendar Check Availability,
Google Calendar Create Event, Google Sheets Add Row, Human Transfer, End Call, Send Text, Custom
API Request.

**5.6 Phone Numbers (Placeholder).** Two customer-facing cards — **Get a SiteMint Number** /
**Connect Existing Number** — provider details hidden behind "Advanced." Copy notes the SMS
intake number is protected and never re-pointed.

**5.7 Voice Library (Placeholder).** Curated ElevenLabs grid: search + filters (gender, accent,
language, style), preview audio with animated waveform, favorites, "Assign to assistant."

**5.8 Knowledge Base (Placeholder).** Sources an assistant can reference; upload/URL/FAQ entries.

**5.9 Appointments (Placeholder → spec in §7).** Calendar hub.

**5.10 Conversations (Live, retokenized).** Existing 3-pane inbox reskinned to new tokens +
dark mode. Behavior preserved exactly: tier filters, "why this tier," date separators, and
**opted_out** badge/category/notice untouched.

**5.11 Contacts (Live, retokenized stub).** Reskin existing placeholder; empty state with future
value prop.

**5.12 Call Logs (Placeholder).** Sub-tabs **Calls · Chat · Sessions · Webhooks**. Calls table
columns and Call-detail layout specified in §14 for later build.

**5.13 Analytics (Placeholder).** Business-metric dashboard (§ Overview/Analytics list).

**5.14 Testing (Placeholder).** Browser voice call + text test + live transcript + call state +
tool calls + cost + latency + errors + test history. (Not a clone of Vapi Test Suites.)

**5.15 Structured Outputs (Placeholder).** Schemas the assistant extracts per call.

**5.16 Integrations (Placeholder).** Connected accounts (Google Calendar/Sheets, telephony,
voice/model providers) as connect-cards. Explicitly the "credentials" layer, distinct from Tools.

**5.17 Billing (Live, retokenized).** Existing plan/usage tabs reskinned; Stripe flow untouched.

**5.18 Settings (Live, retokenized).** Members/Language panels reskinned; **API Keys** under an
"Advanced" section.

**5.19 Login (Live, retokenized).** Branded split layout, mint accent, dark-mode aware.

---

## 6. Assistant-Builder Wireframe Description

Full-height two-region layout under the shell:

```
┌ PageHeader: ‹ Assistants   [Assistant name, inline-editable]   [Draft ▾]  [Test ▸] [Publish] ┐
├───────────────────────────────────────────────────────────────────────────────────────────┤
│  Left: vertical Tab rail (sticky)      │  Right: active tab panel (scrolls)                  │
│  ● Setup                               │                                                     │
│  ○ Prompt                              │   [ tab content ]                                   │
│  ○ Voice & Model                       │                                                     │
│  ○ Tools                               │                                                     │
│  ○ Knowledge                           │   ── sticky footer: Estimated cost ~$/min ·         │
│  ○ Testing                             │      Latency ~xxx ms (Estimate)  [Save draft]       │
│  ○ Analysis                            │                                                     │
│  ○ Advanced                            │                                                     │
└───────────────────────────────────────┴─────────────────────────────────────────────────────┘
```

Mobile: tab rail becomes a horizontal scrollable segmented control; footer estimate collapses
into a tappable summary chip.

**Tabs (Checkpoint B renders forms with local state; no persistence/provider calls):**
- **Setup:** assistant name, business name, role, industry, primary goal, timezone, language,
  assigned number (select — disabled/"connect later" chip in B).
- **Prompt:** first-message mode (assistant-speaks-first / wait-for-caller), first message,
  system instructions, personality, objectives, information to collect (repeatable list),
  escalation rules, prohibited behavior, call-ending rules. **AI-assist**: "Generate" and
  "Improve" buttons (UI affordances + disabled/"available after connect" state in B) with char
  counters.
- **Voice & Model:** preset selector — **Natural & Balanced, Fast Response, Highest
  Intelligence, Budget Friendly, Custom.** Default stack shown as friendly labels ("Conversational
  model," "Natural voice," "Accurate transcription," "SiteMint voice runtime") — no provider
  names in normal view; provider detail only under Advanced. **CostBreakdown** + **LatencyMeter**
  with component breakdown (model / voice / transcription / runtime), all tagged **"Estimate."**
- **Tools:** assignable actions list (the 7 first tools) with on/off; explainer that tools are
  actions, integrations are accounts. In B: cards visible, toggles disabled with "Connect an
  integration first" hint.
- **Knowledge:** attach knowledge sources (placeholder list + upload affordance, disabled in B).
- **Testing:** in-builder browser-call + text-test panel scaffold, live-transcript pane, state
  chips (idle/connecting/in-call), cost/latency readout — all disabled-with-explanation in B.
- **Analysis:** post-call analysis config (summary, structured outputs, success criteria) —
  form scaffold in B.
- **Advanced:** provider stack detail, model/voice IDs, transcriber, timeouts, raw overrides —
  the only place provider names appear; gated behind an "Advanced settings" disclosure.

**Latency guidance (advisory, non-alarming — replaces the old "sub-800ms sounds robotic" claim):**
- < 700 ms — **Excellent**
- 700–1000 ms — **Natural**
- 1000–1200 ms — **Acceptable**
- \> 1200 ms — **Delayed**

Rendered as a horizontal LatencyMeter with four zones and a marker; label + color follow the band
(mint→evergreen for good, amber for acceptable, rose for delayed).

---

## 7. Appointments-Calendar Specification

A dedicated OPERATE screen (placeholder scaffold in B; full spec for later build):

- **Views:** Month · Week · Day · Agenda (segmented control; keyboard `M/W/D/A`).
- **Data on calendar:** booked appointments (colored by status), business availability
  (working hours shading), blocked times, timezone indicator.
- **Appointment statuses:** Requested, Confirmed, Rescheduled, Completed, Cancelled, No-show
  (distinct chip colors from the semantic palette).
- **Event detail drawer:** customer details, assigned assistant, source channel (voice / SMS /
  manual), timezone, start/end, status; actions **Reschedule**, **Cancel**, and **link to the
  originating call/transcript**.
- **Manual booking:** "New appointment" creates an event (owner-entered).
- **Google Calendar connection state:** a persistent banner/badge showing Connected /
  Disconnected with a "Connect" CTA routing to Integrations. Provider sync is a display concern;
  the Integration owns the credential.
- **Empty state:** "No appointments yet — your assistant will book them here."
- Responsive: month grid collapses to Agenda list on mobile.

---

## 8. Component Library

New shared components live in `artifacts/helpdesk/src/components/` (extracting today's
inlined-per-page components into a real library). Built on existing shadcn primitives.

**Layout / chrome:** `AppShell`, `Sidebar`, `SidebarSection`, `SidebarItem` (with tooltip +
active rail), `SidebarUsageMeter`, `AccountMenu`, `ThemeToggle`, `MobileNavDrawer`, `Topbar`,
`PageHeader`, `ErrorBoundary`, `SiteMintLogo` (ported from web-agency), `AppFooterBrand`.

**Data display:** `KpiTile` (icon chip + Playfair-adjacent numeral + label + optional
`StatDelta`), `StatDelta` (▲/▼ with color), `StatusBadge`, `SyncBadge`, `TierBadge` (reuse tier
map), `Tag`/`Chip`, `MetricEstimate` (renders a value with a required "Estimate" affordance),
`CostBreakdown`, `LatencyMeter` (4-band advisory), `Waveform` (animated placeholder, no audio in
B), `DataTable` wrapper (sort/filter chips over shadcn table), `EmptyState` (illustration +
title + body + CTA), `ComingSoon` (branded placeholder page).

**Inputs / builder:** `TabRail`, `FormSection`, `LabeledField`, `CharCountField`, `RepeatableList`
(info-to-collect / objectives), `PresetSelector` (Voice & Model cards), `TemplateCard`,
`GuardedDeleteDialog` (type-to-confirm), `SearchInput`, `FilterBar`, `SegmentedControl`.

**Feedback:** `Toast`/`sonner` (exists), `SkeletonRow`/`SkeletonCard`, `InlineError`,
`SuccessCheck`.

All components are theme-token driven (no hardcoded palette classes) and dark-mode complete.

---

## 9. Design Tokens

Authored in `artifacts/helpdesk/src/index.css` as Tailwind v4 `@theme inline` + `:root`/`.dark`
HSL variables (matching repo convention). Anchored to the real brand mark (mint `#34D399` on navy
`#1E293B`).

**Core palette**
| Token | Light (HSL) | Dark (HSL) | Role |
|---|---|---|---|
| `--background` | `150 22% 99%` (warm white) | `160 22% 7%` (green-charcoal) | app bg |
| `--surface` / `--card` | `0 0% 100%` | `158 18% 10%` | cards |
| `--surface-muted` | `152 38% 96%` (pale mint) | `158 16% 13%` | subtle fills |
| `--foreground` | `160 25% 10%` | `150 20% 92%` | text |
| `--muted-foreground` | `155 10% 40%` | `150 8% 62%` | secondary text |
| `--primary` (evergreen) | `160 76% 22%` | `160 55% 45%` | primary actions |
| `--primary-foreground` | `150 30% 98%` | `160 30% 8%` | on-primary |
| `--accent` (mint) | `160 64% 50%` (#34D399) | `160 64% 55%` | highlight/glow/data |
| `--accent-foreground` | `160 30% 12%` | `160 30% 10%` | on-accent |
| `--border` | `152 16% 88%` | `158 14% 20%` | hairlines |
| `--ring` | `160 64% 50%` | `160 64% 55%` | focus ring (mint) |

**Semantic**
| Token | Light | Meaning |
|---|---|---|
| `--success` | `152 60% 42%` | booked/qualified/synced |
| `--warning` | `38 92% 50%` | attention/over-cap |
| `--destructive` | `356 72% 52%` | delete/failed |
| `--info` | `199 80% 44%` | neutral info |
| `--chart-1..6` | mint · evergreen · teal · gold · coral · slate | data viz |

**Scale tokens**
- `--radius: 0.75rem` (cards 12px, controls 8px, pills full).
- **Spacing:** 4px base; section padding 24–32px; content max-width 1200–1360px (spacious).
- **Shadows:** green-charcoal-tinted, low-opacity layered — `--shadow-xs..2xl`; special
  `--shadow-mint-glow` (mint at ~18% for hovered primary CTAs / focus emphasis).
- **Typography:** `--font-display: 'Playfair Display', serif` (page/section/hero headings only);
  `--font-sans: 'Plus Jakarta Sans', system-ui, sans-serif` (all UI/body); `--font-mono: Menlo`
  (IDs, latency, code). Numerals use `font-variant-numeric: tabular-nums`. Full `--text-xs..7xl`
  scale retained.
- **Motion tokens:** `--ease-standard: cubic-bezier(.2,.8,.2,1)`, `--ease-emphasized:
  cubic-bezier(.2,.9,.1,1)`, durations `--dur-fast 120ms / --dur 200ms / --dur-slow 320ms`.

`next-themes` (already installed) is wired to toggle `.dark` on `<html>`; persisted, respects
`prefers-color-scheme`, no flash (blocking inline script or `suppressHydrationWarning` pattern).

---

## 10. Light & Dark Visual Direction

**Light (primary experience):** warm white canvas, white cards with pale-mint hairline borders
and soft green-tinted shadows; generous whitespace; Playfair display headings in near-black
green-ink; mint used sparingly — active nav rail, focus rings, data highlights, one glow on the
main CTA. Evergreen primary buttons. Feels like Stripe/Linear with a mint signature: calm,
expensive, technical.

**Dark (equally polished):** deep green-charcoal (`#0E1712`-family) surfaces, not pure black;
elevated cards one step lighter with subtle mint-tinted borders; mint becomes slightly brighter
and does more visual lifting (rails, accents, chart lines, glows read beautifully on dark);
primary actions shift to a brighter evergreen/mint-green for contrast. Shadows soften; a faint
mint ambient glow on key surfaces conveys "premium/technical." Never a straight inversion —
independently tuned for contrast and mood.

Both modes: AA contrast on all text; mint reserved as accent (never body text on white); the
diamond mark and wordmark adapt (mint stays constant; ink/wordmark swaps).

---

## 11. Responsive Behavior

- **≥1280px:** full shell, expanded sidebar (248px), multi-column dashboards, builder side rail.
- **1024–1279px:** sidebar expanded or collapsible; content reflows to 2-col.
- **768–1023px (tablet):** sidebar collapses to 72px icon rail (tooltips); dashboards 1–2 col;
  builder tab-rail may become horizontal.
- **<768px (mobile):** sidebar → top bar + drawer; all grids single-column; tables become stacked
  cards or horizontally scroll inside an `overflow-x-auto` container (page never scrolls
  horizontally); builder tabs → horizontal segmented control; sticky footer estimate collapses to
  a chip; calendar defaults to Agenda.
- Touch targets ≥44px; primary CTAs full-width on mobile; drawers use vaul for native feel.
- Conversations 3-pane preserves its existing responsive two-branch mobile behavior.

---

## 12. Animation & Interaction Rules

Purposeful, quick, physical — never decorative-for-its-own-sake. `framer-motion` (installed) for
orchestration; CSS transitions for hovers.

- **Sidebar collapse/expand:** width + label fade, 200ms `--ease-emphasized`; icons stay put.
- **Route transitions:** 120–160ms content fade/slide-up (8px); respect layout stability.
- **Cards/rows:** hover elevate (existing `.hover-elevate`) + 1px border-color shift, 120ms;
  active press scale 0.99.
- **Primary CTA:** subtle mint-glow on hover/focus (`--shadow-mint-glow`), 200ms.
- **KPI numbers:** count-up on first mount (~500ms, `tabular-nums`), only for real data.
- **Waveform placeholder:** gentle looping amplitude animation to signal "voice" without audio.
- **Drawers/modals:** 240ms emphasized ease in, 180ms out; backdrop fade.
- **Toasts:** slide+fade from bottom-right (sonner).
- **Skeletons:** shimmer via `tw-animate-css`.
- **Reduced motion:** all of the above gated on `prefers-reduced-motion: reduce` → fades only /
  no transforms / no count-up.

---

## 13. Accessibility Requirements

- **Contrast:** AA minimum (4.5:1 text, 3:1 large/UI) in both themes; evergreen-on-warm-white and
  all mint usages validated; never rely on mint alone to convey state (pair with icon/label).
- **Keyboard:** full tab order; sidebar items focusable with visible focus ring (mint); collapsed
  rail tooltips triggered on focus; builder tab rail arrow-key navigable (Radix Tabs); guarded
  delete reachable and Escape-cancellable; drawer/modal focus-trapped + restore focus on close.
- **Semantics/ARIA:** `role="navigation"` + `aria-current="page"` on active item;
  `role="main"` landmark; headings hierarchical; icon-only controls have `aria-label`; live
  regions for toasts and async state ("Saving…", "Saved").
- **Forms:** label-for every field; error text linked via `aria-describedby`; char counters
  announced politely.
- **Motion/theme:** honors `prefers-reduced-motion` and `prefers-color-scheme`; theme toggle has
  accessible name + pressed state.
- **Tables:** proper `<th scope>`, sortable headers announce sort state.
- Screen-reader smoke pass on Overview, Assistants list, and builder before B is "done."

---

## 14. Data Requirements per Screen

Checkpoint B is UI-only: **Live** screens read existing `/api` endpoints; **Placeholder** screens
render scaffolds with no data. No new endpoints, no fabricated values.

| Screen | Data source (today) | In Checkpoint B |
|---|---|---|
| Overview | `GET /receptionist/auth/me` (firm, conversationCount), `GET /receptionist/conversations` (list → derive counts, tiers, recent) | Real: total/this-week conversations, hot/warm leads (from `intake_cases.tier`), trial usage. Honest empty tiles for voice-only metrics (calls answered, appts, hours saved, voice cost) — "No data yet" |
| Assistants list | none (greenfield) | Local/empty state; strong empty CTA; **no mock rows** |
| Template picker | static template definitions (front-end constants) | Real (static content) |
| Builder | none | Local component state only; estimates labeled; no save/provider calls |
| Conversations | `GET /receptionist/conversations`, `GET /conversations/:id` | Real, unchanged behavior (opted_out preserved) |
| Contacts | stub | Retokenized empty state |
| Billing | `GET /receptionist/billing/*` via existing UI | Real, unchanged |
| Settings | existing agent-config/members endpoints | Real, unchanged |
| Tools / Phone / Voice Library / Knowledge / Appointments / Call Logs / Analytics / Testing / Structured Outputs / Integrations | greenfield | Placeholder scaffolds only |

**Data columns specified for later build (documented now so screens are forward-compatible):**
- **Assistant list fields:** name, template, status, syncStatus, assignedNumber, voice, calls,
  appointments, successRate, lastUpdated.
- **Call list columns:** caller, assistant, number, time, duration, result, appointment, leadTier,
  endReason, cost, latency, status.
- **Call detail:** audio recording, waveform, transcript, summary, structured outputs, tools
  called, appointment, cost, latency, errors, score, recommended follow-up.
- **Overview/Analytics business metrics:** calls answered, appointments booked, qualified leads,
  conversion rate, average duration, after-hours calls, estimated hours saved, voice cost, cost
  per appointment, missed-call recovery. **Each renders only from real data; otherwise empty.**

---

## 15. Empty, Loading, Error, and Success States

Standardized across all screens via shared components.

- **Empty:** `EmptyState` — mint-accented illustration/diamond motif, Playfair title, one-line
  body, single primary CTA. Every list/table and every placeholder page has a purposeful empty
  state (e.g., Assistants: "Create your first assistant"). Never a blank panel.
- **Loading:** skeletons that match final layout (KPI skeleton tiles, `SkeletonRow`/`SkeletonCard`),
  shimmer; buttons show `Spinner` + disabled; route-level suspense fallback = branded splash.
- **Error:** three tiers — (a) global `ErrorBoundary` (branded full-page "Something went wrong" +
  Reload + Back, logs to console) wrapping the router; (b) section `InlineError` with Retry; (c)
  field-level validation errors. Auth errors still redirect to `/login` (existing behavior).
- **Success:** `sonner` toast + inline `SuccessCheck`; save states announce "Saved" (aria-live);
  optimistic where safe (draft edits), reconciled on response later.
- **Honesty rule:** unavailable data → explicit "No data yet" / "Connect to enable," **never**
  placeholder numbers styled as real.

---

## 16. Updated Implementation Checkpoints

Milestone 1 remains *Foundation + first working assistant*. **Checkpoint B is now split into three
independently testable, independently committable sub-checkpoints (B1 → B2 → B3)**, all UI-only,
each stopping for owner review. No sub-checkpoint auto-proceeds to the next.

| Checkpoint | Scope | Backend? | Commit |
|---|---|---|---|
| A | Docs reconciliation; author `VOICE_PLATFORM.md` (this blueprint as its UI/UX PRD) | No | — |
| **B1** | **Design system + platform shell** — semantic light/dark tokens, fonts, Light/Dark/System theme, responsive AppShell (grouped sidebar, expand/collapse persisted, tablet rail, mobile drawer, theme toggle, usage meter, account menu, active states, tooltips), branding/logo, ErrorBoundary, registered nav architecture (deferred = disabled/"Later"), single config-driven `ComingSoon`, feature flag. **No Overview redesign, no Assistants.** | No | `Milestone 1 / Checkpoint B1: design system and platform shell` |
| **B2** | **Overview + existing-page retokenization** — redesign Overview from real API fields only (honest empties); retokenize Conversations, AgentConfig, Billing, Settings, Contacts, Login, NotFound with behavior preserved. | No | `Milestone 1 / Checkpoint B2: overview and existing page theming` |
| **B3** | **Assistants product shell** — Assistants list (search, card/table toggle, honest empty, New Assistant), 8-template picker, builder shell (8 tabs, local state, "not connected" banners), labeled cost/latency estimates, provider names only under Advanced, disabled actions cite the enabling checkpoint. | No | `Milestone 1 / Checkpoint B3: assistants interface foundation` |
| C | Versioned migrations: `voice_assistants`, `provider_webhook_events`, `voice_issues` (additive, firm-scoped, rollback SQL) | Yes (DB) | — |
| D | `VoiceProvider` / `VapiVoiceProvider` / `FakeVoiceProvider` abstraction + webhook auth | Yes | — |
| E | Assistant CRUD + templates persistence + publish + duplicate + guarded delete (wire B3's UI to real data) | Yes | — |
| F | Browser test call (Testing tab / in-builder) | Yes | — |
| G | Vitest + Playwright verification; SMS regression suite | Yes | — |

Then M2 (phone numbers + call ingestion → Call Logs/transcripts) → M3 (analysis + shared lead
scoring + contacts) → M4 (tools + knowledge + SMS unification) → M5 (analytics + issues +
integrations) → M6 (billing/team/settings) → M7 (hardening + launch, flag removed).

**Delivery order (each in its own fresh session, review + branch-backup push between):**
B1 → review/approve/push → B2 → review/approve/push → B3 → review/approve/push → C (only after
explicit approval). No push/deploy/merge/PR without approval.

---

## 17. Revised Checkpoint B Structure — Exact Scope of B1 / B2 / B3

Global constraints for **all three** (from owner rules): preserve current React/Vite/wouter
architecture; no framework/router/state-library changes or installs; do not touch API-server, DB,
CRM, SMS, Stripe, or Discovery code; every change reversible; typecheck + helpdesk build after
each; protected-file zero-diff after each; desktop/mobile + light/dark screenshots after each
visual sub-checkpoint; **stop for owner review after each** (no auto-advance). Avoid one-file-per-
component fragmentation — extract a component only when reused, complex, or independently testable.

### B1 — Design System + Platform Shell
1. Complete SiteMint **semantic** design tokens, light + dark (see §9).
2. Add **Plus Jakarta Sans** (UI) + **Playfair Display** (high-level display headings only).
3. **Light / Dark / System** theme modes, persisted, no flash.
4. Responsive **AppShell**: grouped sidebar; expanded/collapsed (persisted); tablet icon rail;
   mobile focus-trapped drawer; theme toggle; trial usage meter; account menu; active route
   states; tooltips.
5. SiteMint branding + logo (port `SiteMintLogo`; replace placeholder favicon).
6. Global **ErrorBoundary**.
7. Register the approved navigation architecture (data-driven).
8. Deferred items disabled / clearly "Later."
9. **One reusable `ComingSoon` page driven by route/nav config** — not ten wrapper files.
10. Preserve all current working routes and functionality.
- **Not in B1:** Overview redesign; Assistants list/picker/builder; retokenizing the existing page
  bodies (B1 wraps them in the new shell but leaves their internals for B2).

### B2 — Overview + Existing-Page Retokenization
1. Redesign **Overview** using only fields actually returned by existing APIs.
2. Never fabricate calls, appointments, costs, revenue, success rates, latency, or hours-saved.
3. Voice-only metrics → honest **"No data yet"** / **"Connect voice to enable."**
4. Retokenize (no behavior change): **Conversations, AgentConfig, Billing, Settings, Contacts,
   Login, NotFound.**
5. Preserve: `opted_out` states; conversation filters; auth; logout; trial-cap displays;
   agent-config save behavior; Stripe behavior.
6. Verify both themes + responsive.

### B3 — Assistants Product Shell
1. **Assistants list**: search; card/table toggle; honest empty state; New Assistant action.
2. No fabricated assistant rows or performance stats.
3. **Eight-template** selection experience.
4. **Builder shell** tabs: Setup, Prompt, Voice & Model, Tools, Knowledge, Testing, Analysis,
   Advanced.
5. **Local UI state only.**
6. Clearly display that changes are **not yet connected or persisted**.
7. Clearly labeled **estimated** cost + latency components (advisory bands, §6).
8. Provider names only under **Advanced**.
9. Disabled actions explain **which future checkpoint** enables them (e.g. "Publishing available
   in Checkpoint E").
10. No backend routes, schemas, migrations, Vapi calls, or persistence.

---

## 18. Expected Files per Sub-Checkpoint

*All within `artifacts/helpdesk/`. No backend/DB/schema files touched in any of B1–B3.*

### B1 files
**Design/entry**
- `src/index.css` — semantic token system (light/dark), fonts, shadows, motion, mint palette.
- `index.html` — Plus Jakarta Sans + Playfair Display font links; replace placeholder orange
  favicon with the SiteMint diamond mark; title.
- `src/App.tsx` — wrap in `ThemeProvider` + `ErrorBoundary`; render `AppShell`; register nav +
  `ComingSoon` routes from config; **keep every existing route working**.
- `src/main.tsx` — theme init / no-flash bootstrap if needed.

**New — shell, theming, branding, nav**
- `src/components/layout/AppShell.tsx` (+ `Sidebar.tsx`, `SidebarItem.tsx`, `SidebarUsageMeter.tsx`,
  `AccountMenu.tsx`, `MobileNavDrawer.tsx`, `Topbar.tsx`, `PageHeader.tsx` — extract only as these
  earn their own file; small pieces may stay co-located).
- `src/components/ThemeProvider.tsx`, `src/components/ThemeToggle.tsx`, `src/components/ErrorBoundary.tsx`.
- `src/components/SiteMintLogo.tsx` (ported from web-agency).
- `src/components/common/ComingSoon.tsx` (single reusable placeholder, title/desc from route config).
- `src/lib/nav.ts` (nav/IA config + which items are Live / Later / flag-gated).
- `src/lib/featureFlags.ts` (see §22).

**Modified (wrap, not retokenize)**
- `src/components/layout/AppLayout.tsx` → superseded by/refactored into `AppShell` (existing pages
  render inside the new shell unchanged in body).

### B2 files
- `src/pages/Overview.tsx` — full redesign, real-data-only + honest empties.
- Retokenize (bodies): `src/pages/Inbox.tsx`, `AgentConfig.tsx`, `Billing.tsx`, `Settings.tsx`,
  `Contacts.tsx`, `Login.tsx`, `not-found.tsx` — swap hardcoded slate/indigo utilities → semantic
  tokens; dark-mode complete; **behavior untouched**.
- New shared display components as needed: `src/components/common/{KpiTile,StatDelta,EmptyState,
  StatusBadge,Tag,SkeletonRow}.tsx` (create when first reused).

### B3 files
- `src/pages/Assistants.tsx` (list), `src/pages/AssistantCreate.tsx` (template picker),
  `src/pages/AssistantBuilder.tsx` (tabbed shell). Builder tab panels may live as co-located
  components or a small `assistant-builder/` folder — split only where a tab is complex enough to
  test on its own; avoid eight near-empty files.
- `src/lib/assistantTemplates.ts` (8 template definitions).
- New shared components (create on first reuse): `src/components/common/{TemplateCard,PresetSelector,
  CostBreakdown,LatencyMeter,GuardedDeleteDialog,SyncBadge,DataTable,SearchInput,SegmentedControl,
  RepeatableList,CharCountField,MetricEstimate}.tsx`.
- `src/App.tsx` — register `/assistants`, `/assistants/new`, `/assistants/:id/*` (replacing their
  B1 `ComingSoon` entries).

---

## 19. Acceptance Criteria per Sub-Checkpoint

**Shared gates (every sub-checkpoint):** `pnpm run typecheck` clean; helpdesk build passes
(`PORT=21622 BASE_PATH=/ai-receptionist/dashboard`); `git diff` on every locked backend/SMS file
= 0 lines; no console errors on any route (light + dark); AA contrast both themes; keyboard nav +
visible focus; `prefers-reduced-motion` honored; responsive at 375 / 768 / 1024 / 1440px with no
horizontal page scroll; desktop + mobile × light + dark screenshots produced; change reversible;
no framework/router/state-lib version change or new install.

**B1**
- [ ] Sidebar renders full grouped IA from config; expand/collapse works and **persists**; tablet
      shows icon rail; collapsed + rail show tooltips (hover and focus).
- [ ] Mobile drawer opens/closes, is focus-trapped, restores focus, closes on route change.
- [ ] Theme toggle offers **Light / Dark / System**; persists; no flash on load; System follows OS.
- [ ] Usage meter + account menu (Settings/Billing/Sign out) render; active route state correct
      incl. nested paths.
- [ ] Global ErrorBoundary catches a thrown render error → branded fallback (Reload/Back).
- [ ] Every current route still loads and functions (incl. `/receptionist`, see §23).
- [ ] Deferred items disabled/"Later"; flag-gated voice items hidden when flag is false (§22).
- [ ] Exactly **one** `ComingSoon` component backs all placeholder routes (no per-page wrappers).

**B2**
- [ ] Overview shows **only** real API-derived data; every unavailable/voice-only metric shows
      "No data yet" / "Connect voice to enable" — **zero fabricated numbers** anywhere.
- [ ] Conversations: `opted_out` badge/category/notice and all filters unchanged; thread behavior
      identical.
- [ ] AgentConfig save behavior, char counters, question reorder unchanged; Billing Stripe flow
      unchanged; Settings/Contacts/Login/NotFound reskinned with no behavioral change.
- [ ] Auth + logout + trial-cap displays intact.
- [ ] No hardcoded slate/indigo palette classes remain on retokenized pages (token-driven only).

**B3**
- [ ] Assistants list: search, card/table toggle, honest empty state, New Assistant action; **no
      mock rows or fabricated stats**.
- [ ] Template picker shows all 8 templates; selection opens builder pre-filled (locally).
- [ ] Builder renders all 8 tabs; fields editable via **local state only**; a clear "Not connected
      / changes aren't saved yet" indication is visible.
- [ ] Cost + latency render with **"Estimate"** label and the four advisory bands; provider names
      appear **only** under Advanced.
- [ ] Every disabled action names the checkpoint that enables it.
- [ ] No backend route/schema/migration/Vapi/persistence introduced.

**Verification method (each):** run helpdesk dev server, drive affected routes in light+dark at
each breakpoint (Playwright/Chromium), capture screenshots, confirm empty/loading/error states,
run typecheck + build, diff-check locked files.

---

## 20. Features Explicitly Deferred

Visible-but-disabled ("Later"/"Advanced") in the shell, or out of B1–B3 entirely:

- **Squads** (multi-assistant routing) — post-M5.
- **Outbound campaigns** — later; SMS intake number never imported to Vapi.
- **Customizable Boards** — deferred.
- **Full Evals framework** — deferred (Testing starts as browser call + text test, not Vapi Test
  Suites).
- **Complex workflow builder** — deferred.
- **Customer-facing API key management** — behind "Advanced," minimal until later.
- **Enterprise observability** (advanced webhook tooling, deep Issues) — Issues nav present but
  disabled until M5.
- **Deferred out of B1–B3 (arrive in C–G / M2+):** all backend/persistence, DB migrations,
  Vapi/provider integration, phone provisioning, tool/integration wiring, real
  cost/latency/analytics data, audio playback, live call/test execution, assistant CRUD/publish.

---

## 21. Preservation & Rollback Plan

**Locked / untouched (zero diff verified after every sub-checkpoint):** all API-server routes and
libs, `lib/db/**` schema, CRM engines, SMS/intake pipeline, Stripe/billing backend, Discovery —
the full protected list in `CLAUDE.md` and `DECISION_LOG.md`. B1–B3 are **frontend-only** inside
`artifacts/helpdesk/`.

**Behavior preserved (regression-checked):** `opted_out` handling; conversation filters;
receptionist cookie auth + logout; trial-cap displays; AgentConfig save; Stripe checkout; every
existing route (esp. `/receptionist`, §23).

**Reversibility:**
- One sub-checkpoint = one commit on `claude/dashboard-ui-design-review-c20qzr`; each is a clean
  revert point. Push a **branch backup** after each approval (e.g. `.../c20qzr-b1`, `-b2`, `-b3`)
  before starting the next session, so any sub-checkpoint can be restored independently.
- New voice surfaces are additive and **flag-gated** (§22): setting the flag false returns
  production to the existing experience without a code revert.
- No destructive edits — existing pages are wrapped/retokenized, not deleted; `AppLayout` is
  retained until `AppShell` is verified, then superseded in the same commit.

**Per-session guardrails:** typecheck + build green, protected-file `git diff` empty, screenshots
captured, owner review — before any push; no deploy/merge/PR without explicit approval.

---

## 22. Feature-Flag Implementation

Browser code cannot read a bare server env var, so the voice platform is gated client-side by a
**Vite-exposed** flag with a production-safe default, backed (later) by server config.

- **Flag:** `VITE_VOICE_PLATFORM_ENABLED`, read via `import.meta.env`. **Documented default in
  production = `false`.** A tiny `src/lib/featureFlags.ts` exports
  `voicePlatformEnabled: boolean` (parses the string, defaults false when unset/invalid) and is the
  single import site — no scattered `import.meta.env` reads.
- **Dev/staging:** set `VITE_VOICE_PLATFORM_ENABLED=true` in the local `.env`; document in
  `.env.example`. Production leaves it unset/false until owner approval (mirrors the server
  `VOICE_PLATFORM_ENABLED` intent without coupling to it).
- **What it gates:** visibility of the in-progress **voice** nav items and their routes
  (Assistants, Tools, Phone Numbers, Voice Library, Knowledge Base, Appointments, Call Logs,
  Analytics, Testing, Structured Outputs, Integrations). When false, these are hidden (or shown as
  a locked "Coming soon" teaser — owner's call), and their routes render `ComingSoon`/redirect
  home rather than the half-built surfaces.
- **Always visible regardless of flag** (the existing working product): Overview, Conversations,
  **Current SMS Receptionist** (`/receptionist`, §23), Billing, Settings, Contacts, Login.
- **No secrets via the flag:** it is a boolean capability switch only. Provider keys
  (`VAPI_API_KEY`, etc.) never reach the browser; any future public value (e.g. `VAPI_PUBLIC_KEY`)
  comes from an authenticated, tenant-scoped server endpoint — not from a `VITE_` var.
- **Upgrade path:** the same `featureFlags` module can later source flags from an authenticated
  `GET /api/receptionist/feature-config` response (server-provided config) without changing call
  sites — introduced in a later checkpoint, not in B1–B3.

---

## 23. Temporary Treatment of the Existing `/receptionist` Route

The existing **AgentConfig** page at `/receptionist` is the live editor for a customer's current
SMS receptionist. It **must remain fully accessible** throughout B1–B3 (and until the new
Assistants backend + persistence land in Checkpoints C–E). It must **not** be removed, redirected,
or hidden in a way that blocks editing the current SMS receptionist, and the new Assistants builder
must **not** be presented as having replaced it.

- **Nav placement:** register `/receptionist` in the shell (B1) under **OPERATE** as
  **"Current SMS Receptionist"** (acceptable alternatives: "Messaging Assistant" /
  "Existing Receptionist Settings"). It is **not** flag-gated — visible in production regardless of
  `VITE_VOICE_PLATFORM_ENABLED`.
- **Clarity copy:** a small note on the page (added in B2 retokenization) frames it as the live SMS
  receptionist ("This controls your current SMS receptionist"), distinct from the new voice
  Assistants (which show "not connected yet" in B3).
- **B2:** AgentConfig is retokenized only — greeting/business-description/qualifying-questions
  fields, char counters, reorder, and **save behavior** unchanged; it keeps calling the existing
  `receptionistAgentConfig` endpoints.
- **Later (M4):** SMS is unified into the Assistants model as a "Messaging Assistant." Only then is
  a redirect/merge considered — never before, and never in B1–B3.
