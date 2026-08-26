/**
 * AR-001M — the committed voice-boundary build matrix.
 *
 * Run via: pnpm --filter @workspace/scripts run test:voice-boundary:matrix
 *
 * What it is for. `artifacts/helpdesk/src/routes/voiceBoundaryContract.test.ts`
 * states what a helpdesk build may and may not contain, but it can only ever
 * see one `dist/` at a time. In the aggregate command it therefore asserts
 * whichever build happens to be lying around, and reports SKIP when there is
 * none — a gate that passes on an absent build proves nothing. AR-001J did
 * prove the boundary across every meaningful flag combination, but with a
 * session-only script that no longer exists; nothing committed reproduced it.
 *
 * This runner is that proof, committed. For each of the sixteen variants it
 *
 *   1. declares up front which build class the variant must produce,
 *   2. builds the helpdesk with exactly that variant's environment,
 *   3. runs the real contract against that build with strict mode on, and
 *   4. hashes the output so the expected byte-identity groups can be checked.
 *
 * It fails if a build fails, if built output is missing or empty, if any
 * section of the contract skips, if a build class is indeterminate or is not
 * the declared one, or if a byte-identity group disagrees.
 *
 * What it never does. No network request, no provider, no database, no
 * credential, no browser, no Replit. Every child process is started from an
 * argument array with an explicit environment in which all three voice flags
 * are controlled, so nothing can be inherited from the invoking shell.
 *
 * Where the output goes. Each build is written to a freshly created operating
 * system temporary directory and deleted as soon as it has been hashed and
 * checked; the `finally` below removes the whole working root even if a build
 * throws. Nothing is written into the worktree, and a pre-existing
 * `artifacts/helpdesk/dist` is neither read nor disturbed.
 *
 * Determinism. Builds are serial and never share an output directory, files
 * are hashed in sorted relative-path order, and two runs from a clean tree
 * produce identical per-variant digests.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "../..");
const helpdeskDir = path.join(repoRoot, "artifacts/helpdesk");
const boundaryTest = path.join(helpdeskDir, "src/routes/voiceBoundaryContract.test.ts");

/** The prefix the dashboard is actually served under — see CLAUDE.md. */
const CONFIGURED_PREFIX = "/ai-receptionist/dashboard";

type BuildClass = "gated-out" | "voice-enabled";

interface Variant {
  readonly name: string;
  readonly what: string;
  /** `null` leaves the variable unset for the child process. */
  readonly platform: string | null;
  readonly publish: string | null;
  readonly browserTest: string | null;
  readonly basePath: string;
  /** The class this variant must produce, declared rather than inferred. */
  readonly expect: BuildClass;
  /** Variants sharing a group must produce byte-identical output. */
  readonly group: string;
}

/**
 * The sixteen variants, in the order they are built. The order matters once:
 * the root-base build sits between the two configured-prefix all-enabled
 * builds, so the last variant proves the prefix build is restored exactly
 * rather than merely re-derived.
 *
 * Every flag is written down for every variant. The two documented endpoints
 * of the default class are kept apart deliberately — `m01` leaves all three
 * variables unset, `m02` sets all three to `"false"` — because "unset and
 * explicit false are the same build" is itself one of the properties tested.
 */
