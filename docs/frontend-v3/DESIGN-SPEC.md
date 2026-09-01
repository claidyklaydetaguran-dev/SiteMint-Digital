# SiteMint Digital — Frontend V3 "Operational Editorial" Design Specification

> Program branch: `design/sitemint-v3-experience` (base `main` @ `8f213db`).
> Status: authorized owner program, visual direction approved (three concept
> images: "Signal Path" corporate homepage, "Voice Theater" AI Receptionist
> landing, "Operations Console" dashboard).
> This document supersedes the **visual** layer of `docs/frontend-v2/DESIGN-SYSTEM.md`.
> It does NOT supersede the V2 engineering contracts, which remain binding:
> the centralised route layer, route-level code splitting (no barrels), the
> AR-001J voice build boundary, `ACCESSIBILITY-REQUIREMENTS.md`, and every
> protected-file rule in `CLAUDE.md`.

## 1. Phase 0 audit outcome

### What exists and is retained

| Asset | Verdict |
|---|---|
| `web-agency` route layer (`src/lib/routes.ts`) | **Retained + extended** — V3 adds routes; the three path-kind rules stay. |
| Three-shell architecture (`PublicShell`/`AuthShell`/`DashboardShell`) in both SPAs | **Retained** — V3 attaches new chrome at the same seams (`chrome="v3"`). |
| Route-level code splitting, inline `lazy()` imports, no barrels | **Retained** — every new V3 page follows it. |
| Helpdesk nav catalogue (`src/lib/nav.ts`), voice build boundary (`routes/voiceRoutes.ts`), feature flags | **Retained untouched** — committed contract tests protect them. |
| V2 accessibility patterns (focus trap drawer, aria-expanded disclosure, skip link, 44px targets) | **Retained** — V3 header/nav reuse the same behaviours. |
| `tokens-v2.css` and `v2-*` classes | **Retained for unconverted surfaces** — V3 surfaces use `--v3-*`; nothing V2 is deleted, so unconverted routes render exactly as before. |
| CRM pages (26 `/admin/crm/*`), locked engines | **Retained functionally** — Phase 5 reskins the shell chrome only. |
| Protected backend + SMS + auth files | **Never touched.** |

### What V3 replaces

| Surface | V2 state | V3 action |
|---|---|---|
| Corporate homepage `HomeV2` | Light-forward V2 | New `HomeV3` (Signal Path: ink hero, porcelain editorial, system map). V2 kept as rollback. |
| Public chrome (`SiteHeader`/`SiteFooter`) | Porcelain-only sticky bar | New V3 floating header (transparent-on-ink → compact porcelain on scroll) + comprehensive footer. |
| Services IA | one `/services` page + anchors | Services hub + dedicated `/websites-apps`, `/discovery-systems`, `/automation` pages; `/ai-receptionist` remains the product page. |
| `/process`, `/insights`, `/start`, `/privacy`, `/terms` | anchors / missing | Real routes. `/start` wraps the existing Discovery flow with V3 chrome positioning. |
| AI Receptionist landing `AiReceptionist` | V2 light | New Voice Theater treatment (V3). |
| Helpdesk visual layer (`styles/v2-*.css`) | teal-on-light V2 | V3 Operations Console retheme: light workspace + ink rail, mint/electric accents. DOM contracts unchanged. |
| Auth (`Login`, signup) | V2 | V3 split layout restyle. |
| CRM `DashboardShell` chrome | generic admin | V3 "SiteMint Operations" internal treatment with explicit internal-environment marking. |

### Explicitly deferred (honest scoping, typed adapters where shown)

- `app.sitemintdigital.com` / `ops.sitemintdigital.com` / `api.sitemintdigital.com`
  are a **deployment/routing handoff** (§9). No DNS, Replit, or deployment change
  in this branch. The current physical routes (`/`, `/ai-receptionist/dashboard`,
  `/admin/crm`) keep working.
- Customer surfaces with no committed API (Integrations health, Issues queue,
  Phone & transfers, Usage projection) render from **typed mock adapters**
  matching committed response shapes, labelled as preview data, swappable
  without component redesign.
