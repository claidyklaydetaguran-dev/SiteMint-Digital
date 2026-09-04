/**
 * Theme-compliance contract — anti-regression guard for the 2026-09 Glacier
 * Mint sweep (owner directive: "I want all (website, CRM, AI receptionist
 * app) to have the same theme and palettes"). Source-literal check in the
 * style of `v5FoundationContract.test.ts`: dependency-free (fs only), run
 * via tsx from scripts/package.json.
 *
 * What it guards: the 14 REJECTED legacy "System-B green" hex values must
 * never return to source. That list was rejected in favour of the approved
 * Glacier Mint system (`tokens-v5.css` in both apps: mint #32C5D2/#56D2CF/
 * #1FA9BC/#0B7487, inks #173642/#153E52, slate #4A6472, tints #DFF7F7/
 * #EDF9FA/#F8FCFC, support #9FC2CC/#CFE7EA/#A9CFD6/#E8F5F7).
 *
 * Two encodings are checked, not one:
 *   1. The hex string itself, case-insensitive (`#25D0B0`, `#25d0b0`, …).
 *   2. The exact same colour written as a decimal `rgb()`/`rgba()` triple
 *      (`rgba(37, 208, 176, 0.28)`). This is not a theoretical concern — the
 *      2026-09 sweep found a live instance of exactly this: `v5-remap.css`
 *      carried `rgba(37, 208, 176, …)` (= #25D0B0) and `rgba(10, 42, 46, …)`
 *      (= #0A2A2E) as shadow/glow tints, invisible to any hex-only grep or
 *      test, reintroducing the rejected palette under a different notation.
 *      A hex-only check would have missed the exact defect this test exists
 *      to catch, so both encodings are load-bearing, not belt-and-braces.
 *
 * Scope: every `.ts`/`.tsx`/`.css` file under `artifacts/web-agency/src` and
 * `artifacts/helpdesk/src`, comments stripped first (so a code comment that
 * merely *documents* a rejected value in passing — e.g. "was rgba(37,208,176)
 * = #25D0B0" — does not self-trigger the guard it is explaining).
 * `*.test.ts` files are excluded from the walk: they are not shipped UI, and
 * a contract test (this one included) legitimately spells out the rejected
 * literals as reference data.
 *
 * ANNOTATED EXCEPTIONS: if a rejected value must legitimately appear in
 * source (documentation string, migration note, etc.) that isn't already
 * comment-stripped, add a `{ file, note }` entry to `ANNOTATED_EXCEPTIONS`
 * below — file is the exact repo-relative path (POSIX separators) and note
 * must explain why. Empty by design: nothing is exempted yet.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const THIS_FILE_REL = "artifacts/web-agency/src/shells/themeComplianceContract.test.ts";

// ─── The rejected palette ───────────────────────────────────────────────────

const REJECTED_HEX = [
  "#25D0B0",
  "#4FD9CF",
  "#16B597",
  "#0E7F6B",
  "#E6F9F3",
  "#EEFAF8",
  "#F7FBF9",
  "#0B3A3E",
  "#0A2A2E",
  "#526B70",
  "#9FC3BC",
  "#D7E7E3",
  "#B5D2CB",
  "#E9F7F3",
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

interface RejectedPattern {
  hex: string;
  hexRe: RegExp;
  rgbRe: RegExp;
}

const REJECTED_PATTERNS: RejectedPattern[] = REJECTED_HEX.map((hex) => {
  const [r, g, b] = hexToRgb(hex);
  return {
    hex,
    hexRe: new RegExp(hex.replace("#", "#"), "i"),
    // Matches `rgb(`/`rgba(` followed by the exact decimal triple, tolerant
    // of whitespace around the commas (both `37,208,176` and `37, 208, 176`).
    rgbRe: new RegExp(`rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\b`, "i"),
  };
});

// ─── Annotated exceptions (empty by design) ────────────────────────────────

interface Exception {
  file: string; // repo-relative, POSIX separators
  note: string; // why this occurrence is not a live regression
}

const ANNOTATED_EXCEPTIONS: Exception[] = [];

// ─── File walk ──────────────────────────────────────────────────────────────

const SCAN_ROOTS = ["artifacts/web-agency/src", "artifacts/helpdesk/src"];
const SCAN_EXTENSIONS = [".ts", ".tsx", ".css"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = path.join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(abs, out);
    } else if (SCAN_EXTENSIONS.includes(path.extname(entry))) {
      out.push(abs);
    }
  }
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const allFiles: string[] = [];
for (const root of SCAN_ROOTS) {
  walk(path.join(repoRoot, root), allFiles);
}

const scanFiles = allFiles.filter((abs) => {
  const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
  if (rel === THIS_FILE_REL) return false;
  if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return false;
  return true;
});

// ─── Tiny runner (style matches v5FoundationContract.test.ts) ─────────────

let failures = 0;
function check(label: string, ok: boolean) {
  if (ok) console.log(`  PASS  ${label}`);
  else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

console.log(`Scanning ${scanFiles.length} source files under ${SCAN_ROOTS.join(", ")}...`);

check("at least one source file was found to scan", scanFiles.length > 100);

for (const abs of scanFiles) {
  const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
  const raw = readFileSync(abs, "utf8");
  const code = stripComments(raw);
  const exception = ANNOTATED_EXCEPTIONS.find((e) => e.file === rel);

  for (const { hex, hexRe, rgbRe } of REJECTED_PATTERNS) {
    const hexHit = hexRe.test(code);
    const rgbHit = rgbRe.test(code);
    if (!hexHit && !rgbHit) continue;

    if (exception) {
      console.log(`  SKIP  ${rel} carries ${hex} — annotated exception: ${exception.note}`);
      continue;
    }

    const encoding = hexHit && rgbHit ? "hex + decimal rgb()" : hexHit ? "hex" : "decimal rgb()";
    check(`${rel} is free of REJECTED legacy colour ${hex} (found as ${encoding})`, false);
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll theme compliance contract checks passed.");
