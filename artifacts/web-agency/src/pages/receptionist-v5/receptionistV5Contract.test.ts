/**
 * AI Receptionist V5 — committed contract tests for the product-only landing
 * page.
 *
 * Run via: `npx tsx artifacts/web-agency/src/pages/receptionist-v5/receptionistV5Contract.test.ts`
 * (this repo's `tsx`-based test convention — see `signupContract.test.ts`).
 * It is excluded from `tsc` by web-agency/tsconfig.json's test-file glob
 * (every `*.test.ts` path), and it performs no network request and places
 * no call.
 *
 * Six checks, each mapped to a binding rule from the assignment brief:
 *
 * 1. The 17 anchored sections render, in the owner-approved order, on the
 *    actual page source — not just declared in `sections.ts`.
 * 2. None of the four forbidden phrases ("24/7", "every call",
 *    "Start a Project", "Signal") appear anywhere in this page's rendered
 *    copy.
 * 3. The exact approved privacy sentence (OWNER-REVIEW-WORKBOOK L-6) is
 *    present verbatim.
 * 4. No file under `components/receptionist-v5` imports `@vapi-ai/*` or
 *    references `VAPI_API_KEY` — the voice-provider boundary in CLAUDE.md
 *    applies here even though this page never places a real call.
 * 5. The live-demo button is gated on `VITE_PUBLIC_DEMO_ENABLED`, so a
 *    committed build can never show a live-call action.
 * 6. The hero's exact owner-specified copy hierarchy (2026-09-05 full-screen
 *    hero redesign) — eyebrow, private-beta status, headline, supporting
 *    line, primary/secondary actions, sign-in link — matches verbatim and
 *    is rendered from `HERO_COPY` (not a paraphrase), with the primary
 *    action wired to the Interactive Preview section and the secondary
 *    action wired to Request Beta Access.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HERO_COPY, PRIVACY_STATEMENT, RECEPTIONIST_V5_SECTIONS } from "./sections.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/receptionist-v5 → src/pages → src → web-agency → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const webAgencySrc = path.join(repoRoot, "artifacts/web-agency/src");

const pagePath = path.join(webAgencySrc, "pages/AiReceptionistV5.tsx");
const pageSrc = readFileSync(pagePath, "utf8");

/** Rendered copy only — strips comments so a doc-comment quoting a forbidden phrase (to explain why it's absent) doesn't trip the scan. */
const pageText = pageSrc.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

console.log("\n--- 17 sections render in the owner-approved order ---");
{
  check(
    "sections.ts declares exactly 17 sections",
    RECEPTIONIST_V5_SECTIONS.length === 17,
    String(RECEPTIONIST_V5_SECTIONS.length),
  );

  const positions = RECEPTIONIST_V5_SECTIONS.map((s) => ({
    id: s.id,
    at: pageSrc.indexOf(`id={SECTION_ID.${propKeyFor(s.id)}}`),
  }));

  function propKeyFor(id: string): string {
    // The page indexes SECTION_ID with a bracket access for any id that
    // isn't a bare identifier (e.g. "what-it-does"), and dot access
    // otherwise (e.g. "hero"). Both forms are checked below.
    return id;
  }

  for (const { id } of positions) {
    const dotForm = `id={SECTION_ID.${id}}`;
    const bracketForm = `id={SECTION_ID["${id}"]}`;
    const at = pageSrc.includes(dotForm) ? pageSrc.indexOf(dotForm) : pageSrc.indexOf(bracketForm);
    check(`section "${id}" is rendered`, at !== -1, `looked for ${dotForm} or ${bracketForm}`);
  }

  const ordered = RECEPTIONIST_V5_SECTIONS.map((s) => {
    const dotForm = `id={SECTION_ID.${s.id}}`;
    const bracketForm = `id={SECTION_ID["${s.id}"]}`;
    return pageSrc.includes(dotForm) ? pageSrc.indexOf(dotForm) : pageSrc.indexOf(bracketForm);
  });
  const isSorted = ordered.every((v, i) => i === 0 || v === -1 || ordered[i - 1] === -1 || v > ordered[i - 1]);
  check(
    "sections appear in the declared order",
    isSorted,
    JSON.stringify(RECEPTIONIST_V5_SECTIONS.map((s, i) => `${s.id}:${ordered[i]}`)),
  );
}

console.log("\n--- forbidden phrases are absent ---");
{
  const forbidden: Array<[string, RegExp]> = [
    ["24/7", /24\s*\/\s*7/],
    ["every call", /every call/i],
    ["Start a Project", /Start a Project/],
    ["Signal", /\bSignal\b/],
  ];
  for (const [label, re] of forbidden) {
    check(`no forbidden phrase: ${label}`, !re.test(pageText), (pageText.match(re) ?? [])[0]);
  }
}

console.log("\n--- privacy sentence is present verbatim ---");
{
  check("PRIVACY_STATEMENT constant matches the approved wording", PRIVACY_STATEMENT === "SiteMint does not retain call audio or full transcripts. The dashboard stores only the operational call details and outcomes needed to manage the receptionist.");
  check("the page renders PRIVACY_STATEMENT (not a paraphrase)", pageSrc.includes("{PRIVACY_STATEMENT}"));
}

