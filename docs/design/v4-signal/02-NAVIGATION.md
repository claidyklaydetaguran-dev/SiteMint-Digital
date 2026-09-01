# V4 Navigation Architecture

Three navigation models, visually and structurally distinct. Users must always know **which
product surface they are in** and **where inside it they are**.

## 1. Public marketing navigation

Desktop header (sticky, 64px, translucent ink over dark sections / cloud over light, 12px
backdrop blur, hairline bottom border):

```
[◆ SiteMint]   What We Build ▾   Work   How It Works   About   [AI Receptionist]   |   Sign In   [Start a Project]
```

- Logo = Home control (no separate Home item).
- **AI Receptionist** is a distinct product entry: pill-outlined item with a live signal dot —
  visually separated from the four editorial links.
- **Start a Project** is the single filled CTA.
- Active route: cyan underline bar (3px) + `aria-current="page"`; section-level scroll-spy
  highlights the current chapter in long pages via the progress rail (see Motion doc).

### "What We Build" mega panel
- **Click/tap-operated `<button aria-expanded aria-controls>`** — not hover-only. Hover may
  pre-warm (visual affordance) but never opens/closes on its own.
- Panel: 4 service pillars in a 4-col grid (2-col ≤1024px), each a large card: Lucide icon, pillar
  name, one-line promise, 2–3 sub-links; footer row inside the panel links to the What We Build
  overview ("See how the pillars connect →" — points at the Signal Map).
  1. **Websites & digital experiences**
  2. **Web apps & business systems**
  3. **CRM & workflow automation**
  4. **AI Receptionist & voice systems**
- Behavior contract: Escape closes and returns focus to the trigger; outside click closes; Tab
  cycles panel links then exits naturally (no trap while open — panel closes on focusout); arrow
  keys move between pillar cards; open state animates 180ms translateY(−8→0)+fade, honoring
  reduced motion.

### Wayfinding on every marketing destination
- Mono kicker line above the H1: `02 — What We Build / Web Apps` (acts as breadcrumb; segments
  are links).
- H1 states the page name; `<title>` mirrors it.
- Per-page footer "next step" band: every page ends with exactly one forward link pair
  (e.g. service pillar → Work → Start a Project), so no route dead-ends.
- 404: signal-thread broken illustration, search-free, three exits (Home, What We Build, Start a
  Project).

### Mobile (<768px)
- Header: logo + Start a Project (compact) + menu button (44×44).
- Full-screen sheet: the four pillars as an accordion under "What We Build", then Work / How It
  Works / About / AI Receptionist / Sign In. Focus trapped inside sheet, Escape/close restores
  focus to menu button, body scroll locked. Current page marked with cyan bar + `aria-current`.

## 2. Customer application navigation (dashboard, `/ai-receptionist/dashboard`)

Separate application model — persistent left sidebar (collapsible to icons at ≥1024px, bottom
sheet nav on mobile), grouped routes:

```
OVERVIEW      Overview
ASSISTANT     Assistants · Prompt · Voice & Model
ACTIVITY      Conversations · Appointments · Contacts
CHANNELS      Numbers & Transfers · Integrations
ACCOUNT       Usage & Billing · Issues · Settings
```

- Active item: cyan left rail (3px) + tinted background + `aria-current`; group label stays
  visible so "where am I" reads as *group / item*.
- Every screen: page header block = H1 + one-line purpose + primary action button (right-aligned);
  breadcrumb appears only on nested detail screens (e.g. Assistants / "Front Desk" / Prompt).
- Top bar: firm switcher (future-proof), status chip for the assistant (Draft/Published), help.
- Mobile: bottom nav ≤5 groups (Overview, Assistant, Activity, Channels, Account) per bottom-nav
  limit; deep screens push with a visible back control that always returns one level.

## 3. Operations/CRM navigation (internal)

Deliberately distinct skin: navy-dark left sidebar, mono labels, denser rhythm — instantly
distinguishable from the customer app (light chrome) and marketing (no chrome).

```
OPS  CRM Overview · Leads & Firms · Projects · Forms & Discovery · Voice Ops · Issues · Settings
```

- Login wall precedes everything; internal watermark "Operations" in the top bar.
- Same active-state rules; row-dense tables; no marketing styling anywhere.

## Route-continuity rules (all surfaces)

1. URL reflects state (deep-linkable tabs/filters via query params).
2. Back always works; overlays (mega panel, sheets, dialogs) never push history entries.
3. Sticky elements never obscure content (scroll-margin-top on anchor targets = header height).
4. Skip link ("Skip to content") is first focusable on every page.
5. Cross-surface transitions are explicit: Sign In → app is a full context switch with its own
   chrome; app back to marketing only via the logo menu ("Back to sitemintdigital.com").
