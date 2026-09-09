/**
 * Post-build prerender for the public marketing routes (owner release
 * directive, 2026-09-07: "PRERENDER WORKSTREAM").
 *
 * Mechanism — static snapshot, not SSR:
 *  1. Serve the built `dist/` on an ephemeral local port (SPA fallback).
 *  2. Drive headless Chrome through each PUBLIC marketing route, wait for
 *     the app to render, sweep the page so lazy media resolves, then
 *     serialize the live document.
 *  3. Strip the reveal-system arming state (`data-reveal-ready` /
 *     `data-revealed` attributes, `.sm-reveal` / `.sm-reveal--in` classes)
 *     so every section is fully visible in the static HTML — both reveal
 *     systems are progressive by construction (no class/attribute = final
 *     visible state), so the stripped snapshot is exactly the no-JS render.
 *  4. Write `dist/<route>/index.html` per route (the homepage replaces
 *     `dist/index.html`, the 404 snapshot becomes `dist/404.html`).
 *
 * The client still boots normally: `createRoot(...).render()` replaces the
 * prerendered tree with identical content (this is a replacement render,
 * not React hydration, so hydration mismatches cannot occur), after which
 * Discovery, navigation, dialogs, and the receptionist preview are fully
 * interactive. Before boot the page is real HTML: correct per-route
 * title/description/canonical/OG (usePageMeta ran before the snapshot),
 * working anchors and links, hero headline and CTAs painted from CSS alone.
 *
 * Auth surfaces (/signup, /ai-receptionist/dashboard, /admin CRM) are
 * intentionally NOT prerendered — nothing behind authentication may appear
 * in public static HTML.
 *
 * Usage: node scripts/prerender.mjs <path-to-dist> [chrome-executable]
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname, dirname } from "node:path";

const DIST = process.argv[2];
if (!DIST || !existsSync(join(DIST, "index.html"))) {
  console.error("usage: node scripts/prerender.mjs <dist-dir> [chrome]");
  process.exit(1);
}
// Idempotence guard: prerendering must start from a CLEAN vite build —
// running it over already-prerendered output compounds the injected
// critical CSS and route documents.
{
  const idx = await readFile(join(DIST, "index.html"), "utf8");
  if (idx.includes("sm-critical") || existsSync(join(DIST, "404.html"))) {
    console.error("REFUSED: dist already contains prerendered output — start from a fresh build.");
    process.exit(1);
  }
}
const CHROME =
  process.argv[3] || "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** Public marketing routes only (see App.tsx). */
const ROUTES = [
  "/",
  "/services",
  "/websites-apps",
  "/discovery-systems",
  "/ai-systems",
  "/ai-receptionist",
  "/ai-receptionist/demo",
  "/pricing",
  "/work",
  "/portfolio",
  "/process",
  "/about",
  "/insights",
  "/start",
  "/discovery",
  "/contact",
  "/privacy",
  "/terms",
  "/automation",
  "/ai-for-lawyers",
  "/ai-for-realtors",
];
const NOT_FOUND_PROBE = "/__prerender-404-probe__";

/**
 * Route prefixes that are VALID but intentionally not prerendered (auth
 * surfaces, post-submit pages, dynamic subpaths). A production or preview
 * server must serve the SPA document (200) for these instead of the
 * prerendered 404 — the client-access regression this fixes was legitimate
 * AI Receptionist auth routes landing on "We couldn't find that page."
 * Written into the dist as spa-fallback.json for the servers to read.
 */
const SPA_FALLBACK_PREFIXES = [
  "/ai-receptionist", // signup + future subroutes (dashboard is its own app)
  "/thank-you",
  "/discovery", // saved-draft subroutes + __legacy rollback route
  "/admin", // staff CRM SPA (role-protected in-app)
  "/app", // legacy receptionist app routes
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

// ── 1 · Static server with SPA fallback ─────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = join(DIST, decodeURIComponent(url.pathname));
  try {
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) file = join(DIST, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ── 2 · Headless Chrome over CDP ────────────────────────────────────────
const PORT = 9591;
const profile = await mkdtemp(join(tmpdir(), "prerender-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--disable-gpu", "--autoplay-policy=no-user-gesture-required", "about:blank"],
  { stdio: "ignore" },
);
let v;
for (let i = 0; i < 60; i++) {
  try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
  catch { await new Promise((r) => setTimeout(r, 250)); }
}
const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const g = JSON.parse(m.data);
  if (g.id && pending.has(g.id)) { pending.get(g.id)(g); pending.delete(g.id); }
};
const send = (method, params = {}, sid) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, (g) => (g.error ? rej(new Error(g.error.message)) : res(g.result)));
    ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params }));
  });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await S("Page.enable");
