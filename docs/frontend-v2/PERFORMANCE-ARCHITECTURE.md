# Performance Architecture — Frontend V2

## 1. Measured starting point

From the Gate 2D/3 builds of `9bc2694`:

| Metric | Today |
|---|---|
| web-agency modules | **3,045** |
| web-agency main bundle | **1,812.80 kB** (475.70 kB gzipped) |
| web-agency main CSS | 205.77 kB |
| helpdesk main bundle | 1,057.09 kB (301.40 kB gzipped) |
| api-server bundle | 12.2 MB |
| `public/` assets | **19.8 MB across 19 files; 14 images > 300 KB** |
| Google Fonts families | **3**, render-blocking third-party |
| Route-level error boundaries | effectively none (3 refs web-agency, 2 helpdesk) |

**Public-route budget for V2: under 250 KB gzipped.** Today's single public chunk
is 475.70 kB gzipped — roughly **1.9× over budget before any images.**

## 2. Where the 1.81 MB goes — and how it is separated

### Cause 1 — the internal CRM ships to the public (dominant)

`web-agency/src/App.tsx` eagerly imports **26 `/admin/crm/*` pages plus 3
`/admin/*` pages** — 31 files, **≈1.13 MB of source**, ~71% of all page source in
the app. Every public visitor downloads the entire internal CRM.

**Fix:** move all `/admin/*` behind `React.lazy` under a single `AdminShell`
lazy boundary, so the CRM forms its own chunk graph loaded only after an admin
route matches.
**Expected effect: the largest single reduction available.**

### Cause 2 — eager public pages

`LandingReceptionist` (80 KB source), `LandingReceptionistSignup`,
`LandingLawyers`, `LandingRealtors`, `ThankYou`, `NotFound` are direct imports.
**Fix:** every route component becomes `lazy()`. Only the shell, router, tokens,
and header/footer stay eager.

**Lazy imports must not be funnelled through a barrel module.** A barrel that
re-exports every page recreates eager loading and silently defeats the split —
each route imports its own component directly inside its own `lazy()` call.

Phase 1 establishes **three explicit shells and only three** — `PublicShell`,
`AuthShell`, `DashboardShell`. No dashboard navigation or admin dependency may
enter `PublicShell` (that is what puts the CRM back in the public graph), and no
promotional public-site section may enter `DashboardShell`.

### Cause 3 — animation library breadth

`framer-motion` in 15 files pulls it into most chunks.
**Fix:** CSS-first motion; `framer-motion` confined to ≤ 2 modules
(`MOTION-AND-INTERACTION.md` §8).

### Cause 4 — duplicated UI kits

56 shadcn files in web-agency + 55 in helpdesk, independently bundled.
**Fix:** one shared `@workspace/ui` package, tree-shakeable, imported per
component — never barrel-imported.

### Cause 5 — icon and vendor barrels

**Fix:** named `lucide-react` imports only; no `import * as`. Verify with a
bundle report that no barrel re-exports the whole icon set.

### Target chunk map

```
entry            shell, router, tokens, header, footer   ≤  90 KB gz
home             homepage sections                        ≤  60 KB gz
solutions/*      per solution page                        ≤  40 KB gz
ai-receptionist  landing + workflow diagram               ≤  70 KB gz
signup           two-step form                            ≤  35 KB gz
discovery        existing DiscoveryPage graph             (unchanged)
admin/*          entire CRM, lazy                         (off public path)
```

Public first load = entry + one route chunk. Budget **≤ 250 KB gz**, target
≈ 150 KB gz for the homepage.

## 3. Core Web Vitals targets

| Metric | Target | How |
|---|---|---|
| **LCP < 2.5 s** | mid-range mobile | Hero is HTML/CSS, not an image; fonts non-blocking; entry chunk small |
| **CLS < 0.1** | | Skeletons match final geometry; images always have `width`/`height`; no late-injected banners |
| **INP < 200 ms** | | No long tasks on interaction; motion is transform/opacity; validation not per-keystroke |
| TTFB | preview/static | unchanged — static hosting |

## 4. Image policy

- **No above-the-fold image over ~300 KB optimised.** Today 14 files exceed
  300 KB, the largest at 2.38 MB — all must be reprocessed.
- Serve **AVIF → WebP → PNG/JPEG** fallback via `<picture>`.
- Every image has explicit `width`/`height` and a responsive `srcset`/`sizes`.
- Below-the-fold images: `loading="lazy" decoding="async"`.
- The hero uses **no raster image at all** — it is a CSS/SVG composition.
- No autoplay media anywhere.

## 5. Font policy

