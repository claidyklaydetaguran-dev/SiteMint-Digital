/**
 * Hero particle-journey regression gate (owner hotfix, 2026-09-09).
 *
 * The homepage hero tells a five-stage business story — Scatter, Capture,
 * Organize, Connect, Resolve — as a particle field whose progress follows
 * the visitor's scroll. On mobile that stopped being perceptible: the hero
 * pinned for 260vh (about 2.6 screens) while the ONLY thing that changed was
 * a ~169px strip at the top, so scrolling read as "nothing is happening".
 * Two latent defects sat underneath: progress was measured against
 * `window.innerHeight` (the visual viewport, which resizes as a phone's
 * toolbar hides) rather than the pinned stage, and the rail and the canvas
 * disagreed when that runway degenerated — the rail clamped to 0 while the
 * canvas jumped to 1.
 *
 * This gate renders the real page and fails if any of that returns:
 *   1. the particle canvas is missing or has no drawing area
 *   2. progress does not advance while scrolling
 *   3. intermediate stages are skipped (a 0 -> 1 jump shows only the end)
 *   4. the final stage is never reached
 *   5. reverse scrolling does not rewind progress
 *   6. the section after the hero cannot be reached (scroll trap)
 *   7. the mobile viewport scrolls horizontally
 *   8. reduced-motion visitors get an EMPTY field instead of the whole story
 *   9. a stale `sm-motion` value (the retired preference) suppresses motion
 *
 * Usage:  node scripts/qa-hero-particles.mjs [origin]
 * Exit 0 = clean, 1 = at least one failure.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = process.argv[2] || "http://127.0.0.1:4175";
const PORT = 9741;
const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** Viewports the journey must stay readable at. */
const VIEWPORTS = [
  { w: 375, h: 667, name: "375x667 iPhone SE", mobile: true },
  { w: 390, h: 844, name: "390x844 iPhone 14", mobile: true },
  { w: 430, h: 932, name: "430x932 Pro Max", mobile: true },
  { w: 360, h: 800, name: "360x800 Android", mobile: true },
  { w: 844, h: 390, name: "844x390 landscape", mobile: true },
  { w: 1348, h: 900, name: "1348x900 desktop", mobile: false },
];

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failures += 1;
};

