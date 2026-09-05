/**
 * Operations owner (wp/operations) — committed contract tests for the O-10
 * adminFetch migration, the O-7 nav restructuring, and the sidebar scroll
 * fix (M-3 wayfinding item in OPERATIONS-CRM-PLAN.md).
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * Dependency-free (fs.readFileSync only), source-literal checks in the same
 * style as the other committed contract suites — no test framework, no DOM,
 * no new dependency. web-agency's tsconfig excludes `**\/*.test.ts` by glob,
 * so this file is neither type-built into the app nor bundled by Vite.
 *
 * Guards, in order:
 *  1. No raw `fetch("/api/...")` literal remains anywhere under
 *     `src/pages/crm/**` — every CRM/admin call must go through the shared
 *     `adminFetch`/`adminGet`/`adminPost`/`adminPatch`/`adminDelete` helpers
 *     in `src/lib/adminFetch.ts` (which itself lives outside this tree and is
 *     the one place allowed to call the platform `fetch`).
 *  2. Every NAV_GROUPS item in CrmLayout.tsx carries an `href` (the six
 *     "Soon" placeholder items and the duplicate Lead DNA entry were removed
 *     — nothing in the nav should be a dead end again).
 *  3. The four static Receptionist Ops hrefs (Firms/Issues/Usage/Numbers)
 *     that CrmLayout.tsx's nav links to are registered as routes in App.tsx.
 *  4. `.overflow-y-auto` is not applied to the sidebar nav element — the
 *     page body is the one primary scroll region.
 *  5. Theme: no raw Tailwind neutral-palette utility (`gray-*`, `slate-*`,
 *     `zinc-*`, `neutral-*`, `stone-*`) anywhere under `src/pages/crm/**` —
 *     neutral chrome must use the semantic token classes (`bg-muted`,
 *     `border-border`, `text-muted-foreground`, `bg-accent`, `border-input`,
 *     …) so it resolves through the Glacier Mint palette in
 *     `v5-remap.css` / `index.css`. Deliberate exceptions go in
 *     RAW_NEUTRAL_ALLOWLIST below with a reason — the list is exact-match
 *     per file+class, so a new raw gray anywhere fails immediately.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/crm → src/pages → src → web-agency → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Walk src/pages/crm/** ────────────────────────────────────────────────────
const crmDir = path.join(repoRoot, "artifacts/web-agency/src/pages/crm");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

// Exclude this test file itself — its own comments/messages quote the raw
// fetch("/api/...") pattern it is checking for, which would otherwise
// self-match.
const crmFiles = walk(crmDir).filter(f => path.basename(f) !== "opsContract.test.ts");
// Receptionist Operations shares the theme guard (owner directive 2026-09-05:
// "Receptionist Operations must share the same theme").
const opsDir = path.join(repoRoot, "artifacts/web-agency/src/pages/ops");
crmFiles.push(...walk(opsDir));

console.log("\n--- O-10: no raw fetch(\"/api/...\") literal under src/pages/crm/** ---");
{
  // Matches fetch( followed by a quote/backtick and a leading "/api/" — the
  // pattern every pre-migration call site used. adminFetch/adminGet/etc are
  // untouched by this regex since they are a different identifier.
  const rawFetchApi = /\bfetch\(\s*[`"'](\/api\/)/;
  let offenders = 0;
  for (const file of crmFiles) {
    const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
    const src = readFileSync(file, "utf8");
    const hit = rawFetchApi.test(src);
    if (hit) offenders++;
    check(`${rel} has no raw fetch("/api/...") call`, !hit);
  }
  check("at least one CRM page file was scanned", crmFiles.length > 10, `${crmFiles.length} files found`);
  check("zero offending files overall", offenders === 0, `${offenders} file(s) still using raw fetch`);
}

// ── NAV_GROUPS structural checks ─────────────────────────────────────────────
const layoutSrc = read("artifacts/web-agency/src/pages/crm/CrmLayout.tsx");

console.log("\n--- O-7: NAV_GROUPS has no dead-end items ---");
{
  const start = layoutSrc.indexOf("const NAV_GROUPS: NavGroup[] = [");
  const end = layoutSrc.indexOf("\n];", start);
  check("NAV_GROUPS block is present", start !== -1 && end !== -1);
  const block = start !== -1 && end !== -1 ? layoutSrc.slice(start, end) : "";

  // Every nav item is a `{ label: "...", ... }` object literal ending on the
  // same or a following line before the next `{ label:`. Split on `{ label:`
  // occurrences to inspect each item's own fragment.
  const itemFragments = block.split(/\{\s*label:/).slice(1);
  check("at least one nav item was found", itemFragments.length > 10, `${itemFragments.length} items`);

  let deadEnds = 0;
  for (const frag of itemFragments) {
    // Stop at the end of this object literal (its closing `},`).
    const closeIdx = frag.indexOf("},");
    const itemSrc = closeIdx === -1 ? frag : frag.slice(0, closeIdx);
    const labelMatch = itemSrc.match(/^\s*"([^"]+)"/);
    const label = labelMatch ? labelMatch[1] : "(unknown)";
    const hasHref = /href:/.test(itemSrc);
    const isComingSoon = /comingSoon:\s*true/.test(itemSrc);
    if (!hasHref && !isComingSoon) {
      deadEnds++;
      check(`nav item "${label}" has an href`, false);
    }
  }
  check("no dead-end nav items remain", deadEnds === 0, `${deadEnds} item(s) missing href`);

  check("the six removed 'Soon' items are gone", !/comingSoon:\s*true/.test(block));
  check("Content Hub is removed", !block.includes('"Content Hub"'));
  check("Landing Pages is removed", !block.includes('"Landing Pages"'));
  check("Facebook Leads is removed", !block.includes('"Facebook Leads"'));
  check("Instagram Leads is removed", !block.includes('"Instagram Leads"'));
  check("Meta Diagnostics is removed", !block.includes('"Meta Diagnostics"'));
  check("Relationship Intelligence is removed", !block.includes('"Relationship Intelligence"'));
  check(
    "the duplicate Lead DNA entry is removed",
    (block.match(/"Lead DNA"/g) ?? []).length === 0,
  );
  check("Command Center is still the Home group's first item", /"Command Center",\s*href: "\/admin\/crm\/dashboard"/.test(block));
  check("Discovery Portal is reachable from the Operations group", /"Discovery Portal",\s*href: "\/admin\/dashboard"/.test(block));
  check("a Receptionist Ops nav group exists", /id: "receptionist-ops"/.test(block));
}

// ── Receptionist Ops hrefs are registered routes ─────────────────────────────
console.log("\n--- O-6/wiring: Receptionist Ops hrefs exist as routes in App.tsx ---");
{
  const appSrc = read("artifacts/web-agency/src/App.tsx");
  const opsHrefs = ["/admin/ops/firms", "/admin/ops/issues", "/admin/ops/usage", "/admin/ops/numbers"];
  for (const href of opsHrefs) {
    check(`${href} is registered as a Route path in App.tsx`, appSrc.includes(`path="${href}"`));
  }
  check(
    "the dynamic firm-detail route is registered",
    appSrc.includes('path="/admin/ops/firms/:id"'),
  );
}

// ── Sidebar scroll region ────────────────────────────────────────────────────
console.log("\n--- wayfinding: sidebar is not an independent scroll region ---");
{
  const navLine = layoutSrc
    .split("\n")
    .find(l => l.includes('data-testid="crm-sidebar-nav"'));
  check("the sidebar nav element is present", !!navLine, "data-testid=\"crm-sidebar-nav\" not found");
  check(
    "the sidebar nav element does not carry overflow-y-auto",
    !!navLine && !navLine.includes("overflow-y-auto"),
    navLine,
  );
  check(
    "the main content region remains the single scroller",
    /<main className="[^"]*overflow-y-auto[^"]*"/.test(layoutSrc),
  );
}

// ── Theme: no raw Tailwind neutral-palette utilities under src/pages/crm/** ──
console.log("\n--- theme: no raw gray/slate/zinc/neutral/stone utilities in CRM pages ---");
{
  // Deliberate, documented exceptions only. Each entry allows EXACTLY that
  // utility class in EXACTLY that file (repo-relative path, forward slashes),
  // and must carry the reason it cannot be a semantic token.
  const RAW_NEUTRAL_ALLOWLIST: ReadonlyArray<{
    file: string;
    className: string;
    reason: string;
  }> = [];

  // A raw neutral utility is any (optionally variant-prefixed) color utility
  // on the five neutral Tailwind palettes. Word-boundary on the left so
  // semantic classes ("text-muted-foreground") and identifiers never match;
  // the optional /NN keeps opacity-modified forms in one token.
  const rawNeutral =
    /(?:^|[^\w/-])((?:[a-z-]+:)*(?:bg|text|border|divide|ring|outline|placeholder|from|via|to|fill|stroke|shadow|accent|caret|decoration)-(?:gray|slate|zinc|neutral|stone)-[0-9]{2,3}(?:\/[0-9]{1,3})?)/g;

  let offendingFiles = 0;
  for (const file of crmFiles) {
    const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
    const src = readFileSync(file, "utf8");
    const found: string[] = [];
    for (const m of src.matchAll(rawNeutral)) {
      const cls = m[1];
      const allowed = RAW_NEUTRAL_ALLOWLIST.some(
        a => a.file === rel && a.className === cls,
      );
      if (!allowed) found.push(cls);
    }
    if (found.length > 0) {
      offendingFiles++;
      const summary = [...new Set(found)].slice(0, 8).join(", ");
      check(
        `${rel} has no raw neutral-palette utility`,
        false,
        `${found.length} hit(s): ${summary}${found.length > 8 ? ", …" : ""}`,
      );
    }
  }
  check("zero files with raw neutral utilities", offendingFiles === 0, `${offendingFiles} file(s)`);
  check(
    "every allowlist entry names an existing file",
    RAW_NEUTRAL_ALLOWLIST.every(a =>
      crmFiles.some(f => path.relative(repoRoot, f).replace(/\\/g, "/") === a.file),
    ),
  );
}

console.log(
  failed === 0
    ? "\nAll opsContract tests passed."
    : `\nopsContract: ${failed} check(s) FAILED.`,
);
if (failed > 0) process.exit(1);