const MATRIX: readonly Variant[] = [
  {
    name: "m01_unset",
    what: "platform unset; subordinate flags unset",
    platform: null,
    publish: null,
    browserTest: null,
    basePath: CONFIGURED_PREFIX,
    expect: "gated-out",
    group: "default",
  },
  {
    name: "m02_all_false",
    what: 'all three flags explicitly "false"',
    platform: "false",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "gated-out",
    group: "default",
  },
  {
    name: "m03_one",
    what: 'platform "1" — a rejected spelling',
    platform: "1",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "gated-out",
    group: "default",
  },
  {
    name: "m04_yes",
    what: 'platform "yes" — a rejected spelling',
    platform: "yes",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "gated-out",
    group: "default",
  },
  {
    name: "m05_on",
    what: 'platform "on" — a rejected spelling',
    platform: "on",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "gated-out",
    group: "default",
  },
  {
    name: "m06_true1",
    what: 'platform "true1" — a malformed near-miss',
    platform: "true1",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "gated-out",
    group: "default",
  },
  {
    name: "m07_whitespace",
    what: "platform whitespace-only",
    platform: "   ",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "gated-out",
    group: "default",
  },
  {
    name: "m08_plat_true",
    what: 'platform "true"; subordinate flags false',
    platform: "true",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "voice-enabled",
    group: "platform-only",
  },
  {
    name: "m09_plat_TRUE",
    what: 'platform "TRUE"; subordinate flags false',
    platform: "TRUE",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "voice-enabled",
    group: "platform-only",
  },
  {
    name: "m10_plat_mixed",
    what: 'platform "TrUe" (mixed case); subordinate flags false',
    platform: "TrUe",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "voice-enabled",
    group: "platform-only",
  },
  {
    name: "m11_plat_spaced",
    what: 'platform "  true  " (padded); subordinate flags false',
    platform: "  true  ",
    publish: "false",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "voice-enabled",
    group: "platform-only",
  },
  {
    name: "m12_plat_pub",
    what: "platform plus publish",
    platform: "true",
    publish: "true",
    browserTest: "false",
    basePath: CONFIGURED_PREFIX,
    expect: "voice-enabled",
    group: "publish-only",
  },
  {
    name: "m13_plat_bt",
    what: "platform plus browser test",
    platform: "true",
    publish: "false",
    browserTest: "true",
    basePath: CONFIGURED_PREFIX,
    expect: "voice-enabled",
    group: "browser-test-only",
  },
  {
    name: "m14_all_prefix",
    what: "all three enabled, configured prefix",
    platform: "true",
    publish: "true",
    browserTest: "true",
    basePath: CONFIGURED_PREFIX,
    expect: "voice-enabled",
    group: "all-enabled-prefix",
  },
  {
    name: "m15_all_root",
    what: "all three enabled, root base",
    platform: "true",
    publish: "true",
    browserTest: "true",
    basePath: "/",
    expect: "voice-enabled",
    group: "all-enabled-root",
  },
  {
    name: "m16_prefix_restore",
    what: "all three enabled, configured prefix restored",
    platform: "true",
    publish: "true",
    browserTest: "true",
    basePath: CONFIGURED_PREFIX,
    expect: "voice-enabled",
    group: "all-enabled-prefix",
  },
];

/**
 * The runner's own regression proof. Naming a variant here corrupts the class
 * this runner declares to the contract, which strict mode then rejects — so
 * "a failing arm fails the whole run" is reproducible rather than merely
 * claimed. It can only ever make the gate fail; no value of it can make a
 * failing matrix pass.
 */
const injectFailure = process.env.AR001M_INJECT_FAILURE;

/**
 * Nothing about a voice build may be inherited. Every `VITE_` variable is
 * stripped — a stray public key or flag in a developer's shell would otherwise
 * be baked into the bundle and change the result — along with the declaration
 * variables this runner owns. `REPL_ID` goes too: `vite.config.ts` adds two
 * development-only plugins when it is present, which would make the output
 * depend on where the gate was run.
 */
function childEnv(declared: Record<string, string | null>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITE_") || key.startsWith("AR001J_") || key.startsWith("AR001M_")) {
      delete env[key];
    }
  }
  delete env.REPL_ID;
  delete env.BASE_PATH;
  for (const [key, value] of Object.entries(declared)) {
    if (value === null) delete env[key];
    else env[key] = value;
  }
  return env;
}