await S("Runtime.enable");
await S("DOM.enable");
await S("CSS.enable");
await S("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

// Stylesheet registry: styleSheetId -> { sourceURL, isInline } via CDP events.
const styleSheets = new Map();
const prevOnMessage = ws.onmessage;
ws.onmessage = (m) => {
  const g = JSON.parse(m.data);
  if (g.method === "CSS.styleSheetAdded") {
    const h = g.params.header;
    styleSheets.set(h.styleSheetId, { sourceURL: h.sourceURL || "", isInline: h.isInline });
  }
  prevOnMessage(m);
};

/**
 * Critical-CSS extraction (perf gate, 2026-09-07): the app ships one
 * ~450KB render-blocking stylesheet spanning every product surface; on the
 * throttled-mobile harness its transfer + full-page style/layout dominate
 * LCP (~4s) even though the prerendered HTML is available instantly. Each
 * prerendered document therefore inlines exactly the rules its own page
 * MATCHES (CDP rule-usage tracking, unioned across the desktop and mobile
 * passes and a full scroll sweep — so below-fold and both media-query
 * branches are covered), plus every @font-face/@keyframes/@property block,
 * and loads the full stylesheet asynchronously. The async sheet only adds
 * rules the page did not match (hover states, other routes), so applying
 * it late causes no visible restyle or layout shift — the CLS and visual
 * gates re-verify this.
 */
function extractAtBlocks(cssText, atName) {
  const out = [];
  let i = 0;
  while ((i = cssText.indexOf(atName, i)) !== -1) {
    let j = cssText.indexOf("{", i);
    if (j === -1) break;
    let depth = 1, k = j + 1;
    while (k < cssText.length && depth > 0) {
      if (cssText[k] === "{") depth++;
      else if (cssText[k] === "}") depth--;
      k++;
    }
    out.push(cssText.slice(i, k));
    i = k;
  }
  return out;
}

function mediaSpans(cssText) {
  // Top-level conditional group spans: [preludeStart, blockOpen, blockClose].
  const spans = [];
  const re = /@(media|supports)[^{;]*\{/g;
  let m;
  while ((m = re.exec(cssText))) {
    const open = m.index + m[0].length - 1;
    let depth = 1, k = open + 1;
    while (k < cssText.length && depth > 0) {
      if (cssText[k] === "{") depth++;
      else if (cssText[k] === "}") depth--;
      k++;
    }
    spans.push({ start: m.index, open, close: k - 1, prelude: cssText.slice(m.index, open).trim() });
    re.lastIndex = k;
  }
  return spans;
}

function mergeRanges(rawRanges) {
  // The tracker reports one entry per match, so the same rule appears many
  // times; dedupe and merge overlapping ranges before emitting.
  const seen = new Set();
  const ranges = [];
  for (const r of rawRanges) {
    const key = r.startOffset + ":" + r.endOffset;
    if (seen.has(key)) continue;
    seen.add(key);
    ranges.push(r);
  }
  ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.startOffset < last.endOffset) {
      last.endOffset = Math.max(last.endOffset, r.endOffset);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

function buildCriticalMerged(cssText, ranges) {
  const spans = mediaSpans(cssText);
  const enclosing = (off) => {
    let best = null;
    for (const s of spans) if (off > s.open && off < s.close && (!best || s.open > best.open)) best = s;
    return best; // innermost, so nested conditions keep their own prelude
  };
  ranges.sort((a, b) => a.startOffset - b.startOffset);
  let out = "", current = null;
  for (const r of ranges) {
    const chunk = cssText.slice(r.startOffset, r.endOffset);
    // The tracker also reports conditional-group PRELUDES ("(max-width:…){")
    // and other non-rule fragments; anything without balanced braces would
    // corrupt the inline sheet and silently disable every later rule.
    const opens = (chunk.match(/{/g) || []).length;
    const closes = (chunk.match(/}/g) || []).length;
    if (opens === 0 || opens !== closes) continue;
    const span = enclosing(r.startOffset);
    const prelude = span ? span.prelude : null;
    if (prelude !== current) {
      if (current !== null) out += "}\n";
      if (prelude !== null) out += prelude + "{\n";
      current = prelude;
    }
    out += chunk + "\n";
  }
  if (current !== null) out += "}\n";
  return out;
}

/** Serialize the rendered document as static, fully-visible HTML. */
const SERIALIZE = `(() => {
  // Reveal systems: strip arming state so nothing is hidden without JS.
  for (const el of document.querySelectorAll("[data-reveal-ready]")) el.removeAttribute("data-reveal-ready");
  for (const el of document.querySelectorAll("[data-revealed]")) el.removeAttribute("data-revealed");
  for (const el of document.querySelectorAll(".sm-reveal")) el.classList.remove("sm-reveal", "sm-reveal--in");
  document.documentElement.removeAttribute("data-sm-motion");
  // Decorative films: the static document must never start a multi-megabyte
  // media download before the app boots (it wrecks LCP on throttled mobile
  // and wastes data for no visible benefit — the poster image sits right
  // next to the video and paints instead). The client boot replaces this
  // tree and mounts the real, viewport-correct video.
  for (const v of document.querySelectorAll("video")) {
    for (const s of v.querySelectorAll("source")) s.remove();
    v.removeAttribute("src");
    v.removeAttribute("autoplay");
    v.setAttribute("preload", "none");
  }
  // The static document must not delay its first paint: hero ENTRANCE
  // animations (opacity-from-zero staggers) otherwise hold the LCP text
  // ~1s past first paint, and priority-boosted poster fetches contend with
  // the render-blocking CSS. The hero paints complete and instantly here;
  // the booted app re-mounts its media with the correct viewport priority.
  const neutralize = document.createElement("style");
  neutralize.textContent = ".v4-hero__copy, .v4-hero__copy *, .v4-hero__eyebrow, .smv5-hero * { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; }";
  document.head.appendChild(neutralize);
  for (const l of document.querySelectorAll('link[rel="preload"][as="image"]')) l.remove();
  for (const img of document.querySelectorAll("img[fetchpriority]")) img.removeAttribute("fetchpriority");
  // Critical CSS: inline the page's matched rules and demote every
  // stylesheet link to an async load (print-media swap + noscript copy).
  const criticalCss = __CRITICAL__;
  if (criticalCss) {
    // Paint-first boot: the app bundle is requested only after the browser
    // has painted the static document (two animation frames), so the
    // prerendered headline/CTA/navigation are the first — and the
    // largest — contentful paint. The replacement render then lands on
    // an already-loaded stylesheet and fonts (geometry verified identical).
    for (const s of document.querySelectorAll('script[type="module"][src]')) {
      const boot = document.createElement("script");
      boot.textContent =
        "(function(){var s=" + JSON.stringify(s.getAttribute("src")) +
        ";function b(){var e=document.createElement('script');e.type='module';e.crossOrigin='';e.src=s;document.head.appendChild(e)}" +
        "if(window.requestAnimationFrame){requestAnimationFrame(function(){requestAnimationFrame(b)})}else{setTimeout(b,0)}})();";
      s.replaceWith(boot);
    }
    const firstLink = document.querySelector('link[rel="stylesheet"]');
    const style = document.createElement("style");
    style.id = "sm-critical";
    style.textContent = criticalCss;
    (firstLink ? firstLink.parentNode : document.head).insertBefore(style, firstLink);
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const ns = document.createElement("noscript");
      const clone = link.cloneNode(false);
      ns.appendChild(clone);
      link.after(ns);
      link.setAttribute("media", "print");
      link.setAttribute("onload", "this.media='all';this.onload=null");
    }
  }
  const root = document.getElementById("root");
  return {
    ok: !!root && root.children.length > 0,
    title: document.title,
    html: "<!DOCTYPE html>\\n" + document.documentElement.outerHTML,
  };
})()`;

const SWEEP = `(async () => {
  const h = document.body.scrollHeight;
  for (let y = 0; y <= h; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
  scrollTo(0, 0);
})()`;

/**
 * Above-the-fold critical CSS (performance workstream, 2026-09-07 final
 * pass). OFF by default — set PRERENDER_CRITICAL_CSS=1 to enable.
 *
 * Measured outcome (five instrumented iterations on the release harness):
 * fold-scoped critical + async full sheet + optional faces + metric
 * fallbacks + paint-first boot left the simulated home LCP unchanged
 * (~4.25s) while costing CLS 0.258 (a transient swap-time reflow), whereas
 * the blocking-stylesheet prerender measures LCP 4.00s at CLS 0.000. The
 * owner's rule — never ship an unstable critical system to move one score —
 * selects the blocking configuration; the machinery stays here, working
 * and documented, for a future CSS-architecture diet (the 448KB
 * four-generation stylesheet is the remaining cost).
 *
 * How the critical path stays SAFE when enabled:
 *  1. Coverage-tracked rules are additionally FOLD-FILTERED in-page: a
 *     rule survives only if one of its matching elements starts within
 *     1.5 viewport-heights on the desktop OR mobile layout (root-level,
 *     unparseable, and layout-containment rules are always kept). CSS
 *     matching alone is not viewport-scoped, so this geometric pass is what
 *     makes the inline sheet genuinely above-the-fold-sized.
 *  2. Every @font-face — including the metric-matched local fallbacks
 *     (size-adjust/ascent/descent overrides in tokens-v4.css) — plus all
 *     @keyframes/@property blocks ride along, so text renders on
 *     dimension-identical fallbacks and the branded font arriving (or the
 *     boot replacement re-rendering) cannot move the page.
 *  3. Below-fold sections keep their content-visibility rules (they match
 *     above-fold sections too, so the fold filter retains them), which
 *     skips rendering unstyled below-fold content until the full sheet —
 *     loaded async via the print-media swap — has applied.
 */
const CRITICAL_ENABLED = process.env.PRERENDER_CRITICAL_CSS === "1";
const KEEP_ALWAYS = /^\s*(html|body|:root|\*|::selection|:where\(html)/;
// Layout-containment rules are page-height safety, not decoration: without
// them, below-fold sections render unstyled (tall) in the critical-only
// pass and collapse when the full sheet applies — a whole-body layout shift.
// They must ride along regardless of where their elements sit.
const KEEP_ALWAYS_CHUNK = /content-visibility|contain-intrinsic-size|contain\s*:/;

/** In-page fold filter: returns keep flags for the given selectors. */
function foldFilterScript(selectorsJson) {
  return `((selectors) => {
    const fold = window.innerHeight * 1.5;
    const clean = (sel) => sel
      .replace(/::?(hover|focus-visible|focus-within|focus|active|visited)/g, "")
      .replace(/::(before|after|marker|placeholder|backdrop|first-line|first-letter)/g, "")
      .trim();
    return selectors.map((sel) => {
      try {
        for (const part of sel.split(",")) {
          const c = clean(part);
          if (!c) return true;
          const els = document.querySelectorAll(c);
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.top < fold) return true;
          }
        }
        return false;
      } catch { return true; }
    });
  })(${selectorsJson})`;
}

async function snapshot(route, outFile) {
  styleSheets.clear();
  if (CRITICAL_ENABLED) await S("CSS.startRuleUsageTracking");
  await S("Page.navigate", { url: ORIGIN + route });
  await sleep(3200); // app boot + lazy route chunk + page effects
  // Sweep the page so IntersectionObserver-armed media/sections resolve and
  // every below-fold rule is matched, on BOTH viewport branches.
  await S("Runtime.evaluate", { expression: SWEEP, awaitPromise: true });
  await S("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(700);
  await S("Runtime.evaluate", { expression: SWEEP, awaitPromise: true });
  await S("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);

  let criticalCss = "";
  if (CRITICAL_ENABLED) {
    const { ruleUsage } = await S("CSS.stopRuleUsageTracking");
    // Group used ranges by external stylesheet, keeping document order.
    const bySheet = new Map();
    for (const u of ruleUsage) {
      if (u.used === false) continue;
      const meta = styleSheets.get(u.styleSheetId);
      if (!meta || meta.isInline || !meta.sourceURL) continue;
      if (!bySheet.has(u.styleSheetId)) bySheet.set(u.styleSheetId, []);
      bySheet.get(u.styleSheetId).push({ startOffset: u.startOffset, endOffset: u.endOffset });
    }
    const orderedIds = [...bySheet.keys()].sort((a, b) => {
      const sa = styleSheets.get(a).sourceURL, sb = styleSheets.get(b).sourceURL;
      // The main index-*.css must precede lazily added chunk css, matching
      // the cascade order the full page ends up with.
      return (sa.includes("/assets/index-") ? 0 : 1) - (sb.includes("/assets/index-") ? 0 : 1);
    });

    // Assemble the merged rule chunks per sheet, then fold-filter them
    // geometrically on the live page at BOTH viewports.
    const sheets = [];
    const selectors = [];
    for (const id of orderedIds) {
      const { text } = await S("CSS.getStyleSheetText", { styleSheetId: id });
      const merged = mergeRanges(bySheet.get(id));
      const entries = merged.map((r) => {
        const chunk = text.slice(r.startOffset, r.endOffset);
        const selector = chunk.slice(0, chunk.indexOf("{")).trim();
        return { range: r, selector, forceKeep: KEEP_ALWAYS_CHUNK.test(chunk) };
      });
      for (const e of entries) selectors.push(e.selector);
      sheets.push({ text, entries });
    }
    const evalKeep = async () => {
      const { result } = await S("Runtime.evaluate", {
        expression: foldFilterScript(JSON.stringify(selectors)),
        returnByValue: true,
      });
      return result.value;
    };
    const keepDesktop = await evalKeep();
    await S("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(500);
    const keepMobile = await evalKeep();
    await S("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(500);

    let flat = 0;
    for (const sheet of sheets) {
      const kept = sheet.entries
        .filter((e, iLocal) => {
          const i = flat + iLocal;
          return e.forceKeep || KEEP_ALWAYS.test(e.selector) || keepDesktop[i] || keepMobile[i];
        })
        .map((e) => e.range);
      flat += sheet.entries.length;
      criticalCss += buildCriticalMerged(sheet.text, kept);
      // Faces ride along as `optional` in the static document: text paints
      // once on the metric-matched fallbacks and never re-flows when the
      // branded font arrives (no swap-time shift on mono/secondary weights).
      for (const block of extractAtBlocks(sheet.text, "@font-face")) {
        criticalCss += block.replace(/font-display:\s*swap/g, "font-display:optional") + "\n";
      }
      for (const block of extractAtBlocks(sheet.text, "@keyframes")) criticalCss += block + "\n";
      for (const block of extractAtBlocks(sheet.text, "@property")) criticalCss += block + "\n";
    }
  }

  const { result } = await S("Runtime.evaluate", {
    expression: SERIALIZE.replace("__CRITICAL__", JSON.stringify(criticalCss)),
    returnByValue: true,
  });
  const { ok, title, html } = result.value;
  if (!ok) throw new Error(`prerender FAILED for ${route}: empty #root`);
  // Staged, not written: every snapshot must be taken against the CLEAN
  // build (writing index.html mid-run would make later routes bootstrap
  // from an already-prerendered document via the SPA fallback).
  staged.push({ route, outFile, html });
  console.log(`prerendered ${route.padEnd(22)} -> ${outFile.slice(DIST.length)}  (${(html.length / 1024).toFixed(0)}KB, critical ${(criticalCss.length / 1024).toFixed(0)}KB, "${title.slice(0, 48)}")`);
}
const staged = [];

let failed = 0;
for (const route of ROUTES) {
  const outFile = route === "/" ? join(DIST, "index.html") : join(DIST, route.slice(1), "index.html");
  try {
    await snapshot(route, outFile);
  } catch (e) {
    failed++;
    console.error(String(e));
  }
}
// The 404 page becomes a real static document for unknown paths.
//
// The probe path is a build-time implementation detail: it must never survive
// into the shipped document. Before this strip, a shared broken link previewed
// as sitemintdigital.com/__prerender-404-probe__ in Slack/iMessage/social
// unfurls, and the page advertised a canonical URL for a route that does not
// exist. A 404 should carry no canonical and no og:url at all.
try {
  await snapshot(NOT_FOUND_PROBE, join(DIST, "404.html"));
  const notFoundFile = join(DIST, "404.html");
  const notFoundHtml = await readFile(notFoundFile, "utf8");
  const cleaned = notFoundHtml
    .replace(/s*<link[^>]+rel="canonical"[^>]*>/gi, "")
    .replace(/s*<meta[^>]+property="og:url"[^>]*>/gi, "");
  if (cleaned !== notFoundHtml) {
    await writeFile(notFoundFile, cleaned, "utf8");
    console.log("  404.html: stripped build-probe canonical/og:url");
  }
} catch (e) {
  failed++;
  console.error(String(e));
}

chrome.kill();
server.close();
if (failed === 0) {
  for (const { outFile, html } of staged) {
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, html);
  }
  await writeFile(
    join(DIST, "spa-fallback.json"),
    JSON.stringify({ spaPrefixes: SPA_FALLBACK_PREFIXES }, null, 2),
  );
  console.log(`PRERENDER COMPLETE (${staged.length} documents + spa-fallback.json installed)`);
} else {
  console.error(`PRERENDER: ${failed} route(s) FAILED — nothing written`);
}
process.exit(failed === 0 ? 0 : 1);
