/**
 * AR-001G — fail-closed admin authentication.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 *
 * No database, no network, no environment mutation: every case passes an
 * explicit environment object. The final block reads repository source files
 * from disk to prove the removed literal has not reappeared anywhere.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD_ENV_VAR,
  isAdminPasswordConfigured,
  verifyAdminPassword,
  type AdminPasswordEnv,
} from "./adminPassword.js";

// Synthetic, used only inside this file.
const SECRET = "correct-horse-battery-staple-9f2a";

function env(value?: string): AdminPasswordEnv {
  return value === undefined ? {} : { ADMIN_PASSWORD: value };
}

describe("admin password configuration", () => {
  it("reports unconfigured when the secret is absent", () => {
    expect(isAdminPasswordConfigured(env())).toBe(false);
    expect(verifyAdminPassword(SECRET, env())).toBe("unconfigured");
  });

  it("reports unconfigured when the secret is empty", () => {
    expect(isAdminPasswordConfigured(env(""))).toBe(false);
    expect(verifyAdminPassword("", env(""))).toBe("unconfigured");
  });

  it("never accepts an empty candidate against an empty secret", () => {
    // The dangerous shape this replaces: "" === "" would have authenticated.
    expect(verifyAdminPassword("", env(""))).not.toBe("match");
  });

  it("reports configured for an explicit secret", () => {
    expect(isAdminPasswordConfigured(env(SECRET))).toBe(true);
  });
});

describe("admin password verification", () => {
  it("accepts the correct explicit secret", () => {
    expect(verifyAdminPassword(SECRET, env(SECRET))).toBe("match");
  });

  it.each([
    ["a wrong password of equal length", "correct-horse-battery-staple-0000"],
    ["a shorter candidate", "correct"],
    ["a longer candidate", `${SECRET}-and-then-some-more-characters`],
    ["an empty candidate", ""],
    ["a single character", "x"],
    ["a case variation", SECRET.toUpperCase()],
    ["a trailing space", `${SECRET} `],
  ])("rejects %s", (_label, candidate) => {
    expect(verifyAdminPassword(candidate, env(SECRET))).toBe("mismatch");
  });

  it.each([
    ["a Unicode candidate", "пароль-пароль-пароль"],
    ["an emoji candidate", "🔐🔐🔐"],
    ["a combining-mark candidate", "ééé"],
    ["a lone surrogate", "\ud800"],
    ["an embedded NUL", "a\u0000b"],
  ])("rejects %s without throwing", (_label, candidate) => {
    expect(() => verifyAdminPassword(candidate, env(SECRET))).not.toThrow();
    expect(verifyAdminPassword(candidate, env(SECRET))).toBe("mismatch");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 12345],
    ["a boolean", true],
    ["an object", { toString: () => SECRET }],
    ["an array", [SECRET]],
  ])("rejects a malformed %s candidate", (_label, candidate) => {
    expect(() => verifyAdminPassword(candidate, env(SECRET))).not.toThrow();
    expect(verifyAdminPassword(candidate, env(SECRET))).toBe("mismatch");
  });

  it("accepts a Unicode secret when the candidate matches exactly", () => {
    const unicodeSecret = "пароль-🔐-9f2a";
    expect(verifyAdminPassword(unicodeSecret, env(unicodeSecret))).toBe("match");
  });

  it("yields exactly one of three verdicts and never leaks the secret", () => {
    const verdicts = new Set([
      verifyAdminPassword(SECRET, env()),
      verifyAdminPassword("nope", env(SECRET)),
      verifyAdminPassword(SECRET, env(SECRET)),
    ]);
    expect([...verdicts].sort()).toEqual(["match", "mismatch", "unconfigured"]);
    for (const verdict of verdicts) {
      expect(verdict).not.toContain(SECRET);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("no literal password fallback survives in source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, "..");

  function collectSourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) collectSourceFiles(full, out);
      else if (full.endsWith(".ts") || full.endsWith(".mts")) out.push(full);
    }
    return out;
  }

  // Split so this test file cannot itself match the scan it performs.
  const REMOVED_FALLBACK = ["sitemint", "2024"].join("");

  it("finds the removed literal in no api-server source file", () => {
    const offenders = collectSourceFiles(srcRoot).filter((file) =>
      readFileSync(file, "utf8").includes(REMOVED_FALLBACK),
    );
    expect(offenders).toEqual([]);
  });

  it("leaves no environment-variable OR-fallback on the admin login path", () => {
    const adminRoute = readFileSync(join(srcRoot, "routes", "admin.ts"), "utf8");
    // The exact defeated shape: `process.env.ADMIN_PASSWORD || "..."`.
    expect(adminRoute).not.toMatch(/ADMIN_PASSWORD\s*(\|\||\?\?)/);
    expect(adminRoute).toContain("verifyAdminPassword");
  });

  it("reads the secret in exactly one module", () => {
    const readers = collectSourceFiles(srcRoot).filter((file) => {
      if (file.endsWith("adminPassword.test.ts")) return false;
      return /process\.env(\.|\[")ADMIN_PASSWORD/.test(readFileSync(file, "utf8"));
    });
    expect(readers).toEqual([]);
    expect(readFileSync(join(srcRoot, "lib", "adminPassword.ts"), "utf8")).toContain(ADMIN_PASSWORD_ENV_VAR);
  });
});
