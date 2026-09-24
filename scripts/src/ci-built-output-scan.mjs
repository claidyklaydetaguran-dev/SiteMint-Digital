// CI built-output boundary scan — run against the DISABLED helpdesk build.
//
// The source-level contract suite already proves the flag plumbing; this scan
// proves the artifact: a build produced with every VITE_VOICE_* flag false
// must contain no provider host, provider SDK marker, media-capture call, or
// voice-capability endpoint string. These exact probes were validated live
// against a real disabled staging build (AR-001AN: every count 0 across a
// 49-file dist) and against the 20-variant boundary matrix.
//
// Usage: node scripts/src/ci-built-output-scan.mjs <dist-dir>

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: ci-built-output-scan.mjs <dist-dir>");
  process.exit(2);
}

/** Forbidden in a disabled build. Keep in lockstep with voiceBoundaryContract. */
const FORBIDDEN = [
  { id: "vapi-api-host", re: /api\.vapi\.ai/ },
  { id: "vapi-sdk-pkg", re: /@vapi-ai/ },
  { id: "daily-transport", re: /daily\.co\b/ },
  { id: "media-capture", re: /getUserMedia/ },
  { id: "stripe-js-host", re: /js\.stripe\.com/ },
  { id: "twilio-marker", re: /twilio/i },
  { id: "browser-test-endpoint", re: /browser-test-session/ },
  { id: "sync-endpoint", re: /voice\/assistants\/[^"'`]*\/sync/ },
  { id: "server-key-name", re: /VAPI_API_KEY/ },
];

function walk(d, out = []) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let files;
try {
  files = walk(dir);
} catch (err) {
  console.error(`Built-output scan FAILED — cannot read ${dir}: ${err.message}`);
  process.exit(1);
}

// A missing or skeletal dist must fail loudly: a gate that "passes" on an
// absent build proves nothing (the AR-001M lesson).
if (files.length < 20) {
  console.error(`Built-output scan FAILED — only ${files.length} files in ${dir}; expected a full build (>=20).`);
  process.exit(1);
}

const findings = [];
for (const file of files) {
  if (/\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|map)$/i.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const probe of FORBIDDEN) {
    if (probe.re.test(text)) findings.push(`${probe.id}  ${file}`);
  }
}

if (findings.length > 0) {
  console.error("Built-output scan FAILED — disabled build leaks capability markers:");
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Built-output scan passed — ${files.length} files, ${FORBIDDEN.length} probes, 0 leaks.`);
