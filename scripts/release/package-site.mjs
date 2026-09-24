#!/usr/bin/env node
// Snapshot releases for the staging workspace, which has no git remote.
//
// Why snapshots rather than a patch: the repository stores files with CRLF and
// the workspace holds LF copies, so a `git diff` cannot apply there even when
// every file's content is exactly right. A snapshot compares content with
// carriage returns ignored, then writes only the files that really differ.
//
// Two file sets:
//   --set site     the marketing site and signup pages (artifacts/web-agency)
//   --set release  the API, dashboard and database package — the same set as
//                  package-release.mjs
//
// Two steps, so only what actually differs is transferred:
//
//   1. node scripts/release/package-site.mjs probe --set <set> --to <commit> [--out <dir>]
//      → probe-<set>-<tag>.mjs. Run it from ~/workspace. Read-only. Prints:
//          SNAPPROBE <set> <tag> need=<n> extra=<n> NEED:<index,...> EXTRA:<path|...>
//
//   2. node scripts/release/package-site.mjs pack --set <set> --to <commit> --need <index,...> [--extra <path|...>] [--out <dir>]
//      → snap-<set>-<tag>.b64 + apply-<set>-<tag>.mjs. In the workspace:
//          node apply-<set>-<tag>.mjs snap-<set>-<tag>.b64   write, remove stale source, verify, record
//          node apply-<set>-<tag>.mjs --verify-only          verify only
//
// Rules the applier enforces:
//   - Source text is written with LF.
//   - Migration SQL (lib/db/drizzle/**/*.sql) is written with the repository's
//     exact bytes and ONLY when missing. An existing migration file is never
//     rewritten: its bytes are what the migration journal hashed, and changing
//     them locks every migrate command (lib/db/MIGRATIONS.md §13).
//   - Stale files are removed only when they are source a build would compile.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const SETS = {
  site: {
    roots: [
      "artifacts/web-agency/src",
      "artifacts/web-agency/public",
      "artifacts/web-agency/index.html",
      "artifacts/web-agency/vite.config.ts",
      "artifacts/web-agency/package.json",
      "artifacts/web-agency/tsconfig.json",
    ],
    record: ".release/SITE.json",
  },
  release: {
    roots: [
      "artifacts/api-server/src",
      "artifacts/api-server/package.json",
      "artifacts/api-server/build.mjs",
      "artifacts/helpdesk/src",
      "artifacts/helpdesk/package.json",
      "artifacts/helpdesk/index.html",
      "artifacts/helpdesk/vite.config.ts",
      "lib/db/src",
      "lib/db/drizzle",
      "lib/db/push-packets",
      "lib/db/package.json",
      "pnpm-lock.yaml",
    ],
    record: ".release/SOURCE.json",
  },
};
// Compared with CR stripped.
const CMP_TEXT = /\.(ts|tsx|js|mjs|cjs|jsx|css|json|html|svg|md|txt|xml|webmanifest|yaml|yml|sql)$/i;
// Written with CR stripped. SQL is deliberately absent: it keeps repository bytes.
const WRITE_TEXT = /\.(ts|tsx|js|mjs|cjs|jsx|css|json|html|svg|md|txt|xml|webmanifest|yaml|yml)$/i;
const PROTECTED = /^lib\/db\/drizzle\/.+\.sql$/;
const REMOVABLE = /^(artifacts\/(web-agency|api-server|helpdesk)\/src|lib\/db\/src)\/.+\.(ts|tsx|css|mjs)$/;

const mode = process.argv[2];
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const setName = arg("set", "site");
const SET = SETS[setName];
if (!SET || !["probe", "pack"].includes(mode)) {
  console.error("usage: package-site.mjs probe|pack --set site|release --to <commit> ...");
  process.exit(2);
}
function git(args, buffer = false) {
  return execFileSync("git", args, { encoding: buffer ? undefined : "utf8", maxBuffer: 1024 * 1024 * 1024 });
}
const strip = (bytes) => Buffer.from(bytes.toString("latin1").replace(/\r/g, ""), "latin1");
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

const toSha = git(["rev-parse", `${arg("to", "HEAD")}^{commit}`]).trim();
const tag = toSha.slice(0, 12);
const out = resolve(arg("out", "."));
mkdirSync(out, { recursive: true });

git(["fetch", "origin", "--quiet"]);
if (git(["branch", "-r", "--contains", toSha]).trim() === "") {
  console.error(`refusing: ${tag} is not on any origin branch — push it first`);
  process.exit(1);
}

const paths = git(["ls-tree", "-r", "--name-only", toSha, "--", ...SET.roots]).split("\n").filter(Boolean).sort();
const blob = (p) => git(["show", `${toSha}:${p}`], true);
const hashes = paths.map((p) => {
  const b = blob(p);
  return sha(CMP_TEXT.test(p) ? strip(b) : b);
});
const manifestDigest = sha(JSON.stringify([paths, hashes]));

