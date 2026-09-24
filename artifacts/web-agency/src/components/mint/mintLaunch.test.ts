/**
 * Launch-audit regression guards (2026-09-24) for the Mint Clarity public
 * frontend. Source-literal assertions in the repo's dependency-free style,
 * run by Vitest (this file is not a `*Contract.test.ts`, so it is collected).
 *
 * Each guard pins a defect that was found live on sitemintdigital.com or in
 * the Lighthouse baseline, so a future edit cannot silently reintroduce it:
 *
 *  1. Mobile hero motion — the scroll-linked film was gated on
 *     `min-width: 801px`, so phones never got the hero story or the
 *     receptionist background film. Motion may only be gated on the
 *     visitor's reduced-motion / reduced-data preferences.
 *  2. Demonstration autoplay — a rejected `play()` (Low Power Mode, browser
 *     policy) must surface a real play control, and a browser-initiated
 *     pause on tab switch must not be mistaken for a visitor pause.
 *  3. Wordmark restart — the logo is a full reload that starts at the top,
 *     but modified clicks keep native behaviour and the href stays "/".
 *  4. Receptionist CTAs — "Get started" / "See how it works", wired to the
 *     assisted-pilot inquiry and the written example conversations.
 *  5. In-page anchors — every `/ai-receptionist#…` target must exist.
 *  6. Poster preloads — index.html no longer preloads the retired V4 hero
 *     posters; the prerender injects the real cinema poster instead.
 *  7. Marketing server — cached, negotiated (br/gzip), ETag/304, `Vary`,
 *     never a synchronous gzip per request.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const webAgencyRoot = path.resolve(here, "..", "..", "..");
const repoRoot = path.resolve(webAgencyRoot, "..", "..");
const read = (rel: string) => readFileSync(path.join(webAgencyRoot, rel), "utf8");

const hero = read("src/components/mint/MintCinemaHero.tsx");
const demo = read("src/components/mint/MintDemonstration.tsx");
const chrome = read("src/components/mint/MintChrome.tsx");
const cinemaCss = read("src/components/mint/mint-cinema.css");
const receptionist = read("src/components/mint/MintReceptionist.tsx");
const app = read("src/App.tsx");
const demoPage = read("src/pages/AiReceptionistDemoV5.tsx");
const indexHtml = read("index.html");
const prerender = read("scripts/prerender.mjs");
const scrollBehavior = read("src/lib/scrollBehavior.ts");
const server = readFileSync(path.join(repoRoot, "mkt", "marketing-server.mjs"), "utf8");
const serverCopy = read("scripts/marketing-server.mjs");

describe("1. hero motion is a preference, not a viewport width", () => {
  it("never gates the film on a minimum width", () => {
    expect(hero).not.toMatch(/min-width:\s*\d+px/);
    expect(cinemaCss).not.toMatch(/@media\s*\(min-width:\s*801px\)\s*and\s*\(prefers-reduced-motion/);
  });
  it("honours reduced motion, reduced data and the data-saver switch", () => {
    expect(hero).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(hero).toMatch(/prefers-reduced-data:\s*reduce/);
    expect(hero).toMatch(/saveData/);
  });
  it("serves the same approved films in a lighter rendition on narrow screens", () => {
    expect(hero).toMatch(/\*-approved-mobile\.mp4/);
    expect(hero).toMatch(/max-width:\s*800px/);
    expect(hero).toMatch(/poster=\{poster\}/);
  });
  it("re-measures the scrub on viewport height changes and orientation", () => {
    for (const evt of ["orientationchange", "visualViewport"]) expect(hero).toContain(evt);
  });
  it("keeps the receptionist background film behind a pause/play control that survives tab switches", () => {
    expect(hero).toMatch(/visibilitychange/);
    expect(hero).toMatch(/aria-label=\{playing \? "Pause background video" : "Play background video"\}/);
  });
});

describe("2. demonstration autoplay", () => {
  it("offers a real play control when autoplay is refused", () => {
    expect(demo).toMatch(/\.catch\(\(\) => setNeedsTap\(true\)\)/);
    expect(demo).toMatch(/className="mint-demonstration__play"/);
    expect(cinemaCss).toContain(".mint-demonstration__play");
  });
  it("pauses when hidden and does not treat a browser pause as a visitor pause", () => {
    expect(demo).toContain("visibilitychange");
    expect(demo).toMatch(/if \(document\.hidden\) return;/);
  });
  it("respects reduced motion and data saving", () => {
    expect(demo).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(demo).toMatch(/saveData/);
  });
});

describe("3. wordmark restart", () => {
  it("wires both logos to a full top-of-page reload", () => {
    expect(chrome).not.toMatch(/<Link className="logo"/);
    expect((chrome.match(/onClick=\{restartHome\}/g) ?? []).length).toBe(2);
    expect(chrome).toMatch(/settleRestartAtTop\(\)/);
  });
  it("preserves modified clicks and the plain href", () => {
    expect(chrome).toMatch(/event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
    expect(chrome).toMatch(/href=\{ROUTES\.home\} onClick=\{restartHome\}/);
  });
  it("reloads when already home and never writes or clears localStorage", () => {
    expect(scrollBehavior).toMatch(/window\.location\.reload\(\)/);
    expect(scrollBehavior).not.toMatch(/localStorage\.(setItem|removeItem|clear)/);
  });
});

describe("4. receptionist calls to action", () => {
  it("uses the approved labels", () => {
    expect(hero).toContain('"Get started"');
    expect(hero).toContain('"See how it works"');
    expect(hero).not.toContain("Plan my receptionist");
    expect(hero).not.toContain("Explore a sample call");
  });
  it("never promises demo audio the page cannot play", () => {
    expect(hero).not.toMatch(/Hear a demo call/);
    expect(receptionist).not.toMatch(/Hear a demo call/);
  });
  it("routes to working journeys", () => {
    expect(hero).toContain('"/start?service=ai-receptionist"');
    expect(hero).toContain('"#example"');
  });
});

describe("5. in-page anchors on the receptionist page resolve", () => {
  const ids = new Set([...receptionist.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const targets = new Set<string>();
  for (const src of [app, demoPage, hero]) {
    for (const m of src.matchAll(/aiReceptionist\}#([a-z-]+)/g)) targets.add(m[1]);
  }
  for (const m of hero.matchAll(/receptionist \? "#([a-z-]+)"/g)) targets.add(m[1]);
  it("has at least the example anchor", () => {
    expect(ids.has("example")).toBe(true);
    expect(targets.size).toBeGreaterThan(0);
  });
  for (const target of targets) {
    it(`#${target} exists on the receptionist page`, () => {
      expect(ids.has(target)).toBe(true);
    });
  }
  it("no longer references the removed use-cases / preview anchors", () => {
    expect(app).not.toContain("#use-cases");
    expect(demoPage).not.toContain("#preview");
  });
});

describe("6. hero poster preload", () => {
  it("index.html has no stale V4 poster preloads", () => {
    expect(indexHtml).not.toMatch(/hero-poster(-mobile)?\.jpg/);
  });
  it("the prerender injects the cinema poster preload per route", () => {
    expect(prerender).toMatch(/img\.mint-cinema__media\[src\]/);
    expect(prerender).toMatch(/link\.rel = "preload"/);
  });
});

describe("7. marketing server delivery", () => {
  it("keeps the deployable copy and the source copy identical", () => {
    expect(server.replace(/\r\n/g, "\n")).toBe(serverCopy.replace(/\r\n/g, "\n"));
  });
  it("compresses once, asynchronously, and negotiates brotli or gzip", () => {
    expect(server).not.toMatch(/gzipSync/);
    expect(server).toMatch(/brotliCompress/);
    expect(server).toMatch(/promisify\(gzip\)/);
    expect(server).toMatch(/accept-encoding/);
  });
  it("sends Vary and a strong ETag with 304 revalidation", () => {
    expect(server).toMatch(/"vary"\] = "Accept-Encoding"/);
    expect(server).toMatch(/if-none-match/);
    expect(server).toMatch(/writeHead\(304/);
  });
  it("adds baseline browser hardening headers on marketing responses", () => {
    for (const h of ["referrer-policy", "x-frame-options", "permissions-policy", "x-content-type-options"]) expect(server).toContain(h);
  });
  it("still serves byte ranges identity-encoded for Safari media", () => {
    expect(server).toMatch(/writeHead\(206/);
  });
});

describe("8. follow-up 2026-09-24: arrows, Safari hero, proxy visitor identity", () => {
  it("no public Mint component or page still uses a text-glyph arrow", () => {
    const files = [
      "src/components/mint/MintChrome.tsx", "src/components/mint/MintCinemaHero.tsx", "src/components/mint/MintStories.tsx",
      "src/components/mint/MintReceptionist.tsx", "src/components/mint/MintDepthScene.tsx", "src/components/mint/InquiryContext.tsx",
      "src/pages/StartV3.tsx", "src/pages/PricingV5.tsx", "src/pages/AboutV3.tsx", "src/pages/WorkV3.tsx",
    ];
    for (const f of files) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(src, f).not.toMatch(/[↗→↓↑]/);
    }
    for (const css of ["src/components/mint/mint-scenes.css", "src/components/mint/mint.css"]) {
      expect(read(css), css).not.toMatch(/content:\s*"[↗→↓↑]"/);
    }
  });
  it("the shared arrow is an inline SVG using currentColor and hidden from assistive tech", () => {
    const arrow = read("src/components/mint/MintArrow.tsx");
    expect(arrow).toContain('stroke="currentColor"');
    expect(arrow).toContain('aria-hidden="true"');
    expect(read("src/components/mint/mint-scenes.css")).toMatch(/a\.button::after[\s\S]{0,400}mask:/);
  });
  it("the hero primes the film for Safari and falls back to the approved frame sequence", () => {
    expect(hero).toMatch(/film\.load\(\)/);
    expect(hero).toMatch(/film\.play\(\)[\s\S]{0,400}film\.pause\(\)/);
    expect(hero).toMatch(/frames\/leaf-\*\.webp/);
    expect(hero).toMatch(/toFrames\(`play rejected/);
    expect(hero).toMatch(/no metadata within 9s/);
    expect(hero).toMatch(/herodebug/);
  });
  it("customer-facing copy no longer says pilot pricing", () => {
    for (const f of ["src/components/mint/MintReceptionist.tsx", "src/pages/StartV3.tsx", "src/components/mint/InquiryContext.tsx", "src/components/v5/pricingTiersV5.ts", "src/components/mint/MintHome.tsx"]) {
      expect(read(f), f).not.toMatch(/pilot pricing|Assisted pilot/i);
    }
    expect(receptionist).toContain('"Request pricing"');
  });
  it("the marketing proxy strips client copies of the visitor headers and signs its own", () => {
    expect(server).toMatch(/key === "x-sitemint-visitor" \|\| key === "x-sitemint-visitor-sig"\) continue/);
    expect(server).toMatch(/createHmac\("sha256", VISITOR_SECRET\)/);
    expect(server).toMatch(/const idx = chain\.length - 1 - PLATFORM_HOPS;/);
    expect(server).toMatch(/PROXY_PLATFORM_HOPS/);
    expect(server).not.toMatch(/chain\[chain\.length - [12]\]/);
  });
});
