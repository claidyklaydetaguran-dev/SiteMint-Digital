/**
 * Text-motion gate (owner directive 2026-09-10: "the text transitions and
 * motions must remain").
 *
 * The mobile hero was recomposed to give the particle scene room. This gate
 * exists so that work — or any later performance trim — cannot quietly flatten
 * the site's text choreography into a static page, and equally cannot leave
 * text stranded invisible.
 *
 * For each surface it checks that:
 *   1. reveal-driven elements actually START un-revealed (motion is armed),
 *   2. they REACH the revealed state once scrolled into view,
 *   3. after revealing, the text is fully opaque and not clipped,
 *   4. the hero headline, supporting copy and CTAs are readable,
 *   5. under prefers-reduced-motion nothing is left hidden.
 *
 * Usage: node scripts/qa-text-motion.mjs [origin]
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = process.argv[2] || "http://127.0.0.1:4175";
const PORT = 9743;
const CHROME =
  process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const ROUTES = ["/", "/services", "/work", "/ai-receptionist", "/process", "/about"];

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failures += 1;
};

const profile = await mkdtemp(join(tmpdir(), "qa-text-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
   "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"],
  { stdio: "ignore" },
);
let version;
for (let i = 0; i < 120; i += 1) {
  try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
  catch { await new Promise((r) => setTimeout(r, 250)); }
}
if (!version) { console.error("FATAL: Chrome did not start"); process.exit(1); }

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const g = JSON.parse(m.data);
  if (g.id && pending.has(g.id)) { pending.get(g.id)(g); pending.delete(g.id); }
};
const send = (method, params = {}, sid) =>
  new Promise((res, rej) => {
    const id = seq + 1; seq = id;
    const t = setTimeout(() => { pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, (g) => { clearTimeout(t); g.error ? rej(new Error(g.error.message)) : res(g.result); });
    ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params }));
  });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (e) =>
  (await S("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value;

const UA_M =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

/**
 * Reveal CONTAINERS are what carry the state: `useReveal()` stamps
 * data-reveal-ready / data-revealed on the container, and the animated
 * children (.reveal-fade-up and friends) are driven by descendant CSS — they
 * never get a marker of their own, so counting them as "unrevealed" would
 * report motion as broken while it is working perfectly.
 */
const ARMED = `(() => {
  const containers = [...document.querySelectorAll('[data-reveal-ready], [data-v4-reveal], .sm-reveal')];
  const revealed = containers.filter((e) => e.hasAttribute('data-revealed') || e.classList.contains('sm-reveal--in'));
  // Children that animate via descendant rules: settled == opacity 1, no transform.
  const kids = [...document.querySelectorAll('.reveal-fade-up, .reveal-clip, .reveal-scale-settle, .reveal-h-left, .reveal-h-right')];
  const settled = kids.filter((e) => {
    const cs = getComputedStyle(e);
    const t = cs.transform;
    return parseFloat(cs.opacity) > 0.95 && (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)');
  });
  return JSON.stringify({ total: containers.length, revealed: revealed.length, kids: kids.length, settled: settled.length });
})()`;

/** Any element whose text is invisible or clipped after settling. */
const HIDDEN_TEXT = `(() => {
  const sel = '[data-v4-reveal], .sm-reveal, .v3-reveal, .reveal-clip, .reveal-fade-up, .reveal-scale-settle, .reveal-h-left, .reveal-h-right';
  const bad = [];
  for (const e of document.querySelectorAll(sel)) {
    const text = (e.textContent || '').trim();
    if (!text) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(e);
    if (parseFloat(cs.opacity) < 0.9) bad.push('opacity:' + text.slice(0, 34));
    else if (e.scrollHeight > e.clientHeight + 6 && cs.overflow !== 'visible') bad.push('clipped:' + text.slice(0, 34));
  }
  return JSON.stringify(bad.slice(0, 6));
})()`;

async function viewport(w, h, mobile, reduced) {
  await S("Emulation.setDeviceMetricsOverride", {
    width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile,
    screenWidth: w, screenHeight: h,
  });
  await S("Emulation.setUserAgentOverride", { userAgent: mobile ? UA_M : version["User-Agent"] });
  await S("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  await S("Emulation.setEmulatedMedia",
    reduced ? { features: [{ name: "prefers-reduced-motion", value: "reduce" }] } : { features: [] });
}

