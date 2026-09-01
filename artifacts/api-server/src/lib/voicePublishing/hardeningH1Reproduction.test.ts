// H1 PHASE 1 — reproduction.
//
// These tests exist to PROVE the three recorded defects before anything is
// changed, and to keep proving that the corrections stay in force afterwards.
// Each block states the defect, then asserts the corrected behaviour. Run
// against the pre-fix tree they fail; that failure is the reproduction.
//
// Nothing here contacts a provider, reads a real secret, or touches a
// database — every input is a literal fixture.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildVapiAssistantRequestBody } from "../voice/providers/vapi/mapper.js";
import { buildVoiceToolDefinitions } from "./toolsConfig.js";
import { loadVoiceServerConfigFromEnv } from "./serverConfig.js";
import { resolveCorsPolicy, isOriginAllowed } from "../corsPolicy.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

const ARTIFACT_PLAN = {
  recordingEnabled: false,
  videoRecordingEnabled: false,
  pcapEnabled: false,
  transcriptPlan: { enabled: false },
};

/** A credential id shaped like Vapi's, invented here — never a real one. */
const FIXTURE_CREDENTIAL_ID = "11111111-2222-4333-8444-555555555555";
const FIXTURE_URL = "https://example.test/api/voice/webhooks/vapi";

function runtimeConfigWithServer() {
  return {
    model: { provider: "openai", model: "gpt-4.1" },
    voice: { provider: "vapi", voiceId: "Elliot" },
    transcriber: { provider: "soniox", model: "stt-rt-v5", language: "en" },
    firstMessageMode: "assistant-speaks-first" as const,
    systemInstructions: "Act as a concise receptionist.",
    server: { url: FIXTURE_URL, credentialId: FIXTURE_CREDENTIAL_ID },
  };
}

// ── Defect 1: the publish payload selected bearer authentication ─────────────
//
// Before the fix, every emission site sent `server: { url, secret }`, where
// `secret` was the raw VAPI_WEBHOOK_SECRET. That did two harmful things at
// once: it told Vapi to use the bearer mechanism (which production forbids,
// and which carries no replay protection), and it shipped our own webhook
// HMAC secret into a provider payload where it would be stored.

describe("H1 defect 1 — assistant publish payload uses an HMAC credential, not a bearer secret", () => {
  it("emits server.credentialId and never server.secret", () => {
    const request = buildVapiAssistantRequestBody("Front Desk", runtimeConfigWithServer(), ARTIFACT_PLAN);
    const server = request.server as Record<string, unknown>;

    expect(server).toEqual({ url: FIXTURE_URL, credentialId: FIXTURE_CREDENTIAL_ID });
    expect(server).not.toHaveProperty("secret");
    expect(Object.keys(server).sort()).toEqual(["credentialId", "url"]);
  });

  it("puts no secret-shaped value anywhere in the serialized payload", () => {
    const request = buildVapiAssistantRequestBody("Front Desk", runtimeConfigWithServer(), ARTIFACT_PLAN);
    const serialized = JSON.stringify(request);

    expect(serialized).not.toContain('"secret"');
    expect(serialized).not.toContain("serverUrlSecret");
  });

  it("emits tool server blocks with the credential reference too", () => {
    const tools = buildVoiceToolDefinitions({ url: FIXTURE_URL, credentialId: FIXTURE_CREDENTIAL_ID });

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      const server = (tool as Record<string, unknown>).server as Record<string, unknown>;
      expect(server).toEqual({ url: FIXTURE_URL, credentialId: FIXTURE_CREDENTIAL_ID });
      expect(server).not.toHaveProperty("secret");
    }
    expect(JSON.stringify(tools)).not.toContain('"secret"');
  });

  it("never derives the provider payload from VAPI_WEBHOOK_SECRET", () => {
    const secret = "a-webhook-secret-that-must-never-be-sent";
    const config = loadVoiceServerConfigFromEnv({
      VOICE_WEBHOOK_ATTACH_ENABLED: "true",
      VOICE_SERVER_URL: FIXTURE_URL,
      VAPI_WEBHOOK_SECRET: secret,
      VAPI_WEBHOOK_CREDENTIAL_ID: FIXTURE_CREDENTIAL_ID,
    });

    expect(config).not.toBeNull();
    expect(JSON.stringify(config)).not.toContain(secret);
    expect(config).toEqual({ url: FIXTURE_URL, credentialId: FIXTURE_CREDENTIAL_ID });
  });
});

// ── Defect 2: .replit command-level env is not authoritative in Autoscale ────
//
// Verified live on 2026-09-01: adding an assignment to the staging
// `[deployment].run` command had no effect on the deployed process, which
// takes its environment from Secrets and `[userenv]` instead. The committed
// file must therefore never carry a `[deployment]`-level `run` that looks
// like it configures the runtime, because it silently would not.

describe("H1 defect 2 — .replit carries no misleading deployment env overlay", () => {
  const replit = readFileSync(resolve(REPO_ROOT, ".replit"), "utf8");

  function deploymentSection(source: string): string {
    const lines = source.split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim() === "[deployment]");
    if (start === -1) return "";
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => /^\s*\[/.test(l));
    return (end === -1 ? rest : rest.slice(0, end)).join("\n");
  }

  it("defines no run command in [deployment]", () => {
    expect(deploymentSection(replit)).not.toMatch(/^\s*run\s*=/m);
  });

  it("sets no capability flag inline in any run command", () => {
    // An inline `env NAME=value` prefix is exactly the pattern that was
    // silently ignored. Catch it wherever it appears, not only in
    // [deployment], so the mistake cannot reappear under another key.
    for (const line of replit.split(/\r?\n/)) {
      if (!/^\s*run\s*=/.test(line)) continue;
      expect(line).not.toMatch(/_ENABLED\s*=/);
      expect(line).not.toMatch(/\benv\s+[A-Z_]+=/);
    }
  });

  it("keeps non-secret shared settings in [userenv.shared], the mechanism Replit honours", () => {
    expect(replit).toMatch(/^\[userenv\.shared\]/m);
  });
});

// ── Defect 3: staging authorized a .replit.dev origin, not the deployed one ──
//
// The policy code was already correct; the configured value was not. These
// lock the intended allowlist behaviour for the deployed staging origin.

describe("H1 defect 3 — CORS authorizes the deployed staging origin only", () => {
  const DEPLOYED = "https://site-mint-voice-staging.replit.app";
  const DEV_HOST = "https://bf44211d-232c-467b-8ffa-ec16218ab00e-00-10sy12r7eocxz.pike.replit.dev";
  const HOSTILE = "https://sitemint-voice-staging.replit.app.attacker.test";

  const policy = resolveCorsPolicy({
    CORS_ALLOWED_ORIGINS: DEPLOYED,
    NODE_ENV: "production",
  });

  it("allows the deployed .replit.app origin", () => {
    expect(isOriginAllowed(DEPLOYED, policy)).toBe(true);
  });

  it("rejects the .replit.dev development origin once it is no longer listed", () => {
    expect(isOriginAllowed(DEV_HOST, policy)).toBe(false);
  });

  it("rejects a hostile origin that merely prefixes the approved host", () => {
    expect(isOriginAllowed(HOSTILE, policy)).toBe(false);
  });

  it("rejects loopback in production", () => {
    expect(isOriginAllowed("http://localhost:3000", policy)).toBe(false);
  });

  it("never contains a wildcard", () => {
    expect(policy.allowedOrigins).not.toContain("*");
    expect(policy.allowedOrigins).toEqual([DEPLOYED]);
  });
});