const shared = `
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const CMP_TEXT = ${CMP_TEXT.toString()};
const ROOTS = ${JSON.stringify(SET.roots)};
const PATHS = ${JSON.stringify(paths)};
const HASHES = ${JSON.stringify(hashes)};
const sha = (b) => createHash("sha256").update(b).digest("hex");
function fileSha(p) {
  const b = readFileSync(p);
  return sha(CMP_TEXT.test(p) ? Buffer.from(b.toString("latin1").replace(/\\r/g, ""), "latin1") : b);
}
function walk(p, acc) {
  if (!existsSync(p)) return acc;
  if (statSync(p).isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e), acc); } else acc.push(p);
  return acc;
}
function diff() {
  const need = [];
  PATHS.forEach((p, i) => { if (!existsSync(p) || fileSha(p) !== HASHES[i]) need.push(i); });
  const known = new Set(PATHS);
  const extra = ROOTS.flatMap((r) => walk(r, [])).filter((p) => !known.has(p) && !p.includes("/node_modules/") && !p.includes("/dist/"));
  return { need, extra };
}
`;

if (mode === "probe") {
  const probe = `#!/usr/bin/env node
// Generated by scripts/release/package-site.mjs probe (${setName}) — read-only.
${shared}
const { need, extra } = diff();
console.log("SNAPPROBE ${setName} ${tag} need=" + need.length + " extra=" + extra.length + " NEED:" + need.join(",") + " EXTRA:" + extra.join("|"));
`;
  const file = `probe-${setName}-${tag}.mjs`;
  writeFileSync(join(out, file), probe);
  console.log(JSON.stringify({ mode, set: setName, to: toSha, files: paths.length, manifestDigest: manifestDigest.slice(0, 16), file }, null, 2));
} else {
  const need = (arg("need", "") || "").split(",").filter(Boolean).map(Number);
  const extra = (arg("extra", "") || "").split("|").filter(Boolean);
  for (const i of need) if (!Number.isInteger(i) || i < 0 || i >= paths.length) throw new Error(`bad index ${i}`);
  const remove = extra.filter((p) => REMOVABLE.test(p));
  const kept = extra.filter((p) => !REMOVABLE.test(p));
  const files = {};
  for (const i of need) {
    const p = paths[i];
    const b = blob(p);
    files[p] = (WRITE_TEXT.test(p) ? strip(b) : b).toString("base64");
  }
  const payload = gzipSync(Buffer.from(JSON.stringify(files)), { level: 9 }).toString("base64");
  const payloadSha = sha(payload);
  const payloadFile = `snap-${setName}-${tag}.b64`;
  const applierFile = `apply-${setName}-${tag}.mjs`;
  writeFileSync(join(out, payloadFile), payload);
  const applier = `#!/usr/bin/env node
// Generated by scripts/release/package-site.mjs pack (${setName}) — do not edit.
// ${setName} ${tag}: ${need.length} file(s) to write, ${remove.length} stale source file(s) to remove, ${paths.length} verified.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";
${shared}
const PAYLOAD_SHA = ${JSON.stringify(payloadSha)};
const REMOVE = ${JSON.stringify(remove)};
const PROTECTED = ${PROTECTED.toString()};
if (!process.argv.includes("--verify-only")) {
  const payload = readFileSync(process.argv[2], "utf8").trim();
  if (sha(payload) !== PAYLOAD_SHA) { console.error("REFUSED payload hash mismatch"); process.exit(1); }
  const files = JSON.parse(gunzipSync(Buffer.from(payload, "base64")).toString("utf8"));
  const clash = Object.keys(files).filter((p) => PROTECTED.test(p) && existsSync(p));
  if (clash.length) {
    console.error("REFUSED would rewrite existing migration file(s) — their bytes are journal-hashed:");
    for (const p of clash) console.error("  " + p);
    process.exit(1);
  }
  for (const [p, b64] of Object.entries(files)) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, Buffer.from(b64, "base64"));
  }
  for (const p of REMOVE) if (existsSync(p)) rmSync(p);
  console.log("wrote " + Object.keys(files).length + ", removed " + REMOVE.length);
}
const { need } = diff();
if (need.length) {
  console.error("VERIFY FAILED " + need.length + " file(s):");
  for (const i of need.slice(0, 30)) console.error("  " + PATHS[i]);
  process.exit(1);
}
if (!process.argv.includes("--verify-only")) {
  mkdirSync(".release", { recursive: true });
  writeFileSync(${JSON.stringify(SET.record)}, JSON.stringify({ commit: ${JSON.stringify(toSha)}, set: ${JSON.stringify(setName)}, manifestDigest: ${JSON.stringify(manifestDigest)}, files: PATHS.length, recordedAt: new Date().toISOString() }, null, 2) + "\\n");
}
console.log("VERIFIED ${setName} ${tag}: " + PATHS.length + " files match commit ${toSha}");
`;
  writeFileSync(join(out, applierFile), applier);
  console.log(JSON.stringify({ mode, set: setName, to: toSha, write: need.length, remove, kept, payloadBytes: payload.length, payloadSha: payloadSha.slice(0, 16), files: [payloadFile, applierFile] }, null, 2));
}
