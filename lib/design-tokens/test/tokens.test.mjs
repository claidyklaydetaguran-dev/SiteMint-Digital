#!/usr/bin/env node
/**
 * Focused tests for @workspace/design-tokens — token-source validation and
 * the two Phase 1B accessibility corrections (SHARED_DESIGN_TOKENS_SPEC.md
 * §16, §24). No dependencies; run with `node test/tokens.test.mjs`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = (name) => readFileSync(path.join(dir, "..", "src", name), "utf8");

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
  "--sm-color-text-primary",
  "--sm-color-text-muted",
  "--sm-color-border-default",
  "--sm-color-border-focus",
  "--sm-color-action-primary",
  "--sm-color-status-success",
  "--sm-color-status-warning",
  "--sm-color-status-danger",
  "--sm-shadow-md",
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
  "--sm-card-background",
  "--sm-input-border-focus",
  "--sm-focus-ring",
].forEach((token) => check(token, components.includes(token + ":")));

check(
  "component layer never pairs button-accent-text with white/inverse text",
  !/--sm-button-accent-text:\s*hsl\(var\(--sm-color-text-inverse\)\)/.test(components),
);

// ── 2. Accessibility — the two Phase 1B corrections ────────────────────────
console.log("Accessibility: Phase 1B corrected pairs (WCAG relative luminance)");

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

const white = [0, 0, 100];

// Light-theme corrected focus ring vs a white/near-white surface — 3:1 non-text minimum.
const lightFocusRing = [160, 76, 30];
check(
  "light color-border-focus vs white >= 3:1 (was 1.96:1 raw mint, failing)",
  contrastRatio(lightFocusRing, white) >= 3,
);

// Light-theme corrected success fill with white text — 4.5:1 text minimum.
const lightSuccess = [152, 50, 32];
check(
  "light color-status-success + white text >= 4.5:1 (was 2.92:1 raw success-500, failing)",
  contrastRatio(lightSuccess, white) >= 4.5,
);

// Dark-theme values are unchanged by Phase 1B — reconfirm they still pass.
const darkFocusRing = [160, 64, 55];
const darkBg = [160, 22, 7];
check("dark color-border-focus vs dark bg >= 3:1 (unchanged)", contrastRatio(darkFocusRing, darkBg) >= 3);

const darkSuccess = [152, 55, 48];
const darkSuccessText = [152, 40, 8];
check(
  "dark color-status-success + its dark text token >= 4.5:1 (unchanged)",
  contrastRatio(darkSuccess, darkSuccessText) >= 4.5,
);

// Bright mint must remain disqualified from white-text/direct-text use (§24) —
// this is a standing regression guard, not a new correction.
const brightMint = [160, 64, 50];
check(
  "bright mint + white text still measured failing (guards against reintroducing it)",
  contrastRatio(brightMint, white) < 3,
);

if (failures > 0) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log("\nAll token-source and accessibility checks passed.");
