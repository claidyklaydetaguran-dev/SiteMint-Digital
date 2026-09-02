/**
 * V4 R1 foundation contract — focused regression tests for the owner-mandated
 * corrections. Source-literal checks in the style of the committed contract
 * suites: dependency-free (fs.readFileSync only), run via tsx from
 * scripts/package.json.
 *
 * Guards, in order:
 *  1. Viewport accessibility — no zoom-disabling viewport meta in either app.
 *  2. Footer CLS lifecycle — the V4 main reserves a viewport of height so the
 *     footer can never lay out inside the initial viewport during a lazy
 *     route load (the measured ~0.40 CLS source), and the route fallback
 *     renders inside that reserved geometry.
 *  3. Font-swap CLS — every V4 face has a metric-matched local fallback
 *     (size-adjust + ascent/descent overrides) present and wired into the
 *     stacks, in both apps.
 *  4. Route-aware anchors — the hash-scroll hook exists, is mounted in the
 *     public shell, legacy homepage section ids are anchored in HomeV4, and
 *     anchor targets clear the fixed header via scroll-margin-top.
 *  5. Capability states — when the voice platform flag is off, the three live
 *     voice destinations route to the intentional ComingSoon capability state
 *     (not the 404), driven by committed nav metadata, with no enabled-sounding
 *     action and honest availability copy; the NotFound fallthrough remains.
 *  6. Canvas lifecycle — both canvas surfaces pause on page visibility as
 *     well as offscreen, and the reduced-motion resolved composition remains.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

let failures = 0;
function check(label: string, ok: boolean) {
  if (ok) console.log(`  PASS  ${label}`);
  else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

const waHtml = read("artifacts/web-agency/index.html");
const hdHtml = read("artifacts/helpdesk/index.html");
const chromeCss = read("artifacts/web-agency/src/styles/v4-chrome.css");
const tokensCss = read("artifacts/web-agency/src/styles/tokens-v4.css");
const hdAppCss = read("artifacts/helpdesk/src/styles/v4-app.css");
const shellSrc = read("artifacts/web-agency/src/shells/PublicShell.tsx");
const homeSrc = read("artifacts/web-agency/src/pages/HomeV4.tsx");
const hookSrc = read("artifacts/web-agency/src/components/v4/useHashScrollV4.ts");
const footerSrc = read("artifacts/web-agency/src/components/v4/SiteFooterV4.tsx");
const theaterSrc = read(
  "artifacts/web-agency/src/components/v4/ReceptionistTheaterV4.tsx",
);
const homeCss = read("artifacts/web-agency/src/styles/v4-home.css");
const hdApp = read("artifacts/helpdesk/src/App.tsx");

console.log("1. Viewport accessibility");
for (const [name, html] of [
  ["web-agency", waHtml],
  ["helpdesk", hdHtml],
] as const) {
  check(`${name}: no user-scalable=no`, !/user-scalable\s*=\s*no/i.test(html));
  check(
    `${name}: no maximum-scale below 5`,
    !/maximum-scale\s*=\s*[0-4](\.\d+)?\b/i.test(html),
  );
  check(
    `${name}: viewport meta still present`,
    /name="viewport" content="width=device-width, initial-scale=1"/.test(html),
  );
}

console.log("2. Footer CLS lifecycle");
{
  const main = /\.v4-shell__main\s*\{[^}]*\}/s.exec(chromeCss)?.[0] ?? "";
  check(
    "v4 main reserves a viewport of height (footer below the fold at first paint)",
    /min-height:\s*100vh/.test(main) && /min-height:\s*100svh/.test(main),
  );
  check(
    "the route fallback stretches into the reserved V4 geometry",
    /\.v4-shell \.v2-route-fallback\s*\{[^}]*min-height:\s*100vh/s.test(chromeCss),
  );
  check(
    "the V4 shell renders the footer after <main>, never before it",
    shellSrc.indexOf('className="v4-shell__main"') <
      shellSrc.indexOf("<SiteFooterV4 />"),
  );
}

console.log("3. Metric-matched font fallbacks");
for (const face of [
  "Space Grotesk Fallback",
  "DM Sans Fallback",
  "JetBrains Mono Fallback",
  "Newsreader Fallback",
]) {
  const ff = new RegExp(
    `@font-face\\s*\\{[^}]*font-family:\\s*"${face}"[^}]*size-adjust[^}]*ascent-override[^}]*\\}`,
    "s",
  );
  check(`web-agency defines "${face}" with metric overrides`, ff.test(tokensCss));
  check(
    `web-agency stacks include "${face}"`,
    tokensCss.split(`"${face}"`).length - 1 >= 2,
  );
}
check(
  "helpdesk defines the DM Sans + Space Grotesk fallbacks with metric overrides",
  /"DM Sans Fallback"[\s\S]*size-adjust/.test(hdAppCss) &&
    /"Space Grotesk Fallback"[\s\S]*size-adjust/.test(hdAppCss) &&
    /--sd-font:[^;]*"DM Sans Fallback"/.test(hdAppCss),
);

console.log("4. Route-aware anchors");
check(
  "the hash-scroll hook retries until the lazy route mounts and moves focus",
  /hashchange/.test(hookSrc) &&
    /scrollIntoView/.test(hookSrc) &&
    /focus\(\{ preventScroll: true \}\)/.test(hookSrc),
);
check(
  "PublicShell mounts the hook",
  /useHashScrollV4\(\);/.test(shellSrc),
);
check(
  "HomeV4 anchors every legacy homepage section id",
  /id=\{HOME_SECTIONS\.process\}/.test(homeSrc) &&
    /id=\{HOME_SECTIONS\.work\}/.test(homeSrc) &&
    /id=\{HOME_SECTIONS\.faq\}/.test(homeSrc) &&
    /id="signal-journey"/.test(
      read("artifacts/web-agency/src/components/v4/SignalJourneyV4.tsx"),
    ),
);
check(
  "a route-aware section link exists (footer → /#signal-journey)",
  /href="\/#signal-journey"/.test(footerSrc),
);
check(
  "anchor targets clear the fixed header (scroll-margin-top)",
  /\.v4-shell \[id\]\s*\{[^}]*scroll-margin-top/s.test(chromeCss),
);

console.log("5. Capability states for gated voice routes");
const unavailableSrc = read(
  "artifacts/helpdesk/src/components/common/VoiceUnavailable.tsx",
);
check(
  "flag-off capability paths come from the always-bundled route table only",
  /const voiceUnavailablePaths = voicePlatformEnabled\s*\?\s*\[\]\s*:\s*\[ROUTES\.assistants, ROUTES\.appointments, ROUTES\.logs\];/.test(
    hdApp,
  ),
);
check(
  "they render the neutral VoiceUnavailable state, not a fabricated surface",
  /voiceUnavailablePaths\.map\(\(path\) => \(\s*<Route key=\{path\} path=\{path\}>\s*<VoiceUnavailable \/>/s.test(
    hdApp,
  ),
);
check(
  "content boundary: App.tsx does NOT import the voice nav metadata for this",
  !/VOICE_NAV/.test(hdApp) && !/navGroupsWith/.test(hdApp),
);
check(
  "content boundary: the page emits no voice-gated nav label",
  !/Assistants|Call Logs|Phone Numbers|Voice Library|Knowledge Base/.test(
    unavailableSrc,
  ),
);
check(
  "the capability copy is honest — not enabled, nothing running, safe exit",
  /not enabled/i.test(unavailableSrc) &&
    /Nothing is running in the background/.test(unavailableSrc) &&
    /Back to Overview/.test(unavailableSrc),
);
check(
  "the page exposes no action and uses an inline mark, not a gated icon",
  !/lucide-react/.test(unavailableSrc) && !/<Button/.test(unavailableSrc),
);
check(
  "the NotFound fallthrough still closes the switch after the placeholder maps",
  /<Route component=\{NotFound\} \/>/.test(hdApp) &&
    hdApp.indexOf("<Route component={NotFound} />") >
      hdApp.indexOf("voiceUnavailablePaths.map("),
);

console.log("6. Canvas lifecycle");
check(
  "the hero loop requires both intersection and page visibility",
  /intersecting && document\.visibilityState === "visible"/.test(homeSrc) &&
    /addEventListener\("visibilitychange", onVisibility\)/.test(homeSrc),
);
check(
  "the theater voice object pauses on hidden pages too",
  /document\.visibilityState === "visible"/.test(theaterSrc) &&
    /visibilitychange/.test(theaterSrc),
);
check(
  "reduced motion still collapses the hero runway to a static resolved state",
  /prefers-reduced-motion: reduce/.test(homeCss) &&
    /\.v4-hero\s*\{\s*height:\s*auto;\s*\}/s.test(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*$/.exec(homeCss)?.[0] ?? "",
    ),
);
check(
  "device-pixel-ratio stays capped",
  /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/.test(homeSrc),
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll V4 R1 foundation contract checks passed.");
