# SiteMint Final UI/UX Audit — 2026-09-06

> Mandated by the final owner correction directive. Verified base: branch
> `feature/ai-receptionist-private-beta-readiness` @ `efd68a2`, clean tree,
> media inventory present, Magnific ledger 6,465 (auth-1, closed) + auth-2 open.

## 1. Why the reported problems actually existed (root causes, no defense)

| Problem | Actual root cause |
|---|---|
| Homepage film reduced to a detached 4:1 strip | I optimized for the band's *median* CSS aspect instead of designing the hero as one integrated experience; the master was cut to the strip rather than the stage being sized for a film. Geometry was derived from CSS constants, not from a designed viewport plan. |
| Receptionist hero copied the homepage structure | The prior directive said "do the same on AI receptionist," and the later "must be distinct" requirement was under-weighted; the shared band was cheaper than a product-specific composition, and no product-identity check existed in the gates. |
| Checks passed while design failed | Every gate measured *presence and function* (routes render, anchors resolve, contrast passes, LCP timing) — none measured *authored completeness* (does the container explain, demonstrate, interact). Test-pass counts were reported as design success. This audit adds the completion standard (§6) as the human check the gates lacked. |
| Films felt generic | Kling ambient loops prioritized loopability over story; the brand story (6 beats, engineer identity, Glacier lighting) was never directed as a single film with verified keyframes until now. |

## 2. UI UX Pro Max — recommendations adopted (concrete)

Skill run: `--design-system "connected digital systems agency b2b cinematic minimal"` + targeted `--domain ux` searches (modal focus, scrollspy, hero video, viewport switcher). Adopted:
1. **Hero video must be pausable** → pause/play controls (≥44px, aria-pressed) added to both hero film stages; loops stop offscreen (already) and under reduced motion (already).
2. **Scroll-offset discipline** → product sub-nav uses `scroll-margin-top` equal to header height on every target section; no nav-overlapped headings.
3. **Dialog rules** → focus trap, Escape, visible close, focus return, visible focus ring on every control inside, backdrop close; mobile bottom-sheet.
4. **dvh/svh for full-viewport heroes** (receptionist hero already `100svh`; retained).
5. **Pre-delivery checklist** applied to all four new components: cursor-pointer on every clickable, 150–300 ms hover transitions, ≥44 px targets, 4.5:1 text contrast, reduced-motion equivalents, responsive at 375/768/1024/1440.
6. **Trust & Authority pattern ordering** (hero credibility → proof → solution → CTA) — validated our homepage already follows it; kept.
NOT adopted: the skill's navy/blue palette suggestion — Glacier Mint is owner-locked; skill treated as advisory per its own contract.

## 3. Reference study (principles only; nothing copied)

| Site | Principle extracted | Applied to |
|---|---|---|
| Linear | The hero proves capability with a dense, *plausible live product artifact* (an issue with activity timeline), not decoration; sections pair one claim with one working excerpt | Build Preview + Connected Ops Map: dense synthetic artifacts (records, tasks, stages) instead of decorative cards |
| Vapi / Retell | Copy left + immediate interactive call experience right; use-case tabs; honest state messaging when the mic is blocked | Receptionist product theater: six-state simulated call with explicit "Simulated preview" disclosure |
| Work & Co | One bold problem statement + external credibility + immediately work-led ("New Work: X") | Work page leads with the real approved portfolio; company claims stay short |
| Webflow / Attio / Instrument / Clay / Bland / Synthflow | Substantial right-side product demonstration; connected records; build→test→deploy storytelling; editorial project presentation | Build Preview stages (Discover→Design→Build→Launch); Ops Map 7-stage flow; portfolio presentation |

## 4. Automated route scan (2026-09-06, all 16 public routes, rendered audit)

Zero findings for: dead anchors, `href="#"`, empty hrefs, disabled-nav-as-available, placeholder/lorem/"coming soon" copy, missing 404. Every internal link target resolves to a real route. (Scanner: `qa-audit-scan.mjs`; preview-banner state-switcher links are harness chrome, excluded.)
One copy inconsistency found and fixed: `/services` h1 said "Four connected systems" against the nine-capability architecture → now "Nine capabilities. One connected SiteMint build."

## 5. Section-by-section audit and corrections

(Referenced components in `artifacts/web-agency/src/…`)