async function sweep() {
  await js(`(async () => { const step = Math.round(innerHeight * 0.6);
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      scrollTo(0, y); await new Promise((r) => setTimeout(r, 90));
    } })()`);
  await sleep(1400);
}

for (const [label, w, h, mobile] of [["mobile 390x844", 390, 844, true], ["desktop 1348x900", 1348, 900, false]]) {
  for (const route of ROUTES) {
    await viewport(w, h, mobile, false);
    await S("Page.navigate", { url: ORIGIN + route });
    await sleep(4200);

    // 1 · motion is ARMED on arrival — something must still be waiting.
    const before = JSON.parse(await js(ARMED));
    if (before.total > 0) {
      check(before.revealed < before.total,
        `${label} ${route}: text motion is armed on arrival`,
        `${before.revealed}/${before.total} containers revealed`);
    }
    // Motion exists in one of two vocabularies: container-driven
    // ([data-v4-reveal]/.sm-reveal, used by the AI Receptionist page) or
    // descendant-driven (.reveal-fade-up and friends). Either is fine; ZERO
    // of both would mean the choreography had been stripped.
    check(before.kids > 0 || before.total > 0, `${label} ${route}: text motion present`, `${before.total} containers, ${before.kids} animated children`);

    // 2 · everything reveals once scrolled through.
    await sweep();
    const after = JSON.parse(await js(ARMED));
    check(after.total === 0 || after.revealed >= after.total * 0.95,
      `${label} ${route}: reveal containers complete after scrolling`,
      `${after.revealed}/${after.total}`);
    check(after.kids === 0 || after.settled >= after.kids * 0.95,
      `${label} ${route}: animated text settles visible`,
      `${after.settled}/${after.kids}`);

    // 3 · no text left invisible or clipped.
    const bad = JSON.parse(await js(HIDDEN_TEXT));
    check(bad.length === 0, `${label} ${route}: no text left hidden or clipped`, bad.join(" | ") || "clean");
  }
}

// 4 · the hero's own copy must be readable and its motion real.
await viewport(390, 844, true, false);
await S("Page.navigate", { url: `${ORIGIN}/` });
await sleep(4200);
const heroArmed = JSON.parse(await js(ARMED));
await sweep();
await js(`window.scrollTo(0, 0)`);
await sleep(1200);
const heroCopy = JSON.parse(await js(`(() => {
  const t = document.querySelector('.v4-hero__title');
  const s = document.querySelector('.v4-hero__sub');
  const c = document.querySelector('.v4-hero__ctas a');
  const vis = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    // Only a real mask clips: with overflow visible an oversized scrollHeight
    // is just line-box rounding, and every line still paints.
    const masked = cs.overflow !== 'visible' || cs.clipPath !== 'none';
    return { text: (e.textContent || '').trim().slice(0, 26), opacity: +cs.opacity, h: Math.round(r.height), clipped: masked && e.scrollHeight > e.clientHeight + 6 }; };
  return JSON.stringify({ title: vis(t), sub: vis(s), cta: vis(c) });
})()`));
check(heroArmed.total > 0, "hero: reveal-driven elements exist (motion not stripped)", String(heroArmed.total));
check(heroCopy.title && heroCopy.title.opacity >= 0.9 && !heroCopy.title.clipped,
  "hero headline readable and unclipped", JSON.stringify(heroCopy.title));
check(heroCopy.sub && heroCopy.sub.opacity >= 0.9 && !heroCopy.sub.clipped,
  "hero supporting copy readable", JSON.stringify(heroCopy.sub));
check(heroCopy.cta && heroCopy.cta.opacity >= 0.9, "hero CTA readable", JSON.stringify(heroCopy.cta));

// 5 · reduced motion: nothing may be left hidden.
await viewport(390, 844, true, true);
await S("Page.navigate", { url: `${ORIGIN}/` });
await sleep(4200);
const rmBad = JSON.parse(await js(HIDDEN_TEXT));
check(rmBad.length === 0, "reduced motion: no text left hidden", rmBad.join(" | ") || "clean");

chrome.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});
console.log(failures === 0 ? "\nTEXT-MOTION GATE CLEAN" : `\nTEXT-MOTION GATE: ${failures} FAIL`);
process.exit(failures ? 1 : 0);
