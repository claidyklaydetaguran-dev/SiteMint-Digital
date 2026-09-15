/**
 * Renders COMPLETENESS.md from criteria.json and pages.json.
 *
 *   npx tsx docs/crm-ops/completeness/render.ts          # writes the document
 *   npx tsx docs/crm-ops/completeness/render.ts --check  # fails if it is stale
 *
 * Why this exists: every earlier completeness table was tallied by hand, and
 * one report said 119/143 while the attached document still said 118. A
 * percentage nobody can recompute is an opinion. Here every number is computed
 * from rows, every row names its evidence, and the page table cannot drift from
 * the router — `--check` fails when a registered route has no row, when a row
 * names a route that no longer exists, or when the committed document differs
 * from what the rows produce.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory, type RouteAudience } from "../../../artifacts/web-agency/src/lib/routeInventory.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const OUT = join(HERE, "..", "COMPLETENESS.md");

// ── Vocabulary ──────────────────────────────────────────────────────────────

/** Only `pass` counts toward the numerator. Everything else stays in the denominator. */
const STATUSES = ["pass", "unverified", "fail", "deferred"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_WORD: Record<Status, string> = {
  pass: "Passed",
  unverified: "Built, not proven",
  fail: "Not passed",
  deferred: "Deferred by decision",
};

/** L local, T automated tests, R the real provider, P production. */
const ENVS = ["L", "T", "R", "P"] as const;
type Env = (typeof ENVS)[number];

interface Criterion {
  id: string;
  text: string;
  status: Status;
  env: Env[];
  evidence: string;
  /** Set on criteria added after the baseline, so the denominator's history stays visible. */
  added?: string;
  why?: string;
}

interface Area {
  id: number;
  name: string;
  criteria: Criterion[];
}

interface CriteriaFile {
  asOf: string;
  areas: Area[];
}

/** The same six questions are asked of every page, so page scores are comparable. */
const PAGE_CRITERIA = ["open", "action", "persist", "permission", "recovery", "mobile"] as const;
type PageCriterion = (typeof PAGE_CRITERIA)[number];

const PAGE_CRITERION_TEXT: Record<PageCriterion, string> = {
  open: "Opens in a browser with a real session and populated data, with no console errors",
  action: "Its main action was performed in a browser and the result checked",
  persist: "After a full reload the page shows the stored result (for a page that changes nothing: the same stored data)",
  permission: "The wrong person is refused or scoped — proven in a browser or by an API test",
  recovery: "A failed request shows a real error state and the page recovers",
  mobile: "At 375px no element is clipped or unreachable (content without a scrollable ancestor is measured, not page scroll)",
};

/** Checks only a browser can prove. An API test passes none of them. */
const BROWSER_ONLY: PageCriterion[] = ["open", "action", "persist", "mobile"];

interface PageCheck {
  status: Status;
  env: Env[];
  evidence: string;
}

interface PageRow {
  route: string;
  title: string;
  checks: Record<PageCriterion, PageCheck>;
}

interface PagesFile {
  asOf: string;
  pages: PageRow[];
}

// ── Load and validate ───────────────────────────────────────────────────────

const criteria = JSON.parse(readFileSync(join(HERE, "criteria.json"), "utf8")) as CriteriaFile;
const pages = JSON.parse(readFileSync(join(HERE, "pages.json"), "utf8")) as PagesFile;

const problems: string[] = [];

function checkEnvAndStatus(where: string, status: string, env: string[], evidence: string) {
  if (!(STATUSES as readonly string[]).includes(status)) problems.push(`${where}: unknown status "${status}"`);
  for (const e of env) if (!(ENVS as readonly string[]).includes(e)) problems.push(`${where}: unknown environment "${e}"`);
  if (status === "pass" && env.length === 0) problems.push(`${where}: a pass must name the environment that proved it`);
  if (!evidence || evidence.trim().length < 8) problems.push(`${where}: evidence is required, including for what did not pass`);
}

const seenIds = new Set<string>();
for (const area of criteria.areas) {
  for (const c of area.criteria) {
    if (seenIds.has(c.id)) problems.push(`criterion ${c.id} appears twice`);
    seenIds.add(c.id);
    if (!c.id.startsWith(`${area.id}.`)) problems.push(`criterion ${c.id} is filed under area ${area.id}`);
    checkEnvAndStatus(`criterion ${c.id}`, c.status, c.env, c.evidence);
  }
}

// One row per page the router actually registers: staff, customer, and
// token-landing routes. Public marketing pages are outside the CRM table, and
// the catch-all that mounts the admin subtree is not a page.
const IN_TABLE: RouteAudience[] = ["staff", "customer", "token"];
const routesTs = readFileSync(join(REPO, "artifacts", "web-agency", "src", "lib", "routes.ts"), "utf8");
const symbolic = new Map([...routesTs.matchAll(/^\s*(\w+)\s*:\s*"([^"]+)"/gm)].map((m) => [`ROUTES.${m[1]}`, m[2]]));
const registered = new Map<string, RouteAudience>();
for (const r of buildInventory()) {
  if (!IN_TABLE.includes(r.audience) || r.path.includes("*")) continue;
  const path = r.path.startsWith("ROUTES.") ? symbolic.get(r.path) : r.path;
  if (!path) { problems.push(`router route ${r.path} could not be resolved from lib/routes.ts`); continue; }
  registered.set(path, r.audience);
}

const rowRoutes = new Set<string>();
for (const p of pages.pages) {
  if (rowRoutes.has(p.route)) problems.push(`page ${p.route} has two rows`);
  rowRoutes.add(p.route);
  if (!registered.has(p.route)) problems.push(`page row ${p.route} is not a route the router registers`);
  for (const k of PAGE_CRITERIA) {
    const check = p.checks?.[k];
    if (!check) { problems.push(`page ${p.route}: missing "${k}"`); continue; }
    checkEnvAndStatus(`page ${p.route} ${k}`, check.status, check.env, check.evidence);
    if (check.status === "pass" && BROWSER_ONLY.includes(k) && !check.env.some((e) => e === "L" || e === "P")) {
      problems.push(`page ${p.route} ${k}: only a browser (L or P) can pass this check`);
    }
  }
}
for (const route of registered.keys()) {
  if (!rowRoutes.has(route)) problems.push(`router registers ${route} but pages.json has no row for it`);
}

if (problems.length) {
  console.error("completeness data is invalid:\n  " + problems.join("\n  "));
  process.exit(1);
}

// ── Compute ─────────────────────────────────────────────────────────────────

const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
const envList = (xs: Env[]) => (xs.length ? [...new Set(xs)].sort((a, b) => ENVS.indexOf(a) - ENVS.indexOf(b)).join(", ") : "—");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

const all = criteria.areas.flatMap((a) => a.criteria);
const totalPassed = all.filter((c) => c.status === "pass").length;
const totalInProduction = all.filter((c) => c.status === "pass" && c.env.includes("P")).length;
const totalAtProvider = all.filter((c) => c.status === "pass" && c.env.includes("R")).length;
const addedLater = all.filter((c) => c.added);
const statusCounts = (xs: Status[]) => STATUSES.map((s) => `${STATUS_WORD[s]} ${xs.filter((x) => x === s).length}`).join(" · ");

const pageRows = pages.pages.map((p) => {
  const passed = PAGE_CRITERIA.filter((k) => p.checks[k].status === "pass");
  const failing = PAGE_CRITERIA.filter((k) => p.checks[k].status !== "pass");
  const env = PAGE_CRITERIA.flatMap((k) => (p.checks[k].status === "pass" ? p.checks[k].env : []));
  return { p, passed: passed.length, failing, env };
});
const pageChecksTotal = pageRows.length * PAGE_CRITERIA.length;
const pageChecksPassed = pageRows.reduce((s, r) => s + r.passed, 0);
const perCriterion = PAGE_CRITERIA.map((k) => ({
  k, passed: pages.pages.filter((p) => p.checks[k].status === "pass").length,
}));
const fullyPassing = pageRows.filter((r) => r.passed === PAGE_CRITERIA.length).length;
const nonePassing = pageRows.filter((r) => r.passed === 0).length;
const audienceCount = (a: RouteAudience) => [...registered.values()].filter((x) => x === a).length;

// ── Render ──────────────────────────────────────────────────────────────────

const lines: string[] = [];
const w = (s = "") => lines.push(s);

w(`# Verified completeness`);
w();
w(`> **Generated** from \`docs/crm-ops/completeness/criteria.json\` and \`pages.json\` by \`render.ts\` — do not edit by hand. As of ${criteria.asOf}.`);
w();
w(`## Method`);
w();
w("`verified completeness = passed criteria ÷ total criteria × 100`, computed from the rows below.");
w();
w("- A criterion passes only on evidence: a committed test that fails when the behaviour breaks, an action actually performed and checked, or a recorded exit code. Rendering a page, or a route returning 200, passes nothing.");
w(`- Statuses: **Passed**; **Built, not proven** (implemented, unverified — not passed); **Not passed**; **Deferred by decision** (kept in the denominator).`);
w("- Environments: **L** local (web :22065, API :8080, preview database) · **T** automated suites on a disposable database · **R** verified at the real provider · **P** production.");
w("- Nothing is removed from a denominator to improve a percentage.");
w();
w(`## Table 1 — the 18 core feature areas`);
w();
w(`**${totalPassed} / ${all.length} criteria = ${pct(totalPassed, all.length)} verified.** At the real provider: ${totalAtProvider}. In production: **${totalInProduction}**.`);
w();
w(`By status: ${statusCounts(all.map((c) => c.status))}.`);
if (addedLater.length) {
  w();
  w(`The denominator is ${all.length - addedLater.length} baseline criteria plus ${addedLater.length} added from the owner's brief after the baseline was set; each is listed under "Criteria added after the baseline" with its reason.`);
}
w();
w("| # | Area | Passed / total | % | Verified in | In production | What is not passed |");
w("|---|---|---|---|---|---|---|");
for (const area of criteria.areas) {
  const passed = area.criteria.filter((c) => c.status === "pass");
  const notPassed = area.criteria.filter((c) => c.status !== "pass");
  const env = envList(passed.flatMap((c) => c.env));
  const prod = passed.filter((c) => c.env.includes("P")).length;
  const gaps = notPassed.map((c) => `${c.id} ${c.text}${c.status === "deferred" ? " (deferred)" : c.status === "unverified" ? " (built, not proven)" : ""}`).join("; ");
  w(`| ${area.id} | ${cell(area.name)} | ${passed.length} / ${area.criteria.length} | **${pct(passed.length, area.criteria.length)}** | ${env} | ${prod} | ${cell(gaps || "—")} |`);
}
w();
w(`## Table 2 — every CRM page, one row per registered route`);
w();
w(`${pageRows.length} routes derived from the router (${audienceCount("staff")} staff, ${audienceCount("customer")} customer, ${audienceCount("token")} token-landing). Each is scored against the same ${PAGE_CRITERIA.length} checks:`);
w();
for (const k of PAGE_CRITERIA) w(`- **${k}** — ${PAGE_CRITERION_TEXT[k]}`);
w();
w(`**${pageChecksPassed} / ${pageChecksTotal} page checks = ${pct(pageChecksPassed, pageChecksTotal)}.** Pages passing all ${PAGE_CRITERIA.length}: ${fullyPassing}. Pages passing none: ${nonePassing}.`);
w();
w(`By status: ${statusCounts(pages.pages.flatMap((p) => PAGE_CRITERIA.map((k) => p.checks[k].status)))}.`);
w();
w("| Check | Pages passing |");
w("|---|---|");
for (const { k, passed } of perCriterion) w(`| ${k} | ${passed} / ${pageRows.length} (${pct(passed, pageRows.length)}) |`);
w();
w("| # | Route | Page | Passed / 6 | % | Verified in | Not passed yet |");
w("|---|---|---|---|---|---|---|");
pageRows.forEach((r, i) => {
  w(`| ${i + 1} | \`${r.p.route}\` | ${cell(r.p.title)} | ${r.passed} / ${PAGE_CRITERIA.length} | ${pct(r.passed, PAGE_CRITERIA.length)} | ${envList(r.env)} | ${cell(r.failing.join(", ") || "—")} |`);
});
w();
w(`## Criteria added after the baseline`);
w();
if (addedLater.length === 0) w("None.");
else {
  w("| ID | Criterion | Added | Why | Status |");
  w("|---|---|---|---|---|");
  for (const c of addedLater) w(`| ${c.id} | ${cell(c.text)} | ${c.added} | ${cell(c.why ?? "—")} | ${STATUS_WORD[c.status]} |`);
}
w();
w(`## Deferred scope, shown rather than hidden`);
w();
const deferred = all.filter((c) => c.status === "deferred");
if (deferred.length === 0) w("None.");
for (const c of deferred) w(`- **${c.id}** ${c.text} — ${c.evidence}`);
w();
w(`## Appendix A — every criterion`);
for (const area of criteria.areas) {
  w();
  w(`### ${area.id}. ${area.name}`);
  w();
  w("| ID | Criterion | Status | Env | Evidence / gap |");
  w("|---|---|---|---|---|");
  for (const c of area.criteria) w(`| ${c.id} | ${cell(c.text)} | ${STATUS_WORD[c.status]} | ${envList(c.env)} | ${cell(c.evidence)} |`);
}
w();
w(`## Appendix B — every page check`);
for (const r of pageRows) {
  w();
  w(`### \`${r.p.route}\` — ${r.p.title}`);
  w();
  w("| Check | Status | Env | Evidence |");
  w("|---|---|---|---|");
  for (const k of PAGE_CRITERIA) {
    const c = r.p.checks[k];
    w(`| ${k} | ${STATUS_WORD[c.status]} | ${envList(c.env)} | ${cell(c.evidence)} |`);
  }
}
w();

const rendered = lines.join("\n");

if (process.argv.includes("--check")) {
  let committed = "";
  try { committed = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n"); } catch { /* missing */ }
  if (committed !== rendered) {
    console.error("COMPLETENESS.md is stale: re-run `npx tsx docs/crm-ops/completeness/render.ts` and commit the result.");
    process.exit(1);
  }
  console.log(`completeness is current: ${totalPassed}/${all.length} criteria, ${pageChecksPassed}/${pageChecksTotal} page checks across ${pageRows.length} routes`);
} else {
  writeFileSync(OUT, rendered);
  console.log(`wrote COMPLETENESS.md: ${totalPassed}/${all.length} criteria (${pct(totalPassed, all.length)}), ${pageChecksPassed}/${pageChecksTotal} page checks across ${pageRows.length} routes`);
}
