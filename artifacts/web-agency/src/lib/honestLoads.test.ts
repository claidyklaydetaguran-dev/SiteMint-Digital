/**
 * The guard against the CRM's oldest lie: a request that failed, rendered as
 * "you have none".
 *
 * Measured on 2026-09-16, before this was fixed: the contacts page showed
 * "All People — 0 people" over an empty table while the database held fifteen
 * contacts, and the deals board reported "0 deals · $0 total value" with every
 * stage reading "No deals" and no failure message at all. Both came from the
 * same shape of code —
 *
 *     try { const r = await adminFetch(...); if (r.ok) setItems(d.items) }
 *     catch { setError("Couldn't load") }
 *
 * — which leaves the list empty on failure, so every count derived from it
 * renders 0 and the empty state says "No X yet".
 *
 * The cure is `src/lib/adminLoad.ts`: `Load<T>` is "loading" | "ready" |
 * "error", so there is no empty array to count, and `failureReason` gives a
 * 401, a 403 naming its missing grant, a 404, a 5xx and an unreachable server
 * each their own words. `src/components/crm/LoadState.tsx` renders them.
 *
 * Two checks, both source scans in the style of the other suites here:
 *
 *  1. a file that RENDERS and reads from the API must carry a three-state
 *     loader, or be on one of the two allowlists below, each entry saying why;
 *  2. nowhere in these trees may a promise chain swallow its own failure with
 *     `.catch(() => {})` — the idiom behind the two worst cases above.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
/** src/lib → src */
const srcRoot = path.resolve(here, "..");
const repoRoot = path.resolve(srcRoot, "../../..");

