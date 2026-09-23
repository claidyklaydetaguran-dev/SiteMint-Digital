/**
 * Launch security audit (2026-09-24): the limiters keyed on the LEFTMOST
 * X-Forwarded-For value, which the caller writes, so one random header per
 * request bypassed the admin, receptionist and public-form limits. The
 * derivation now trusts only the entries appended by our own proxies.
 */
import { describe, expect, it } from "vitest";
import { clientIpFromForwardedChain, trustedProxyHopsForLimiters } from "./authRateLimit.js";

describe("trustedProxyHopsForLimiters", () => {
  it("defaults to one hop in production and none elsewhere", () => {
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "production" })).toBe(1);
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "development" })).toBe(0);
    expect(trustedProxyHopsForLimiters({})).toBe(0);
  });
  it("honours an explicit TRUSTED_PROXY_HOPS and rejects junk", () => {
    expect(trustedProxyHopsForLimiters({ NODE_ENV: "production", TRUSTED_PROXY_HOPS: "2" })).toBe(2);
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