- Onboarding beyond the existing signup → dashboard flow is designed as the
  Receptionist readiness journey inside the dashboard, not a parallel wizard,
  because the committed auth contract has no multi-step onboarding endpoint.

### Baseline (recorded, not re-measured)

Windows worktree cannot run vite/vitest (esbuild binaries pruned by the frozen
`pnpm-workspace.yaml`); builds and focused tests run on the WSL Linux x64
candidate via a hardlink scratch tree (see memory/QA notes and
`docs/frontend-v2/PERFORMANCE-ARCHITECTURE.md`). V2 baseline: system font stack
(zero remote font requests), fully code-split route graph, helpdesk dist ≈55
files. V3 gates: no new dependency, no remote font, initial JS growth ≤10%.

## 2. Brand direction — Operational Editorial

Premium but approachable; editorial in public, operational in-app; cyan/teal
family (never ordinary green, never purple); restrained motion; one page
scrollbar; no cramped sidebars.

## 3. Design tokens (`--v3-*`)

Namespaced so no V2 pixel changes until a surface opts in.

```
Ink navy        --v3-ink        #06151F   (marketing dark surfaces, app rail)
Blue charcoal   --v3-charcoal   #0C2633   (raised dark surfaces, cards on ink)
Mint cyan       --v3-mint       #20E6C3   (primary action, live signals)
Electric cyan   --v3-cyan       #4FE7F5   (secondary accent, data/signal lines)
Ice             --v3-ice        #E9FCF8   (tinted panels on light)
Warm porcelain  --v3-porcelain  #F7F5EF   (editorial light sections)
White           --v3-white      #FFFFFF   (app canvas, cards)
Slate           --v3-slate      #45606E   (muted text on light)
Slate on dark   --v3-slate-d    #8FB0BE   (muted text on ink)
Amber           --v3-amber      #E8A23D   (warnings only)
Red             --v3-red        #D9534A   (destructive/failed only)
```

Contrast decisions (validated, WCAG 2.2 AA):
- Text on ink: white (17.7:1) or `--v3-slate-d` (7.4:1). Mint/cyan on ink pass
  for large text and UI accents (≈10:1) — allowed for headings/labels.
- On mint or cyan fills, text is **ink** (≈9:1); white on mint is prohibited.
- On porcelain, body is ink; muted is `--v3-slate` (5.9:1). Amber is never text
  on white below 18px bold.

Typography: strongest available stack, zero remote requests (performance rule
carried from V2; no font purchase/download authorized):
- Grotesk (UI + display): `"Geist", "Geist Sans", ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` — Geist resolves if locally installed, system grotesk otherwise.
- Editorial serif (small accent labels only, italic): `"Instrument Serif", Didot, "Playfair Display", Georgia, ui-serif, serif` — same local-first rule.
- Mono (numbers/wire labels): `ui-monospace, "Cascadia Mono", SFMono-Regular, Consolas, monospace`.
- Display scale up to `clamp(2.75rem, 1.9rem + 4vw, 5.25rem)` for the marketing
  hero (oversized editorial type is a core V3 signature; V2 capped at 56px).

Geometry: 8px rhythm; control radius 12px; card radius 16px; theater/media
frame radius 20–24px; 1px technical borders (`rgba` ink/white at 8–14%).

Layout: 12-col marketing grid, `--v3-container: 1240px`; app rail 264px fixed
(collapsible, 72px icon rail on tablet); one page scrollbar; 44px targets.

Motion: V2 duration/easing tokens carried over; additions: signal-draw
(connector lines, 600ms), status-pulse (2.4s), card hover translateY(-3px).
Full `prefers-reduced-motion` collapse; no scroll-jacking, no parallax.

## 4. Information architecture

