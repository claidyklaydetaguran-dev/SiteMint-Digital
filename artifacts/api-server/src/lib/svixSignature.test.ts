/**
 * Webhook signature verification.
 *
 * The signature is the ONLY thing standing between an HTTP request and a write
 * on both Resend webhook routes, so the failures worth driving here are the
 * ones that would let a forged or replayed request through, and the ones that
 * would refuse real traffic:
 *
 *   - a body changed by one byte after signing;
 *   - a valid signature for a DIFFERENT secret;
 *   - a genuine request captured and replayed later;
 *   - a rotation, where more than one signature is sent and only one matches;
 *   - our verifier disagreeing with the provider's own library, which would
 *     mean every live event is refused with the code looking correct.
 *
 * Pure: no database, no network, and the clock is a parameter.
 */
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  SVIX_TOLERANCE_SECONDS, svixSignature, svixSigningKey, verifySvixSignature,
} from "./svixSignature.js";

const SECRET = `whsec_${crypto.randomBytes(24).toString("base64")}`;
const OTHER_SECRET = `whsec_${crypto.randomBytes(24).toString("base64")}`;
const NOW = Date.UTC(2026, 8, 16, 12, 0, 0);
const seconds = (ms: number) => Math.floor(ms / 1000);

const BODY = JSON.stringify({
  type: "email.delivered",
  created_at: "2026-09-16T11:59:58.126Z",
  data: { email_id: "56761188-7520-42d8-8898-ff6fc54ce618", to: ["someone@example.test"] },
});

function headersFor(body: string | Buffer, over: {
  id?: string; timestamp?: number; secret?: string; signature?: string;
} = {}) {
  const id = over.id ?? "msg_2abc";
  const timestamp = over.timestamp ?? seconds(NOW);
  const signature = over.signature
    ?? svixSignature({ secret: over.secret ?? SECRET, id, timestamp, body })!;
  return { id, timestamp: String(timestamp), signature };
}

const verify = (body: string | Buffer, headers: ReturnType<typeof headersFor>, now = NOW) =>
  verifySvixSignature({ secret: SECRET, headers, body, now });

describe("a genuine request", () => {
  it("is accepted, and reports the id and the moment it was signed", () => {
    const result = verify(BODY, headersFor(BODY));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toBe("msg_2abc");
    expect(result.timestamp.getTime()).toBe(NOW);
  });

  it("verifies the RAW BYTES, so a body that is re-serialised no longer matches", () => {
    const headers = headersFor(BODY);
    // Exactly what parsing and re-stringifying does: same JSON, different bytes.
    const reSerialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(reSerialised).not.toBe(BODY);
    expect(verify(reSerialised, headers).ok).toBe(false);
    // And the original bytes, as a Buffer, still verify.
    expect(verify(Buffer.from(BODY, "utf8"), headers).ok).toBe(true);
  });

  it("handles a non-ASCII body identically as a string and as bytes", () => {
    const body = JSON.stringify({ type: "email.delivered", data: { subject: "Réunion — 予約 ✅" } });
    const headers = headersFor(Buffer.from(body, "utf8"));
    expect(verify(body, headers).ok).toBe(true);
    expect(verify(Buffer.from(body, "utf8"), headers).ok).toBe(true);
  });

  it("accepts a header that arrived repeated, reading the first value", () => {
    const h = headersFor(BODY);
    const result = verifySvixSignature({
      secret: SECRET, body: BODY, now: NOW,
      headers: { id: [h.id, "msg_other"], timestamp: [h.timestamp], signature: [h.signature] },
    });
    expect(result.ok).toBe(true);
  });
});

