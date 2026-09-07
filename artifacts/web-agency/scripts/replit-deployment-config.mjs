/**
 * Idempotently sets the Replit `.replit` deployment section for the
 * marketing server (release directive, 2026-09-07). Run inside the Replit
 * workspace: `node mkt/replit-deployment-config.mjs`.
 *
 *   [deployment]
 *   deploymentTarget = "autoscale"
 *   run = ["node", "mkt/marketing-server.mjs"]
 *
 * plus a port mapping 8080 -> 80. Existing [deployment*] sections and any
 * 8080/80 port block are replaced; everything else in .replit is kept
 * byte-for-byte. Safe to re-run.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = join(homedir(), "workspace", ".replit");
let text = existsSync(file) ? readFileSync(file, "utf8") : "";

// Drop existing [deployment] / [deployment.*] sections.
text = text.replace(/^\[deployment(\.[^\]]*)?\][\s\S]*?(?=^\[|\Z)/gm, "");
// Drop an existing 8080 or 80 port block.
text = text.replace(/^\[\[ports\]\]\s*\n(?:(?!\[\[).*\n)*?localPort = (8080|80)\b[\s\S]*?(?=^\[|\Z)/gm, "");
text = text.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

text += `
[deployment]
deploymentTarget = "autoscale"
run = ["node", "mkt/marketing-server.mjs"]

[[ports]]
localPort = 8080
externalPort = 80
`;
writeFileSync(file, text);
console.log("DEPLOYMENT_CONFIG_WRITTEN");
console.log(text.split("\n").filter((l) => /^\[deployment\]|^deploymentTarget|^run = |^localPort = 8080|^externalPort = 80/.test(l)).join(" | "));
