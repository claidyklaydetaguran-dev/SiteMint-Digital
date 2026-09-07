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
];
const NOT_FOUND_PROBE = "/__prerender-404-probe__";

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
await S("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

/** Serialize the rendered document as static, fully-visible HTML. */
const SERIALIZE = `(() => {
  // Reveal systems: strip arming state so nothing is hidden without JS.
  for (const el of document.querySelectorAll("[data-reveal-ready]")) el.removeAttribute("data-reveal-ready");
  for (const el of document.querySelectorAll("[data-revealed]")) el.removeAttribute("data-revealed");
  for (const el of document.querySelectorAll(".sm-reveal")) el.classList.remove("sm-reveal", "sm-reveal--in");
  document.documentElement.removeAttribute("data-sm-motion");
  const root = document.getElementById("root");
  return {
    ok: !!root && root.children.length > 0,
    title: document.title,
    html: "<!DOCTYPE html>\\n" + document.documentElement.outerHTML,
  };
})()`;

async function snapshot(route, outFile) {
  await S("Page.navigate", { url: ORIGIN + route });
  await sleep(3200); // app boot + lazy route chunk + page effects
  // Sweep the page so IntersectionObserver-armed media/sections resolve,
  // then return to the top so the captured scroll state is neutral.
  await S("Runtime.evaluate", {
    expression: `(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y <= h; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
      scrollTo(0, 0);
    })()`,
    awaitPromise: true,
  });
  await sleep(900);
  const { result } = await S("Runtime.evaluate", { expression: SERIALIZE, returnByValue: true });
  const { ok, title, html } = result.value;
  if (!ok) throw new Error(`prerender FAILED for ${route}: empty #root`);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, html);
  console.log(`prerendered ${route.padEnd(22)} -> ${outFile.slice(DIST.length)}  (${(html.length / 1024).toFixed(0)}KB, "${title.slice(0, 60)}")`);
}

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
try {
  await snapshot(NOT_FOUND_PROBE, join(DIST, "404.html"));
} catch (e) {
  failed++;
  console.error(String(e));
}

chrome.kill();
server.close();
console.log(failed === 0 ? "PRERENDER COMPLETE" : `PRERENDER: ${failed} route(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
