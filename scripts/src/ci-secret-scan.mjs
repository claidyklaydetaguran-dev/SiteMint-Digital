// CI secret scan — fails the build when a tracked text file contains a
// high-signal credential literal that is not on the explicit allowlist.
//
// Philosophy: narrow patterns, exact allowlist, zero tolerance for new hits.
// A broad fuzzy scanner trains people to ignore red; this one only fires on
// strings that are almost certainly a real credential, and every allowlisted
// entry below names the file and the reason it is provably synthetic.
//
// Dependency-free by design (node:child_process + node:fs only) so the scan
// itself cannot become a supply-chain vector.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Extensions that are binary or vendored — never scanned. */
const SKIP_EXT =
  /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|eot|pdf|zip|gz|br|mp[34]|svg)$/i;
const SKIP_PATH = /^(pnpm-lock\.yaml$)/;

/**
 * Each rule: id, regex, and an allowlist of exact repo paths where matches are
 * known-synthetic fixtures (redaction tests, never-connect URLs, local dev
 * signing keys). A match in any other file fails CI.
 */
const RULES = [
  {
    id: "postgres-url-with-password",
    re: /postgres(?:ql)?:\/\/[A-Za-z0-9_.-]+:[^@\s'"`$*{]+@/g,
    allow: new Set([
      // §7 redaction fixture: proves connection details never reach logs.
      "lib/db/migrateFreshStateContract.test.ts",
      // Dummy URL pointing at port 1 — can never connect; used to prove the
      // legacy suite touches no database.
      "artifacts/api-server/test/discoveryLegacyRoute.test.ts",
      "scripts/src/run-legacy-api-tests.ts",
      // P9 guard fixtures: percent-encoded synthetic credentials ("se%3Acret")
      // proving the URL->PG* decomposition and the drill-target refusal
      // matrix. No real host or password appears.
      "lib/db/deployRecoveryContract.test.ts",
      // ci:ci on a job-scoped throwaway Postgres service container that holds
      // no data and dies with the CI job. Caught by this scanner's own first
      // real run — allowlisted rather than weakening the rule.
      ".github/workflows/ci.yml",
    ]),
  },
  {
    id: "stripe-secret-literal",
    re: /\b(?:sk_live_|rk_live_|whsec_)[A-Za-z0-9]{8,}/g,
    allow: new Set([
      // Redaction-proof fixtures literally named MUST_NOT_APPEAR.
      "artifacts/api-server/src/lib/stripeBootSync.test.ts",
      // parseVoiceArtifactPolicy fixture proving rejected values aren't echoed.
      "artifacts/api-server/src/lib/voice/providers/vapi/artifactPolicy.test.ts",
      // Self-describing local dev signing key ("..._local_dev_signing_key_for_ci").
      ".replit",
    ]),
  },
  {
    id: "openai-key-literal",
    re: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    allow: new Set([
      // FAKE_KEY fixture for the OpenAI-unavailable path.
      "artifacts/api-server/src/lib/openAiUnavailable.test.ts",
    ]),
  },
  { id: "github-token", re: /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{20,}\b|github_pat_[A-Za-z0-9_]{20,}/g, allow: new Set() },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/g, allow: new Set() },
  { id: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, allow: new Set() },
  { id: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/g, allow: new Set() },
  { id: "twilio-account-sid", re: /\bAC[0-9a-fA-F]{32}\b/g, allow: new Set() },
];

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => f && !SKIP_EXT.test(f) && !SKIP_PATH.test(f));

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // unreadable → not a text leak vector via this scan
  }
  if (text.includes("\u0000")) continue; // NUL byte => binary despite extension
  for (const rule of RULES) {
    if (rule.allow.has(file)) continue;
    rule.re.lastIndex = 0;
    const m = rule.re.exec(text);
    if (m) {
      const line = text.slice(0, m.index).split("\n").length;
      // Never print the matched value — only its location and rule id.
      findings.push(`${rule.id}  ${file}:${line}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Secret scan FAILED — high-signal credential literal(s) found:");
  for (const f of findings) console.error(`  - ${f}`);
  console.error(
    "\nIf a hit is a provably synthetic fixture, add the exact path to the rule's allowlist with a justification comment.",
  );
  process.exit(1);
}
console.log(`Secret scan passed — ${files.length} tracked files, ${RULES.length} rules, 0 findings.`);