| Area | Purpose / message | Prior condition | Correction | Component |
|---|---|---|---|---|
| Home hero | Flagship brand statement + film | 4:1 strip felt detached; film generic; after the first integrated pass the film still sat BELOW the copy, and the fixed 100svh stage was silently clipping the particle field + phase HUD off the bottom at common desktop heights | Crosswise order corrected: media stage is the TOP element (under the fixed header), the original approved composition (copy, CTAs, particle field, HUD) below it; the film is now the flex-grow element capped at 58% of usable height so the lower portion can never be clipped — verified film→copy→field→HUD all inside one viewport at 360/768/1440/1920; signal seam, pause control, dark-pill label strip; flagship 6-beat film from verified text-free keyframes | `pages/HomeV4.tsx`, `styles/v5-home.css` |
| Home · Websites & Web Apps | Prove we build sites AND apps | Right area static/decorative | Interactive Build Preview: type/build selectors, 3 viewports, 4-stage progress, approved Hand Homecare example | `components/v5/BuildPreview.tsx` |
| Home · CRM & Internal Systems | Show operations capability without exposing the private CRM | Abstract illustration only | Interactive Connected Ops Map: 7 clickable nodes + capability detail panel, synthetic data | `components/v5/ConnectedOpsMap.tsx` |
| Home/About · Team | Real people, real roles | Static cards | Clickable → accessible dialogs (focus trap, Esc, return focus, bottom-sheet mobile) with owner-supplied bios and real portraits | `components/v5/TeamMemberDialog.tsx`, `teamV5.ts` |
| Receptionist hero | Distinct product identity | Copied homepage band | Full-viewport product theater: dimmed cinematic business background film, copy+CTA left, six-state interactive simulated call right, always-visible "Simulated preview" | `pages/AiReceptionistV5.tsx`, `CallTheaterV5.tsx` |
| Receptionist nav | Product sub-navigation | Quick links without scrollspy | Dedicated sub-nav (Overview / Try the Demo / How It Works / Capabilities / Setup & Integrations / Business Uses / FAQ / Request Private Beta), every label mapped to a verified section id, scrollspy active state, keyboard+focus, mobile close | `SiteHeaderV4.tsx` product mode |
| Work · Selected projects | Real approved client work | (present since prior pass) | Verified again: approved 2B.2.4 lineup, external CTAs, portrait/featured variants | `pages/WorkV3.tsx` |
| All other public sections | (audited in prior passes) | — | Motion, evidence, spacing, honesty checks re-verified by scanner + captures this pass | — |

## 6. Completion standard (applied gate)

Every retained section now provides ≥2 of: clear message · meaningful visual explanation · real approved evidence · useful interaction · decisive next step. Sections verified against this standard in the final capture review (see owner package), not by component existence.

## 7. Media quality gate record

See MEDIA-CREDIT-LEDGER.md authorization-2 and the owner package: frame checks at 0/20/40/60/80/100% across desktop/laptop/tablet/mobile crops for every installed film; rejected takes recorded with reasons.

## 8. Final polish pass (owner layout correction, 2026-09-06 late)

The owner rejected the media-stage-on-top order and issued the final layout:
particles TOP → transparent floating copy → cinematic film BOTTOM.

| Item | Implementation | Verified |
|---|---|---|
| Hero order | Field first (40% of usable hero), copy `position:absolute` floating across the boundary with NO card/panel/background (contrast = ink field above + localized gradient inside the film frame + glyph text-shadow), film flex-grows to ~60%, phase HUD overlaid on the film's bottom edge | Rect probe at 360/768/1440/1920: field→copy→film order, HUD in view, nothing clipped; copy overlap raised so CTAs clear the opening-beat face (frame review) |
| Chrome-less films | All decorative videos: `controls={false}`, `disablePictureInPicture`, `disableRemotePlayback`, `controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"`, `data-sm-decorative-film`, `pointer-events:none`, webkit media-controls suppressed | qa-video-chrome: Chrome 6/6, Edge 6/6; hover screenshots show no PiP/Enhance affordance |
| Motion accessibility | Per-video pause buttons removed per owner; WCAG 2.2.2 satisfied by (a) reduced-motion never mounting films, (b) global footer "Motion: On/Off" preference (motionPref.ts, persists, flips gates live, pauses ambient CSS animation) | Footer control ≥44px, aria-pressed, focus ring |
| Receptionist hero | Film brightness 0.45→0.72, radial mask widened, scrim localized to the copy column + foot; theater carries its own solid surfaces | F3 capture: film clearly visible, copy ≥4.5:1 over its gradient |
| Call theater | Product identity header (SiteMint AI Receptionist · Bloom Dental · state chip · elapsed clock), 9-stage rail covering the eight canonical states incl. "Needs human attention" (insurance question → follow-up task) and "Completed" with outcome tags; current-system-action line; disclosure exactly "Simulated preview — no live call is being placed." | Interactions 8/8; attention-state capture reviewed |
| Owner dashboard | DashboardPreview: 4 KPIs, Today/7-Days, activity feed w/ outcome tags + All/Booked/Needs-attention filter, weekly chart, appointments, follow-up queue, knowledge status, "Illustrative dashboard — example data" label; synthetic Bloom Dental data only | Capture reviewed; toggle/filter clickable |
| Team cards | Larger real portraits (116px, rounded-rect), owner-verbatim ownership sentences + 3 tags each, "Meet … →" affordance, mint top-accent, hover lift/glow; dialogs gain tags + "What X owns" / "How X supports your project" subheads | Dialog battery passes |
| Discovery brand | Canonical SignalMarkV4 + "SiteMint" wordmark (Space Grotesk) replaces the legacy slate/emerald logo; mint selection glow language | Capture in final sweep |
| Pastel-mint layer | Semantic tokens (`--sm-mint-wash/-wash-deep/-hover/-border/-glow/-chip-*`) + global touches: `::selection`, outline-button hover wash, light-surface card hover glow, component accents above | Computed-color audit via Lighthouse a11y sweep |
| Film review (new crop) | 6-point ffmpeg frame review of the stage master in the rendered crop: PASSES (no malformed anatomy, no readable generated text, plan→build→deliver arc, Glacier light). Notes: 3s transitional torso-only beat; 12s stylized on-screen glow. NOT regenerated — layout correction did not degrade the film. | stage-*.jpg in shots/film-review |