### Public (`sitemintdigital.com`)
```
/                    HomeV3 — company-first Signal Path
/services            Services hub (pillar overview, links to 4 pages)
/websites-apps       Websites & Web Apps service page
/ai-receptionist     AI Receptionist product landing (Voice Theater)
/discovery-systems   Discovery Systems service page
/automation          Workflow Automation service page
/work                Selected work / capability examples (honest)
/process             Numbered SiteMint process
/about               Company + trust/safety/human-control
/insights            Insights foundation (editorial index, honest empty state)
/start               Start with SiteMint — routes into Discovery intake
/privacy /terms      Legal
/discovery           retained (existing flow; /start links here)
/sign-in             → cross-app document link to dashboard login (unchanged)
```
Navigation: Services ▾ (Websites & Web Apps · AI Receptionist · Discovery
Systems · Workflow Automation · Integrations→/automation#integrations) · Work ·
Process · About · Insights — Sign in · **Start with SiteMint** → `/start`.
`/pricing`, vertical landers: remain routed, remain out of navigation.
Ops CRM never appears in public navigation.

### Customer app (helpdesk SPA — future `app.sitemintdigital.com`)
Existing route contract retained; V3 reskins the shell and surfaces. The brief's
customer nav (Overview, Receptionist, Calls, Appointments, Contacts,
Conversations, Integrations, Phone & transfers, Usage & billing, Issues,
Settings) maps onto the committed nav catalogue; voice-gated items keep their
build boundary and appear only when flags allow.

### Internal ops (web-agency `/admin/crm/*` — future `ops.sitemintdigital.com`)
Shell chrome restyled as "SiteMint Operations", visibly internal (rail badge
"Internal · authorized personnel"), server-side Bearer auth unchanged.

## 5. Signature patterns (reusable)

1. **Coverage Pulse** — received → AI answered → transferred → booked flow bar.
2. **System Map** — Website → Discovery → Automation/AI → Business system →
   Human outcome, drawn with connector lines.
3. **Signal Theater** — dark media frame with floating interface containers
   (max 3 dominant cards), real DOM, CSS-animated signal, static-poster
   fallback under reduced motion.
4. **Attention Queue** — issue → impact → recommended action rows.
5. **Capability Rail** — connected/healthy/needs-attention/disabled/locked/not-configured.
6. **Outcome Receipt** — what happened, what changed, what happens next.
7. **Operational empty states** — every empty screen teaches one next action.
8. **Readiness system** — progress from real configuration state.

## 6. Content rules

Approved copy is used verbatim where given (corporate hero kicker/headline/
support/CTAs; service headlines; receptionist landing headline + support; the
dashboard greeting as typed mock data). No invented client logos, testimonials,
metrics, uptime, pricing, or provider claims. Where proof is unavailable,
capability demonstrations are labelled as examples. Artifact policy honesty:
no UI implies retained recordings/transcripts when policy is `none`.

## 7. State design

Every V3 core screen ships intentional loading/skeleton, empty, error,
permission/locked, disabled, and success states; destructive actions get
explicit confirmation. Route-level fallback and error recovery come from the
retained V2 route boundary components, restyled by tokens.

## 8. Acceptance gates

- `npx tsc --noEmit` clean for web-agency + helpdesk (Windows gate).
- Production builds green on the Linux candidate (per-package vite build).
- Route smoke: every public + app route renders without console errors.
- Responsive verification at 360 / 768 / 1024 / 1440 / 1920; no horizontal
  overflow; no nested scrollbars.
- `git diff` on every protected file = 0 lines; secret scan clean.
- Reduced-motion pass; keyboard pass on header, drawer, dialogs.

## 9. Domain / deployment handoff (no changes in this branch)

| Hostname (planned) | Serves | Today |
|---|---|---|
| `sitemintdigital.com` | web-agency public build | `/` |
| `app.sitemintdigital.com` | helpdesk build (`BASE_PATH=/`) | `/ai-receptionist/dashboard` |
| `ops.sitemintdigital.com` | web-agency admin subtree behind auth | `/admin/crm/*` |
| `api.sitemintdigital.com` | api-server `/api` | same origin `/api` |

Cutover requires: helpdesk rebuilt with `BASE_PATH=/` for the app host; CORS
allowlist updated to the new origins (`CORS_ALLOWED_ORIGINS`); cookie scope
review for `receptionist_session`; ops host gated at the edge + existing Bearer
auth. All owner-approved, out of scope here.

## 10. Magnific visual program

Two priority loops (corporate Signal Loop; receptionist Voice Loop), ≤3 total
generation attempts, no purchases. Fallback: static poster + CSS signal
animation (implemented regardless, as the reduced-motion/mobile path). Exact
prompts recorded in `ASSET-PROMPTS.md` if generation is unavailable or spent.
