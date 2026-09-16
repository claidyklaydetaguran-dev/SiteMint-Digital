/**
 * The checks in front of the two security-token re-issue endpoints, and the
 * refusal both CSRF gates now answer with.
 *
 * Pure: no database, no app, no process.env — the environment is an argument,
 * so these run everywhere.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Request } from "express";

import {
  CSRF_TOKEN_INVALID_CODE,
  CSRF_TOKEN_INVALID_MESSAGE,
  REISSUE_REQUEST_HEADER,
  reissueRefusal,
} from "./csrfRecovery.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const req = (headers: Record<string, string>) => ({ headers } as unknown as Request);

const PRODUCTION = { NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "https://crm.example.test" };
const DEVELOPMENT = { NODE_ENV: "development", CORS_ALLOWED_ORIGINS: "https://crm.example.test" };

/** Every request that is allowed through carries this. */
const asked = (extra: Record<string, string>) => req({ [REISSUE_REQUEST_HEADER]: "1", ...extra });

describe("the refusal both CSRF gates answer with", () => {
  it("is machine-readable and does not tell anybody to refresh the page", () => {
    expect(CSRF_TOKEN_INVALID_CODE).toBe("csrf_token_invalid");
    // The token lives in storage a refresh does not touch, so the old advice
    // sent people round a loop that could never end.
    expect(CSRF_TOKEN_INVALID_MESSAGE).not.toMatch(/refresh/i);
    expect(CSRF_TOKEN_INVALID_MESSAGE).toMatch(/security token/i);
  });

  it("is what the staff gate and the portal gate actually send", () => {
    for (const file of ["staffAuth.ts", "portalAuth.ts"]) {
      const src = readFileSync(join(HERE, file), "utf8");
      expect(src, `${file} still tells people to refresh`).not.toMatch(/Refresh the page/);
      expect(src, `${file} does not use the shared refusal`).toMatch(/refuseInvalidCsrfToken\(res\)/);
    }
  });
});

describe("who may ask for a fresh security token", () => {
  it("refuses a request without the custom header — no HTML form can send one", () => {
    expect(reissueRefusal(req({ origin: "https://crm.example.test", host: "crm.example.test" }), PRODUCTION))
      .toBe("missing_request_header");
    // ...and the header has to say what we ask for, not merely exist.
    expect(reissueRefusal(req({ [REISSUE_REQUEST_HEADER]: "yes", host: "crm.example.test" }), PRODUCTION))
      .toBe("missing_request_header");
  });

  it("accepts an origin the credentialed CORS allowlist approves", () => {
    expect(reissueRefusal(asked({ origin: "https://crm.example.test", host: "api.example.test" }), PRODUCTION))
      .toBeUndefined();
  });

  it("accepts this request's own origin, which a same-origin deployment need not list", () => {
    // The CRM served from the API's own domain sends Origin on POST and may not
    // appear in CORS_ALLOWED_ORIGINS, because same-origin requests never needed
    // CORS approval. Accepting it is safe because the session cookie is bound to
    // this host: a page that merely claims the host does not carry the session.
    expect(reissueRefusal(asked({ origin: "https://app.example.test", host: "app.example.test" }), PRODUCTION))
      .toBeUndefined();
    expect(reissueRefusal(asked({ origin: "https://app.example.test:8443", host: "app.example.test:8443" }), PRODUCTION))
      .toBeUndefined();
  });

  it("refuses another site, including a lookalike host and the opaque origin", () => {
    for (const origin of [
      "https://attacker.test",
      "https://crm.example.test.attacker.test",
      "https://evil-crm.example.test",
      "null",
      "*",
    ]) {
      expect(reissueRefusal(asked({ origin, host: "crm.example.test" }), PRODUCTION), origin)
        .toBe("origin_not_allowed");
    }
  });

  it("treats a same-host origin as same-host whatever its scheme, and says why that is safe", () => {
    // `http://crm.example.test` is a DIFFERENT origin from the https one, so a
    // page there must pass a CORS preflight before the browser sends this
    // request at all — and the allowlist does not contain it. The Origin check
    // is the second lock, not the first.
    expect(reissueRefusal(asked({ origin: "http://crm.example.test", host: "crm.example.test" }), PRODUCTION))
      .toBeUndefined();
  });

  it("allows loopback only outside production", () => {
    const local = asked({ origin: "http://localhost:22065", host: "localhost:8080" });
    expect(reissueRefusal(local, DEVELOPMENT)).toBeUndefined();
    expect(reissueRefusal(local, PRODUCTION)).toBe("origin_not_allowed");
  });

  it("falls back to Sec-Fetch-Site when a caller sends no Origin", () => {
    expect(reissueRefusal(asked({ host: "crm.example.test", "sec-fetch-site": "cross-site" }), PRODUCTION))
      .toBe("cross_site_fetch");
    for (const site of ["same-origin", "same-site", "none"]) {
      expect(reissueRefusal(asked({ host: "crm.example.test", "sec-fetch-site": site }), PRODUCTION), site)
        .toBeUndefined();
    }
    // Neither header: not a browser. Such a caller already holds the session
    // cookie, so this endpoint can give it nothing it does not have.
    expect(reissueRefusal(asked({ host: "crm.example.test" }), PRODUCTION)).toBeUndefined();
  });

  it("approves nothing on an unusable CORS configuration, except this host", () => {
    const broken = { NODE_ENV: "development", CORS_ALLOWED_ORIGINS: "not-an-origin" };
    expect(reissueRefusal(asked({ origin: "https://crm.example.test", host: "other.test" }), broken))
      .toBe("origin_not_allowed");
    expect(reissueRefusal(asked({ origin: "https://crm.example.test", host: "crm.example.test" }), broken))
      .toBeUndefined();
  });
});