interface Outcome {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Argument-array execution only — no command string is ever interpolated. */
function runProcess(
  file: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Outcome {
  const result = spawnSync(file, [...args], {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? "", stderr: String(result.error.message) };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Every file under `dir`, hashed, in sorted relative-path order. */
function manifestOf(dir: string): { files: [string, string][]; digest: string } {
  const files: [string, string][] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const next = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else {
        files.push([
          next,
          createHash("sha256").update(readFileSync(path.join(dir, next))).digest("hex"),
        ]);
      }
    }
  };
  walk("");
  files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const aggregate = createHash("sha256");
  for (const [rel, hash] of files) aggregate.update(`${rel} ${hash}\n`);
  return { files, digest: aggregate.digest("hex") };
}

interface Result {
  readonly variant: Variant;
  readonly problems: string[];
  readonly resolvedClass: string;
  readonly checks: number;
  readonly builtOutputChecks: number;
  readonly skips: number;
  readonly digest: string;
  readonly files: [string, string][];
}

function summaryFields(stdout: string): Map<string, string> {
  const marker = "AR001M SUMMARY ";
  const line = stdout.split("\n").find((l) => l.startsWith(marker));
  const fields = new Map<string, string>();
  if (line === undefined) return fields;
  for (const token of line.slice(marker.length).trim().split(/\s+/)) {
    const at = token.indexOf("=");
    if (at > 0) fields.set(token.slice(0, at), token.slice(at + 1));
  }
  return fields;
}

const viteBin = ((): string => {
  const requireFromHelpdesk = createRequire(path.join(helpdeskDir, "package.json"));
  return path.join(path.dirname(requireFromHelpdesk.resolve("vite/package.json")), "bin/vite.js");
})();

const preflight: string[] = [];
if (MATRIX.length !== 16) preflight.push(`the matrix declares ${MATRIX.length} variants, not 16`);
if (new Set(MATRIX.map((v) => v.name)).size !== MATRIX.length) {
  preflight.push("two variants share a name");
}
if (!existsSync(viteBin)) preflight.push(`vite was not resolvable at ${viteBin}`);
if (!existsSync(boundaryTest)) preflight.push(`the boundary contract is missing at ${boundaryTest}`);
if (injectFailure !== undefined && !MATRIX.some((v) => v.name === injectFailure)) {
  preflight.push(`AR001M_INJECT_FAILURE names no such variant: ${injectFailure}`);
}
if (preflight.length > 0) {
  for (const problem of preflight) console.error(`AR-001M preflight failure: ${problem}`);
  process.exit(1);
}

if (injectFailure !== undefined) {
  console.log(
    `!! AR001M_INJECT_FAILURE=${injectFailure} — this run deliberately declares the wrong` +
      " build class for that variant and is expected to fail.",
  );
}

console.log(`AR-001M voice-boundary build matrix — ${MATRIX.length} variants`);
console.log(`  helpdesk : ${helpdeskDir}`);
console.log(`  vite     : ${viteBin}`);

const workRoot = mkdtempSync(path.join(os.tmpdir(), "ar001m-matrix-"));
console.log(`  builds   : ${workRoot} (removed when this run ends)`);

const results: Result[] = [];

try {
  for (const variant of MATRIX) {
    const variantRoot = path.join(workRoot, variant.name);
    const outDir = path.join(variantRoot, "public");
    const problems: string[] = [];
    console.log(`\n── ${variant.name} — ${variant.what}`);

    const started = Date.now();
    const build = runProcess(
      process.execPath,
      [viteBin, "build", "--config", "vite.config.ts", "--outDir", outDir, "--logLevel", "warn"],
      helpdeskDir,
      childEnv({
        VITE_VOICE_PLATFORM_ENABLED: variant.platform,
        VITE_VOICE_PUBLISH_ENABLED: variant.publish,
        VITE_VOICE_BROWSER_TEST_ENABLED: variant.browserTest,
        BASE_PATH: variant.basePath,
      }),
    );

    if (build.status !== 0) {
      problems.push(`the build exited ${build.status}`);
      console.log(build.stdout.trimEnd());
      console.error(build.stderr.trimEnd());
    } else if (!existsSync(path.join(outDir, "assets"))) {
      problems.push("the build produced no assets directory");
    }

    if (problems.length > 0) {
      for (const problem of problems) console.error(`  FAIL  ${variant.name}: ${problem}`);
      results.push({
        variant,
        problems,
        resolvedClass: "<not built>",
        checks: -1,
        builtOutputChecks: -1,
        skips: -1,
        digest: "<not built>",
        files: [],
      });
      rmSync(variantRoot, { recursive: true, force: true });
      continue;
    }

    const manifest = manifestOf(outDir);
    console.log(
      `  built in ${Date.now() - started} ms — ${manifest.files.length} files,` +
        ` digest ${manifest.digest.slice(0, 16)}`,
    );

    const declaredClass: string =
      injectFailure === variant.name
        ? variant.expect === "gated-out"
          ? "voice-enabled"
          : "gated-out"
        : variant.expect;

    const contract = runProcess(
      process.execPath,
      ["--import", "tsx", boundaryTest],
      scriptsDir,
      childEnv({
        AR001M_STRICT: "1",
        AR001M_VARIANT: variant.name,
        AR001M_DECLARED_CLASS: declaredClass,
        AR001M_DIST_DIR: outDir,
        AR001J_DECLARED: "1",
        AR001J_VITE_VOICE_PLATFORM_ENABLED: variant.platform,
        AR001J_VITE_VOICE_PUBLISH_ENABLED: variant.publish,
        AR001J_VITE_VOICE_BROWSER_TEST_ENABLED: variant.browserTest,
        AR001J_BASE_PATH: variant.basePath,
      }),
    );

    const fields = summaryFields(contract.stdout);
    const number = (key: string): number => Number(fields.get(key) ?? "-1");

    if (contract.status !== 0) problems.push(`the contract exited ${contract.status}`);
    if (fields.size === 0) {
      problems.push("the contract emitted no AR001M summary line");
    } else {
      if (fields.get("variant") !== variant.name) {
        problems.push(`the summary names variant ${fields.get("variant")}`);
      }
      if (fields.get("declaredClass") !== declaredClass) {
        problems.push(`the summary declares class ${fields.get("declaredClass")}`);
      }
      if (fields.get("class") !== variant.expect) {
        problems.push(`resolved class ${fields.get("class")}, expected ${variant.expect}`);
      }
      if (number("failures") !== 0) {
        problems.push(`${number("failures")} contract assertions failed`);
      }
      if (number("skips") !== 0) problems.push(`${number("skips")} contract sections skipped`);
      if (number("builtOutputChecks") <= 0) {
        problems.push("no built-output assertion ran against this build");
      }
    }

    const skipLines = contract.stdout.split("\n").filter((l) => /^\s*SKIP\s/.test(l));
    if (skipLines.length > 0) {
      problems.push(`${skipLines.length} SKIP line(s) in the contract output`);
    }

    if (problems.length > 0) {
      console.log(contract.stdout.trimEnd());
      if (contract.stderr.trim() !== "") console.error(contract.stderr.trimEnd());
      for (const problem of problems) console.error(`  FAIL  ${variant.name}: ${problem}`);
    } else {
      console.log(
        `  contract PASS — class ${fields.get("class")},` +
          ` ${number("checks")} checks (${number("builtOutputChecks")} built-output),` +
          ` ${number("skips")} skips`,
      );
    }

    results.push({
      variant,
      problems,
      resolvedClass: fields.get("class") ?? "<none>",
      checks: number("checks"),
      builtOutputChecks: number("builtOutputChecks"),
      skips: number("skips"),
      digest: manifest.digest,
      files: manifest.files,
    });

    rmSync(variantRoot, { recursive: true, force: true });
  }
} finally {
  rmSync(workRoot, { recursive: true, force: true });
}

// ─── Byte identity ─────────────────────────────────────────────────────────

const identityProblems: string[] = [];
const groups = new Map<string, Result[]>();
for (const result of results) {
  if (result.digest === "<not built>") continue;
  const members = groups.get(result.variant.group) ?? [];
  members.push(result);
  groups.set(result.variant.group, members);
}

console.log("\n── Byte-identity groups");
for (const [group, members] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const reference = members[0]!;
  const differing = members.filter((m) => m.digest !== reference.digest);
  if (differing.length === 0) {
    console.log(
      `  PASS  ${group}: ${members.map((m) => m.variant.name).join(", ")}` +
        ` all ${reference.digest.slice(0, 16)}`,
    );
    continue;
  }
  identityProblems.push(
    `${group} is not byte-identical: ${differing.map((m) => m.variant.name).join(", ")}` +
      ` differ from ${reference.variant.name}`,
  );
  for (const member of differing) {
    const byPath = new Map(reference.files);
    const changed = member.files.filter(([rel, hash]) => byPath.get(rel) !== hash).map(([rel]) => rel);
    const absent = reference.files
      .filter(([rel]) => !member.files.some(([other]) => other === rel))
      .map(([rel]) => rel);
    console.error(
      `  FAIL  ${group}: ${member.variant.name} differs from ${reference.variant.name}` +
        ` — changed/added ${JSON.stringify(changed)}, absent ${JSON.stringify(absent)}`,
    );
  }
}

/**
 * The groups must also differ from one another. Without this the identity
 * checks above would be satisfied by a build that ignored the flags entirely.
 */
const groupDigests = [...groups].map(([group, members]) => [group, members[0]!.digest] as const);
const distinct = new Set(groupDigests.map(([, digest]) => digest));
if (groupDigests.length > 0 && distinct.size !== groupDigests.length) {
  identityProblems.push(`two configurations produced the same bytes: ${JSON.stringify(groupDigests)}`);
  console.error("  FAIL  two distinct configurations produced identical output");
} else if (groupDigests.length > 0) {
  console.log(`  PASS  all ${groupDigests.length} configurations differ from one another`);
}

// ─── Report ────────────────────────────────────────────────────────────────

console.log("\n── AR-001M matrix result");
console.log(
  "  variant                what                                     class          checks  built  skips  result",
);
for (const result of results) {
  console.log(
    `  ${result.variant.name.padEnd(22)} ${result.variant.what.slice(0, 40).padEnd(40)}` +
      ` ${result.resolvedClass.padEnd(14)} ${String(result.checks).padStart(6)}` +
      ` ${String(result.builtOutputChecks).padStart(6)} ${String(result.skips).padStart(6)}` +
      `  ${result.problems.length === 0 ? "PASS" : "FAIL"}`,
  );
}

const failedVariants = results.filter((r) => r.problems.length > 0);
const missing = MATRIX.filter((v) => !results.some((r) => r.variant.name === v.name));

const totalBuiltOutputChecks = results.reduce((sum, r) => sum + Math.max(0, r.builtOutputChecks), 0);
const totalSkips = results.reduce((sum, r) => sum + Math.max(0, r.skips), 0);
console.log(
  `\n${results.length - failedVariants.length}/${MATRIX.length} variants passed,` +
    ` ${totalBuiltOutputChecks} built-output assertions, ${totalSkips} skips.`,
);

if (failedVariants.length > 0 || identityProblems.length > 0 || missing.length > 0) {
  console.error("\nAR-001M matrix FAILED:");
  for (const result of failedVariants) {
    for (const problem of result.problems) console.error(`  - ${result.variant.name}: ${problem}`);
  }
  for (const problem of identityProblems) console.error(`  - ${problem}`);
  for (const variant of missing) console.error(`  - ${variant.name}: the variant never ran`);
  process.exit(1);
}

console.log("AR-001M voice-boundary build matrix passed.");
