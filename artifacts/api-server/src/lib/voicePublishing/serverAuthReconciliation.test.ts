// H1 — reconciliation must be able to tell an HMAC credential attachment
// apart from a bearer one, and the stored digest must carry no credential.
//
// The sync path is digest-driven: it re-sends only when the payload it would
// build no longer hashes to what the provider last accepted. So "reconciliation
// distinguishes HMAC from bearer" concretely means the two produce different
// digests — otherwise an assistant left on bearer would match and never be
// corrected.

import { describe, expect, it } from "vitest";
import {
  classifyServerAuthMode,
  computeProviderPayloadHash,
  PROVIDER_PAYLOAD_HASH_VERSION,
} from "./providerPayloadHash.js";
import type { VoiceAssistantInput } from "../voice/types.js";

const URL_A = "https://staging.example.com/api/voice/webhooks/vapi";
const URL_B = "https://staging.example.com/api/voice/webhooks/other";
const CRED_A = "11111111-2222-4333-8444-555555555555";
const CRED_B = "99999999-8888-4777-8666-555555555555";
const BEARER_SECRET = "webhook-secret-0123456789abcdef";

function inputWithServer(server: Record<string, unknown> | undefined): VoiceAssistantInput {
  return {
    name: "Front Desk",
    config: {
      model: { provider: "openai", model: "gpt-4.1" },
      voice: { provider: "vapi", voiceId: "Elliot" },
      transcriber: { provider: "soniox" },
      firstMessageMode: "assistant-speaks-first",
      systemInstructions: "Act as a concise receptionist.",
      ...(server !== undefined ? { server } : {}),
    },
  } as unknown as VoiceAssistantInput;
}

describe("classifyServerAuthMode", () => {
  it("names an HMAC credential attachment", () => {
    expect(classifyServerAuthMode({ url: URL_A, credentialId: CRED_A })).toBe("hmac_credential");
  });

  it("names a bearer attachment", () => {
    expect(classifyServerAuthMode({ url: URL_A, secret: BEARER_SECRET })).toBe("bearer_secret");
  });

  it("treats an absent, empty, or non-object block as no attachment", () => {
    expect(classifyServerAuthMode(undefined)).toBe("none");
    expect(classifyServerAuthMode(null)).toBe("none");
    expect(classifyServerAuthMode({})).toBe("none");
    expect(classifyServerAuthMode({ url: URL_A })).toBe("none");
    expect(classifyServerAuthMode({ url: URL_A, credentialId: "" })).toBe("none");
    expect(classifyServerAuthMode("not-an-object")).toBe("none");
    expect(classifyServerAuthMode([{ credentialId: CRED_A }])).toBe("none");
  });

  it("prefers the credential when a payload somehow carries both", () => {
    expect(classifyServerAuthMode({ url: URL_A, credentialId: CRED_A, secret: BEARER_SECRET })).toBe(
      "hmac_credential",
    );
  });
});

describe("provider payload hash — server block handling", () => {
  it("hashes a bearer attachment differently from an HMAC one, so drift is detected", () => {
    const bearer = computeProviderPayloadHash(inputWithServer({ url: URL_A, secret: BEARER_SECRET }), "none");
    const hmac = computeProviderPayloadHash(inputWithServer({ url: URL_A, credentialId: CRED_A }), "none");

    expect(bearer).not.toBe(hmac);
  });

  it("carries no credential and no secret into the digest input", () => {
    // The digest is one-way, so assert on the property that matters: two
    // payloads differing ONLY by a secret whose auth mode is the same still
    // hash the same, because the secret is never part of the hashed shape.
    const one = computeProviderPayloadHash(inputWithServer({ url: URL_A, secret: "secret-one-0123456789" }), "none");
    const two = computeProviderPayloadHash(inputWithServer({ url: URL_A, secret: "secret-two-0123456789" }), "none");

    expect(one).toBe(two);
  });

  it("still moves when the credential is rotated", () => {
    const a = computeProviderPayloadHash(inputWithServer({ url: URL_A, credentialId: CRED_A }), "none");
    const b = computeProviderPayloadHash(inputWithServer({ url: URL_A, credentialId: CRED_B }), "none");

    expect(a).not.toBe(b);
  });

  it("still moves when the server URL changes", () => {
    const a = computeProviderPayloadHash(inputWithServer({ url: URL_A, credentialId: CRED_A }), "none");
    const b = computeProviderPayloadHash(inputWithServer({ url: URL_B, credentialId: CRED_A }), "none");

    expect(a).not.toBe(b);
  });

  it("distinguishes an attachment from no attachment at all", () => {
    const none = computeProviderPayloadHash(inputWithServer(undefined), "none");
    const attached = computeProviderPayloadHash(inputWithServer({ url: URL_A, credentialId: CRED_A }), "none");

    expect(none).not.toBe(attached);
  });

  it("is pinned at version 2, the bump that forces one re-sync off bearer", () => {
    // A previously-synced assistant stored a v1 digest. Any v1 digest differs
    // from the v2 digest of the same payload, so the next sync re-sends rather
    // than matching and leaving bearer in place at the provider.
    expect(PROVIDER_PAYLOAD_HASH_VERSION).toBe(2);
  });

  it("remains a stable 64-char lowercase hex digest", () => {
    const digest = computeProviderPayloadHash(inputWithServer({ url: URL_A, credentialId: CRED_A }), "none");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(computeProviderPayloadHash(inputWithServer({ url: URL_A, credentialId: CRED_A }), "none"));
  });
});
