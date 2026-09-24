import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyVapiWebhookSignature } from "./vapiWebhookAuth.js";

const SECRET = "test-only-webhook-secret-not-a-real-credential";

function sign(secret: string, timestampSec: number, rawBody: Buffer): string {
  return createHmac("sha256", secret).update(String(timestampSec)).update(".").update(rawBody).digest("hex");
}

function fixedNow(nowSec: number) {
  return () => nowSec * 1000;
}

describe("verifyVapiWebhookSignature", () => {
  const body = Buffer.from(JSON.stringify({ message: { type: "status-update" } }));
  const nowSec = 1_800_000_000;

  it("accepts a validly signed request within the timestamp window", () => {
    const timestamp = String(nowSec);
    const signature = sign(SECRET, nowSec, body);
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: signature,
      timestampHeader: timestamp,
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when the webhook secret is not configured", () => {
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: "anything",
      timestampHeader: String(nowSec),
      secret: undefined,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("rejects a request with no signature header", () => {
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: undefined,
      timestampHeader: String(nowSec),
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("rejects a request with no timestamp header", () => {
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: sign(SECRET, nowSec, body),
      timestampHeader: undefined,
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "missing_timestamp" });
  });

  it("rejects a non-numeric timestamp", () => {
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: sign(SECRET, nowSec, body),
      timestampHeader: "not-a-number",
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "invalid_timestamp" });
  });

  it("rejects a timestamp far outside the tolerance window (replay attempt)", () => {
    const staleTimestamp = nowSec - 10_000;
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: sign(SECRET, staleTimestamp, body),
      timestampHeader: String(staleTimestamp),
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "timestamp_out_of_range" });
  });

  // Regression: Vapi sends x-vapi-timestamp in Unix MILLISECONDS. Verified
  // 2026-09-01 from the provider-side webhook log of a live staging call,
  // which recorded a 13-digit header value next to the matching signature.
  // Reading it as seconds rejected every real delivery as out of range, so
  // the entire provider webhook path failed closed.
  it("accepts a millisecond timestamp, the unit Vapi actually sends", () => {
    const timestampMs = String(nowSec * 1000);
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      // Signed over the raw header string, exactly as Vapi does.
      signatureHeader: createHmac("sha256", SECRET).update(timestampMs).update(".").update(body).digest("hex"),
      timestampHeader: timestampMs,
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: true });
  });

  it("still rejects a stale millisecond timestamp (replay in the real unit)", () => {
    const staleMs = String((nowSec - 10_000) * 1000);
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: createHmac("sha256", SECRET).update(staleMs).update(".").update(body).digest("hex"),
      timestampHeader: staleMs,
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "timestamp_out_of_range" });
  });

  it("rejects a millisecond timestamp just outside the tolerance window", () => {
    const justStaleMs = String((nowSec - 301) * 1000);
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: createHmac("sha256", SECRET).update(justStaleMs).update(".").update(body).digest("hex"),
      timestampHeader: justStaleMs,
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "timestamp_out_of_range" });
  });

  it("accepts a millisecond timestamp just inside the tolerance window", () => {
    const justFreshMs = String((nowSec - 299) * 1000);
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: createHmac("sha256", SECRET).update(justFreshMs).update(".").update(body).digest("hex"),
      timestampHeader: justFreshMs,
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: true });
  });

  // Widening to two units must not weaken tampering detection: the signature
  // still covers the body, whichever unit the timestamp is expressed in.
  it("rejects a tampered body even with a fresh millisecond timestamp", () => {
    const timestampMs = String(nowSec * 1000);
    const result = verifyVapiWebhookSignature({
      rawBody: Buffer.from(JSON.stringify({ message: { type: "end-of-call-report" } })),
      signatureHeader: createHmac("sha256", SECRET).update(timestampMs).update(".").update(body).digest("hex"),
      timestampHeader: timestampMs,
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a signature computed with the wrong secret", () => {
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: sign("wrong-secret", nowSec, body),
      timestampHeader: String(nowSec),
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a signature computed over different body bytes (tamper detection)", () => {
    const tamperedBody = Buffer.from(JSON.stringify({ message: { type: "end-of-call-report" } }));
    const result = verifyVapiWebhookSignature({
      rawBody: tamperedBody,
      signatureHeader: sign(SECRET, nowSec, body),
      timestampHeader: String(nowSec),
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a signature of the wrong length without throwing", () => {
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: "abcd",
      timestampHeader: String(nowSec),
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("is case-insensitive on the hex signature", () => {
    const signature = sign(SECRET, nowSec, body).toUpperCase();
    const result = verifyVapiWebhookSignature({
      rawBody: body,
      signatureHeader: signature,
      timestampHeader: String(nowSec),
      secret: SECRET,
      now: fixedNow(nowSec),
    });
    expect(result.ok).toBe(true);
  });
});