Remove the need for the three render-blocking Google families — Inter (a
`<link>` in `artifacts/web-agency/index.html`) plus Plus Jakarta Sans and
Playfair Display (an `@import` at the top of each app's `index.css`).

**Binding rule: no new remote font request.** Use **one approved variable font
only if it is already safely available** in the repository (self-hosted,
Latin-subset, `woff2`, `font-display: swap`, preloaded once). **Otherwise Phase 1
ships a high-quality system font stack** — zero font requests, zero
invisible-text period, and the expected Phase 1 outcome. Adding a webfont
dependency is out of Phase 1 scope.

Phase 1 reports **font requests before and after** as a measured figure.

## 6. Base-path behaviour (centralised)

Gate 3 proved this is a real defect: `hero-devices-remove-bg-io.png` 404'd
because it is referenced root-relative, and the header "Sign In" link produced a
**doubled prefix** because an absolute href was concatenated with the router
base.

V2 requires:

1. **One centralised, typed route/path layer** for internal links and asset URLs,
   deriving from `import.meta.env.BASE_URL`. Requirements: public routes work at
   `/`; configured deployment prefixes stay supported; **no manually doubled base
   path**; **no root-relative asset failure**; internal navigation never
   concatenates the deployment base twice; **`Start Your Project` resolves to
   `/discovery`**; **dashboard paths stay distinguishable from public paths**.
   **Deployment configuration is not changed.**
2. **No component composes an absolute in-app URL by hand.** Internal links use
   the router; asset URLs use the helper or a Vite-resolved `import`.
   `navConfig.ts`'s `signInHref` (`/ai-receptionist/dashboard/login`) and
   `LandingReceptionistSignup.tsx`'s two hardcoded
   `/ai-receptionist/dashboard/…` strings are the concrete offenders — they
   become helper calls. The five `/app*` `LegacyRedirect` targets are
   cross-application document navigations and must resolve through the same
   helper without acquiring the router base.
3. Static assets referenced through Vite imports so hashing and base rewriting
   are automatic; `public/` is reserved for genuinely path-stable files.
4. Cross-app links (web-agency ↔ helpdesk) go through one
   `dashboardUrl()` helper.
5. **Acceptance test:** the app must render correctly served at both `/` and a
   configured prefix, with zero 404s in the network log.

## 7. Resilience

Phase 1 adds a route-level loading fallback **and** an error-recovery boundary
(or equivalent) for **every major route group**, subject to:

- **No blank screen**, ever.
- **Loading UI must not block content that is already available.**
- **Loading layout has stable dimensions** — the skeleton reserves the final
  geometry so nothing shifts (CLS).
- **Errors provide a retry or a safe navigation action.**
- **No technical stack traces are shown to ordinary users** — the recovery panel
  is plain language; diagnostics go to the console, not the page.
- **Reduced-motion preferences are honoured** in every loading and recovery
  state.

Additionally:

- **Every major route gets an error boundary.** A failed lazy chunk shows a
  designed recovery panel with Retry, never a blank screen.
- A chunk-load failure (stale deploy) triggers one automatic reload attempt, then
  the recovery panel.
- Every async surface implements all four states (loading/empty/error/populated).
- No unresolved promise may leave a permanent spinner; every fetch has a timeout
  and a terminal state.

## 8. Dependency discipline

Prefer browser APIs and existing primitives. A new dependency requires: no
adequate existing primitive, measured bundle cost, and a note in the phase PR.
Third-party analytics/scripts, if ever added, must be `async`/deferred and must
never block rendering.

## 9. Verification per phase

Each implementation phase reports:

1. `pnpm run build` module count and per-chunk sizes, diffed against the previous
   phase — including **public entry bundle before and after**, **gzipped public
   initial JS before and after**, **per-route chunk names and sizes**, and
   **CSS size**.
2. Gzipped size of the public entry + homepage chunk against the 250 KB budget.
3. **Whether any dashboard/admin module appears in the public initial graph** —
   the primary Phase 1 acceptance signal. Target: none.
4. **Font requests** before and after, and **build warnings** (no new warning
   category).
5. Lighthouse (or equivalent) LCP/CLS/INP on a throttled mobile profile.
6. A network log at both `/` and a prefixed base showing **zero 404s**.
7. `pnpm run typecheck` and `pnpm run test` matching the Gate 2D baseline
   (0 errors; 100/100 Vitest; 9/9 legacy).

> **Where these are measured.** `pnpm-workspace.yaml` (frozen blob) prunes every
> non-Linux-x64 `esbuild` and `rollup` native binary, so the production build and
> the Vitest suite **cannot run on Windows** in this worktree — only
> `pnpm run typecheck` can. Every bundle measurement above must be produced on a
> **Linux x64 candidate**, as Gates 2A–2D were. Run workspace scripts with
> `--config.verify-deps-before-run=false` so pnpm's pre-run auto-install cannot
> append an `allowBuilds:` stub to the frozen blob.
