/**
 * Frontend V5 — committed contract test for `HomeV5.tsx` (workbook item 11).
 *
 * Same dependency-free, source-literal style as
 * `shells/v4FoundationContract.test.ts` and `signup/signupContract.test.ts`:
 * `fs.readFileSync` + regex assertions, run via `tsx` from
 * `scripts/package.json`. No test framework, no DOM, no new dependency.
 *
 * Guards, in order:
 *  1. All 15 approved homepage sections (V5-BLUEPRINT §4) have a literal
 *     anchor id in the page source.
 *  2. Brand hygiene (W-1) — "Signal" appears only as an internal component
 *     name (`SignalHeroV4`, `SignalJourneyV4`, both imported and reused, not
 *     replaced — see their own modules), never as visible copy.
 *  3. The amended hero copy literals (headline, supporting copy, brand line,
 *     CTA labels) are present verbatim.
 *  4. The `Reveal` motion component (`components/v5/Reveal`) is used at most
 *     twice per section, per the global motion spec (V5-BLUEPRINT §11: "at
 *     most two animated groups per viewport").
 *  5. Nine-capability expansion (V5 owner directive, 2026-09-05): the
 *     capability ledger's heading and lede say "nine", and all nine approved
 *     capability labels are present verbatim, including the four added by
 *     this workstream (Strategy & Discovery, Growth Infrastructure,
 *     Advertising Services, Ongoing Support & Optimization).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webAgencyRoot = path.resolve(here, "..", "..");
const read = (rel: string) => readFileSync(path.join(webAgencyRoot, rel), "utf8");

let failures = 0;
function check(label: string, ok: boolean) {
  if (ok) console.log(`  PASS  ${label}`);
  else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

const homeV5Src = read("src/pages/HomeV5.tsx");

console.log("1. Fifteen approved homepage sections have a literal anchor id");
const SECTION_ID_PATTERNS: Array<[string, RegExp]> = [
  ["01 hero", /id="hero"/],
  ["02 what-we-build", /id="what-we-build"/],
  ["03 connected-system", /id="connected-system"/],
  ["04 websites-apps", /id="websites-apps"/],
  ["05 crm-systems", /id="crm-systems"/],
  ["06 ai-systems", /id="ai-systems"/],
  ["07 ai-receptionist", /id="ai-receptionist"/],
  ["08 discovery", /id="discovery"/],
  ["09 selected-work (HOME_SECTIONS.work)", /id=\{HOME_SECTIONS\.work\}/],
  ["10 how-it-works (HOME_SECTIONS.process)", /id=\{HOME_SECTIONS\.process\}/],
  ["11 pricing-estimates", /id="pricing-estimates"/],
  ["12 why-sitemint", /id="why-sitemint"/],
  ["13 team", /id="team"/],
  ["14 faq (HOME_SECTIONS.faq)", /id=\{HOME_SECTIONS\.faq\}/],
  ["15 final-cta", /id="final-cta"/],
];
for (const [label, pattern] of SECTION_ID_PATTERNS) {
  check(`section present: ${label}`, pattern.test(homeV5Src));
}

console.log("2. Brand hygiene (W-1) — no visible 'Signal' copy");
{
  const codeOnlyLines = homeV5Src.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("import ")) return false;
    if (trimmed.startsWith("//")) return false;
    if (trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
    return true;
  });
  // The only approved "Signal"-named identifiers this page reuses (not
  // replaces) are these two components — strip their usages, then assert
  // nothing else contains "Signal".
  // `MintSignalCorner` joined the approved internal names with the
  // mint-brand directive (2026-09-07): the "Mint Signal" graphic language
  // ornament — an identifier only, never visible copy.
  const withoutApprovedNames = codeOnlyLines
    .join("\n")
    .replace(/SignalHeroV4/g, "")
    .replace(/SignalJourneyV4/g, "")
    .replace(/MintSignalCorner/g, "")
    .replace(/MintSignal/g, "");
  check(
    "no 'Signal' string outside approved internal component names",
    !/Signal/.test(withoutApprovedNames),
  );
}

console.log("3. Business-owner hero copy (owner directive 2026-09-08) is present verbatim");
// The key phrase carries the signature highlight (`.sm-mark`), so the
// VISIBLE text splits across the mark markup — the check asserts both
// halves in order, with exactly the approved highlight span between them.
check(
  "headline",
  /Websites and business systems built to\{" "\}[\s\S]{0,40}<span className="sm-mark">help you grow\.<\/span>/.test(
    homeV5Src,
  ),
);
check(
  "supporting copy",
  /SiteMint helps you attract customers, organize inquiries,[\s\S]*follow up faster, and reduce repetitive work/.test(
    homeV5Src,
  ),
);
// Professional redesign (owner directive 2026-09-09): the extra hero brand
// line was retired ("fewer labels competing above the fold" — the header
// wordmark establishes the brand), and the secondary CTA is the approved
// "See Our Work". The hero eyebrow speaks the category line instead.
check(
  "hero eyebrow (category line)",
  /Websites · Systems · Automation/.test(homeV5Src),
);
check("primary CTA label", /Plan My Project/.test(homeV5Src));
check("secondary CTA label", /See Our Work/.test(homeV5Src));

console.log("4. Reveal used at most twice per section");
{
  // Split into top-level `function Name(...) { ... }` blocks the same way
  // the page is composed — one function per section — and count `<Reveal`
  // occurrences within each.
  const functionBlocks = homeV5Src.split(/\nfunction /).slice(1);
  let anyOverLimit = false;
  for (const block of functionBlocks) {
    const name = block.slice(0, block.indexOf("(")).trim();
    const count = (block.match(/<Reveal\b/g) ?? []).length;
    if (count > 2) {
      anyOverLimit = true;
      console.error(`  FAIL  ${name} uses <Reveal> ${count} times (max 2)`);
    }
  }
  check("no section exceeds two <Reveal> uses", !anyOverLimit);
}

console.log("5. Four business-owner capability groups (owner directive 2026-09-08)");
check(
  "grouped heading",
  /Everything your business needs to grow and stay organized\./.test(homeV5Src),
);
check(
  "supporting explanation",
  /Start with one service or connect everything/.test(homeV5Src),
);
const CAPABILITY_GROUP_TITLES = [
  "Attract customers",
  "Organize the business",
  "Follow up consistently",
  "Improve over time",
];
for (const title of CAPABILITY_GROUP_TITLES) {
  check(`capability group present: "${title}"`, homeV5Src.includes(title));
}
// The regrouping must not LOSE capabilities — each former ledger entry
// survives inside a group (some renamed into owner language; the mapping
// is documented on CAPABILITY_GROUPS).
const PRESERVED_CAPABILITIES = [
  "Websites",
  "Custom internal tools",
  "Customer information",
  "Advertising & campaigns",
  "AI Receptionist",
  "Ongoing support",
  "Forms & inquiry handling",
  "Reporting",
];
for (const label of PRESERVED_CAPABILITIES) {
  check(`capability preserved: "${label}"`, homeV5Src.includes(label));
}
check("every group offers View details", (homeV5Src.match(/detailsLabel: "View /g) ?? []).length === 4);

/* ── Mobile particle journey + retired motion preference ────────────────
 * Owner hotfix 2026-09-09. Static companions to the rendered gate in
 * `scripts/qa-hero-particles.mjs` — these catch a regression at typecheck
 * time, before anyone has to start a browser.
 */
