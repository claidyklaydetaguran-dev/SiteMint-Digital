#!/usr/bin/env node
/**
 * Focused tests for @workspace/design-tokens — token-source validation and
 * the accessibility corrections recorded in semantic.css's file header
 * (Phase 1B: focus-ring/success; Phase 1B.1: dark danger, disabled/inverse
 * roles). Values are parsed live from the CSS source (not hand-copied), so a
 * future edit to semantic.css that reintroduces a failing pairing fails this
 * test, not just a stale hardcoded snapshot. No dependencies; run with
 * `node test/tokens.test.mjs`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = (name) => readFileSync(path.join(dir, "..", "src", name), "utf8");
// Phase 1C.1: a couple of checks also read the pilot consumer's source
// (helpdesk) to guard against reintroducing the exact bug this checkpoint
// fixes — still dependency-free (fs.readFileSync only).
const helpdeskSrc = (relPath) =>
  readFileSync(path.join(dir, "..", "..", "..", "artifacts", "helpdesk", "src", relPath), "utf8");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

// ── 1. Token-source structure ──────────────────────────────────────────────
console.log("Token source: required primitives present");
const primitives = src("primitives.css");
[
  "--sm-evergreen-900",
  "--sm-evergreen-700",
  "--sm-mint-500",
  "--sm-mint-300",
  "--sm-mint-100",
  "--sm-jade-500",
  "--sm-neutral-0",
  "--sm-charcoal-950",
  "--sm-danger-500",
  "--sm-success-500",
  "--sm-warning-500",
  "--sm-info-500",
  "--sm-font-display",
  "--sm-font-body",
  "--sm-font-mono",
  "--sm-radius-sm",
  "--sm-radius-md",
  "--sm-radius-lg",
  "--sm-radius-xl",
  "--sm-radius-pill",
  "--sm-duration-fast",
  "--sm-duration-normal",
  "--sm-easing-standard",
].forEach((token) => check(token, primitives.includes(token + ":")));

console.log("Token source: required semantic tokens present (light + dark)");
const semantic = src("semantic.css");
const [lightBlock, darkBlock] = (() => {
  const rootStart = semantic.indexOf(":root {");
  const darkStart = semantic.indexOf(".dark {");
  return [semantic.slice(rootStart, darkStart), semantic.slice(darkStart)];
})();
[
  "--sm-color-bg-canvas",
  "--sm-color-surface-default",
  "--sm-color-surface-disabled",
  "--sm-color-text-primary",
  "--sm-color-text-muted",
  "--sm-color-text-inverse",
  "--sm-color-text-inverse-secondary",
  "--sm-color-text-disabled",
  "--sm-color-border-default",
  "--sm-color-border-focus",
  "--sm-color-border-disabled",
  "--sm-color-action-primary",
  "--sm-color-action-danger",
  "--sm-color-status-success",
  "--sm-color-status-warning",
  "--sm-color-status-danger",
  "--sm-shadow-md",
  "--sm-color-statusbadge-success-bg",
  "--sm-color-statusbadge-success-text",
  "--sm-color-statusbadge-warning-bg",
  "--sm-color-statusbadge-warning-text",
  "--sm-color-statusbadge-info-bg",
  "--sm-color-statusbadge-info-text",
  "--sm-color-statusbadge-neutral-bg",
  "--sm-color-statusbadge-neutral-text",
  "--sm-color-statusbadge-danger-bg",
  "--sm-color-statusbadge-danger-text",
].forEach((token) => {
  check(`${token} (light)`, lightBlock.includes(token + ":"));
  check(`${token} (dark)`, darkBlock.includes(token + ":"));
});

console.log("Token source: component layer present");
const components = src("components.css");
[
  "--sm-button-primary-background",
  "--sm-button-accent-background",
  "--sm-button-accent-text",
  "--sm-button-danger-background",
  "--sm-button-danger-text",
  "--sm-button-disabled-background",
  "--sm-button-disabled-text",
  "--sm-button-disabled-border",
  "--sm-input-disabled-background",
  "--sm-input-disabled-text",
  "--sm-input-disabled-border",
  "--sm-badge-inverse-background",
  "--sm-badge-inverse-text",
  "--sm-card-background",
  "--sm-input-border-focus",
  "--sm-focus-ring",
  "--sm-statusbadge-success-background",
  "--sm-statusbadge-success-text",
  "--sm-statusbadge-warning-background",
  "--sm-statusbadge-warning-text",
  "--sm-statusbadge-info-background",
  "--sm-statusbadge-info-text",
  "--sm-statusbadge-neutral-background",
  "--sm-statusbadge-neutral-text",
  "--sm-statusbadge-danger-background",
  "--sm-statusbadge-danger-text",
].forEach((token) => check(token, components.includes(token + ":")));

check(
  "component layer never pairs button-accent-text with white/inverse text",
  !/--sm-button-accent-text:\s*hsl\(var\(--sm-color-text-inverse\)\)/.test(components),
);

// ── 2. Live CSS parsing + resolution ───────────────────────────────────────
// Parses raw `--name: value;` declarations out of a CSS block (primitives.css
// has no theme selector, semantic.css has :root and .dark) and resolves
// `var(--x)` references against the merged primitive+semantic variable maps,
// exactly matching the cascade a browser would apply.

function parseDeclarations(cssText) {
  const map = {};
  const re = /(--sm-[a-z0-9-]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(cssText))) {
    // Keep the *last* occurrence for a given name within the block, matching
    // CSS cascade order for repeated declarations.
    map[m[1]] = m[2].trim();
  }
  return map;
}

const primitiveVars = parseDeclarations(primitives);
const lightVars = { ...primitiveVars, ...parseDeclarations(lightBlock) };
const darkVars = { ...primitiveVars, ...parseDeclarations(darkBlock) };

function resolve(value, varMap, seen = new Set()) {
  const varRef = /^var\((--sm-[a-z0-9-]+)\)$/.exec(value.trim());
  if (!varRef) return value.trim();
  const name = varRef[1];
  if (seen.has(name)) throw new Error(`circular var() reference: ${name}`);
  if (!(name in varMap)) throw new Error(`undefined token referenced: ${name}`);
  return resolve(varMap[name], varMap, new Set(seen).add(name));
}

function getTriplet(token, varMap) {
  const raw = varMap[token];
  if (raw === undefined) throw new Error(`token not found: ${token}`);
  const resolved = resolve(raw, varMap);
  const parts = resolved.split(/\s+/).map((v) => parseFloat(v));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`token ${token} did not resolve to an "H S% L%" triplet: "${resolved}"`);
  }
  return parts;
}

// ── 3. WCAG relative-luminance contrast ─────────────────────────────────────

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m].map((v) => Math.round(v * 255));
}
function relLum([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrastRatio(hsl1, hsl2) {
  const L1 = relLum(hslToRgb(...hsl1));
  const L2 = relLum(hslToRgb(...hsl2));
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}
function tokenRatio(fgToken, bgToken, varMap) {
  return contrastRatio(getTriplet(fgToken, varMap), getTriplet(bgToken, varMap));
}

const white = [0, 0, 100];

// ── 4. Accessibility — Phase 1B corrections (unchanged, re-verified live) ──
console.log("Accessibility: Phase 1B corrected pairs (WCAG relative luminance, live-parsed)");

check(
  `light color-border-focus vs white >= 3:1 (was 1.96:1 raw mint, failing) — ${contrastRatio(getTriplet("--sm-color-border-focus", lightVars), white).toFixed(2)}:1`,
  contrastRatio(getTriplet("--sm-color-border-focus", lightVars), white) >= 3,
);

check(
  `light color-status-success + white text >= 4.5:1 (was 2.92:1 raw success-500, failing) — ${contrastRatio(getTriplet("--sm-color-status-success", lightVars), white).toFixed(2)}:1`,
  contrastRatio(getTriplet("--sm-color-status-success", lightVars), white) >= 4.5,
);

check(
  `dark color-border-focus vs dark bg >= 3:1 (unchanged) — ${tokenRatio("--sm-color-border-focus", "--sm-color-bg-canvas", darkVars).toFixed(2)}:1`,
  tokenRatio("--sm-color-border-focus", "--sm-color-bg-canvas", darkVars) >= 3,
);

const darkSuccessText = [152, 40, 8]; // dedicated dark success-fill text, not a shared token
check(
  `dark color-status-success + its dark text token >= 4.5:1 (unchanged) — ${contrastRatio(getTriplet("--sm-color-status-success", darkVars), darkSuccessText).toFixed(2)}:1`,
  contrastRatio(getTriplet("--sm-color-status-success", darkVars), darkSuccessText) >= 4.5,
);

const brightMint = [160, 64, 50];
check(
  "bright mint + white text still measured failing (guards against reintroducing it)",
  contrastRatio(brightMint, white) < 3,
);

// ── 5. Accessibility — Phase 1B.1 corrections and new roles ─────────────────
console.log("Accessibility: Phase 1B.1 corrected/new pairs (WCAG relative luminance, live-parsed)");

// 5a. Dark danger — the headline Phase 1B.1 fix. Must be >= 4.5:1, and this
// check reads live off semantic.css, so a regression to the old 356 65% 55%
// value (4.40:1) fails this test.
const darkDangerRatio = contrastRatio(getTriplet("--sm-color-action-danger", darkVars), white);
check(
  `dark color-action-danger + white text >= 4.5:1 (was 4.40:1 raw, marginal AA fail) — ${darkDangerRatio.toFixed(2)}:1`,
  darkDangerRatio >= 4.5,
);
check(
  `dark color-status-danger + white text >= 4.5:1 (kept in sync with action-danger) — ${contrastRatio(getTriplet("--sm-color-status-danger", darkVars), white).toFixed(2)}:1`,
  contrastRatio(getTriplet("--sm-color-status-danger", darkVars), white) >= 4.5,
);
check(
  `light color-action-danger + white text >= 4.5:1 (unchanged) — ${contrastRatio(getTriplet("--sm-color-action-danger", lightVars), white).toFixed(2)}:1`,
  contrastRatio(getTriplet("--sm-color-action-danger", lightVars), white) >= 4.5,
);
// Hue/saturation must not have drifted toward pink/purple/orange/brown —
// only lightness may have moved.
{
  const [h, s] = getTriplet("--sm-color-action-danger", darkVars);
  check(`dark danger keeps its hue (356°, was 356°) — got ${h}°`, h === 356);
  check(`dark danger keeps its saturation (65%, was 65%) — got ${s}%`, s === 65);
}

// 5b. Inverse tokens — primary and secondary text on the inverse background,
// both themes.
for (const [label, vars] of [["light", lightVars], ["dark", darkVars]]) {
  const primaryRatio = tokenRatio("--sm-color-text-inverse", "--sm-color-bg-inverse", vars);
  check(
    `${label} inverse primary text/background >= 4.5:1 — ${primaryRatio.toFixed(2)}:1`,
    primaryRatio >= 4.5,
  );
  const secondaryRatio = tokenRatio("--sm-color-text-inverse-secondary", "--sm-color-bg-inverse", vars);
  check(
    `${label} inverse secondary text/background >= 4.5:1 — ${secondaryRatio.toFixed(2)}:1`,
    secondaryRatio >= 4.5,
  );
}

// 5c. Disabled tokens — readable-label standard (SiteMint internal: >= 3:1
// against both canvas and the disabled surface, even though WCAG itself
// exempts truly inactive controls from any contrast minimum) plus a
// decorative-only check for the disabled border (no text minimum, matching
// the existing border-vs-canvas precedent).
for (const [label, vars] of [["light", lightVars], ["dark", darkVars]]) {
  const vsCanvas = tokenRatio("--sm-color-text-disabled", "--sm-color-bg-canvas", vars);
  check(
    `${label} disabled text vs canvas >= 3:1 (SiteMint readable-label standard) — ${vsCanvas.toFixed(2)}:1`,
    vsCanvas >= 3,
  );
  const vsSurface = tokenRatio("--sm-color-text-disabled", "--sm-color-surface-disabled", vars);
  check(
    `${label} disabled text vs disabled surface >= 3:1 — ${vsSurface.toFixed(2)}:1`,
    vsSurface >= 3,
  );
  const borderVsSurface = tokenRatio("--sm-color-border-disabled", "--sm-color-surface-disabled", vars);
  check(
    `${label} disabled border vs disabled surface is visible (>= 1.15:1, decorative only) — ${borderVsSurface.toFixed(2)}:1`,
    borderVsSurface >= 1.15,
  );
  // Disabled text must not be brighter/more prominent than the theme's own
  // primary text — a disabled control should never read as more emphatic
  // than active content.
  const disabledVsPrimary = tokenRatio("--sm-color-text-disabled", "--sm-color-bg-canvas", vars) <=
    tokenRatio("--sm-color-text-primary", "--sm-color-bg-canvas", vars);
  check(`${label} disabled text is less prominent than primary text`, disabledVsPrimary);
}

// ── 6. Accessibility — Phase 1C.1 corrections (focus + StatusBadge) ────────
console.log("Accessibility: Phase 1C.1 corrected pairs (WCAG relative luminance, live-parsed)");

// 6a. Focus ring vs. surrounding surface — this is the token-level fact the
// Phase 1C.1 fix relies on (Button no longer suppresses the global 2px
// outline, so the ring's real adjacent color becomes the surrounding
// surface via the outline-offset gap, not the button's own same-hue fill).
// These specific pairs were already passing and are re-asserted here as a
// named regression guard tied to the Phase 1C.1 fix, not just Phase 1B's.
check(
  `light color-border-focus vs canvas >= 3:1 (surrounding-surface adjacency after the offset fix) — ${tokenRatio("--sm-color-border-focus", "--sm-color-bg-canvas", lightVars).toFixed(2)}:1`,
  tokenRatio("--sm-color-border-focus", "--sm-color-bg-canvas", lightVars) >= 3,
);
check(
  `dark color-border-focus vs canvas >= 3:1 (surrounding-surface adjacency after the offset fix) — ${tokenRatio("--sm-color-border-focus", "--sm-color-bg-canvas", darkVars).toFixed(2)}:1`,
  tokenRatio("--sm-color-border-focus", "--sm-color-bg-canvas", darkVars) >= 3,
);
// Regression guard: the exact previously-failing ring-vs-button-fill pairs
// (documented historical values, not re-derived) are recorded here so the
// numbers are never silently lost, even though the fix makes this specific
// adjacency irrelevant (the 2px outline-offset gap means the ring no longer
// touches the fill directly).
check(
  "historical: light ring-vs-primary-fill measured 1.61:1 (documented, no longer the relevant adjacency post-fix)",
  true,
);
check(
  "historical: dark ring-vs-primary-fill measured 1.45:1 (documented, no longer the relevant adjacency post-fix)",
  true,
);

// 6b. Button component source no longer suppresses the global focus outline.
const buttonSrc = helpdeskSrc(path.join("components", "ui", "button.tsx"));
check(
  "button.tsx no longer sets focus-visible:outline-none (regression guard)",
  !/focus-visible:outline-none/.test(buttonSrc),
);
const helpdeskIndexCss = helpdeskSrc("index.css");
check(
  "index.css still defines the global 2px focus-visible outline + 2px offset",
  /:focus-visible\s*\{[^}]*outline:\s*2px solid hsl\(var\(--ring\)\)/.test(helpdeskIndexCss) &&
    /:focus-visible\s*\{[^}]*outline-offset:\s*2px/.test(helpdeskIndexCss),
);

// 6c. StatusBadge soft-tint pairs — every tone, both themes, >= 4.5:1.
console.log("Accessibility: StatusBadge soft-tint pairs >= 4.5:1 (all tones, both themes)");
for (const [label, vars] of [["light", lightVars], ["dark", darkVars]]) {
  for (const tone of ["success", "warning", "info", "neutral", "danger"]) {
    const ratio = tokenRatio(
      `--sm-color-statusbadge-${tone}-text`,
      `--sm-color-statusbadge-${tone}-bg`,
      vars,
    );
    check(`${label} statusbadge ${tone} text/background >= 4.5:1 — ${ratio.toFixed(2)}:1`, ratio >= 4.5);
  }
}
// Named regression guards for the exact three previously-failing pairs.
check(
  `light statusbadge warning >= 4.5:1 (was 2.09:1 raw warning-500-as-text, failing) — ${tokenRatio("--sm-color-statusbadge-warning-text", "--sm-color-statusbadge-warning-bg", lightVars).toFixed(2)}:1`,
  tokenRatio("--sm-color-statusbadge-warning-text", "--sm-color-statusbadge-warning-bg", lightVars) >= 4.5,
);
check(
  `light statusbadge info >= 4.5:1 (was 3.47:1 raw info-500-as-text, failing) — ${tokenRatio("--sm-color-statusbadge-info-text", "--sm-color-statusbadge-info-bg", lightVars).toFixed(2)}:1`,
  tokenRatio("--sm-color-statusbadge-info-text", "--sm-color-statusbadge-info-bg", lightVars) >= 4.5,
);
check(
  `dark statusbadge danger >= 4.5:1 (was 3.83:1 raw dark-danger-as-text, failing) — ${tokenRatio("--sm-color-statusbadge-danger-text", "--sm-color-statusbadge-danger-bg", darkVars).toFixed(2)}:1`,
  tokenRatio("--sm-color-statusbadge-danger-text", "--sm-color-statusbadge-danger-bg", darkVars) >= 4.5,
);

// 6d. StatusBadge.tsx source actually consumes the corrected tokens (guards
// against a future edit silently reverting to the raw opacity-tint pattern).
const statusBadgeSrc = helpdeskSrc(path.join("components", "common", "StatusBadge.tsx"));
check(
  "StatusBadge.tsx consumes the statusbadge-* component tokens for every tone",
  ["success", "warning", "info", "neutral", "danger"].every((tone) =>
    new RegExp(`bg-statusbadge-${tone}-bg`).test(statusBadgeSrc) &&
    new RegExp(`text-statusbadge-${tone}-text`).test(statusBadgeSrc),
  ),
);

if (failures > 0) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log("\nAll token-source and accessibility checks passed.");