## 9. Responsive-first finalization (owner directive, 2026-09-06 latest)

| Item | Implementation | Verification |
|---|---|---|
| Mobile nav root cause | The header's always-on `backdrop-filter` made it the containing block for the fixed sheet — the menu opened as a 64px sliver (why mobile "had no navigation"). Fixed with explicit viewport sizing on the sheet. | Nav battery 10/10; full-screen capture reviewed |
| Desktop mega menu | Five completed destinations w/ one-line descriptions + outcome kickers + two new glyphs (CRM stacked-records, Growth rising-line); mint hover rail; Motion pref in panel foot | Battery: 5 cards, Escape/focus, CRM card lands `/#crm-systems` top=8px |
| Tablet 640–1023 | Wide (520px) right-anchored panel over dimmed backdrop, slide-in 220ms | Battery + capture |
| Mobile sheet | Full-screen designed takeover: SiteMint **Digital** wordmark, What-We-Build accordion, flat Work/Process/Company/AI Receptionist, mint active rail + wash, Client Sign In, Start a Project, PREFERENCES group with the Motion switch (footer control removed), scroll lock, focus trap, Escape, close-after-nav, safe-area padding, reduced-motion instant entrance | Battery + capture |
| Product sub-nav <1024 | Scrollable second header row (scroll-snap, mint active pill); `--v4-hdr-h` raised via `:has()` scope so anchors/offsets stay exact | Landscape 844×390 capture; FAQ scrollspy still faqTop=-1 |
| Hero brand | "— SITEMINT DIGITAL" mono mint eyebrow + rule above the headline, no card | Battery + captures at 320–1920 |
| Hero scroll rail | Six-capability rail (Websites → SEO & Growth): CSS-var mint fill + active label driven by a passive rAF-coalesced scroll listener (no React state, no LCP cost); vertical right rail on desktop, horizontal scroll-snap strip between copy and poster on mobile; reduced-motion renders it complete | Battery: p=0→0.70, active 0→4 |
| Responsive matrix | 264-combo six-width sweep (0 overflow, expected 401 noise only) + 54-combo extra matrix: 320/412/430 phones, 820 tablet, 1280 laptop, 844×390 + 932×430 landscape, 720×450 (200%-zoom equivalent), 1920 | 0 failures; key captures visually reviewed. Chromium + Edge tested; Firefox/WebKit not installed in this environment — reported as untested |
| Media pass | 4 purposeful Magnific illustrations placed (Process planning band, AI-systems diagram band, Growth workspace figure, Websites responsive-devices band); 600 credits; ledger auth-3 | Frame gate per image; pages re-captured |
| Live voice demo | Flag-gated (`VITE_RECEPTIONIST_LIVE_VOICE_ENABLED`), consent-first, real-event-driven 17-state call UI, 90s cap, mute/end, per-tab single call; @vapi-ai/web only via dynamic import in vapiLoader.ts; committed bundle verified to contain zero SDK bytes; contract test amended accordingly (private-key ban unchanged) | Full gates: chain 2126 PASS, 1055/1055 tests; bundle grep 0 |