const homeV4Src = read("src/pages/HomeV4.tsx");
const headerSrc = read("src/components/v4/SiteHeaderV4.tsx");
const motionSrc = read("src/components/v5/motionPref.ts");
const mainSrc = read("src/main.tsx");
const homeCssSrc = read("src/styles/v5-home.css");

// One progress function, measured against the pinned stage — not the visual
// viewport, which a phone's toolbar resizes mid-scroll.
check("hero progress has a single shared implementation", homeV4Src.includes("function heroProgress("));
check(
  "hero progress measures the sticky stage, not the visual viewport alone",
  homeV4Src.includes("Math.min(stage.offsetHeight, window.innerHeight)"),
);
check("the rail reads the shared progress helper", homeV4Src.includes("const p = heroProgress(hero, stage);"));
check("the canvas reads the shared progress helper", homeV4Src.includes("return heroProgress(root, stageEl);"));
// A degenerate runway must show the story COMPLETE, never pinned at 0 — the
// old rail clamped to 0 exactly where the canvas jumped to 1.
check("degenerate runway resolves to the complete story", homeV4Src.includes("if (runway <= 8) return 1;"));

// No forced layout inside the animation frame.
check("no per-frame canvas size probe", !homeV4Src.includes("if (canvas.clientWidth !== W"));
check("canvas resizes via ResizeObserver", homeV4Src.includes("new ResizeObserver(() => resize())"));

// Mobile gets a shorter pin so the journey stays coupled to the thumb.
check("mobile hero runway is shortened", homeCssSrc.includes(".sm-home-v5 #hero .v4-hero { height: 170svh; }"));
check("mobile keeps a lighter particle count", homeV4Src.includes("function particleCount()"));

// The visitor-facing motion switch is gone from every surface.
for (const gone of ["SheetMotionPref", "Reduce animation", "v4-sheet__prefs", "setMotionOff", "Preferences"]) {
  check(`retired motion control absent from the header: "${gone}"`, !headerSrc.includes(gone));
}

// A stale stored value must never be able to suppress motion again.
check("motionOff() is inert", motionSrc.includes("export function motionOff(): boolean {") && motionSrc.includes("return false;"));
check("legacy key is purged, not merely ignored", motionSrc.includes("localStorage.removeItem(LEGACY_KEY)"));
check("the purge runs at boot", mainSrc.includes("purgeLegacyMotionPref()"));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll HomeV5 contract checks passed.");
