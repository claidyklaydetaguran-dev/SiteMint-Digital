# SiteMint — Frontend Completion Audit (2026-09-08)

Owner work order: "SITEMINT 100% FRONTEND COMPLETION, MOBILE REPAIR,
PRODUCT-UI AUDIT, AND RELEASE PROGRAM". Starting head `d9f0580`
(the directive's expected `46719ee` is an ancestor — every commit since is
this program's own verified work; confirmed before editing).

## 1. Confirmed regressions — root causes (§1/§2)

### R1 — Mobile headings clipped (owner screenshot, "05 — AI Systems & Automation")
**Root cause (proven in the shipped bundle):** a CSS cascade-order bug.
The mobile "simplification" media block at the END of `v5-home.css` /
`v5-pages.css` re-declared the ARMED reveal state
(`[data-reveal-ready] .reveal-clip { clip-path: inset(60% 0 0 0) }`) with
the same specificity as — but later source position than — the REVEALED
rule (`clip-path: inset(0)`). After `data-revealed` landed, opacity
animated to 1 but the armed clip never released: every `reveal-clip`
heading on a ≤767px viewport kept its top 60% permanently hidden
(byte offsets in the shipped CSS: revealed at 13163/50420, armed at
21000/57970 — armed wins). The earlier stuck-reveal harness ran at desktop
width only, which is why it reported 0.

**Fix (structural, order-immune):**
- Armed selectors now carry `:not([data-revealed])` — they can never win
  after reveal regardless of source order or later additions.
- The entrance `transition` moved to the BASE variant class; armed states
  carry `transition: none` (instant arm, animated reveal).
- Per the work order, narrow viewports no longer use clip-path reveals at
  all: ≤767px arms as a plain fade + 10px rise.
- `useReveal()` now also reveals elements already ABOVE the viewport when
  observation starts (prerendered pages are readable before hydration, so
  a visitor can scroll past a section before it arms).
- New committed-style gate `qa-clip.mjs`: 171 route×viewport cells
  asserting no stuck reveal, no text scroll-box > visible-box, no
  heading crossing a clipping ancestor, no horizontal overflow, no
  occluded heading.

### R2 — "SiteMint brand film" never plays
**Two root causes, both proven:**
1. **Server:** `marketing-server.mjs` answered `Range:` requests with a
   full 200 and no `Accept-Ranges`/`Content-Length`. Safari (desktop and
   iOS) probes media with a byte-range request and refuses playback
   without a 206 — on the production host the films could never start
   there. Fixed: single-range 206 serving (suffix and open-ended forms,
   416 on unsatisfiable), `Accept-Ranges: bytes`, explicit
   `Content-Length`, identity encoding for ranges. Verified locally across
   five range shapes.
2. **Component:** `HeroMedia` (the "brand film — representative studio
   scene" section) gated playback to ≥768px by design — phones always saw
   the abstract poster, reading as "video unavailable." Fixed: plays at
   every width, armed by an IntersectionObserver (±50% margin) after
   load+idle so it stays non-LCP; a `data-sm-playing` attribute (set on
   the `playing` event) keeps the video layer at opacity 0 until frames
   actually render, so a stalled/blocked film can never show a blank
   frame — the Glacier poster stays visible beneath. Reduced-motion and
   the global Motion toggle still suppress playback entirely.

**Media gate (`qa-media.mjs`, production-equivalent server): 12/12** —
all three films play and advance in-view on desktop AND 390px mobile;
all 8 media URLs answer 200 + 206 with correct types; with autoplay
force-blocked every visible film sits over a poster (no blank frames).
The hero film's pause when scrolled off-screen is by design (observer
pause/resume) and the probe measures in-view.

### R3 — Hero clips on short viewports (found by the new gate, same family as R1)
At viewport heights ≤ ~700px (landscape phones 844×390/932×430, iPhone-SE
class 375×667, desktop at 200% zoom ≈ 640×400) the fixed `100svh` sticky
hero stage was shorter than its composition and `overflow: hidden`
clipped the phase ledger. Fixed: below 700px of height the stage flows
(`height: auto; min-height: 100svh; position: relative`) — the same
treatment `v4-home.css` already applied under reduced motion.

## 2. Operations CRM visual pass (§6)

Owner verdict: CRM frontend not accepted. Findings from synthetic-data
captures (Command Center, Contacts, Pipeline, Inbox, Tasks, Settings,
mobile 390):
- Structure/density/nav: sound (quick actions, saved lists, follow-up
  queues, kanban, responsive single-column mobile). Not redesigned.
- **Accepted defect: accent chaos.** Six-hue quick-action tiles, a
  4-color topbar button row, 10-hue avatar set, 12 stage hues including
  decorative purple/indigo/violet/fuchsia/pink, blue active-nav, green
  primary buttons.

Applied (UI files only — no locked engine touched):
- `crmTaxonomy.ts` — central stage maps rebuilt on the ops mint ramp:
  mint/ocean family (sky/cyan/teal/emerald + the `primary` signature for
  the Qualified milestone) carries progress; red/amber/yellow keep their
  semantic meanings; raw grays → semantic tokens.
- Command Center: one identity for all quick-action tiles (mint-wash chip,
  dark mint-teal glyph — urgency stays on the red badge counters); `New
  Deal` → signature primary; chart hexes onto the same ramp.
- `CrmLayout`: topbar action row unified to the bell's quiet dark-chip
  treatment with mint glyphs; sidebar ACTIVE state → mint (was blue);
  avatar set → 8 tonal mint/ocean hues; composer chips/buttons de-blued.
- Deals/Reporting/Behavioral-intelligence stage & chart maps aligned.
- Campaigns/Copilot/long-tail (93 further occurrences): deterministic
  shade-preserving migration purple/violet→teal, indigo/fuchsia→cyan,
  pink→teal across `pages/crm/**` and `pages/ops/**`; indigo hexes
  removed.
- **Contract extended** (`opsContract.test.ts`): raw
  purple/indigo/violet/fuchsia/pink utilities now FAIL in CRM/ops pages
  and in the shared taxonomy/intent maps; allowlist starts (and should
  stay) empty. All opsContract checks pass.

## 3. Receptionist dashboard (§5)

Captured overview/calls/contacts/appointments at 1440 (synthetic modes:
fresh/empty/locked/slow/error/denied banners available in the preview).
The shell is coherent and on-brand (ink ground, mint accents, status
banner, attention cards, honest "no phone number assigned yet" setup
state, in-shell 404 with a mint "Back to dashboard"). No blocking visual
defects found; no capability claims beyond the connected backend.

## 4. Route-by-route status

Verified in this program (harness + screenshot evidence; per-cell logs in
the session scratchpad):

| Route | Purpose / visual | Interaction | States | Responsive | A11y | Verdict |
|---|---|---|---|---|---|---|
| `/` | full 15-section system story, 2 films | journey diagram, dialogs, forms links | prerendered + reveal-safe | clip gate all viewports | 100 | PASS (after R1/R3) |
| `/services`, `/websites-apps`, `/discovery-systems`, `/ai-systems` | chapter pages, diagrams | real-click nav 10/10 | prerendered | clip gate | 100 | PASS |
| `/ai-receptionist` | product theater, film | live-voice sim 2/2 | poster-first mobile contract | clip gate | 100 | PASS |
| `/ai-receptionist/demo` | 5-stop dashboard tour + ops map | tour controls | prerendered | clip gate | 100 | PASS |
| `/work` | SSS + OneFilAm featured, 5 projects | overlay gate 19/19 | prerendered | mobile viewer full-screen | 100 | PASS |
| `/pricing`, `/process`, `/about`, `/contact`, `/insights`, `/automation` | content chapters | team dialogs, FAQs | prerendered | clip gate | 100 | PASS |
| `/start`, `/discovery` | intake flows | forms gate 7/7 (honest 503 upstream) | loading/error/disabled | clip gate | 100 | PASS |
| `/privacy`, `/terms`, `/thank-you` | legal/confirm | — | prerendered | clip gate | 100 | PASS (noindex until owner legal approval) |
| `/ai-for-lawyers`, `/ai-for-realtors` | retired verticals | redirect to receptionist (amendment §11) | prerendered stubs | — | — | PASS (by design) |
| unknown paths | real 404 page | Back works | 404 status verified | — | — | PASS |
| `/admin` → CRM | staff-only, auth-gated | synthetic-preview audited | data/empty/slow/error/denied modes | mobile single-column | — | PASS after §2 pass (private) |
| `/ai-receptionist/dashboard/*` | customer dashboard | login + deep links | fresh/empty/locked/slow/error/denied | — | — | PASS (private beta) |

Dead-control audit: nav 10/10, interactions 8/8, routing 9/9, access
26/26 (real-click, not source presence) — re-run on the fixed build in
the final battery below.

## 4b. Further defects the new gate found (fixed in this program)

- **R4 — hero clipped/mis-stacked on short viewports** (three stages of
  the same family): fixed 100svh sticky stage clipped the phase ledger →
  flow mode below 700px height; then the flow mode's first copy line sat
  under the fixed header → header clearance moved onto the stage; then
  the ≥768px absolute-copy formula (64px + usable×0.4 − clamp(150px…))
  landed the copy ABOVE the header at 844×390 → in flow mode the copy is
  static, ordered first, field capped at 30svh (end-of-file rule so it
  out-cascades the absolute composition).
- **R5 — Build Preview widened every sibling at 320px**: the stage
  stepper's min-content (~328px) sized the `.sm-bp` grid's shared column
  track past the 280px container, pushing the mock device frame 28px
  through the clipped corner-host section edge. All `.sm-bp` children and
  `.sm-split` children now carry `min-width: 0`; the stepper/control rows
  scroll in their own boxes when they genuinely cannot fit.
- Two checker refinements recorded for honesty: stretched-link overlays
  (transparent whole-card controls) are not "occlusion", and sub-pixel
  transition residue (<0.75px) is not "stuck".

## 5. Gates (final build `assets/index-XkHjYFRf.js`, prerendered, 2026-09-08)

| Gate | Result |
|---|---|
| WSL battery (source tar of this program) | contract chain green · tsc 0 errors · 1055/1055 tests · wa + hd + hd-voice + wa-live builds · built-output scans 0 leaks · voice-boundary greps 0 |
| opsContract (incl. NEW decorative-accent ban) | all pass |
| Prerender | 22 documents + spa-fallback.json, gate CLEAN |
| **Clip gate (new)** — 171 route×viewport cells incl. 320×568, 844×390, 932×430, 640×400 (200%-zoom class) | **0 failures** |
| **Media gate (new)** — films advance in-view desktop+mobile, 200/206 URL probes, blocked-autoplay poster check | **12/12** |
| Access / overlay / errors / nav / matrix / mobile-video / live-voice | 26/26 · 19/19 · CLEAN · 10/10 · 66/66 · 4/4 · 2/2 |
| Routing / interactions / forms / motion | 9/9 · 8/8 · 7/7 · 12 routes 0 stuck |
| Decorative-video chrome (Chrome + Edge) | 6/6 + 6/6 |
| Firefox 155 + WebKit 26.6 (incl. landscape no-overflow) | 88/88 |
| Accessibility (18 public routes, corrected list) | 100 × 18 |
| Perf (3-run throttled-mobile medians, local preview) | home 3.88–4.05s LCP / CLS 0.000 / TBT ≤91ms · receptionist 3.37s / 0.000 / 12ms — production-edge equivalents measured 2.91s/2.55s on 2026-09-07 (gzip + HTTP/3); CLS 0 everywhere |

## 6. Remaining owner-decision items (unchanged)

- Legal review of Privacy/Terms → then remove `noindex`.
- `PUBLIC_FORM_SUBMISSIONS_ENABLED` + `/api/public/beta-requests` backend
  activation (owner-gated) — discovery/beta forms show honest failure
  states until then.
- Vapi voice-demo configuration; physical iOS-device verification.
- Publication of THIS build awaits the unified owner review — nothing
  deployed by this program.
