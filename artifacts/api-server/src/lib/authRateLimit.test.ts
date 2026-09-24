/**
 * Launch security audit (2026-09-24): the limiters keyed on the LEFTMOST
 * X-Forwarded-For value, which the caller writes, so one random header per
 * request bypassed the admin, receptionist and public-form limits. The
 * derivation now trusts only the entries appended by our own proxies.
 */
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import type { Request } from "express";
import { clientIpFromForwardedChain, trustedProxyHopsForLimiters, verifiedVisitorIp } from "./authRateLimit.js";
import { publicFormLimit, CONTACT_IP_LIMIT, PUBLIC_FORM_SHARED_BUCKET_LIMIT } from "./contactProtection.js";

describe("trustedProxyHopsForLimiters", () => {
  it("defaults to four hops in production (client + three platform-written entries, measured) and none elsewhere", () => {
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "production" })).toBe(4);
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "development" })).toBe(0);
    expect(trustedProxyHopsForLimiters({})).toBe(0);
  });
  it("honours an explicit TRUSTED_PROXY_HOPS and rejects junk", () => {
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "production", TRUSTED_PROXY_HOPS: "3" })).toBe(3);
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "production", TRUSTED_PROXY_HOPS: "1" })).toBe(1);
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "production", TRUSTED_PROXY_HOPS: "-1" })).toBe(0);
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "production", TRUSTED_PROXY_HOPS: "abc" })).toBe(0);
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "production", TRUSTED_PROXY_HOPS: "11" })).toBe(0);
  });
});

describe("clientIpFromForwardedChain", () => {
  const edge = "10.0.0.9"; // what the socket sees behind Replit's edge

  it("ignores a caller-supplied header entirely when no proxy is trusted", () => {
    expect(clientIpFromForwardedChain("6.6.6.6", "203.0.113.5", 0)).toBe("203.0.113.5");
  });

  it("uses the entry the one trusted edge appended, not the forged prefix", () => {
    // The caller sent "X-Forwarded-For: 6.6.6.6"; the edge appended the real address.
    expect(clientIpFromForwardedChain("6.6.6.6, 198.51.100.7", edge, 1)).toBe("198.51.100.7");
    // A fresh forged value every request still resolves to the same real address.
    expect(clientIpFromForwardedChain("7.7.7.7, 198.51.100.7", edge, 1)).toBe("198.51.100.7");
  });

  it("falls back to the socket when the chain is shorter than the trusted topology", () => {
    expect(clientIpFromForwardedChain("198.51.100.7", edge, 2)).toBe(edge);
    expect(clientIpFromForwardedChain(undefined, edge, 1)).toBe(edge);
    expect(clientIpFromForwardedChain("", edge, 1)).toBe(edge);
  });

  it("accepts repeated headers and trims whitespace", () => {
    expect(clientIpFromForwardedChain(["6.6.6.6", " 198.51.100.7 "], edge, 1)).toBe("198.51.100.7");
  });

  it("through the marketing proxy (two hops) resolves the visitor, and a forged value never wins", () => {
    // visitor -> Replit edge (marketing) -> marketing-server -> Replit edge (api)
    const chain = "6.6.6.6, 198.51.100.7, 192.0.2.30";
    expect(clientIpFromForwardedChain(chain, edge, 2)).toBe("198.51.100.7");
    expect(clientIpFromForwardedChain(chain, edge, 1)).toBe("192.0.2.30");
    expect(clientIpFromForwardedChain(chain, edge, 3)).toBe("6.6.6.6"); // only if the operator over-trusts
  });
});

describe("verifiedVisitorIp (signed identity from the marketing proxy)", () => {
  const secret = "test-only-secret";
  const sign = (v: string) => createHmac("sha256", secret).update(v).digest("hex");
  const req = (h: Record<string, string>) => ({ headers: h, socket: { remoteAddress: "10.0.0.9" } }) as unknown as Request;

  it("returns the visitor when the signature verifies", () => {
    expect(verifiedVisitorIp(req({ "x-sitemint-visitor": "198.51.100.7", "x-sitemint-visitor-sig": sign("198.51.100.7") }), secret)).toBe("198.51.100.7");
  });
  it("rejects a forged or tampered header", () => {
    expect(verifiedVisitorIp(req({ "x-sitemint-visitor": "6.6.6.6", "x-sitemint-visitor-sig": sign("198.51.100.7") }), secret)).toBeNull();
    expect(verifiedVisitorIp(req({ "x-sitemint-visitor": "6.6.6.6", "x-sitemint-visitor-sig": "deadbeef" }), secret)).toBeNull();
    expect(verifiedVisitorIp(req({ "x-sitemint-visitor": "6.6.6.6" }), secret)).toBeNull();
  });
  it("ignores the header entirely when this side has no secret", () => {
    expect(verifiedVisitorIp(req({ "x-sitemint-visitor": "198.51.100.7", "x-sitemint-visitor-sig": sign("198.51.100.7") }), undefined)).toBeNull();
  });
});

describe("publicFormLimit (interim shared-bucket ceiling)", () => {
  it("keeps the strict per-visitor ceiling for verified visitors", () => {
    expect(publicFormLimit("v:198.51.100.7", {})).toBe(CONTACT_IP_LIMIT);
  });
  it("raises the ceiling for the shared proxy bucket only while no secret is configured", () => {
    expect(publicFormLimit("10.0.0.9", {})).toBe(PUBLIC_FORM_SHARED_BUCKET_LIMIT);
    expect(publicFormLimit("10.0.0.9", { PROXY_VISITOR_SECRET: "x" })).toBe(CONTACT_IP_LIMIT);
  });
});