console.log("\n--- no provider SDK anywhere in receptionist-v5 components ---");
{
  const componentsDir = path.join(webAgencySrc, "components/receptionist-v5");
  const files = listFilesRecursive(componentsDir).filter((f) => /\.(ts|tsx)$/.test(f));
  check("component directory has files to scan", files.length > 0, componentsDir);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // Strip comments first (same reasoning as `pageText` above): a doc
    // comment is allowed to name `@vapi-ai` or `VAPI_API_KEY` to explain
    // that the file deliberately avoids them — only actual code may not.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const rel = path.relative(webAgencySrc, file);
    check(`${rel} does not import @vapi-ai`, !/@vapi-ai/.test(code));
    check(`${rel} does not reference VAPI_API_KEY`, !/VAPI_API_KEY/.test(code));
  }
}

console.log("\n--- live-demo button is gated on VITE_PUBLIC_DEMO_ENABLED ---");
{
  const flagSrc = readFileSync(
    path.join(webAgencySrc, "components/receptionist-v5/publicDemoFlag.ts"),
    "utf8",
  );
  check(
    "publicDemoFlag reads VITE_PUBLIC_DEMO_ENABLED with an exact-string comparison",
    /import\.meta\.env\.VITE_PUBLIC_DEMO_ENABLED\s*===\s*"true"/.test(flagSrc),
  );

  const panelSrc = readFileSync(
    path.join(webAgencySrc, "components/receptionist-v5/LiveDemoPanel.tsx"),
    "utf8",
  );
  check("LiveDemoPanel imports the flag", panelSrc.includes("publicDemoEnabled"));
  check(
    "the disabled explained state renders when the flag is false",
    panelSrc.includes("Live demo — coming after certification"),
  );
  check(
    "the live-call entry point is conditioned on the flag, not always rendered",
    /if\s*\(!publicDemoEnabled/.test(panelSrc) || /publicDemoEnabled\s*\?/.test(panelSrc),
  );
}

console.log("\n--- hero copy matches the owner-specified exact copy hierarchy (2026-09-05) ---");
{
  check("HERO_COPY.eyebrow matches the approved wording", HERO_COPY.eyebrow === "SiteMint AI Receptionist");
  check(
    "HERO_COPY.betaStatus matches the approved wording",
    HERO_COPY.betaStatus === "Private beta — invite only",
  );
  check(
    "HERO_COPY.title matches the approved wording",
    HERO_COPY.title === "Missed calls shouldn't mean missed opportunities.",
  );
  check(
    "HERO_COPY.supporting matches the approved wording",
    HERO_COPY.supporting ===
      "Give callers a helpful next step—even when your team cannot answer—using your business information, availability, and appointment rules.",
  );
  check(
    "HERO_COPY.primaryCta matches the approved wording",
    HERO_COPY.primaryCta === "Explore the Interactive Preview",
  );
  check(
    "HERO_COPY.secondaryCta matches the approved wording",
    HERO_COPY.secondaryCta === "Request Beta Access",
  );
  check(
    "HERO_COPY.signInPrompt + signInCta read \"Already a client? Sign in\"",
    `${HERO_COPY.signInPrompt} ${HERO_COPY.signInCta}` === "Already a client? Sign in",
  );

  check("the page renders HERO_COPY.eyebrow (not a paraphrase)", pageSrc.includes("{HERO_COPY.eyebrow}"));
  check("the page renders HERO_COPY.betaStatus (not a paraphrase)", pageSrc.includes("{HERO_COPY.betaStatus}"));
  check(
    "the page renders HERO_COPY.title (not a paraphrase)",
    pageSrc.includes("text={HERO_COPY.title}"),
  );
  check("the page renders HERO_COPY.supporting (not a paraphrase)", pageSrc.includes("{HERO_COPY.supporting}"));
  check("the page renders HERO_COPY.primaryCta (not a paraphrase)", pageSrc.includes("{HERO_COPY.primaryCta}"));
  check("the page renders HERO_COPY.secondaryCta (not a paraphrase)", pageSrc.includes("{HERO_COPY.secondaryCta}"));
  check("the page renders HERO_COPY.signInPrompt (not a paraphrase)", pageSrc.includes("{HERO_COPY.signInPrompt}"));
  check("the page renders HERO_COPY.signInCta (not a paraphrase)", pageSrc.includes("{HERO_COPY.signInCta}"));

  const primaryWiring =
    /href=\{`#\$\{SECTION_ID\.preview\}`\}\s+className="smv5-btn smv5-btn--primary">\s*\{HERO_COPY\.primaryCta\}/;
  check(
    'primary hero action ("Explore the Interactive Preview") is the filled button, anchored to the Interactive Preview section',
    primaryWiring.test(pageSrc),
  );

  const secondaryWiring =
    /href=\{`#\$\{SECTION_ID\.beta\}`\}\s+className="smv5-btn smv5-btn--outline">\s*\{HERO_COPY\.secondaryCta\}/;
  check(
    'secondary hero action ("Request Beta Access") is the outline button, anchored to the Request Beta Access section',
    secondaryWiring.test(pageSrc),
  );
}

console.log(
  failed === 0
    ? "\nAll receptionistV5Contract tests passed."
    : `\nreceptionistV5Contract: ${failed} check(s) FAILED.`,
);
if (failed > 0) process.exit(1);
