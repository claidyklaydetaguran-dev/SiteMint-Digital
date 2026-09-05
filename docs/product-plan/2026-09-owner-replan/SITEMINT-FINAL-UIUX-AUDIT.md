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