/** Every surface an operator or a customer reads as fact. */
const SCANNED_DIRS = ["pages/crm", "pages/portal", "components/crm"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const allFiles = SCANNED_DIRS.flatMap(d => walk(path.join(srcRoot, d)));

/**
 * Only a file that renders can render a lie.
 *
 * The `.ts` modules in these trees are types, pure logic and request helpers
 * (`components/crm/campaign/shared.ts`, `campaignListState.ts`, `pages/portal/
 * portalApi.ts` …). They put nothing on screen, so check 1 does not apply to
 * them — but check 2 still does, because a failure swallowed in a helper is a
 * zero rendered by its caller.
 */
const renderedFiles = allFiles.filter(f => f.endsWith(".tsx"));
const rel = (file: string) => path.relative(repoRoot, file).replace(/\\/g, "/");
const sourceOf = (file: string) => readFileSync(file, "utf8");

/**
 * The code, without the prose.
 *
 * Every check here looks for an idiom, and a comment that QUOTES an idiom is
 * not that idiom — several of these files now carry a note explaining the
 * swallow they used to have, and matching those would punish a file for
 * documenting its own fix. Block comments go first (that is where the
 * explanations live), then whole-line `//` comments; a `//` in the middle of a
 * line is left alone so URLs inside strings survive.
 */
function codeOf(file: string): string {
  return sourceOf(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*\/\//.test(line))
    .join("\n");
}

/** Reads that put data on screen. A file doing any of these owns this rule. */
const READS_THE_API = /\b(adminFetch|adminGet|adminJson|readAdminResource|portalFetch)\s*\(/;

/**
 * Carrying a real three-state load.
 *
 * `@/lib/adminLoad` is the CRM's. The customer portal has its own, older and
 * equally honest, in `pages/portal/portalApi.ts` — `PortalLoadState` with the
 * `PortalErrorState` that renders it — so a portal page satisfies this rule by
 * using that instead.
 */
const HONEST_LOADER = [
  /lib\/adminLoad/,
  /\bPortalLoadState\b/,
  /\busePortalResource\b/,
  /\bPortalErrorState\b/,
];

const carriesHonestLoader = (source: string) => HONEST_LOADER.some(m => m.test(source));

/**
 * Files that read from the API and genuinely have no list, count or figure to
 * get wrong.
 *
 * Keep this short. An entry here is a promise that nothing on that surface can
 * render a failure as data.
 */
const NO_LIST_ALLOWLIST: ReadonlyArray<{ file: string; reason: string }> = [
  {
    file: "artifacts/web-agency/src/components/crm/AdminRouteGuard.tsx",
    reason: "Probes whether there is a session and renders its own three outcomes — allowed, denied, unreachable (adminAccess.ts). It displays no business data of its own.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmCopilot.tsx",
    reason: "Asks for one generated draft at a time, on a button press, and shows that answer or the stated failure. It loads no list and derives no count, so it has no figure to get wrong.",
  },
];

/**
 * Files that were already honest before `adminLoad` existed, by their own
 * local error state, and were verified as such in the 2026-09-16 survey —
 * every count and empty state gated behind "not loading and not failed", so a
 * failure renders neither a zero nor a "none".
 *
 * They are allowed to keep their own mechanism; what they may not do is lose
 * it. The redundancy check below removes an entry the moment its file adopts
 * the shared loader, so this list shrinks rather than rots. Anything NEW
 * should use `@/lib/adminLoad` instead of joining this list.
 */
const OWN_HONEST_STATE_ALLOWLIST: ReadonlyArray<{ file: string; reason: string }> = [
  {
    file: "artifacts/web-agency/src/pages/crm/CrmTasks.tsx",
    reason: "Measured in a browser 2026-09-16: a failed load renders the stated failure and a Retry, and nothing else — no count, no empty state.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmPipeline.tsx",
    reason: "Measured in a browser 2026-09-16: full-page stated failure with Retry; the total and the per-stage counts are never reached.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmMyDay.tsx",
    reason: "Measured in a browser 2026-09-16: the error card replaces the whole day, with a Retry, so no task or reminder count renders.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmSupport.tsx",
    reason: "A failed first load is a full-page stated failure with Retry, and a failed reload keeps the rows it last had rather than emptying the queue. Its knowledge-base read used to be swallowed and is now stated too.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmReporting.tsx",
    reason: "Sets its summary to null on failure, so no figure card renders at all — the stated error and a Retry are the whole page.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmAutomationQueue.tsx",
    reason: "Every one of its four loads renders an ErrorState with a Retry, and the lists stay null so no count is derived.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmIntakeCases.tsx",
    reason: "Every zero-bearing surface — the chips, the total and the empty state — is gated behind not-loading and not-failed.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmReceptionistAccounts.tsx",
    reason: "Tiles and empty state are gated behind not-loading, not-failed and not-refused, and a refusal is stated separately from an error.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmStaffAdmin.tsx",
    reason: "The stated error sits beside a refresh, and the empty state needs both an empty list and no error before it will claim there are no staff accounts.",
  },
  {
    file: "artifacts/web-agency/src/pages/crm/CrmAdminSettings.tsx",
    reason: "Renders no figure at all when its status probe fails — the chip simply does not appear, so nothing is claimed either way.",
  },
  {
    file: "artifacts/web-agency/src/components/crm/SegmentBuilder.tsx",
    reason: "The live audience count is set to null, never 0, and the panel says 'Count unavailable' with the reason and a Recount.",
  },
  {
    file: "artifacts/web-agency/src/components/crm/UnmappedOwnersPanel.tsx",
    reason: "The three stat tiles are inside a guard on the loaded data, so a failure shows the stated error and a Try again instead of three zeros.",
  },
  {
    file: "artifacts/web-agency/src/components/crm/CustomerTimeline.tsx",
    reason: "States the error with a Retry, and the 'nothing recorded yet' line needs both an empty list and no error.",
  },
  {
    file: "artifacts/web-agency/src/components/crm/CustomerPortalPanel.tsx",
    reason: "A failure replaces the panel body with the stated reason and a Try again, so no portal status is inferred from an absent answer.",
  },
];

/**
 * Swallowed failures that are genuinely not loads.
 *
 * The bar is high: the call must put nothing on screen and make no claim, so
 * that discarding its failure cannot mislead anybody. A read belongs here
 * never — keep it as a `Load` and state it.
 */
const SWALLOW_ALLOWLIST: ReadonlyArray<{ file: string; reason: string }> = [
  {
    file: "artifacts/web-agency/src/components/crm/ConversationInbox.tsx",
    reason: "A draft autosave WRITE, not a load. `setDraftSavedAt` is set only on success, so a save that failed never renders as 'saved' — the page claims nothing either way.",
  },
];

const allowlisted = new Map<string, string>([
  ...NO_LIST_ALLOWLIST.map(e => [e.file, e.reason] as const),
  ...OWN_HONEST_STATE_ALLOWLIST.map(e => [e.file, e.reason] as const),
]);

describe("a failed load is never rendered as data", () => {
  it("scans the CRM and portal surfaces", () => {
    expect(renderedFiles.length).toBeGreaterThan(40);
  });

  it("gives every API-reading surface an honest three-state loader", () => {
    const offenders = renderedFiles
      .filter(file => {
        const code = codeOf(file);
        return READS_THE_API.test(code)
          && !carriesHonestLoader(code)
          && !allowlisted.has(rel(file));
      })
      .map(rel);

    expect(
      offenders,
      offenders.length === 0 ? "" : [
        "",
        "These files read from the API but carry no honest three-state load:",
        ...offenders.map(f => `  - ${f}`),
        "",
        "A request that failed must never be displayed as 'no data' or as a zero.",
        "Import `Load`, `readAdminResource` and `failureReason` from '@/lib/adminLoad',",
        "render the failure with `LoadFailure` from '@/components/crm/LoadState', and make",
        "every count derived from that data an em dash (`<Figure value={null} />`) when it",
        "did not load. See artifacts/web-agency/src/pages/crm/CrmDeals.tsx for the pattern.",
        "",
        "If the file genuinely has no list, count or figure, add it to NO_LIST_ALLOWLIST",
        "in this file with the reason why.",
      ].join("\n"),
    ).toEqual([]);
  });

  it("never swallows a load failure into an empty result", () => {
    // `.catch(() => {})` is how CrmCampaigns rendered "Sequences (0)" and
    // "No sequences yet" with no failure anywhere on screen, and how the CRM
    // chrome told everybody "All caught up! No overdue tasks or pending
    // follow-ups." A false all-clear is worse than a false zero.
    const swallowed = /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/;
    // Two things legitimately shrug: writing to the clipboard, and asking a
    // video to play. Neither is a load, and neither can be mistaken for data.
    const notALoad = /clipboard|\.play\(/;

    const offenders = allFiles
      .filter(file => !SWALLOW_ALLOWLIST.some(e => e.file === rel(file)))
      .filter(file => codeOf(file)
        .split("\n")
        .some(line => swallowed.test(line) && !notALoad.test(line)))
      .map(rel);

    expect(
      offenders,
      offenders.length === 0 ? "" : [
        "",
        "These files discard a failure with `.catch(() => {})`:",
        ...offenders.map(f => `  - ${f}`),
        "",
        "A failure you swallow is a failure you will render as a zero. Keep the",
        "result as a `Load` (see '@/lib/adminLoad') and state it on the page.",
      ].join("\n"),
    ).toEqual([]);
  });

  it("keeps both allowlists honest about themselves", () => {
    for (const entry of [...NO_LIST_ALLOWLIST, ...OWN_HONEST_STATE_ALLOWLIST]) {
      const match = renderedFiles.find(f => rel(f) === entry.file);
      expect(
        match,
        `An allowlist in this file names ${entry.file}, which is not a rendering file in the scanned trees — remove the entry.`,
      ).toBeTruthy();

      expect(
        READS_THE_API.test(codeOf(match!)),
        `${entry.file} no longer reads from the API, so its allowlist entry is dead — remove it.`,
      ).toBe(true);

      expect(
        entry.reason.length,
        `${entry.file} needs a reason in its allowlist entry saying why it cannot render a failure as data.`,
      ).toBeGreaterThan(30);
    }

    // An entry that has since adopted the shared loader is redundant, and a
    // list nobody prunes is a list nobody trusts.
    const redundant = OWN_HONEST_STATE_ALLOWLIST
      .filter(entry => {
        const match = renderedFiles.find(f => rel(f) === entry.file);
        return match && carriesHonestLoader(codeOf(match));
      })
      .map(e => e.file);

    expect(
      redundant,
      redundant.length === 0 ? "" : [
        "",
        "These files now carry the shared honest loader, so their",
        "OWN_HONEST_STATE_ALLOWLIST entries are redundant — delete them:",
        ...redundant.map(f => `  - ${f}`),
      ].join("\n"),
    ).toEqual([]);
  });
});
