/**
 * Idempotently sets the Replit `.replit` deployment section for the
 * marketing server (release directive, 2026-09-07). Run inside the Replit
 * workspace: `node mkt/replit-deployment-config.mjs`.
 *
 *   [deployment]
 *   deploymentTarget = "autoscale"
 *   run = ["node", "mkt/marketing-server.mjs"]
 *
 * plus a port mapping 8080 -> 80 placed FIRST among [[ports]] (Autoscale waits
 * on the first localPort). Existing [deployment*] sections and any 8080/80
 * port block are replaced; everything else in .replit is kept byte-for-byte.
 * Also parks every artifacts/<x>/.replit-artifact directory so Replit does not
 * switch the deployment into monorepo "artifact mode". Safe to re-run.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = join(homedir(), "workspace", ".replit");
let text = existsSync(file) ? readFileSync(file, "utf8") : "";

// Drop existing [deployment] / [deployment.*] sections.
// (JS has no \Z; `(?![\s\S])` is the end-of-input anchor.)
const SECTION_END = /(?=^\[|(?![\s\S]))/.source;
text = text.replace(new RegExp(`^\\[deployment(\\.[^\\]]*)?\\][\\s\\S]*?${SECTION_END}`, "gm"), "");
// Drop an existing 8080 or 80 port block.
text = text.replace(new RegExp(`^\\[\\[ports\\]\\]\\s*\\n(?:(?!\\[\\[).*\\n)*?localPort = (8080|80)\\b[\\s\\S]*?${SECTION_END}`, "gm"), "");
text = text.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

// Replit Autoscale requires the app to open the FIRST localPort listed in
// .replit (a deployment whose server listens elsewhere fails at Promote
// with "failed to open a port in time"), so the 8080 -> 80 mapping must
// precede any workspace dev-port entries.
const portBlock = `[[ports]]
localPort = 8080
externalPort = 80

`;
const firstPorts = text.indexOf("[[ports]]");
text = firstPorts >= 0
  ? text.slice(0, firstPorts) + portBlock + text.slice(firstPorts)
  : text + "\n" + portBlock;

text = text.trimEnd() + `

[deployment]
deploymentTarget = "autoscale"
run = ["node", "mkt/marketing-server.mjs"]
`;
writeFileSync(file, text);

// Replit "artifact mode": while any artifacts/*/.replit-artifact/ directory
// exists, the deployment ignores [deployment].run and instead builds and
// starts every artifact service (api-server included). The marketing release
// must run only marketing-server.mjs, so those directories are parked as
// `.replit-artifact.off` (reversible: rename them back to re-enable).
const artifactsDir = join(homedir(), "workspace", "artifacts");
if (existsSync(artifactsDir)) {
  for (const name of readdirSync(artifactsDir)) {
    const src = join(artifactsDir, name, ".replit-artifact");
    if (!existsSync(src)) continue;
    if (existsSync(src + ".off")) { console.log(`ARTIFACT_PARK_SKIPPED ${name} (.off already present)`); continue; }
    renameSync(src, src + ".off");
    console.log(`ARTIFACT_PARKED ${name}`);
  }
}

console.log("DEPLOYMENT_CONFIG_WRITTEN");
console.log(text.split("\n").filter((l) => /^\[deployment\]|^deploymentTarget|^run = |^localPort = 8080|^externalPort = 80/.test(l)).join(" | "));
