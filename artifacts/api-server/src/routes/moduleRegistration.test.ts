/**
 * Every module a barrel imports must actually be committed.
 *
 * This guards a defect that really happened on this branch. Several agents were
 * adding routers to `src/routes/index.ts` and schemas to
 * `lib/db/src/schema/index.ts` at the same time. A commit picked up the barrel
 * — which by then referenced three new routers — while the router files
 * themselves were still untracked. The result compiled and tested perfectly in
 * the working tree, because the files were there on disk, and was broken for
 * everybody else: a fresh clone of that commit cannot resolve
 * `./crmPortal`, `./crmHistory` or `./crmReports`.
 *
 * A typecheck cannot catch this. `tsc` reads the working tree, where the file
 * exists. Only git knows the file is not in the commit.
 *
 * So this test asks git, not the filesystem: for each relative import in the
 * two barrels, is the target tracked? An untracked target means the next commit
 * of that barrel ships a dangling reference.
 *
 * It deliberately does NOT require the file to be committed *already* — a new
 * router legitimately sits untracked next to an edited barrel while the work is
 * in progress. It requires that the pair be consistent at commit time, which is
 * why the assertion names the exact `git add` that fixes it.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");

const BARRELS = [
  "artifacts/api-server/src/routes/index.ts",
  "lib/db/src/schema/index.ts",
];

/** Files git knows about — tracked in HEAD or staged in the index. */
function trackedFiles(): Set<string> {
  const out = execFileSync("git", ["ls-files", "-c"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return new Set(out.split(/\r?\n/).filter(Boolean));
}

/** Relative specifiers this barrel imports or re-exports. */
function relativeSpecifiers(source: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /(?:^|\n)\s*import\s+[^;]*?from\s+["'](\.[^"']+)["']/g,
    /(?:^|\n)\s*export\s+\*\s+from\s+["'](\.[^"']+)["']/g,
    /(?:^|\n)\s*export\s+\{[^}]*\}\s+from\s+["'](\.[^"']+)["']/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) found.add(m[1]);
  }
  return [...found];
}

/** Resolve a specifier the way the bundler does, returning a repo-relative path. */
function resolveSpecifier(barrelPath: string, spec: string): string | null {
  const base = join(dirname(join(REPO_ROOT, barrelPath)), spec.replace(/\.js$/, ""));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) {
      return candidate.slice(REPO_ROOT.length + 1).replace(/\\/g, "/");
    }
  }
  return null;
}

describe("barrel imports are committed alongside the barrel", () => {
  const tracked = trackedFiles();

  for (const barrel of BARRELS) {
    it(`${barrel} references only tracked modules`, () => {
      const full = join(REPO_ROOT, barrel);
      expect(existsSync(full), `${barrel} is missing`).toBe(true);

      const specs = relativeSpecifiers(readFileSync(full, "utf8"));
      expect(specs.length).toBeGreaterThan(0);

      const unresolved: string[] = [];
      const untracked: string[] = [];

      for (const spec of specs) {
        const target = resolveSpecifier(barrel, spec);
        if (!target) { unresolved.push(spec); continue; }
        if (!tracked.has(target)) untracked.push(target);
      }

      expect(
        unresolved,
        `${barrel} imports specifiers that resolve to no file: ${unresolved.join(", ")}`,
      ).toEqual([]);

      expect(
        untracked,
        `${barrel} references files git does not know about. Committing the barrel `
          + `without them produces a commit that cannot build from a fresh clone. `
          + `Fix with:\n  git add ${untracked.join(" ")}`,
      ).toEqual([]);
    });
  }
});
