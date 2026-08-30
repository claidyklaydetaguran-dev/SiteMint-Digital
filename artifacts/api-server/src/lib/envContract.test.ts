// P9 — the environment contract: completeness against the source tree
// (every *_ENV_VAR constant must be registered — an undocumented variable
// cannot ship), flag-shape warnings, and fail-closed config probing.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { describeEnvContract, validateEnvContract } from "./envContract.js";

function collectEnvVarConstants(dir: string, found: Set<string>): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collectEnvVarConstants(path, found);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/_ENV_VAR\s*=\s*"([A-Z0-9_]+)"/g)) {
        found.add(match[1]!);
      }
    }
  }
}

describe("env contract", () => {
  it("registers every *_ENV_VAR constant declared in the source tree", () => {
    const declared = new Set<string>();
    collectEnvVarConstants(join(dirname(fileURLToPath(import.meta.url)), ".."), declared);
    expect(declared.size).toBeGreaterThan(30); // the scan itself must be finding things
    const registered = new Set(describeEnvContract().map((e) => e.name));
    const missing = [...declared].filter((name) => !registered.has(name)).sort();
    expect(missing, `unregistered env vars: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no duplicate names and a description for every entry", () => {
    const entries = describeEnvContract();
    expect(new Set(entries.map((e) => e.name)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.description.length, entry.name).toBeGreaterThan(10);
    }
  });

  it("a fully-defaulted environment validates clean", async () => {
    expect(await validateEnvContract({})).toEqual([]);
  });

  it("warns on flag values that silently do nothing", async () => {
    const findings = await validateEnvContract({ VOICE_PUBLISH_ENABLED: "TRUE", VOICE_SMS_ENABLED: "1" });
    expect(findings.map((f) => f.name).sort()).toEqual(["VOICE_PUBLISH_ENABLED", "VOICE_SMS_ENABLED"]);
    expect(findings.every((f) => f.level === "warning" && f.message.includes("leaves it OFF"))).toBe(true);
  });

  it("errors on fail-closed configs that would refuse at use time", async () => {
    const findings = await validateEnvContract({
      VOICE_CALL_POLICY_JSON: "not json",
      VOICE_ALERTS_ENABLED: "true", // enabled without key/from/to
      VOICE_BILLING_GRACE_DAYS: "0",
    });
    const byName = new Map(findings.map((f) => [f.name, f]));
    expect(byName.get("VOICE_CALL_POLICY_JSON")?.level).toBe("error");
    expect(byName.get("VOICE_ALERTS_ENABLED")?.level).toBe("error");
    expect(byName.get("VOICE_BILLING_GRACE_DAYS")?.level).toBe("error");
  });

  it("probes feature-owned configs only when their flag is on", async () => {
    // SMS config absent + flag off: the intended default, no finding.
    expect((await validateEnvContract({})).filter((f) => f.name.includes("TWILIO"))).toEqual([]);
    // Flag on without credentials: an error naming the refusal.
    const findings = await validateEnvContract({ VOICE_SMS_ENABLED: "true" });
    expect(findings.some((f) => f.name === "VOICE_TWILIO_ACCOUNT_SID" && f.level === "error")).toBe(true);
    // Tools attachment on without the server attachment: the P3 rule surfaces here too.
    const tools = await validateEnvContract({ VOICE_TOOLS_ATTACH_ENABLED: "true" });
    expect(tools.some((f) => f.name === "VOICE_TOOLS_ATTACH_ENABLED" && f.level === "error")).toBe(true);
  });
});