describe("a request that must be refused", () => {
  it("refuses a body changed after signing", () => {
    const headers = headersFor(BODY);
    const tampered = BODY.replace("someone@example.test", "attacker@example.test");
    const result = verify(tampered, headers);
    expect(result).toMatchObject({ ok: false, failure: "mismatch" });
  });

  it("refuses a signature made with a different secret", () => {
    const result = verify(BODY, headersFor(BODY, { secret: OTHER_SECRET }));
    expect(result).toMatchObject({ ok: false, failure: "mismatch" });
  });

  it("refuses a genuine request replayed after the tolerance", () => {
    const signedAt = seconds(NOW) - SVIX_TOLERANCE_SECONDS - 1;
    const result = verify(BODY, headersFor(BODY, { timestamp: signedAt }));
    expect(result).toMatchObject({ ok: false, failure: "stale" });

    // One second inside the window is still accepted: a real provider retry
    // arrives minutes late and must not be refused.
    const insideWindow = seconds(NOW) - SVIX_TOLERANCE_SECONDS + 1;
    expect(verify(BODY, headersFor(BODY, { timestamp: insideWindow })).ok).toBe(true);
  });

  it("refuses a timestamp far in the future", () => {
    const result = verify(BODY, headersFor(BODY, { timestamp: seconds(NOW) + SVIX_TOLERANCE_SECONDS + 5 }));
    expect(result).toMatchObject({ ok: false, failure: "future" });
  });

  it("refuses a timestamp that is not a whole number of seconds", () => {
    const h = headersFor(BODY);
    for (const timestamp of ["1789567890abc", "", "not-a-time", "17895.67", "+1789567890", "-5"]) {
      const result = verifySvixSignature({ secret: SECRET, body: BODY, now: NOW, headers: { ...h, timestamp } });
      expect(result.ok, timestamp).toBe(false);
      if (!result.ok) expect(["bad_timestamp", "missing_headers"]).toContain(result.failure);
    }
  });

  it("refuses when a header is missing", () => {
    const h = headersFor(BODY);
    for (const drop of ["id", "timestamp", "signature"] as const) {
      const headers = { ...h, [drop]: undefined };
      const result = verifySvixSignature({ secret: SECRET, body: BODY, now: NOW, headers });
      expect(result).toMatchObject({ ok: false, failure: "missing_headers" });
    }
  });

  it("refuses when the signature carries no v1 entry", () => {
    const result = verifySvixSignature({
      secret: SECRET, body: BODY, now: NOW,
      headers: { ...headersFor(BODY), signature: "v2,c29tZXRoaW5nLWVsc2U=" },
    });
    expect(result).toMatchObject({ ok: false, failure: "no_signature" });
  });

  it("says the secret is missing or unusable rather than calling the request a forgery", () => {
    const headers = headersFor(BODY);
    expect(verifySvixSignature({ secret: null, body: BODY, headers, now: NOW }))
      .toMatchObject({ ok: false, failure: "no_secret" });
    expect(verifySvixSignature({ secret: "whsec_", body: BODY, headers, now: NOW }))
      .toMatchObject({ ok: false, failure: "unusable_secret" });
  });
});

describe("secret rotation", () => {
  it("accepts when ANY of several signatures matches", () => {
    const id = "msg_rotating";
    const timestamp = seconds(NOW);
    const old = svixSignature({ secret: OTHER_SECRET, id, timestamp, body: BODY })!;
    const current = svixSignature({ secret: SECRET, id, timestamp, body: BODY })!;

    // Both orders: a verifier that reads only the first entry passes one of
    // these and fails the other, which is exactly the rotation-day outage.
    for (const signature of [`${old} ${current}`, `${current} ${old}`]) {
      const result = verifySvixSignature({
        secret: SECRET, body: BODY, now: NOW,
        headers: { id, timestamp: String(timestamp), signature },
      });
      expect(result.ok, signature).toBe(true);
    }
  });

  it("still refuses when none of them is ours", () => {
    const id = "msg_rotating";
    const timestamp = seconds(NOW);
    const a = svixSignature({ secret: OTHER_SECRET, id, timestamp, body: BODY })!;
    const b = svixSignature({ secret: `whsec_${crypto.randomBytes(24).toString("base64")}`, id, timestamp, body: BODY })!;
    const result = verifySvixSignature({
      secret: SECRET, body: BODY, now: NOW,
      headers: { id, timestamp: String(timestamp), signature: `${a} ${b}` },
    });
    expect(result).toMatchObject({ ok: false, failure: "mismatch" });
  });
});

describe("compatibility with the provider's own library", () => {
  it("accepts a signature produced by svix, byte for byte", async () => {
    const { Webhook } = await import("svix");
    const wh = new Webhook(SECRET);
    const id = "msg_from_svix";
    const when = new Date(NOW);
    const signature = wh.sign(id, when, BODY);

    const result = verifySvixSignature({
      secret: SECRET, body: Buffer.from(BODY, "utf8"), now: NOW,
      headers: { id, timestamp: String(seconds(NOW)), signature },
    });
    expect(result.ok).toBe(true);
    // And the reverse: what we produce is what svix would verify.
    expect(svixSignature({ secret: SECRET, id, timestamp: seconds(NOW), body: BODY })).toBe(signature);
  });

  it("reads the key the way svix does — the whsec_ prefix is a label, not key material", () => {
    const raw = crypto.randomBytes(24).toString("base64");
    expect(svixSigningKey(`whsec_${raw}`)).toEqual(svixSigningKey(raw));
    expect(svixSigningKey(`whsec_${raw}`)).toEqual(Buffer.from(raw, "base64"));
  });
});
