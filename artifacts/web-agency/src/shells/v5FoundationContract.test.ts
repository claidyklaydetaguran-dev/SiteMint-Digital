/**
 * V5 foundation contract — focused regression tests for the "Signal,
 * mint-led" retheme foundation (V5-BLUEPRINT §1, §2, §11, §12, §14 PR-1).
 * Source-literal checks in the style of `v4FoundationContract.test.ts`:
 * dependency-free (fs.readFileSync only), run via tsx from
 * scripts/package.json.
 *
 * Guards, in order:
 *  1. System B tokens — `tokens-v5.css` exists, byte-identical, in both
 *     apps and carries the four load-bearing hex values V5-BLUEPRINT §2
 *     names; both apps' `index.css` import it.
 *  2. Retheme-not-rewrite — `v5-remap.css` (web-agency) introduces no
 *     gradient beyond the one permitted "signal thread" (§1); no `v5-*`
 *     stylesheet in either app still carries the retired V4 navy/cyan hex.
 *  3. Scroll-to-top — every V5-owned shell in both apps mounts
 *     `<RouteScrollManager`.
 *  4. Motion foundation — `Reveal.tsx` respects reduced motion.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const abs = (rel: string) => path.join(repoRoot, rel);
const read = (rel: string) => readFileSync(abs(rel), "utf8");

let failures = 0;
function check(label: string, ok: boolean) {
  if (ok) console.log(`  PASS  ${label}`);
  else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

const WA_TOKENS = "artifacts/web-agency/src/styles/tokens-v5.css";
const HD_TOKENS = "artifacts/helpdesk/src/styles/tokens-v5.css";
const WA_REMAP = "artifacts/web-agency/src/styles/v5-remap.css";
const HD_APP = "artifacts/helpdesk/src/styles/v5-app.css";

console.log("1. System B tokens");
check("web-agency tokens-v5.css exists", existsSync(abs(WA_TOKENS)));
check("helpdesk tokens-v5.css exists", existsSync(abs(HD_TOKENS)));

const waTokens = read(WA_TOKENS);
const hdTokens = read(HD_TOKENS);

check("the two tokens-v5.css copies are byte-identical", waTokens === hdTokens);

for (const literal of [
  "--sm-mint-500: #32C5D2",
  "--sm-mint-700: #0B7487",
  "--sm-teal-900: #173642",
  "--sm-ink-950: #153E52",
]) {
  check(`web-agency tokens-v5.css defines "${literal}"`, waTokens.includes(literal));
  check(`helpdesk tokens-v5.css defines "${literal}"`, hdTokens.includes(literal));
}

const waIndexCss = read("artifacts/web-agency/src/index.css");
const hdIndexCss = read("artifacts/helpdesk/src/index.css");
check(
  'web-agency index.css imports "./styles/tokens-v5.css"',
  /@import\s+["']\.\/styles\/tokens-v5\.css["']/.test(waIndexCss),
);
check(
  'helpdesk index.css imports "./styles/tokens-v5.css"',
  /@import\s+["']\.\/styles\/tokens-v5\.css["']/.test(hdIndexCss),
);

console.log("2. Retheme-not-rewrite");
const waRemap = read(WA_REMAP);
{
  const gradientMatches = [...waRemap.matchAll(/([^{}]*)\{[^{}]*linear-gradient/g)];
  check(
    "v5-remap.css introduces no gradient, or at most one on a `signal`-named selector",
    gradientMatches.length === 0 ||
      (gradientMatches.length === 1 && /signal/i.test(gradientMatches[0][1])),
  );
}

const retiredHexPattern = /#0D2440|#22D3EE/i;
for (const [name, dir] of [
  ["web-agency", "artifacts/web-agency/src/styles"],
  ["helpdesk", "artifacts/helpdesk/src/styles"],
] as const) {
  const files = readdirSync(abs(dir)).filter((f) => f.startsWith("v5-") || f === "tokens-v5.css");
  for (const file of files) {
    const contents = read(path.posix.join(dir, file));
    check(
      `${name}/styles/${file} carries no retired V4 navy/cyan hex`,
      !retiredHexPattern.test(contents),
    );
  }
}

console.log("3. Scroll-to-top routing");
const waShells: Array<[string, string]> = [
  ["web-agency PublicShell", "artifacts/web-agency/src/shells/PublicShell.tsx"],
  ["web-agency AuthShell", "artifacts/web-agency/src/shells/AuthShell.tsx"],
  ["web-agency DashboardShell", "artifacts/web-agency/src/shells/DashboardShell.tsx"],
  ["helpdesk AppShell", "artifacts/helpdesk/src/components/layout/AppShell.tsx"],
  ["helpdesk AuthShell", "artifacts/helpdesk/src/shells/AuthShell.tsx"],
  ["helpdesk PublicShell", "artifacts/helpdesk/src/shells/PublicShell.tsx"],
];
for (const [label, rel] of waShells) {
  check(`${label} mounts <RouteScrollManager`, read(rel).includes("<RouteScrollManager"));
}

check(
  "web-agency RouteScrollManager.tsx exists",
  existsSync(abs("artifacts/web-agency/src/components/v5/RouteScrollManager.tsx")),
);
check(
  "helpdesk RouteScrollManager.tsx exists",
  existsSync(abs("artifacts/helpdesk/src/components/layout/RouteScrollManager.tsx")),
);

console.log("4. Motion foundation");
const revealSrc = read("artifacts/web-agency/src/components/v5/Reveal.tsx");
check("Reveal.tsx references prefers-reduced-motion", /prefers-reduced-motion/.test(revealSrc));
check(
  "tokens-v5.css defines the .sm-reveal motion classes",
  /\.sm-reveal\s*\{/.test(waTokens) &&
    /\.sm-reveal--in\s*\{/.test(waTokens) &&
    /\.sm-reveal-words/.test(waTokens),
);
check(
  "tokens-v5.css's reduced-motion block renders the final state with no transition",
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/.test(waTokens),
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll V5 foundation contract checks passed.");