const profile = await mkdtemp(join(tmpdir(), "qa-hero-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let version;
for (let i = 0; i < 120; i += 1) {
  try {
    version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}
if (!version) {
  console.error("FATAL: could not start Chrome for the hero particle gate");
  process.exit(1);
}

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let seq = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const g = JSON.parse(m.data);
  if (g.id && pending.has(g.id)) {
    pending.get(g.id)(g);
    pending.delete(g.id);
  }
};
// Every call is time-boxed: a single unanswered CDP message would
// otherwise stall the whole gate with no output at all.
const send = (method, params = {}, sid) =>
  new Promise((res, rej) => {
    const id = seq + 1;
    seq = id;
    const timer = setTimeout(() => {
      pending.delete(id);
      rej(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, (g) => {
      clearTimeout(timer);
      if (g.error) rej(new Error(g.error.message));
      else res(g.result);
    });
    ws.send(
      JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params }),
    );
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable");
await S("Runtime.enable");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const js = async (expr) =>
  (
    await S("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    })
  ).result.value;

/**
 * Wait until the hero has actually mounted and the canvas has been sized,
 * rather than trusting a fixed sleep — under load a fixed wait reports an
 * unmounted page as a site failure, which is how this gate first lied.
 */
async function waitForHero(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await js(
      `(() => { const h = document.querySelector('.v4-hero');
                const c = document.querySelector('.v4-hero canvas');
                return !!(h && h.offsetHeight > 0 && c && c.width > 0); })()`,
    ).catch(() => false);
    if (ready) return true;
    await sleep(400);
  }
  return false;
}

const STATE = `JSON.stringify((() => {
  const hero = document.querySelector('.v4-hero');
  const rail = document.querySelector('.v4-hero__rail');
  const canvas = document.querySelector('.v4-hero canvas');
  return {
    railP: rail ? (parseFloat(getComputedStyle(rail).getPropertyValue('--sm-rail-p')) || 0) : null,
    active: rail ? Number(rail.dataset.active) : null,
    canvasW: canvas ? canvas.width : 0,
    canvasH: canvas ? canvas.height : 0,
    heroH: hero ? hero.offsetHeight : 0,
    litNodes: document.querySelectorAll('.v4-hero__node.is-lit').length,
    totalNodes: document.querySelectorAll('.v4-hero__node').length,
    horizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    y: Math.round(window.scrollY)
  };
})())`;

async function setViewport(vp, options) {
  const reduced = Boolean(options && options.reduced);
  await S("Emulation.setDeviceMetricsOverride", {
    width: vp.w,
    height: vp.h,
    deviceScaleFactor: vp.mobile ? 2 : 1,
    mobile: vp.mobile,
    screenWidth: vp.w,
    screenHeight: vp.h,
  });
  await S("Emulation.setUserAgentOverride", {
    userAgent: vp.mobile ? MOBILE_UA : version["User-Agent"],
  });
  // maxTouchPoints must be 1..16 even when touch emulation is disabled.
  await S("Emulation.setTouchEmulationEnabled", {
    enabled: vp.mobile,
    maxTouchPoints: vp.mobile ? 5 : 1,
  });
  await S(
    "Emulation.setEmulatedMedia",
    reduced
      ? { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }
      : { features: [] },
  );
}

for (const vp of VIEWPORTS) {
  await setViewport(vp);
  await S("Page.navigate", { url: `${ORIGIN}/` });
  await sleep(1200);
  const mounted = await waitForHero();
  check(mounted, `${vp.name}: hero mounted`);
  await sleep(900);

  const first = JSON.parse(await js(STATE));
  check(
    first.canvasW > 0 && first.canvasH > 0,
    `${vp.name}: particle canvas present with drawing area`,
    `${first.canvasW}x${first.canvasH}`,
  );

  const heroH = first.heroH;
  const runway = Math.max(0, heroH - vp.h);
  const seen = [];
  for (const frac of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    await js(`window.scrollTo(0, ${Math.round(frac * runway)})`);
    await sleep(650);
    seen.push(JSON.parse(await js(STATE)));
  }
  const ps = seen.map((s) => s.railP || 0);
  const actives = seen.map((s) => s.active || 0);

  check(
    Math.max(...ps) - Math.min(...ps) > 0.5,
    `${vp.name}: progress advances with scroll`,
    ps.map((p) => p.toFixed(2)).join("->"),
  );
  check(Math.max(...ps) > 0.95, `${vp.name}: final stage reached`, Math.max(...ps).toFixed(3));
  // Intermediate stages must actually be occupied — a 0 -> 1 jump means the
  // visitor only ever sees the end state, never the story.
  const mid = ps.filter((p) => p > 0.08 && p < 0.92).length;
  check(mid >= 3, `${vp.name}: intermediate stages reachable (not a jump)`, `${mid} mid samples`);
  check(
    new Set(actives).size >= 4,
    `${vp.name}: multiple journey stages activate`,
    actives.join("->"),
  );
  check(!seen.some((s) => s.horizontal), `${vp.name}: no horizontal overflow`);

  await js(`window.scrollTo(0, ${Math.round(0.3 * runway)})`);
  await sleep(750);
  const back = JSON.parse(await js(STATE));
  check(
    back.railP < Math.max(...ps) - 0.2,
    `${vp.name}: reverse scroll rewinds progress`,
    String(back.railP),
  );

  // The hero must never trap scrolling — the next section has to be reachable.
  await js(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(900);
  const bottom = JSON.parse(await js(STATE));
  check(
    bottom.y > heroH,
    `${vp.name}: section after the hero is reachable`,
    `y=${bottom.y} heroH=${heroH}`,
  );
}

// ── Reduced motion: the complete story, never an empty field ─────────────
await setViewport(VIEWPORTS[1], { reduced: true });
await S("Page.navigate", { url: `${ORIGIN}/` });
await sleep(1200);
await waitForHero();
await sleep(900);
const reducedState = JSON.parse(await js(STATE));
check(
  reducedState.canvasW > 0 && reducedState.canvasH > 0,
  "reduced motion: canvas still rendered",
  `${reducedState.canvasW}x${reducedState.canvasH}`,
);
check(
  reducedState.railP >= 0.95,
  "reduced motion: story shown COMPLETE (not pinned at the start)",
  String(reducedState.railP),
);
check(
  reducedState.litNodes === reducedState.totalNodes && reducedState.totalNodes > 0,
  "reduced motion: every journey node is lit (no empty composition)",
  `${reducedState.litNodes}/${reducedState.totalNodes}`,
);

// ── A stale retired preference must never suppress motion ────────────────
await setViewport(VIEWPORTS[1]);
await S("Page.navigate", { url: `${ORIGIN}/privacy` });
await sleep(2600);
await js(`try { localStorage.setItem('sm-motion', 'off'); } catch (e) {} 'seeded'`);
await S("Page.navigate", { url: `${ORIGIN}/` });
await sleep(1200);
await waitForHero();
await sleep(900);
const staleState = JSON.parse(await js(STATE));
const stored = await js(
  `(() => { try { return localStorage.getItem('sm-motion'); } catch (e) { return 'blocked'; } })()`,
);
const attr = await js(`document.documentElement.dataset.smMotion || null`);
check(stored === null, "stale 'sm-motion' value is purged at boot", String(stored));
check(attr === null, "no data-sm-motion attribute is applied", String(attr));
await js(
  `window.scrollTo(0, ${Math.round(0.6 * Math.max(0, staleState.heroH - VIEWPORTS[1].h))})`,
);
await sleep(800);
const staleAfter = JSON.parse(await js(STATE));
check(
  staleAfter.railP > 0.3,
  "a stale saved preference does NOT freeze the journey",
  String(staleAfter.railP),
);

chrome.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});
console.log(
  failures === 0 ? "\nHERO PARTICLE GATE CLEAN" : `\nHERO PARTICLE GATE: ${failures} FAIL`,
);
process.exit(failures ? 1 : 0);
