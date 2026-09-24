/**
 * AR-001G — server-owned Vapi artifact policy.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 *
 * Nothing here contacts Vapi. `fetch` is replaced for the whole file by a
 * local stub that records the outgoing request and answers from a script, so
 * the "exact provider request body" assertions below are made against the
 * bytes `VapiVoiceProvider` would actually have sent.
 *
 * Every field asserted was verified against the official Vapi types installed
 * in this workspace (`@vapi-ai/web` 2.6.1, `dist/api.d.ts`) — `ArtifactPlan`
 * (`recordingEnabled`, `videoRecordingEnabled`, `pcapEnabled`,
 * `transcriptPlan`) and `TranscriptPlan` (`enabled`). No field is invented.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { VoiceProviderError } from "../../errors.js";
import { createVapiProviderConfig } from "./config.js";
import { VapiVoiceProvider } from "./VapiVoiceProvider.js";
import { buildVapiAssistantRequestBody } from "./mapper.js";
import {
  VOICE_ARTIFACT_POLICIES,
  VOICE_ARTIFACT_POLICY_ENV_VAR,
  buildVapiArtifactPlan,
  isVoiceArtifactPolicy,
  loadVoiceArtifactPolicyFromEnv,
  parseVoiceArtifactPolicy,
  type VoiceArtifactPolicy,
} from "./artifactPolicy.js";

// ─── Local fetch stub ──────────────────────────────────────────────────────

interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
}

let captured: CapturedRequest[] = [];
let nextResponse: { status: number; body: string } | undefined;

const globalAny = globalThis as unknown as Record<string, unknown>;
let originalFetch: unknown;

function stubResponse(status: number, body: string): Response {
  return {
    status,
    headers: { get: (name: string) => (name === "content-length" ? String(body.length) : null) },
    text: async () => body,
  } as unknown as Response;
}

beforeAll(() => {
  originalFetch = globalAny["fetch"];
  globalAny["fetch"] = async (input: unknown, init: Record<string, unknown> = {}): Promise<Response> => {
    const rawBody = init["body"];
    captured.push({
      url: String(input),
      method: String(init["method"] ?? "GET"),
      body: typeof rawBody === "string" ? JSON.parse(rawBody) : undefined,
    });
    if (nextResponse === undefined) throw new Error("no scripted response queued");
    return stubResponse(nextResponse.status, nextResponse.body);
  };
});

afterAll(() => {
  if (originalFetch === undefined) delete globalAny["fetch"];
  else globalAny["fetch"] = originalFetch;
});

// ─── Environment isolation ─────────────────────────────────────────────────

let savedPolicy: string | undefined;

beforeEach(() => {
  savedPolicy = process.env[VOICE_ARTIFACT_POLICY_ENV_VAR];
  captured = [];
  nextResponse = undefined;
});

afterEach(() => {
  if (savedPolicy === undefined) delete process.env[VOICE_ARTIFACT_POLICY_ENV_VAR];
  else process.env[VOICE_ARTIFACT_POLICY_ENV_VAR] = savedPolicy;
});

// ─── Fixtures ──────────────────────────────────────────────────────────────

const RUNTIME_CONFIG = {
  model: { provider: "test-model-provider", model: "test-model" },
  voice: { provider: "test-voice-provider", voiceId: "test-voice" },
  transcriber: { provider: "test-transcriber-provider", model: "test-transcriber", language: "en" },
  firstMessageMode: "assistant-speaks-first" as const,
  firstMessage: "Thanks for calling.",
  systemInstructions: "Answer politely.",
};

const PROVIDER_RESPONSE = JSON.stringify({
  id: "assistant-test-1",
  name: "Front Desk",
  model: { provider: "test-model-provider", model: "test-model", messages: [] },
  voice: { provider: "test-voice-provider", voiceId: "test-voice" },
  transcriber: { provider: "test-transcriber-provider", language: "en" },
  createdAt: "2026-08-25T12:00:00.000Z",
  updatedAt: "2026-08-25T12:00:00.000Z",
});

function provider(): VapiVoiceProvider {
  return new VapiVoiceProvider(createVapiProviderConfig({ apiKey: "test-key-not-a-real-credential" }));
}

async function createWithPolicy(policy: string | undefined): Promise<CapturedRequest | undefined> {
  if (policy === undefined) delete process.env[VOICE_ARTIFACT_POLICY_ENV_VAR];
  else process.env[VOICE_ARTIFACT_POLICY_ENV_VAR] = policy;

  nextResponse = { status: 201, body: PROVIDER_RESPONSE };
  await provider().createAssistant({ name: "Front Desk", config: RUNTIME_CONFIG });
  return captured[0];
}

// ═══════════════════════════════════════════════════════════════════════════
describe("policy parsing", () => {
  it("defines exactly three policies", () => {
    expect([...VOICE_ARTIFACT_POLICIES]).toEqual(["none", "transcript_only", "full"]);
  });

  it.each(VOICE_ARTIFACT_POLICIES)("accepts the approved policy %s", (policy) => {
    expect(parseVoiceArtifactPolicy(policy)).toBe(policy);
    expect(isVoiceArtifactPolicy(policy)).toBe(true);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["a number", 1],
    ["an object", {}],
    ["an unknown name", "record-everything"],
    ["a near-miss", "non"],
    ["uppercase", "NONE"],
    ["mixed case", "None"],
    ["a plural", "nones"],
    ["a Vapi field name", "recordingEnabled"],
    ["a boolean-ish value", "false"],
  ])("rejects %s with no fallback", (_label, raw) => {
    expect(() => parseVoiceArtifactPolicy(raw)).toThrow(VoiceProviderError);
    expect(isVoiceArtifactPolicy(raw)).toBe(false);
  });

  it("never echoes the rejected value", () => {
    try {
      parseVoiceArtifactPolicy("secret-looking-value-sk_live_abc");
      throw new Error("expected a throw");
    } catch (err) {
      expect((err as Error).message).not.toContain("sk_live");
    }
  });

  it("reads the environment only when explicitly asked", () => {
    delete process.env[VOICE_ARTIFACT_POLICY_ENV_VAR];
    expect(() => loadVoiceArtifactPolicyFromEnv()).toThrow(VoiceProviderError);

    process.env[VOICE_ARTIFACT_POLICY_ENV_VAR] = "none";
    expect(loadVoiceArtifactPolicyFromEnv()).toBe("none");
  });

  it("classifies a missing policy as NOT_CONFIGURED", () => {
    try {
      parseVoiceArtifactPolicy(undefined);
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceProviderError);
      expect((err as VoiceProviderError).code).toBe("NOT_CONFIGURED");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("artifact plan construction", () => {
  it("disables recording and transcript retention under none", () => {
    expect(buildVapiArtifactPlan("none")).toEqual({
      recordingEnabled: false,
      videoRecordingEnabled: false,
      pcapEnabled: false,
      transcriptPlan: { enabled: false },
    });
  });

  it("keeps recording disabled under transcript_only", () => {
    expect(buildVapiArtifactPlan("transcript_only")).toEqual({
      recordingEnabled: false,
      videoRecordingEnabled: false,
      pcapEnabled: false,
      transcriptPlan: { enabled: true },
    });
  });

  it("enables recording and transcript only under full", () => {
    expect(buildVapiArtifactPlan("full")).toEqual({
      recordingEnabled: true,
      videoRecordingEnabled: false,
      pcapEnabled: false,
      transcriptPlan: { enabled: true },
    });
  });

  it.each(VOICE_ARTIFACT_POLICIES)("states every capture field explicitly under %s", (policy) => {
    const plan = buildVapiArtifactPlan(policy) as Record<string, unknown>;
    // No field may be left to a Vapi default: each is present and boolean.
    expect(typeof plan.recordingEnabled).toBe("boolean");
    expect(typeof plan.videoRecordingEnabled).toBe("boolean");
    expect(typeof plan.pcapEnabled).toBe("boolean");
    expect((plan.transcriptPlan as Record<string, unknown>).enabled).toBeTypeOf("boolean");
  });

  it("emits only fields present in the official Vapi ArtifactPlan", () => {
    const OFFICIAL_KEYS = new Set([
      "recordingEnabled",
      "videoRecordingEnabled",
      "pcapEnabled",
      "transcriptPlan",
    ]);
    for (const policy of VOICE_ARTIFACT_POLICIES) {
      for (const key of Object.keys(buildVapiArtifactPlan(policy))) {
        expect(OFFICIAL_KEYS.has(key), `${key} is not an allowlisted ArtifactPlan field`).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("exact provider request body", () => {
  it("sends the privacy-preserving payload under none", async () => {
    const request = await createWithPolicy("none");

    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("https://api.vapi.ai/assistant");
    expect(request?.body).toEqual({
      name: "Front Desk",
      model: {
        provider: "test-model-provider",
        model: "test-model",
        messages: [{ role: "system", content: "Answer politely." }],
      },
      voice: { provider: "test-voice-provider", voiceId: "test-voice" },
      transcriber: {
        provider: "test-transcriber-provider",
        model: "test-transcriber",
        language: "en",
      },
      artifactPlan: {
        recordingEnabled: false,
        videoRecordingEnabled: false,
        pcapEnabled: false,
        transcriptPlan: { enabled: false },
      },
      firstMessageMode: "assistant-speaks-first",
      firstMessage: "Thanks for calling.",
    });
  });

  it("records nothing and retains no transcript under none", async () => {
    const body = (await createWithPolicy("none"))?.body as Record<string, unknown>;
    const plan = body.artifactPlan as Record<string, unknown>;

    expect(plan.recordingEnabled).toBe(false);
    expect(plan.videoRecordingEnabled).toBe(false);
    expect((plan.transcriptPlan as Record<string, unknown>).enabled).toBe(false);
  });

  it("keeps the voice, model and transcriber configuration valid under none", async () => {
    const body = (await createWithPolicy("none"))?.body as Record<string, unknown>;

    // Disabling artifacts must not disable the assistant: a transcriber is
    // still configured, because real-time speech-to-text is how the assistant
    // hears the caller at all.
    expect(body.transcriber).toEqual({
      provider: "test-transcriber-provider",
      model: "test-transcriber",
      language: "en",
    });
    expect(body.voice).toEqual({ provider: "test-voice-provider", voiceId: "test-voice" });
    expect((body.model as Record<string, unknown>).model).toBe("test-model");
  });

  it("carries no phone number, server URL, credential, squad, workflow or tool", async () => {
    const body = (await createWithPolicy("none"))?.body as Record<string, unknown>;

    for (const forbidden of [
      "phoneNumber",
      "phoneNumberId",
      "server",
      "serverUrl",
      "serverUrlSecret",
      "credentialId",
      "credentialIds",
      "credentials",
      "squad",
      "squadId",
      "workflow",
      "workflowId",
      "tools",
      "toolIds",
      "hooks",
      "metadata",
    ]) {
      expect(body, `${forbidden} must not be sent`).not.toHaveProperty(forbidden);
    }
  });

  it("sends exactly the allowlisted top-level fields and nothing else", async () => {
    const body = (await createWithPolicy("none"))?.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["artifactPlan", "firstMessage", "firstMessageMode", "model", "name", "transcriber", "voice"].sort(),
    );
  });

  it("never sends the API key in the body", async () => {
    const request = await createWithPolicy("none");
    expect(JSON.stringify(request?.body)).not.toContain("test-key-not-a-real-credential");
  });

  it("sends the transcript-enabled plan under transcript_only", async () => {
    const body = (await createWithPolicy("transcript_only"))?.body as Record<string, unknown>;
    expect(body.artifactPlan).toEqual({
      recordingEnabled: false,
      videoRecordingEnabled: false,
      pcapEnabled: false,
      transcriptPlan: { enabled: true },
    });
  });

  it("sends the recording-enabled plan under full", async () => {
    const body = (await createWithPolicy("full"))?.body as Record<string, unknown>;
    expect(body.artifactPlan).toEqual({
      recordingEnabled: true,
      videoRecordingEnabled: false,
      pcapEnabled: false,
      transcriptPlan: { enabled: true },
    });
  });

  it("applies the same plan on update", async () => {
    process.env[VOICE_ARTIFACT_POLICY_ENV_VAR] = "none";
    nextResponse = { status: 200, body: PROVIDER_RESPONSE };
    await provider().updateAssistant("assistant-test-1", { name: "Front Desk", config: RUNTIME_CONFIG });

    const body = captured[0]?.body as Record<string, unknown>;
    expect(captured[0]?.method).toBe("PATCH");
    expect((body.artifactPlan as Record<string, unknown>).recordingEnabled).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("fail-closed before any provider request", () => {
  it("makes no request when the policy is missing", async () => {
    delete process.env[VOICE_ARTIFACT_POLICY_ENV_VAR];
    await expect(provider().createAssistant({ name: "Front Desk", config: RUNTIME_CONFIG })).rejects.toThrow(
      VoiceProviderError,
    );
    expect(captured).toHaveLength(0);
  });

  it("makes no request when the policy is invalid", async () => {
    process.env[VOICE_ARTIFACT_POLICY_ENV_VAR] = "everything-please";
    await expect(provider().createAssistant({ name: "Front Desk", config: RUNTIME_CONFIG })).rejects.toThrow(
      VoiceProviderError,
    );
    expect(captured).toHaveLength(0);
  });

  it("makes no update request when the policy is missing", async () => {
    delete process.env[VOICE_ARTIFACT_POLICY_ENV_VAR];
    await expect(
      provider().updateAssistant("assistant-test-1", { name: "Front Desk", config: RUNTIME_CONFIG }),
    ).rejects.toThrow(VoiceProviderError);
    expect(captured).toHaveLength(0);
  });

  it("still allows deletion without an artifact policy", async () => {
    // Cleanup (AR-001C/AR-001E) must not acquire a new configuration
    // dependency: an operator removing a staging assistant has no artifact
    // policy to set, and this path never creates anything.
    delete process.env[VOICE_ARTIFACT_POLICY_ENV_VAR];
    nextResponse = { status: 200, body: JSON.stringify({ id: "assistant-test-1" }) };

    await expect(provider().deleteAssistant("assistant-test-1")).resolves.toEqual({
      providerAssistantId: "assistant-test-1",
      deleted: true,
    });
    expect(captured[0]?.method).toBe("DELETE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("the policy is server-owned and cannot be overridden", () => {
  it("ignores an artifactPlan supplied alongside the runtime config", async () => {
    process.env[VOICE_ARTIFACT_POLICY_ENV_VAR] = "none";
    nextResponse = { status: 201, body: PROVIDER_RESPONSE };

    // A caller-supplied artifactPlan is not an allowlisted runtime-config key,
    // so the strict validator rejects the whole request rather than merging it.
    await expect(
      provider().createAssistant({
        name: "Front Desk",
        config: { ...RUNTIME_CONFIG, artifactPlan: { recordingEnabled: true } },
      }),
    ).rejects.toThrow(VoiceProviderError);
    expect(captured).toHaveLength(0);
  });

  it.each(["recordingEnabled", "transcriptPlan", "artifactPolicy", "VOICE_ARTIFACT_POLICY"])(
    "rejects a runtime config carrying %s",
    async (key) => {
      process.env[VOICE_ARTIFACT_POLICY_ENV_VAR] = "none";
      nextResponse = { status: 201, body: PROVIDER_RESPONSE };

      await expect(
        provider().createAssistant({
          name: "Front Desk",
          config: { ...RUNTIME_CONFIG, [key]: true },
        }),
      ).rejects.toThrow(VoiceProviderError);
      expect(captured).toHaveLength(0);
    },
  );

  it("takes the plan from the policy, never from the mapper's caller data", () => {
    // The mapper receives the plan as a separate argument, so no field of the
    // runtime config can reach `artifactPlan`.
    const body = buildVapiAssistantRequestBody("Front Desk", RUNTIME_CONFIG, buildVapiArtifactPlan("none"));
    expect(body.artifactPlan).toEqual(buildVapiArtifactPlan("none"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("no implicit default survives in source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const mapperSource = readFileSync(join(here, "mapper.ts"), "utf8");
  const policySource = readFileSync(join(here, "artifactPolicy.ts"), "utf8");
  const providerSource = readFileSync(join(here, "VapiVoiceProvider.ts"), "utf8");

  it("makes the artifact plan a required mapper argument", () => {
    // An optional parameter would let a caller omit it and inherit Vapi's
    // permissive defaults. It must not be `artifactPlan?:`.
    expect(mapperSource).toMatch(/artifactPlan:\s*JsonObject/);
    expect(mapperSource).not.toMatch(/artifactPlan\?\s*:/);
  });

  it("gives the policy no default value anywhere", () => {
    expect(policySource).not.toMatch(/=\s*["']none["']/);
    expect(policySource).not.toMatch(/\?\?\s*["'](none|transcript_only|full)["']/);
    expect(policySource).not.toMatch(/\|\|\s*["'](none|transcript_only|full)["']/);
  });

  it("resolves the policy on every create and update path", () => {
    const resolveCalls = providerSource.match(/this\.resolveArtifactPlan\(\)/g) ?? [];
    expect(resolveCalls).toHaveLength(2);
  });

  it("spreads no caller-supplied object into the request body", () => {
    expect(mapperSource).not.toMatch(/\.\.\.\s*config\s*[,}]/);
    expect(mapperSource).not.toMatch(/\.\.\.\s*raw\s*[,}]/);
  });

  it("names a policy value in no default-bearing position in the provider", () => {
    expect(providerSource).not.toContain("VOICE_ARTIFACT_POLICY =");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("browser test eligibility is unchanged", () => {
  it("leaves publish success semantics untouched", async () => {
    process.env[VOICE_ARTIFACT_POLICY_ENV_VAR] = "none";
    nextResponse = { status: 201, body: PROVIDER_RESPONSE };

    const result = await provider().createAssistant({ name: "Front Desk", config: RUNTIME_CONFIG });

    // A published assistant still yields a provider id, which is the only
    // thing the browser test path needs in order to start a web call.
    expect(result.providerAssistantId).toBe("assistant-test-1");
    expect(result.provider).toBe("vapi");
  });

  it("declares no policy that would block a web call", () => {
    const plan = buildVapiArtifactPlan("none") as Record<string, unknown>;
    // `videoRecordingEnabled` is the only web-call-specific artifact field and
    // it is off; nothing here restricts call transport.
    expect(plan).not.toHaveProperty("transport");
    expect(plan).not.toHaveProperty("phoneNumberId");
  });
});

// A compile-time reminder that the policy union is exhaustive: adding a
// fourth policy without extending buildVapiArtifactPlan would fail here.
const _exhaustive: Record<VoiceArtifactPolicy, unknown> = {
  none: buildVapiArtifactPlan("none"),
  transcript_only: buildVapiArtifactPlan("transcript_only"),
  full: buildVapiArtifactPlan("full"),
};
void _exhaustive;
